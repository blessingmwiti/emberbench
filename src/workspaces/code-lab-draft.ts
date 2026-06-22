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

export function codeLabPrompt(draft: CodeLabDraft) {
  const recipes: Record<CodeLabMode, string> = {
    debug:
      'Find the most likely cause, explain the failing path, and propose the smallest safe fix. Include corrected code when useful.',
    explain:
      'Explain what the code does, how the important parts interact, and any non-obvious behavior. Match the requested audience.',
    generate:
      'Generate complete code that follows the stated inputs, outputs, constraints, and edge cases. State any assumptions briefly.',
    refactor:
      'Refactor for the requested quality while preserving behavior. Explain the material changes and return the revised code.',
    review:
      'Review for correctness, security, performance, and maintainability. Prioritize findings and show concrete fixes.',
  };
  const instruction = draft.instruction.trim() || 'Use best judgment for this task.';
  const source = draft.code.trim()
    ? `\n\nSource (${draft.language}):\n\`\`\`${draft.language}\n${draft.code.trim()}\n\`\`\``
    : '';

  return [
    '<|im_start|>system',
    'You are a careful local coding assistant. Never claim code was executed. Remind the user to review and test changes before execution.',
    '<|im_end|>',
    '<|im_start|>user',
    `Task mode: ${draft.mode}`,
    `Instruction: ${instruction}`,
    recipes[draft.mode],
    source,
    '<|im_end|>',
    '<|im_start|>assistant',
  ].join('\n');
}

export function extractGeneratedCode(content: string) {
  const fenced = /```(?:[A-Za-z0-9_-]+)?\s*\n([\s\S]*?)```/.exec(content);
  return fenced?.[1]?.trim() || content.trim();
}
