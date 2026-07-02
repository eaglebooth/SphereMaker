type AnyStorage = Record<string, any>;

export class SerializedStorageProvider {
  private queue = Promise.resolve();

  constructor(private readonly inner: AnyStorage) {}

  get id(): string {
    return this.inner.id;
  }

  get name(): string {
    return this.inner.name;
  }

  get type(): string {
    return this.inner.type;
  }

  setIdentity(identity: unknown): void {
    this.inner.setIdentity?.(identity);
  }

  getIdentity(): unknown {
    return this.inner.getIdentity?.();
  }

  connect(): Promise<void> {
    return this.enqueue(() => this.inner.connect?.() ?? Promise.resolve());
  }

  disconnect(): Promise<void> {
    return this.enqueue(() => this.inner.disconnect?.() ?? Promise.resolve());
  }

  isConnected(): boolean {
    return this.inner.isConnected?.() ?? true;
  }

  getStatus(): unknown {
    return this.inner.getStatus?.();
  }

  get(key: string): Promise<string | null> {
    return this.enqueue(() => this.inner.get(key));
  }

  set(key: string, value: string): Promise<void> {
    return this.enqueue(() => this.inner.set(key, value));
  }

  remove(key: string): Promise<void> {
    return this.enqueue(() => this.inner.remove(key));
  }

  has(key: string): Promise<boolean> {
    return this.enqueue(() => this.inner.has(key));
  }

  keys(prefix?: string): Promise<string[]> {
    return this.enqueue(() => this.inner.keys(prefix));
  }

  clear(prefix?: string): Promise<void> {
    return this.enqueue(() => this.inner.clear(prefix));
  }

  saveTrackedAddresses(entries: unknown[]): Promise<void> {
    return this.enqueue(() => this.inner.saveTrackedAddresses?.(entries) ?? Promise.resolve());
  }

  loadTrackedAddresses(): Promise<unknown[]> {
    return this.enqueue(() => this.inner.loadTrackedAddresses?.() ?? Promise.resolve([]));
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const run = this.queue.then(action, action);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}
