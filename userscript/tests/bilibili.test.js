import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchBilibiliFollowList,
  parseBilibiliShortComments,
} from "../src/recognizers/bilibili.js";

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

function followResponse(page, total) {
  const count = page === 1 ? 30 : 15;
  return {
    code: 0,
    data: {
      pn: page,
      ps: 30,
      total,
      list: Array.from({ length: count }, (_, index) => {
        const number = (page - 1) * 30 + index + 1;
        return {
          media_id: 100000 + number,
          season_id: 200000 + number,
          title: `中文番剧 ${number}`,
          season_title: `中文番剧 ${number}`,
          cover: `//i0.hdslb.com/bfs/anime/${number}.jpg`,
        };
      }),
    },
  };
}

test("automatically paginates the complete Bilibili follow list", async () => {
  const requests = [];
  const result = await fetchBilibiliFollowList(123, {
    maxItems: 100,
    maxPages: 10,
    requestJsonImpl: async (url, options) => {
      const endpoint = new URL(url);
      const page = Number(endpoint.searchParams.get("pn"));
      requests.push({ endpoint, options });
      return followResponse(page, 45);
    },
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map(({ endpoint }) => endpoint.searchParams.get("pn")),
    ["1", "2"],
  );
  assert.equal(requests[0].endpoint.searchParams.get("vmid"), "123");
  assert.equal(requests[0].endpoint.searchParams.get("follow_status"), "0");
  assert.equal(
    requests[0].options.headers.Referer,
    "https://space.bilibili.com/123/bangumi",
  );
  assert.equal(result.cards.length, 45);
  assert.equal(result.total, 45);
  assert.equal(result.truncated, false);
  assert.equal(result.fetchedPages, 2);
  assert.deepEqual(result.cards[0], {
    mediaId: "100001",
    seasonId: "200001",
    title: "中文番剧 1",
    coverUrl: "https://i0.hdslb.com/bfs/anime/1.jpg",
    source: "bilibili-follow-api",
  });
});

test("reports when the follow list exceeds the configured import limit", async () => {
  const result = await fetchBilibiliFollowList("123", {
    maxItems: 40,
    maxPages: 10,
    requestJsonImpl: async (url) => {
      const page = Number(new URL(url).searchParams.get("pn"));
      return followResponse(page, 45);
    },
  });

  assert.equal(result.cards.length, 40);
  assert.equal(result.total, 45);
  assert.equal(result.truncated, true);
  assert.equal(result.fetchedPages, 2);
});
