import { describe, expect, it } from 'vitest';

import { formatBytes } from './format';

describe('formatBytes', () => {
  it('reports unavailable values honestly', () => {
    expect(formatBytes(null)).toBe('Not reported');
  });

  it('formats byte values using readable units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
  });
});
