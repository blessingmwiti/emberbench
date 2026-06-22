import { describe, expect, it } from 'vitest';

import { DEFAULT_APP_SETTINGS, parseAppSettings } from './database';

describe('application settings schema', () => {
  it('accepts the versioned default settings', () => {
    expect(parseAppSettings(DEFAULT_APP_SETTINGS)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('rejects incompatible or malformed settings', () => {
    expect(parseAppSettings({ ...DEFAULT_APP_SETTINGS, schemaVersion: 2 })).toBeNull();
    expect(parseAppSettings({ ...DEFAULT_APP_SETTINGS, defaultCachedFilesOnly: 'yes' })).toBeNull();
  });
});
