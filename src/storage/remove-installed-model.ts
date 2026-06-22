import type { InstalledModel, ModelManifest } from '../models/catalog/types';
import { transitionInstalledModel } from '../models/installed-model';
import { createRuntimeAdapter } from '../runtimes/create-runtime-adapter';
import { installedModels } from './database';
import { modelDownloads } from './download-coordinator';

export async function removeInstalledModel(
  manifest: ModelManifest,
  installation: InstalledModel,
): Promise<void> {
  const lease = await modelDownloads.acquire(manifest.id);
  const adapter = createRuntimeAdapter(manifest);
  let removing = transitionInstalledModel(installation, 'removing');

  try {
    await installedModels.put(removing);
    const result = await adapter.deleteCache(manifest);
    if (result.filesCached !== result.filesDeleted) {
      throw new Error(
        `Deleted ${result.filesDeleted} of ${result.filesCached} cached model files.`,
      );
    }
    await installedModels.delete(manifest.id);
  } catch (error) {
    removing = transitionInstalledModel(removing, 'failed', {
      lastError: error instanceof Error ? error.message : 'Model deletion failed.',
    });
    await installedModels.put(removing).catch(() => {});
    throw error;
  } finally {
    adapter.terminate();
    lease.release();
  }
}
