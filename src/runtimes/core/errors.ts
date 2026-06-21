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
  if (normalized.includes('device lost')) {
    return new RuntimeError('DEVICE_LOST', message, {
      cause: error,
      recoverable: true,
    });
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
