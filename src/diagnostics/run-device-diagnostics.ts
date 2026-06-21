import type { DeviceDiagnostic, StorageDiagnostic, WebGpuDiagnostic } from './types';

const unsupportedWebGpu = (error: string): WebGpuDiagnostic => ({
  adapterInfo: {},
  error,
  featureCount: 0,
  limits: null,
  status: 'unsupported',
});

async function inspectStorage(): Promise<StorageDiagnostic> {
  if (!navigator.storage) {
    return {
      available: false,
      persisted: null,
      quotaBytes: null,
      usageBytes: null,
    };
  }

  const [estimate, persisted] = await Promise.all([
    navigator.storage.estimate(),
    navigator.storage.persisted?.() ?? Promise.resolve(null),
  ]);

  return {
    available: true,
    persisted,
    quotaBytes: estimate.quota ?? null,
    usageBytes: estimate.usage ?? null,
  };
}

async function inspectWebGpu(): Promise<WebGpuDiagnostic> {
  if (!navigator.gpu) {
    return unsupportedWebGpu('This browser does not expose the WebGPU API.');
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    });

    if (!adapter) {
      return unsupportedWebGpu('No compatible GPU adapter was made available to this browser.');
    }

    const device = await adapter.requestDevice();
    const adapterInfo = adapter.info;

    const result: WebGpuDiagnostic = {
      adapterInfo: {
        architecture: adapterInfo.architecture || 'Not reported',
        description: adapterInfo.description || 'Not reported',
        device: adapterInfo.device || 'Not reported',
        vendor: adapterInfo.vendor || 'Not reported',
      },
      error: null,
      featureCount: device.features.size,
      limits: {
        maxBufferSize: device.limits.maxBufferSize,
        maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
        maxTextureDimension2D: device.limits.maxTextureDimension2D,
      },
      status: 'ready',
    };

    device.destroy();
    return result;
  } catch (error) {
    return {
      ...unsupportedWebGpu('WebGPU initialization failed.'),
      error: error instanceof Error ? error.message : 'WebGPU initialization failed.',
      status: 'error',
    };
  }
}

export async function runDeviceDiagnostics(): Promise<DeviceDiagnostic> {
  const [storage, webGpu] = await Promise.all([inspectStorage(), inspectWebGpu()]);

  return {
    checkedAt: new Date().toISOString(),
    online: navigator.onLine,
    secureContext: window.isSecureContext,
    storage,
    webGpu,
  };
}
