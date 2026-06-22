import { describe, expect, it, vi } from 'vitest';

import { RuntimeError } from '../runtimes/core/errors';
import { withBoundedRetry } from './retry';

describe('bounded retry', () => {
  it('retries transient failures and returns the successful result', async () => {
    const operation = vi
      .fn<(_: number) => Promise<string>>()
      .mockRejectedValueOnce(new RuntimeError('DOWNLOAD_FAILED', 'network'))
      .mockResolvedValue('done');

    await expect(withBoundedRetry(operation, { delaysMs: [0] })).resolves.toBe('done');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry cancellation or permanent runtime errors', async () => {
    const cancelled = vi.fn().mockRejectedValue(new DOMException('stop', 'AbortError'));
    await expect(withBoundedRetry(cancelled, { delaysMs: [0, 0] })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(cancelled).toHaveBeenCalledTimes(1);

    const unsupported = vi
      .fn()
      .mockRejectedValue(new RuntimeError('UNSUPPORTED_MODEL', 'unsupported'));
    await expect(withBoundedRetry(unsupported, { delaysMs: [0] })).rejects.toThrow('unsupported');
    expect(unsupported).toHaveBeenCalledTimes(1);
  });

  it('awaits retry state persistence before the next attempt', async () => {
    const order: string[] = [];
    const operation = vi
      .fn<(_: number) => Promise<string>>()
      .mockImplementationOnce(() => {
        order.push('attempt-1');
        return Promise.reject(new RuntimeError('DOWNLOAD_FAILED', 'network'));
      })
      .mockImplementationOnce(() => {
        order.push('attempt-2');
        return Promise.resolve('done');
      });

    await withBoundedRetry(operation, {
      delaysMs: [0],
      onRetry: async () => {
        await Promise.resolve();
        order.push('persisted');
      },
    });

    expect(order).toEqual(['attempt-1', 'persisted', 'attempt-2']);
  });
});
