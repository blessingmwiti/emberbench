import { describe, expect, it } from 'vitest';

import { codeCursorPosition, indentCodeSelection, insertIndentedNewline } from './code-editor-edit';

describe('Code Lab editor edits', () => {
  it('indents and unindents selected lines', () => {
    const indented = indentCodeSelection('one\ntwo', 0, 7);
    expect(indented.value).toBe('  one\n  two');
    expect(indented.selectionEnd).toBe(11);

    const restored = indentCodeSelection(
      indented.value,
      indented.selectionStart,
      indented.selectionEnd,
      true,
    );
    expect(restored.value).toBe('one\ntwo');
  });

  it('continues indentation and opens a nested block', () => {
    expect(insertIndentedNewline('  if ready:', 11, 11, 'python')).toMatchObject({
      value: '  if ready:\n    ',
    });
    expect(insertIndentedNewline('  value', 7, 7, 'python')).toMatchObject({
      value: '  value\n  ',
    });
  });

  it('reports one-based cursor coordinates', () => {
    expect(codeCursorPosition('one\ntwo', 6)).toEqual({ column: 3, line: 2 });
  });
});
