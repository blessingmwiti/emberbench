import { describe, expect, it } from 'vitest';

import {
  codeLabHint,
  deserializeCodeLabDraft,
  EMPTY_CODE_LAB_DRAFT,
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
});
