import type { ModelManifest, ModelPrecision } from '../../models/catalog/types';
import type { TextModelWorkerEvent, TextModelWorkerRequest } from '../../model-lab/protocol';
import { AsyncEventQueue } from '../core/async-event-queue';
import { assertRunnableInput, requireLoadedRuntime } from '../core/contract';
import { RuntimeError, toRuntimeError } from '../core/errors';
import { createRuntimeSession, transitionRuntimeSession } from '../core/session';
import type {
  ModelInput,
  ModelRuntimeAdapter,
  RuntimeDownloadOptions,
  RuntimeEvent,
  RuntimeLoadOptions,
  RuntimeRunOptions,
  RuntimeSession,
} from '../core/types';

interface WorkerLike {
  addEventListener(type: 'error', listener: (event: Event) => void): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<TextModelWorkerEvent>) => void,
  ): void;
  postMessage(message: TextModelWorkerRequest): void;
  terminate(): void;
}

type WorkerFactory = () => WorkerLike;

function createTextWorker(): WorkerLike {
  return new Worker(new URL('../../model-lab/text-generation.worker.ts', import.meta.url), {
    type: 'module',
  });
}

function getPrecision(manifest: ModelManifest): ModelPrecision {
  const modelArtifact = manifest.artifacts.find((artifact) => artifact.role === 'model');
  if (!modelArtifact) {
    throw new RuntimeError('ARTIFACT_MISSING', 'The model manifest has no model artifact.');
  }
  return modelArtifact.precision;
}

function toWorkerConfig(manifest: ModelManifest) {
  return {
    dtype: getPrecision(manifest),
    modelId: manifest.source.modelId,
    revision: manifest.source.revision,
  };
}

function readProgress(data: Record<string, unknown>) {
  const progress = data.progress;
  return typeof progress === 'number' ? Math.min(100, Math.max(0, progress)) / 100 : 0;
}

export class TransformersTextWorkerAdapter implements ModelRuntimeAdapter {
  readonly id = 'transformers-js/text-worker';
  private activeRequestId: string | null = null;
  private currentManifest: ModelManifest | null = null;
  private downloadQueue: AsyncEventQueue<RuntimeEvent> | null = null;
  private loadPromise: {
    reject: (reason?: unknown) => void;
    resolve: (session: RuntimeSession) => void;
  } | null = null;
  private runQueue: AsyncEventQueue<RuntimeEvent> | null = null;
  private unloadPromise: {
    reject: (reason?: unknown) => void;
    resolve: () => void;
  } | null = null;
  private readonly worker: WorkerLike;
  session: RuntimeSession | null = null;

  constructor(workerFactory: WorkerFactory = createTextWorker) {
    this.worker = workerFactory();
    this.worker.addEventListener('message', (event) => this.handleMessage(event.data));
    this.worker.addEventListener('error', () => {
      this.failPending(
        new RuntimeError('INITIALIZATION_FAILED', 'The model worker stopped unexpectedly.'),
      );
    });
  }

  abort(requestId?: string): Promise<void> {
    if (!this.activeRequestId || (requestId && requestId !== this.activeRequestId)) {
      return Promise.resolve();
    }

    if (this.session) {
      this.session = transitionRuntimeSession(this.session, 'cancelling');
    }
    this.worker.postMessage({ type: 'cancel' });
    return Promise.resolve();
  }

  async *download(
    manifest: ModelManifest,
    options: RuntimeDownloadOptions = {},
  ): AsyncIterable<RuntimeEvent> {
    this.assertSupportedManifest(manifest);
    if (options.signal?.aborted) {
      throw new RuntimeError('ABORTED', 'Model download was aborted.', { recoverable: true });
    }
    if (this.downloadQueue || this.loadPromise) {
      throw new RuntimeError('ALREADY_RUNNING', 'A model load is already running.', {
        recoverable: true,
      });
    }

    const queue = new AsyncEventQueue<RuntimeEvent>();
    this.downloadQueue = queue;
    this.currentManifest = manifest;
    const abort = () => {
      queue.fail(new RuntimeError('ABORTED', 'Model download was aborted.', { recoverable: true }));
      this.downloadQueue = null;
      this.worker.postMessage({ type: 'cancel' });
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    this.worker.postMessage({ ...toWorkerConfig(manifest), type: 'load' });

    try {
      yield* queue;
    } finally {
      options.signal?.removeEventListener('abort', abort);
    }
  }

  inspect(manifest: ModelManifest): Promise<null> {
    this.assertSupportedManifest(manifest);
    return Promise.resolve(null);
  }

  load(manifest: ModelManifest, options: RuntimeLoadOptions = {}): Promise<RuntimeSession> {
    try {
      this.assertSupportedManifest(manifest);
      if (this.loadPromise || this.downloadQueue) {
        throw new RuntimeError('ALREADY_RUNNING', 'A model load is already running.', {
          recoverable: true,
        });
      }
      if (this.session && this.currentManifest?.id !== manifest.id) {
        throw new RuntimeError(
          'ALREADY_RUNNING',
          'Unload the current model before loading another model.',
          { recoverable: true },
        );
      }

      this.currentManifest = manifest;
      this.session = createRuntimeSession(manifest.id);
      const loading = new Promise<RuntimeSession>((resolve, reject) => {
        this.loadPromise = { reject, resolve };
      });
      this.worker.postMessage({
        ...toWorkerConfig(manifest),
        cachedFilesOnly: options.cachedFilesOnly,
        type: 'load',
      });
      return loading;
    } catch (error) {
      return Promise.reject(toRuntimeError(error, 'INITIALIZATION_FAILED'));
    }
  }

  async *run(input: ModelInput, options: RuntimeRunOptions): AsyncIterable<RuntimeEvent> {
    assertRunnableInput(input, options);
    requireLoadedRuntime(this);
    if (this.session?.state !== 'ready') {
      throw new RuntimeError('ALREADY_RUNNING', 'The model is not ready for a new request.', {
        recoverable: true,
      });
    }
    if (input.kind !== 'text') {
      throw new RuntimeError('INVALID_INPUT', 'Text generation requires text input.');
    }
    if (this.runQueue || this.activeRequestId) {
      throw new RuntimeError('ALREADY_RUNNING', 'A generation request is already running.', {
        recoverable: true,
      });
    }

    const queue = new AsyncEventQueue<RuntimeEvent>();
    this.runQueue = queue;
    this.activeRequestId = options.requestId;
    if (this.session) {
      this.session = transitionRuntimeSession(this.session, 'running');
    }
    this.worker.postMessage({
      maxNewTokens: options.maxNewTokens ?? 64,
      prompt: input.text,
      requestId: options.requestId,
      type: 'generate',
    });
    yield* queue;
  }

  unload(): Promise<void> {
    if (this.unloadPromise) {
      return Promise.reject(
        new RuntimeError('ALREADY_RUNNING', 'Model unloading is already in progress.', {
          recoverable: true,
        }),
      );
    }

    const unloading = new Promise<void>((resolve, reject) => {
      this.unloadPromise = { reject, resolve };
    });
    this.worker.postMessage({ type: 'unload' });
    return unloading;
  }

  terminate() {
    this.worker.terminate();
    this.failPending(new RuntimeError('ABORTED', 'The runtime adapter was terminated.'));
    this.session = null;
    this.currentManifest = null;
  }

  private assertSupportedManifest(manifest: ModelManifest) {
    if (
      manifest.requirements.runtime !== 'transformers-js' ||
      manifest.requirements.task !== 'text-generation'
    ) {
      throw new RuntimeError(
        'UNSUPPORTED_MODEL',
        `The ${this.id} adapter does not support ${manifest.requirements.task}.`,
      );
    }
  }

  private failPending(error: RuntimeError) {
    this.downloadQueue?.fail(error);
    this.downloadQueue = null;
    this.runQueue?.fail(error);
    this.runQueue = null;
    this.loadPromise?.reject(error);
    this.loadPromise = null;
    this.unloadPromise?.reject(error);
    this.unloadPromise = null;
    this.activeRequestId = null;
    if (this.session) {
      this.session = transitionRuntimeSession(this.session, 'error');
    }
  }

  private handleMessage(message: TextModelWorkerEvent) {
    switch (message.type) {
      case 'progress':
        this.downloadQueue?.push({
          phase: 'download',
          progress: readProgress(message.data),
          type: 'progress',
        });
        break;
      case 'ready': {
        if (this.downloadQueue) {
          this.downloadQueue.push({ phase: 'initialize', progress: 1, type: 'progress' });
          this.downloadQueue.end();
          this.downloadQueue = null;
        }
        if (this.loadPromise && this.session) {
          this.session = transitionRuntimeSession(this.session, 'ready');
          this.loadPromise.resolve(this.session);
          this.loadPromise = null;
        }
        break;
      }
      case 'token':
        if (message.requestId === this.activeRequestId) {
          this.runQueue?.push({
            requestId: message.requestId,
            text: message.text,
            type: 'token',
          });
        }
        break;
      case 'complete':
        if (message.requestId === this.activeRequestId) {
          this.runQueue?.push({
            durationMs: message.durationMs,
            requestId: message.requestId,
            type: 'complete',
          });
          this.finishRun();
        }
        break;
      case 'cancelled':
        if (message.requestId === this.activeRequestId) {
          this.runQueue?.fail(
            new RuntimeError('ABORTED', 'Generation was cancelled.', { recoverable: true }),
          );
          this.finishRun();
        }
        break;
      case 'error': {
        const error = toRuntimeError(new Error(message.message), 'INITIALIZATION_FAILED');
        if (message.requestId && message.requestId === this.activeRequestId) {
          this.runQueue?.fail(error);
          this.finishRun('error');
        } else {
          this.failPending(error);
        }
        break;
      }
      case 'unloaded':
        this.session = null;
        this.currentManifest = null;
        this.activeRequestId = null;
        this.runQueue?.end();
        this.runQueue = null;
        this.unloadPromise?.resolve();
        this.unloadPromise = null;
        break;
      case 'cache-status':
        break;
    }
  }

  private finishRun(state: 'error' | 'ready' = 'ready') {
    if (state === 'ready') {
      this.runQueue?.end();
    }
    this.runQueue = null;
    this.activeRequestId = null;
    if (this.session) {
      this.session = transitionRuntimeSession(this.session, state);
    }
  }
}
