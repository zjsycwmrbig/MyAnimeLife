import {
  buildCatalog,
  catalogFacets,
  isValidCatalog,
  searchCatalog,
} from "../scripts/catalog-data.mjs";

const VERSION_URL = "https://data.jsdelivr.com/v1/package/npm/bangumi-data";
const FALLBACK_VERSION_URL = "https://registry.npmjs.org/bangumi-data/latest";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DATABASE_NAME = "myanimelife-catalog";
const STORE_NAME = "catalog";
const CACHE_KEY = "bangumi-data";

let catalog = null;
let catalogPromise = null;

function sourceUrl(version) {
  return `https://cdn.jsdelivr.net/npm/bangumi-data@${encodeURIComponent(version)}/dist/data.json`;
}

async function requestJson(url, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("无法打开本地索引数据库")),
    );
  });
}

async function readCache() {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(CACHE_KEY);
      request.addEventListener("success", () => {
        const value = request.result;
        resolve(isValidCatalog(value) ? value : null);
      });
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("读取本地索引失败")),
      );
    });
  } finally {
    database.close();
  }
}

async function writeCache(catalog) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(catalog, CACHE_KEY);
      transaction.addEventListener("complete", resolve);
      transaction.addEventListener("error", () =>
        reject(transaction.error ?? new Error("写入本地索引失败")),
      );
    });
  } finally {
    database.close();
  }
}

function isFresh(catalog) {
  const checkedAt = new Date(catalog?.source?.checkedAt ?? "").getTime();
  const age = Date.now() - checkedAt;
  return Number.isFinite(checkedAt) && age >= 0 && age < MAX_AGE_MS;
}

async function fetchLatestVersion() {
  try {
    const metadata = await requestJson(VERSION_URL, 15000);
    if (metadata?.tags?.latest) {
      return String(metadata.tags.latest);
    }
  } catch {
    // Fall through to npm metadata.
  }
  const metadata = await requestJson(FALLBACK_VERSION_URL, 15000);
  if (!metadata?.version) {
    throw new Error("无法取得 bangumi-data 最新版本");
  }
  return String(metadata.version);
}

async function downloadCatalog(version) {
  const url = sourceUrl(version);
  let raw;
  try {
    raw = await requestJson(url);
  } catch {
    raw = await requestJson(
      `https://unpkg.com/bangumi-data@${encodeURIComponent(version)}/dist/data.json`,
    );
  }
  const now = new Date().toISOString();
  return buildCatalog(raw, {
    version,
    sourceUrl: url,
    fetchedAt: now,
    checkedAt: now,
  });
}

async function loadCatalog(refresh) {
  const cached = await readCache();
  if (cached && !refresh && isFresh(cached)) {
    return cached;
  }

  if (cached && !refresh) {
    void refreshStaleCatalog(cached);
    return cached;
  }

  try {
    const version = await fetchLatestVersion();
    if (cached?.source?.version === version) {
      const updated = {
        ...cached,
        source: {
          ...cached.source,
          checkedAt: new Date().toISOString(),
        },
      };
      await writeCache(updated);
      return updated;
    }
    const downloaded = await downloadCatalog(version);
    await writeCache(downloaded);
    return downloaded;
  } catch (error) {
    if (cached) {
      return cached;
    }
    throw new Error(`全量番剧索引下载失败：${error.message || "网络错误"}`);
  }
}

async function refreshStaleCatalog(cached) {
  try {
    const version = await fetchLatestVersion();
    const updated =
      cached.source?.version === version
        ? {
            ...cached,
            source: {
              ...cached.source,
              checkedAt: new Date().toISOString(),
            },
          }
        : await downloadCatalog(version);
    await writeCache(updated);
    catalog = updated;
    self.postMessage({
      type: "catalog-updated",
      payload: {
        version: updated.source.version,
        checkedAt: updated.source.checkedAt,
      },
    });
  } catch {
    // The stale local index remains usable while the network is unavailable.
  }
}

function getCatalog(refresh = false) {
  if (catalog && refresh) {
    catalog = null;
    catalogPromise = null;
  }
  if (catalog) {
    return Promise.resolve(catalog);
  }
  if (!catalogPromise) {
    catalogPromise = loadCatalog(refresh)
      .then((loaded) => {
        catalog = loaded;
        return loaded;
      })
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

async function search(options) {
  const catalog = await getCatalog(Boolean(options.refresh));
  return {
    ...searchCatalog(catalog.items, options),
    meta: {
      itemCount: catalog.itemCount,
      version: catalog.source.version,
      checkedAt: catalog.source.checkedAt,
      license: catalog.source.license,
      sourceUrl: catalog.source.sourceUrl,
    },
    facets: catalogFacets(catalog.items),
  };
}

self.addEventListener("message", async (event) => {
  const { type, requestId, options = {} } = event.data ?? {};
  if (type === "reset") {
    catalog = null;
    catalogPromise = null;
    self.postMessage({ type: "reset", requestId });
    return;
  }
  if (type === "getItems") {
    try {
      const loaded = await getCatalog(false);
      const requested = new Set(options.ids ?? []);
      self.postMessage({
        type: "result",
        requestId,
        payload: loaded.items.filter((item) => requested.has(item.id)),
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        requestId,
        error: error.message || "索引读取失败",
      });
    }
    return;
  }
  if (type !== "search") {
    return;
  }
  try {
    const payload = await search(options);
    self.postMessage({ type: "result", requestId, payload });
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      error: error.message || "索引读取失败",
    });
  }
});
