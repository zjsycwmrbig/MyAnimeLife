import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanDisplayTitle,
  extractBilibiliIds,
  extractTitleVariants,
  normalizeTitle,
} from "../src/core/title-normalize.js";

test("removes streaming noise while preserving a usable title", () => {
  assert.equal(
    cleanDisplayTitle(
      "相反的你和我 第8集 免费高清在线观看_番剧_bilibili_哔哩哔哩",
    ),
    "相反的你和我",
  );
  assert.equal(
    cleanDisplayTitle("【独家】葬送的芙莉莲 更新至第28集"),
    "葬送的芙莉莲",
  );
});

test("normalization ignores punctuation and width differences", () => {
  assert.equal(normalizeTitle("葬送的芙莉莲：考试篇"), "葬送的芙莉莲考试篇");
  assert.equal(normalizeTitle("葬送的芙莉莲: 考试篇"), "葬送的芙莉莲考试篇");
  assert.equal(normalizeTitle("ＡＢＣ　动画"), "abc动画");
});

test("extractTitleVariants includes bracketed and split title candidates", () => {
  const variants = extractTitleVariants(
    "【10月新番】相反的你和我 - 在线观看",
  );
  assert.ok(variants.includes("【10月新番】相反的你和我"));
  assert.ok(variants.includes("10月新番"));
  assert.ok(variants.includes("相反的你和我"));
});

test("extracts Bilibili media, season and episode ids", () => {
  assert.deepEqual(
    extractBilibiliIds(
      "https://www.bilibili.com/bangumi/media/md292073015",
    ),
    { mediaId: "292073015" },
  );
  assert.deepEqual(
    extractBilibiliIds("https://www.bilibili.com/bangumi/play/ep123456"),
    { episodeId: "123456" },
  );
  assert.deepEqual(
    extractBilibiliIds("https://www.bilibili.com/bangumi/play/ss129142"),
    { seasonId: "129142" },
  );
});
