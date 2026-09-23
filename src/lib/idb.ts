/**
 * Minimal IndexedDB key-value store. Used only for things that belong to the
 * browser rather than the project: remembered folder handles (PRJ-06). Project
 * data is never kept only in browser storage (risk R6).
 */
const DB_NAME = 'qrapc';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('IndexedDB unavailable'));
    };
  });
  return dbPromise;
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result as T);
    tx.onerror = () => reject(tx.error ?? request.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>('readonly', (store) => store.get(key));
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await run('readwrite', (store) => store.put(value, key));
}

export async function idbDelete(key: string): Promise<void> {
  await run('readwrite', (store) => store.delete(key));
}

/** Closes the connection (tests). */
export async function idbReset(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}
