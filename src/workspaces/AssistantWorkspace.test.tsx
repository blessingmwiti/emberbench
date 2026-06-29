import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  getSettings: vi.fn(),
  listSessions: vi.fn(),
  putSettings: vi.fn(),
  putSession: vi.fn(),
}));

vi.mock('../storage/database', () => {
  return {
    DEFAULT_ASSISTANT_GENERATION_SETTINGS: {
      maxNewTokens: 128,
      temperature: 0,
      topP: 1,
    },
    WORKSPACE_SESSIONS_CHANGED_EVENT: 'emberbench:workspace-sessions-changed',
    appSettings: {
      get: mocks.getSettings,
      put: mocks.putSettings,
    },
    workspaceSessions: {
      delete: mocks.deleteSession,
      list: mocks.listSessions,
      put: mocks.putSession,
    },
  };
});

vi.mock('../storage/install-model', () => ({
  installModel: vi.fn(),
}));

import { AssistantWorkspace } from './AssistantWorkspace';
import { appendWorkspaceMessage, createWorkspaceSession } from './session';

describe('AssistantWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({
      assistantGeneration: {
        maxNewTokens: 128,
        temperature: 0,
        topP: 1,
      },
      confirmLargeDownloads: true,
      defaultCachedFilesOnly: true,
      id: 'app',
      runtimePreference: 'auto',
      schemaVersion: 1,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores persisted conversation messages without requiring network access', async () => {
    let session = createWorkspaceSession('assistant', 'Offline planning', 'smollm2-135m-q4');
    session = appendWorkspaceMessage(session, 'user', 'Can I read this without internet?');
    session = appendWorkspaceMessage(session, 'assistant', 'Yes, this is stored locally.');
    mocks.listSessions.mockResolvedValue([session]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network should not be used while restoring history.'))),
    );

    render(<AssistantWorkspace />);

    expect(await screen.findAllByText('Can I read this without internet?')).toHaveLength(2);
    expect(screen.getByText('Yes, this is stored locally.')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
