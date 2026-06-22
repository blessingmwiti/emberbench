import { describe, expect, it } from 'vitest';

import { DEFAULT_APP_SETTINGS, parseAppSettings } from './database';

describe('application settings schema', () => {
  it('accepts the versioned default settings', () => {
    expect(parseAppSettings(DEFAULT_APP_SETTINGS)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('rejects incompatible or malformed settings', () => {
    expect(parseAppSettings({ ...DEFAULT_APP_SETTINGS, schemaVersion: 2 })).toBeNull();
    expect(parseAppSettings({ ...DEFAULT_APP_SETTINGS, defaultCachedFilesOnly: 'yes' })).toBeNull();
    expect(parseAppSettings({ ...DEFAULT_APP_SETTINGS, runtimePreference: 'gpu' })).toBeNull();
  });

  it('migrates settings saved before runtime preference existed', () => {
    const legacy: Partial<typeof DEFAULT_APP_SETTINGS> = { ...DEFAULT_APP_SETTINGS };
    delete legacy.runtimePreference;
    expect(parseAppSettings(legacy)?.runtimePreference).toBe('auto');
  });
});
