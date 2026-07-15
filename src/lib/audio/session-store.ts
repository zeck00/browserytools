/**
 * IndexedDB persistence for the audio editor session, so an accidental refresh
 * doesn't lose work. Two stores in one DB:
 *  - `audio`: per-track source audio as WAV blobs (heavy, written once per track)
 *  - `meta` : a single lightweight JSON descriptor under key "current"
 *
 * All calls are browser-only (guarded) and reject rather than throw so callers
 * can degrade gracefully — persistence is best-effort, never blocks editing.
 */
import type { SessionDescriptor } from "./session-serialize";

const DB_NAME = "browsery-audio-session";
const DB_VERSION = 1;
const AUDIO_STORE = "audio";
const META_STORE = "meta";
const CURRENT_KEY = "current";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
        t.onerror = () => reject(t.error);
      })
  );
}

export function putAudio(key: string, blob: Blob): Promise<void> {
  return tx<IDBValidKey>(AUDIO_STORE, "readwrite", (s) => s.put(blob, key)).then(() => undefined);
}

export function getAudio(key: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>(AUDIO_STORE, "readonly", (s) => s.get(key));
}

export function putDescriptor(descriptor: SessionDescriptor): Promise<void> {
  return tx<IDBValidKey>(META_STORE, "readwrite", (s) => s.put(descriptor, CURRENT_KEY)).then(
    () => undefined
  );
}

export function getDescriptor(): Promise<SessionDescriptor | undefined> {
  return tx<SessionDescriptor | undefined>(META_STORE, "readonly", (s) => s.get(CURRENT_KEY));
}

/** Wipe the whole session (descriptor + all audio blobs). */
export async function clearSession(): Promise<void> {
  const desc = await getDescriptor().catch(() => undefined);
  await tx<undefined>(META_STORE, "readwrite", (s) => s.delete(CURRENT_KEY) as IDBRequest<undefined>).catch(
    () => {}
  );
  const keys = desc?.tracks.map((t) => t.audioKey) ?? [];
  await Promise.all(
    keys.map((k) =>
      tx<undefined>(AUDIO_STORE, "readwrite", (s) => s.delete(k) as IDBRequest<undefined>).catch(() => {})
    )
  );
}

/** True if a restorable session (descriptor with at least one track) exists. */
export async function hasSession(): Promise<boolean> {
  const desc = await getDescriptor().catch(() => undefined);
  return !!desc && desc.tracks.length > 0;
}
