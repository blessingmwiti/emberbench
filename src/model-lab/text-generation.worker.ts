/// <reference lib="webworker" />

import { InterruptableStoppingCriteria, pipeline, TextStreamer } from '@huggingface/transformers';

import {
  TEXT_SPIKE_MODEL,
  type TextModelWorkerEvent,
  type TextModelWorkerRequest,
} from './protocol';

const scope = self as DedicatedWorkerGlobalScope;
const stoppingCriteria = new InterruptableStoppingCriteria();

async function createGenerator() {
  const startedAt = performance.now();
  const generator = await pipeline('text-generation', TEXT_SPIKE_MODEL, {
    device: 'webgpu',
    dtype: 'q4',
    progress_callback: (data) => {
      post({
        data: data as unknown as Record<string, unknown>,
        type: 'progress',
      });
    },
  });

  post({
    loadTimeMs: performance.now() - startedAt,
    model: TEXT_SPIKE_MODEL,
    type: 'ready',
  });

  return generator;
}

type Generator = Awaited<ReturnType<typeof createGenerator>>;

let generator: Generator | null = null;
let generatorPromise: Promise<Generator> | null = null;
let activeRequestId: string | null = null;
let cancellationRequested = false;

function post(message: TextModelWorkerEvent) {
  scope.postMessage(message);
}

async function getGenerator() {
  if (generator) {
    post({
      loadTimeMs: 0,
      model: TEXT_SPIKE_MODEL,
      type: 'ready',
    });
    return generator;
  }

  generatorPromise ??= createGenerator();

  try {
    generator = await generatorPromise;
    return generator;
  } catch (error) {
    generatorPromise = null;
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
  post({ type: 'unloaded' });
}

scope.addEventListener('message', (event: MessageEvent<TextModelWorkerRequest>) => {
  const request = event.data;

  switch (request.type) {
    case 'load':
      void getGenerator().catch((error: unknown) => {
        post({
          message: error instanceof Error ? error.message : 'Model loading failed.',
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
