import { describe, expect, it } from 'vitest';

import { DEFAULT_APP_SETTINGS, parseAppSettings, parseBenchmarkSummary } from './database';

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

describe('benchmark summary schema', () => {
  const benchmark = {
    createdAt: '2026-06-22T06:00:00.000Z',
    durationMs: 48_710,
    firstTokenMs: 2_540,
    id: 'benchmark-1',
    loadTimeMs: 7_540,
    modelId: 'smollm2-135m-q4',
    outputUnits: 64,
    runtimeDevice: 'wasm',
    schemaVersion: 1,
    task: 'text-generation',
  } as const;

  it('accepts a versioned local benchmark', () => {
    expect(parseBenchmarkSummary(benchmark)).toEqual(benchmark);
  });

  it('rejects malformed timing and runtime values', () => {
    expect(parseBenchmarkSummary({ ...benchmark, durationMs: -1 })).toBeNull();
    expect(parseBenchmarkSummary({ ...benchmark, runtimeDevice: 'cloud' })).toBeNull();
  });
});
