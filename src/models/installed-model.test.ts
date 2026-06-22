import { describe, expect, it } from 'vitest';

import { findCuratedModel } from './catalog/registry';
import {
  createInstalledModel,
  parseInstalledModel,
  transitionInstalledModel,
} from './installed-model';

function getManifest() {
  const manifest = findCuratedModel('smollm2-135m-q4');
  if (!manifest) {
    throw new Error('Installed-model fixture is missing.');
  }
  return manifest;
}

describe('installed model lifecycle', () => {
  it('records a pinned manifest and only marks a complete cache installed', () => {
    const downloading = createInstalledModel(
      getManifest(),
      'downloading',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    const verifying = transitionInstalledModel(
      downloading,
      'verifying',
      { cachedFiles: 6, totalFiles: 6 },
      new Date('2026-01-01T00:01:00.000Z'),
    );
    const installed = transitionInstalledModel(
      verifying,
      'installed',
      {},
      new Date('2026-01-01T00:02:00.000Z'),
    );

    expect(installed).toMatchObject({
      installedAt: '2026-01-01T00:02:00.000Z',
      sourceRevision: getManifest().source.revision,
      status: 'installed',
    });
  });

  it('rejects invalid transitions and incomplete installation claims', () => {
    const downloading = createInstalledModel(getManifest());
    expect(() => transitionInstalledModel(downloading, 'installed')).toThrow('Cannot transition');
    const verifying = transitionInstalledModel(downloading, 'verifying', {
      cachedFiles: 1,
      totalFiles: 2,
    });
    expect(() => transitionInstalledModel(verifying, 'installed')).toThrow('every required file');
  });

  it('rejects incompatible persisted records', () => {
    expect(parseInstalledModel({ schemaVersion: 2, modelId: 'old-model' })).toBeNull();
    expect(parseInstalledModel(createInstalledModel(getManifest()))).not.toBeNull();
  });
});
