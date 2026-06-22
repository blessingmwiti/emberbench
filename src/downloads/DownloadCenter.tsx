import { useEffect, useState } from 'react';

import { findCuratedModel } from '../models/catalog/registry';
import type { InstalledModel } from '../models/catalog/types';
import { INSTALLED_MODELS_CHANGED_EVENT, installedModels } from '../storage/database';

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
                <a className="button button--quiet" href="#/models">
                  {record.status === 'failed' ? 'Retry in Models' : 'Open Models'}
                </a>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
