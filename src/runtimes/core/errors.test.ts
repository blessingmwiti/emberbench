import { describe, expect, it } from 'vitest';

import { toDownloadRuntimeError } from './errors';

describe('download error mapping', () => {
  it.each([
    ['403 Forbidden', 'private, gated, or require authentication', false],
    ['404 Not Found', 'revision or manifest may be stale', false],
    ['429 rate limit exceeded', 'rate-limiting downloads', true],
    ['503 Service Unavailable', 'server error', true],
    ['TypeError: Failed to fetch because of CORS', 'cross-origin browser downloads', true],
  ])('maps %s to actionable guidance', (message, guidance, recoverable) => {
    const error = toDownloadRuntimeError(new Error(message), true);
    expect(error.code).toBe('DOWNLOAD_FAILED');
    expect(error.message).toContain(guidance);
    expect(error.recoverable).toBe(recoverable);
  });

  it('prioritizes known offline state over an ambiguous fetch failure', () => {
    const error = toDownloadRuntimeError(new Error('Failed to fetch'), false);
    expect(error).toMatchObject({
      code: 'NETWORK_UNAVAILABLE',
      recoverable: true,
    });
  });
});
