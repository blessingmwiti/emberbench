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
}
