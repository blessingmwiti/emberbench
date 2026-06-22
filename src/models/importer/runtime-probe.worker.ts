/// <reference lib="webworker" />

import { pipeline, type PipelineType } from '@huggingface/transformers';

import type { RuntimeProbeEvent, RuntimeProbeRequest } from './probe-protocol';

const scope = self as DedicatedWorkerGlobalScope;

function post(message: RuntimeProbeEvent) {
  scope.postMessage(message);
}

scope.addEventListener('message', (event: MessageEvent<RuntimeProbeRequest>) => {
  const request = event.data;
  if (request.type !== 'probe') {
    return;
  }

  void (async () => {
    const startedAt = performance.now();
    try {
      const instance = await pipeline(request.task as PipelineType, request.modelId, {
        device: 'webgpu',
        dtype: request.dtype,
        revision: request.revision,
        progress_callback: (data) => {
          post({
            data: data as unknown as Record<string, unknown>,
            type: 'progress',
          });
        },
      });

      await instance.dispose();
      post({
        durationMs: performance.now() - startedAt,
        type: 'ready',
      });
    } catch (error) {
      post({
        message: error instanceof Error ? error.message : 'Runtime initialization failed.',
        type: 'error',
      });
    }
  })();
});
