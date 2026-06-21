import type { DataType } from '@huggingface/transformers';

export interface RuntimeProbeRequest {
  dtype: DataType;
  modelId: string;
  revision: string;
  task: string;
  type: 'probe';
}

export type RuntimeProbeEvent =
  | {
      data: Record<string, unknown>;
      type: 'progress';
    }
  | {
      durationMs: number;
      type: 'ready';
    }
  | {
      message: string;
      type: 'error';
    };
