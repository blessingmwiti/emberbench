import { describe, expect, it } from 'vitest';

import { findCuratedModel } from '../../models/catalog/registry';
import type { TextModelWorkerEvent, TextModelWorkerRequest } from '../../model-lab/protocol';
import { RuntimeError } from '../core/errors';
import { TransformersTextWorkerAdapter } from './text-worker-adapter';

class FakeWorker {
  readonly requests: TextModelWorkerRequest[] = [];
  private messageListener: ((event: MessageEvent<TextModelWorkerEvent>) => void) | null = null;

  addEventListener(type: 'error' | 'message', listener: (event: never) => void) {
    if (type === 'message') {
      this.messageListener = listener as (event: MessageEvent<TextModelWorkerEvent>) => void;
    }
  }

  emit(message: TextModelWorkerEvent) {
    this.messageListener?.({ data: message } as MessageEvent<TextModelWorkerEvent>);
  }

  postMessage(message: TextModelWorkerRequest) {
    this.requests.push(message);
  }

  terminate() {}
}

function getTextManifest() {
  const manifest = findCuratedModel('smollm2-135m-q4');
  if (!manifest) {
    throw new Error('Text fixture manifest was not found.');
  }
  return manifest;
}

async function collect<T>(events: AsyncIterable<T>) {
  const collected: T[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

describe('TransformersTextWorkerAdapter', () => {
  it('describes its runtime capabilities without starting a model', () => {
    const adapter = new TransformersTextWorkerAdapter(() => new FakeWorker());

    expect(adapter.capabilities()).toEqual({
      cacheInspection: true,
      devices: ['webgpu'],
      inputKinds: ['text'],
      runtime: 'transformers-js',
      streaming: true,
      tasks: ['text-generation'],
    });
  });

  it('loads the pinned manifest configuration and streams generation events', async () => {
    const worker = new FakeWorker();
    const adapter = new TransformersTextWorkerAdapter(() => worker);
    const manifest = getTextManifest();
    const loaded = adapter.load(manifest, { cachedFilesOnly: true });

    expect(worker.requests[0]).toMatchObject({
      cachedFilesOnly: true,
      dtype: 'q4',
      modelId: manifest.source.modelId,
      revision: manifest.source.revision,
      type: 'load',
    });
    worker.emit({ loadTimeMs: 10, model: manifest.source.modelId, type: 'ready' });
    await expect(loaded).resolves.toMatchObject({ modelId: manifest.id, state: 'ready' });

    const eventsPromise = collect(
      adapter.run({ kind: 'text', text: 'Hello' }, { maxNewTokens: 8, requestId: 'request-1' }),
    );
    worker.emit({ requestId: 'request-1', text: ' world', type: 'token' });
    worker.emit({
      durationMs: 12,
      firstTokenMs: 3,
      requestId: 'request-1',
      tokenCount: 1,
      type: 'complete',
    });

    await expect(eventsPromise).resolves.toEqual([
      { requestId: 'request-1', text: ' world', type: 'token' },
      {
        durationMs: 12,
        firstTokenMs: 3,
        requestId: 'request-1',
        tokenCount: 1,
        type: 'complete',
      },
    ]);
    expect(adapter.session?.state).toBe('ready');
  });

  it('rejects generation before a model is loaded', async () => {
    const adapter = new TransformersTextWorkerAdapter(() => new FakeWorker());

    const consume = collect(
      adapter.run({ kind: 'text', text: 'Hello' }, { requestId: 'request-1' }),
    );

    await expect(consume).rejects.toBeInstanceOf(RuntimeError);
  });

  it('reports cache completeness through the shared runtime shape', async () => {
    const worker = new FakeWorker();
    const adapter = new TransformersTextWorkerAdapter(() => worker);
    const manifest = getTextManifest();
    const inspection = adapter.inspectCache(manifest);

    expect(worker.requests[0]).toMatchObject({
      modelId: manifest.source.modelId,
      revision: manifest.source.revision,
      type: 'inspect-cache',
    });
    worker.emit({
      cached: true,
      files: [{ cached: true, file: 'onnx/model_q4.onnx' }],
      type: 'cache-status',
    });

    await expect(inspection).resolves.toEqual({
      cached: true,
      files: [{ cached: true, file: 'onnx/model_q4.onnx' }],
    });
  });

  it('deletes the pinned pipeline cache through the worker', async () => {
    const worker = new FakeWorker();
    const adapter = new TransformersTextWorkerAdapter(() => worker);
    const manifest = getTextManifest();
    const deletion = adapter.deleteCache(manifest);

    expect(worker.requests[0]).toMatchObject({
      dtype: 'q4',
      modelId: manifest.source.modelId,
      revision: manifest.source.revision,
      type: 'delete-cache',
    });
    worker.emit({ filesCached: 6, filesDeleted: 6, type: 'cache-deleted' });

    await expect(deletion).resolves.toEqual({ filesCached: 6, filesDeleted: 6 });
  });
});
