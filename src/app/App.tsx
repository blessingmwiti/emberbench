import { useCallback, useEffect, useState } from 'react';

import { RecentBenchmarks } from '../benchmarks/RecentBenchmarks';
import { formatBytes } from '../diagnostics/format';
import {
  requestPersistentStorage,
  runDeviceDiagnostics,
} from '../diagnostics/run-device-diagnostics';
import type { DeviceDiagnostic, DiagnosticStatus } from '../diagnostics/types';
import { recommendDeviceTier } from '../diagnostics/recommend-device-tier';
import { DownloadCenter } from '../downloads/DownloadCenter';
import { ModelImporter } from '../models/importer/ModelImporter';
import { ModelLibrary } from '../models/catalog/ModelLibrary';
import { TextModelLab } from '../model-lab/TextModelLab';
import { PwaStatus } from '../pwa/PwaStatus';
import { SettingsPanel } from '../settings/SettingsPanel';
import { reconcileInstallations } from '../storage/reconcile-installations';
import { VisionModelLab } from '../vision-lab/VisionModelLab';
import { AssistantWorkspace } from '../workspaces/AssistantWorkspace';
import { routeHref, useAppRoute, type AppRoute } from './routing';

const workspaces = [
  {
    name: 'General Assistant',
    description: 'Private conversation, summarization, planning, and writing.',
    icon: '✦',
    route: 'assistant' as const,
  },
  {
    name: 'Code Lab',
    description: 'Explain, generate, refactor, debug, and review source code.',
    icon: '⌘',
    route: null,
  },
  {
    name: 'Vision Desk',
    description: 'Understand images, extract text, and answer visual questions.',
    icon: '◉',
    route: null,
  },
];

function StatusMark({ status }: { status: DiagnosticStatus }) {
  return <span aria-hidden="true" className={`status-mark status-mark--${status}`} />;
}

export function App() {
  const route = useAppRoute();
  const [diagnostic, setDiagnostic] = useState<DeviceDiagnostic | null>(null);
  const [status, setStatus] = useState<DiagnosticStatus>('idle');
  const [persistenceMessage, setPersistenceMessage] = useState<string | null>(null);
  const [requestingPersistence, setRequestingPersistence] = useState(false);
  const [reconciliationMessage, setReconciliationMessage] = useState<string | null>(null);

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

  useEffect(() => {
    let active = true;
    void reconcileInstallations()
      .then((summary) => {
        if (!active || summary.checked === 0) return;
        setReconciliationMessage(
          summary.stale > 0
            ? `${summary.stale} local model installation needs repair.`
            : summary.repaired > 0
              ? `${summary.repaired} interrupted model installation was recovered.`
              : `${summary.checked} local model installation${summary.checked === 1 ? '' : 's'} verified.`,
        );
      })
      .catch(() => {
        if (active) {
          setReconciliationMessage('Local model installation records could not be verified.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const persistStorage = useCallback(async () => {
    setRequestingPersistence(true);
    setPersistenceMessage(null);

    try {
      const granted = await requestPersistentStorage();
      setPersistenceMessage(
        granted === null
          ? 'This browser does not expose persistent storage controls.'
          : granted
            ? 'Persistent storage is granted. The browser is less likely to evict model files.'
            : 'The browser did not grant persistence. Cached models may be evicted under storage pressure.',
      );
      await runDiagnostics();
    } catch {
      setPersistenceMessage('The persistent storage request could not be completed.');
    } finally {
      setRequestingPersistence(false);
    }
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
  const deviceRecommendation = recommendDeviceTier(diagnostic);
  const navItems: { label: string; route: AppRoute }[] = [
    { label: 'Home', route: 'home' },
    { label: 'Models', route: 'models' },
    { label: 'Downloads', route: 'downloads' },
    { label: 'Settings', route: 'settings' },
  ];

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href={routeHref('home')} aria-label="Emberbench home">
          <span className="brand-mark" aria-hidden="true">
            e
          </span>
          <span>Emberbench</span>
        </a>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <a
              aria-current={route === item.route ? 'page' : undefined}
              href={routeHref(item.route)}
              key={item.route}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <PwaStatus />
      </header>

      <main>
        {route === 'home' ? (
          <>
            <section className="hero">
              <div className="eyebrow">PRIVATE AI, LIT LOCALLY</div>
              <h1>
                Your device.
                <br />
                <em>Your models.</em>
              </h1>
              <p className="hero-copy">
                A browser-native workbench for useful AI. No daemon, no cloud account, and no
                prompts leaving your machine.
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
                    {workspace.route ? (
                      <a className="workspace-open" href={routeHref(workspace.route)}>
                        Open workspace →
                      </a>
                    ) : (
                      <span className="coming-soon">Planned for MVP</span>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {route === 'models' ? <ModelLibrary diagnostic={diagnostic} /> : null}

        {route === 'home' ? (
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
              {diagnostic?.storage.available && !diagnostic.storage.persisted ? (
                <button
                  className="button button--quiet"
                  disabled={requestingPersistence}
                  onClick={() => void persistStorage()}
                  type="button"
                >
                  {requestingPersistence ? 'Requesting…' : 'Protect cached models'}
                </button>
              ) : null}
              {persistenceMessage ? (
                <p className="storage-message" role="status">
                  {persistenceMessage}
                </p>
              ) : null}
              {reconciliationMessage ? (
                <p className="storage-message" role="status">
                  {reconciliationMessage}
                </p>
              ) : null}
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
                  <dt>FP16 shaders</dt>
                  <dd>
                    {diagnostic
                      ? diagnostic.webGpu.features.includes('shader-f16')
                        ? 'Available'
                        : 'Not exposed'
                      : 'Checking…'}
                  </dd>
                </div>
                <div>
                  <dt>Device tier</dt>
                  <dd>{deviceRecommendation ? deviceRecommendation.tier : 'Checking…'}</dd>
                </div>
                <div>
                  <dt>Runtime paths</dt>
                  <dd>
                    {diagnostic
                      ? diagnostic.runtime.supportedPaths.join(', ') || 'None'
                      : 'Checking…'}
                  </dd>
                </div>
                <div>
                  <dt>Browser</dt>
                  <dd>{diagnostic?.browser.browser ?? 'Checking…'}</dd>
                </div>
                <div>
                  <dt>Platform</dt>
                  <dd>{diagnostic?.browser.platform ?? 'Checking…'}</dd>
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
              {deviceRecommendation ? (
                <p className="diagnostic-recommendation">
                  <strong>{deviceRecommendation.tier} tier.</strong> {deviceRecommendation.reason}
                  {' Exact usable GPU memory is not exposed or estimated.'}
                </p>
              ) : null}
              {deviceRecommendation?.tier === 'unsupported' ? (
                <p className="diagnostic-guidance">
                  Try an up-to-date browser with WebGPU enabled, current graphics drivers, and a
                  secure HTTPS or localhost origin.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {route === 'models' ? (
          <>
            <TextModelLab />

            <VisionModelLab />

            <ModelImporter />

            <RecentBenchmarks />
          </>
        ) : null}

        {route === 'downloads' ? <DownloadCenter /> : null}

        {route === 'settings' ? <SettingsPanel /> : null}

        {route === 'assistant' ? <AssistantWorkspace /> : null}

        {route === 'home' ? (
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
        ) : null}
      </main>

      <footer>
        <span>Emberbench</span>
        <span>Keep the useful fire close.</span>
      </footer>
    </div>
  );
}
