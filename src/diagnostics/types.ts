export type DiagnosticStatus = 'idle' | 'running' | 'ready' | 'unsupported' | 'error';

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
  limits: {
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxTextureDimension2D: number;
  } | null;
  status: DiagnosticStatus;
}

export interface DeviceDiagnostic {
  checkedAt: string;
  online: boolean;
  secureContext: boolean;
  storage: StorageDiagnostic;
  webGpu: WebGpuDiagnostic;
}
