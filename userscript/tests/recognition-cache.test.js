import test from "node:test";
import assert from "node:assert/strict";
import { createRecognitionCacheStore } from "../src/core/recognition-cache.js";

function installMemoryStorage() {
  const memory = new Map();
  globalThis.GM_getValue = (key, fallback) =>
    memory.has(key) ? memory.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => memory.set(key, value);
  return memory;
}

test("restores an unsynced recognition draft for the same page", () => {
  installMemoryStorage();
  const store = createRecognitionCacheStore();
  const selectedResult = {
    item: {
      id: "bangumi:525565",
      title: "测试番剧",
      displayTitle: "测试番剧",
      names: ["测试番剧"],
    },
    confidence: 0.9,
  };

  store.save("https://www.bilibili.com/bangumi/play/ep1?from=search", {
    item: selectedResult.item,
    selectedResult,
    recognitionResult: {
      status: "matched",
      best: selectedResult,
      results: [selectedResult],
      context: { summary: "缓存的简介", comments: ["缓存的评论"] },
    },
    rating: 9,
    review: "尚未同步的短评",
    updatedAt: "2026-10-26T08:00:00.000Z",
  });

  const restored = store.get(
    "https://www.bilibili.com/bangumi/play/ep1?from=another",
  );
  assert.equal(restored.item.id, "bangumi:525565");
  assert.equal(restored.rating, 9);
  assert.equal(restored.review, "尚未同步的短评");
  assert.equal(restored.recognitionResult.status, "matched");
  assert.equal(restored.recognitionResult.context.summary, "缓存的简介");
});

test("clears recognition drafts by page or anime identity", () => {
  installMemoryStorage();
  const store = createRecognitionCacheStore();
  const item = { id: "bangumi:1", title: "A", names: ["A"] };
  store.save("https://example.com/anime/a", { item, rating: 8 });
  store.save("https://example.com/anime/b", { item, rating: 9 });

  assert.equal(store.clear("https://example.com/anime/a"), true);
  assert.equal(store.get("https://example.com/anime/a"), null);
  assert.equal(store.clearItem("bangumi:1"), true);
  assert.equal(store.get("https://example.com/anime/b"), null);
});

test("returns the latest unsynced draft across pages", () => {
  installMemoryStorage();
  const store = createRecognitionCacheStore();
  store.save("https://example.com/anime/old", {
    item: { id: "bangumi:1", title: "旧草稿", names: ["旧草稿"] },
    updatedAt: "2026-10-26T08:00:00.000Z",
  });
  store.save("https://example.com/anime/new?from=search", {
    item: { id: "bangumi:2", title: "新草稿", names: ["新草稿"] },
    rating: 10,
    updatedAt: "2026-10-26T09:00:00.000Z",
  });

  const latest = store.getLatest();
  assert.equal(latest.pageUrl, "https://example.com/anime/new");
  assert.equal(latest.draft.item.id, "bangumi:2");
  assert.equal(latest.draft.rating, 10);

  const fallback = store.getLatest({
    excludePageUrl: "https://example.com/anime/new",
  });
  assert.equal(fallback.pageUrl, "https://example.com/anime/old");
  assert.equal(fallback.draft.item.id, "bangumi:1");
});

test("handles invalid draft timestamps when finding the latest draft", () => {
  installMemoryStorage();
  const store = createRecognitionCacheStore();
  store.save("https://example.com/anime/invalid", {
    item: { id: "bangumi:1", title: "无效时间", names: ["无效时间"] },
    updatedAt: "not-a-date",
  });
  store.save("https://example.com/anime/valid", {
    item: { id: "bangumi:2", title: "有效时间", names: ["有效时间"] },
    updatedAt: "2026-10-26T09:00:00.000Z",
  });

  assert.equal(store.getLatest().draft.item.id, "bangumi:2");
  assert.equal(store.get("https://example.com/anime/invalid").item.id, "bangumi:1");
});
