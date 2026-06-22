import { useEffect, useRef, useState } from 'react';

import { formatBytes } from '../diagnostics/format';
import { findCuratedModel } from '../models/catalog/registry';
import type { InstalledModel } from '../models/catalog/types';
import {
  appSettings,
  INSTALLED_MODELS_CHANGED_EVENT,
  installedModels,
  SETTINGS_CHANGED_EVENT,
} from '../storage/database';
import { runDownloadPreflight } from '../storage/download-preflight';
import { installModel } from '../storage/install-model';
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

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof RuntimeError && error.code === 'ABORTED')
  );
}

export function TextModelLab() {
  const adapterRef = useRef<TransformersTextWorkerAdapter | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const downloadAbortRef = useRef<AbortController | null>(null);
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
  const [downloadWarning, setDownloadWarning] = useState<string | null>(null);
  const [confirmLargeDownloads, setConfirmLargeDownloads] = useState(true);
  const [downloadQueueMessage, setDownloadQueueMessage] = useState<string | null>(null);
  const [downloadCancellable, setDownloadCancellable] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    const refreshInstallRecord = () => {
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
    };
    const refreshSettings = () => {
      void appSettings
        .get()
        .then((settings) => {
          if (mountedRef.current) {
            setCachedFilesOnly(settings.defaultCachedFilesOnly);
            setConfirmLargeDownloads(settings.confirmLargeDownloads);
          }
        })
        .catch(() => {});
    };

    refreshInstallRecord();
    refreshSettings();
    window.addEventListener(INSTALLED_MODELS_CHANGED_EVENT, refreshInstallRecord);
    window.addEventListener(SETTINGS_CHANGED_EVENT, refreshSettings);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(INSTALLED_MODELS_CHANGED_EVENT, refreshInstallRecord);
      window.removeEventListener(SETTINGS_CHANGED_EVENT, refreshSettings);
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

  async function loadModel(preflightApproved = false) {
    if (!cachedFilesOnly && !preflightApproved) {
      const preflight = await runDownloadPreflight(textModel);
      const detail = `${preflight.message} Estimated need: ${formatBytes(preflight.requiredBytes)}${
        preflight.availableBytes === null
          ? ''
          : `; available: ${formatBytes(preflight.availableBytes)}`
      }.`;
      if (preflight.status === 'blocked') {
        setError(detail);
        return;
      }
      if (preflight.status === 'warning' && confirmLargeDownloads) {
        setDownloadWarning(detail);
        return;
      }
      if (preflight.status === 'unknown') {
        setStorageMessage(detail);
      }
    }

    setDownloadWarning(null);
    const adapter = ensureAdapter();
    const startedAt = performance.now();
    let downloadController: AbortController | null = null;
    if (!cachedFilesOnly) {
      downloadController = new AbortController();
      downloadAbortRef.current = downloadController;
      setDownloadCancellable(true);
      setError(null);
      setProgress(0);
      setStatus('loading');
    }

    setError(null);
    setProgress(0);
    setStatus('loading');

    try {
      const result = await installModel({
        adapter,
        cachedFilesOnly,
        manifest: textModel,
        onProgress: (nextProgress) => {
          if (mountedRef.current) setProgress(nextProgress * 100);
        },
        onQueueChange: (message) => {
          if (mountedRef.current) setDownloadQueueMessage(message);
        },
        onRecord: (record) => {
          if (mountedRef.current) setInstallRecord(record);
        },
        onRetry: (attempt) => {
          if (mountedRef.current) {
            setDownloadQueueMessage(`Retrying download · attempt ${attempt} of 3…`);
          }
        },
        signal: downloadController?.signal,
      });
      if (!mountedRef.current) {
        return;
      }
      setLoadTimeMs(performance.now() - startedAt);
      setProgress(100);
      setStatus('ready');
      setCacheStatus(result.cache);
      setCacheInspected(true);
    } catch (loadError) {
      if (mountedRef.current) {
        setError(
          isAbortError(loadError)
            ? 'Model download cancelled. Retry to reuse any complete cached files.'
            : displayRuntimeError(loadError, 'Model loading failed.'),
        );
        setStatus(isAbortError(loadError) ? 'idle' : 'error');
      }
    } finally {
      downloadAbortRef.current = null;
      if (mountedRef.current) {
        setDownloadQueueMessage(null);
        setDownloadCancellable(false);
      }
    }
  }

  function cancelDownload() {
    setDownloadQueueMessage('Cancelling download…');
    downloadAbortRef.current?.abort();
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
              <>
                <button className="button button--primary" disabled type="button">
                  {downloadQueueMessage ??
                    `Loading ${progress === null ? '' : `${progress.toFixed(0)}%`}`}
                </button>
                {downloadCancellable ? (
                  <button className="button button--danger" onClick={cancelDownload} type="button">
                    Cancel download
                  </button>
                ) : null}
              </>
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

          {downloadWarning ? (
            <div className="download-warning" role="alert">
              <p>{downloadWarning}</p>
              <div>
                <button
                  className="button button--primary"
                  onClick={() => void loadModel(true)}
                  type="button"
                >
                  Continue download
                </button>
                <button
                  className="button button--quiet"
                  onClick={() => setDownloadWarning(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

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
