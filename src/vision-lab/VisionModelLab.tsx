import { useEffect, useRef, useState } from 'react';

import { formatBytes } from '../diagnostics/format';
import { findCuratedModel } from '../models/catalog/registry';
import type { InstalledModel } from '../models/catalog/types';
import { RuntimeError } from '../runtimes/core/errors';
import type { RuntimeCacheStatus, RuntimeEvent } from '../runtimes/core/types';
import {
  discoverTransformersRuntimeDevice,
  resolveTransformersRuntimeDevice,
} from '../runtimes/transformers/runtime-device';
import { TransformersVisionWorkerAdapter } from '../runtimes/transformers/vision-worker-adapter';
import {
  appSettings,
  benchmarks,
  INSTALLED_MODELS_CHANGED_EVENT,
  installedModels,
  SETTINGS_CHANGED_EVENT,
} from '../storage/database';
import { runDownloadPreflight } from '../storage/download-preflight';
import { installModel } from '../storage/install-model';
import { validateVisionImageFile, VISION_IMAGE_ACCEPT_ATTRIBUTE } from './input-validation';
import { preprocessVisionImage, type VisionImagePreprocessResult } from './preprocess-image';
import { visionAnalysisProgressLabel } from './progress';
import { VisionTaskOutput } from './VisionTaskOutput';

type VisionStatus = 'idle' | 'loading' | 'ready' | 'running' | 'cancelling' | 'error';

const curatedVisionModel = findCuratedModel('vit-gpt2-captioning-q8');
if (!curatedVisionModel) {
  throw new Error('The curated Vision Model Lab model is missing.');
}
const visionModel = curatedVisionModel;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof RuntimeError && error.code === 'ABORTED')
  );
}

export function VisionModelLab() {
  const adapterRef = useRef<TransformersVisionWorkerAdapter | null>(null);
  const requestRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<VisionStatus>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [loadTimeMs, setLoadTimeMs] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<Blob | null>(null);
  const [imageMetadata, setImageMetadata] = useState<VisionImagePreprocessResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preprocessing, setPreprocessing] = useState(false);
  const [cachedFilesOnly, setCachedFilesOnly] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<RuntimeCacheStatus>({
    cached: false,
    files: [],
  });
  const [cacheInspected, setCacheInspected] = useState(false);
  const [installRecord, setInstallRecord] = useState<InstalledModel | null>(null);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [downloadWarning, setDownloadWarning] = useState<string | null>(null);
  const [confirmLargeDownloads, setConfirmLargeDownloads] = useState(true);
  const [downloadQueueMessage, setDownloadQueueMessage] = useState<string | null>(null);
  const [downloadCancellable, setDownloadCancellable] = useState(false);
  const [runtimeDevice, setRuntimeDevice] = useState(discoverTransformersRuntimeDevice);

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
    const refreshSettings = () => {
      void appSettings
        .get()
        .then((settings) => {
          if (mountedRef.current) {
            setCachedFilesOnly(settings.defaultCachedFilesOnly);
            setConfirmLargeDownloads(settings.confirmLargeDownloads);
            const nextDevice = resolveTransformersRuntimeDevice(settings.runtimePreference);
            setRuntimeDevice(nextDevice);
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
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function ensureAdapter() {
    adapterRef.current ??= new TransformersVisionWorkerAdapter(undefined, runtimeDevice);
    return adapterRef.current;
  }

  function setPreview(blob: Blob, metadata: VisionImagePreprocessResult) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextUrl = URL.createObjectURL(blob);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
    setImage(blob);
    setImageMetadata(metadata);
    setCaption('');
    setDurationMs(null);
  }

  async function prepareSelectedImage(blob: Blob) {
    setPreprocessing(true);
    setError(null);
    try {
      const processed = await preprocessVisionImage(blob);
      setPreview(processed.blob, processed);
    } catch (preprocessError) {
      setError(errorMessage(preprocessError, 'This image could not be prepared locally.'));
    } finally {
      if (mountedRef.current) setPreprocessing(false);
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
        manifest: visionModel,
        onProgress: (event) => {
          if (mountedRef.current) setProgress(event.progress * 100);
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
      if (!mountedRef.current) return;
      setLoadTimeMs(performance.now() - startedAt);
      setProgress(100);
      setStatus('ready');
      setCacheStatus(result.cache);
      setCacheInspected(true);
    } catch (loadError) {
      if (mountedRef.current) {
        setError(
          isAbortError(loadError)
            ? 'Vision model download cancelled. Retry to reuse any complete cached files.'
            : errorMessage(loadError, 'Vision model loading failed.'),
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
    await prepareSelectedImage(blob);
  }

  async function selectImage(file: File | undefined) {
    if (!file) return;
    const validation = validateVisionImageFile(file);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }
    await prepareSelectedImage(file);
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
      void benchmarks
        .put({
          createdAt: new Date().toISOString(),
          durationMs: event.durationMs,
          firstTokenMs: null,
          id: crypto.randomUUID(),
          loadTimeMs,
          modelId: visionModel.id,
          outputUnits: 1,
          runtimeDevice,
          schemaVersion: 1,
          task: 'image-to-text',
        })
        .catch(() => {});
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
  const busy =
    preprocessing || status === 'loading' || status === 'running' || status === 'cancelling';
  const analysisProgressLabel = visionAnalysisProgressLabel(preprocessing, status);

  return (
    <section className="section vision-lab-section" id="vision-lab">
      <div className="model-lab-heading">
        <div>
          <p className="kicker">VISION DESK</p>
          <h2>Let the browser look.</h2>
        </div>
        <p>
          A separate {runtimeDevice === 'webgpu' ? 'WebGPU' : 'WebAssembly'} worker preprocesses an
          image and generates a caption locally. The built-in sample is synthetic, so testing it
          sends no personal file anywhere.
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
              disabled={busy}
              onClick={() => void useSample()}
              type="button"
            >
              {preprocessing ? 'Preparing image…' : 'Use sample image'}
            </button>
            <label className="button button--quiet file-button">
              Choose image
              <input
                accept={VISION_IMAGE_ACCEPT_ATTRIBUTE}
                disabled={busy}
                onChange={(event) => void selectImage(event.target.files?.[0])}
                type="file"
              />
            </label>
            <p className="vision-input-limits">
              PNG, JPEG, or WebP up to 12 MiB. Images are decoded locally before inference.
            </p>
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
          {analysisProgressLabel ? (
            <div
              aria-label={analysisProgressLabel}
              className="model-progress model-progress--indeterminate"
              role="progressbar"
            >
              <span />
            </div>
          ) : null}

          {error ? <p className="model-error">{error}</p> : null}
        </div>

        <VisionTaskOutput
          cacheInspected={cacheInspected}
          cacheStatus={cacheStatus}
          caption={caption}
          durationMs={durationMs}
          imageMetadata={imageMetadata}
          installStatus={installRecord?.status ?? 'Not recorded'}
          loadTimeMs={loadTimeMs}
          runtimeDevice={runtimeDevice}
          storageMessage={storageMessage}
        />
      </div>
    </section>
  );
}
