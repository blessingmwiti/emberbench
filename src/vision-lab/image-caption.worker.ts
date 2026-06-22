/// <reference lib="webworker" />

import { env, ModelRegistry, pipeline } from '@huggingface/transformers';

import {
  VISION_SPIKE_MODEL,
  type VisionWorkerConfig,
  type VisionWorkerEvent,
  type VisionWorkerRequest,
} from './protocol';

const scope = self as DedicatedWorkerGlobalScope;
const originalFetch = scope.fetch.bind(scope);
let blockRemoteModelRequests = false;

interface ResolvedVisionConfig {
  dtype: NonNullable<VisionWorkerConfig['dtype']>;
  modelId: string;
  revision: string;
}

const defaultConfig: ResolvedVisionConfig = {
  dtype: 'q8',
  modelId: VISION_SPIKE_MODEL,
  revision: 'main',
};

function resolveConfig(config: VisionWorkerConfig): ResolvedVisionConfig {
  return {
    dtype: config.dtype ?? defaultConfig.dtype,
    modelId: config.modelId ?? defaultConfig.modelId,
    revision: config.revision ?? defaultConfig.revision,
  };
}

function configKey(config: ResolvedVisionConfig) {
  return `${config.modelId}@${config.revision}:${config.dtype}`;
}

scope.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
  if (blockRemoteModelRequests && new URL(url, scope.location.href).hostname === 'huggingface.co') {
    throw new Error('A Hugging Face request was blocked by cached-files-only mode.');
  }
  return originalFetch(input, init);
};

function post(message: VisionWorkerEvent) {
  scope.postMessage(message);
}

async function createCaptioner(config: ResolvedVisionConfig, cachedFilesOnly = false) {
  const startedAt = performance.now();
  blockRemoteModelRequests = cachedFilesOnly;

  try {
    const captioner = await pipeline('image-to-text', config.modelId, {
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
    return captioner;
  } finally {
    blockRemoteModelRequests = false;
  }
}

type Captioner = Awaited<ReturnType<typeof createCaptioner>>;

let captioner: Captioner | null = null;
let captionerPromise: Promise<Captioner> | null = null;
let loadedConfigKey: string | null = null;

async function getCaptioner(config: ResolvedVisionConfig, cachedFilesOnly = false) {
  const requestedKey = configKey(config);
  if (captioner) {
    if (loadedConfigKey !== requestedKey) {
      throw new Error('Unload the current vision model before loading another configuration.');
    }
    post({ loadTimeMs: 0, model: config.modelId, type: 'ready' });
    return captioner;
  }
  if (captionerPromise && loadedConfigKey !== requestedKey) {
    throw new Error('Another vision model configuration is currently loading.');
  }

  loadedConfigKey = requestedKey;
  captionerPromise ??= createCaptioner(config, cachedFilesOnly);
  try {
    captioner = await captionerPromise;
    return captioner;
  } catch (error) {
    captionerPromise = null;
    loadedConfigKey = null;
    throw error;
  }
}

async function getLoadedCaptioner() {
  if (captioner) return captioner;
  if (captionerPromise) return captionerPromise;
  return getCaptioner(defaultConfig);
}

async function caption(request: Extract<VisionWorkerRequest, { type: 'caption' }>) {
  try {
    const activeCaptioner = await getLoadedCaptioner();
    const startedAt = performance.now();
    const output = await activeCaptioner(request.image, {
      max_new_tokens: 30,
    });

    post({
      caption: output[0]?.generated_text ?? 'The model returned no caption.',
      durationMs: performance.now() - startedAt,
      requestId: request.requestId,
      type: 'result',
    });
  } catch (error) {
    post({
      message: error instanceof Error ? error.message : 'Image captioning failed.',
      requestId: request.requestId,
      type: 'error',
    });
  }
}

async function unload() {
  if (captioner) {
    await captioner.dispose();
  }
  captioner = null;
  captionerPromise = null;
  loadedConfigKey = null;
  post({ type: 'unloaded' });
}

function registryOptions(config: ResolvedVisionConfig) {
  return {
    device: 'webgpu',
    dtype: config.dtype,
    revision: config.revision,
  } as const;
}

async function inspectCache(config: ResolvedVisionConfig) {
  const previousBlockRemoteModelRequests = blockRemoteModelRequests;
  blockRemoteModelRequests = true;
  let status;
  try {
    status = await ModelRegistry.is_pipeline_cached_files(
      'image-to-text',
      config.modelId,
      registryOptions(config),
    );
  } catch {
    status = { allCached: false, files: [] };
  } finally {
    blockRemoteModelRequests = previousBlockRemoteModelRequests;
  }
  post({ cached: status.allCached, files: status.files, type: 'cache-status' });
  return status;
}

async function deleteCache(config: ResolvedVisionConfig) {
  if (captioner || captionerPromise) {
    if (loadedConfigKey !== configKey(config)) {
      throw new Error('A different vision model configuration is currently loaded.');
    }
    await unload();
  }

  const previousBlockRemoteModelRequests = blockRemoteModelRequests;
  blockRemoteModelRequests = true;
  const options = registryOptions(config);
  try {
    const before = await ModelRegistry.is_pipeline_cached_files(
      'image-to-text',
      config.modelId,
      options,
    );
    await ModelRegistry.clear_pipeline_cache('image-to-text', config.modelId, options);

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
      'image-to-text',
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

scope.addEventListener('message', (event: MessageEvent<VisionWorkerRequest>) => {
  const request = event.data;

  switch (request.type) {
    case 'load':
      void inspectCache(resolveConfig(request))
        .then(() => getCaptioner(resolveConfig(request), request.cachedFilesOnly))
        .catch((error: unknown) => {
          post({
            message: error instanceof Error ? error.message : 'Vision model loading failed.',
            type: 'error',
          });
        });
      break;
    case 'caption':
      void caption(request);
      break;
    case 'inspect-cache':
      void inspectCache(resolveConfig(request)).catch((error: unknown) => {
        post({
          message: error instanceof Error ? error.message : 'Vision cache inspection failed.',
          type: 'error',
        });
      });
      break;
    case 'delete-cache':
      void deleteCache(resolveConfig(request)).catch((error: unknown) => {
        post({
          message: error instanceof Error ? error.message : 'Vision cache deletion failed.',
          type: 'error',
        });
      });
      break;
    case 'unload':
      void unload().catch((error: unknown) => {
        post({
          message: error instanceof Error ? error.message : 'Vision model unloading failed.',
          type: 'error',
        });
      });
      break;
  }
});
