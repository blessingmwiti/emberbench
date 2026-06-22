import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TextModelWorkerRequest } from './protocol';
import type { VisionWorkerRequest } from '../vision-lab/protocol';

const transformerMocks = vi.hoisted(() => ({
  inspectCache: vi.fn(),
  pipeline: vi.fn(),
}));

vi.mock('@huggingface/transformers', () => ({
  env: {
    cacheKey: 'transformers-cache',
    localModelPath: '/models/',
    remoteHost: 'https://huggingface.co/',
  },
  InterruptableStoppingCriteria: class {
    interrupt() {}
    reset() {}
  },
  ModelRegistry: {
    clear_pipeline_cache: vi.fn(),
    is_pipeline_cached_files: transformerMocks.inspectCache,
  },
  pipeline: transformerMocks.pipeline,
  TextStreamer: class {},
}));

class WorkerScope<Request> {
  readonly fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected fetch.'));
  readonly location = {
    href: 'https://emberbench.test/worker.js',
    origin: 'https://emberbench.test',
  };
  readonly postMessage = vi.fn<(message: unknown) => void>();
  private messageListener: ((event: MessageEvent<Request>) => void) | null = null;

  addEventListener(type: string, listener: (event: MessageEvent<Request>) => void) {
    if (type === 'message') this.messageListener = listener;
  }

  dispatch(request: Request) {
    this.messageListener?.({ data: request } as MessageEvent<Request>);
  }
}

describe('direct worker protocols', () => {
  beforeEach(() => {
    vi.resetModules();
    transformerMocks.inspectCache.mockReset();
    transformerMocks.pipeline.mockReset();
    transformerMocks.inspectCache.mockResolvedValue({ allCached: false, files: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads a pinned text request and emits progress before ready', async () => {
    const scope = new WorkerScope<TextModelWorkerRequest>();
    vi.stubGlobal('self', scope);
    const generator = Object.assign(vi.fn(), {
      dispose: vi.fn(),
      tokenizer: {},
    });
    transformerMocks.pipeline.mockImplementation(
      (
        _task: string,
        _modelId: string,
        options: { progress_callback: (data: unknown) => void },
      ) => {
        options.progress_callback({ file: 'onnx/model_q4.onnx_data', progress: 25 });
        return Promise.resolve(generator);
      },
    );

    await import('./text-generation.worker');
    scope.dispatch({
      dtype: 'q4',
      modelId: 'owner/text-model',
      revision: 'pinned-text-revision',
      type: 'load',
    });

    await vi.waitFor(() => {
      expect(scope.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'owner/text-model', type: 'ready' }),
      );
    });
    expect(transformerMocks.pipeline).toHaveBeenCalledWith(
      'text-generation',
      'owner/text-model',
      expect.objectContaining({
        device: 'webgpu',
        dtype: 'q4',
        revision: 'pinned-text-revision',
      }),
    );
    expect(scope.postMessage).toHaveBeenCalledWith({
      data: { file: 'onnx/model_q4.onnx_data', progress: 25 },
      type: 'progress',
    });
  });

  it('returns a structured vision load error', async () => {
    const scope = new WorkerScope<VisionWorkerRequest>();
    vi.stubGlobal('self', scope);
    transformerMocks.pipeline.mockRejectedValue(new Error('403 Forbidden'));

    await import('../vision-lab/image-caption.worker');
    scope.dispatch({
      dtype: 'q8',
      modelId: 'owner/vision-model',
      revision: 'pinned-vision-revision',
      type: 'load',
    });

    await vi.waitFor(() => {
      expect(scope.postMessage).toHaveBeenCalledWith({
        message: '403 Forbidden',
        type: 'error',
      });
    });
    expect(transformerMocks.pipeline).toHaveBeenCalledWith(
      'image-to-text',
      'owner/vision-model',
      expect.objectContaining({
        device: 'webgpu',
        dtype: 'q8',
        revision: 'pinned-vision-revision',
      }),
    );
  });
});
