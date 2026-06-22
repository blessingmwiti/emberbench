import type { ModelManifest } from '../../models/catalog/types';

export interface ArtifactProgress {
  artifact?: string;
  artifactProgress?: number;
  loadedBytes: number;
  progress: number;
  totalBytes: number;
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value));
}

function readArtifactProgress(data: Record<string, unknown>) {
  if (
    typeof data.loaded === 'number' &&
    Number.isFinite(data.loaded) &&
    typeof data.total === 'number' &&
    Number.isFinite(data.total) &&
    data.total > 0
  ) {
    return clampProgress(data.loaded / data.total);
  }
  return typeof data.progress === 'number' && Number.isFinite(data.progress)
    ? clampProgress(data.progress / 100)
    : 0;
}

export class ArtifactProgressTracker {
  private readonly artifacts: ModelManifest['artifacts'];
  private readonly progressByPath = new Map<string, number>();
  readonly totalBytes: number;

  constructor(manifest: ModelManifest) {
    this.artifacts = manifest.artifacts;
    this.totalBytes = this.artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0);
  }

  update(data: Record<string, unknown>): ArtifactProgress {
    const file = typeof data.file === 'string' ? data.file : undefined;
    const artifact = file
      ? this.artifacts.find(
          (candidate) => file === candidate.path || file.endsWith(`/${candidate.path}`),
        )
      : undefined;
    const artifactProgress = readArtifactProgress(data);

    if (artifact) {
      const previous = this.progressByPath.get(artifact.path) ?? 0;
      this.progressByPath.set(artifact.path, Math.max(previous, artifactProgress));
    }

    const loadedBytes = Math.round(
      this.artifacts.reduce(
        (total, candidate) =>
          total + candidate.sizeBytes * (this.progressByPath.get(candidate.path) ?? 0),
        0,
      ),
    );

    return {
      ...(artifact
        ? {
            artifact: artifact.path,
            artifactProgress: this.progressByPath.get(artifact.path) ?? artifactProgress,
          }
        : {}),
      loadedBytes,
      progress: this.totalBytes > 0 ? loadedBytes / this.totalBytes : 0,
      totalBytes: this.totalBytes,
    };
  }
}
