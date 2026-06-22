import { describe, expect, it } from 'vitest';

import {
  filterCuratedModels,
  findCuratedModel,
  getCuratedModels,
  getModelDownloadSize,
} from './registry';
import { ModelManifestValidationError, validateModelManifest } from './validate-manifest';

describe('curated model registry', () => {
  it('contains runtime-validated pinned manifests', () => {
    const models = getCuratedModels();
    expect(models).toHaveLength(3);
    expect(models.every((model) => model.source.revision.length === 40)).toBe(true);
    expect(models.every((model) => getModelDownloadSize(model) > 0)).toBe(true);
  });

  it('supports lookup and capability filtering', () => {
    expect(findCuratedModel('smollm2-135m-q4')?.name).toBe('SmolLM2 135M');
    expect(findCuratedModel('qwen2.5-coder-0.5b-q4')?.workspaces).toContain('code');
    expect(filterCuratedModels({ capability: 'image-captioning' })).toHaveLength(1);
    expect(filterCuratedModels({ maximumDeviceTier: 'basic' })).toHaveLength(1);
  });

  it('rejects invalid manifest versions', () => {
    expect(() => validateModelManifest({ schemaVersion: 2 })).toThrow(ModelManifestValidationError);
  });
});
