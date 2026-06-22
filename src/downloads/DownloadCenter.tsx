import { useEffect, useState } from 'react';

import { findCuratedModel } from '../models/catalog/registry';
import type { InstalledModel } from '../models/catalog/types';
import { INSTALLED_MODELS_CHANGED_EVENT, installedModels } from '../storage/database';
import { removeInstalledModel } from '../storage/remove-installed-model';

function statusLabel(model: InstalledModel) {
  switch (model.status) {
    case 'downloading':
      return `Downloading ${Math.round((model.downloadProgress ?? 0) * 100)}%`;
    case 'verifying':
      return 'Verifying local files';
    case 'installed':
      return 'Offline ready';
    case 'failed':
      return 'Needs attention';
    case 'removing':
      return 'Removing local files';
  }
}

function progressValue(model: InstalledModel) {
  if (model.status === 'installed') return 100;
  return Math.round((model.downloadProgress ?? 0) * 100);
}

export function DownloadCenter() {
  const [records, setRecords] = useState<InstalledModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmRemovalId, setConfirmRemovalId] = useState<string | null>(null);
  const [removingModelId, setRemovingModelId] = useState<string | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void installedModels
        .list()
        .then((models) => {
          if (active) setRecords(models);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    refresh();
    window.addEventListener(INSTALLED_MODELS_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(INSTALLED_MODELS_CHANGED_EVENT, refresh);
    };
  }, []);

  async function removeRecord(record: InstalledModel) {
    const manifest = findCuratedModel(record.modelId);
    if (!manifest) {
      setRemovalError('This model is no longer in the curated registry.');
      return;
    }

    setRemovingModelId(record.modelId);
    setRemovalError(null);
    try {
      await removeInstalledModel(manifest, record);
      setConfirmRemovalId(null);
    } catch (error) {
      setRemovalError(error instanceof Error ? error.message : 'Model deletion failed.');
    } finally {
      setRemovingModelId(null);
    }
  }

  return (
    <section className="section downloads-section" aria-labelledby="downloads-heading">
      <div className="section-heading">
        <div>
          <p className="kicker">LOCAL TRANSFERS</p>
          <h1 id="downloads-heading">Downloads</h1>
        </div>
        <p>
          Model transfers and installation state live in this browser. Interrupted downloads keep
          their last known progress and are checked against the local cache after reload.
        </p>
      </div>

      {loading ? <p className="empty-state">Reading local download state…</p> : null}
      {!loading && records.length === 0 ? (
        <div className="empty-state">
          <h2>No model downloads yet.</h2>
          <p>Choose a curated model to begin building your offline library.</p>
          <a className="button button--primary" href="#/models">
            Browse models
          </a>
        </div>
      ) : null}
      {records.length > 0 ? (
        <div className="download-list">
          {records.map((record) => {
            const manifest = findCuratedModel(record.modelId);
            const progress = progressValue(record);
            return (
              <article className="download-card" key={record.modelId}>
                <div>
                  <p className="download-card__status">{statusLabel(record)}</p>
                  <h2>{manifest?.name ?? record.modelId}</h2>
                  <p>
                    {record.downloadAttempt ? `Attempt ${record.downloadAttempt} · ` : ''}
                    Updated {new Date(record.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="download-card__meter">
                  <progress
                    aria-label={`${manifest?.name ?? record.modelId} download progress`}
                    max="100"
                    value={progress}
                  />
                  <span>{progress}%</span>
                </div>
                <div className="download-card__actions">
                  <a className="button button--quiet" href="#/models">
                    {record.status === 'failed' ? 'Retry in Models' : 'Open Models'}
                  </a>
                  <button
                    className="button button--danger"
                    disabled={removingModelId === record.modelId}
                    onClick={() => {
                      setRemovalError(null);
                      setConfirmRemovalId(record.modelId);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
                {confirmRemovalId === record.modelId ? (
                  <div className="download-card__confirmation" role="alert">
                    <p>
                      Remove cached files and this local download record? The model must be
                      downloaded again before offline use.
                    </p>
                    <div>
                      <button
                        className="button button--danger"
                        disabled={removingModelId === record.modelId}
                        onClick={() => void removeRecord(record)}
                        type="button"
                      >
                        {removingModelId === record.modelId ? 'Removing…' : 'Remove model files'}
                      </button>
                      <button
                        className="button button--quiet"
                        disabled={removingModelId === record.modelId}
                        onClick={() => setConfirmRemovalId(null)}
                        type="button"
                      >
                        Keep model
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
      {removalError ? (
        <p className="download-error" role="alert">
          {removalError}
        </p>
      ) : null}
    </section>
  );
}
