import test from "node:test";
import assert from "node:assert/strict";
import { extractTitleMentions } from "../src/recognizers/page-context.js";

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
