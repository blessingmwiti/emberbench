import { describe, expect, it } from 'vitest';

import { findCuratedModel } from '../models/catalog/registry';
import type { DeviceDiagnostic } from './types';
import { compareModelWithDevice, recommendDeviceTier } from './recommend-device-tier';

function diagnostic(
  overrides: Partial<DeviceDiagnostic['webGpu']['limits']> = {},
): DeviceDiagnostic {
  return {
    browser: { browser: 'Chromium', platform: 'test' },
    checkedAt: '2026-01-01T00:00:00.000Z',
    online: true,
    runtime: {
      supportedPaths: ['Transformers.js / WebGPU', 'Transformers.js / WebAssembly fallback'],
      wasm: true,
      webGpu: true,
    },
    secureContext: true,
    storage: {
      available: true,
      persisted: false,
      quotaBytes: 10 * 1024 ** 3,
      usageBytes: 0,
    },
    webGpu: {
      adapterInfo: {},
      error: null,
      featureCount: 1,
      features: ['shader-f16'],
      limits: {
        maxBufferSize: 256 * 1024 ** 2,
        maxStorageBufferBindingSize: 128 * 1024 ** 2,
        maxTextureDimension2D: 8192,
        ...overrides,
      },
      status: 'ready',
    },
  };
}

describe('device tier recommendations', () => {
  it('uses conservative browser-exposed limits', () => {
    expect(recommendDeviceTier(diagnostic())?.tier).toBe('basic');
    expect(
      recommendDeviceTier(
        diagnostic({
          maxBufferSize: 512 * 1024 ** 2,
          maxStorageBufferBindingSize: 256 * 1024 ** 2,
        }),
      )?.tier,
    ).toBe('standard');
  });

  it('compares each manifest with tier and free storage', () => {
    const vision = findCuratedModel('vit-gpt2-captioning-q8');
    if (!vision) throw new Error('Vision fixture is missing.');

    const current = diagnostic();
    const tier = recommendDeviceTier(current);
    expect(compareModelWithDevice(vision, current, tier)).toBe('exceeds-tier');

    current.storage.quotaBytes = 100;
    expect(compareModelWithDevice(vision, current, tier)).toBe('insufficient-storage');
  });

  it('recommends compact models through WebAssembly when WebGPU is unavailable', () => {
    const current = diagnostic();
    current.runtime.webGpu = false;
    current.webGpu.limits = null;
    current.webGpu.status = 'unsupported';

    const fallback = recommendDeviceTier(current);
    expect(fallback?.tier).toBe('basic');
    expect(fallback?.reason).toContain('WebAssembly worker');

    current.runtime.wasm = false;
    expect(recommendDeviceTier(current)?.tier).toBe('unsupported');
  });
});
