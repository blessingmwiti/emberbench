import { describe, expect, it } from 'vitest';

import { findCuratedModel } from '../../models/catalog/registry';
import type { VisionWorkerEvent, VisionWorkerRequest } from '../../vision-lab/protocol';
import { RuntimeError } from '../core/errors';
import { TransformersVisionWorkerAdapter } from './vision-worker-adapter';

class FakeVisionWorker {
  readonly requests: VisionWorkerRequest[] = [];
  private messageListener: ((event: MessageEvent<VisionWorkerEvent>) => void) | null = null;

  addEventListener(type: 'error' | 'message', listener: (event: never) => void) {
    if (type === 'message') {
      this.messageListener = listener as (event: MessageEvent<VisionWorkerEvent>) => void;
    }
  }

  emit(message: VisionWorkerEvent) {
    this.messageListener?.({ data: message } as MessageEvent<VisionWorkerEvent>);
  }

  postMessage(message: VisionWorkerRequest) {
    this.requests.push(message);
  }

  terminate() {}
}

function manifest() {
  const model = findCuratedModel('vit-gpt2-captioning-q8');
  if (!model) throw new Error('Vision fixture is missing.');
  return model;
}

async function collect<T>(events: AsyncIterable<T>) {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

describe('TransformersVisionWorkerAdapter', () => {
  it('loads a pinned manifest and returns an image result', async () => {
    const worker = new FakeVisionWorker();
    const adapter = new TransformersVisionWorkerAdapter(() => worker);
    const model = manifest();
    const loading = adapter.load(model);
    expect(worker.requests[0]).toMatchObject({
      dtype: 'q8',
      modelId: model.source.modelId,
      revision: model.source.revision,
      type: 'load',
    });
    worker.emit({ loadTimeMs: 10, model: model.source.modelId, type: 'ready' });
    await loading;

    const result = collect(
      adapter.run(
        { data: new Uint8Array([1, 2, 3]).buffer, kind: 'image', mimeType: 'image/png' },
        { requestId: 'vision-1' },
      ),
    );
    worker.emit({
      caption: 'a small house',
      durationMs: 12,
      requestId: 'vision-1',
      type: 'result',
    });

    await expect(result).resolves.toEqual([
      { data: { caption: 'a small house' }, requestId: 'vision-1', type: 'result' },
      { durationMs: 12, requestId: 'vision-1', type: 'complete' },
    ]);
  });

  it('inspects and deletes the pinned vision cache', async () => {
    const worker = new FakeVisionWorker();
    const adapter = new TransformersVisionWorkerAdapter(() => worker);
    const inspection = adapter.inspectCache(manifest());
    worker.emit({
      cached: true,
      files: [{ cached: true, file: 'config.json' }],
      type: 'cache-status',
    });
    await expect(inspection).resolves.toMatchObject({ cached: true });

    const deletion = adapter.deleteCache(manifest());
    worker.emit({ filesCached: 5, filesDeleted: 5, type: 'cache-deleted' });
    await expect(deletion).resolves.toEqual({ filesCached: 5, filesDeleted: 5 });
  });

  it('combines vision artifact progress by byte size', async () => {
    const worker = new FakeVisionWorker();
    const adapter = new TransformersVisionWorkerAdapter(() => worker);
    const model = manifest();
    const encoder = model.artifacts[0]!;
    const events = collect(adapter.download(model));

    worker.emit({
      data: { file: encoder.path, progress: 50 },
      type: 'progress',
    });
    worker.emit({ loadTimeMs: 10, model: model.source.modelId, type: 'ready' });

    const result = await events;
    expect(result[0]).toMatchObject({
      artifact: encoder.path,
      artifactProgress: 0.5,
      loadedBytes: Math.round(encoder.sizeBytes / 2),
      phase: 'download',
      type: 'progress',
    });
    expect(result[0]).toHaveProperty(
      'progress',
      Math.round(encoder.sizeBytes / 2) /
        model.artifacts.reduce((sum, item) => sum + item.sizeBytes, 0),
    );
  });

  it('maps vision model-host failures while downloading', async () => {
    const worker = new FakeVisionWorker();
    const adapter = new TransformersVisionWorkerAdapter(() => worker);
    const events = collect(adapter.download(manifest()));

    worker.emit({ message: 'TypeError: Failed to fetch because of CORS', type: 'error' });

    const failure = await events.then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(RuntimeError);
    expect(failure).toMatchObject({ code: 'DOWNLOAD_FAILED', recoverable: true });
    expect((failure as RuntimeError).message).toContain('cross-origin browser downloads');
  });
});
