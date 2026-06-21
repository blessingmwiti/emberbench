export const VISION_SPIKE_MODEL = 'Xenova/vit-gpt2-image-captioning';

export type VisionWorkerRequest =
  | {
      type: 'load';
    }
  | {
      image: Blob;
      requestId: string;
      type: 'caption';
    }
  | {
      type: 'unload';
    };

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
    };
