export interface DownloadLease {
  release(): void;
}

interface QueueEntry {
  modelId: string;
  reject: (reason?: unknown) => void;
  resolve: (lease: DownloadLease) => void;
  signal?: AbortSignal;
}

export class DuplicateDownloadError extends Error {
  constructor(modelId: string) {
    super(`A download for ${modelId} is already active or queued.`);
    this.name = 'DuplicateDownloadError';
  }
}

export class ModelDownloadCoordinator {
  private active = false;
  private readonly locks: LockManager | null;
  private readonly queue: QueueEntry[] = [];
  private readonly reservedModels = new Set<string>();

  constructor(
    locks: LockManager | null = typeof navigator !== 'undefined' && 'locks' in navigator
      ? navigator.locks
      : null,
  ) {
    this.locks = locks;
  }

  acquire(modelId: string, signal?: AbortSignal): Promise<DownloadLease> {
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Download was aborted.', 'AbortError'));
    }
    if (this.reservedModels.has(modelId)) {
      return Promise.reject(new DuplicateDownloadError(modelId));
    }

    this.reservedModels.add(modelId);
    return new Promise((resolve, reject) => {
      const entry: QueueEntry = { modelId, reject, resolve, signal };
      const abort = () => {
        const index = this.queue.indexOf(entry);
        if (index >= 0) {
          this.queue.splice(index, 1);
          this.reservedModels.delete(modelId);
          reject(new DOMException('Download was aborted.', 'AbortError'));
        }
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.queue.push(entry);
      this.drain();
    });
  }

  position(modelId: string): number | null {
    const index = this.queue.findIndex((entry) => entry.modelId === modelId);
    return index === -1 ? null : index + (this.active ? 1 : 0);
  }

  private drain() {
    if (this.active) return;
    const entry = this.queue.shift();
    if (!entry) return;
    if (entry.signal?.aborted) {
      this.reservedModels.delete(entry.modelId);
      entry.reject(new DOMException('Download was aborted.', 'AbortError'));
      this.drain();
      return;
    }

    this.active = true;
    void this.acquireBrowserLocks(entry)
      .then((browserLease) => {
        let released = false;
        entry.resolve({
          release: () => {
            if (released) return;
            released = true;
            browserLease.release();
            this.active = false;
            this.reservedModels.delete(entry.modelId);
            this.drain();
          },
        });
      })
      .catch((error: unknown) => {
        this.active = false;
        this.reservedModels.delete(entry.modelId);
        entry.reject(error);
        this.drain();
      });
  }

  private async acquireBrowserLocks(entry: QueueEntry): Promise<DownloadLease> {
    if (!this.locks) {
      return { release() {} };
    }

    const modelLease = await this.holdBrowserLock(`emberbench:model-download:${entry.modelId}`, {
      ifAvailable: true,
      mode: 'exclusive',
    });
    if (!modelLease) {
      throw new DuplicateDownloadError(entry.modelId);
    }

    try {
      const globalLease = await this.holdBrowserLock('emberbench:model-download-slot', {
        mode: 'exclusive',
        signal: entry.signal,
      });
      if (!globalLease) {
        throw new Error('The browser did not grant the model download lock.');
      }
      return {
        release: () => {
          globalLease.release();
          modelLease.release();
        },
      };
    } catch (error) {
      modelLease.release();
      throw error;
    }
  }

  private holdBrowserLock(name: string, options: LockOptions): Promise<DownloadLease | null> {
    if (!this.locks) return Promise.resolve(null);
    const locks = this.locks;

    return new Promise((resolve, reject) => {
      let releaseHold: (() => void) | null = null;
      const hold = new Promise<void>((release) => {
        releaseHold = release;
      });

      void locks
        .request(name, options, async (lock) => {
          if (!lock) {
            resolve(null);
            return;
          }
          let released = false;
          resolve({
            release: () => {
              if (released) return;
              released = true;
              releaseHold?.();
            },
          });
          await hold;
        })
        .catch(reject);
    });
  }
}

export const modelDownloads = new ModelDownloadCoordinator();
