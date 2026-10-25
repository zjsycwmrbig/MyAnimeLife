const DATABASE_NAME = "myanimelife-catalog-covers";
const STORE_NAME = "covers";
const MISS_TTL = 7 * 24 * 60 * 60 * 1000;
const inFlight = new Map();

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeUrl(value) {
  const url = clean(value);
  if (!url) {
    return null;
  }
  const resolved = url.startsWith("//") ? `https:${url}` : url;
  return /^https?:\/\//iu.test(resolved) ? resolved : null;
}

function cacheKey(item) {
  const id = clean(item?.sites?.bangumi);
  return id ? `bangumi:${id}` : null;
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function readCache(keys) {
  const database = await openDatabase();
  if (!database || !keys.length) {
    return new Map();
  }
  try {
    return await new Promise((resolve, reject) => {
      const values = new Map();
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      for (const key of keys) {
        const request = store.get(key);
        request.addEventListener("success", () => {
          if (request.result) {
            values.set(key, request.result);
          }
        });
      }
      transaction.addEventListener("complete", () => resolve(values));
      transaction.addEventListener("error", () => reject(transaction.error));
    });
  } finally {
    database.close();
  }
}

async function writeCache(values) {
  const database = await openDatabase();
  if (!database || !values.size) {
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      for (const [key, value] of values) {
        store.put(value, key);
      }
      transaction.addEventListener("complete", resolve);
      transaction.addEventListener("error", () => reject(transaction.error));
    });
  } finally {
    database.close();
  }
}

async function fetchBangumiCover(subjectId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `https://api.bgm.tv/v0/subjects/${encodeURIComponent(subjectId)}`,
      { headers: { Accept: "application/json" }, signal: controller.signal },
    );
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    return normalizeUrl(
      payload?.images?.large ??
        payload?.images?.common ??
        payload?.images?.medium,
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fetchCachedBangumiCover(subjectId) {
  const key = clean(subjectId);
  if (!inFlight.has(key)) {
    inFlight.set(key, fetchBangumiCover(key).finally(() => inFlight.delete(key)));
  }
  return inFlight.get(key);
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const pump = () => {
    while (active < limit && queue.length) {
      active += 1;
      const { task, resolve } = queue.shift();
      Promise.resolve(task()).then(resolve, () => resolve(null)).finally(() => {
        active -= 1;
        pump();
      });
    }
  };
  return (task) => new Promise((resolve) => {
    queue.push({ task, resolve });
    pump();
  });
}

export async function resolveCatalogCovers(items) {
  const candidates = (items ?? [])
    .map((item) => ({ item, key: cacheKey(item) }))
    .filter(({ item, key }) => !item.coverUrl && key);
  if (!candidates.length) {
    return new Map();
  }
  const cached = await readCache(candidates.map(({ key }) => key));
  const now = Date.now();
  const pending = candidates.filter(({ key }) => {
    const entry = cached.get(key);
    return !entry || now - entry.checkedAt > MISS_TTL;
  });
  const limiter = createLimiter(4);
  const updates = new Map();
  await Promise.all(
    pending.map(({ item, key }) => limiter(async () => {
      const coverUrl = await fetchCachedBangumiCover(item.sites.bangumi);
      updates.set(key, { coverUrl, checkedAt: Date.now() });
    })),
  );
  await writeCache(updates);

  const resolved = new Map();
  for (const { item, key } of candidates) {
    const entry = updates.get(key) ?? cached.get(key);
    if (entry?.coverUrl) {
      resolved.set(item.id, entry.coverUrl);
    }
  }
  return resolved;
}
