/// <reference lib="webworker" />

import { pipeline } from '@huggingface/transformers';

import { VISION_SPIKE_MODEL, type VisionWorkerEvent, type VisionWorkerRequest } from './protocol';

const scope = self as DedicatedWorkerGlobalScope;

async function createCaptioner() {
  const startedAt = performance.now();
  const captioner = await pipeline('image-to-text', VISION_SPIKE_MODEL, {
    device: 'webgpu',
    dtype: 'q8',
    progress_callback: (data) => {
      post({
        data: data as unknown as Record<string, unknown>,
        type: 'progress',
      });
    },
  });

  post({
    loadTimeMs: performance.now() - startedAt,
    model: VISION_SPIKE_MODEL,
    type: 'ready',
  });

  return captioner;
}

type Captioner = Awaited<ReturnType<typeof createCaptioner>>;

let captioner: Captioner | null = null;
let captionerPromise: Promise<Captioner> | null = null;

function post(message: VisionWorkerEvent) {
  scope.postMessage(message);
}

async function getCaptioner() {
  if (captioner) {
    post({ loadTimeMs: 0, model: VISION_SPIKE_MODEL, type: 'ready' });
    return captioner;
  }

  captionerPromise ??= createCaptioner();

  try {
    captioner = await captionerPromise;
    return captioner;
  } catch (error) {
    captionerPromise = null;
    throw error;
  }
}

async function caption(request: Extract<VisionWorkerRequest, { type: 'caption' }>) {
  try {
    const activeCaptioner = await getCaptioner();
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
  post({ type: 'unloaded' });
}

scope.addEventListener('message', (event: MessageEvent<VisionWorkerRequest>) => {
  const request = event.data;

  switch (request.type) {
    case 'load':
      void getCaptioner().catch((error: unknown) => {
        post({
          message: error instanceof Error ? error.message : 'Vision model loading failed.',
          type: 'error',
        });
      });
      break;
    case 'caption':
      void caption(request);
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
