import type { DeviceTier } from '../models/catalog/types';

export type DiagnosticStatus = 'idle' | 'running' | 'ready' | 'unsupported' | 'error';

export interface BrowserDiagnostic {
  browser: string;
  platform: string;
}

export interface RuntimeDiagnostic {
  supportedPaths: string[];
  wasm: boolean;
  webGpu: boolean;
}

export interface StorageDiagnostic {
  available: boolean;
  persisted: boolean | null;
  quotaBytes: number | null;
  usageBytes: number | null;
}

export interface WebGpuDiagnostic {
  adapterInfo: Record<string, string>;
  error: string | null;
  featureCount: number;
  features: string[];
  limits: {
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxTextureDimension2D: number;
  } | null;
  status: DiagnosticStatus;
}

export interface DeviceDiagnostic {
  browser: BrowserDiagnostic;
  checkedAt: string;
  online: boolean;
  runtime: RuntimeDiagnostic;
  secureContext: boolean;
  storage: StorageDiagnostic;
  webGpu: WebGpuDiagnostic;
}

export interface DeviceTierRecommendation {
  reason: string;
  tier: DeviceTier | 'unsupported';
}
