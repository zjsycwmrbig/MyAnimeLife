import test from "node:test";
import assert from "node:assert/strict";
import {
  createSeasonDescriptor,
  parseChineseNumber,
  parseSeasonLabel,
} from "../src/core/season.js";

test("parses Chinese and numeric season labels", () => {
  assert.equal(parseChineseNumber("十二"), 12);
  assert.equal(parseChineseNumber("二十一"), 21);
  assert.deepEqual(parseSeasonLabel("某番剧 第二季"), {
    number: 2,
    label: "第2季",
  });
  assert.deepEqual(parseSeasonLabel("Some Anime Season 03"), {
    number: 3,
    label: "第3季",
  });
  assert.deepEqual(parseSeasonLabel("Some Anime S4"), {
    number: 4,
    label: "第4季",
  });
});

test("parses Roman numerals and explicit season metadata", () => {
  assert.deepEqual(parseSeasonLabel("Some Anime II"), {
    number: 2,
    label: "第2季",
  });
  assert.deepEqual(parseSeasonLabel("Some Anime Part IV"), {
    number: 4,
    label: "第4季",
  });
  assert.deepEqual(
    createSeasonDescriptor({
      key: "bgm:1",
      title: "Some Anime",
      year: "2026",
      season: { number: 2, label: "第二季" },
    }),
    {
      key: "bgm:1",
      number: 2,
      label: "第二季",
      year: 2026,
    },
  );
});

test("returns no season for titles that do not identify one", () => {
  assert.deepEqual(parseSeasonLabel("相反的你和我"), {
    number: null,
    label: null,
  });
});
