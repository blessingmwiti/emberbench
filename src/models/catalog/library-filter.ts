import type { InstalledModel, ModelManifest } from './types';

export type ModelLibraryFilter = 'all' | 'attention' | 'installed';
export type ModelOfflineAvailability = 'available-offline' | 'partial' | 'online-only';

export interface ModelOfflineAvailabilityDetails {
  description: string;
  label: string;
  state: ModelOfflineAvailability;
}

export function getModelOfflineAvailability(
  model: ModelManifest,
  installation: InstalledModel | undefined,
): ModelOfflineAvailabilityDetails {
  if (!installation) {
    return {
      description: 'This model has not been cached in this browser yet.',
      label: 'Online only',
      state: 'online-only',
    };
  }

  if (installation.sourceRevision !== model.source.revision) {
    return {
      description: 'A local copy exists, but it does not match the pinned model revision.',
      label: 'Partial',
      state: 'partial',
    };
  }

  if (installation.status === 'installed') {
    return {
      description: 'Every required artifact for the pinned revision is cached locally.',
      label: 'Available offline',
      state: 'available-offline',
    };
  }

  return {
    description:
      installation.cachedFiles > 0
        ? `${installation.cachedFiles} of ${installation.totalFiles || 'the required'} files are cached locally.`
        : 'A local install record exists, but the model is not fully cached yet.',
    label: 'Partial',
    state: 'partial',
  };
}

export function matchesModelLibraryFilter(
  filter: ModelLibraryFilter,
  model: ModelManifest,
  installation: InstalledModel | undefined,
) {
  if (filter === 'all') return true;
  const revisionMatches = installation?.sourceRevision === model.source.revision;
  if (filter === 'installed') {
    return revisionMatches && installation?.status === 'installed';
  }
  return Boolean(installation && (!revisionMatches || installation.status === 'failed'));
}
