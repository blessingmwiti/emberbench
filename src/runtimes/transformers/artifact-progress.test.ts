import { describe, expect, it } from 'vitest';

import { findCuratedModel } from '../../models/catalog/registry';
import { ArtifactProgressTracker } from './artifact-progress';

function getManifest() {
  const manifest = findCuratedModel('smollm2-135m-q4');
  if (!manifest) throw new Error('Progress fixture manifest is missing.');
  return manifest;
}

describe('ArtifactProgressTracker', () => {
  it('weights per-file progress by declared artifact size', () => {
    const manifest = getManifest();
    const tracker = new ArtifactProgressTracker(manifest);
    const graph = manifest.artifacts[0]!;
    const weights = tracker.update({
      file: graph.path,
      progress: 100,
    });

    expect(weights.artifact).toBe(graph.path);
    expect(weights.artifactProgress).toBe(1);
    expect(weights.loadedBytes).toBe(graph.sizeBytes);
    expect(weights.progress).toBeCloseTo(graph.sizeBytes / tracker.totalBytes);
    expect(weights.progress).toBeLessThan(0.01);
  });

  it('combines artifact progress without regressing completed files', () => {
    const manifest = getManifest();
    const tracker = new ArtifactProgressTracker(manifest);
    const graph = manifest.artifacts[0]!;
    const weights = manifest.artifacts[1]!;

    tracker.update({ file: graph.path, progress: 100 });
    tracker.update({ file: graph.path, progress: 25 });
    const overall = tracker.update({
      file: weights.path,
      loaded: weights.sizeBytes / 2,
      total: weights.sizeBytes,
    });

    expect(overall.loadedBytes).toBe(Math.round(graph.sizeBytes + weights.sizeBytes / 2));
    expect(overall.progress).toBeCloseTo(overall.loadedBytes / tracker.totalBytes);
  });

  it('ignores metadata files that are not declared model artifacts', () => {
    const tracker = new ArtifactProgressTracker(getManifest());
    expect(tracker.update({ file: 'tokenizer.json', progress: 100 })).toMatchObject({
      loadedBytes: 0,
      progress: 0,
    });
  });
});
