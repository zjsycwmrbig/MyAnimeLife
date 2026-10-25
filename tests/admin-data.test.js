import test from "node:test";
import assert from "node:assert/strict";
import {
  appendCatalogRecords,
  buildLibraryData,
  removeLibraryRecords,
  updateLibraryRecord,
} from "../scripts/admin-data.mjs";

const baseRecord = {
  $schema: "../../schemas/anime.schema.json",
  schemaVersion: 1,
  id: "manual-shared-test",
  title: "共享模块测试",
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
    matchedTitle: "共享模块测试",
    matchedAt: "2026-10-25T12:00:00Z",
  },
  createdAt: "2026-10-25T12:00:00Z",
  updatedAt: "2026-10-25T12:00:00Z",
};

const catalogItem = {
  id: "bangumi:400602",
  title: "葬送のフリーレン",
  displayTitle: "葬送的芙莉莲",
  names: ["葬送のフリーレン", "葬送的芙莉莲"],
  type: "tv",
  begin: "2023-09-29T15:00:00.000Z",
  year: 2023,
  sites: {
    bangumi: "400602",
    bilibiliMedia: "292073015",
  },
  season: {
    key: "bangumi:400602",
    number: 1,
    label: "第1季",
    year: 2023,
  },
  coverUrl: null,
};

test("shared record updates rebuild the lightweight index", () => {
  const result = updateLibraryRecord(
    [baseRecord],
    baseRecord.id,
    {
      title: "  修改后的标题  ",
      rating: "9.26",
      review: "新的评价",
      note: "新的备注",
    },
    "2026-10-25T12:00:00.000Z",
  );

  assert.equal(result.record.title, "修改后的标题");
  assert.equal(result.record.rating, 9.3);
  assert.equal(result.record.updatedAt, "2026-10-25T12:00:00.001Z");
  assert.equal(result.index[0].reviewExcerpt, "新的评价");
  assert.match(result.dataText, /\n$/u);
  assert.match(result.indexText, /\n$/u);
});

test("shared batch append skips duplicate catalog and external identities", () => {
  const existing = {
    ...baseRecord,
    id: "existing-library-record",
    title: "已有作品",
    externalIds: { mal: "99" },
  };
  const result = appendCatalogRecords(
    [existing],
    [
      {
        item: catalogItem,
        rating: 9.1,
        review: "第一条",
        coverUrl: "https://images.example.test/frieren.jpg",
      },
      { item: catalogItem, rating: 8.8 },
      {
        item: {
          ...catalogItem,
          id: "bangumi:alternate",
          sites: { mal: "99" },
        },
      },
    ],
    "2026-10-25T13:00:00.000Z",
  );

  assert.equal(result.addedRecords.length, 1);
  assert.equal(result.addedRecords[0].id, "bgm-400602");
  assert.equal(result.addedRecords[0].title, "葬送的芙莉莲");
  assert.equal(
    result.addedRecords[0].coverUrl,
    "https://images.example.test/frieren.jpg",
  );
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason),
    ["batch-duplicate", "existing-external-id"],
  );
});

test("shared removal keeps unrelated records and validates empty operations", () => {
  const second = {
    ...baseRecord,
    id: "manual-second-record",
    title: "保留作品",
  };
  const result = removeLibraryRecords([baseRecord, second], [baseRecord.id]);

  assert.deepEqual(
    result.records.map((record) => record.id),
    [second.id],
  );
  assert.equal(result.index.length, 1);
  assert.throws(() => removeLibraryRecords([], []), /没有选择/u);
  assert.deepEqual(buildLibraryData([]).records, []);
});
