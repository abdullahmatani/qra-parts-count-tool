/**
 * The subset of the File System Access API the app uses. Native handles from
 * `showDirectoryPicker()` and OPFS satisfy these interfaces, and so does the
 * in-memory implementation (src/lib/fs/memory.ts).
 */

export type WriteData = string | ArrayBuffer | ArrayBufferView | Blob;

export interface FsWritable {
  write(data: WriteData): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

export interface FsFileHandle {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<FsWritable>;
  /** Chromium: renames/moves the file, replacing any file already at the target. */
  move?(destination: FsDirHandle, newName: string): Promise<void>;
}

export type FsHandle = FsFileHandle | FsDirHandle;

export type PermissionMode = 'read' | 'readwrite';

export interface FsDirHandle {
  readonly kind: 'directory';
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterableIterator<[string, FsHandle]>;
  queryPermission?(descriptor?: { mode?: PermissionMode }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: PermissionMode }): Promise<PermissionState>;
}

/** True for the DOMException raised when an entry does not exist. */
export function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'NotFoundError'
  );
}

/** Casts a native handle from the browser to the app's handle interface. */
export function fromNativeDirectory(handle: FileSystemDirectoryHandle): FsDirHandle {
  return handle as unknown as FsDirHandle;
}
