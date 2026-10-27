import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBangumiMetadata,
  filterAndSortByBangumiMetadata,
  hasUsableBangumiMetadata,
  isCachedBangumiMetadata,
  normalizeBangumiMetadata,
  normalizeBangumiSnapshotSubject,
  summarizeBangumiMetadata,
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

test("normalizes compact public snapshot records", () => {
  const metadata = normalizeBangumiSnapshotSubject(
    "525565",
    [8.4, 3210, 118, [["恋爱", 920], ["漫画改", 450]]],
    "2026-10-20T21:03:33Z",
  );

  assert.equal(metadata.subjectId, "525565");
  assert.equal(metadata.score, 8.4);
  assert.equal(metadata.ratingCount, 3210);
  assert.equal(metadata.rank, 118);
  assert.deepEqual(metadata.tags, [
    { name: "恋爱", count: 920 },
    { name: "漫画改", count: 450 },
  ]);
  assert.equal(metadata.fetchedAt, "2026-10-20T21:03:33.000Z");
});

test("marks cache hits without mislabeling fresh snapshot records", () => {
  const items = [
    {
      id: "a",
      sites: { bangumi: "101" },
    },
    {
      id: "b",
      sites: { bangumi: "102" },
    },
  ];
  const metadata = new Map([
    ["101", { score: 8.1, tags: [{ name: "科幻", count: 30 }] }],
    ["102", { score: 7.6, tags: [{ name: "日常", count: 20 }] }],
  ]);

  applyBangumiMetadata(
    items,
    metadata,
    new Map([
      ["101", "cache"],
      ["102", "snapshot"],
    ]),
  );

  assert.equal(items[0].bangumiMetadataSource, "cache");
  assert.equal(items[1].bangumiMetadataSource, "snapshot");
  assert.equal(isCachedBangumiMetadata(items[0]), true);
  assert.equal(isCachedBangumiMetadata(items[1]), false);
});

test("summarizes cache, score, tag, and missing counts", () => {
  const summary = summarizeBangumiMetadata([
    {
      sites: { bangumi: "101" },
      bangumiMetadataSource: "cache",
      bangumiMetadata: {
        score: 8.1,
        tags: [{ name: "科幻", count: 30 }],
      },
    },
    {
      sites: { bangumi: "102" },
      bangumiMetadataSource: "snapshot",
      bangumiMetadata: {
        score: null,
        tags: [{ name: "日常", count: 20 }],
      },
    },
    {
      sites: { bangumi: "103" },
      bangumiMetadata: null,
    },
    {
      sites: {},
    },
  ]);

  assert.deepEqual(summary, {
    total: 4,
    indexed: 3,
    cached: 1,
    cachedAvailable: 1,
    personal: 0,
    personalAvailable: 0,
    browser: 1,
    browserAvailable: 1,
    pending: 0,
    scored: 1,
    tagged: 2,
    available: 2,
    missing: 1,
  });
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
