import { useCallback, useEffect, useState } from 'react';

import { formatBytes } from '../diagnostics/format';
import { runDeviceDiagnostics } from '../diagnostics/run-device-diagnostics';
import type { DeviceDiagnostic, DiagnosticStatus } from '../diagnostics/types';
import { TextModelLab } from '../model-lab/TextModelLab';
import { PwaStatus } from '../pwa/PwaStatus';
import { VisionModelLab } from '../vision-lab/VisionModelLab';

const workspaces = [
  {
    name: 'General Assistant',
    description: 'Private conversation, summarization, planning, and writing.',
    icon: '✦',
  },
  {
    name: 'Code Lab',
    description: 'Explain, generate, refactor, debug, and review source code.',
    icon: '⌘',
  },
  {
    name: 'Vision Desk',
    description: 'Understand images, extract text, and answer visual questions.',
    icon: '◉',
  },
];

function StatusMark({ status }: { status: DiagnosticStatus }) {
  return <span aria-hidden="true" className={`status-mark status-mark--${status}`} />;
}

export function App() {
  const [diagnostic, setDiagnostic] = useState<DeviceDiagnostic | null>(null);
  const [status, setStatus] = useState<DiagnosticStatus>('idle');

  const runDiagnostics = useCallback(async () => {
    setStatus('running');

    try {
      const result = await runDeviceDiagnostics();
      setDiagnostic(result);
      setStatus(result.webGpu.status);
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void runDiagnostics();
  }, [runDiagnostics]);

  const statusCopy =
    status === 'running'
      ? 'Checking this browser…'
      : status === 'ready'
        ? 'WebGPU is ready'
        : status === 'unsupported'
          ? 'WebGPU is unavailable'
          : status === 'error'
            ? 'Diagnostics need attention'
            : 'Not checked yet';

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Emberbench home">
          <span className="brand-mark" aria-hidden="true">
            e
          </span>
          <span>Emberbench</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#workspaces">Workspaces</a>
          <a href="#diagnostics">Device</a>
          <a href="#model-lab">Model Lab</a>
          <a href="#vision-lab">Vision</a>
          <a href="#roadmap">Roadmap</a>
        </nav>
        <PwaStatus />
      </header>

      <main id="top">
        <section className="hero">
          <div className="eyebrow">PRIVATE AI, LIT LOCALLY</div>
          <h1>
            Your device.
            <br />
            <em>Your models.</em>
          </h1>
          <p className="hero-copy">
            A browser-native workbench for useful AI. No daemon, no cloud account, and no prompts
            leaving your machine.
          </p>
          <div className="hero-actions">
            <a className="button button--primary" href="#diagnostics">
              Check this device <span aria-hidden="true">→</span>
            </a>
            <a className="button button--quiet" href="#workspaces">
              Explore workspaces
            </a>
          </div>
          <div className="promise-row" aria-label="Product promises">
            <span>WebGPU powered</span>
            <span>Offline after download</span>
            <span>No per-token bill</span>
          </div>
        </section>

        <section className="section" id="workspaces">
          <div className="section-heading">
            <div>
              <p className="kicker">MVP WORKSPACES</p>
              <h2>Built around the work, not the model name.</h2>
            </div>
            <p>
              Each workspace pairs a focused interface with an appropriate on-device model. The
              first three prove text, code, and vision in one coherent product.
            </p>
          </div>
          <div className="workspace-grid">
            {workspaces.map((workspace, index) => (
              <article className="workspace-card" key={workspace.name}>
                <div className="workspace-card__topline">
                  <span className="workspace-icon" aria-hidden="true">
                    {workspace.icon}
                  </span>
                  <span>0{index + 1}</span>
                </div>
                <h3>{workspace.name}</h3>
                <p>{workspace.description}</p>
                <span className="coming-soon">Planned for MVP</span>
              </article>
            ))}
          </div>
        </section>

        <section className="section diagnostics-section" id="diagnostics">
          <div className="diagnostic-copy">
            <p className="kicker">FIRST FEASIBILITY SLICE</p>
            <h2>Will Emberbench run here?</h2>
            <p>
              We ask the browser what it can honestly expose. Exact GPU memory is often hidden, so
              future model recommendations will combine these signals with conservative runtime
              probes.
            </p>
            <button
              className="button button--primary"
              disabled={status === 'running'}
              onClick={() => void runDiagnostics()}
              type="button"
            >
              {status === 'running' ? 'Running checks…' : 'Run diagnostics again'}
            </button>
          </div>

          <div className="diagnostic-panel" aria-live="polite">
            <div className="diagnostic-panel__header">
              <div>
                <span className="panel-label">DEVICE STATUS</span>
                <strong>
                  <StatusMark status={status} />
                  {statusCopy}
                </strong>
              </div>
              <span className="privacy-badge">Runs locally</span>
            </div>

            <dl className="diagnostic-list">
              <div>
                <dt>Secure context</dt>
                <dd>{diagnostic ? (diagnostic.secureContext ? 'Yes' : 'No') : 'Checking…'}</dd>
              </div>
              <div>
                <dt>Connection</dt>
                <dd>{diagnostic ? (diagnostic.online ? 'Online' : 'Offline') : 'Checking…'}</dd>
              </div>
              <div>
                <dt>GPU vendor</dt>
                <dd>{diagnostic?.webGpu.adapterInfo.vendor ?? 'Not reported'}</dd>
              </div>
              <div>
                <dt>GPU architecture</dt>
                <dd>{diagnostic?.webGpu.adapterInfo.architecture ?? 'Not reported'}</dd>
              </div>
              <div>
                <dt>WebGPU features</dt>
                <dd>{diagnostic ? diagnostic.webGpu.featureCount : 'Checking…'}</dd>
              </div>
              <div>
                <dt>Storage used</dt>
                <dd>{formatBytes(diagnostic?.storage.usageBytes ?? null)}</dd>
              </div>
              <div>
                <dt>Storage quota</dt>
                <dd>{formatBytes(diagnostic?.storage.quotaBytes ?? null)}</dd>
              </div>
              <div>
                <dt>Persistent storage</dt>
                <dd>
                  {diagnostic?.storage.persisted === null
                    ? 'Not reported'
                    : diagnostic?.storage.persisted
                      ? 'Granted'
                      : 'Not granted'}
                </dd>
              </div>
            </dl>

            {diagnostic?.webGpu.error ? (
              <p className="diagnostic-error">{diagnostic.webGpu.error}</p>
            ) : null}
          </div>
        </section>

        <TextModelLab />

        <VisionModelLab />

        <section className="section roadmap-section" id="roadmap">
          <p className="kicker">BUILD ORDER</p>
          <h2>Prove the hard parts first.</h2>
          <div className="roadmap-line">
            <div>
              <span>Now</span>
              <strong>Device diagnostics</strong>
            </div>
            <div>
              <span>Next</span>
              <strong>Streaming text model</strong>
            </div>
            <div>
              <span>Then</span>
              <strong>Offline model reuse</strong>
            </div>
            <div>
              <span>After</span>
              <strong>Hugging Face import</strong>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <span>Emberbench</span>
        <span>Keep the useful fire close.</span>
      </footer>
    </div>
  );
}
