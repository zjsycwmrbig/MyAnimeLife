import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnimeRecord,
  deriveGithubUrls,
  externalIdsForItem,
  GitHubRecordsService,
  mergeAnimeRecord,
  parseGithubRepository,
  recordIdsForItem,
} from "../src/core/github-records.js";

const item = {
  id: "bangumi:525565",
  title: "正反対な君と僕",
  displayTitle: "相反的你和我",
  names: ["相反的你和我", "正反対な君と僕"],
  coverUrl: "//i0.hdslb.com/example.jpg",
  sites: {
    bangumi: "525565",
    bilibili: "292073015",
    mal: "60371",
  },
};

const selectedResult = {
  item,
  confidence: 1,
  matchedBy: ["bilibili-id"],
};

function base64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

function contentResponse(record, sha = "sha-1", id = record.id) {
  return {
    type: "file",
    encoding: "base64",
    content: base64(JSON.stringify(record, null, 2)),
    sha,
    path: `data/anime/${id}.json`,
    html_url:
      `https://github.com/example/anime-records/blob/main/data/anime/${id}.json`,
  };
}

function directoryResponse(records) {
  return records.map((record) => ({
    type: "file",
    name: `${record.id}.json`,
    path: `data/anime/${record.id}.json`,
    sha: `sha-${record.id}`,
  }));
}

function putResponse(id, sha) {
  return {
    content: {
      name: `${id}.json`,
      path: `data/anime/${id}.json`,
      sha,
      html_url: `https://github.com/example/anime-records/blob/main/data/anime/${id}.json`,
    },
    commit: { sha: "commit-1" },
  };
}

test("parses GitHub repository forms and rejects unsafe URLs", () => {
  assert.deepEqual(parseGithubRepository("example/anime-records"), {
    owner: "example",
    repo: "anime-records",
    fullName: "example/anime-records",
    webUrl: "https://github.com/example/anime-records",
  });
  assert.equal(
    parseGithubRepository(
      "https://github.com/example/anime-records.git",
    ).fullName,
    "example/anime-records",
  );
  assert.throws(
    () => parseGithubRepository("http://github.com/example/anime-records"),
    /github\.com/u,
  );
  assert.throws(
    () => parseGithubRepository("https://example.com/example/anime-records"),
    /github\.com/u,
  );
  assert.throws(
    () => parseGithubRepository("https://github.com/example/anime-records/tree/main"),
    /仓库主页地址/u,
  );
});

test("derives API, raw and Pages URLs without wildcard GitHub hosts", () => {
  const urls = deriveGithubUrls(
    "https://github.com/example/anime-records",
    "feature/data",
  );
  assert.equal(
    urls.apiUrl,
    "https://api.github.com/repos/example/anime-records",
  );
  assert.equal(
    urls.contentsUrl,
    "https://api.github.com/repos/example/anime-records/contents",
  );
  assert.equal(
    urls.pagesLibraryUrl,
    "https://example.github.io/anime-records/data/library.json",
  );
  assert.equal(
    urls.rawLibraryUrl,
    "https://raw.githubusercontent.com/example/anime-records/feature/data/dist/data/library.json",
  );
});

test("uses stable site IDs before the manual title hash", () => {
  assert.deepEqual(externalIdsForItem(item, selectedResult), {
    bangumi: "525565",
    bilibiliMedia: "292073015",
    mal: "60371",
  });
  assert.deepEqual(recordIdsForItem(item, selectedResult), [
    "bili-292073015",
    "bgm-525565",
    "mal-60371",
  ]);

  const manualItem = {
    title: "没有站点映射的番剧",
    names: ["没有站点映射的番剧"],
    sites: {},
  };
  const manualIds = recordIdsForItem(manualItem);
  assert.match(manualIds[0], /^manual-[^/]+-[a-f0-9]{8}$/u);
  assert.deepEqual(recordIdsForItem(manualItem), manualIds);
});

test("creates sanitized records and preserves existing fields on merge", () => {
  const created = createAnimeRecord({
    item,
    selectedResult,
    id: "bili-292073015",
    rating: 9.26,
    review: "  很好  ",
    now: "2026-10-25T08:00:00.000Z",
  });
  assert.equal(created.rating, 9.3);
  assert.equal(created.review, "很好");
  assert.equal(created.coverUrl, "https://i0.hdslb.com/example.jpg");
  assert.equal(created.match.method, "site-id");

  const merged = mergeAnimeRecord(
    {
      ...created,
      note: "保留备注",
      customField: { nested: true },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      item,
      selectedResult,
      id: "bili-292073015",
      rating: 8,
      review: "新评价",
      now: "2026-10-25T09:00:00.000Z",
    },
  );
  assert.equal(merged.rating, 8);
  assert.equal(merged.review, "新评价");
  assert.equal(merged.note, "保留备注");
  assert.deepEqual(merged.customField, { nested: true });
  assert.equal(merged.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(merged.updatedAt, "2026-10-25T09:00:00.000Z");
});

test("uses the Bilibili season id as the preferred record identity", () => {
  const selected = {
    ...selectedResult,
    bilibiliMetadata: {
      seasonId: "129142",
      seasonTitle: "相反的你和我 第2季",
    },
  };
  const created = createAnimeRecord({
    item,
    selectedResult: selected,
    id: "bili-ss129142",
    rating: 9,
    review: "第二季",
    now: "2026-10-25T08:00:00.000Z",
  });

  assert.equal(created.externalIds.bilibiliSeason, "129142");
  assert.equal(created.season.number, 2);
  assert.equal(created.season.label, "第2季");
  assert.deepEqual(recordIdsForItem(item, selected).slice(0, 2), [
    "bili-ss129142",
    "bili-292073015",
  ]);
});

test("updates an existing GitHub record with its sha", async () => {
  const existing = {
    ...createAnimeRecord({
      item,
      selectedResult,
      id: "bili-292073015",
      rating: 7,
      review: "旧评价",
      now: "2026-10-25T08:00:00.000Z",
    }),
    note: "不能丢失",
  };
  const calls = [];
  const requestJson = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "PUT") {
      return putResponse("bili-292073015", "sha-2");
    }
    if (new URL(url).pathname.endsWith("/contents/data/anime")) {
      return directoryResponse([existing]);
    }
    return contentResponse(existing, "sha-1");
  };
  const service = new GitHubRecordsService({
    settingsStore: {
      get: () => ({
        github: {
          enabled: true,
          repositoryUrl: "example/anime-records",
          token: "secret-token",
          branch: "main",
        },
      }),
    },
    requestJsonImpl: requestJson,
    now: () => "2026-10-25T09:00:00.000Z",
  });

  const saved = await service.saveRecord({
    item,
    selectedResult,
    rating: 9,
    review: "新评价",
  });

  assert.equal(saved.record.rating, 9);
  assert.equal(saved.record.note, "不能丢失");
  assert.equal(saved.sha, "sha-2");
  const put = calls.find((call) => call.options.method === "PUT");
  assert.ok(put);
  assert.equal(put.options.headers.Authorization, "Bearer secret-token");
  const body = JSON.parse(put.options.body);
  assert.equal(body.sha, "sha-1");
  assert.equal(body.branch, "main");
  const uploaded = JSON.parse(
    Buffer.from(body.content, "base64").toString("utf8"),
  );
  assert.equal(uploaded.rating, 9);
  assert.equal(uploaded.review, "新评价");
});

test("refetches sha and retries once after a Contents API conflict", async () => {
  const records = [
    createAnimeRecord({
      item,
      selectedResult,
      id: "bili-292073015",
      rating: 6,
      review: "第一次读取",
      now: "2026-10-25T08:00:00.000Z",
    }),
    createAnimeRecord({
      item,
      selectedResult,
      id: "bili-292073015",
      rating: 6,
      review: "冲突后读取",
      now: "2026-10-25T08:30:00.000Z",
    }),
  ];
  let gets = 0;
  const putBodies = [];
  const requestJson = async (url, options) => {
    if (options.method === "PUT") {
      putBodies.push(JSON.parse(options.body));
      if (putBodies.length === 1) {
        const error = new Error("HTTP 422 conflict");
        error.status = 422;
        throw error;
      }
      return putResponse("bili-292073015", "sha-3");
    }
    if (new URL(url).pathname.endsWith("/contents/data/anime")) {
      return directoryResponse([records[0]]);
    }
    const record = records[Math.min(gets, records.length - 1)];
    gets += 1;
    return contentResponse(record, gets === 1 ? "sha-1" : "sha-2");
  };
  const service = new GitHubRecordsService({
    settingsStore: {
      get: () => ({
        github: {
          enabled: true,
          repositoryUrl: "example/anime-records",
          token: "secret-token",
          branch: "main",
        },
      }),
    },
    requestJsonImpl: requestJson,
    now: () => "2026-10-25T09:00:00.000Z",
  });

  const saved = await service.saveRecord({
    item,
    selectedResult,
    rating: 10,
    review: "最终评价",
  });

  assert.equal(saved.sha, "sha-3");
  assert.equal(putBodies.length, 2);
  assert.equal(putBodies[0].sha, "sha-1");
  assert.equal(putBodies[1].sha, "sha-2");
});

function duplicateService(records) {
  return new GitHubRecordsService({
    settingsStore: {
      get: () => ({
        github: {
          enabled: true,
          repositoryUrl: "example/anime-records",
          token: "secret-token",
          branch: "main",
        },
      }),
    },
    requestJsonImpl: async (url, options) => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith("/contents/data/anime")) {
        return directoryResponse(records);
      }
      if (options.method === "PUT") {
        const id = pathname.match(/([^/]+)\.json$/u)?.[1];
        return putResponse(id, `sha-${id}`);
      }
      const id = pathname.match(/([^/]+)\.json$/u)?.[1];
      const record = records.find((candidate) => candidate.id === id);
      if (record) {
        return contentResponse(record, `sha-${id}`, id);
      }
      const error = new Error("HTTP 404 Not Found");
      error.status = 404;
      throw error;
    },
    now: () => "2026-10-25T09:00:00.000Z",
  });
}

test("suspected duplicates respect season identity and can be confirmed", async () => {
  const existing = {
    ...createAnimeRecord({
      item: {
        id: "bangumi:old",
        title: "测试番剧 第二季",
        displayTitle: "测试番剧 第2季",
        names: ["测试番剧 第二季"],
        sites: { bangumi: "100", bilibili: "900" },
      },
      id: "bili-900",
      rating: 8,
      review: "旧记录",
      now: "2026-10-25T08:00:00.000Z",
    }),
    season: {
      key: "bili-900",
      number: 2,
      label: "第2季",
      year: 2025,
    },
  };
  const service = duplicateService([existing]);
  const secondSeason = {
    id: "bangumi:new",
    title: "测试番剧 第二季",
    displayTitle: "测试番剧 第2季",
    names: ["测试番剧 第二季"],
    sites: { bangumi: "200", bilibili: "901" },
    begin: "2025-01-01T00:00:00.000Z",
  };
  const selected = {
    item: secondSeason,
    bilibiliMetadata: {
      seasonId: "2901",
      seasonTitle: "测试番剧 第2季",
    },
  };

  const inspection = await service.inspectDuplicates({
    item: secondSeason,
    selectedResult: selected,
  });
  assert.equal(inspection.duplicates.length, 1);
  assert.match(inspection.duplicates[0].reason, /同一季度/u);

  await assert.rejects(
    () =>
      service.saveRecord({
        item: secondSeason,
        selectedResult: selected,
        rating: 9,
        review: "新记录",
      }),
    (error) => error.code === "DUPLICATE_RECORDS",
  );

  const saved = await service.saveRecord({
    item: secondSeason,
    selectedResult: selected,
    rating: 9,
    review: "确认后的新记录",
    allowDuplicates: true,
  });
  assert.equal(saved.id, "bili-ss2901");

  const firstSeason = {
    ...secondSeason,
    id: "bangumi:s1",
    title: "测试番剧 第一季",
    displayTitle: "测试番剧 第1季",
    names: ["测试番剧 第一季"],
  };
  const differentSeason = await service.inspectDuplicates({
    item: firstSeason,
    selectedResult: {
      item: firstSeason,
      bilibiliMetadata: { seasonId: "1901" },
    },
  });
  assert.equal(differentSeason.duplicates.length, 0);
});

test("reports authorization failures without exposing the token", async () => {
  const token = "github_pat_should_never_appear";
  const service = new GitHubRecordsService({
    settingsStore: {
      get: () => ({
        github: {
          enabled: true,
          repositoryUrl: "example/anime-records",
          token,
          branch: "main",
        },
      }),
    },
    requestJsonImpl: async () => {
      const error = new Error("HTTP 401 Unauthorized");
      error.status = 401;
      throw error;
    },
  });

  await assert.rejects(
    () => service.loadForItem(item, selectedResult),
    (error) => {
      assert.match(error.message, /Token.*Contents/u);
      assert.ok(!error.message.includes(token));
      return true;
    },
  );
});
