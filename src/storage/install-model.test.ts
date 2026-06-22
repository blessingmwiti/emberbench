import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findCuratedModel } from '../models/catalog/registry';
import type { ModelRuntimeAdapter, RuntimeEvent } from '../runtimes/core/types';

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  release: vi.fn(),
}));

vi.mock('./database', () => ({
  installedModels: {
    get: mocks.get,
    put: mocks.put,
  },
}));

vi.mock('./download-coordinator', () => ({
  modelDownloads: {
    acquire: mocks.acquire,
  },
}));

import { installModel } from './install-model';

function manifest() {
  const model = findCuratedModel('smollm2-135m-q4');
  if (!model) throw new Error('Install fixture model is missing.');
  return model;
}

function adapter(events: RuntimeEvent[], cached = true) {
  return {
    async *download() {
      await Promise.resolve();
      yield* events;
    },
    inspectCache: vi.fn().mockResolvedValue({
      cached,
      files: [
        { cached, file: 'onnx/model_q4.onnx' },
        { cached, file: 'onnx/model_q4.onnx_data' },
      ],
    }),
    load: vi.fn().mockResolvedValue({ modelId: manifest().id, state: 'ready' }),
  } as unknown as ModelRuntimeAdapter;
}

describe('installModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.acquire.mockResolvedValue({ release: mocks.release });
    mocks.get.mockResolvedValue(null);
    mocks.put.mockResolvedValue(undefined);
  });

  it('coordinates download, progress persistence, verification, and installation', async () => {
    const progress = vi.fn();
    const runtime = adapter([
      { phase: 'download', progress: 0.02, type: 'progress' },
      { phase: 'download', progress: 0.51, type: 'progress' },
    ]);

    const result = await installModel({
      adapter: runtime,
      manifest: manifest(),
      onProgress: progress,
    });

    expect(mocks.acquire).toHaveBeenCalledWith(manifest().id, undefined);
    expect(progress).toHaveBeenCalledWith(0.02);
    expect(progress).toHaveBeenCalledWith(0.51);
    expect(result.record.status).toBe('installed');
    expect(mocks.put).toHaveBeenCalledWith(
      expect.objectContaining({ downloadProgress: 0.51, status: 'downloading' }),
    );
    expect(mocks.put).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'installed' }));
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('persists a failed state when verification finds missing files', async () => {
    const runtime = adapter([], false);

    await expect(
      installModel({
        adapter: runtime,
        manifest: manifest(),
      }),
    ).rejects.toThrow('Cache verification found missing model files');

    expect(mocks.put).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lastError: 'Cache verification found missing model files.',
        status: 'failed',
      }),
    );
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
