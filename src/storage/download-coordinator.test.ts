import { describe, expect, it } from 'vitest';

import { DuplicateDownloadError, ModelDownloadCoordinator } from './download-coordinator';

describe('model download coordinator', () => {
  it('runs one heavy download at a time', async () => {
    const coordinator = new ModelDownloadCoordinator(null);
    const first = await coordinator.acquire('text');
    let secondResolved = false;
    const secondPromise = coordinator.acquire('vision').then((lease) => {
      secondResolved = true;
      return lease;
    });

    await Promise.resolve();
    expect(secondResolved).toBe(false);
    expect(coordinator.position('vision')).toBe(1);

    first.release();
    const second = await secondPromise;
    expect(secondResolved).toBe(true);
    second.release();
  });

  it('rejects duplicate active or queued model downloads', async () => {
    const coordinator = new ModelDownloadCoordinator(null);
    const first = await coordinator.acquire('text');
    await expect(coordinator.acquire('text')).rejects.toBeInstanceOf(DuplicateDownloadError);
    first.release();
  });

  it('removes an aborted queued download', async () => {
    const coordinator = new ModelDownloadCoordinator(null);
    const first = await coordinator.acquire('text');
    const controller = new AbortController();
    const queued = coordinator.acquire('vision', controller.signal);
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    first.release();
  });
});
