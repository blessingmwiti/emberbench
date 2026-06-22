import { useEffect, useRef, useState } from 'react';

import { findCuratedModel } from '../models/catalog/registry';
import { RuntimeError } from '../runtimes/core/errors';
import { TransformersTextWorkerAdapter } from '../runtimes/transformers/text-worker-adapter';
import { resolveTransformersRuntimeDevice } from '../runtimes/transformers/runtime-device';
import {
  appSettings,
  WORKSPACE_SESSIONS_CHANGED_EVENT,
  workspaceSessions,
} from '../storage/database';
import { installModel } from '../storage/install-model';
import { appendWorkspaceMessage, createWorkspaceSession, type WorkspaceSession } from './session';

const curatedAssistantModel = findCuratedModel('smollm2-135m-q4');
if (!curatedAssistantModel) throw new Error('The General Assistant model is missing.');
const assistantModel = curatedAssistantModel;

function conversationPrompt(session: WorkspaceSession) {
  const transcript = session.messages
    .slice(-12)
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n');
  return `Continue this helpful private conversation.\n${transcript}\nAssistant:`;
}

export function AssistantWorkspace() {
  const adapterRef = useRef<TransformersTextWorkerAdapter | null>(null);
  const requestRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<WorkspaceSession[]>([]);
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [draft, setDraft] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void workspaceSessions
        .list()
        .then((items) => {
          if (!active) return;
          const assistantSessions = items.filter((item) => item.workspace === 'assistant');
          setSessions(assistantSessions);
          setSession((current) => {
            if (current) {
              return assistantSessions.find((item) => item.id === current.id) ?? current;
            }
            return assistantSessions[0] ?? null;
          });
        })
        .catch(() => {
          if (active) setError('Local conversation history could not be loaded.');
        });
    };
    refresh();
    window.addEventListener(WORKSPACE_SESSIONS_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(WORKSPACE_SESSIONS_CHANGED_EVENT, refresh);
      adapterRef.current?.terminate();
    };
  }, []);

  async function ensureReady() {
    if (adapterRef.current?.session?.state === 'ready') return adapterRef.current;
    setStatus('loading');
    const settings = await appSettings.get();
    const device = resolveTransformersRuntimeDevice(settings.runtimePreference);
    const adapter = new TransformersTextWorkerAdapter(undefined, device);
    adapterRef.current?.terminate();
    adapterRef.current = adapter;
    await installModel({
      adapter,
      cachedFilesOnly: true,
      manifest: assistantModel,
    });
    setStatus('ready');
    return adapter;
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || status === 'running' || status === 'loading') return;
    setDraft('');
    setError(null);
    setStreamingText('');

    let activeSession =
      session ?? createWorkspaceSession('assistant', 'Untitled session', assistantModel.id);
    activeSession = appendWorkspaceMessage(activeSession, 'user', content);
    await workspaceSessions.put(activeSession);
    setSession(activeSession);

    try {
      const adapter = await ensureReady();
      const requestId = crypto.randomUUID();
      requestRef.current = requestId;
      setStatus('running');
      let reply = '';
      for await (const event of adapter.run(
        { kind: 'text', text: conversationPrompt(activeSession) },
        { maxNewTokens: 128, requestId },
      )) {
        if (requestRef.current !== requestId) continue;
        if (event.type === 'token') {
          reply += event.text;
          setStreamingText(reply);
        }
      }
      if (requestRef.current !== requestId) return;
      const normalizedReply = reply.trim() || 'The model returned no text.';
      activeSession = appendWorkspaceMessage(activeSession, 'assistant', normalizedReply);
      await workspaceSessions.put(activeSession);
      setSession(activeSession);
      setStreamingText('');
      requestRef.current = null;
      setStatus('ready');
    } catch (runError) {
      requestRef.current = null;
      if (runError instanceof RuntimeError && runError.code === 'ABORTED') {
        setStatus(adapterRef.current?.session?.state === 'ready' ? 'ready' : 'idle');
        return;
      }
      setError(
        runError instanceof Error
          ? runError.message
          : 'The local assistant could not complete this reply.',
      );
      setStatus('error');
    }
  }

  async function stopReply() {
    const requestId = requestRef.current;
    if (!requestId) return;
    await adapterRef.current?.abort(requestId);
  }

  async function deleteSession(item: WorkspaceSession) {
    await workspaceSessions.delete(item.id);
    if (session?.id === item.id) {
      setSession(null);
      setStreamingText('');
    }
  }

  const busy = status === 'loading' || status === 'running';

  return (
    <section className="section assistant-workspace" aria-labelledby="assistant-heading">
      <div className="section-heading">
        <div>
          <p className="kicker">GENERAL ASSISTANT</p>
          <h1 id="assistant-heading">Private conversation.</h1>
        </div>
        <p>
          Messages and session titles stay in this browser. The selected model runs locally from
          verified cached files; this workspace will not download a missing model silently.
        </p>
      </div>

      <div className="assistant-layout">
        <aside>
          <button
            className="button button--primary"
            onClick={() => {
              setSession(null);
              setStreamingText('');
              setError(null);
            }}
            type="button"
          >
            New conversation
          </button>
          <div className="assistant-session-list">
            {sessions.map((item) => (
              <div className={session?.id === item.id ? 'is-active' : ''} key={item.id}>
                <button onClick={() => setSession(item)} type="button">
                  <strong>{item.title}</strong>
                  <span>{new Date(item.updatedAt).toLocaleString()}</span>
                </button>
                <button
                  aria-label={`Delete ${item.title}`}
                  onClick={() => void deleteSession(item)}
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="assistant-chat">
          <div className="assistant-messages" aria-live="polite">
            {session?.messages.length ? (
              session.messages.map((message) => (
                <article
                  className={`assistant-message assistant-message--${message.role}`}
                  key={message.id}
                >
                  <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
                  <p>{message.content}</p>
                </article>
              ))
            ) : (
              <div className="assistant-empty">
                <h2>Start with the work in front of you.</h2>
                <p>Draft, summarize, plan, or think through a technical problem privately.</p>
              </div>
            )}
            {streamingText ? (
              <article className="assistant-message assistant-message--assistant">
                <span>Assistant</span>
                <p>{streamingText}</p>
              </article>
            ) : null}
          </div>

          <div className="assistant-composer">
            <label htmlFor="assistant-draft">Message</label>
            <textarea
              disabled={busy}
              id="assistant-draft"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Ask for help with writing, planning, summarization, or technical work…"
              rows={4}
              value={draft}
            />
            <div>
              {status === 'running' ? (
                <button
                  className="button button--danger"
                  onClick={() => void stopReply()}
                  type="button"
                >
                  Stop
                </button>
              ) : (
                <button
                  className="button button--primary"
                  disabled={!draft.trim() || status === 'loading'}
                  onClick={() => void sendMessage()}
                  type="button"
                >
                  {status === 'loading' ? 'Loading local model…' : 'Send'}
                </button>
              )}
              <span>{status === 'error' ? 'Needs attention' : status}</span>
            </div>
          </div>
          {error ? (
            <p className="assistant-error" role="alert">
              {error} <a href="#/models">Open Models</a>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
