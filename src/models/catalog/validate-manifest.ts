import type {
  DeviceTier,
  ModelArtifact,
  ModelCapability,
  ModelManifest,
  ModelPrecision,
  ModelStatus,
  WorkspaceId,
} from './types';

const CAPABILITIES = new Set<ModelCapability>([
  'chat',
  'code',
  'image-captioning',
  'ocr',
  'summarization',
  'writing',
]);
const PRECISIONS = new Set<ModelPrecision>(['fp16', 'fp32', 'q4', 'q4f16', 'q8']);
const DEVICE_TIERS = new Set<DeviceTier>(['basic', 'standard', 'performance']);
const STATUSES = new Set<ModelStatus>(['experimental', 'supported', 'recommended']);
const WORKSPACES = new Set<WorkspaceId>(['assistant', 'code', 'vision']);
const ARTIFACT_ROLES = new Set<ModelArtifact['role']>([
  'config',
  'model',
  'processor',
  'tokenizer',
]);

export class ModelManifestValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ModelManifestValidationError(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireStringArray<T extends string>(
  value: unknown,
  field: string,
  accepted: Set<T>,
): T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ModelManifestValidationError(`${field} must contain at least one value.`);
  }

  return value.map((item) => {
    if (typeof item !== 'string' || !accepted.has(item as T)) {
      throw new ModelManifestValidationError(`${field} contains an unsupported value.`);
    }
    return item as T;
  });
}

function validateArtifact(value: unknown, index: number): ModelArtifact {
  if (!isRecord(value)) {
    throw new ModelManifestValidationError(`artifacts[${index}] must be an object.`);
  }

  const precision = requireString(value.precision, `artifacts[${index}].precision`);
  const role = requireString(value.role, `artifacts[${index}].role`);
  if (!PRECISIONS.has(precision as ModelPrecision)) {
    throw new ModelManifestValidationError(`artifacts[${index}].precision is unsupported.`);
  }
  if (!ARTIFACT_ROLES.has(role as ModelArtifact['role'])) {
    throw new ModelManifestValidationError(`artifacts[${index}].role is unsupported.`);
  }
  if (
    typeof value.sizeBytes !== 'number' ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 0
  ) {
    throw new ModelManifestValidationError(
      `artifacts[${index}].sizeBytes must be a non-negative integer.`,
    );
  }

  return {
    path: requireString(value.path, `artifacts[${index}].path`),
    precision: precision as ModelPrecision,
    role: role as ModelArtifact['role'],
    sizeBytes: value.sizeBytes,
  };
}

export function validateModelManifest(value: unknown): ModelManifest {
  if (!isRecord(value)) {
    throw new ModelManifestValidationError('Model manifest must be an object.');
  }
  if (value.schemaVersion !== 1) {
    throw new ModelManifestValidationError('Unsupported model manifest schema version.');
  }
  if (!isRecord(value.source)) {
    throw new ModelManifestValidationError('source must be an object.');
  }
  if (!isRecord(value.license)) {
    throw new ModelManifestValidationError('license must be an object.');
  }
  if (!isRecord(value.requirements)) {
    throw new ModelManifestValidationError('requirements must be an object.');
  }
  if (!Array.isArray(value.artifacts) || value.artifacts.length === 0) {
    throw new ModelManifestValidationError('artifacts must contain at least one file.');
  }

  const deviceTier = requireString(value.requirements.deviceTier, 'requirements.deviceTier');
  const status = requireString(value.status, 'status');
  if (!DEVICE_TIERS.has(deviceTier as DeviceTier)) {
    throw new ModelManifestValidationError('requirements.deviceTier is unsupported.');
  }
  if (!STATUSES.has(status as ModelStatus)) {
    throw new ModelManifestValidationError('status is unsupported.');
  }
  if (value.source.provider !== 'huggingface') {
    throw new ModelManifestValidationError('Only Hugging Face sources are currently supported.');
  }
  if (value.requirements.runtime !== 'transformers-js') {
    throw new ModelManifestValidationError(
      'Only Transformers.js manifests are currently supported.',
    );
  }

  return {
    artifacts: value.artifacts.map(validateArtifact),
    capabilities: requireStringArray(value.capabilities, 'capabilities', CAPABILITIES),
    description: requireString(value.description, 'description'),
    id: requireString(value.id, 'id'),
    license: {
      id: requireString(value.license.id, 'license.id'),
      sourceUrl: requireString(value.license.sourceUrl, 'license.sourceUrl'),
    },
    name: requireString(value.name, 'name'),
    requirements: {
      deviceTier: deviceTier as DeviceTier,
      runtime: 'transformers-js',
      task: requireString(value.requirements.task, 'requirements.task'),
    },
    schemaVersion: 1,
    source: {
      baseModelId: requireString(value.source.baseModelId, 'source.baseModelId'),
      modelId: requireString(value.source.modelId, 'source.modelId'),
      provider: 'huggingface',
      revision: requireString(value.source.revision, 'source.revision'),
    },
    status: status as ModelStatus,
    workspaces: requireStringArray(value.workspaces, 'workspaces', WORKSPACES),
  };
}
