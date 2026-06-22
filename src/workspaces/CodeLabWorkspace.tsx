import { useEffect, useState } from 'react';

import { WORKSPACE_SESSIONS_CHANGED_EVENT, workspaceSessions } from '../storage/database';
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
  deserializeCodeLabDraft,
  EMPTY_CODE_LAB_DRAFT,
  serializeCodeLabDraft,
  type CodeLabDraft,
  type CodeLabLanguage,
  type CodeLabMode,
} from './code-lab-draft';

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
  const [sessions, setSessions] = useState<WorkspaceSession[]>([]);
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [draft, setDraft] = useState<CodeLabDraft>(EMPTY_CODE_LAB_DRAFT);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      window.removeEventListener(WORKSPACE_SESSIONS_CHANGED_EVENT, refresh);
    };
  }, []);

  function selectSession(item: WorkspaceSession) {
    setSession(item);
    setDraft(sessionDraft(item) ?? EMPTY_CODE_LAB_DRAFT);
    setNotice(null);
    setError(null);
  }

  async function saveDraft() {
    if (!draft.code.trim() && !draft.instruction.trim()) {
      setError('Add code or an instruction before saving this draft.');
      return;
    }
    try {
      const title =
        draft.instruction.trim().slice(0, 60) ||
        `${MODE_LABELS[draft.mode]} ${draft.language} draft`;
      const isNewSession = session === null;
      let activeSession = session ?? createWorkspaceSession('code', title);
      activeSession = appendWorkspaceMessage(activeSession, 'user', serializeCodeLabDraft(draft));
      if (isNewSession) {
        activeSession = renameWorkspaceSession(activeSession, title);
      }
      await workspaceSessions.put(activeSession);
      setSession(activeSession);
      setNotice('Draft saved locally.');
      setError(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'The local draft could not be saved.',
      );
    }
  }

  async function deleteSession(item: WorkspaceSession) {
    await workspaceSessions.delete(item.id);
    if (session?.id === item.id) {
      setSession(null);
      setDraft(EMPTY_CODE_LAB_DRAFT);
      setNotice(null);
    }
  }

  const sourceLength = draft.code.length;

  return (
    <section className="section code-workspace" aria-labelledby="code-lab-heading">
      <div className="section-heading">
        <div>
          <p className="kicker">CODE LAB</p>
          <h1 id="code-lab-heading">Bring the code. Keep the context local.</h1>
        </div>
        <p>
          Prepare explain, generate, refactor, debug, and review tasks in a focused local workspace.
          Drafts stay in this browser. A curated code model will be connected in the next runtime
          milestone.
        </p>
      </div>

      <div className="code-lab-layout">
        <aside>
          <button
            className="button button--primary"
            onClick={() => {
              setSession(null);
              setDraft(EMPTY_CODE_LAB_DRAFT);
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
              onClick={() => void saveDraft()}
              type="button"
            >
              Save local draft
            </button>
            <button className="button" disabled type="button">
              Local run · model coming next
            </button>
          </div>
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
