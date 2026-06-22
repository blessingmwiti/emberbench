export const CODE_LAB_LANGUAGES = [
  'plaintext',
  'javascript',
  'typescript',
  'python',
  'rust',
  'go',
  'shell',
] as const;

export const CODE_LAB_MODES = ['explain', 'generate', 'refactor', 'debug', 'review'] as const;

export type CodeLabLanguage = (typeof CODE_LAB_LANGUAGES)[number];
export type CodeLabMode = (typeof CODE_LAB_MODES)[number];

export interface CodeLabDraft {
  code: string;
  instruction: string;
  language: CodeLabLanguage;
  mode: CodeLabMode;
  schemaVersion: 1;
}

export const EMPTY_CODE_LAB_DRAFT: CodeLabDraft = {
  code: '',
  instruction: '',
  language: 'typescript',
  mode: 'explain',
  schemaVersion: 1,
};

export function parseCodeLabDraft(value: unknown): CodeLabDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<CodeLabDraft>;
  if (
    draft.schemaVersion !== 1 ||
    !CODE_LAB_LANGUAGES.includes(draft.language as CodeLabLanguage) ||
    !CODE_LAB_MODES.includes(draft.mode as CodeLabMode) ||
    typeof draft.code !== 'string' ||
    typeof draft.instruction !== 'string'
  ) {
    return null;
  }
  return draft as CodeLabDraft;
}

export function serializeCodeLabDraft(draft: CodeLabDraft) {
  const parsed = parseCodeLabDraft(draft);
  if (!parsed) throw new Error('The Code Lab draft is invalid.');
  return JSON.stringify(parsed);
}

export function deserializeCodeLabDraft(content: string) {
  try {
    return parseCodeLabDraft(JSON.parse(content));
  } catch {
    return null;
  }
}

export function codeLabHint(draft: CodeLabDraft) {
  const language =
    draft.language === 'plaintext'
      ? 'the supplied text'
      : `${draft.language[0]?.toUpperCase()}${draft.language.slice(1)} code`;
  const hints: Record<CodeLabMode, string> = {
    debug: `Include the observed error or unexpected behavior, then isolate the smallest failing path in ${language}.`,
    explain: `Select a focused section of ${language} and describe the depth or audience you want.`,
    generate: `Describe inputs, outputs, constraints, and edge cases before generating ${language}.`,
    refactor: `State the behavior that must remain unchanged and the quality you want improved in ${language}.`,
    review: `Call out security, correctness, performance, or maintainability priorities for ${language}.`,
  };
  return hints[draft.mode];
}
