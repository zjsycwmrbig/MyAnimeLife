const DB_NAME = "bangumi-scout-index";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "current";

let memorySnapshot = null;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function readIndexSnapshot() {
  if (memorySnapshot) {
    return memorySnapshot;
  }

  try {
    const database = await openDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to read index cache"));
      transaction.oncomplete = () => database.close();
    });
  } catch {
    return null;
  }
}

export async function writeIndexSnapshot(snapshot) {
  memorySnapshot = snapshot;

  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Failed to write index cache"));
    });
    database.close();
  } catch {
    // The in-memory snapshot still supports the current page.
  }
}

export async function clearIndexSnapshot() {
  memorySnapshot = null;

  try {
    const database = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Failed to clear index cache"));
    });
    database.close();
  } catch {
    // There is nothing else to clear.
  }
}
