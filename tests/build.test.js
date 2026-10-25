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

test("loads the example records", async () => {
  const entries = await loadEntries(root);
  assert.equal(entries.length, 6);
  assert.equal(
    entries.find((entry) => entry.id === "bgm-420628")?.rating,
    null,
  );
});

test("rejects a rating outside the defined range", async () => {
  const validate = await compileRecordValidator(root);
  const entries = await loadEntries(root);
  assert.throws(
    () => validate({ ...entries[0], rating: 11 }),
    /rating must be <= 10/u,
  );
});

test("builds the index, details, and public data feed", async () => {
  const result = await buildSite({
    root,
    now: new Date("2026-10-25T12:00:00Z"),
  });
  assert.equal(result.entryCount, 6);

  const indexHtml = await fs.readFile(
    path.join(root, "dist/index.html"),
    "utf8",
  );
  assert.match(indexHtml, /我的番剧档案/u);
  assert.match(indexHtml, /葬送的芙莉莲/u);

  const detailHtml = await fs.readFile(
    path.join(root, "dist/anime/bili-292073015/index.html"),
    "utf8",
  );
  assert.match(detailHtml, /相反的你和我/u);
  assert.match(detailHtml, /站点 ID 精确匹配/u);

  const library = JSON.parse(
    await fs.readFile(path.join(root, "dist/data/library.json"), "utf8"),
  );
  assert.equal(library.itemCount, 6);
  assert.equal(library.items[0].schemaVersion, 1);
  assert.equal("$schema" in library.items[0], false);
});
