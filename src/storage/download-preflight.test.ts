import { describe, expect, it } from 'vitest';

import { findCuratedModel } from '../models/catalog/registry';
import { runDownloadPreflight } from './download-preflight';

function model() {
  const manifest = findCuratedModel('smollm2-135m-q4');
  if (!manifest) throw new Error('Preflight fixture is missing.');
  return manifest;
}

describe('download preflight', () => {
  it('blocks a download when browser quota is demonstrably insufficient', async () => {
    const result = await runDownloadPreflight(model(), {
      estimate: () => Promise.resolve({ quota: 100, usage: 90 }),
    });

    expect(result.status).toBe('blocked');
    expect(result.availableBytes).toBe(10);
  });

  it('warns on reduced-data connections and tolerates unavailable estimates', async () => {
    const warning = await runDownloadPreflight(
      model(),
      { estimate: () => Promise.resolve({ quota: 10 * 1024 ** 3, usage: 0 }) },
      { saveData: true },
    );
    expect(warning.status).toBe('warning');

    const unknown = await runDownloadPreflight(
      model(),
      { estimate: () => Promise.reject(new Error('Unavailable')) },
      undefined,
    );
    expect(unknown.status).toBe('unknown');
  });
});
