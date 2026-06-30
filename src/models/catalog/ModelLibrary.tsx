import { useCallback, useEffect, useRef, useState } from 'react';

import { formatBytes } from '../../diagnostics/format';
import {
  compareModelWithDevice,
  recommendDeviceTier,
  type ModelDeviceFit,
} from '../../diagnostics/recommend-device-tier';
import type { DeviceDiagnostic } from '../../diagnostics/types';
import { runDownloadPreflight } from '../../storage/download-preflight';
import { installModel } from '../../storage/install-model';
import {
  appSettings,
  INSTALLED_MODELS_CHANGED_EVENT,
  installedModels,
} from '../../storage/database';
import { createRuntimeAdapter } from '../../runtimes/create-runtime-adapter';
import { resolveTransformersRuntimeDevice } from '../../runtimes/transformers/runtime-device';
import type { InstalledModel, ModelManifest } from './types';
import { removeInstalledModel } from '../../storage/remove-installed-model';
import { getCuratedModels, getModelDownloadSize } from './registry';
import {
  getModelOfflineAvailability,
  matchesModelLibraryFilter,
  type ModelLibraryFilter,
} from './library-filter';

function readInstallLabel(model: ModelManifest, installed: InstalledModel | undefined) {
  if (!installed) {
    return 'Not installed';
  }
  if (installed.sourceRevision !== model.source.revision) {
    return 'Update required';
  }

  switch (installed.status) {
    case 'installed':
      return 'Offline ready';
    case 'downloading':
      return installed.downloadProgress === undefined
        ? 'Downloading'
        : `Downloading ${Math.round(installed.downloadProgress * 100)}%`;
    case 'verifying':
      return 'Verifying';
    case 'failed':
      return 'Needs attention';
    case 'removing':
      return 'Removing';
  }
}

const DEVICE_FIT_LABELS: Record<ModelDeviceFit, string> = {
  recommended: 'Recommended for this device',
  'exceeds-tier': 'Above recommended tier',
  'insufficient-storage': 'Not enough browser storage',
  unsupported: 'WebGPU unavailable',
};

export function ModelLibrary({ diagnostic }: { diagnostic: DeviceDiagnostic | null }) {
  const [installations, setInstallations] = useState<Map<string, InstalledModel>>(new Map());
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [confirmRemovalId, setConfirmRemovalId] = useState<string | null>(null);
  const [removingModelId, setRemovingModelId] = useState<string | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ModelLibraryFilter>('all');
  const [installingModelId, setInstallingModelId] = useState<string | null>(null);
  const [installMessageModelId, setInstallMessageModelId] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState(0);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const installControllerRef = useRef<AbortController | null>(null);

  const refreshInstallations = useCallback(async () => {
    try {
      const records = await installedModels.list();
      setInstallations(new Map(records.map((record) => [record.modelId, record])));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }, []);

  useEffect(() => {
    const handleInstallationsChanged = () => {
      void refreshInstallations();
    };

    void refreshInstallations();
    window.addEventListener(INSTALLED_MODELS_CHANGED_EVENT, handleInstallationsChanged);
    return () => {
      installControllerRef.current?.abort();
      window.removeEventListener(INSTALLED_MODELS_CHANGED_EVENT, handleInstallationsChanged);
    };
  }, [refreshInstallations]);

  const curatedModels = getCuratedModels();
  const deviceTier = recommendDeviceTier(diagnostic);
  const installedCount = curatedModels.filter(
    (model) =>
      installations.get(model.id)?.status === 'installed' &&
      installations.get(model.id)?.sourceRevision === model.source.revision,
  ).length;
  const attentionCount = curatedModels.filter((model) =>
    matchesModelLibraryFilter('attention', model, installations.get(model.id)),
  ).length;
  const filteredModels = curatedModels.filter((model) =>
    matchesModelLibraryFilter(filter, model, installations.get(model.id)),
  );

  async function removeLocalModel(model: ModelManifest, installation: InstalledModel) {
    setRemovingModelId(model.id);
    setRemovalError(null);

    try {
      await removeInstalledModel(model, installation);
      setConfirmRemovalId(null);
    } catch (error) {
      setRemovalError(error instanceof Error ? error.message : 'Model deletion failed.');
    } finally {
      setRemovingModelId(null);
    }
  }

  async function installLocalModel(model: ModelManifest) {
    setInstallMessageModelId(model.id);
    setInstallMessage(null);
    setInstallProgress(0);
    const preflight = await runDownloadPreflight(model);
    if (preflight.status === 'blocked') {
      setInstallMessage(preflight.message);
      return;
    }

    const controller = new AbortController();
    const settings = await appSettings.get();
    const adapter = createRuntimeAdapter(
      model,
      resolveTransformersRuntimeDevice(settings.runtimePreference),
    );
    installControllerRef.current = controller;
    setInstallingModelId(model.id);
    if (preflight.status === 'warning') setInstallMessage(preflight.message);

    try {
      await installModel({
        adapter,
        manifest: model,
        onProgress: (event) => setInstallProgress(event.progress),
        onQueueChange: setInstallMessage,
        onRetry: (attempt) => setInstallMessage(`Retrying · attempt ${attempt} of 3…`),
        signal: controller.signal,
      });
      setInstallProgress(1);
      setInstallMessage(`${model.name} is ready for offline use.`);
    } catch (error) {
      const cancelled =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.message.toLowerCase().includes('abort'));
      setInstallMessage(
        cancelled
          ? 'Download cancelled. Complete cached files will be reused on retry.'
          : error instanceof Error
            ? error.message
            : 'Model installation failed.',
      );
    } finally {
      adapter.terminate();
      installControllerRef.current = null;
      setInstallingModelId(null);
    }
  }

  return (
    <section className="section model-library-section" id="models">
      <div className="section-heading">
        <div>
          <p className="kicker">CURATED MODEL REGISTRY</p>
          <h2>Tested models, pinned precisely.</h2>
        </div>
        <p>
          These first manifests are generated from the models already proven in this browser. Each
          entry carries its source revision, artifacts, license, task, and device tier.
          <span className="model-library-summary">
            {storageAvailable
              ? `${installedCount} of ${curatedModels.length} offline ready`
              : ' Local install status unavailable'}
          </span>
        </p>
      </div>

      <div className="model-library-filters" aria-label="Filter model library">
        {(
          [
            ['all', `All (${curatedModels.length})`],
            ['installed', `Offline ready (${installedCount})`],
            ['attention', `Needs attention (${attentionCount})`],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-pressed={filter === value}
            key={value}
            onClick={() => setFilter(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="model-library-grid">
        {filteredModels.map((model) => {
          const installation = installations.get(model.id);
          const installationStatus =
            installation?.sourceRevision === model.source.revision ? installation.status : 'none';
          const offlineAvailability = getModelOfflineAvailability(model, installation);
          const deviceFit = compareModelWithDevice(model, diagnostic, deviceTier);

          return (
            <article className="model-library-card" key={model.id}>
              <div className="model-library-card__header">
                <span className={`model-status model-status--${model.status}`}>{model.status}</span>
                <span>{model.requirements.deviceTier} device</span>
              </div>
              <div
                className={`installation-status installation-status--${installationStatus}`}
                role="status"
              >
                <span aria-hidden="true">●</span>
                {readInstallLabel(model, installation)}
              </div>
              <div
                aria-label={offlineAvailability.description}
                className={`offline-availability offline-availability--${offlineAvailability.state}`}
                title={offlineAvailability.description}
              >
                {offlineAvailability.label}
              </div>
              <div className={`model-device-fit model-device-fit--${deviceFit ?? 'checking'}`}>
                {deviceFit ? DEVICE_FIT_LABELS[deviceFit] : 'Checking device fit'}
              </div>
              <h3>{model.name}</h3>
              <p>{model.description}</p>
              <dl>
                <div>
                  <dt>Task</dt>
                  <dd>{model.requirements.task}</dd>
                </div>
                <div>
                  <dt>Download</dt>
                  <dd>{formatBytes(getModelDownloadSize(model))}</dd>
                </div>
                <div>
                  <dt>Precision</dt>
                  <dd>
                    {[...new Set(model.artifacts.map((artifact) => artifact.precision))].join(', ')}
                  </dd>
                </div>
                <div>
                  <dt>License</dt>
                  <dd>{model.license.id}</dd>
                </div>
              </dl>
              <div className="capability-list">
                {model.capabilities.map((capability) => (
                  <span key={capability}>{capability}</span>
                ))}
              </div>
              <a
                href={`https://huggingface.co/${model.source.modelId}/tree/${model.source.revision}`}
                rel="noreferrer"
                target="_blank"
              >
                View pinned source ↗
              </a>
              {installingModelId === model.id ||
              installationStatus === 'none' ||
              installationStatus === 'failed' ||
              installation?.sourceRevision !== model.source.revision ? (
                <div className="model-install">
                  {installingModelId === model.id ? (
                    <>
                      <progress max="1" value={installProgress} />
                      <div>
                        <span>{Math.round(installProgress * 100)}%</span>
                        <button
                          className="model-remove-button"
                          onClick={() => installControllerRef.current?.abort()}
                          type="button"
                        >
                          Cancel download
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      className="button button--primary"
                      disabled={installingModelId !== null}
                      onClick={() => void installLocalModel(model)}
                      type="button"
                    >
                      {installationStatus === 'failed' ? 'Retry installation' : 'Install model'}
                    </button>
                  )}
                  {installMessage && installMessageModelId === model.id ? (
                    <p role="status">{installMessage}</p>
                  ) : null}
                </div>
              ) : null}
              {(installationStatus === 'installed' || confirmRemovalId === model.id) &&
              installation &&
              (model.requirements.task === 'text-generation' ||
                model.requirements.task === 'image-to-text') ? (
                <div className="model-removal">
                  {confirmRemovalId === model.id ? (
                    <div className="model-removal__confirmation" role="alert">
                      <p>
                        Remove this model’s cached files and local install record? Workspaces using
                        it will need to download it again.
                      </p>
                      <div>
                        <button
                          className="button button--danger"
                          disabled={removingModelId === model.id}
                          onClick={() => void removeLocalModel(model, installation)}
                          type="button"
                        >
                          {removingModelId === model.id ? 'Removing…' : 'Remove model files'}
                        </button>
                        <button
                          className="button button--quiet"
                          disabled={removingModelId === model.id}
                          onClick={() => setConfirmRemovalId(null)}
                          type="button"
                        >
                          Keep model
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="model-remove-button"
                      onClick={() => {
                        setRemovalError(null);
                        setConfirmRemovalId(model.id);
                      }}
                      type="button"
                    >
                      Remove local copy
                    </button>
                  )}
                  {removalError && confirmRemovalId === model.id ? (
                    <p className="model-removal__error">{removalError}</p>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {filteredModels.length === 0 ? (
        <div className="model-library-empty">
          <h3>No models match this view.</h3>
          <p>
            {filter === 'installed'
              ? 'Download and verify a model to make it available offline.'
              : 'No curated model installations currently need repair.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
