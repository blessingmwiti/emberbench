import { useEffect, useRef, useState } from 'react';

import { findCuratedModel } from '../models/catalog/registry';
import type { InstalledModel } from '../models/catalog/types';
import { createRuntimeAdapter } from '../runtimes/create-runtime-adapter';
import { INSTALLED_MODELS_CHANGED_EVENT, installedModels } from '../storage/database';
import { runDownloadPreflight } from '../storage/download-preflight';
import { installModel } from '../storage/install-model';
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
  const retryControllers = useRef(new Map<string, AbortController>());
  const [records, setRecords] = useState<InstalledModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmRemovalId, setConfirmRemovalId] = useState<string | null>(null);
  const [removingModelId, setRemovingModelId] = useState<string | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [retryingModelId, setRetryingModelId] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

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
      for (const controller of retryControllers.current.values()) controller.abort();
      retryControllers.current.clear();
      window.removeEventListener(INSTALLED_MODELS_CHANGED_EVENT, refresh);
    };
  }, []);

  async function retryDownload(record: InstalledModel) {
    const manifest = findCuratedModel(record.modelId);
    if (!manifest) {
      setRetryMessage('This model is no longer in the curated registry.');
      return;
    }

    const preflight = await runDownloadPreflight(manifest);
    if (preflight.status === 'blocked') {
      setRetryMessage(preflight.message);
      return;
    }

    const controller = new AbortController();
    const adapter = createRuntimeAdapter(manifest);
    retryControllers.current.set(record.modelId, controller);
    setRetryingModelId(record.modelId);
    setRetryMessage(preflight.status === 'warning' ? preflight.message : null);

    try {
      await installModel({
        adapter,
        manifest,
        onQueueChange: setRetryMessage,
        onRetry: (attempt) => setRetryMessage(`Retrying download · attempt ${attempt} of 3…`),
        signal: controller.signal,
      });
      setRetryMessage(`${manifest.name} is ready for offline use.`);
    } catch (error) {
      const cancelled =
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.message.toLowerCase().includes('abort'));
      setRetryMessage(
        cancelled
          ? 'Model download cancelled. Complete cached files can be reused on the next retry.'
          : error instanceof Error
            ? error.message
            : 'Model download failed.',
      );
    } finally {
      adapter.terminate();
      retryControllers.current.delete(record.modelId);
      setRetryingModelId(null);
    }
  }

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
                  {record.status === 'failed' ? (
                    <button
                      className="button button--quiet"
                      disabled={retryingModelId !== null}
                      onClick={() => void retryDownload(record)}
                      type="button"
                    >
                      Retry download
                    </button>
                  ) : retryingModelId === record.modelId ? (
                    <button
                      className="button button--quiet"
                      onClick={() => retryControllers.current.get(record.modelId)?.abort()}
                      type="button"
                    >
                      Cancel download
                    </button>
                  ) : (
                    <a className="button button--quiet" href="#/models">
                      Open Models
                    </a>
                  )}
                  <button
                    className="button button--danger"
                    disabled={removingModelId === record.modelId || retryingModelId !== null}
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
      {retryMessage ? (
        <p className="download-message" role="status">
          {retryMessage}
        </p>
      ) : null}
    </section>
  );
}
