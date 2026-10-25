import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicateGroups } from "../scripts/duplicate-data.mjs";

function record(id, title, overrides = {}) {
  return {
    id,
    title,
    rating: null,
    review: "",
    note: "",
    coverUrl: null,
    externalIds: {},
    season: {
      key: id,
      number: 1,
      label: "第1季",
      year: 2024,
    },
    match: null,
    createdAt: "2026-10-25T00:00:00Z",
    updatedAt: "2026-10-25T00:00:00Z",
    ...overrides,
  };
}

test("finds records sharing an external site id", () => {
  const groups = findDuplicateGroups([
    record("bili-1", "作品一", {
      externalIds: { bilibiliMedia: "100" },
    }),
    record("manual-1", "作品一", {
      externalIds: { bilibiliMedia: "100" },
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].severity, "confirmed");
  assert.ok(groups[0].reasons.includes("external-id:bilibiliMedia:100"));
  assert.deepEqual(
    groups[0].members.map((member) => member.id),
    ["bili-1", "manual-1"],
  );
});

test("does not merge the same title across conflicting seasons", () => {
  const groups = findDuplicateGroups([
    record("season-1", "季度测试", {
      season: { key: "one", number: 1, label: "第1季", year: 2024 },
    }),
    record("season-2", "季度测试", {
      season: { key: "two", number: 2, label: "第2季", year: 2025 },
    }),
  ]);

  assert.deepEqual(groups, []);
});

test("reports highly similar titles as review candidates", () => {
  const groups = findDuplicateGroups([
    record("manual-a", "葬送的芙莉莲"),
    record("manual-b", "葬送的芙莉莲 第一季"),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].severity, "review");
  assert.ok(
    groups[0].reasons.some((reason) => reason.startsWith("title-similar:")),
  );
});

test("does not group every exact title after a season conflict", () => {
  const groups = findDuplicateGroups([
    record("unknown-year", "同名作品", {
      season: { key: "unknown", number: null, label: null, year: null },
    }),
    record("first-season", "同名作品", {
      season: { key: "first", number: 1, label: "第1季", year: 2024 },
    }),
    record("second-season", "同名作品", {
      season: { key: "second", number: 2, label: "第2季", year: 2025 },
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].members.map((member) => member.id),
    ["first-season", "unknown-year"],
  );
});
