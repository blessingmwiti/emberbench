export type TransformersRuntimeDevice = 'wasm' | 'webgpu';
export type TransformersRuntimePreference = 'auto' | TransformersRuntimeDevice;

export function discoverTransformersRuntimeDevice(): TransformersRuntimeDevice {
  return typeof navigator !== 'undefined' &&
    typeof navigator.gpu !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext
    ? 'webgpu'
    : 'wasm';
}

export function resolveTransformersRuntimeDevice(
  preference: TransformersRuntimePreference,
): TransformersRuntimeDevice {
  if (preference === 'wasm') return 'wasm';
  return discoverTransformersRuntimeDevice();
}
