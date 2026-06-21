import { useEffect, useRef, useState } from 'react';

import { findCuratedModel } from '../models/catalog/registry';
import type { InstalledModel, InstalledModelStatus } from '../models/catalog/types';
import { createInstalledModel, transitionInstalledModel } from '../models/installed-model';
import { installedModels } from '../storage/database';
import type { RuntimeCacheStatus, RuntimeEvent } from '../runtimes/core/types';
import { RuntimeError } from '../runtimes/core/errors';
import { TransformersTextWorkerAdapter } from '../runtimes/transformers/text-worker-adapter';

type LabStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'cancelling' | 'error';

interface Metrics {
  durationMs: number;
  firstTokenMs: number | null;
  tokenCount: number;
}

const initialPrompt = 'Once upon a time, a tiny ember learned how to';
const curatedTextModel = findCuratedModel('smollm2-135m-q4');

if (!curatedTextModel) {
  throw new Error('The curated Text Model Lab model is missing.');
}

const textModel = curatedTextModel;

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) {
    return '—';
  }

  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)} s`
    : `${milliseconds.toFixed(0)} ms`;
}

function displayRuntimeError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function TextModelLab() {
  const adapterRef = useRef<TransformersTextWorkerAdapter | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<LabStatus>('idle');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [output, setOutput] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [loadTimeMs, setLoadTimeMs] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cacheStatus, setCacheStatus] = useState<RuntimeCacheStatus>({
    cached: false,
    files: [],
  });
  const [cacheInspected, setCacheInspected] = useState(false);
  const [cachedFilesOnly, setCachedFilesOnly] = useState(false);
  const [installRecord, setInstallRecord] = useState<InstalledModel | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    void installedModels
      .get(textModel.id)
      .then((record) => {
        if (mountedRef.current) {
          setInstallRecord(record);
        }
      })
      .catch(() => {
        if (mountedRef.current) {
          setStorageMessage('Installed-model metadata is unavailable in this browser.');
        }
      });
    return () => {
      mountedRef.current = false;
      adapterRef.current?.terminate();
    };
  }, []);

  function ensureAdapter() {
    adapterRef.current ??= new TransformersTextWorkerAdapter();
    return adapterRef.current;
  }

  async function inspectCache() {
    try {
      await readCacheStatus();
    } catch (inspectionError) {
      if (mountedRef.current) {
        setError(displayRuntimeError(inspectionError, 'Model cache inspection failed.'));
      }
    }
  }

  async function readCacheStatus() {
    const nextStatus = await ensureAdapter().inspectCache(textModel);
    if (mountedRef.current) {
      setCacheStatus(nextStatus);
      setCacheInspected(true);
    }
    return nextStatus;
  }

  async function persistInstallRecord(record: InstalledModel) {
    if (mountedRef.current) {
      setInstallRecord(record);
    }
    try {
      await installedModels.put(record);
      if (mountedRef.current) {
        setStorageMessage(null);
      }
    } catch {
      if (mountedRef.current) {
        setStorageMessage('The model works, but its installation metadata could not be saved.');
      }
    }
  }

  function beginInstallRecord(existing: InstalledModel | null, status: InstalledModelStatus) {
    if (!existing || existing.sourceRevision !== textModel.source.revision) {
      return createInstalledModel(textModel, status);
    }
    try {
      return transitionInstalledModel(existing, status);
    } catch {
      return createInstalledModel(textModel, status);
    }
  }

  async function loadModel() {
    const adapter = ensureAdapter();
    const startedAt = performance.now();
    let record = beginInstallRecord(
      await installedModels.get(textModel.id).catch(() => installRecord),
      cachedFilesOnly ? 'verifying' : 'downloading',
    );
    await persistInstallRecord(record);
    setError(null);
    setProgress(0);
    setStatus('loading');

    try {
      if (!cachedFilesOnly) {
        for await (const event of adapter.download(textModel)) {
          if (event.type === 'progress' && mountedRef.current) {
            setProgress(event.progress * 100);
          }
        }
        record = transitionInstalledModel(record, 'verifying');
        await persistInstallRecord(record);
      }

      await adapter.load(textModel, { cachedFilesOnly });
      if (!mountedRef.current) {
        return;
      }
      setLoadTimeMs(performance.now() - startedAt);
      setProgress(100);
      setStatus('ready');
      try {
        const verifiedCache = await readCacheStatus();
        const cachedFiles = verifiedCache.files.filter((file) => file.cached).length;
        record = transitionInstalledModel(record, verifiedCache.cached ? 'installed' : 'failed', {
          cachedFiles,
          lastError: verifiedCache.cached
            ? undefined
            : 'Cache verification found missing model files.',
          totalFiles: verifiedCache.files.length,
        });
        await persistInstallRecord(record);
      } catch (verificationError) {
        record = transitionInstalledModel(record, 'failed', {
          lastError: displayRuntimeError(verificationError, 'Model cache verification failed.'),
        });
        await persistInstallRecord(record);
        if (mountedRef.current) {
          setStorageMessage(
            'The model loaded, but its offline installation could not be verified.',
          );
        }
      }
    } catch (loadError) {
      try {
        record = transitionInstalledModel(record, 'failed', {
          lastError: displayRuntimeError(loadError, 'Model loading failed.'),
        });
        await persistInstallRecord(record);
      } catch {
        // The visible runtime error remains the authoritative failure signal.
      }
      if (mountedRef.current) {
        setError(displayRuntimeError(loadError, 'Model loading failed.'));
        setStatus('error');
      }
    }
  }

  async function generate() {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      setError('Enter a prompt before generating.');
      return;
    }

    const requestId = crypto.randomUUID();
    activeRequestRef.current = requestId;
    setError(null);
    setMetrics(null);
    setOutput('');
    setStatus('generating');

    try {
      for await (const event of ensureAdapter().run(
        { kind: 'text', text: normalizedPrompt },
        { maxNewTokens: 64, requestId },
      )) {
        if (!mountedRef.current || requestId !== activeRequestRef.current) {
          continue;
        }
        handleRunEvent(event);
      }
      if (mountedRef.current && requestId === activeRequestRef.current) {
        activeRequestRef.current = null;
        setStatus('ready');
      }
    } catch (generationError) {
      if (!mountedRef.current || requestId !== activeRequestRef.current) {
        return;
      }
      activeRequestRef.current = null;
      if (generationError instanceof RuntimeError && generationError.code === 'ABORTED') {
        setStatus('ready');
      } else {
        setError(displayRuntimeError(generationError, 'Text generation failed.'));
        setStatus('error');
      }
    }
  }

  function handleRunEvent(event: RuntimeEvent) {
    if (event.type === 'token') {
      setOutput((current) => current + event.text);
    }
    if (event.type === 'complete') {
      setMetrics({
        durationMs: event.durationMs,
        firstTokenMs: event.firstTokenMs ?? null,
        tokenCount: event.tokenCount ?? 0,
      });
    }
  }

  async function cancel() {
    setStatus('cancelling');
    await ensureAdapter().abort(activeRequestRef.current ?? undefined);
  }

  async function unload() {
    try {
      await ensureAdapter().unload();
      if (mountedRef.current) {
        activeRequestRef.current = null;
        setLoadTimeMs(null);
        setMetrics(null);
        setOutput('');
        setProgress(null);
        setStatus('idle');
      }
    } catch (unloadError) {
      if (mountedRef.current) {
        setError(displayRuntimeError(unloadError, 'Model unloading failed.'));
        setStatus('error');
      }
    }
  }

  const busy = status === 'loading' || status === 'generating' || status === 'cancelling';
  const modelReady = status === 'ready' || status === 'generating' || status === 'cancelling';

  return (
    <section className="section model-lab-section" id="model-lab">
      <div className="model-lab-heading">
        <div>
          <p className="kicker">TEXT GENERATION SPIKE</p>
          <h2>A real model, inside this tab.</h2>
        </div>
        <p>
          This experiment downloads a quantized 135M-parameter model from Hugging Face, loads it
          through WebGPU in a worker, and measures generation. The first download is substantial;
          nothing starts until you ask.
        </p>
      </div>

      <div className="model-lab-grid">
        <div className="model-console">
          <div className="model-console__bar">
            <span>{textModel.source.modelId}</span>
            <span className={`model-state model-state--${status}`}>{status}</span>
          </div>

          <label htmlFor="model-prompt">Prompt</label>
          <textarea
            disabled={busy}
            id="model-prompt"
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            value={prompt}
          />

          <div className="model-actions">
            {!modelReady && status !== 'loading' ? (
              <button
                className="button button--primary"
                onClick={() => void loadModel()}
                type="button"
              >
                Download and load model
              </button>
            ) : null}
            {status === 'loading' ? (
              <button className="button button--primary" disabled type="button">
                Loading {progress === null ? '' : `${progress.toFixed(0)}%`}
              </button>
            ) : null}
            {status === 'ready' ? (
              <button
                className="button button--primary"
                onClick={() => void generate()}
                type="button"
              >
                Generate 64 tokens
              </button>
            ) : null}
            {status === 'generating' || status === 'cancelling' ? (
              <button
                className="button button--danger"
                disabled={status === 'cancelling'}
                onClick={() => void cancel()}
                type="button"
              >
                {status === 'cancelling' ? 'Stopping…' : 'Stop generation'}
              </button>
            ) : null}
            {modelReady && status === 'ready' ? (
              <button className="button button--quiet" onClick={() => void unload()} type="button">
                Unload model
              </button>
            ) : null}
          </div>

          <label className="local-only-control">
            <input
              checked={cachedFilesOnly}
              disabled={busy || modelReady}
              onChange={(event) => setCachedFilesOnly(event.target.checked)}
              type="checkbox"
            />
            <span>
              Cached files only
              <small>Blocks runtime requests for missing Hugging Face model files.</small>
            </span>
          </label>

          <button
            className="cache-inspect-button"
            disabled={busy}
            onClick={() => void inspectCache()}
            type="button"
          >
            Inspect cached model files
          </button>

          {status === 'loading' ? (
            <div
              aria-label={`Model loading progress: ${progress ?? 0}%`}
              className="model-progress"
              role="progressbar"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progress ?? 0}
            >
              <span style={{ width: `${progress ?? 0}%` }} />
            </div>
          ) : null}

          {error ? <p className="model-error">{error}</p> : null}

          <div aria-live="polite" className="model-output">
            {output || 'Generated text will stream here.'}
          </div>
        </div>

        <aside className="metrics-panel">
          <p className="panel-label">LOCAL MEASUREMENTS</p>
          <dl>
            <div>
              <dt>Cold model load</dt>
              <dd>{formatDuration(loadTimeMs)}</dd>
            </div>
            <div>
              <dt>First token</dt>
              <dd>{formatDuration(metrics?.firstTokenMs ?? null)}</dd>
            </div>
            <div>
              <dt>Total generation</dt>
              <dd>{formatDuration(metrics?.durationMs ?? null)}</dd>
            </div>
            <div>
              <dt>Tokens observed</dt>
              <dd>{metrics?.tokenCount ?? '—'}</dd>
            </div>
            <div>
              <dt>Execution</dt>
              <dd>WebGPU worker</dd>
            </div>
            <div>
              <dt>Offline cache</dt>
              <dd>
                {!cacheInspected
                  ? 'Not inspected'
                  : cacheStatus.cached
                    ? `${cacheStatus.files.length}/${cacheStatus.files.length} files`
                    : `${cacheStatus.files.filter((file) => file.cached).length}/${cacheStatus.files.length} files`}
              </dd>
            </div>
            <div>
              <dt>Install record</dt>
              <dd>{installRecord?.status ?? 'Not recorded'}</dd>
            </div>
          </dl>

          {storageMessage ? <p className="storage-message">{storageMessage}</p> : null}

          {cacheStatus.files.length > 0 ? (
            <ul className="cache-file-list">
              {cacheStatus.files.map((file) => (
                <li key={file.file}>
                  <span>{file.cached ? 'Cached' : 'Missing'}</span>
                  <code>{file.file}</code>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
