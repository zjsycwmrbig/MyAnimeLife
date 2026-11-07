import test from "node:test";
import assert from "node:assert/strict";
import {
  ENABLED_SITE_DOMAINS,
  isEnabledSite,
  SITE_MODES,
  siteModeForUrl,
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

test("uses the floating launcher on supported sites and passive mode elsewhere", () => {
  assert.equal(
    siteModeForUrl("https://www.bilibili.com/bangumi/play/ep1"),
    SITE_MODES.FLOATING,
  );
  assert.equal(
    siteModeForUrl("https://example.com/anime"),
    SITE_MODES.PASSIVE,
  );
  assert.equal(siteModeForUrl("ftp://www.bilibili.com/anime"), SITE_MODES.PASSIVE);
});

test("matches all HTTP and HTTPS pages while keeping the domain list as presentation metadata", () => {
  const patterns = userscriptMatchPatterns();
  assert.deepEqual(patterns, ["*://*/*"]);
  assert.ok(ENABLED_SITE_DOMAINS.includes("bilibili.com"));
  assert.ok(ENABLED_SITE_DOMAINS.includes("v.qq.com"));
});
