export const RUNTIME_ERROR_CODES = [
  'ABORTED',
  'ALREADY_RUNNING',
  'ARTIFACT_MISSING',
  'CACHE_DELETE_FAILED',
  'DEVICE_LOST',
  'DOWNLOAD_FAILED',
  'INITIALIZATION_FAILED',
  'INVALID_INPUT',
  'MODEL_NOT_LOADED',
  'NETWORK_UNAVAILABLE',
  'OUT_OF_MEMORY',
  'UNSUPPORTED_DEVICE',
  'UNSUPPORTED_MODEL',
] as const;

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

export class RuntimeError extends Error {
  readonly cause?: unknown;
  readonly code: RuntimeErrorCode;
  readonly recoverable: boolean;

  constructor(
    code: RuntimeErrorCode,
    message: string,
    options: {
      cause?: unknown;
      recoverable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    this.cause = options.cause;
  }
}

export function toRuntimeError(error: unknown, fallbackCode: RuntimeErrorCode) {
  if (error instanceof RuntimeError) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'An unknown runtime error occurred.';
  const normalized = message.toLowerCase();

  if (normalized.includes('out of memory') || normalized.includes('allocation')) {
    return new RuntimeError('OUT_OF_MEMORY', message, {
      cause: error,
      recoverable: true,
    });
  }
  if (
    normalized.includes('device lost') ||
    normalized.includes('lost the gpu device') ||
    normalized.includes('gpu device was lost')
  ) {
    return new RuntimeError(
      'DEVICE_LOST',
      'The WebGPU device was lost. Reload the model and retry; if this repeats, close other GPU-heavy tabs or choose a smaller model.',
      {
        cause: error,
        recoverable: true,
      },
    );
  }
  if (normalized.includes('abort') || normalized.includes('cancel')) {
    return new RuntimeError('ABORTED', message, {
      cause: error,
      recoverable: true,
    });
  }

  return new RuntimeError(fallbackCode, message, {
    cause: error,
  });
}

export function toDownloadRuntimeError(
  error: unknown,
  online = typeof navigator === 'undefined' ? true : navigator.onLine,
) {
  if (error instanceof RuntimeError) return error;
  const original = error instanceof Error ? error.message : 'The model download failed.';
  const message = original.toLowerCase();

  if (
    message.includes('device lost') ||
    message.includes('lost the gpu device') ||
    message.includes('gpu device was lost')
  ) {
    return new RuntimeError(
      'DEVICE_LOST',
      'The WebGPU device was lost while preparing the model. Retry the load; if this repeats, close other GPU-heavy tabs or choose a smaller model.',
      { cause: error, recoverable: true },
    );
  }
  if (!online) {
    return new RuntimeError(
      'NETWORK_UNAVAILABLE',
      'The browser is offline. Reconnect and retry to reuse any completed files.',
      { cause: error, recoverable: true },
    );
  }
  if (
    /\b(401|403)\b/.test(message) ||
    message.includes('unauthorized') ||
    message.includes('forbidden')
  ) {
    return new RuntimeError(
      'DOWNLOAD_FAILED',
      'Hugging Face denied access to a model artifact. The repository may be private, gated, or require authentication.',
      { cause: error },
    );
  }
  if (/\b404\b/.test(message) || message.includes('not found')) {
    return new RuntimeError(
      'DOWNLOAD_FAILED',
      'A pinned model artifact was not found. The repository revision or manifest may be stale.',
      { cause: error },
    );
  }
  if (/\b429\b/.test(message) || message.includes('rate limit')) {
    return new RuntimeError(
      'DOWNLOAD_FAILED',
      'Hugging Face is rate-limiting downloads. Wait briefly, then retry.',
      { cause: error, recoverable: true },
    );
  }
  if (/\b5\d\d\b/.test(message)) {
    return new RuntimeError(
      'DOWNLOAD_FAILED',
      'The model host returned a server error. Retry later; completed cached files will be reused.',
      { cause: error, recoverable: true },
    );
  }
  if (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('cors') ||
    message.includes('cross-origin')
  ) {
    return new RuntimeError(
      'DOWNLOAD_FAILED',
      'The browser could not fetch a model artifact. Check connectivity and whether the model host permits cross-origin browser downloads.',
      { cause: error, recoverable: true },
    );
  }

  return new RuntimeError('DOWNLOAD_FAILED', original, {
    cause: error,
    recoverable: true,
  });
}
