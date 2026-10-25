import test from "node:test";
import assert from "node:assert/strict";
import { parseBilibiliShortComments } from "../src/recognizers/bilibili.js";

test("parses and deduplicates Bilibili short reviews", () => {
  const comments = parseBilibiliShortComments({
    code: 0,
    data: {
      list: [
        {
          content: "人物描写很自然",
          score: 9,
          progress: "看到第 8 话",
          author: { uname: "viewer-a" },
        },
        {
          content: "人物描写很自然",
          score: 10,
          author: { uname: "viewer-b" },
        },
        { content: "  " },
      ],
    },
  });

  assert.equal(comments.length, 1);
  assert.equal(comments[0].text, "人物描写很自然");
  assert.equal(comments[0].score, 9);
  assert.equal(comments[0].source, "bilibili:short-review");
});
