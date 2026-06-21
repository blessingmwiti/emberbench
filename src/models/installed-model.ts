import type { InstalledModel, InstalledModelStatus, ModelManifest } from './catalog/types';

const transitions: Record<InstalledModelStatus, readonly InstalledModelStatus[]> = {
  downloading: ['verifying', 'failed', 'removing'],
  verifying: ['installed', 'failed', 'removing'],
  installed: ['downloading', 'verifying', 'failed', 'removing'],
  failed: ['downloading', 'verifying', 'removing'],
  removing: ['failed'],
};

export interface InstalledModelUpdate {
  cachedFiles?: number;
  lastError?: string;
  totalFiles?: number;
}

export function createInstalledModel(
  manifest: ModelManifest,
  status: InstalledModelStatus = 'downloading',
  now = new Date(),
): InstalledModel {
  const timestamp = now.toISOString();
  return {
    cachedFiles: 0,
    createdAt: timestamp,
    expectedBytes: manifest.artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0),
    modelId: manifest.id,
    schemaVersion: 1,
    sourceModelId: manifest.source.modelId,
    sourceRevision: manifest.source.revision,
    status,
    totalFiles: 0,
    updatedAt: timestamp,
  };
}

export function transitionInstalledModel(
  model: InstalledModel,
  status: InstalledModelStatus,
  update: InstalledModelUpdate = {},
  now = new Date(),
): InstalledModel {
  if (model.status !== status && !transitions[model.status].includes(status)) {
    throw new Error(`Cannot transition an installed model from ${model.status} to ${status}.`);
  }

  const updatedAt = now.toISOString();
  const next: InstalledModel = {
    ...model,
    ...update,
    status,
    updatedAt,
  };

  if (status === 'installed') {
    if (next.totalFiles === 0 || next.cachedFiles !== next.totalFiles) {
      throw new Error('A model cannot be marked installed until every required file is cached.');
    }
    next.installedAt = model.installedAt ?? updatedAt;
    delete next.lastError;
  } else if (status !== 'failed') {
    delete next.lastError;
  }

  return next;
}

export function parseInstalledModel(value: unknown): InstalledModel | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const model = value as Partial<InstalledModel>;
  if (
    model.schemaVersion !== 1 ||
    typeof model.modelId !== 'string' ||
    typeof model.sourceModelId !== 'string' ||
    typeof model.sourceRevision !== 'string' ||
    typeof model.expectedBytes !== 'number' ||
    !Number.isFinite(model.expectedBytes) ||
    model.expectedBytes < 0 ||
    typeof model.cachedFiles !== 'number' ||
    !Number.isInteger(model.cachedFiles) ||
    model.cachedFiles < 0 ||
    typeof model.totalFiles !== 'number' ||
    !Number.isInteger(model.totalFiles) ||
    model.totalFiles < model.cachedFiles ||
    typeof model.createdAt !== 'string' ||
    Number.isNaN(Date.parse(model.createdAt)) ||
    typeof model.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(model.updatedAt)) ||
    !model.status ||
    !Object.prototype.hasOwnProperty.call(transitions, model.status) ||
    (model.installedAt !== undefined &&
      (typeof model.installedAt !== 'string' || Number.isNaN(Date.parse(model.installedAt)))) ||
    (model.lastError !== undefined && typeof model.lastError !== 'string') ||
    (model.status === 'installed' &&
      (model.totalFiles === 0 || model.cachedFiles !== model.totalFiles))
  ) {
    return null;
  }

  return model as InstalledModel;
}
