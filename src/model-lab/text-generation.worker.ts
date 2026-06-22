/// <reference lib="webworker" />

import {
  env,
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
  device: NonNullable<TextModelWorkerConfig['device']>;
  dtype: NonNullable<TextModelWorkerConfig['dtype']>;
  modelId: string;
  revision: string;
}

const defaultConfig: ResolvedWorkerConfig = {
  device: 'webgpu',
  dtype: 'q4',
  modelId: TEXT_SPIKE_MODEL,
  revision: 'main',
};

function resolveConfig(config: TextModelWorkerConfig): ResolvedWorkerConfig {
  return {
    device: config.device ?? defaultConfig.device,
    dtype: config.dtype ?? defaultConfig.dtype,
    modelId: config.modelId ?? defaultConfig.modelId,
    revision: config.revision ?? defaultConfig.revision,
  };
}

function configKey(config: ResolvedWorkerConfig) {
  return `${config.modelId}@${config.revision}:${config.device}:${config.dtype}`;
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
      device: config.device,
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

async function getLoadedGenerator() {
  if (generator) {
    return generator;
  }
  if (generatorPromise) {
    return generatorPromise;
  }
  return getGenerator();
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
    const activeGenerator = await getLoadedGenerator();
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
      do_sample: request.temperature > 0,
      max_new_tokens: request.maxNewTokens,
      return_full_text: false,
      stopping_criteria: stoppingCriteria,
      streamer,
      temperature: request.temperature > 0 ? request.temperature : undefined,
      top_p: request.topP,
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
  const previousBlockRemoteModelRequests = blockRemoteModelRequests;
  blockRemoteModelRequests = true;
  let status;
  try {
    status = await ModelRegistry.is_pipeline_cached_files('text-generation', config.modelId, {
      device: config.device,
      dtype: config.dtype,
      revision: config.revision,
    });
  } catch {
    status = { allCached: false, files: [] };
  } finally {
    blockRemoteModelRequests = previousBlockRemoteModelRequests;
  }

  post({
    cached: status.allCached,
    files: status.files,
    type: 'cache-status',
  });

  return status;
}

async function deleteCache(config: ResolvedWorkerConfig) {
  if (generator || generatorPromise) {
    if (loadedConfigKey !== configKey(config)) {
      throw new Error('A different model configuration is currently loaded.');
    }
    await unload();
  }

  const previousBlockRemoteModelRequests = blockRemoteModelRequests;
  blockRemoteModelRequests = true;
  const options = {
    device: config.device,
    dtype: config.dtype,
    revision: config.revision,
  } as const;
  try {
    const before = await ModelRegistry.is_pipeline_cached_files(
      'text-generation',
      config.modelId,
      options,
    );
    await ModelRegistry.clear_pipeline_cache('text-generation', config.modelId, options);

    if (typeof caches !== 'undefined') {
      const cache = await caches.open(env.cacheKey);
      await Promise.all(
        before.files.map(async ({ file }) => {
          const remoteUrl = new URL(
            `${config.modelId}/resolve/${encodeURIComponent(config.revision)}/${file}`,
            env.remoteHost,
          ).href;
          const localUrl = new URL(
            `${env.localModelPath}${config.modelId}/${file}`,
            scope.location.origin,
          ).href;
          await Promise.all([cache.delete(remoteUrl), cache.delete(localUrl)]);
        }),
      );
    }

    const after = await ModelRegistry.is_pipeline_cached_files(
      'text-generation',
      config.modelId,
      options,
    );
    const filesCached = before.files.filter((file) => file.cached).length;
    const filesRemaining = after.files.filter((file) => file.cached).length;
    post({
      filesCached,
      filesDeleted: filesCached - filesRemaining,
      type: 'cache-deleted',
    });
  } finally {
    blockRemoteModelRequests = previousBlockRemoteModelRequests;
  }
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
    case 'delete-cache':
      void deleteCache(resolveConfig(request)).catch((error: unknown) => {
        post({
          message: error instanceof Error ? error.message : 'Model cache deletion failed.',
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
