// brief stream type

export class BriefStream<T> {
  private chunks: T[] = [];
  private resolvers: ((result: IteratorResult<T>) => void)[] = [];
  private done = false;

  push(value: T): void {
    if (this.done) return;
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve({ value, done: false });
    } else {
      this.chunks.push(value);
    }
  }

  end(): void {
    this.done = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as any, done: true });
    }
    this.resolvers = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.chunks.length > 0) {
          return Promise.resolve({ value: this.chunks.shift()!, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined as any, done: true });
        }
        return new Promise(resolve => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}
