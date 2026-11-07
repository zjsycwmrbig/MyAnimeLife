import test from "node:test";
import assert from "node:assert/strict";
import { buildDiscoveryRecommendations } from "../scripts/discovery-recommendations.mjs";
import { normalizePublicCatalogMetadata } from "../scripts/recommendations.mjs";

const generatedAt = "2026-11-04T00:00:00.000Z";

function record(id, bangumiId, rating, overrides = {}) {
  return {
    id,
    title: id,
    rating,
    review: "",
    coverUrl: null,
    note: "",
    externalIds: { bangumi: String(bangumiId) },
    season: { year: 2020, number: 1, label: "第1季" },
    match: { status: "matched", method: "site-id", confidence: 1 },
    createdAt: generatedAt,
    updatedAt: generatedAt,
    ...overrides,
  };
}

function fixture() {
  return {
    publicSnapshot: {
      subjects: {
        1: [9.2, 2200, 20, [["科幻", 900], ["悬疑", 700]]],
        2: [8.8, 1500, 35, [["科幻", 800], ["原创", 420]]],
        3: [8.6, 4200, 18, [["科幻", 980], ["悬疑", 760]]],
        4: [8.9, 1800, 30, [["日常", 900], ["治愈", 600]]],
        5: [7.4, 90, 800, [["科幻", 120], ["机战", 110]]],
        6: [8.7, 8000, 12, [["悬疑", 1000], ["犯罪", 600]]],
      },
    },
    catalogMetadata: normalizePublicCatalogMetadata({
      items: {
        1: ["已收录科幻", "Owned Sci-Fi", 2020, "tv", "2020-01-01", 1, "第1季", null],
        2: ["已收录原创", "Owned Original", 2021, "tv", "2021-01-01", 1, "第1季", null],
        3: ["科幻悬疑候选", "Sci-Fi Mystery", 2022, "tv", "2022-01-01", 1, "第1季", "https://example.test/3.jpg"],
        4: ["日常候选", "Slice Candidate", 2022, "tv", "2022-01-01", 1, "第1季", null],
        5: ["低热度机战", "Niche Mecha", 2018, "ova", "2018-01-01", 1, "OVA", null],
        6: ["犯罪悬疑", "Crime Mystery", 2023, "tv", "2023-01-01", 1, "第1季", null],
      },
    }),
    personalCacheEntries: [],
    records: [
      record("owned-sci-fi", 1, 10),
      record("owned-original", 2, 9),
    ],
    generatedAt,
  };
}

test("builds a production recommendation snapshot from personal taste", () => {
  const result = buildDiscoveryRecommendations(fixture());

  assert.equal(result.algorithm.name, "taste-hybrid-mmr");
  assert.equal(result.algorithm.projectVersion, "1.2.0");
  assert.equal(result.algorithm.status, "production");
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.mode, "limited");
  assert.equal(result.profile.ratedCount, 2);
  assert.equal(result.profile.personalAverage, 9.5);
  assert.equal(result.profile.topTags[0].name, "科幻");
  assert.equal(result.items.some((item) => item.subjectId === "1"), false);
  assert.equal(result.items.some((item) => item.subjectId === "2"), false);
  assert.equal(result.items[0].subjectId, "3");
  assert.ok(result.items[0].tagMatch > 0.5);
  assert.ok(result.items[0].matchedTags.some((tag) => tag.name === "悬疑"));
  assert.match(result.items[0].reason, /因为你偏爱/u);
});

test("falls back to public quality without pretending to know taste", () => {
  const input = fixture();
  input.records = [];
  const result = buildDiscoveryRecommendations(input);

  assert.equal(result.mode, "public");
  assert.equal(result.profile.ratedCount, 0);
  assert.deepEqual(result.profile.topTags, []);
  assert.equal(result.items[0].subjectId, "1");
  assert.ok(result.items[0].qualityScore > 0.7);
  assert.match(result.items[0].reason, /Bangumi 高口碑作品/u);
});

test("merges personal Bangumi cache and keeps candidate limits deterministic", () => {
  const input = fixture();
  input.personalCacheEntries = [
    {
      subjectId: "3",
      score: 8.7,
      ratingCount: 5000,
      rank: 9,
      summary: "缓存中的简介",
      coverUrl: "https://example.test/cache-3.jpg",
      tags: [{ name: "科幻", count: 980 }, { name: "时间旅行", count: 500 }],
    },
  ];
  const first = buildDiscoveryRecommendations(input);
  const second = buildDiscoveryRecommendations(input);
  const candidate = first.items.find((item) => item.subjectId === "3");

  assert.equal(candidate.summary, "缓存中的简介");
  assert.equal(candidate.score, 8.6);
  assert.equal(candidate.ratingCount, 4200);
  assert.deepEqual(
    first.items.map((item) => item.subjectId),
    second.items.map((item) => item.subjectId),
  );
  assert.ok(first.items.length <= 96);
});

test("excludes title aliases from the same work while preserving other seasons", () => {
  const input = fixture();
  input.publicSnapshot.subjects[7] = [
    8.2,
    800,
    70,
    [["科幻", 500], ["悬疑", 320]],
  ];
  input.publicSnapshot.subjects[8] = [
    8.1,
    760,
    80,
    [["科幻", 480], ["悬疑", 300]],
  ];
  input.publicSnapshot.subjects[9] = [
    8.3,
    720,
    68,
    [["科幻", 460], ["悬疑", 290]],
  ];
  input.catalogMetadata = normalizePublicCatalogMetadata({
    items: {
      1: ["已收录科幻", "Owned Sci-Fi", 2020, "tv", "2020-01-01", 1, "第1季", null],
      2: ["已收录原创", "Owned Original", 2021, "tv", "2021-01-01", 1, "第1季", null],
      7: ["季度同名作品", "Seasonal Work", 2023, "tv", "2023-01-01", 1, "第1季", null],
      8: ["季度同名作品", "Seasonal Work", 2024, "tv", "2024-01-01", 1, "第1季", null],
      9: ["季度同名作品", "Seasonal Work", 2023, "tv", "2023-07-01", 2, "第2季", null],
    },
  });
  input.records = [
    record("owned-sci-fi", 1, 10),
    record("owned-original", 2, 9),
    record("legacy-title-alias", 999, 9, {
      title: "历史译名",
      match: {
        status: "matched",
        method: "title-exact",
        source: "bangumi",
        confidence: 1,
        matchedTitle: "季度同名作品",
        matchedAt: generatedAt,
      },
      season: { key: "legacy:first", number: 1, label: "第1季", year: 2023 },
    }),
  ];

  const result = buildDiscoveryRecommendations(input);
  const subjectIds = result.items.map((item) => item.subjectId);

  assert.equal(subjectIds.includes("7"), false);
  assert.equal(subjectIds.includes("8"), true);
  assert.equal(subjectIds.includes("9"), true);
});

test("builds a recent new-release shelf from time and taste fit", () => {
  const input = fixture();
  input.catalogMetadata = normalizePublicCatalogMetadata({
    items: {
      1: ["已收录科幻", "Owned Sci-Fi", 2020, "tv", "2020-01-01", 1, "第1季", null],
      2: ["已收录原创", "Owned Original", 2021, "tv", "2021-01-01", 1, "第1季", null],
      3: ["最新契合候选", "Newest Fit", 2026, "tv", "2026-10-30", 1, "第4季", null],
      4: ["较早契合候选", "Older Fit", 2026, "tv", "2026-05-01", 1, "第2季", null],
      5: ["即将开播候选", "Upcoming Fit", 2026, "tv", "2026-12-20", 1, "第1季", null],
      6: ["窗口外候选", "Old Candidate", 2024, "tv", "2024-01-01", 1, "第1季", null],
    },
  });

  const result = buildDiscoveryRecommendations(input);
  const ids = result.newReleaseItems.map((item) => item.subjectId);

  assert.equal(result.newRelease.windowDays, 540);
  assert.equal(result.newRelease.itemCount, 3);
  assert.equal(ids[0], "3");
  assert.equal(ids.includes("4"), true);
  assert.equal(ids.includes("5"), true);
  assert.equal(ids.includes("6"), false);
  assert.equal(typeof result.newReleaseItems[0].releaseAgeDays, "number");
  assert.ok(result.newReleaseItems[0].newReleaseScore > 0);
});
