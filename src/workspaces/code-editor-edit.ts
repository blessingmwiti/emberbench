import type { CodeLabLanguage } from './code-lab-draft';

export interface CodeEditorEdit {
  selectionEnd: number;
  selectionStart: number;
  value: string;
}

const INDENT = '  ';

function selectedLineRange(value: string, selectionStart: number, selectionEnd: number) {
  const start = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const nextLine = value.indexOf('\n', selectionEnd);
  const end = nextLine === -1 ? value.length : nextLine;
  return { end, start };
}

export function indentCodeSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  unindent = false,
): CodeEditorEdit {
  if (!unindent && selectionStart === selectionEnd) {
    return {
      selectionEnd: selectionEnd + INDENT.length,
      selectionStart: selectionStart + INDENT.length,
      value: `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`,
    };
  }

  const range = selectedLineRange(value, selectionStart, selectionEnd);
  const lines = value.slice(range.start, range.end).split('\n');
  if (!unindent) {
    const replacement = lines.map((line) => `${INDENT}${line}`).join('\n');
    return {
      selectionEnd: selectionEnd + INDENT.length * lines.length,
      selectionStart: selectionStart + INDENT.length,
      value: `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`,
    };
  }

  const removed = lines.map((line) =>
    /^\t/.test(line) ? 1 : Math.min(2, /^ */.exec(line)?.[0].length ?? 0),
  );
  const replacement = lines.map((line, index) => line.slice(removed[index] ?? 0)).join('\n');
  return {
    selectionEnd: Math.max(
      range.start,
      selectionEnd - removed.reduce((sum, count) => sum + count, 0),
    ),
    selectionStart: Math.max(range.start, selectionStart - (removed[0] ?? 0)),
    value: `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`,
  };
}

export function insertIndentedNewline(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  language: CodeLabLanguage,
): CodeEditorEdit {
  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const beforeCursor = value.slice(lineStart, selectionStart);
  const leadingWhitespace = /^\s*/.exec(beforeCursor)?.[0] ?? '';
  const opensBlock =
    language !== 'plaintext' && /(?:\{|\[|\(|:|=>)\s*$/.test(beforeCursor.trimEnd());
  const insertion = `\n${leadingWhitespace}${opensBlock ? INDENT : ''}`;
  const cursor = selectionStart + insertion.length;
  return {
    selectionEnd: cursor,
    selectionStart: cursor,
    value: `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`,
  };
}

export function codeCursorPosition(value: string, selectionStart: number) {
  const before = value.slice(0, selectionStart);
  const lines = before.split('\n');
  return {
    column: (lines.at(-1)?.length ?? 0) + 1,
    line: lines.length,
  };
}
