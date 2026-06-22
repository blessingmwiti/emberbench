import type { ModelManifest, ModelPrecision } from '../../models/catalog/types';
import type { VisionWorkerEvent, VisionWorkerRequest } from '../../vision-lab/protocol';
import { AsyncEventQueue } from '../core/async-event-queue';
import { assertRunnableInput, requireLoadedRuntime } from '../core/contract';
import { RuntimeError, toRuntimeError } from '../core/errors';
import { createRuntimeSession, transitionRuntimeSession } from '../core/session';
import type {
  ModelInput,
  ModelRuntimeAdapter,
  RuntimeCacheDeleteResult,
  RuntimeCacheStatus,
  RuntimeCapabilities,
  RuntimeDownloadOptions,
  RuntimeEvent,
  RuntimeLoadOptions,
  RuntimeRunOptions,
  RuntimeSession,
} from '../core/types';
import { ArtifactProgressTracker } from './artifact-progress';

interface VisionWorkerLike {
  addEventListener(type: 'error', listener: (event: Event) => void): void;
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<VisionWorkerEvent>) => void,
  ): void;
  postMessage(message: VisionWorkerRequest): void;
  terminate(): void;
}

type VisionWorkerFactory = () => VisionWorkerLike;

function createVisionWorker(): VisionWorkerLike {
  return new Worker(new URL('../../vision-lab/image-caption.worker.ts', import.meta.url), {
    type: 'module',
  });
}

function getPrecision(manifest: ModelManifest): ModelPrecision {
  const artifact = manifest.artifacts.find((candidate) => candidate.role === 'model');
  if (!artifact) {
    throw new RuntimeError('ARTIFACT_MISSING', 'The vision manifest has no model artifact.');
  }
  return artifact.precision;
}

function workerConfig(manifest: ModelManifest) {
  return {
    dtype: getPrecision(manifest),
    modelId: manifest.source.modelId,
    revision: manifest.source.revision,
  };
}

export class TransformersVisionWorkerAdapter implements ModelRuntimeAdapter {
  readonly id = 'transformers-js/vision-worker';
  private activeRequestId: string | null = null;
  private artifactProgress: ArtifactProgressTracker | null = null;
  private cachePromise: {
    reject: (reason?: unknown) => void;
    resolve: (status: RuntimeCacheStatus) => void;
  } | null = null;
  private currentManifest: ModelManifest | null = null;
  private deletePromise: {
    reject: (reason?: unknown) => void;
    resolve: (result: RuntimeCacheDeleteResult) => void;
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
  private worker: VisionWorkerLike;
  private readonly workerFactory: VisionWorkerFactory;
  session: RuntimeSession | null = null;

  constructor(workerFactory: VisionWorkerFactory = createVisionWorker) {
    this.workerFactory = workerFactory;
    this.worker = workerFactory();
    this.bindWorker();
  }

  abort(requestId?: string): Promise<void> {
    if (!this.activeRequestId || (requestId && requestId !== this.activeRequestId)) {
      return Promise.resolve();
    }

    const error = new RuntimeError('ABORTED', 'Image analysis was cancelled.', {
      recoverable: true,
    });
    this.worker.terminate();
    this.runQueue?.fail(error);
    this.runQueue = null;
    this.activeRequestId = null;
    this.session = null;
    this.currentManifest = null;
    this.worker = this.workerFactory();
    this.bindWorker();
    return Promise.resolve();
  }

  capabilities(): RuntimeCapabilities {
    return {
      cacheInspection: true,
      devices: ['webgpu'],
      inputKinds: ['image'],
      runtime: 'transformers-js',
      streaming: false,
      tasks: ['image-to-text'],
    };
  }

  deleteCache(manifest: ModelManifest): Promise<RuntimeCacheDeleteResult> {
    try {
      this.assertSupportedManifest(manifest);
      if (this.deletePromise || this.downloadQueue || this.loadPromise || this.runQueue) {
        throw new RuntimeError('ALREADY_RUNNING', 'A vision model operation is already running.', {
          recoverable: true,
        });
      }

      const deleting = new Promise<RuntimeCacheDeleteResult>((resolve, reject) => {
        this.deletePromise = { reject, resolve };
      });
      this.worker.postMessage({ ...workerConfig(manifest), type: 'delete-cache' });
      return deleting;
    } catch (error) {
      return Promise.reject(toRuntimeError(error, 'CACHE_DELETE_FAILED'));
    }
  }

  async *download(
    manifest: ModelManifest,
    options: RuntimeDownloadOptions = {},
  ): AsyncIterable<RuntimeEvent> {
    this.assertSupportedManifest(manifest);
    if (options.signal?.aborted) {
      throw new RuntimeError('ABORTED', 'Vision model download was aborted.', {
        recoverable: true,
      });
    }
    if (this.downloadQueue || this.loadPromise) {
      throw new RuntimeError('ALREADY_RUNNING', 'A vision model load is already running.', {
        recoverable: true,
      });
    }

    const queue = new AsyncEventQueue<RuntimeEvent>();
    this.downloadQueue = queue;
    this.currentManifest = manifest;
    this.artifactProgress = new ArtifactProgressTracker(manifest);
    const abort = () => {
      queue.fail(
        new RuntimeError('ABORTED', 'Vision model download was aborted.', { recoverable: true }),
      );
      this.downloadQueue = null;
      this.artifactProgress = null;
      this.worker.terminate();
      this.worker = this.workerFactory();
      this.bindWorker();
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    this.worker.postMessage({ ...workerConfig(manifest), type: 'load' });

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

  inspectCache(manifest: ModelManifest): Promise<RuntimeCacheStatus> {
    try {
      this.assertSupportedManifest(manifest);
      if (this.cachePromise) {
        throw new RuntimeError('ALREADY_RUNNING', 'A vision cache inspection is already running.', {
          recoverable: true,
        });
      }
      const inspecting = new Promise<RuntimeCacheStatus>((resolve, reject) => {
        this.cachePromise = { reject, resolve };
      });
      this.worker.postMessage({ ...workerConfig(manifest), type: 'inspect-cache' });
      return inspecting;
    } catch (error) {
      return Promise.reject(toRuntimeError(error, 'INITIALIZATION_FAILED'));
    }
  }

  load(manifest: ModelManifest, options: RuntimeLoadOptions = {}): Promise<RuntimeSession> {
    try {
      this.assertSupportedManifest(manifest);
      if (this.loadPromise || this.downloadQueue) {
        throw new RuntimeError('ALREADY_RUNNING', 'A vision model load is already running.', {
          recoverable: true,
        });
      }
      if (this.session && this.currentManifest?.id !== manifest.id) {
        throw new RuntimeError(
          'ALREADY_RUNNING',
          'Unload the current vision model before loading another model.',
          { recoverable: true },
        );
      }

      this.currentManifest = manifest;
      this.session = createRuntimeSession(manifest.id);
      const loading = new Promise<RuntimeSession>((resolve, reject) => {
        this.loadPromise = { reject, resolve };
      });
      this.worker.postMessage({
        ...workerConfig(manifest),
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
      throw new RuntimeError('ALREADY_RUNNING', 'The vision model is not ready.', {
        recoverable: true,
      });
    }
    if (input.kind !== 'image') {
      throw new RuntimeError('INVALID_INPUT', 'Image captioning requires image input.');
    }
    if (this.runQueue || this.activeRequestId) {
      throw new RuntimeError('ALREADY_RUNNING', 'Image analysis is already running.', {
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
      image: new Blob([input.data], { type: input.mimeType }),
      requestId: options.requestId,
      type: 'caption',
    });
    yield* queue;
  }

  unload(): Promise<void> {
    if (this.unloadPromise) {
      return Promise.reject(
        new RuntimeError('ALREADY_RUNNING', 'Vision model unloading is already in progress.', {
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
    this.failPending(new RuntimeError('ABORTED', 'The vision runtime adapter was terminated.'));
    this.artifactProgress = null;
    this.session = null;
    this.currentManifest = null;
  }

  private assertSupportedManifest(manifest: ModelManifest) {
    if (
      manifest.requirements.runtime !== 'transformers-js' ||
      manifest.requirements.task !== 'image-to-text'
    ) {
      throw new RuntimeError(
        'UNSUPPORTED_MODEL',
        `The ${this.id} adapter does not support ${manifest.requirements.task}.`,
      );
    }
  }

  private bindWorker() {
    this.worker.addEventListener('message', (event) => this.handleMessage(event.data));
    this.worker.addEventListener('error', () => {
      this.failPending(
        new RuntimeError('INITIALIZATION_FAILED', 'The vision worker stopped unexpectedly.'),
      );
    });
  }

  private failPending(error: RuntimeError) {
    this.cachePromise?.reject(error);
    this.cachePromise = null;
    this.deletePromise?.reject(error);
    this.deletePromise = null;
    this.downloadQueue?.fail(error);
    this.downloadQueue = null;
    this.artifactProgress = null;
    this.loadPromise?.reject(error);
    this.loadPromise = null;
    this.runQueue?.fail(error);
    this.runQueue = null;
    this.unloadPromise?.reject(error);
    this.unloadPromise = null;
    this.activeRequestId = null;
    if (this.session) {
      this.session = transitionRuntimeSession(this.session, 'error');
    }
  }

  private handleMessage(message: VisionWorkerEvent) {
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
      case 'ready':
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
      case 'result':
        if (message.requestId === this.activeRequestId) {
          this.runQueue?.push({
            data: { caption: message.caption },
            requestId: message.requestId,
            type: 'result',
          });
          this.runQueue?.push({
            durationMs: message.durationMs,
            requestId: message.requestId,
            type: 'complete',
          });
          this.runQueue?.end();
          this.runQueue = null;
          this.activeRequestId = null;
          if (this.session) {
            this.session = transitionRuntimeSession(this.session, 'ready');
          }
        }
        break;
      case 'cache-status':
        this.cachePromise?.resolve({ cached: message.cached, files: message.files });
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
      case 'unloaded':
        this.session = null;
        this.currentManifest = null;
        this.unloadPromise?.resolve();
        this.unloadPromise = null;
        break;
      case 'error': {
        const error = toRuntimeError(new Error(message.message), 'INITIALIZATION_FAILED');
        if (message.requestId && message.requestId === this.activeRequestId) {
          this.runQueue?.fail(error);
          this.runQueue = null;
          this.activeRequestId = null;
          if (this.session) {
            this.session = transitionRuntimeSession(this.session, 'error');
          }
        } else {
          this.failPending(error);
        }
        break;
      }
    }
  }
}
