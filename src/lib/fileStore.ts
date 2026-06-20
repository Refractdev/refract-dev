import { canonicalizeEntries, canonicalizePath } from '../engine/path'

const DB_NAME = 'refract-files';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

/**
 * Opens or creates the IndexedDB "refract-files" with version 1
 * and object store "projects" using implicit keyPath.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error || new Error('Failed to open database'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Serializes the Map to an object and saves it in the IndexedDB under the projectId key.
 */
export async function saveProjectFiles(projectId: string, fileMap: Map<string, string>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const { map, collisions } = canonicalizeEntries(fileMap.entries());
    if (collisions.length > 0) {
      console.warn('[IndexedDB] saveProjectFiles collapsed duplicate canonical paths:', collisions);
    }

    const record: Record<string, string> = {};
    for (const [key, value] of map.entries()) {
      record[key] = value;
    }

    await new Promise<void>((resolve, reject) => {
      const request = store.put(record, projectId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to save project files'));
    });
  } catch (error) {
    console.error('[IndexedDB] saveProjectFiles failed:', error);
  }
}

// No hardcoded files

export async function loadProjectFiles(projectId: string): Promise<Map<string, string> | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const record = await new Promise<Record<string, string> | undefined>((resolve, reject) => {
      const request = store.get(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Failed to load project files'));
    });

    if (!record) {
      return null;
    }

    const { map, collisions } = canonicalizeEntries(Object.entries(record));
    if (collisions.length > 0) {
      console.warn('[IndexedDB] loadProjectFiles collapsed duplicate canonical paths:', collisions);
    }

    const needsMigration =
      collisions.length > 0 ||
      Object.keys(record).some((key) => canonicalizePath(key).path !== key);

    if (needsMigration) {
      const writeTx = db.transaction(STORE_NAME, 'readwrite');
      const writeStore = writeTx.objectStore(STORE_NAME);
      const canonicalRecord: Record<string, string> = {};
      for (const [key, value] of map.entries()) {
        canonicalRecord[key] = value;
      }

      await new Promise<void>((resolve, reject) => {
        const request = writeStore.put(canonicalRecord, projectId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error('Failed to migrate project files'));
      });
    }

    return map;
  } catch (error) {
    console.error('[IndexedDB] loadProjectFiles failed:', error);
    return null;
  }
}

/**
 * Removes the entry from IndexedDB when the project is deleted.
 */
export async function deleteProjectFiles(projectId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.delete(projectId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to delete project files'));
    });
  } catch (error) {
    console.error('[IndexedDB] deleteProjectFiles failed:', error);
  }
}

/**
 * Clears all project files — for debug/reset.
 */
export async function clearAllProjectFiles(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to clear database'));
    });
  } catch (error) {
    console.error('[IndexedDB] clearAllProjectFiles failed:', error);
  }
}
