import type { ModelManifest } from '../models/catalog/types';

const MIB = 1024 * 1024;
const LARGE_DOWNLOAD_BYTES = 500 * MIB;
const WORKING_OVERHEAD_BYTES = 64 * MIB;
const DOWNLOAD_HEADROOM = 1.15;

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
}

export interface DownloadPreflight {
  availableBytes: number | null;
  message: string;
  requiredBytes: number;
  status: 'ok' | 'warning' | 'blocked' | 'unknown';
}

export async function runDownloadPreflight(
  manifest: ModelManifest,
  storage: Pick<StorageManager, 'estimate'> | undefined = navigator.storage,
  connection: NetworkInformationLike | undefined = (
    navigator as Navigator & { connection?: NetworkInformationLike }
  ).connection,
): Promise<DownloadPreflight> {
  const artifactBytes = manifest.artifacts.reduce(
    (total, artifact) => total + artifact.sizeBytes,
    0,
  );
  const requiredBytes = Math.ceil(artifactBytes * DOWNLOAD_HEADROOM + WORKING_OVERHEAD_BYTES);

  let availableBytes: number | null = null;
  try {
    const estimate = await storage?.estimate();
    if (estimate?.quota !== undefined && estimate.usage !== undefined) {
      availableBytes = Math.max(0, estimate.quota - estimate.usage);
    }
  } catch {
    // A missing estimate is reported as unknown rather than treated as zero storage.
  }

  if (availableBytes !== null && availableBytes < requiredBytes) {
    return {
      availableBytes,
      message: 'There is not enough browser storage for this model and its working overhead.',
      requiredBytes,
      status: 'blocked',
    };
  }

  if (
    connection?.saveData ||
    connection?.effectiveType === 'slow-2g' ||
    connection?.effectiveType === '2g'
  ) {
    return {
      availableBytes,
      message: 'Your browser reports a reduced-data or slow connection for this model download.',
      requiredBytes,
      status: 'warning',
    };
  }

  if (artifactBytes >= LARGE_DOWNLOAD_BYTES) {
    return {
      availableBytes,
      message: 'This is a large model download. Keep this tab open until verification finishes.',
      requiredBytes,
      status: 'warning',
    };
  }

  if (availableBytes === null) {
    return {
      availableBytes,
      message: 'Browser storage availability could not be estimated.',
      requiredBytes,
      status: 'unknown',
    };
  }

  return {
    availableBytes,
    message: 'Browser storage appears sufficient for this model.',
    requiredBytes,
    status: 'ok',
  };
}
