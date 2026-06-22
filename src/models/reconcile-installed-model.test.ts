import { describe, expect, it } from 'vitest';

import { findCuratedModel } from './catalog/registry';
import { createInstalledModel, transitionInstalledModel } from './installed-model';
import { reconcileInstalledModel } from './reconcile-installed-model';

function manifest() {
  const model = findCuratedModel('smollm2-135m-q4');
  if (!model) throw new Error('Reconciliation fixture is missing.');
  return model;
}

const completeCache = {
  cached: true,
  files: [
    { cached: true, file: 'config.json' },
    { cached: true, file: 'onnx/model_q4.onnx' },
  ],
};

describe('installed model reconciliation', () => {
  it('recovers an interrupted download when the cache is complete', () => {
    const record = createInstalledModel(manifest(), 'downloading');
    expect(reconcileInstalledModel(record, manifest(), completeCache).status).toBe('installed');
  });

  it('downgrades an installed record when required files were evicted', () => {
    const verifying = transitionInstalledModel(createInstalledModel(manifest()), 'verifying', {
      cachedFiles: 2,
      totalFiles: 2,
    });
    const installed = transitionInstalledModel(verifying, 'installed');
    const reconciled = reconcileInstalledModel(installed, manifest(), {
      cached: false,
      files: [
        { cached: true, file: 'config.json' },
        { cached: false, file: 'onnx/model_q4.onnx' },
      ],
    });

    expect(reconciled.status).toBe('failed');
    expect(reconciled.lastError).toContain('Reinstall');
  });
});
