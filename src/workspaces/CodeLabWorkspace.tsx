import { useEffect, useRef, useState } from 'react';

import { findCuratedModel } from '../models/catalog/registry';
import { RuntimeError } from '../runtimes/core/errors';
import { TransformersTextWorkerAdapter } from '../runtimes/transformers/text-worker-adapter';
import {
  resolveTransformersRuntimeDevice,
  type TransformersRuntimeDevice,
} from '../runtimes/transformers/runtime-device';
import {
  appSettings,
  WORKSPACE_SESSIONS_CHANGED_EVENT,
  workspaceSessions,
} from '../storage/database';
import { installModel } from '../storage/install-model';
import {
  appendWorkspaceMessage,
  createWorkspaceSession,
  renameWorkspaceSession,
  type WorkspaceSession,
} from './session';
import {
  CODE_LAB_LANGUAGES,
  CODE_LAB_MODES,
  codeLabHint,
  codeLabPrompt,
  deserializeCodeLabDraft,
  EMPTY_CODE_LAB_DRAFT,
  extractGeneratedCode,
  serializeCodeLabDraft,
  type CodeLabDraft,
  type CodeLabLanguage,
  type CodeLabMode,
} from './code-lab-draft';
import { copyText } from './clipboard';
import { MarkdownContent } from './MarkdownContent';

const curatedCodeModel = findCuratedModel('qwen2.5-coder-0.5b-q4');
if (!curatedCodeModel) throw new Error('The curated Code Lab model is missing.');
const codeModel = curatedCodeModel;

const MODE_LABELS: Record<CodeLabMode, string> = {
  debug: 'Debug',
  explain: 'Explain',
  generate: 'Generate',
  refactor: 'Refactor',
  review: 'Review',
};

function sessionDraft(session: WorkspaceSession) {
  const content = [...session.messages]
    .reverse()
    .find((message) => message.role === 'user')?.content;
  return content ? deserializeCodeLabDraft(content) : null;
}

export function CodeLabWorkspace() {
  const adapterRef = useRef<TransformersTextWorkerAdapter | null>(null);
  const requestRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<WorkspaceSession[]>([]);
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [draft, setDraft] = useState<CodeLabDraft>(EMPTY_CODE_LAB_DRAFT);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'running' | 'error'>('idle');
  const [runtimeDevice, setRuntimeDevice] = useState<TransformersRuntimeDevice | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void workspaceSessions
        .list()
        .then((items) => {
          if (!active) return;
          const codeSessions = items.filter((item) => item.workspace === 'code');
          setSessions(codeSessions);
          setSession((current) => {
            const next = current
              ? (codeSessions.find((item) => item.id === current.id) ?? current)
              : (codeSessions[0] ?? null);
            const restored = next ? sessionDraft(next) : null;
            if (restored) setDraft(restored);
            return next;
          });
        })
        .catch(() => {
          if (active) setError('Local Code Lab drafts could not be loaded.');
        });
    };
    refresh();
    window.addEventListener(WORKSPACE_SESSIONS_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      adapterRef.current?.terminate();
      window.removeEventListener(WORKSPACE_SESSIONS_CHANGED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    void appSettings.get().then((settings) => {
      setRuntimeDevice(resolveTransformersRuntimeDevice(settings.runtimePreference));
    });
  }, []);

  function selectSession(item: WorkspaceSession) {
    setSession(item);
    setDraft(sessionDraft(item) ?? EMPTY_CODE_LAB_DRAFT);
    setStreamingText('');
    setNotice(null);
    setError(null);
  }

  async function persistDraftSnapshot() {
    if (!draft.code.trim() && !draft.instruction.trim()) {
      throw new Error('Add code or an instruction before saving this draft.');
    }
    const title =
      draft.instruction.trim().slice(0, 60) || `${MODE_LABELS[draft.mode]} ${draft.language} draft`;
    const isNewSession = session === null;
    let activeSession = session ?? createWorkspaceSession('code', title, codeModel.id);
    const serializedDraft = serializeCodeLabDraft(draft);
    if (
      activeSession.messages.filter((message) => message.role === 'user').at(-1)?.content !==
      serializedDraft
    ) {
      activeSession = appendWorkspaceMessage(activeSession, 'user', serializedDraft);
    }
    if (isNewSession) {
      activeSession = renameWorkspaceSession(activeSession, title);
    }
    await workspaceSessions.put(activeSession);
    setSession(activeSession);
    return activeSession;
  }

  async function saveDraft() {
    try {
      await persistDraftSnapshot();
      setNotice('Draft saved locally.');
      setError(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'The local draft could not be saved.',
      );
    }
  }

  async function ensureReady() {
    if (adapterRef.current?.session?.state === 'ready') return adapterRef.current;
    setStatus('loading');
    const settings = await appSettings.get();
    const device = resolveTransformersRuntimeDevice(settings.runtimePreference);
    setRuntimeDevice(device);
    const adapter = new TransformersTextWorkerAdapter(undefined, device);
    adapterRef.current?.terminate();
    adapterRef.current = adapter;
    await installModel({
      adapter,
      cachedFilesOnly: true,
      manifest: codeModel,
    });
    setStatus('ready');
    return adapter;
  }

  async function runDraft() {
    if (status === 'loading' || status === 'running') return;
    setError(null);
    setNotice(null);
    setStreamingText('');

    try {
      let activeSession = await persistDraftSnapshot();
      const settings = await appSettings.get();
      const adapter = await ensureReady();
      const requestId = crypto.randomUUID();
      requestRef.current = requestId;
      setStatus('running');
      let reply = '';
      for await (const event of adapter.run(
        { kind: 'text', text: codeLabPrompt(draft) },
        {
          maxNewTokens: settings.assistantGeneration.maxNewTokens,
          requestId,
          temperature: settings.assistantGeneration.temperature,
          topP: settings.assistantGeneration.topP,
        },
      )) {
        if (requestRef.current !== requestId) continue;
        if (event.type === 'token') {
          reply += event.text;
          setStreamingText(reply);
        }
      }
      if (requestRef.current !== requestId) return;
      activeSession = appendWorkspaceMessage(
        activeSession,
        'assistant',
        reply.trim() || 'The model returned no text.',
      );
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
      setError(runError instanceof Error ? runError.message : 'The local code model failed.');
      setStatus('error');
    }
  }

  async function stopRun() {
    const requestId = requestRef.current;
    if (!requestId) return;
    await adapterRef.current?.abort(requestId);
  }

  async function copyGeneratedCode(content: string) {
    try {
      await copyText(extractGeneratedCode(content));
      setNotice('Generated code copied.');
    } catch {
      setNotice('This browser did not allow clipboard access.');
    }
  }

  async function deleteSession(item: WorkspaceSession) {
    await workspaceSessions.delete(item.id);
    if (session?.id === item.id) {
      setSession(null);
      setDraft(EMPTY_CODE_LAB_DRAFT);
      setStreamingText('');
      setNotice(null);
    }
  }

  const sourceLength = draft.code.length;
  const busy = status === 'loading' || status === 'running';
  const latestResult = [...(session?.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'assistant')?.content;

  return (
    <section className="section code-workspace" aria-labelledby="code-lab-heading">
      <div className="section-heading">
        <div>
          <p className="kicker">CODE LAB</p>
          <h1 id="code-lab-heading">Bring the code. Keep the context local.</h1>
        </div>
        <p>
          Prepare explain, generate, refactor, debug, and review tasks in a focused local workspace.
          Drafts and model output stay in this browser, and the pinned code model loads only from
          verified cached files.
        </p>
      </div>

      <div className="code-lab-layout">
        <aside>
          <button
            className="button button--primary"
            onClick={() => {
              setSession(null);
              setDraft(EMPTY_CODE_LAB_DRAFT);
              setStreamingText('');
              setNotice(null);
              setError(null);
            }}
            type="button"
          >
            New code draft
          </button>
          <div className="code-session-list">
            {sessions.map((item) => (
              <div className={session?.id === item.id ? 'is-active' : ''} key={item.id}>
                <button onClick={() => selectSession(item)} type="button">
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

        <div className="code-lab-editor">
          <div className="assistant-runtime-status code-runtime-status" role="status">
            <div>
              <span>Active model</span>
              <strong>{codeModel.name}</strong>
            </div>
            <div>
              <span>Runtime</span>
              <strong>
                {runtimeDevice === 'webgpu'
                  ? 'WebGPU'
                  : runtimeDevice === 'wasm'
                    ? 'WebAssembly'
                    : 'Detecting…'}
              </strong>
            </div>
            <div>
              <span>Privacy</span>
              <strong>Cached files only</strong>
            </div>
            <div className={`assistant-runtime-status__state is-${status}`}>
              <span>Local inference</span>
              <strong>
                {status === 'loading'
                  ? 'Loading'
                  : status === 'running'
                    ? 'Generating'
                    : status === 'error'
                      ? 'Needs attention'
                      : status === 'ready'
                        ? 'Ready'
                        : 'On demand'}
              </strong>
            </div>
          </div>
          <div className="code-mode-tabs" aria-label="Code task mode">
            {CODE_LAB_MODES.map((mode) => (
              <button
                aria-pressed={draft.mode === mode}
                key={mode}
                onClick={() => setDraft((current) => ({ ...current, mode }))}
                type="button"
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>

          <div className="code-editor-toolbar">
            <label htmlFor="code-language">Language</label>
            <select
              id="code-language"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  language: event.target.value as CodeLabLanguage,
                }))
              }
              value={draft.language}
            >
              {CODE_LAB_LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {language === 'plaintext'
                    ? 'Plain text'
                    : `${language[0]?.toUpperCase()}${language.slice(1)}`}
                </option>
              ))}
            </select>
            <span>{sourceLength.toLocaleString()} characters</span>
          </div>

          <label className="code-editor-label" htmlFor="code-source">
            Source code
          </label>
          <textarea
            autoCapitalize="off"
            autoCorrect="off"
            data-language={draft.language}
            id="code-source"
            onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
            placeholder="Paste code here, or leave this blank when generating from instructions…"
            rows={18}
            spellCheck={false}
            value={draft.code}
          />

          <label className="code-editor-label" htmlFor="code-instruction">
            Task instructions
          </label>
          <textarea
            id="code-instruction"
            onChange={(event) =>
              setDraft((current) => ({ ...current, instruction: event.target.value }))
            }
            placeholder="Describe the bug, desired change, constraints, or review priorities…"
            rows={5}
            value={draft.instruction}
          />

          <p className="code-lab-hint">{codeLabHint(draft)}</p>
          {sourceLength > 12_000 ? (
            <p className="code-lab-warning" role="status">
              This draft is large for a browser model. Narrow the relevant section before running
              it.
            </p>
          ) : null}
          <p className="code-lab-review-note">
            AI-generated code must be reviewed and tested before execution.
          </p>

          <div className="code-lab-actions">
            <button
              className="button button--primary"
              disabled={busy}
              onClick={() => void saveDraft()}
              type="button"
            >
              Save local draft
            </button>
            {status === 'running' ? (
              <button
                className="button button--danger"
                onClick={() => void stopRun()}
                type="button"
              >
                Stop generation
              </button>
            ) : (
              <button
                className="button"
                disabled={busy || (!draft.code.trim() && !draft.instruction.trim())}
                onClick={() => void runDraft()}
                type="button"
              >
                {status === 'loading' ? 'Loading local model…' : 'Run locally'}
              </button>
            )}
          </div>
          {latestResult || streamingText ? (
            <article className="code-lab-result" aria-live="polite">
              <span>{streamingText ? 'Generating locally' : 'Local result'}</span>
              <MarkdownContent content={streamingText || latestResult || ''} />
              {!streamingText && latestResult ? (
                <button
                  className="model-remove-button"
                  onClick={() => void copyGeneratedCode(latestResult)}
                  type="button"
                >
                  Copy generated code
                </button>
              ) : null}
            </article>
          ) : null}
          {error ? (
            <p className="assistant-error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="assistant-notice" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
