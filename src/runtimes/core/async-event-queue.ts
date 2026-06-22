export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly buffered: T[] = [];
  private readonly readers: Array<{
    reject: (reason?: unknown) => void;
    resolve: (result: IteratorResult<T>) => void;
  }> = [];
  private failure: Error | null = null;
  private finished = false;

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next(),
    };
  }

  end() {
    if (this.finished) {
      return;
    }

    this.finished = true;
    this.flushReaders();
  }

  fail(error: unknown) {
    if (this.finished) {
      return;
    }

    this.failure = error instanceof Error ? error : new Error(String(error));
    this.finished = true;
    this.flushReaders();
  }

  push(value: T) {
    if (this.finished) {
      return;
    }

    const reader = this.readers.shift();
    if (reader) {
      reader.resolve({ done: false, value });
      return;
    }

    this.buffered.push(value);
  }

  private next(): Promise<IteratorResult<T>> {
    const value = this.buffered.shift();
    if (value !== undefined) {
      return Promise.resolve({ done: false, value });
    }
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    if (this.finished) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise((resolve, reject) => {
      this.readers.push({ reject, resolve });
    });
  }

  private flushReaders() {
    for (const reader of this.readers.splice(0)) {
      if (this.failure) {
        reader.reject(this.failure);
      } else {
        reader.resolve({ done: true, value: undefined });
      }
    }
  }
}
