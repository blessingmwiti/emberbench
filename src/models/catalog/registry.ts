import { curatedModels } from './manifests';
import type { DeviceTier, ModelCapability, ModelManifest, WorkspaceId } from './types';

export interface ModelCatalogFilter {
  capability?: ModelCapability;
  maximumDeviceTier?: DeviceTier;
  workspace?: WorkspaceId;
}

const DEVICE_TIER_ORDER: Record<DeviceTier, number> = {
  basic: 0,
  standard: 1,
  performance: 2,
};

export function getCuratedModels(): readonly ModelManifest[] {
  return curatedModels;
}

export function findCuratedModel(id: string): ModelManifest | null {
  return curatedModels.find((model) => model.id === id) ?? null;
}

export function filterCuratedModels(filter: ModelCatalogFilter): ModelManifest[] {
  return curatedModels.filter((model) => {
    if (filter.capability && !model.capabilities.includes(filter.capability)) {
      return false;
    }
    if (filter.workspace && !model.workspaces.includes(filter.workspace)) {
      return false;
    }
    if (
      filter.maximumDeviceTier &&
      DEVICE_TIER_ORDER[model.requirements.deviceTier] > DEVICE_TIER_ORDER[filter.maximumDeviceTier]
    ) {
      return false;
    }
    return true;
  });
}

export function getModelDownloadSize(model: ModelManifest): number {
  return model.artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0);
}
