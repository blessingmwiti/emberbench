import { useEffect, useRef, useState } from 'react';

import {
  TEXT_SPIKE_MODEL,
  type TextModelWorkerEvent,
  type TextModelWorkerRequest,
} from './protocol';

type LabStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'cancelling' | 'error';

interface Metrics {
  durationMs: number;
  firstTokenMs: number | null;
  tokenCount: number;
}

const initialPrompt = 'Once upon a time, a tiny ember learned how to';

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

export function TextModelLab() {
  const workerRef = useRef<Worker | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const [status, setStatus] = useState<LabStatus>('idle');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [output, setOutput] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [loadTimeMs, setLoadTimeMs] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [cachedFilesOnly, setCachedFilesOnly] = useState(false);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );

  function ensureWorker() {
    if (workerRef.current) {
      return workerRef.current;
    }

    const worker = new Worker(new URL('./text-generation.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener('message', (event: MessageEvent<TextModelWorkerEvent>) => {
      const message = event.data;

      switch (message.type) {
        case 'cache-status':
          setCached(message.cached);
          break;
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
        case 'token':
          if (message.requestId === activeRequestRef.current) {
            setOutput((current) => current + message.text);
          }
          break;
        case 'complete':
          if (message.requestId === activeRequestRef.current) {
            setMetrics(message);
            activeRequestRef.current = null;
            setStatus('ready');
          }
          break;
        case 'cancelled':
          if (message.requestId === activeRequestRef.current) {
            activeRequestRef.current = null;
            setStatus('ready');
          }
          break;
        case 'error':
          if (!message.requestId || message.requestId === activeRequestRef.current) {
            activeRequestRef.current = null;
            setError(message.message);
            setStatus('error');
          }
          break;
        case 'unloaded':
          activeRequestRef.current = null;
          setLoadTimeMs(null);
          setMetrics(null);
          setOutput('');
          setProgress(null);
          setStatus('idle');
          break;
      }
    });

    worker.addEventListener('error', () => {
      activeRequestRef.current = null;
      setError('The model worker stopped unexpectedly.');
      setStatus('error');
    });

    workerRef.current = worker;
    return worker;
  }

  function post(request: TextModelWorkerRequest) {
    ensureWorker().postMessage(request);
  }

  function loadModel() {
    setError(null);
    setProgress(0);
    setStatus('loading');
    post({ cachedFilesOnly, type: 'load' });
  }

  function generate() {
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
    post({
      maxNewTokens: 64,
      prompt: normalizedPrompt,
      requestId,
      type: 'generate',
    });
  }

  function cancel() {
    setStatus('cancelling');
    post({ type: 'cancel' });
  }

  function unload() {
    post({ type: 'unload' });
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
            <span>{TEXT_SPIKE_MODEL}</span>
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
              <button className="button button--primary" onClick={loadModel} type="button">
                Download and load model
              </button>
            ) : null}
            {status === 'loading' ? (
              <button className="button button--primary" disabled type="button">
                Loading {progress === null ? '' : `${progress.toFixed(0)}%`}
              </button>
            ) : null}
            {status === 'ready' ? (
              <button className="button button--primary" onClick={generate} type="button">
                Generate 64 tokens
              </button>
            ) : null}
            {status === 'generating' || status === 'cancelling' ? (
              <button
                className="button button--danger"
                disabled={status === 'cancelling'}
                onClick={cancel}
                type="button"
              >
                {status === 'cancelling' ? 'Stopping…' : 'Stop generation'}
              </button>
            ) : null}
            {modelReady && status === 'ready' ? (
              <button className="button button--quiet" onClick={unload} type="button">
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
              <dt>Model files</dt>
              <dd>
                {cached === null ? 'Not checked' : cached ? 'Fully cached' : 'Download required'}
              </dd>
            </div>
            <div>
              <dt>Load policy</dt>
              <dd>{cachedFilesOnly ? 'Browser cache only' : 'Cache + network'}</dd>
            </div>
          </dl>
          <p>These are measurements from this browser session, not universal performance claims.</p>
        </aside>
      </div>
    </section>
  );
}
