import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSimilarRecommendations,
  createSimilarCatalogIndex,
  normalizePublicCatalogMetadata,
} from "../scripts/recommendations.mjs";

const generatedAt = "2026-10-30T12:00:00.000Z";

function record(id, bangumiId, overrides = {}) {
  return {
    id,
    title: id,
    rating: null,
    review: "",
    coverUrl: null,
    note: "",
    externalIds: { bangumi: String(bangumiId) },
    match: {
      status: "matched",
      method: "site-id",
      source: "bangumi",
      confidence: 1,
      matchedTitle: id,
      matchedAt: generatedAt,
    },
    createdAt: generatedAt,
    updatedAt: generatedAt,
    ...overrides,
  };
}

function fixture() {
  const publicSnapshot = {
    subjects: {
      1: [8.1, 1200, 120, [["科幻", 300], ["机战", 240]]],
      2: [7.8, 900, 260, [["科幻", 260], ["机战", 180]]],
      3: [8.6, 700, 180, [["科幻", 200], ["悬疑", 130]]],
      4: [9.1, 600, 90, [["日常", 220]]],
    },
  };
  const catalogMetadata = normalizePublicCatalogMetadata({
    items: {
      1: ["源作品", "Source", 2020, "TV", "2020-01-01", 1, "第1季", null],
      2: ["公共标题", "Owned", 2021, "TV", "2021-01-01", 1, "第1季", "https://example.test/2.jpg"],
      3: ["未收录候选", "Candidate", 2022, "TV", "2022-01-01", 2, "第2季", "https://example.test/3.jpg"],
      4: ["无关作品", "Other", 2022, "TV", "2022-01-01", 1, "第1季", null],
    },
  });
  return {
    publicSnapshot,
    catalogMetadata,
    personalCacheEntries: [],
    records: [
      record("source-anime", 1, {
        title: "源作品中文名",
        season: { key: "bgm:1", number: 1, label: "第1季", year: 2020 },
      }),
      record("owned-anime", 2, {
        title: "已收录中文名",
        rating: 9.5,
        coverUrl: "https://example.test/owned.jpg",
        season: { key: "bgm:2", number: 1, label: "第1季", year: 2021 },
      }),
    ],
    generatedAt,
  };
}

test("ranks shared tags first and distinguishes owned recommendations", () => {
  const recommendations = buildSimilarRecommendations(fixture());
  const source = recommendations.shards.get("source-anime");

  assert.equal(source.sourceTagCount, 2);
  assert.equal(source.total, 2);
  assert.equal(source.ownedTotal, 1);
  assert.equal(source.unownedTotal, 1);
  assert.deepEqual(source.items.map((item) => item.subjectId), ["2", "3"]);

  const [owned, unowned] = source.items;
  assert.equal(owned.owned, true);
  assert.equal(owned.recordId, "owned-anime");
  assert.equal(owned.title, "已收录中文名");
  assert.equal(owned.coverUrl, "https://example.test/owned.jpg");
  assert.equal(owned.recordRating, 9.5);
  assert.equal(owned.sharedCount, 2);

  assert.equal(unowned.owned, false);
  assert.equal(unowned.recordId, null);
  assert.equal(unowned.title, "未收录候选");
  assert.equal(unowned.coverUrl, "https://example.test/3.jpg");
  assert.equal(unowned.year, 2022);
  assert.equal(unowned.seasonMatch, false);
});

test("returns an explicit no-tag recommendation state", () => {
  const input = fixture();
  input.publicSnapshot.subjects["1"] = [8.1, 1200, 120, []];
  input.personalCacheEntries = [];
  const source = buildSimilarRecommendations(input).shards.get("source-anime");

  assert.equal(source.sourceTagCount, 0);
  assert.equal(source.total, 0);
  assert.deepEqual(source.items, []);
});

test("uses personal cache tags when the public snapshot has none", () => {
  const input = fixture();
  input.publicSnapshot = {
    subjects: {
      1: [8.1, 1200, 120, []],
      2: [7.8, 900, 260, []],
    },
  };
  input.catalogMetadata = normalizePublicCatalogMetadata({
    items: {
      2: ["缓存候选", "Cached", 2021, "TV", "2021-01-01", 1, "第1季", null],
    },
  });
  input.records = [input.records[0]];
  input.personalCacheEntries = [
    {
      subjectId: "1",
      tags: [
        { name: "科幻", count: 300 },
        { name: "机战", count: 240 },
      ],
    },
    {
      subjectId: "2",
      tags: [
        { name: "科幻", count: 260 },
        { name: "机战", count: 180 },
      ],
    },
  ];

  const source = buildSimilarRecommendations(input).shards.get("source-anime");
  assert.equal(source.sourceTagCount, 2);
  assert.equal(source.items.length, 1);
  assert.equal(source.items[0].subjectId, "2");
  assert.equal(source.items[0].sharedCount, 2);
  assert.deepEqual(source.items[0].commonTags, ["科幻", "机战"]);
});

test("keeps every overlapping candidate for paginated display", () => {
  const input = fixture();
  const subjects = {
    1: [8.1, 1200, 120, [["科幻", 300]]],
  };
  for (let index = 0; index < 30; index += 1) {
    subjects[String(index + 2)] = [
      7 + (index % 10) / 10,
      500 - index,
      300 + index,
      [["科幻", 260 - index]],
    ];
  }
  input.publicSnapshot = { subjects };
  input.catalogMetadata = new Map();
  input.personalCacheEntries = [];
  input.records = [input.records[0]];

  const source = buildSimilarRecommendations(input).shards.get("source-anime");
  assert.equal(source.total, 30);
  assert.equal(source.items.length, 30);
});

test("creates a lightweight catalog index for generated shards", () => {
  const recommendations = buildSimilarRecommendations(fixture());
  const index = createSimilarCatalogIndex(recommendations);

  assert.equal(index.itemCount, 2);
  assert.equal(index.documentCount, 4);
  assert.equal(index.metadataCount, 4);
  assert.deepEqual(index.items[0], {
    recordId: "owned-anime",
    sourceBangumiId: "2",
    sourceTagCount: 2,
    total: 2,
    ownedTotal: 1,
    unownedTotal: 1,
  });
});
