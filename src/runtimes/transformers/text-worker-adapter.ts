import type { ModelManifest, ModelPrecision } from '../../models/catalog/types';
import type { TextModelWorkerEvent, TextModelWorkerRequest } from '../../model-lab/protocol';
import { AsyncEventQueue } from '../core/async-event-queue';
import { assertRunnableInput, requireLoadedRuntime } from '../core/contract';
import { RuntimeError, toDownloadRuntimeError, toRuntimeError } from '../core/errors';
import { createRuntimeSession, transitionRuntimeSession } from '../core/session';
import type {
  ModelInput,
  ModelRuntimeAdapter,
  RuntimeDownloadOptions,
  RuntimeEvent,
  RuntimeLoadOptions,
  RuntimeRunOptions,
  RuntimeCacheStatus,
  RuntimeCapabilities,
  RuntimeCacheDeleteResult,
  RuntimeSession,
} from '../core/types';
import { ArtifactProgressTracker } from './artifact-progress';
import {
  discoverTransformersRuntimeDevice,
  type TransformersRuntimeDevice,
} from './runtime-device';

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

function toWorkerConfig(manifest: ModelManifest, device: TransformersRuntimeDevice) {
  return {
    device,
    dtype: getPrecision(manifest),
    modelId: manifest.source.modelId,
    revision: manifest.source.revision,
  };
}

export class TransformersTextWorkerAdapter implements ModelRuntimeAdapter {
  readonly id = 'transformers-js/text-worker';
  private activeRequestId: string | null = null;
  private artifactProgress: ArtifactProgressTracker | null = null;
  private currentManifest: ModelManifest | null = null;
  private deletePromise: {
    reject: (reason?: unknown) => void;
    resolve: (result: RuntimeCacheDeleteResult) => void;
  } | null = null;
  private cachePromise: {
    reject: (reason?: unknown) => void;
    resolve: (status: RuntimeCacheStatus) => void;
  } | null = null;
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
  private worker: WorkerLike;
  private readonly workerFactory: WorkerFactory;
  private readonly device: TransformersRuntimeDevice;
  session: RuntimeSession | null = null;

  constructor(
    workerFactory: WorkerFactory = createTextWorker,
    device = discoverTransformersRuntimeDevice(),
  ) {
    this.workerFactory = workerFactory;
    this.device = device;
    this.worker = workerFactory();
    this.bindWorker();
  }

  capabilities(): RuntimeCapabilities {
    return {
      cacheInspection: true,
      devices: ['webgpu', 'wasm'],
      inputKinds: ['text'],
      runtime: 'transformers-js',
      streaming: true,
      tasks: ['text-generation'],
    };
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
    this.artifactProgress = new ArtifactProgressTracker(manifest);
    const abort = () => {
      queue.fail(new RuntimeError('ABORTED', 'Model download was aborted.', { recoverable: true }));
      this.downloadQueue = null;
      this.worker.terminate();
      this.session = null;
      this.currentManifest = null;
      this.artifactProgress = null;
      this.worker = this.workerFactory();
      this.bindWorker();
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    this.worker.postMessage({ ...toWorkerConfig(manifest, this.device), type: 'load' });

    try {
      yield* queue;
    } finally {
      options.signal?.removeEventListener('abort', abort);
    }
  }

  deleteCache(manifest: ModelManifest): Promise<RuntimeCacheDeleteResult> {
    try {
      this.assertSupportedManifest(manifest);
      if (this.deletePromise) {
        throw new RuntimeError('ALREADY_RUNNING', 'Model cache deletion is already running.', {
          recoverable: true,
        });
      }
      if (this.downloadQueue || this.loadPromise || this.runQueue) {
        throw new RuntimeError(
          'ALREADY_RUNNING',
          'Wait for the active model operation before deleting its cache.',
          { recoverable: true },
        );
      }

      const deleting = new Promise<RuntimeCacheDeleteResult>((resolve, reject) => {
        this.deletePromise = { reject, resolve };
      });
      this.worker.postMessage({
        ...toWorkerConfig(manifest, this.device),
        type: 'delete-cache',
      });
      return deleting;
    } catch (error) {
      return Promise.reject(toRuntimeError(error, 'CACHE_DELETE_FAILED'));
    }
  }

  inspect(manifest: ModelManifest): Promise<null> {
    this.assertSupportedManifest(manifest);
    return Promise.resolve(null);
  }

  inspectCache(manifest: ModelManifest): Promise<RuntimeCacheStatus> {
    try {
      this.assertSupportedManifest(manifest);
      if (this.cachePromise) {
        throw new RuntimeError('ALREADY_RUNNING', 'A cache inspection is already running.', {
          recoverable: true,
        });
      }

      const inspecting = new Promise<RuntimeCacheStatus>((resolve, reject) => {
        this.cachePromise = { reject, resolve };
      });
      this.worker.postMessage({
        ...toWorkerConfig(manifest, this.device),
        type: 'inspect-cache',
      });
      return inspecting;
    } catch (error) {
      return Promise.reject(toRuntimeError(error, 'INITIALIZATION_FAILED'));
    }
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
        ...toWorkerConfig(manifest, this.device),
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
    this.artifactProgress = null;
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

  private bindWorker() {
    this.worker.addEventListener('message', (event) => this.handleMessage(event.data));
    this.worker.addEventListener('error', (event) => {
      this.failPending(
        this.downloadQueue
          ? toDownloadRuntimeError(
              event instanceof ErrorEvent
                ? (event.error ?? new Error(event.message))
                : new Error('The model worker stopped unexpectedly.'),
            )
          : new RuntimeError('INITIALIZATION_FAILED', 'The model worker stopped unexpectedly.'),
      );
    });
  }

  private failPending(error: RuntimeError) {
    this.downloadQueue?.fail(error);
    this.downloadQueue = null;
    this.artifactProgress = null;
    this.cachePromise?.reject(error);
    this.cachePromise = null;
    this.deletePromise?.reject(error);
    this.deletePromise = null;
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
      case 'progress': {
        const progress = this.artifactProgress?.update(message.data);
        this.downloadQueue?.push({
          ...progress,
          phase: 'download',
          progress: progress?.progress ?? 0,
          type: 'progress',
        });
        break;
      }
      case 'ready': {
        if (this.downloadQueue) {
          this.downloadQueue.push({ phase: 'initialize', progress: 1, type: 'progress' });
          this.downloadQueue.end();
          this.downloadQueue = null;
          this.artifactProgress = null;
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
            firstTokenMs: message.firstTokenMs,
            requestId: message.requestId,
            tokenCount: message.tokenCount,
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
        const error = this.downloadQueue
          ? toDownloadRuntimeError(new Error(message.message))
          : toRuntimeError(new Error(message.message), 'INITIALIZATION_FAILED');
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
        this.cachePromise?.resolve({
          cached: message.cached,
          files: message.files,
        });
        this.cachePromise = null;
        break;
      case 'cache-deleted':
        this.session = null;
        this.currentManifest = null;
        this.deletePromise?.resolve({
          filesCached: message.filesCached,
          filesDeleted: message.filesDeleted,
        });
        this.deletePromise = null;
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
