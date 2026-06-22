import type { InstalledModel, ModelManifest } from './types';

export type ModelLibraryFilter = 'all' | 'attention' | 'installed';

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
