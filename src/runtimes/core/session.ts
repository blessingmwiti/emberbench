import type { RuntimeSession, RuntimeSessionState } from './types';

export function createRuntimeSession(modelId: string): RuntimeSession {
  return {
    createdAt: new Date().toISOString(),
    id: crypto.randomUUID(),
    modelId,
    state: 'loading',
  };
}

export function transitionRuntimeSession(
  session: RuntimeSession,
  state: RuntimeSessionState,
): RuntimeSession {
  return {
    ...session,
    state,
  };
}
