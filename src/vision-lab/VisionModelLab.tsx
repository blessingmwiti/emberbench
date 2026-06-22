import { useEffect, useRef, useState } from 'react';

import { formatBytes } from '../diagnostics/format';
import { findCuratedModel } from '../models/catalog/registry';
import type { InstalledModel, InstalledModelStatus } from '../models/catalog/types';
import { createInstalledModel, transitionInstalledModel } from '../models/installed-model';
import { RuntimeError } from '../runtimes/core/errors';
import type { RuntimeCacheStatus, RuntimeEvent } from '../runtimes/core/types';
import { TransformersVisionWorkerAdapter } from '../runtimes/transformers/vision-worker-adapter';
import { INSTALLED_MODELS_CHANGED_EVENT, installedModels } from '../storage/database';
import { runDownloadPreflight } from '../storage/download-preflight';

type VisionStatus = 'idle' | 'loading' | 'ready' | 'running' | 'cancelling' | 'error';

const curatedVisionModel = findCuratedModel('vit-gpt2-captioning-q8');
if (!curatedVisionModel) {
  throw new Error('The curated Vision Model Lab model is missing.');
}
const visionModel = curatedVisionModel;

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return '—';
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)} s`
    : `${milliseconds.toFixed(0)} ms`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function VisionModelLab() {
  const adapterRef = useRef<TransformersVisionWorkerAdapter | null>(null);
  const requestRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<VisionStatus>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [loadTimeMs, setLoadTimeMs] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cachedFilesOnly, setCachedFilesOnly] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<RuntimeCacheStatus>({
    cached: false,
    files: [],
  });
  const [cacheInspected, setCacheInspected] = useState(false);
  const [installRecord, setInstallRecord] = useState<InstalledModel | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [downloadWarning, setDownloadWarning] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const refreshInstallRecord = () => {
      void installedModels
        .get(visionModel.id)
        .then((record) => {
          if (mountedRef.current) setInstallRecord(record);
        })
        .catch(() => {
          if (mountedRef.current) {
            setStorageMessage('Vision installation metadata is unavailable in this browser.');
          }
        });
    };

    refreshInstallRecord();
    window.addEventListener(INSTALLED_MODELS_CHANGED_EVENT, refreshInstallRecord);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(INSTALLED_MODELS_CHANGED_EVENT, refreshInstallRecord);
      adapterRef.current?.terminate();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function ensureAdapter() {
    adapterRef.current ??= new TransformersVisionWorkerAdapter();
    return adapterRef.current;
  }

  function setPreview(blob: Blob) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextUrl = URL.createObjectURL(blob);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
    setImage(blob);
    setCaption('');
    setDurationMs(null);
  }

  async function persistRecord(record: InstalledModel) {
    if (mountedRef.current) setInstallRecord(record);
    try {
      await installedModels.put(record);
      if (mountedRef.current) setStorageMessage(null);
    } catch {
      if (mountedRef.current) {
        setStorageMessage('The vision model works, but its install record could not be saved.');
      }
    }
  }

  function beginRecord(existing: InstalledModel | null, nextStatus: InstalledModelStatus) {
    if (!existing || existing.sourceRevision !== visionModel.source.revision) {
      return createInstalledModel(visionModel, nextStatus);
    }
    try {
      return transitionInstalledModel(existing, nextStatus);
    } catch {
      return createInstalledModel(visionModel, nextStatus);
    }
  }

  async function readCacheStatus() {
    const next = await ensureAdapter().inspectCache(visionModel);
    if (mountedRef.current) {
      setCacheStatus(next);
      setCacheInspected(true);
    }
    return next;
  }

  async function inspectCache() {
    try {
      await readCacheStatus();
    } catch (inspectionError) {
      if (mountedRef.current) {
        setError(errorMessage(inspectionError, 'Vision cache inspection failed.'));
      }
    }
  }

  async function loadModel(preflightApproved = false) {
    if (!cachedFilesOnly && !preflightApproved) {
      const preflight = await runDownloadPreflight(visionModel);
      const detail = `${preflight.message} Estimated need: ${formatBytes(preflight.requiredBytes)}${
        preflight.availableBytes === null
          ? ''
          : `; available: ${formatBytes(preflight.availableBytes)}`
      }.`;
      if (preflight.status === 'blocked') {
        setError(detail);
        return;
      }
      if (preflight.status === 'warning') {
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
    let record = beginRecord(
      await installedModels.get(visionModel.id).catch(() => installRecord),
      cachedFilesOnly ? 'verifying' : 'downloading',
    );
    await persistRecord(record);
    setError(null);
    setProgress(0);
    setStatus('loading');

    try {
      if (!cachedFilesOnly) {
        for await (const event of adapter.download(visionModel)) {
          if (event.type === 'progress' && mountedRef.current) {
            setProgress(event.progress * 100);
          }
        }
        record = transitionInstalledModel(record, 'verifying');
        await persistRecord(record);
      }

      await adapter.load(visionModel, { cachedFilesOnly });
      if (!mountedRef.current) return;
      setLoadTimeMs(performance.now() - startedAt);
      setProgress(100);
      setStatus('ready');

      try {
        const verified = await readCacheStatus();
        const cachedFiles = verified.files.filter((file) => file.cached).length;
        record = transitionInstalledModel(record, verified.cached ? 'installed' : 'failed', {
          cachedFiles,
          lastError: verified.cached ? undefined : 'Vision cache verification found missing files.',
          totalFiles: verified.files.length,
        });
        await persistRecord(record);
      } catch (verificationError) {
        record = transitionInstalledModel(record, 'failed', {
          lastError: errorMessage(verificationError, 'Vision cache verification failed.'),
        });
        await persistRecord(record);
      }
    } catch (loadError) {
      try {
        record = transitionInstalledModel(record, 'failed', {
          lastError: errorMessage(loadError, 'Vision model loading failed.'),
        });
        await persistRecord(record);
      } catch {
        // The visible runtime error remains the authoritative failure signal.
      }
      if (mountedRef.current) {
        setError(errorMessage(loadError, 'Vision model loading failed.'));
        setStatus('error');
      }
    }
  }

  async function useSample() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 420;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('This browser could not create the sample image.');
      return;
    }

    context.fillStyle = '#9fd7f2';
    context.fillRect(0, 0, 640, 420);
    context.fillStyle = '#7dac5b';
    context.fillRect(0, 290, 640, 130);
    context.fillStyle = '#ffd75e';
    context.beginPath();
    context.arc(520, 86, 46, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f6e5c5';
    context.fillRect(210, 174, 230, 160);
    context.fillStyle = '#a84d35';
    context.beginPath();
    context.moveTo(185, 185);
    context.lineTo(325, 82);
    context.lineTo(465, 185);
    context.closePath();
    context.fill();
    context.fillStyle = '#764a36';
    context.fillRect(300, 248, 54, 86);
    context.fillStyle = '#80c5df';
    context.fillRect(238, 218, 46, 42);
    context.fillRect(370, 218, 46, 42);
    context.fillStyle = '#db5e46';
    context.fillRect(66, 286, 118, 39);
    context.fillRect(78, 266, 72, 31);
    context.fillStyle = '#30363d';
    context.beginPath();
    context.arc(92, 326, 22, 0, Math.PI * 2);
    context.arc(158, 326, 22, 0, Math.PI * 2);
    context.fill();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      setError('This browser could not encode the sample image.');
      return;
    }
    setError(null);
    setPreview(blob);
  }

  function selectImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    setError(null);
    setPreview(file);
  }

  async function runCaption() {
    if (!image) {
      setError('Choose an image or use the built-in sample first.');
      return;
    }

    const requestId = crypto.randomUUID();
    requestRef.current = requestId;
    setError(null);
    setCaption('');
    setDurationMs(null);
    setStatus('running');

    try {
      const data = await image.arrayBuffer();
      for await (const event of ensureAdapter().run(
        { data, kind: 'image', mimeType: image.type || 'image/png' },
        { requestId },
      )) {
        if (!mountedRef.current || requestId !== requestRef.current) continue;
        handleRunEvent(event);
      }
      if (mountedRef.current && requestId === requestRef.current) {
        requestRef.current = null;
        setStatus('ready');
      }
    } catch (runError) {
      if (!mountedRef.current || requestId !== requestRef.current) return;
      requestRef.current = null;
      if (runError instanceof RuntimeError && runError.code === 'ABORTED') {
        setStatus('idle');
      } else {
        setError(errorMessage(runError, 'Image captioning failed.'));
        setStatus('error');
      }
    }
  }

  function handleRunEvent(event: RuntimeEvent) {
    if (event.type === 'result' && typeof event.data.caption === 'string') {
      setCaption(event.data.caption);
    }
    if (event.type === 'complete') {
      setDurationMs(event.durationMs);
    }
  }

  async function cancel() {
    setStatus('cancelling');
    await ensureAdapter().abort(requestRef.current ?? undefined);
  }

  async function unload() {
    try {
      await ensureAdapter().unload();
      if (mountedRef.current) {
        requestRef.current = null;
        setLoadTimeMs(null);
        setDurationMs(null);
        setCaption('');
        setProgress(null);
        setStatus('idle');
      }
    } catch (unloadError) {
      if (mountedRef.current) {
        setError(errorMessage(unloadError, 'Vision model unloading failed.'));
        setStatus('error');
      }
    }
  }

  const ready = status === 'ready' || status === 'running' || status === 'cancelling';
  const busy = status === 'loading' || status === 'running' || status === 'cancelling';

  return (
    <section className="section vision-lab-section" id="vision-lab">
      <div className="model-lab-heading">
        <div>
          <p className="kicker">VISION FEASIBILITY SPIKE</p>
          <h2>Let the browser look.</h2>
        </div>
        <p>
          A separate WebGPU worker preprocesses an image and generates a caption locally. The
          built-in sample is synthetic, so testing it sends no personal file anywhere.
        </p>
      </div>

      <div className="vision-lab-grid">
        <div className="vision-input">
          <div className="model-console__bar">
            <span>{visionModel.source.modelId}</span>
            <span className={`model-state model-state--${status}`}>{status}</span>
          </div>

          <div className="vision-preview">
            {previewUrl ? (
              <img alt="Selected for local model analysis" src={previewUrl} />
            ) : (
              <span>No image selected</span>
            )}
          </div>

          <div className="model-actions">
            <button
              className="button button--quiet"
              disabled={status === 'running' || status === 'cancelling'}
              onClick={() => void useSample()}
              type="button"
            >
              Use sample image
            </button>
            <label className="button button--quiet file-button">
              Choose image
              <input
                accept="image/*"
                disabled={status === 'running' || status === 'cancelling'}
                onChange={(event) => selectImage(event.target.files?.[0])}
                type="file"
              />
            </label>
            {!ready && status !== 'loading' ? (
              <button
                className="button button--primary"
                onClick={() => void loadModel()}
                type="button"
              >
                Download vision model
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
                onClick={() => void runCaption()}
                type="button"
              >
                Describe image
              </button>
            ) : null}
            {status === 'running' || status === 'cancelling' ? (
              <button
                className="button button--danger"
                disabled={status === 'cancelling'}
                onClick={() => void cancel()}
                type="button"
              >
                {status === 'cancelling' ? 'Stopping…' : 'Stop analysis'}
              </button>
            ) : null}
            {status === 'ready' ? (
              <button className="button button--quiet" onClick={() => void unload()} type="button">
                Unload vision model
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
              disabled={busy || ready}
              onChange={(event) => setCachedFilesOnly(event.target.checked)}
              type="checkbox"
            />
            <span>
              Cached files only
              <small>Blocks missing Hugging Face model requests.</small>
            </span>
          </label>

          <button
            className="cache-inspect-button"
            disabled={busy}
            onClick={() => void inspectCache()}
            type="button"
          >
            Inspect vision cache
          </button>

          {status === 'loading' ? (
            <div
              aria-label={`Vision model loading progress: ${progress ?? 0}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progress ?? 0}
              className="model-progress"
              role="progressbar"
            >
              <span style={{ width: `${progress ?? 0}%` }} />
            </div>
          ) : null}

          {error ? <p className="model-error">{error}</p> : null}
        </div>

        <aside className="vision-result" aria-live="polite">
          <p className="panel-label">LOCAL VISION RESULT</p>
          <blockquote>{caption || 'The generated image caption will appear here.'}</blockquote>
          <dl>
            <div>
              <dt>Model load</dt>
              <dd>{formatDuration(loadTimeMs)}</dd>
            </div>
            <div>
              <dt>Caption latency</dt>
              <dd>{formatDuration(durationMs)}</dd>
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
                  : `${cacheStatus.files.filter((file) => file.cached).length}/${cacheStatus.files.length} files`}
              </dd>
            </div>
            <div>
              <dt>Install record</dt>
              <dd>{installRecord?.status ?? 'Not recorded'}</dd>
            </div>
          </dl>
          {storageMessage ? <p className="storage-message">{storageMessage}</p> : null}
        </aside>
      </div>
    </section>
  );
}
