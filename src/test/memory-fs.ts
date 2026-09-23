/**
 * In-memory implementation of the File System Access API subset used by the app
 * (see src/lib/fs/types.ts). Writes are committed atomically on close(), like
 * Chromium's swap-file behaviour, and faults can be injected to simulate a
 * crash part-way through a save.
 */
import type { FsDirHandle, FsFileHandle, FsHandle, FsWritable, WriteData } from '@/lib/fs/types';

function domError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export interface MemoryFsOptions {
  /** Whether file handles support move() (Chromium does; set false to test the fallback). */
  supportsMove?: boolean;
}

export interface FaultPlan {
  /** Throw when a writable for a file with this name is closed. */
  failCloseOf?: string;
  /** Throw when a file with this name is moved. */
  failMoveOf?: string;
}

class Shared {
  supportsMove: boolean;
  faults: FaultPlan = {};
  permission: PermissionState = 'granted';
  requestedPermission: PermissionState = 'granted';
  constructor(options: MemoryFsOptions) {
    this.supportsMove = options.supportsMove ?? true;
  }
}

async function toBytes(data: WriteData): Promise<Uint8Array> {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  return new Uint8Array(await (data as Blob).arrayBuffer());
}

export class MemoryFileHandle implements FsFileHandle {
  readonly kind = 'file' as const;
  name: string;
  data: Uint8Array = new Uint8Array();
  lastModified = Date.now();
  parent: MemoryDirectoryHandle;
  private readonly shared: Shared;

  constructor(name: string, parent: MemoryDirectoryHandle, shared: Shared) {
    this.name = name;
    this.parent = parent;
    this.shared = shared;
    if (!shared.supportsMove) {
      (this as { move?: unknown }).move = undefined;
    }
  }

  async getFile(): Promise<File> {
    return new File([this.data.slice()], this.name, { lastModified: this.lastModified });
  }

  async createWritable(options: { keepExistingData?: boolean } = {}): Promise<FsWritable> {
    let buffer = options.keepExistingData ? this.data.slice() : new Uint8Array();
    let closed = false;
    return {
      write: async (data) => {
        if (closed) throw domError('TypeError', 'Writable is closed');
        const bytes = await toBytes(data);
        const next = new Uint8Array(buffer.length + bytes.length);
        next.set(buffer);
        next.set(bytes, buffer.length);
        buffer = next;
      },
      close: async () => {
        if (closed) throw domError('TypeError', 'Writable is closed');
        closed = true;
        if (this.shared.faults.failCloseOf === this.name) {
          throw domError('AbortError', `Simulated failure closing ${this.name}`);
        }
        // Only now does the file content change (atomic commit).
        this.data = buffer;
        this.lastModified = Date.now();
      },
      abort: async () => {
        closed = true;
      },
    };
  }

  async move(destination: FsDirHandle, newName: string): Promise<void> {
    if (!this.shared.supportsMove) throw domError('NotSupportedError', 'move() not supported');
    if (this.shared.faults.failMoveOf === this.name) {
      throw domError('AbortError', `Simulated failure moving ${this.name}`);
    }
    const target = destination as MemoryDirectoryHandle;
    const existing = target.children.get(newName);
    if (existing?.kind === 'directory') {
      throw domError('InvalidModificationError', 'A directory exists at the target');
    }
    this.parent.children.delete(this.name);
    this.name = newName;
    this.parent = target;
    target.children.set(newName, this);
  }
}

export class MemoryDirectoryHandle implements FsDirHandle {
  readonly kind = 'directory' as const;
  readonly name: string;
  readonly children = new Map<string, MemoryFileHandle | MemoryDirectoryHandle>();
  private readonly shared: Shared;

  constructor(name: string, shared: Shared) {
    this.name = name;
    this.shared = shared;
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'directory') throw domError('TypeMismatchError', `${name} is a file`);
      return existing;
    }
    if (!options.create) throw domError('NotFoundError', `${name} not found`);
    const dir = new MemoryDirectoryHandle(name, this.shared);
    this.children.set(name, dir);
    return dir;
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}) {
    const existing = this.children.get(name);
    if (existing) {
      if (existing.kind !== 'file') throw domError('TypeMismatchError', `${name} is a directory`);
      return existing;
    }
    if (!options.create) throw domError('NotFoundError', `${name} not found`);
    const file = new MemoryFileHandle(name, this, this.shared);
    this.children.set(name, file);
    return file;
  }

  async removeEntry(name: string, options: { recursive?: boolean } = {}) {
    const existing = this.children.get(name);
    if (!existing) throw domError('NotFoundError', `${name} not found`);
    if (existing.kind === 'directory' && existing.children.size > 0 && !options.recursive) {
      throw domError('InvalidModificationError', `${name} is not empty`);
    }
    this.children.delete(name);
  }

  async *entries(): AsyncIterableIterator<[string, FsHandle]> {
    for (const [name, handle] of [...this.children.entries()]) yield [name, handle];
  }

  async queryPermission(): Promise<PermissionState> {
    return this.shared.permission;
  }

  async requestPermission(): Promise<PermissionState> {
    this.shared.permission = this.shared.requestedPermission;
    return this.shared.permission;
  }

  // ---- test helpers -------------------------------------------------------

  /** Fault injection shared by every handle in this tree. */
  get faults(): FaultPlan {
    return this.shared.faults;
  }

  set faults(plan: FaultPlan) {
    this.shared.faults = plan;
  }

  /** Sets the permission state and what requestPermission() will grant. */
  setPermission(current: PermissionState, onRequest: PermissionState = current): void {
    this.shared.permission = current;
    this.shared.requestedPermission = onRequest;
  }

  /** Synchronous tree listing for assertions, e.g. ['drawings/', 'project.qrapc.json']. */
  tree(prefix = ''): string[] {
    const out: string[] = [];
    for (const [name, handle] of [...this.children.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      if (handle.kind === 'directory') {
        out.push(`${prefix}${name}/`);
        out.push(...handle.tree(`${prefix}${name}/`));
      } else {
        out.push(`${prefix}${name}`);
      }
    }
    return out;
  }

  /** Reads a file's text synchronously for assertions. */
  textAt(path: string): string {
    const parts = path.split('/').filter(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- walking down from this node
    let node: MemoryDirectoryHandle | MemoryFileHandle = this;
    for (const part of parts) {
      if (node.kind !== 'directory') throw new Error(`${path}: not a directory`);
      const next: MemoryDirectoryHandle | MemoryFileHandle | undefined = node.children.get(part);
      if (!next) throw new Error(`${path}: not found`);
      node = next;
    }
    if (node.kind !== 'file') throw new Error(`${path}: not a file`);
    return new TextDecoder().decode(node.data);
  }
}

/** Creates an empty in-memory directory tree. */
export function createMemoryFs(
  name = 'workdir',
  options: MemoryFsOptions = {},
): MemoryDirectoryHandle {
  return new MemoryDirectoryHandle(name, new Shared(options));
}
