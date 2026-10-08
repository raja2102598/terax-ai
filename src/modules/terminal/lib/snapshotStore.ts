import type { SerializeOutput } from "./rendererPool";
import { SnapshotLedger } from "./snapshotLedger";

const DB_NAME = "terax-terminal-snapshots";
const STORE_NAME = "snapshots";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
const ledger = new SnapshotLedger();

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof window === "undefined") {
    return Promise.reject(new Error("No IndexedDB in SSR"));
  }

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function writeSnapshot(leafId: number, data: SerializeOutput): Promise<void> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data, leafId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    ledger.forget(leafId);
    console.warn("[terax] Failed to save terminal snapshot to IDB", e);
  }
}

// `produce` serializes the whole buffer, so it only runs when the terminal
// changed since the last write for this leaf.
export function putSnapshotIfChanged(
  leafId: number,
  revision: number,
  produce: () => SerializeOutput,
): Promise<void> {
  if (ledger.isCurrent(leafId, revision)) return Promise.resolve();
  ledger.record(leafId, revision);
  return writeSnapshot(leafId, produce());
}

export async function getSnapshot(leafId: number): Promise<SerializeOutput | null> {
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(leafId);
      req.onsuccess = () => resolve(req.result as SerializeOutput | undefined ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[terax] Failed to load terminal snapshot from IDB", e);
    return null;
  }
}

export async function deleteSnapshot(leafId: number): Promise<void> {
  ledger.forget(leafId);
  try {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(leafId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("[terax] Failed to delete terminal snapshot from IDB", e);
  }
}
