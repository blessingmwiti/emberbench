import { RuntimeError } from '../runtimes/core/errors';

export interface RetryOptions {
  delaysMs?: number[];
  onRetry?: (attempt: number, error: unknown) => void;
  signal?: AbortSignal;
}

function abortError() {
  return new DOMException('Operation was aborted.', 'AbortError');
}

function isRetriable(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (!(error instanceof RuntimeError)) return true;
  return ['DOWNLOAD_FAILED', 'INITIALIZATION_FAILED', 'DEVICE_LOST'].includes(error.code);
}

function wait(milliseconds: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timeout);
      reject(abortError());
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withBoundedRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const delays = options.delaysMs ?? [500, 1_500];

  for (let attempt = 1; ; attempt += 1) {
    if (options.signal?.aborted) throw abortError();
    try {
      return await operation(attempt);
    } catch (error) {
      const delay = delays[attempt - 1];
      if (delay === undefined || !isRetriable(error)) throw error;
      options.onRetry?.(attempt + 1, error);
      await wait(delay, options.signal);
    }
  }
}
