import { useEffect, useRef, useState } from 'react';

import { VISION_SPIKE_MODEL, type VisionWorkerEvent, type VisionWorkerRequest } from './protocol';

type VisionStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) {
    return '—';
  }

  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)} s`
    : `${milliseconds.toFixed(0)} ms`;
}

function readProgress(data: Record<string, unknown>) {
  return typeof data.progress === 'number' ? data.progress : null;
}

export function VisionModelLab() {
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<VisionStatus>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [loadTimeMs, setLoadTimeMs] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    },
    [],
  );

  function setPreview(blob: Blob) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(blob);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
    setImage(blob);
    setCaption('');
    setDurationMs(null);
  }

  function ensureWorker() {
    if (workerRef.current) {
      return workerRef.current;
    }

    const worker = new Worker(new URL('./image-caption.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener('message', (event: MessageEvent<VisionWorkerEvent>) => {
      const message = event.data;

      switch (message.type) {
        case 'progress': {
          const nextProgress = readProgress(message.data);
          if (nextProgress !== null) {
            setProgress(nextProgress);
          }
          break;
        }
        case 'ready':
          setLoadTimeMs((current) => (message.loadTimeMs > 0 ? message.loadTimeMs : current));
          setProgress(100);
          setStatus((current) => (current === 'loading' ? 'ready' : current));
          break;
        case 'result':
          if (message.requestId === requestRef.current) {
            requestRef.current = null;
            setCaption(message.caption);
            setDurationMs(message.durationMs);
            setStatus('ready');
          }
          break;
        case 'error':
          if (!message.requestId || message.requestId === requestRef.current) {
            requestRef.current = null;
            setError(message.message);
            setStatus('error');
          }
          break;
        case 'unloaded':
          requestRef.current = null;
          setLoadTimeMs(null);
          setDurationMs(null);
          setCaption('');
          setProgress(null);
          setStatus('idle');
          break;
      }
    });

    worker.addEventListener('error', () => {
      requestRef.current = null;
      setError('The vision worker stopped unexpectedly.');
      setStatus('error');
    });

    workerRef.current = worker;
    return worker;
  }

  function post(request: VisionWorkerRequest) {
    ensureWorker().postMessage(request);
  }

  function loadModel() {
    setError(null);
    setProgress(0);
    setStatus('loading');
    post({ type: 'load' });
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
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    setError(null);
    setPreview(file);
  }

  function runCaption() {
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
    post({ image, requestId, type: 'caption' });
  }

  const ready = status === 'ready' || status === 'running';

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
            <span>{VISION_SPIKE_MODEL}</span>
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
              disabled={status === 'running'}
              onClick={() => void useSample()}
              type="button"
            >
              Use sample image
            </button>
            <label className="button button--quiet file-button">
              Choose image
              <input
                accept="image/*"
                disabled={status === 'running'}
                onChange={(event) => selectImage(event.target.files?.[0])}
                type="file"
              />
            </label>
            {!ready && status !== 'loading' ? (
              <button className="button button--primary" onClick={loadModel} type="button">
                Download vision model
              </button>
            ) : null}
            {status === 'loading' ? (
              <button className="button button--primary" disabled type="button">
                Loading {progress === null ? '' : `${progress.toFixed(0)}%`}
              </button>
            ) : null}
            {status === 'ready' ? (
              <button className="button button--primary" onClick={runCaption} type="button">
                Describe image
              </button>
            ) : null}
            {status === 'running' ? (
              <button className="button button--primary" disabled type="button">
                Looking…
              </button>
            ) : null}
            {status === 'ready' ? (
              <button
                className="button button--quiet"
                onClick={() => post({ type: 'unload' })}
                type="button"
              >
                Unload vision model
              </button>
            ) : null}
          </div>

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
          </dl>
        </aside>
      </div>
    </section>
  );
}
