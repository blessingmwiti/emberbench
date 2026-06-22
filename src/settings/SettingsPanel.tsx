import { useEffect, useState } from 'react';

import {
  appSettings,
  DEFAULT_APP_SETTINGS,
  SETTINGS_CHANGED_EVENT,
  type AppSettings,
} from '../storage/database';
import { clearLocalData } from '../storage/clear-local-data';

export function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const refresh = () => {
      void appSettings
        .get()
        .then(setSettings)
        .catch(() => {
          setMessage('Application settings could not be loaded.');
        });
    };
    refresh();
    window.addEventListener(SETTINGS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, refresh);
  }, []);

  async function updateSettings(update: Partial<AppSettings>) {
    const next = { ...settings, ...update };
    setSettings(next);
    setSaving(true);
    setMessage(null);
    try {
      await appSettings.put(next);
      setMessage('Settings saved locally.');
    } catch {
      setMessage('Settings could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function resetLocalData() {
    setResetting(true);
    setMessage(null);
    try {
      const result = await clearLocalData();
      setSettings(DEFAULT_APP_SETTINGS);
      setConfirmReset(false);
      setMessage(
        `Local data cleared. Removed ${result.filesDeleted} cached model files across ${result.modelsChecked} model checks.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Local data reset failed.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <section className="section settings-section" id="settings">
      <div className="section-heading">
        <div>
          <p className="kicker">LOCAL SETTINGS</p>
          <h2>Defaults that stay on this device.</h2>
        </div>
        <p>
          Emberbench stores these preferences in this browser. Reset removes cached model files,
          installation records, and settings; it keeps the offline app shell so Emberbench can still
          open.
        </p>
      </div>

      <div className="settings-grid">
        <div className="settings-card">
          <label>
            <input
              checked={settings.defaultCachedFilesOnly}
              disabled={saving}
              onChange={(event) =>
                void updateSettings({ defaultCachedFilesOnly: event.target.checked })
              }
              type="checkbox"
            />
            <span>
              Prefer cached files only
              <small>New model sessions start with remote model requests blocked.</small>
            </span>
          </label>
          <label>
            <input
              checked={settings.confirmLargeDownloads}
              disabled={saving}
              onChange={(event) =>
                void updateSettings({ confirmLargeDownloads: event.target.checked })
              }
              type="checkbox"
            />
            <span>
              Confirm large downloads
              <small>Ask before downloads flagged as large or reduced-data.</small>
            </span>
          </label>
          <label className="settings-runtime">
            <span>
              Runtime preference
              <small>
                Auto prefers WebGPU and falls back to WebAssembly. Force WebAssembly for
                compatibility testing or GPU troubleshooting.
              </small>
            </span>
            <select
              aria-label="Runtime preference"
              disabled={saving}
              onChange={(event) =>
                void updateSettings({
                  runtimePreference: event.target.value as AppSettings['runtimePreference'],
                })
              }
              value={settings.runtimePreference}
            >
              <option value="auto">Auto (recommended)</option>
              <option value="webgpu">Prefer WebGPU</option>
              <option value="wasm">Force WebAssembly</option>
            </select>
          </label>
        </div>

        <div className="settings-card settings-card--danger">
          <h3>Erase local Emberbench data</h3>
          <p>This cannot be undone. Downloaded models will need to be installed again.</p>
          {confirmReset ? (
            <div className="settings-reset-confirmation" role="alert">
              <p>Remove all cached model files, install records, and saved settings now?</p>
              <div>
                <button
                  className="button button--danger"
                  disabled={resetting}
                  onClick={() => void resetLocalData()}
                  type="button"
                >
                  {resetting ? 'Erasing…' : 'Erase all local data'}
                </button>
                <button
                  className="button button--quiet"
                  disabled={resetting}
                  onClick={() => setConfirmReset(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className="button button--danger"
              onClick={() => setConfirmReset(true)}
              type="button"
            >
              Review reset
            </button>
          )}
        </div>
      </div>

      {message ? (
        <p className="storage-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
