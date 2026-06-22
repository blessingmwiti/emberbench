import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  discoverTransformersRuntimeDevice,
  resolveTransformersRuntimeDevice,
} from './runtime-device';

describe('Transformers.js runtime discovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('selects WebGPU only when it is exposed in a secure context', () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: {} });
    expect(discoverTransformersRuntimeDevice()).toBe('webgpu');
  });

  it('falls back to WebAssembly without secure WebGPU', () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: {} });
    expect(discoverTransformersRuntimeDevice()).toBe('wasm');

    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined });
    expect(discoverTransformersRuntimeDevice()).toBe('wasm');
  });

  it('allows WebAssembly to be forced on a WebGPU-capable browser', () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: {} });
    expect(resolveTransformersRuntimeDevice('auto')).toBe('webgpu');
    expect(resolveTransformersRuntimeDevice('webgpu')).toBe('webgpu');
    expect(resolveTransformersRuntimeDevice('wasm')).toBe('wasm');
  });
});
