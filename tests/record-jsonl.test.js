import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnimeIndex,
  chooseLatestRecord,
  createBackupSnapshot,
  parseJsonl,
  serializeJsonl,
  upsertRecord,
} from "../src/core/record-jsonl.js";

test("parses and serializes JSONL without blank lines", () => {
  const records = parseJsonl('{"id":"a"}\n\n{"id":"b"}\n', "测试数据");
  assert.deepEqual(records, [{ id: "a" }, { id: "b" }]);
  assert.equal(serializeJsonl(records), '{"id":"a"}\n{"id":"b"}\n');
  assert.equal(serializeJsonl([]), "");
});

test("reports malformed JSONL with its line number", () => {
  assert.throws(
    () => parseJsonl('{"id":"a"}\nnot-json\n', "anime.jsonl"),
    /anime\.jsonl 第 2 行/u,
  );
});

test("keeps newer records and rebuilds a compact deterministic index", () => {
  const older = {
    id: "bili-2",
    title: "旧标题",
    rating: 7,
    review: "旧评价",
    updatedAt: "2026-10-25T08:00:00.000Z",
  };
  const newer = {
    id: "bili-1",
    title: "中文标题",
    rating: 9,
    review: "**很好** 的评价",
    coverUrl: "https://example.com/cover.jpg",
    externalIds: {
      bangumi: "100",
      bilibiliSeason: "200",
    },
    season: {
      key: "bili-ss200",
      number: 2,
      label: "第2季",
      year: 2026,
    },
    match: {
      status: "matched",
      method: "site-id",
      confidence: 1,
      matchedTitle: "日本語タイトル",
    },
    createdAt: "2026-10-25T08:00:00.000Z",
    updatedAt: "2026-10-25T09:00:00.000Z",
  };
  const staleIncoming = {
    ...older,
    title: "不应覆盖的新标题",
    updatedAt: "2026-10-25T07:00:00.000Z",
  };

  assert.equal(chooseLatestRecord(older, staleIncoming), older);
  assert.equal(chooseLatestRecord(older, newer).id, "bili-1");
  const all = upsertRecord([older, newer], staleIncoming);
  assert.deepEqual(
    all.map((record) => record.id),
    ["bili-1", "bili-2"],
  );

  const index = buildAnimeIndex(all);
  assert.equal(index[0].title, "中文标题");
  assert.equal(index[0].reviewExcerpt, "很好 的评价");
  assert.equal(index[0].season.number, 2);
  assert.deepEqual(index[0].externalIds, {
    bangumi: "100",
    bilibiliSeason: "200",
  });
});

test("creates a backup snapshot containing both JSONL documents", () => {
  const backup = createBackupSnapshot({
    animeText: '{"id":"bili-1"}\n',
    indexText: '{"id":"bili-1"}\n',
    createdAt: "2026-10-25T10:00:00.000Z",
  });
  assert.equal(backup.kind, "anime-library-backup");
  assert.equal(backup.animeText, '{"id":"bili-1"}\n');
  assert.equal(backup.indexText, '{"id":"bili-1"}\n');
});
