import type { DeviceDiagnostic, StorageDiagnostic, WebGpuDiagnostic } from './types';

const unsupportedWebGpu = (error: string): WebGpuDiagnostic => ({
  adapterInfo: {},
  error,
  featureCount: 0,
  features: [],
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
      features: [...device.features].sort(),
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
  const wasm = typeof WebAssembly !== 'undefined';
  const supportedPaths = [
    ...(webGpu.status === 'ready' ? ['Transformers.js / WebGPU'] : []),
    ...(wasm ? ['WebAssembly available (fallback not wired)'] : []),
  ];

  return {
    browser: {
      browser: readBrowserName(navigator.userAgent),
      platform: navigator.platform || 'Not reported',
    },
    checkedAt: new Date().toISOString(),
    online: navigator.onLine,
    runtime: {
      supportedPaths,
      wasm,
      webGpu: webGpu.status === 'ready',
    },
    secureContext: window.isSecureContext,
    storage,
    webGpu,
  };
}

function readBrowserName(userAgent: string) {
  if (userAgent.includes('Edg/')) return 'Microsoft Edge';
  if (userAgent.includes('Chrome/')) return 'Chromium';
  if (userAgent.includes('Firefox/')) return 'Firefox';
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) return 'Safari';
  return 'Unrecognized browser';
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) {
    return null;
  }

  return navigator.storage.persist();
}
