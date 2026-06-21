import { describe, expect, it } from 'vitest';

import { assertRunnableInput, requireLoadedRuntime } from './contract';
import { RuntimeError, toRuntimeError } from './errors';
import { createRuntimeSession, transitionRuntimeSession } from './session';
import type { ModelRuntimeAdapter } from './types';

function createAdapter(): ModelRuntimeAdapter {
  return {
    abort: async () => {},
    async *download() {},
    id: 'fake',
    inspect: () => Promise.resolve(null),
    load: (manifest) => Promise.resolve(createRuntimeSession(manifest.id)),
    async *run() {},
    session: null,
    unload: async () => {},
  };
}

describe('runtime contract', () => {
  it('requires a loaded model', () => {
    expect(() => requireLoadedRuntime(createAdapter())).toThrow(RuntimeError);
  });

  it('validates serializable input and request identifiers', () => {
    expect(() =>
      assertRunnableInput({ kind: 'text', text: '' }, { requestId: 'request-1' }),
    ).toThrow('Text input cannot be empty');
    expect(() =>
      assertRunnableInput(
        { kind: 'image', data: new ArrayBuffer(0), mimeType: 'image/png' },
        {
          requestId: 'request-1',
        },
      ),
    ).toThrow('image input cannot be empty');
  });

  it('creates immutable session transitions', () => {
    const session = createRuntimeSession('model');
    const ready = transitionRuntimeSession(session, 'ready');
    expect(session.state).toBe('loading');
    expect(ready.state).toBe('ready');
  });

  it('maps common failures to stable error codes', () => {
    expect(toRuntimeError(new Error('GPU device lost'), 'INITIALIZATION_FAILED').code).toBe(
      'DEVICE_LOST',
    );
    expect(
      toRuntimeError(new Error('allocation failed: out of memory'), 'INITIALIZATION_FAILED').code,
    ).toBe('OUT_OF_MEMORY');
  });
});
