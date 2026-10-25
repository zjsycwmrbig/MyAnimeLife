import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSite,
  compileRecordValidator,
  loadEntries,
} from "../scripts/build.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const validRecord = {
  $schema: "../../schemas/anime.schema.json",
  schemaVersion: 1,
  id: "manual-test",
  title: "测试番剧",
  rating: null,
  review: "",
  coverUrl: null,
  note: "",
  externalIds: {},
  match: {
    status: "manual",
    method: "manual",
    source: "manual",
    confidence: 1,
    matchedTitle: "测试番剧",
    matchedAt: "2026-10-25T12:00:00Z",
  },
  createdAt: "2026-10-25T12:00:00Z",
  updatedAt: "2026-10-25T12:00:00Z",
};

test("starts without any anime records", async () => {
  const entries = await loadEntries(root);
  assert.deepEqual(entries, []);
});

test("rejects a rating outside the defined range", async () => {
  const validate = await compileRecordValidator(root);
  assert.throws(
    () => validate({ ...validRecord, rating: 11 }),
    /rating must be <= 10/u,
  );
});

test("builds an empty public data feed", async () => {
  const result = await buildSite({
    root,
    now: new Date("2026-10-25T12:00:00Z"),
  });
  assert.equal(result.entryCount, 0);

  const indexHtml = await fs.readFile(
    path.join(root, "dist/index.html"),
    "utf8",
  );
  assert.match(indexHtml, /我的番剧档案/u);
  assert.match(indexHtml, /还没有番剧记录/u);
  assert.doesNotMatch(indexHtml, /葬送的芙莉莲/u);

  const library = JSON.parse(
    await fs.readFile(path.join(root, "dist/data/library.json"), "utf8"),
  );
  assert.equal(library.itemCount, 0);
  assert.deepEqual(library.items, []);
});
