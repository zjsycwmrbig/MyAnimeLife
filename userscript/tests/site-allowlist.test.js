import test from "node:test";
import assert from "node:assert/strict";
import {
  ENABLED_SITE_DOMAINS,
  isEnabledSite,
  userscriptMatchPatterns,
} from "../src/core/site-allowlist.js";

test("enables major streaming and anime information sites", () => {
  for (const url of [
    "https://www.bilibili.com/bangumi/play/ep1",
    "https://space.bilibili.com/123/bangumi",
    "https://www.iqiyi.com/v_abc.html",
    "https://v.qq.com/x/cover/abc.html",
    "https://www.youku.com/v_show/id_abc.html",
    "https://ani.gamer.com.tw/animeRef.php?sn=1",
    "https://myanimelist.net/anime/1",
    "https://anilist.co/anime/1",
    "https://www.netflix.com/watch/1",
    "https://www.crunchyroll.com/watch/abc",
  ]) {
    assert.equal(isEnabledSite(url), true, url);
  }
});

test("does not enable unrelated or lookalike hosts", () => {
  for (const url of [
    "https://example.com/anime",
    "https://evilbilibili.com/bangumi",
    "https://bilibili.com.example.com/anime",
    "ftp://www.bilibili.com/bangumi",
    "not a url",
  ]) {
    assert.equal(isEnabledSite(url), false, url);
  }
});

test("generates constrained userscript match patterns", () => {
  const patterns = userscriptMatchPatterns();
  assert.ok(patterns.includes("*://www.bilibili.com/*") === false);
  assert.ok(patterns.includes("*://bilibili.com/*"));
  assert.ok(patterns.includes("*://*.bilibili.com/*"));
  assert.ok(patterns.includes("*://v.qq.com/*"));
  assert.equal(patterns.includes("*://*/*"), false);
  assert.equal(patterns.length, ENABLED_SITE_DOMAINS.length * 2);
});
