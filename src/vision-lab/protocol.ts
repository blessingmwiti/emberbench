export const VISION_SPIKE_MODEL = 'Xenova/vit-gpt2-image-captioning';

export interface VisionWorkerConfig {
  device?: 'wasm' | 'webgpu';
  dtype?: 'fp16' | 'fp32' | 'q4' | 'q4f16' | 'q8';
  modelId?: string;
  revision?: string;
}

export type VisionWorkerRequest =
  | (VisionWorkerConfig & {
      cachedFilesOnly?: boolean;
      type: 'load';
    })
  | {
      image: Blob;
      requestId: string;
      type: 'caption';
    }
  | {
      type: 'unload';
    }
  | (VisionWorkerConfig & {
      type: 'inspect-cache';
    })
  | (VisionWorkerConfig & {
      type: 'delete-cache';
    });

export type VisionWorkerEvent =
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
      caption: string;
      durationMs: number;
      requestId: string;
      type: 'result';
    }
  | {
      message: string;
      requestId?: string;
      type: 'error';
    }
  | {
      type: 'unloaded';
    }
  | {
      cached: boolean;
      files: Array<{ cached: boolean; file: string }>;
      type: 'cache-status';
    }
  | {
      filesCached: number;
      filesDeleted: number;
      type: 'cache-deleted';
    };
