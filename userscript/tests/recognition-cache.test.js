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
