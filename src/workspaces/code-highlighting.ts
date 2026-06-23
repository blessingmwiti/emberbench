import type { CodeLabLanguage } from './code-lab-draft';

export type CodeHighlightTokenKind =
  | 'comment'
  | 'keyword'
  | 'number'
  | 'operator'
  | 'plain'
  | 'string';

export interface CodeHighlightToken {
  kind: CodeHighlightTokenKind;
  text: string;
}

const KEYWORDS: Record<Exclude<CodeLabLanguage, 'plaintext'>, Set<string>> = {
  go: new Set([
    'break',
    'case',
    'chan',
    'const',
    'continue',
    'default',
    'defer',
    'else',
    'fallthrough',
    'for',
    'func',
    'go',
    'goto',
    'if',
    'import',
    'interface',
    'map',
    'package',
    'range',
    'return',
    'select',
    'struct',
    'switch',
    'type',
    'var',
  ]),
  javascript: new Set([
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'let',
    'new',
    'of',
    'return',
    'switch',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'yield',
  ]),
  python: new Set([
    'and',
    'as',
    'assert',
    'async',
    'await',
    'break',
    'class',
    'continue',
    'def',
    'del',
    'elif',
    'else',
    'except',
    'False',
    'finally',
    'for',
    'from',
    'global',
    'if',
    'import',
    'in',
    'is',
    'lambda',
    'None',
    'nonlocal',
    'not',
    'or',
    'pass',
    'raise',
    'return',
    'True',
    'try',
    'while',
    'with',
    'yield',
  ]),
  rust: new Set([
    'as',
    'async',
    'await',
    'break',
    'const',
    'continue',
    'crate',
    'dyn',
    'else',
    'enum',
    'extern',
    'false',
    'fn',
    'for',
    'if',
    'impl',
    'in',
    'let',
    'loop',
    'match',
    'mod',
    'move',
    'mut',
    'pub',
    'ref',
    'return',
    'self',
    'Self',
    'static',
    'struct',
    'super',
    'trait',
    'true',
    'type',
    'unsafe',
    'use',
    'where',
    'while',
  ]),
  shell: new Set([
    'case',
    'do',
    'done',
    'elif',
    'else',
    'esac',
    'export',
    'fi',
    'for',
    'function',
    'if',
    'in',
    'local',
    'readonly',
    'return',
    'set',
    'shift',
    'then',
    'until',
    'while',
  ]),
  typescript: new Set([
    'abstract',
    'as',
    'async',
    'await',
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'declare',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'finally',
    'for',
    'from',
    'function',
    'if',
    'implements',
    'import',
    'in',
    'interface',
    'keyof',
    'let',
    'namespace',
    'new',
    'of',
    'private',
    'protected',
    'public',
    'readonly',
    'return',
    'satisfies',
    'switch',
    'throw',
    'try',
    'type',
    'typeof',
    'var',
    'void',
    'while',
    'yield',
  ]),
};

const HASH_COMMENT_LANGUAGES = new Set<CodeLabLanguage>(['python', 'shell']);
const SLASH_COMMENT_LANGUAGES = new Set<CodeLabLanguage>([
  'go',
  'javascript',
  'rust',
  'typescript',
]);

function pushPlain(tokens: CodeHighlightToken[], text: string) {
  if (!text) return;
  const last = tokens.at(-1);
  if (last?.kind === 'plain') {
    last.text += text;
    return;
  }
  tokens.push({ kind: 'plain', text });
}

function readQuotedString(line: string, start: number, quote: '"' | "'" | '`') {
  let index = start + 1;
  while (index < line.length) {
    if (line[index] === '\\') {
      index += 2;
      continue;
    }
    if (line[index] === quote) return index + 1;
    index += 1;
  }
  return line.length;
}

function readWord(line: string, start: number) {
  let index = start;
  while (index < line.length && /[A-Za-z0-9_$]/.test(line[index] ?? '')) index += 1;
  return index;
}

function readNumber(line: string, start: number) {
  let index = start;
  while (index < line.length && /[0-9A-Fa-f_xob.]/.test(line[index] ?? '')) index += 1;
  return index;
}

function tokenizeLine(line: string, language: Exclude<CodeLabLanguage, 'plaintext'>) {
  const tokens: CodeHighlightToken[] = [];
  const keywords = KEYWORDS[language];
  let index = 0;

  while (index < line.length) {
    const char = line[index] ?? '';
    const next = line[index + 1] ?? '';

    if (HASH_COMMENT_LANGUAGES.has(language) && char === '#') {
      tokens.push({ kind: 'comment', text: line.slice(index) });
      break;
    }

    if (SLASH_COMMENT_LANGUAGES.has(language) && char === '/' && next === '/') {
      tokens.push({ kind: 'comment', text: line.slice(index) });
      break;
    }

    if (SLASH_COMMENT_LANGUAGES.has(language) && char === '/' && next === '*') {
      const end = line.indexOf('*/', index + 2);
      const tokenEnd = end === -1 ? line.length : end + 2;
      tokens.push({ kind: 'comment', text: line.slice(index, tokenEnd) });
      index = tokenEnd;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const end = readQuotedString(line, index, char);
      tokens.push({ kind: 'string', text: line.slice(index, end) });
      index = end;
      continue;
    }

    if (/[0-9]/.test(char)) {
      const end = readNumber(line, index);
      tokens.push({ kind: 'number', text: line.slice(index, end) });
      index = end;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      const end = readWord(line, index);
      const word = line.slice(index, end);
      tokens.push({ kind: keywords.has(word) ? 'keyword' : 'plain', text: word });
      index = end;
      continue;
    }

    if (/[{}()[\].,;:+\-*/%=<>!&|?]/.test(char)) {
      tokens.push({ kind: 'operator', text: char });
      index += 1;
      continue;
    }

    pushPlain(tokens, char);
    index += 1;
  }

  return tokens;
}

export function highlightCode(value: string, language: CodeLabLanguage): CodeHighlightToken[] {
  if (!value || language === 'plaintext') return value ? [{ kind: 'plain', text: value }] : [];

  return value.split('\n').flatMap((line, index, lines) => {
    const lineTokens = tokenizeLine(line, language);
    if (index < lines.length - 1) lineTokens.push({ kind: 'plain', text: '\n' });
    return lineTokens;
  });
}
