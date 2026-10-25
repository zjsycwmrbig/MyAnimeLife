import test from "node:test";
import assert from "node:assert/strict";
import {
  detectPageKind,
  extractBilibiliFollowUid,
  extractTitleMentions,
} from "../src/recognizers/page-context.js";

test("extracts title mentions from synopsis and comments", () => {
  const mentions = extractTitleMentions([
    "本作《相反的你和我》讲述性格相反的两个人。",
    "番名：葬送的芙莉莲，这部动画值得一看。",
    "这部番就是「夏日重现」，节奏很稳。",
  ]);

  assert.deepEqual(mentions, [
    "相反的你和我",
    "葬送的芙莉莲",
    "夏日重现",
  ]);
});

test("deduplicates mentions and ignores generic phrases", () => {
  const mentions = extractTitleMentions([
    "《相反的你和我》和《相反的你和我》",
    "这部番是《动画》",
  ]);

  assert.deepEqual(mentions, ["相反的你和我"]);
});

test("recognizes Bilibili follow routes and extracts their user id", () => {
  assert.equal(
    detectPageKind(new URL("https://space.bilibili.com/123/bangumi")),
    "bilibili-follow",
  );
  assert.equal(
    detectPageKind(
      new URL("https://www.bilibili.com/bangumi/mine/follow"),
    ),
    "bilibili-follow",
  );
  assert.equal(
    extractBilibiliFollowUid("https://space.bilibili.com/123/bangumi"),
    "123",
  );
});

test("falls back to Bilibili login cookies or initial state for the user id", () => {
  const mine = "https://www.bilibili.com/bangumi/mine/follow";

  assert.equal(
    extractBilibiliFollowUid(mine, {
      cookie: "theme=light; DedeUserID=456; SESSDATA=secret",
    }),
    "456",
  );
  assert.equal(
    extractBilibiliFollowUid(mine, {
      cookie: "",
      initialState: { userInfo: { mid: 789 } },
    }),
    "789",
  );
  assert.equal(extractBilibiliFollowUid(mine, { cookie: "" }), null);
});

test("does not treat lookalike Bilibili hosts as Bilibili pages", () => {
  const lookalike = new URL("https://evilbilibili.com/123/bangumi");

  assert.equal(detectPageKind(lookalike), "generic");
  assert.equal(extractBilibiliFollowUid(lookalike.toString()), null);
});
