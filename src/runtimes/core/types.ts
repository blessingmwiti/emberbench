import type { ModelManifest } from '../../models/catalog/types';
import type { CompatibilityReport } from '../../models/importer/types';

export type RuntimeSessionState =
  | 'loading'
  | 'ready'
  | 'running'
  | 'cancelling'
  | 'unloaded'
  | 'error';

export interface RuntimeSession {
  createdAt: string;
  id: string;
  modelId: string;
  state: RuntimeSessionState;
}

export type ModelInput =
  | {
      kind: 'text';
      text: string;
    }
  | {
      data: ArrayBuffer;
      kind: 'image';
      mimeType: string;
    }
  | {
      data: ArrayBuffer;
      kind: 'audio';
      mimeType: string;
    };

export interface RuntimeRunOptions {
  maxNewTokens?: number;
  requestId: string;
}

export type RuntimeEvent =
  | {
      loadedBytes?: number;
      phase: 'download' | 'initialize' | 'run';
      progress: number;
      totalBytes?: number;
      type: 'progress';
    }
  | {
      requestId: string;
      text: string;
      type: 'token';
    }
  | {
      data: Record<string, unknown>;
      requestId: string;
      type: 'result';
    }
  | {
      code: string;
      message: string;
      type: 'warning';
    }
  | {
      durationMs: number;
      requestId: string;
      type: 'complete';
    };

export interface RuntimeLoadOptions {
  cachedFilesOnly?: boolean;
}

export interface RuntimeDownloadOptions {
  signal?: AbortSignal;
}

export interface ModelRuntimeAdapter {
  readonly id: string;
  readonly session: RuntimeSession | null;
  abort(requestId?: string): Promise<void>;
  download(manifest: ModelManifest, options?: RuntimeDownloadOptions): AsyncIterable<RuntimeEvent>;
  inspect(manifest: ModelManifest): Promise<CompatibilityReport | null>;
  load(manifest: ModelManifest, options?: RuntimeLoadOptions): Promise<RuntimeSession>;
  run(input: ModelInput, options: RuntimeRunOptions): AsyncIterable<RuntimeEvent>;
  unload(): Promise<void>;
}
