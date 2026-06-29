import { describe, expect, it } from 'vitest';

import { createInstalledModel, transitionInstalledModel } from '../installed-model';
import { findCuratedModel } from './registry';
import { getModelOfflineAvailability, matchesModelLibraryFilter } from './library-filter';

function fixture() {
  const model = findCuratedModel('smollm2-135m-q4');
  if (!model) throw new Error('Library-filter fixture is missing.');
  const verifying = transitionInstalledModel(createInstalledModel(model), 'verifying', {
    cachedFiles: 6,
    totalFiles: 6,
  });
  return {
    installed: transitionInstalledModel(verifying, 'installed'),
    model,
  };
}

describe('model library filters', () => {
  it('shows only verified current revisions as installed', () => {
    const { installed, model } = fixture();
    expect(matchesModelLibraryFilter('installed', model, installed)).toBe(true);
    expect(
      matchesModelLibraryFilter('installed', model, {
        ...installed,
        sourceRevision: 'older-revision',
      }),
    ).toBe(false);
  });

  it('treats failures and revision mismatches as needing attention', () => {
    const { installed, model } = fixture();
    expect(
      matchesModelLibraryFilter('attention', model, {
        ...installed,
        status: 'failed',
      }),
    ).toBe(true);
    expect(
      matchesModelLibraryFilter('attention', model, {
        ...installed,
        sourceRevision: 'older-revision',
      }),
    ).toBe(true);
    expect(matchesModelLibraryFilter('attention', model, installed)).toBe(false);
  });

  it('reports online-only availability when no local install exists', () => {
    const { model } = fixture();
    expect(getModelOfflineAvailability(model, undefined)).toMatchObject({
      label: 'Online only',
      state: 'online-only',
    });
  });

  it('reports available-offline only for a verified current revision', () => {
    const { installed, model } = fixture();
    expect(getModelOfflineAvailability(model, installed)).toMatchObject({
      label: 'Available offline',
      state: 'available-offline',
    });
  });

  it('reports partial availability for unfinished, failed, or stale local installs', () => {
    const { installed, model } = fixture();
    expect(getModelOfflineAvailability(model, createInstalledModel(model))).toMatchObject({
      label: 'Partial',
      state: 'partial',
    });
    expect(
      getModelOfflineAvailability(model, {
        ...installed,
        status: 'failed',
      }),
    ).toMatchObject({
      label: 'Partial',
      state: 'partial',
    });
    expect(
      getModelOfflineAvailability(model, {
        ...installed,
        sourceRevision: 'older-revision',
      }),
    ).toMatchObject({
      label: 'Partial',
      state: 'partial',
    });
  });
});
