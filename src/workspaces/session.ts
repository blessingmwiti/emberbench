import type { WorkspaceId } from '../models/catalog/types';

export interface WorkspaceMessage {
  content: string;
  createdAt: string;
  id: string;
  role: 'assistant' | 'user';
}

export interface WorkspaceSession {
  createdAt: string;
  id: string;
  messages: WorkspaceMessage[];
  modelId: string | null;
  schemaVersion: 1;
  title: string;
  updatedAt: string;
  workspace: WorkspaceId;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parseMessage(value: unknown): WorkspaceMessage | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Partial<WorkspaceMessage>;
  if (
    typeof message.id !== 'string' ||
    !['assistant', 'user'].includes(message.role ?? '') ||
    typeof message.content !== 'string' ||
    message.content.trim().length === 0 ||
    !validTimestamp(message.createdAt)
  ) {
    return null;
  }
  return message as WorkspaceMessage;
}

export function parseWorkspaceSession(value: unknown): WorkspaceSession | null {
  if (!value || typeof value !== 'object') return null;
  const session = value as Partial<WorkspaceSession>;
  if (
    session.schemaVersion !== 1 ||
    typeof session.id !== 'string' ||
    !['assistant', 'code', 'vision'].includes(session.workspace ?? '') ||
    typeof session.title !== 'string' ||
    session.title.trim().length === 0 ||
    (session.modelId !== null && typeof session.modelId !== 'string') ||
    !validTimestamp(session.createdAt) ||
    !validTimestamp(session.updatedAt) ||
    !Array.isArray(session.messages)
  ) {
    return null;
  }
  const messages = session.messages.map(parseMessage);
  if (messages.some((message) => message === null)) return null;
  return {
    ...session,
    messages: messages as WorkspaceMessage[],
  } as WorkspaceSession;
}

export function createWorkspaceSession(
  workspace: WorkspaceId,
  title = 'Untitled session',
  modelId: string | null = null,
  now = new Date(),
): WorkspaceSession {
  const timestamp = now.toISOString();
  return {
    createdAt: timestamp,
    id: crypto.randomUUID(),
    messages: [],
    modelId,
    schemaVersion: 1,
    title,
    updatedAt: timestamp,
    workspace,
  };
}

export function appendWorkspaceMessage(
  session: WorkspaceSession,
  role: WorkspaceMessage['role'],
  content: string,
  now = new Date(),
): WorkspaceSession {
  const normalized = content.trim();
  if (!normalized) throw new Error('Workspace messages cannot be empty.');
  const createdAt = now.toISOString();
  return {
    ...session,
    messages: [
      ...session.messages,
      {
        content: normalized,
        createdAt,
        id: crypto.randomUUID(),
        role,
      },
    ],
    title:
      session.messages.length === 0 && role === 'user' ? normalized.slice(0, 60) : session.title,
    updatedAt: createdAt,
  };
}
