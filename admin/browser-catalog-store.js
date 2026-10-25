import { catalogItemView } from "../scripts/catalog-data.mjs";

function externalKeys(externalIds) {
  return Object.entries(externalIds ?? {}).map(
    ([source, id]) => `${source}:${id}`,
  );
}

function ownedRecordMap(index) {
  const result = new Map();
  for (const entry of index ?? []) {
    result.set(`id:${entry.id}`, entry.id);
    for (const key of externalKeys(entry.externalIds)) {
      result.set(key, entry.id);
    }
  }
  return result;
}

function viewItem(item, owned) {
  const ownedRecordId =
    owned.get(`id:${item.id}`) ??
    externalKeys(item.sites).reduce(
      (found, key) => found ?? owned.get(key) ?? null,
      null,
    );
  return catalogItemView(item, ownedRecordId);
}

export class BrowserCatalogStore {
  constructor(options = {}) {
    this.createWorker =
      options.createWorker ??
      (() =>
        new Worker(new URL("./catalog-worker.js", import.meta.url), {
          type: "module",
        }));
    this.worker = null;
    this.sequence = 0;
    this.pending = new Map();
  }

  ensureWorker() {
    if (this.worker) {
      return this.worker;
    }
    this.worker = this.createWorker();
    this.worker.addEventListener("message", (event) => {
      const requestId = event.data?.requestId;
      const pending = this.pending.get(requestId);
      if (!pending) {
        return;
      }
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
      if (event.data.type === "error") {
        pending.reject(new Error(event.data.error));
      } else {
        pending.resolve(event.data.payload);
      }
    });
    this.worker.addEventListener("error", (event) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(event.message || "索引 Worker 运行失败"));
      }
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    });
    return this.worker;
  }

  request(type, options = {}, timeoutMs = 120000) {
    const worker = this.ensureWorker();
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("全量索引处理超时，请检查网络后重试"));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      worker.postMessage({ type, requestId, options });
    });
  }

  async search(options = {}, libraryIndex = []) {
    const payload = await this.request("search", options);
    const owned = ownedRecordMap(libraryIndex);
    return {
      ...payload,
      items: payload.items.map((item) => viewItem(item, owned)),
    };
  }

  async getItems(itemIds) {
    return this.request("getItems", { ids: itemIds });
  }

  async getItem(itemId) {
    const items = await this.getItems([itemId]);
    return items[0] ?? null;
  }
}
