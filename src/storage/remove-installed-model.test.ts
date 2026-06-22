import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findCuratedModel } from '../models/catalog/registry';
import { createInstalledModel, transitionInstalledModel } from '../models/installed-model';

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  deleteCache: vi.fn(),
  deleteRecord: vi.fn(),
  put: vi.fn(),
  release: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock('../runtimes/create-runtime-adapter', () => ({
  createRuntimeAdapter: () => ({
    deleteCache: mocks.deleteCache,
    terminate: mocks.terminate,
  }),
}));

vi.mock('./database', () => ({
  installedModels: {
    delete: mocks.deleteRecord,
    put: mocks.put,
  },
}));

vi.mock('./download-coordinator', () => ({
  modelDownloads: {
    acquire: mocks.acquire,
  },
}));

import { removeInstalledModel } from './remove-installed-model';

function fixture() {
  const manifest = findCuratedModel('smollm2-135m-q4');
  if (!manifest) throw new Error('Removal fixture manifest is missing.');
  const verifying = transitionInstalledModel(createInstalledModel(manifest), 'verifying', {
    cachedFiles: 6,
    totalFiles: 6,
  });
  return {
    installation: transitionInstalledModel(verifying, 'installed'),
    manifest,
  };
}

describe('removeInstalledModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.acquire.mockResolvedValue({ release: mocks.release });
    mocks.put.mockResolvedValue(undefined);
    mocks.deleteRecord.mockResolvedValue(undefined);
  });

  it('locks the model, deletes every cached file, and removes its record', async () => {
    const { installation, manifest } = fixture();
    mocks.deleteCache.mockResolvedValue({ filesCached: 6, filesDeleted: 6 });

    await removeInstalledModel(manifest, installation);

    expect(mocks.acquire).toHaveBeenCalledWith(manifest.id);
    expect(mocks.put).toHaveBeenCalledWith(expect.objectContaining({ status: 'removing' }));
    expect(mocks.deleteRecord).toHaveBeenCalledWith(manifest.id);
    expect(mocks.terminate).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('persists a failed state when cache deletion is incomplete', async () => {
    const { installation, manifest } = fixture();
    mocks.deleteCache.mockResolvedValue({ filesCached: 6, filesDeleted: 5 });

    await expect(removeInstalledModel(manifest, installation)).rejects.toThrow('Deleted 5 of 6');
    expect(mocks.put).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lastError: 'Deleted 5 of 6 cached model files.',
        status: 'failed',
      }),
    );
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
