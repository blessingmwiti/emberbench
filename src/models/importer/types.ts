export type CompatibilityOutcome = 'ready' | 'conversion-required' | 'unsupported';

export interface HuggingFaceSibling {
  rfilename: string;
  size?: number;
}

export interface HuggingFaceModelInfo {
  config?: {
    architectures?: string[];
    auto_map?: Record<string, string>;
    model_type?: string;
  };
  disabled?: boolean;
  gated?: boolean | string;
  id: string;
  library_name?: string;
  pipeline_tag?: string;
  private?: boolean;
  sha?: string;
  siblings?: HuggingFaceSibling[];
  tags?: string[];
}

export interface CompatibilityReport {
  architecture: string | null;
  details: string[];
  files: {
    config: boolean;
    onnx: number;
    processors: number;
    quantizedOnnx: number;
    tokenizers: number;
  };
  gated: boolean;
  library: string | null;
  modelId: string;
  outcome: CompatibilityOutcome;
  pipelineTag: string | null;
  pinnedRevision: string | null;
  recommendation: {
    dtype: DataType;
    files: string[];
    sizeBytes: number;
  } | null;
  reasons: string[];
  sizes: {
    onnxBytes: number;
    quantizedOnnxBytes: number;
    repositoryBytes: number;
  };
  sourceUrl: string;
}
import type { DataType } from '@huggingface/transformers';
