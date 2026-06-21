/// <reference lib="webworker" />

import {
  InterruptableStoppingCriteria,
  ModelRegistry,
  pipeline,
  TextStreamer,
} from '@huggingface/transformers';

import {
  TEXT_SPIKE_MODEL,
  type TextModelWorkerConfig,
  type TextModelWorkerEvent,
  type TextModelWorkerRequest,
} from './protocol';

const scope = self as DedicatedWorkerGlobalScope;
const stoppingCriteria = new InterruptableStoppingCriteria();
const originalFetch = scope.fetch.bind(scope);
let blockRemoteModelRequests = false;

interface ResolvedWorkerConfig {
  dtype: NonNullable<TextModelWorkerConfig['dtype']>;
  modelId: string;
  revision: string;
}

const defaultConfig: ResolvedWorkerConfig = {
  dtype: 'q4',
  modelId: TEXT_SPIKE_MODEL,
  revision: 'main',
};

function resolveConfig(config: TextModelWorkerConfig): ResolvedWorkerConfig {
  return {
    dtype: config.dtype ?? defaultConfig.dtype,
    modelId: config.modelId ?? defaultConfig.modelId,
    revision: config.revision ?? defaultConfig.revision,
  };
}

function configKey(config: ResolvedWorkerConfig) {
  return `${config.modelId}@${config.revision}:${config.dtype}`;
}

scope.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;

  if (blockRemoteModelRequests && new URL(url, scope.location.href).hostname === 'huggingface.co') {
    throw new Error('A Hugging Face request was blocked by cached-files-only mode.');
  }

  return originalFetch(input, init);
};

async function createGenerator(config: ResolvedWorkerConfig, cachedFilesOnly = false) {
  const startedAt = performance.now();
  blockRemoteModelRequests = cachedFilesOnly;

  try {
    const generator = await pipeline('text-generation', config.modelId, {
      device: 'webgpu',
      dtype: config.dtype,
      progress_callback: (data) => {
        post({
          data: data as unknown as Record<string, unknown>,
          type: 'progress',
        });
      },
      revision: config.revision,
    });

    post({
      loadTimeMs: performance.now() - startedAt,
      model: config.modelId,
      type: 'ready',
    });

    return generator;
  } finally {
    blockRemoteModelRequests = false;
  }
}

type Generator = Awaited<ReturnType<typeof createGenerator>>;

let generator: Generator | null = null;
let generatorPromise: Promise<Generator> | null = null;
let loadedConfigKey: string | null = null;
let activeRequestId: string | null = null;
let cancellationRequested = false;

function post(message: TextModelWorkerEvent) {
  scope.postMessage(message);
}

async function getGenerator(config = defaultConfig, cachedFilesOnly = false) {
  const requestedConfigKey = configKey(config);

  if (generator) {
    if (loadedConfigKey !== requestedConfigKey) {
      throw new Error('Unload the current model before loading a different model configuration.');
    }

    post({
      loadTimeMs: 0,
      model: config.modelId,
      type: 'ready',
    });
    return generator;
  }

  if (generatorPromise && loadedConfigKey !== requestedConfigKey) {
    throw new Error('Another model configuration is currently loading.');
  }

  loadedConfigKey = requestedConfigKey;
  generatorPromise ??= createGenerator(config, cachedFilesOnly);

  try {
    generator = await generatorPromise;
    return generator;
  } catch (error) {
    generatorPromise = null;
    loadedConfigKey = null;
    throw error;
  }
}

async function generate(request: Extract<TextModelWorkerRequest, { type: 'generate' }>) {
  if (activeRequestId) {
    post({
      message: 'A generation request is already running.',
      requestId: request.requestId,
      type: 'error',
    });
    return;
  }

  activeRequestId = request.requestId;
  cancellationRequested = false;
  stoppingCriteria.reset();

  try {
    const activeGenerator = await getGenerator();
    const startedAt = performance.now();
    let firstTokenAt: number | null = null;
    let tokenCount = 0;

    const streamer = new TextStreamer(activeGenerator.tokenizer, {
      callback_function: (text) => {
        firstTokenAt ??= performance.now();
        post({
          requestId: request.requestId,
          text,
          type: 'token',
        });
      },
      skip_prompt: true,
      skip_special_tokens: true,
      token_callback_function: (tokens) => {
        tokenCount += tokens.length;
      },
    });

    await activeGenerator(request.prompt, {
      do_sample: false,
      max_new_tokens: request.maxNewTokens,
      return_full_text: false,
      stopping_criteria: stoppingCriteria,
      streamer,
    });

    if (cancellationRequested) {
      post({
        requestId: request.requestId,
        type: 'cancelled',
      });
      return;
    }

    post({
      durationMs: performance.now() - startedAt,
      firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt,
      requestId: request.requestId,
      tokenCount,
      type: 'complete',
    });
  } catch (error) {
    post({
      message: error instanceof Error ? error.message : 'Text generation failed.',
      requestId: request.requestId,
      type: 'error',
    });
  } finally {
    activeRequestId = null;
    cancellationRequested = false;
    stoppingCriteria.reset();
  }
}

async function unload() {
  cancellationRequested = true;
  stoppingCriteria.interrupt();

  if (generator) {
    await generator.dispose();
  }

  generator = null;
  generatorPromise = null;
  loadedConfigKey = null;
  post({ type: 'unloaded' });
}

async function inspectCache(config: ResolvedWorkerConfig) {
  const status = await ModelRegistry.is_pipeline_cached_files('text-generation', config.modelId, {
    device: 'webgpu',
    dtype: config.dtype,
    revision: config.revision,
  });

  post({
    cached: status.allCached,
    files: status.files,
    type: 'cache-status',
  });

  return status;
}

scope.addEventListener('message', (event: MessageEvent<TextModelWorkerRequest>) => {
  const request = event.data;

  switch (request.type) {
    case 'load':
      void inspectCache(resolveConfig(request))
        .then(() => {
          return getGenerator(resolveConfig(request), request.cachedFilesOnly);
        })
        .catch((error: unknown) => {
          post({
            message: error instanceof Error ? error.message : 'Model loading failed.',
            type: 'error',
          });
        });
      break;
    case 'inspect-cache':
      void inspectCache(resolveConfig(request)).catch((error: unknown) => {
        post({
          message: error instanceof Error ? error.message : 'Model cache inspection failed.',
          type: 'error',
        });
      });
      break;
    case 'generate':
      void generate(request);
      break;
    case 'cancel':
      cancellationRequested = true;
      stoppingCriteria.interrupt();
      break;
    case 'unload':
      void unload().catch((error: unknown) => {
        post({
          message: error instanceof Error ? error.message : 'Model unloading failed.',
          type: 'error',
        });
      });
      break;
  }
});
