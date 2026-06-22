import { RuntimeError } from './errors';
import type { ModelInput, ModelRuntimeAdapter, RuntimeRunOptions } from './types';

export function requireLoadedRuntime(adapter: ModelRuntimeAdapter) {
  if (!adapter.session || adapter.session.state === 'unloaded') {
    throw new RuntimeError('MODEL_NOT_LOADED', 'Load a model before running inference.', {
      recoverable: true,
    });
  }
  return adapter.session;
}

export function assertRunnableInput(input: ModelInput, options: RuntimeRunOptions) {
  if (!options.requestId.trim()) {
    throw new RuntimeError('INVALID_INPUT', 'Every runtime request needs an identifier.');
  }

  if (input.kind === 'text' && input.text.trim() === '') {
    throw new RuntimeError('INVALID_INPUT', 'Text input cannot be empty.', {
      recoverable: true,
    });
  }

  if (input.kind !== 'text' && input.data.byteLength === 0) {
    throw new RuntimeError('INVALID_INPUT', `${input.kind} input cannot be empty.`, {
      recoverable: true,
    });
  }

  if (
    options.maxNewTokens !== undefined &&
    (!Number.isInteger(options.maxNewTokens) ||
      options.maxNewTokens < 1 ||
      options.maxNewTokens > 512)
  ) {
    throw new RuntimeError('INVALID_INPUT', 'Maximum output tokens must be between 1 and 512.', {
      recoverable: true,
    });
  }

  if (
    options.temperature !== undefined &&
    (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2)
  ) {
    throw new RuntimeError('INVALID_INPUT', 'Temperature must be between 0 and 2.', {
      recoverable: true,
    });
  }

  if (
    options.topP !== undefined &&
    (!Number.isFinite(options.topP) || options.topP <= 0 || options.topP > 1)
  ) {
    throw new RuntimeError('INVALID_INPUT', 'Top P must be greater than 0 and at most 1.', {
      recoverable: true,
    });
  }
}
