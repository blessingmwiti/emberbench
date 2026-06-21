export const TEXT_SPIKE_MODEL = 'onnx-community/SmolLM2-135M-ONNX';

export interface ModelCacheFile {
  cached: boolean;
  file: string;
}

export type TextModelWorkerRequest =
  | {
      cachedFilesOnly?: boolean;
      type: 'load';
    }
  | {
      maxNewTokens: number;
      prompt: string;
      requestId: string;
      type: 'generate';
    }
  | {
      type: 'cancel';
    }
  | {
      type: 'inspect-cache';
    }
  | {
      type: 'unload';
    };

export type TextModelWorkerEvent =
  | {
      cached: boolean;
      files: ModelCacheFile[];
      type: 'cache-status';
    }
  | {
      data: Record<string, unknown>;
      type: 'progress';
    }
  | {
      loadTimeMs: number;
      model: string;
      type: 'ready';
    }
  | {
      requestId: string;
      text: string;
      type: 'token';
    }
  | {
      durationMs: number;
      firstTokenMs: number | null;
      requestId: string;
      tokenCount: number;
      type: 'complete';
    }
  | {
      requestId: string;
      type: 'cancelled';
    }
  | {
      message: string;
      requestId?: string;
      type: 'error';
    }
  | {
      type: 'unloaded';
    };
