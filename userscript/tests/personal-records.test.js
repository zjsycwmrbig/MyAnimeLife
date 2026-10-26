import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalRecordStore } from "../src/core/personal-records.js";

test("preserves a remote timestamp when caching a GitHub record locally", () => {
  const memory = new Map();
  globalThis.GM_getValue = (key, fallback) =>
    memory.has(key) ? memory.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => memory.set(key, value);

  const store = createPersonalRecordStore();
  const saved = store.save(
    "bangumi:525565",
    {
      rating: 8,
      review: "远端评价",
      updatedAt: "2026-10-25T08:00:00.000Z",
    },
    { preserveUpdatedAt: true },
  );

  assert.equal(saved.updatedAt, "2026-10-25T08:00:00.000Z");
  assert.deepEqual(store.get("bangumi:525565"), saved);

  const edited = store.save("bangumi:525565", {
    rating: 9,
    review: "本地编辑",
  });
  assert.notEqual(edited.updatedAt, "2026-10-25T08:00:00.000Z");
  assert.equal(store.remove("bangumi:525565"), true);
  assert.equal(store.get("bangumi:525565").rating, null);
});
