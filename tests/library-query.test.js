import test from "node:test";
import assert from "node:assert/strict";
import {
  filterLibraryRecords,
  queryLibraryRecords,
  sortLibraryRecords,
} from "../admin/library-query.js";

function record(overrides = {}) {
  return {
    id: "manual-test-record",
    title: "测试番剧",
    rating: null,
    review: "",
    note: "",
    externalIds: {},
    season: {
      key: "test",
      number: 1,
      label: "第1季",
      year: 2024,
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const records = [
  record({
    id: "manual-old",
    title: "旧日番剧",
    rating: 8.4,
    review: "稳定的公路故事",
    note: "",
    externalIds: { bangumi: "101" },
    season: { key: "old", number: 1, label: "第1季", year: 2019 },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  }),
  record({
    id: "manual-new",
    title: "新作测试",
    rating: 9.2,
    review: "",
    note: "等待续作",
    externalIds: { bilibiliMedia: "292073015" },
    season: { key: "new", number: 2, label: "第2季", year: 2026 },
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  }),
  record({
    id: "manual-unrated",
    title: "未评分作品",
    rating: null,
    review: "先记录",
    externalIds: {},
    season: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  }),
];

test("filters by searchable metadata and content status", () => {
  assert.deepEqual(
    filterLibraryRecords(records, { query: "292073015" }).map(
      (entry) => entry.id,
    ),
    ["manual-new"],
  );
  assert.deepEqual(
    filterLibraryRecords(records, { query: "公路故事" }).map(
      (entry) => entry.id,
    ),
    ["manual-old"],
  );
  assert.deepEqual(
    filterLibraryRecords(records, { status: "noted" }).map(
      (entry) => entry.id,
    ),
    ["manual-new"],
  );
  assert.deepEqual(
    filterLibraryRecords(records, { status: "unrated" }).map(
      (entry) => entry.id,
    ),
    ["manual-unrated"],
  );
});

test("combines inclusive rating, year, and created date ranges", () => {
  assert.deepEqual(
    filterLibraryRecords(records, {
      ratingMin: 9.2,
      ratingMax: 8.4,
      yearMin: 2019,
      yearMax: 2026,
      createdFrom: "2026-01-01",
      createdTo: "2026-03-01",
    }).map((entry) => entry.id),
    ["manual-old", "manual-new"],
  );
  assert.deepEqual(
    filterLibraryRecords(records, {
      createdFrom: "2026-02-01",
      createdTo: "2026-02-28",
    }).map((entry) => entry.id),
    ["manual-unrated"],
  );
});

test("excludes unknown ratings and unknown years when a range is active", () => {
  assert.deepEqual(
    filterLibraryRecords(records, { ratingMax: 10 }).map((entry) => entry.id),
    ["manual-old", "manual-new"],
  );
  assert.deepEqual(
    filterLibraryRecords(records, { yearMin: 1900 }).map((entry) => entry.id),
    ["manual-old", "manual-new"],
  );
});

test("sorts by created time in both directions", () => {
  assert.deepEqual(
    sortLibraryRecords(records, "created-desc").map((entry) => entry.id),
    ["manual-new", "manual-unrated", "manual-old"],
  );
  assert.deepEqual(
    sortLibraryRecords(records, "created-asc").map((entry) => entry.id),
    ["manual-old", "manual-unrated", "manual-new"],
  );
});

test("keeps unrated records last for rating sorting", () => {
  assert.deepEqual(
    sortLibraryRecords(records, "rating-desc").map((entry) => entry.id),
    ["manual-new", "manual-old", "manual-unrated"],
  );
  assert.deepEqual(
    sortLibraryRecords(records, "rating-asc").map((entry) => entry.id),
    ["manual-old", "manual-new", "manual-unrated"],
  );
});

test("sorts by updated time, work year, and title", () => {
  assert.deepEqual(
    sortLibraryRecords(records, "updated-desc").map((entry) => entry.id),
    ["manual-unrated", "manual-old", "manual-new"],
  );
  assert.deepEqual(
    sortLibraryRecords(records, "year-asc").map((entry) => entry.id),
    ["manual-old", "manual-new", "manual-unrated"],
  );
  assert.deepEqual(
    sortLibraryRecords(records, "title-desc").map((entry) => entry.id),
    ["manual-new", "manual-unrated", "manual-old"],
  );
});

test("filters and sorts without mutating the source list", () => {
  const source = records.map((entry) => ({ ...entry }));
  const sourceIds = source.map((entry) => entry.id);
  const result = queryLibraryRecords(source, {
    query: "manual",
    sort: "rating-desc",
  });

  assert.deepEqual(result.map((entry) => entry.id), [
    "manual-new",
    "manual-old",
    "manual-unrated",
  ]);
  assert.deepEqual(source.map((entry) => entry.id), sourceIds);
});
