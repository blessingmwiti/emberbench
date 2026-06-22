import { useEffect, useRef, useState } from 'react';

import { formatBytes } from '../../diagnostics/format';
import { HuggingFaceInspectionError, inspectHuggingFaceModel } from './inspect-hugging-face-model';
import { HuggingFaceModelInputError } from './parse-hugging-face-model';
import type { CompatibilityReport } from './types';
import type { RuntimeProbeEvent, RuntimeProbeRequest } from './probe-protocol';

const exampleModel = 'onnx-community/SmolLM2-135M-ONNX';

const outcomeLabels: Record<CompatibilityReport['outcome'], string> = {
  'conversion-required': 'Conversion required',
  ready: 'Ready to run',
  unsupported: 'Unsupported',
};

export function ModelImporter() {
  const abortRef = useRef<AbortController | null>(null);
  const [input, setInput] = useState(exampleModel);
  const [report, setReport] = useState<CompatibilityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const probeWorkerRef = useRef<Worker | null>(null);
  const [probeProgress, setProbeProgress] = useState<number | null>(null);
  const [probeStatus, setProbeStatus] = useState<'idle' | 'running' | 'verified' | 'failed'>(
    'idle',
  );
  const [probeMessage, setProbeMessage] = useState<string | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      probeWorkerRef.current?.terminate();
    },
    [],
  );

  async function inspect() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setReport(null);
    setProbeStatus('idle');
    setProbeMessage(null);
    setProbeProgress(null);
    setLoading(true);

    try {
      setReport(await inspectHuggingFaceModel(input, controller.signal));
    } catch (inspectionError) {
      if (controller.signal.aborted) {
        return;
      }
      setError(
        inspectionError instanceof HuggingFaceModelInputError ||
          inspectionError instanceof HuggingFaceInspectionError
          ? inspectionError.message
          : 'The model could not be inspected.',
      );
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  }

  function runProbe() {
    if (
      !report ||
      report.outcome !== 'ready' ||
      !report.pinnedRevision ||
      !report.pipelineTag ||
      !report.recommendation
    ) {
      return;
    }

    probeWorkerRef.current?.terminate();
    const worker = new Worker(new URL('./runtime-probe.worker.ts', import.meta.url), {
      type: 'module',
    });
    probeWorkerRef.current = worker;
    setProbeStatus('running');
    setProbeMessage(null);
    setProbeProgress(0);

    worker.addEventListener('message', (event: MessageEvent<RuntimeProbeEvent>) => {
      const message = event.data;
      if (message.type === 'progress') {
        if (typeof message.data.progress === 'number') {
          setProbeProgress(message.data.progress);
        }
        return;
      }
      if (message.type === 'ready') {
        setProbeStatus('verified');
        setProbeProgress(100);
        setProbeMessage(
          `Pinned revision initialized through WebGPU in ${(message.durationMs / 1000).toFixed(2)} seconds.`,
        );
        worker.terminate();
        probeWorkerRef.current = null;
        return;
      }

      setProbeStatus('failed');
      setProbeMessage(message.message);
      worker.terminate();
      probeWorkerRef.current = null;
    });

    worker.addEventListener('error', () => {
      setProbeStatus('failed');
      setProbeMessage('The runtime probe worker stopped unexpectedly.');
      worker.terminate();
      probeWorkerRef.current = null;
    });

    const request: RuntimeProbeRequest = {
      dtype: report.recommendation.dtype,
      modelId: report.modelId,
      revision: report.pinnedRevision,
      task: report.pipelineTag,
      type: 'probe',
    };
    worker.postMessage(request);
  }

  function cancelProbe() {
    probeWorkerRef.current?.terminate();
    probeWorkerRef.current = null;
    setProbeStatus('idle');
    setProbeMessage('Runtime probe cancelled. Downloaded browser-cache files remain available.');
  }

  return (
    <section className="section importer-section" id="model-importer">
      <div className="model-lab-heading">
        <div>
          <p className="kicker">HUGGING FACE INSPECTOR</p>
          <h2>Know before you download.</h2>
        </div>
        <p>
          Paste a public model URL or owner/model identifier. Emberbench reads repository metadata
          as untrusted data, never executes repository code, and pins the inspected revision.
        </p>
      </div>

      <div className="importer-grid">
        <div className="importer-form">
          <label htmlFor="hugging-face-model">Public Hugging Face model</label>
          <div className="importer-input-row">
            <input
              id="hugging-face-model"
              onChange={(event) => setInput(event.target.value)}
              placeholder="owner/model or https://huggingface.co/owner/model"
              value={input}
            />
            <button
              className="button button--primary"
              disabled={loading}
              onClick={() => void inspect()}
              type="button"
            >
              {loading ? 'Inspecting…' : 'Inspect model'}
            </button>
          </div>
          <p>
            Public metadata only. Private and gated model authentication is deliberately deferred.
          </p>
          {error ? <p className="model-error">{error}</p> : null}
        </div>

        <aside className="compatibility-report" aria-live="polite">
          {report ? (
            <>
              <div className="compatibility-report__header">
                <div>
                  <p className="panel-label">COMPATIBILITY REPORT</p>
                  <h3>{report.modelId}</h3>
                </div>
                <span className={`outcome-badge outcome-badge--${report.outcome}`}>
                  {outcomeLabels[report.outcome]}
                </span>
              </div>

              <dl className="compatibility-facts">
                <div>
                  <dt>Task</dt>
                  <dd>{report.pipelineTag ?? 'Not declared'}</dd>
                </div>
                <div>
                  <dt>Architecture</dt>
                  <dd>{report.architecture ?? 'Not declared'}</dd>
                </div>
                <div>
                  <dt>Library</dt>
                  <dd>{report.library ?? 'Not declared'}</dd>
                </div>
                <div>
                  <dt>ONNX files</dt>
                  <dd>{report.files.onnx}</dd>
                </div>
                <div>
                  <dt>Quantized ONNX</dt>
                  <dd>{report.files.quantizedOnnx}</dd>
                </div>
                <div>
                  <dt>ONNX storage</dt>
                  <dd>{formatBytes(report.sizes.onnxBytes)}</dd>
                </div>
                <div>
                  <dt>Recommended precision</dt>
                  <dd>{report.recommendation?.dtype ?? 'Not available'}</dd>
                </div>
                <div>
                  <dt>Recommended files</dt>
                  <dd>{report.recommendation?.files?.join(', ') ?? 'Not available'}</dd>
                </div>
                <div>
                  <dt>Graph size</dt>
                  <dd>{formatBytes(report.recommendation?.sizeBytes ?? null)}</dd>
                </div>
              </dl>

              {[...report.reasons, ...report.details].length > 0 ? (
                <ul className="compatibility-reasons">
                  {[...report.reasons, ...report.details].map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}

              <div className="revision-line">
                <span>Inspected revision</span>
                <code>{report.pinnedRevision ?? 'Not reported'}</code>
              </div>
              <a href={report.sourceUrl} rel="noreferrer" target="_blank">
                Open source repository ↗
              </a>

              {report.outcome === 'ready' &&
              report.pinnedRevision &&
              report.pipelineTag &&
              report.recommendation ? (
                <div className="runtime-probe">
                  <p>
                    Runtime verification downloads the recommended model artifacts and initializes
                    the pinned revision in a disposable WebGPU worker.
                  </p>
                  {probeStatus === 'running' ? (
                    <>
                      <div
                        aria-label={`Runtime verification progress: ${probeProgress ?? 0}%`}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={probeProgress ?? 0}
                        className="model-progress"
                        role="progressbar"
                      >
                        <span style={{ width: `${probeProgress ?? 0}%` }} />
                      </div>
                      <button className="button button--danger" onClick={cancelProbe} type="button">
                        Cancel verification
                      </button>
                    </>
                  ) : (
                    <button className="button button--quiet" onClick={runProbe} type="button">
                      Verify in WebGPU
                    </button>
                  )}
                  {probeMessage ? (
                    <p className={`probe-message probe-message--${probeStatus}`} role="status">
                      {probeMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="report-placeholder">
              <span aria-hidden="true">◇</span>
              <p>A compatibility report will appear here.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
