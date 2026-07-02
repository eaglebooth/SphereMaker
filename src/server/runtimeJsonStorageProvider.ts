import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Store = Record<string, string>;

export class RuntimeJsonStorageProvider {
  readonly id = 'sphere-maker-json-storage';
  readonly name = 'Sphere Maker JSON Storage';
  readonly type = 'local' as const;
  readonly fileName = 'wallet.json';
  private readonly filePath: string;
  private data: Store = {};
  private connected = false;
  private queue = Promise.resolve();
  private identity: unknown;

  constructor(private readonly dataDir: string) {
    this.filePath = join(dataDir, this.fileName);
  }

  setIdentity(identity: unknown): void {
    this.identity = identity;
  }

  getIdentity(): unknown {
    return this.identity;
  }

  async connect(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    try {
      this.data = JSON.parse(await readFile(this.filePath, 'utf8')) as Store;
    } catch {
      this.data = {};
      await this.flush();
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.flushQueued();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getStatus(): { connected: boolean } {
    return { connected: this.connected };
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.data[key] ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureConnected();
    await this.enqueue(async () => {
      this.data[key] = value;
      await this.flush();
    });
  }

  async remove(key: string): Promise<void> {
    await this.ensureConnected();
    await this.enqueue(async () => {
      delete this.data[key];
      await this.flush();
    });
  }

  async has(key: string): Promise<boolean> {
    await this.ensureConnected();
    return key in this.data;
  }

  async keys(prefix = ''): Promise<string[]> {
    await this.ensureConnected();
    return Object.keys(this.data).filter((key) => key.startsWith(prefix));
  }

  async clear(prefix = ''): Promise<void> {
    await this.ensureConnected();
    await this.enqueue(async () => {
      for (const key of Object.keys(this.data)) {
        if (!prefix || key.startsWith(prefix)) {
          delete this.data[key];
        }
      }
      await this.flush();
    });
  }

  async saveTrackedAddresses(entries: unknown[]): Promise<void> {
    await this.set('__tracked_addresses', JSON.stringify(entries));
  }

  async loadTrackedAddresses(): Promise<unknown[]> {
    const raw = await this.get('__tracked_addresses');
    return raw ? (JSON.parse(raw) as unknown[]) : [];
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  private async flushQueued(): Promise<void> {
    await this.enqueue(() => this.flush());
  }

  private async flush(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
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
