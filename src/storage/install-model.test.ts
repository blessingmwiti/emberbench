import { beforeEach, describe, expect, it, vi } from 'vitest';

import { findCuratedModel } from '../models/catalog/registry';
import type { InstalledModel } from '../models/catalog/types';
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
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    mocks.acquire.mockResolvedValue({ release: mocks.release });
    mocks.get.mockResolvedValue(null);
    mocks.put.mockResolvedValue(undefined);
  });

  it('coordinates download, progress persistence, verification, and installation', async () => {
    const progress = vi.fn();
    const runtime = adapter([
      {
        artifact: 'onnx/model_q4.onnx',
        artifactProgress: 1,
        loadedBytes: 275_214,
        phase: 'download',
        progress: 0.02,
        type: 'progress',
      },
      {
        artifact: 'onnx/model_q4.onnx_data',
        artifactProgress: 0.51,
        loadedBytes: 92_000_000,
        phase: 'download',
        progress: 0.51,
        type: 'progress',
      },
    ]);

    const result = await installModel({
      adapter: runtime,
      manifest: manifest(),
      onProgress: progress,
    });

    expect(mocks.acquire).toHaveBeenCalledWith(manifest().id, expect.any(AbortSignal));
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ progress: 0.02 }));
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ progress: 0.51 }));
    expect(result.record.status).toBe('installed');
    expect(mocks.put).toHaveBeenCalledWith(
      expect.objectContaining({
        downloadArtifact: 'onnx/model_q4.onnx_data',
        downloadArtifactProgress: 0.51,
        downloadLoadedBytes: 92_000_000,
        downloadProgress: 0.51,
        status: 'downloading',
      }),
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

  it('stops without retrying when the browser goes offline mid-download', async () => {
    const runtime = {
      async *download(
        _manifest: unknown,
        options: { signal?: AbortSignal },
      ): AsyncIterable<RuntimeEvent> {
        window.dispatchEvent(new Event('offline'));
        await Promise.resolve();
        if (options.signal?.aborted) {
          throw new DOMException('Download was aborted.', 'AbortError');
        }
        yield* [];
      },
    } as unknown as ModelRuntimeAdapter;

    await expect(
      installModel({
        adapter: runtime,
        manifest: manifest(),
      }),
    ).rejects.toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      recoverable: true,
    });

    const failedRecord = mocks.put.mock.lastCall?.[0] as unknown as InstalledModel;
    expect(failedRecord.status).toBe('failed');
    expect(failedRecord.lastError).toContain('went offline');
    expect(mocks.acquire).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it('does not queue a remote download while already offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    await expect(
      installModel({
        adapter: adapter([]),
        manifest: manifest(),
      }),
    ).rejects.toMatchObject({ code: 'NETWORK_UNAVAILABLE' });

    expect(mocks.acquire).not.toHaveBeenCalled();
  });
});
