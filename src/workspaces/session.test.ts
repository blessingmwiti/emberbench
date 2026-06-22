import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appendWorkspaceMessage, createWorkspaceSession, parseWorkspaceSession } from './session';

describe('workspace sessions', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a local session and derives its title from the first user message', () => {
    const session = createWorkspaceSession(
      'assistant',
      'Untitled session',
      'smollm2-135m-q4',
      new Date('2026-06-22T06:00:00.000Z'),
    );
    const updated = appendWorkspaceMessage(
      session,
      'user',
      '  Help me plan a private writing workflow.  ',
      new Date('2026-06-22T06:01:00.000Z'),
    );

    expect(updated.title).toBe('Help me plan a private writing workflow.');
    expect(updated.messages[0]).toMatchObject({
      content: 'Help me plan a private writing workflow.',
      role: 'user',
    });
    expect(parseWorkspaceSession(updated)).toEqual(updated);
  });

  it('rejects malformed and empty messages', () => {
    const session = createWorkspaceSession('assistant');
    expect(() => appendWorkspaceMessage(session, 'user', '   ')).toThrow('cannot be empty');
    expect(parseWorkspaceSession({ ...session, workspace: 'unknown' })).toBeNull();
    expect(
      parseWorkspaceSession({
        ...session,
        messages: [{ content: '', createdAt: session.createdAt, id: 'bad', role: 'user' }],
      }),
    ).toBeNull();
  });
});
