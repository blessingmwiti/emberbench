import type { RuntimeCacheStatus } from '../runtimes/core/types';
import type { InstalledModel, ModelManifest } from './catalog/types';
import { transitionInstalledModel } from './installed-model';

export function reconcileInstalledModel(
  record: InstalledModel,
  manifest: ModelManifest,
  cache: RuntimeCacheStatus,
  now = new Date(),
): InstalledModel {
  const cachedFiles = cache.files.filter((file) => file.cached).length;
  const cacheUpdate = {
    cachedFiles,
    totalFiles: cache.files.length,
  };

  if (record.sourceRevision !== manifest.source.revision) {
    return transitionInstalledModel(
      record,
      'failed',
      {
        ...cacheUpdate,
        lastError: 'The curated model revision changed. Reinstall this model.',
      },
      now,
    );
  }

  if (record.status === 'removing') {
    return transitionInstalledModel(
      record,
      'failed',
      {
        ...cacheUpdate,
        lastError: cache.cached
          ? 'Model removal was interrupted. Remove it again or reinstall it.'
          : 'Model files were removed, but metadata cleanup was interrupted.',
      },
      now,
    );
  }

  if (!cache.cached) {
    return transitionInstalledModel(
      record,
      'failed',
      {
        ...cacheUpdate,
        lastError: 'Required cached files are missing. Reinstall the model to repair it.',
      },
      now,
    );
  }

  const verifying = transitionInstalledModel(record, 'verifying', cacheUpdate, now);
  return transitionInstalledModel(verifying, 'installed', cacheUpdate, now);
}
