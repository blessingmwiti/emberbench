import { describe, expect, it } from 'vitest';

import {
  codeLabHint,
  codeLabPrompt,
  deserializeCodeLabDraft,
  EMPTY_CODE_LAB_DRAFT,
  extractGeneratedCode,
  serializeCodeLabDraft,
} from './code-lab-draft';

describe('Code Lab drafts', () => {
  it('round-trips a versioned local draft', () => {
    const draft = {
      ...EMPTY_CODE_LAB_DRAFT,
      code: 'const answer = 42;',
      instruction: 'Explain this to a new TypeScript developer.',
    };

    expect(deserializeCodeLabDraft(serializeCodeLabDraft(draft))).toEqual(draft);
  });

  it('rejects malformed serialized drafts', () => {
    expect(deserializeCodeLabDraft('not json')).toBeNull();
    expect(
      deserializeCodeLabDraft(JSON.stringify({ ...EMPTY_CODE_LAB_DRAFT, language: 'unsupported' })),
    ).toBeNull();
  });

  it('provides mode and language-aware guidance', () => {
    expect(codeLabHint({ ...EMPTY_CODE_LAB_DRAFT, language: 'rust', mode: 'debug' })).toContain(
      'Rust code',
    );
  });

  it('builds a mode-specific local prompt without claiming execution', () => {
    const prompt = codeLabPrompt({
      ...EMPTY_CODE_LAB_DRAFT,
      code: 'const value = input();',
      instruction: 'Review untrusted input handling.',
      mode: 'review',
    });

    expect(prompt).toContain('Review for correctness, security');
    expect(prompt).toContain('```typescript');
    expect(prompt).toContain('Never claim code was executed');
    expect(prompt).toContain('<|im_start|>assistant');
  });

  it('extracts generated fenced code for direct copying', () => {
    expect(extractGeneratedCode('Fix:\n```python\nprint("safe")\n```\nReview it.')).toBe(
      'print("safe")',
    );
    expect(extractGeneratedCode('No fenced block')).toBe('No fenced block');
  });
});
