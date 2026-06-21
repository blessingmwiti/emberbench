export type ModelCapability =
  | 'chat'
  | 'code'
  | 'image-captioning'
  | 'ocr'
  | 'summarization'
  | 'writing';

export type ModelPrecision = 'fp16' | 'fp32' | 'q4' | 'q4f16' | 'q8';
export type DeviceTier = 'basic' | 'standard' | 'performance';
export type ModelStatus = 'experimental' | 'supported' | 'recommended';
export type WorkspaceId = 'assistant' | 'code' | 'vision';

export interface ModelSource {
  baseModelId: string;
  modelId: string;
  provider: 'huggingface';
  revision: string;
}

export interface ModelArtifact {
  path: string;
  precision: ModelPrecision;
  role: 'config' | 'model' | 'processor' | 'tokenizer';
  sizeBytes: number;
}

export interface RuntimeRequirement {
  deviceTier: DeviceTier;
  runtime: 'transformers-js';
  task: string;
}

export interface ModelLicense {
  id: string;
  sourceUrl: string;
}

export interface ModelManifest {
  artifacts: ModelArtifact[];
  capabilities: ModelCapability[];
  description: string;
  id: string;
  license: ModelLicense;
  name: string;
  requirements: RuntimeRequirement;
  schemaVersion: 1;
  source: ModelSource;
  status: ModelStatus;
  workspaces: WorkspaceId[];
}
