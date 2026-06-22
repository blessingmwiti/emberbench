export type TransformersRuntimeDevice = 'wasm' | 'webgpu';

export function discoverTransformersRuntimeDevice(): TransformersRuntimeDevice {
  return typeof navigator !== 'undefined' &&
    typeof navigator.gpu !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext
    ? 'webgpu'
    : 'wasm';
}
