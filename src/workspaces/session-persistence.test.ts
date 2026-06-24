import { afterEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CODE_LAB_DRAFT, serializeCodeLabDraft } from './code-lab-draft';
import { appendWorkspaceMessage, createWorkspaceSession, parseWorkspaceSession } from './session';
import { serializeVisionSessionSnapshot } from '../vision-lab/vision-session';

function persistedRoundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('workspace session reload persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores assistant conversation sessions after a persisted reload round trip', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000010');
    let session = createWorkspaceSession('assistant', 'Assistant', 'smollm2-135m-q4');
    session = appendWorkspaceMessage(session, 'user', 'Summarize this locally.');
    session = appendWorkspaceMessage(session, 'assistant', 'Local summary.');

    expect(parseWorkspaceSession(persistedRoundTrip(session))).toEqual(session);
  });

  it('restores Code Lab draft sessions after a persisted reload round trip', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000011');
    let session = createWorkspaceSession('code', 'Code draft', 'qwen2.5-coder-0.5b-q4');
    session = appendWorkspaceMessage(
      session,
      'user',
      serializeCodeLabDraft({
        ...EMPTY_CODE_LAB_DRAFT,
        code: 'const unsafe = input();',
        instruction: 'Review untrusted input handling.',
        mode: 'review',
      }),
    );

    expect(parseWorkspaceSession(persistedRoundTrip(session))).toEqual(session);
  });

  it('restores Vision metadata sessions without storing image files after a persisted reload round trip', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000012');
    let session = createWorkspaceSession('vision', 'a small illustrated house', 'vit-gpt2');
    session = appendWorkspaceMessage(
      session,
      'assistant',
      serializeVisionSessionSnapshot({
        caption: 'a small illustrated house',
        durationMs: 1534,
        imageMetadata: {
          height: 420,
          originalBytes: 500_000,
          processedBytes: 12_600,
          resized: false,
          width: 640,
        },
        loadTimeMs: 2450,
        modelId: 'vit-gpt2',
        runtimeDevice: 'webgpu',
        schemaVersion: 1,
      }),
    );

    const restored = parseWorkspaceSession(persistedRoundTrip(session));
    expect(restored).toEqual(session);
    expect(restored?.messages[0]?.content).not.toContain('blob');
  });
});
