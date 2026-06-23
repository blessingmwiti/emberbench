import { describe, expect, it } from 'vitest';

import { highlightCode } from './code-highlighting';

describe('Code Lab syntax highlighting', () => {
  it('highlights Python keywords, strings, numbers, operators, and comments', () => {
    expect(highlightCode('def answer():\n  return "ok" # 42', 'python')).toEqual([
      { kind: 'keyword', text: 'def' },
      { kind: 'plain', text: ' ' },
      { kind: 'plain', text: 'answer' },
      { kind: 'operator', text: '(' },
      { kind: 'operator', text: ')' },
      { kind: 'operator', text: ':' },
      { kind: 'plain', text: '\n' },
      { kind: 'plain', text: '  ' },
      { kind: 'keyword', text: 'return' },
      { kind: 'plain', text: ' ' },
      { kind: 'string', text: '"ok"' },
      { kind: 'plain', text: ' ' },
      { kind: 'comment', text: '# 42' },
    ]);
  });

  it('uses slash comments for TypeScript without treating hash as a comment', () => {
    expect(highlightCode('const tag = "#fff"; // color', 'typescript')).toEqual([
      { kind: 'keyword', text: 'const' },
      { kind: 'plain', text: ' ' },
      { kind: 'plain', text: 'tag ' },
      { kind: 'operator', text: '=' },
      { kind: 'plain', text: ' ' },
      { kind: 'string', text: '"#fff"' },
      { kind: 'operator', text: ';' },
      { kind: 'plain', text: ' ' },
      { kind: 'comment', text: '// color' },
    ]);
  });

  it('returns plain text tokens for plaintext drafts', () => {
    expect(highlightCode('just words # not code', 'plaintext')).toEqual([
      { kind: 'plain', text: 'just words # not code' },
    ]);
  });
});
