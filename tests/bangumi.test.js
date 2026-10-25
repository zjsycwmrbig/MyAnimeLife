import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCoverUrl } from "../src/core/cover-url.js";
import { extractBangumiCoverUrl } from "../src/recognizers/bangumi.js";

test("prefers a large Bangumi subject cover", () => {
  const cover = extractBangumiCoverUrl({
    images: {
      large: "https://lain.bgm.tv/pic/cover/l/example.jpg",
      common: "https://lain.bgm.tv/pic/cover/c/example.jpg",
    },
  });

  assert.equal(cover, "https://lain.bgm.tv/pic/cover/l/example.jpg");
});

test("rejects unsupported cover URL schemes", () => {
  const cover = extractBangumiCoverUrl({
    images: {
      large: "javascript:alert(1)",
      common: "https://lain.bgm.tv/pic/cover/c/example.jpg",
    },
  });

  assert.equal(cover, "https://lain.bgm.tv/pic/cover/c/example.jpg");
});

test("normalizes protocol-relative cover URLs", () => {
  assert.equal(
    normalizeCoverUrl("//i0.hdslb.com/bfs/bangumi/example.jpg"),
    "https://i0.hdslb.com/bfs/bangumi/example.jpg",
  );
  assert.equal(normalizeCoverUrl("javascript:alert(1)"), null);
});
