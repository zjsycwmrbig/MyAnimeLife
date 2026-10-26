import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateInsights,
  compareLibraries,
} from "../scripts/insights-data.mjs";

function record({
  id,
  createdAt,
  rating = null,
  year = null,
  externalIds = {},
  title = id,
}) {
  return {
    id,
    title,
    rating,
    review: "",
    coverUrl: null,
    note: "",
    externalIds,
    season: year
      ? { key: id, number: 1, label: "第1季", year }
      : null,
    match: {
      status: "matched",
      method: "site-id",
      source: "test",
      confidence: 1,
      matchedTitle: title,
      matchedAt: createdAt,
    },
    createdAt,
    updatedAt: createdAt,
  };
}

test("calculates collection windows, decades, and rating distributions", () => {
  const now = new Date("2026-10-25T12:00:00.000Z");
  const insights = calculateInsights(
    [
      record({
        id: "a",
        createdAt: "2026-10-24T12:00:00.000Z",
        rating: 8,
        year: 2024,
        externalIds: { bangumi: "1" },
      }),
      record({
        id: "b",
        createdAt: "2026-10-10T12:00:00.000Z",
        rating: 9,
        year: 2023,
        externalIds: { bilibiliMedia: "2" },
      }),
      record({
        id: "c",
        createdAt: "2026-06-01T12:00:00.000Z",
        rating: 6,
        year: 2015,
      }),
      record({
        id: "d",
        createdAt: "2025-01-01T12:00:00.000Z",
      }),
    ],
    now,
  );

  assert.equal(insights.summary.total, 4);
  assert.equal(insights.summary.rated, 3);
  assert.equal(insights.summary.averageRating, "7.7");
  assert.equal(insights.summary.medianRating, "8.0");
  assert.equal(insights.summary.highestRating, "9.0");
  assert.equal(insights.summary.lowestRating, "6.0");
  assert.deepEqual(
    insights.windows.map((window) => window.count),
    [1, 2, 3],
  );
  assert.equal(insights.months.length, 12);
  assert.equal(insights.months.at(-1).count, 2);
  assert.deepEqual(
    insights.decades.map((decade) => [decade.key, decade.count]),
    [
      [2010, 1],
      [2020, 2],
      [null, 1],
    ],
  );
  assert.deepEqual(
    insights.years.map((year) => [year.key, year.count, year.ratedPercent]),
    [
      [2024, 1, 100],
      [2023, 1, 100],
      [2015, 1, 100],
      [null, 1, 0],
    ],
  );
  assert.deepEqual(
    insights.ratingFine.map((rating) => [rating.key, rating.count]),
    [
      ["9.0", 1],
      ["8.0", 1],
      ["6.0", 1],
    ],
  );
  assert.equal(
    insights.ratings.find((rating) => rating.key === "8-8.9").count,
    1,
  );
  assert.equal(
    insights.ratings.find((rating) => rating.key === "unrated").count,
    1,
  );
  assert.equal(insights.sources.length, 2);
});

test("compares repositories by stable ids without merging different seasons", () => {
  const current = [
    record({
      id: "bgm-100",
      title: "同一部作品",
      createdAt: "2026-10-25T12:00:00.000Z",
      rating: 9,
      year: 2024,
      externalIds: { bangumi: "100" },
    }),
    record({
      id: "bgm-101",
      title: "第二季",
      createdAt: "2026-10-25T12:00:00.000Z",
      rating: 8,
      year: 2025,
      externalIds: { bangumi: "101" },
    }),
  ];
  const peer = [
    record({
      id: "other-id",
      title: "同一部作品",
      createdAt: "2026-10-25T12:00:00.000Z",
      rating: 7,
      year: 2024,
      externalIds: { bangumi: "100" },
    }),
    record({
      id: "another-id",
      title: "第二季",
      createdAt: "2026-10-25T12:00:00.000Z",
      rating: 9,
      year: 2025,
      externalIds: { bangumi: "999" },
    }),
  ];

  const comparison = compareLibraries(current, peer);

  assert.equal(comparison.shared.length, 1);
  assert.equal(comparison.shared[0].id, "bgm-100");
  assert.equal(comparison.shared[0].ratingDifference, 2);
  assert.equal(comparison.currentOnly.length, 1);
  assert.equal(comparison.peerOnly.length, 1);
  assert.equal(comparison.overlap.count, 1);
  assert.equal(comparison.overlap.percent, 33.3);
  assert.equal(comparison.current.ratedPercent, 100);
  assert.equal(comparison.peer.ratedPercent, 100);
  assert.deepEqual(
    comparison.current.years.map((entry) => [entry.key, entry.count]),
    [[2025, 1], [2024, 1]],
  );
  assert.deepEqual(
    comparison.peer.ratings.map((entry) => [entry.key, entry.count]),
    [["9-10", 1], ["7-7.9", 1]],
  );
});
