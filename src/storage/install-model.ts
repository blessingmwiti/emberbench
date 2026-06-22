import type { InstalledModel, InstalledModelStatus, ModelManifest } from '../models/catalog/types';
import { createInstalledModel, transitionInstalledModel } from '../models/installed-model';
import type {
  ModelRuntimeAdapter,
  RuntimeCacheStatus,
  RuntimeEvent,
  RuntimeSession,
} from '../runtimes/core/types';
import { installedModels } from './database';
import { modelDownloads } from './download-coordinator';
import { withBoundedRetry } from './retry';

export interface InstallModelOptions {
  adapter: ModelRuntimeAdapter;
  cachedFilesOnly?: boolean;
  manifest: ModelManifest;
  onProgress?: (event: Extract<RuntimeEvent, { type: 'progress' }>) => void;
  onQueueChange?: (message: string | null) => void;
  onRecord?: (record: InstalledModel) => void;
  onRetry?: (attempt: number) => void;
  signal?: AbortSignal;
}

export interface InstallModelResult {
  cache: RuntimeCacheStatus;
  record: InstalledModel;
  session: RuntimeSession;
}

function beginRecord(
  manifest: ModelManifest,
  existing: InstalledModel | null,
  status: InstalledModelStatus,
) {
  if (!existing || existing.sourceRevision !== manifest.source.revision) {
    return createInstalledModel(manifest, status);
  }
  try {
    return transitionInstalledModel(existing, status);
  } catch {
    return createInstalledModel(manifest, status);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Model installation failed.';
}

export async function installModel(options: InstallModelOptions): Promise<InstallModelResult> {
  const { adapter, manifest } = options;
  const cachedFilesOnly = options.cachedFilesOnly ?? false;
  const existing = await installedModels.get(manifest.id).catch(() => null);
  let record = beginRecord(manifest, existing, cachedFilesOnly ? 'verifying' : 'downloading');
  let lease: Awaited<ReturnType<typeof modelDownloads.acquire>> | null = null;
  let lastPersistedArtifact = record.downloadArtifact;
  let lastPersistedProgress = record.downloadProgress ?? 0;

  const persist = async () => {
    options.onRecord?.(record);
    await installedModels.put(record);
  };

  await persist();

  try {
    if (!cachedFilesOnly) {
      options.onQueueChange?.('Waiting for the model download slot…');
      lease = await modelDownloads.acquire(manifest.id, options.signal);
      options.onQueueChange?.(null);

      await withBoundedRetry(
        async () => {
          for await (const event of adapter.download(manifest, { signal: options.signal })) {
            if (event.type !== 'progress') continue;
            options.onProgress?.(event);
            if (
              event.artifact !== lastPersistedArtifact ||
              Math.abs(event.progress - lastPersistedProgress) >= 0.05
            ) {
              record = transitionInstalledModel(record, 'downloading', {
                downloadArtifact: event.artifact,
                downloadArtifactProgress: event.artifactProgress,
                downloadLoadedBytes: event.loadedBytes,
                downloadProgress: event.progress,
              });
              lastPersistedArtifact = event.artifact;
              lastPersistedProgress = event.progress;
              await persist();
            }
          }
        },
        {
          onRetry: async (attempt) => {
            record = transitionInstalledModel(record, 'downloading', {
              downloadAttempt: attempt,
              downloadArtifact: undefined,
              downloadArtifactProgress: undefined,
              downloadLoadedBytes: 0,
              downloadProgress: 0,
            });
            lastPersistedProgress = 0;
            await persist();
            options.onRetry?.(attempt);
          },
          signal: options.signal,
        },
      );

      record = transitionInstalledModel(record, 'verifying');
      await persist();
    }

    const session = await adapter.load(manifest, { cachedFilesOnly });
    const cache = await adapter.inspectCache(manifest);
    const cachedFiles = cache.files.filter((file) => file.cached).length;
    record = transitionInstalledModel(record, cache.cached ? 'installed' : 'failed', {
      cachedFiles,
      lastError: cache.cached ? undefined : 'Cache verification found missing model files.',
      totalFiles: cache.files.length,
    });
    await persist();

    if (!cache.cached) {
      throw new Error(record.lastError);
    }

    options.onProgress?.({ phase: 'initialize', progress: 1, type: 'progress' });
    return { cache, record, session };
  } catch (error) {
    if (record.status !== 'failed') {
      try {
        record = transitionInstalledModel(record, 'failed', {
          lastError: errorMessage(error),
        });
        await persist();
      } catch {
        // Preserve the original installation error.
      }
    }
    throw error;
  } finally {
    options.onQueueChange?.(null);
    lease?.release();
  }
}
