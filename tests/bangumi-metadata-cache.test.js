import test from "node:test";
import assert from "node:assert/strict";
import {
  filterAndSortByBangumiMetadata,
  hasUsableBangumiMetadata,
  normalizeBangumiMetadata,
} from "../admin/bangumi-metadata-cache.js";

test("normalizes Bangumi score, rank, tags, and cover", () => {
  const metadata = normalizeBangumiMetadata(
    {
      id: 400602,
      rating: { score: 8.67, total: 12345 },
      rank: 24,
      tags: [
        { name: "奇幻", count: 1200 },
        { name: "TV", count: 800 },
        { name: "奇幻", count: 1400 },
        { name: " ", count: 9999 },
      ],
      summary: "  测试简介  ",
      images: { large: "//lain.bgm.tv/test.jpg" },
    },
    "400602",
    "2026-10-27T00:00:00.000Z",
  );

  assert.equal(metadata.subjectId, "400602");
  assert.equal(metadata.score, 8.7);
  assert.equal(metadata.ratingCount, 12345);
  assert.equal(metadata.rank, 24);
  assert.deepEqual(metadata.tags, [
    { name: "奇幻", count: 1400 },
    { name: "TV", count: 800 },
  ]);
  assert.equal(metadata.summary, "测试简介");
  assert.equal(metadata.coverUrl, "https://lain.bgm.tv/test.jpg");
});

test("keeps successful metadata records without inventing public information", () => {
  const metadata = normalizeBangumiMetadata(
    {
      rating: { score: null, total: 0 },
      tags: [],
      images: {},
    },
    "100",
  );

  assert.equal(metadata.score, null);
  assert.deepEqual(metadata.tags, []);
  assert.equal(hasUsableBangumiMetadata(metadata), false);
});

test("filters and sorts only from cached public metadata", () => {
  const items = [
    {
      id: "a",
      bangumiMetadata: {
        score: 9.1,
        tags: [{ name: "科幻", count: 100 }],
      },
    },
    {
      id: "b",
      bangumiMetadata: {
        score: 7.5,
        tags: [{ name: "日常", count: 80 }],
      },
    },
    { id: "c", bangumiMetadata: null },
    {
      id: "d",
      bangumiMetadata: { score: null, tags: [] },
    },
  ];

  assert.deepEqual(
    filterAndSortByBangumiMetadata(items, {
      availability: "available",
    }).items.map((item) => item.id),
    ["a", "b"],
  );
  assert.deepEqual(
    filterAndSortByBangumiMetadata(items, {
      scoreMin: 8,
      scoreMax: 10,
    }).items.map((item) => item.id),
    ["a"],
  );
  assert.deepEqual(
    filterAndSortByBangumiMetadata(items, {
      tags: ["日常", "悬疑"],
    }).items.map((item) => item.id),
    ["b"],
  );
  assert.deepEqual(
    filterAndSortByBangumiMetadata(items, {
      sort: "bangumi-score-desc",
    }).items.map((item) => item.id),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    filterAndSortByBangumiMetadata(items, {
      sort: "bangumi-score-asc",
    }).items.map((item) => item.id),
    ["b", "a", "c", "d"],
  );
});
