import { describe, expect, it } from 'vitest';

import { createInstalledModel, transitionInstalledModel } from '../installed-model';
import { findCuratedModel } from './registry';
import { matchesModelLibraryFilter } from './library-filter';

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
});
