import { useCallback, useEffect, useState } from 'react';

import { formatBytes } from '../../diagnostics/format';
import {
  compareModelWithDevice,
  recommendDeviceTier,
  type ModelDeviceFit,
} from '../../diagnostics/recommend-device-tier';
import type { DeviceDiagnostic } from '../../diagnostics/types';
import type { InstalledModel, ModelManifest } from './types';
import { INSTALLED_MODELS_CHANGED_EVENT, installedModels } from '../../storage/database';
import { getCuratedModels, getModelDownloadSize } from './registry';

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
      return 'Downloading';
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

      <div className="model-library-grid">
        {curatedModels.map((model) => {
          const installation = installations.get(model.id);
          const installationStatus =
            installation?.sourceRevision === model.source.revision ? installation.status : 'none';
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
