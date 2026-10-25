import test from "node:test";
import assert from "node:assert/strict";
import { buildSlimIndex } from "../src/index/build-index.js";
import { LocalAnimeSearch } from "../src/search/fuzzy-search.js";

const rawIndex = {
  items: [
    {
      title: "正反対な君と僕",
      titleTranslate: {
        "zh-Hans": ["相反的你和我", "正相反的你与我"],
        en: ["You and I Are Polar Opposites"],
      },
      type: "tv",
      begin: "2023-01-01T00:00:00.000Z",
      sites: [
        { site: "bangumi", id: "525565" },
        { site: "bilibili", id: "292073015" },
      ],
    },
    {
      title: "葬送のフリーレン",
      titleTranslate: {
        "zh-Hans": ["葬送的芙莉莲"],
        ja: ["葬送のフリーレン"],
      },
      type: "tv",
      begin: "2023-09-29T00:00:00.000Z",
      season: {
        number: 1,
        label: "第1季",
        year: 2023,
      },
      sites: [
        { site: "bangumi", id: "400602" },
        { site: "bilibili", id: "4317671" },
      ],
    },
  ],
};

test("builds a compact searchable index", () => {
  const slim = buildSlimIndex(rawIndex, {
    sourceVersion: "test",
    sourceName: "fixture",
  });
  assert.equal(slim.itemCount, 2);
  assert.deepEqual(slim.items[0].sites, {
    bangumi: "525565",
    bilibili: "292073015",
  });
  assert.equal(slim.items[0].title, "正反対な君と僕");
  assert.equal(slim.items[0].displayTitle, "相反的你和我");
  assert.ok(slim.items[0].normalizedNames.includes("相反的你和我"));
  assert.equal(slim.items[1].season.number, 1);
  assert.equal(slim.items[1].season.label, "第1季");
  assert.equal(slim.items[1].season.year, 2023);
});

test("exact site ids take precedence over title ambiguity", () => {
  const slim = buildSlimIndex(rawIndex, { sourceVersion: "test" });
  const search = new LocalAnimeSearch(slim.items);
  const item = search.findBySiteId("bilibili", "292073015");
  assert.equal(item.title, "正反対な君と僕");
  assert.equal(item.displayTitle, "相反的你和我");
});

test("searches Chinese aliases exactly and with fuzzy input", () => {
  const slim = buildSlimIndex(rawIndex, { sourceVersion: "test" });
  const search = new LocalAnimeSearch(slim.items, { threshold: 0.55 });

  const exact = search.search("正相反的你与我", { limit: 3 });
  assert.equal(exact[0].item.id, "bangumi:525565");
  assert.equal(exact[0].matchedBy, "exact");

  const fuzzy = search.search("相反的你与卧", { limit: 3 });
  assert.equal(fuzzy[0].item.id, "bangumi:525565");
});
