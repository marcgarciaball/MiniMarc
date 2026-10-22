/**
 * Browser only. The share the service worker kept on this device (public/sw.js, `putShare`):
 * IndexedDB `agente-compartir` / `shares`, keyed by a random id. Same names as the worker.
 */
export const SHARE_DB = 'agente-compartir';
export const SHARE_STORE = 'shares';

export type StashedFile = { name: string; type: string; blob: Blob };
export type StashedShare = { id: string; createdAt: number; title: string; text: string; url: string; files: StashedFile[] };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(SHARE_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, mode);
      const req = fn(tx.objectStore(SHARE_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** The stashed share, or null when it is gone (already saved or discarded, or never stored). */
export async function readShare(id: string): Promise<StashedShare | null> {
  const value = await run('readonly', (s) => s.get(id) as IDBRequest<StashedShare | undefined>);
  return value ?? null;
}

export async function deleteShare(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}
