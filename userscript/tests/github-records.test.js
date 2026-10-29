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
import {
  ANIME_INDEX_JSONL_PATH,
  ANIME_JSONL_PATH,
  BACKUP_DIRECTORY,
  buildAnimeIndex,
  parseJsonl,
  serializeJsonl,
} from "../src/core/record-jsonl.js";

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

function createGithubMock({
  records = null,
  files = {},
  onRefUpdate = null,
} = {}) {
  const state = new Map();
  const calls = [];
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  let revision = 1;
  let headSha = null;

  function fileMetadata(repoPath, text, sha) {
    return {
      type: "file",
      encoding: "base64",
      content: Buffer.from(text, "utf8").toString("base64"),
      sha,
      path: repoPath,
      html_url:
        `https://github.com/example/anime-records/blob/main/${repoPath}`,
    };
  }

  function nextSha() {
    revision += 1;
    return `sha-${revision}`;
  }

  function cloneFiles(source = state) {
    return new Map(
      [...source.entries()].map(([repoPath, file]) => [
        repoPath,
        { ...file },
      ]),
    );
  }

  function stageFile(repoPath, text, sha = nextSha()) {
    const file = {
      text: String(text ?? ""),
      sha,
      path: repoPath,
      html_url:
        `https://github.com/example/anime-records/blob/main/${repoPath}`,
    };
    state.set(repoPath, file);
    blobs.set(sha, file.text);
    return file;
  }

  function stageLibrary(nextRecords) {
    return [
      stageFile(ANIME_JSONL_PATH, serializeJsonl(nextRecords)),
      stageFile(
      ANIME_INDEX_JSONL_PATH,
      serializeJsonl(buildAnimeIndex(nextRecords)),
      ),
    ];
  }

  function commitFiles(files, message, parent = headSha) {
    const treeSha = nextSha();
    const treeEntries = [...files.entries()].map(([repoPath, file]) => ({
      path: repoPath,
      mode: "100644",
      type: "blob",
      sha: file.sha,
    }));
    const tree = {
      sha: treeSha,
      tree: treeEntries,
      files: cloneFiles(files),
    };
    trees.set(treeSha, tree);
    const commitSha = nextSha();
    const commit = {
      sha: commitSha,
      message,
      tree: { sha: treeSha },
      parents: parent ? [{ sha: parent }] : [],
      files: cloneFiles(files),
    };
    commits.set(commitSha, commit);
    headSha = commitSha;
    return commit;
  }

  function commitCurrent(message) {
    return commitFiles(state, message);
  }

  function setFile(repoPath, text, sha) {
    const file = stageFile(repoPath, text, sha);
    commitCurrent(`External file update: ${repoPath}`);
    return file;
  }

  function setLibrary(nextRecords) {
    stageLibrary(nextRecords);
    commitCurrent("External library update");
  }

  for (const [repoPath, file] of Object.entries(files)) {
    stageFile(repoPath, file.text ?? file, file.sha);
  }
  if (records) {
    stageLibrary(records);
  }
  commitCurrent("Initial repository state");

  const api = {
    state,
    calls,
    blobs,
    trees,
    commits,
    setFile,
    setLibrary,
    get headSha() {
      return headSha;
    },
    latestTreeEntry(repoPath) {
      const treeCall = [...calls]
        .reverse()
        .find(
          (call) =>
            call.method === "POST" &&
            new URL(call.url).pathname.endsWith("/git/trees"),
        );
      if (!treeCall) {
        return null;
      }
      return JSON.parse(treeCall.options.body).tree.find(
        (entry) => entry.path === repoPath,
      ) ?? null;
    },
    requestJson: async (url, options = {}) => {
      const request = {
        url,
        options,
        method: options.method ?? "GET",
      };
      calls.push(request);
      const pathname = new URL(url).pathname;
      const endpoint = pathname.slice(
        pathname.indexOf("/repos/example/anime-records") +
          "/repos/example/anime-records".length,
      );
      const contentsPrefix = "/contents/";
      const gitPrefix = "/git/";
      const jsonBody = () =>
        options.body ? JSON.parse(options.body) : {};
      const notFound = () => {
        const error = new Error("HTTP 404 Not Found");
        error.status = 404;
        throw error;
      };
      const snapshotForRef = (ref) => {
        if (!ref || ref === "main") {
          return state;
        }
        return commits.get(ref)?.files ?? null;
      };

      if (endpoint.startsWith(contentsPrefix)) {
        const repoPath = decodeURIComponent(
          endpoint.slice(contentsPrefix.length),
        );
        if (request.method !== "GET") {
          throw new Error(`Unsupported Contents API method: ${request.method}`);
        }
        const ref = new URL(url).searchParams.get("ref");
        const snapshot = snapshotForRef(ref);
        if (!snapshot) {
          return notFound();
        }
        if (repoPath === BACKUP_DIRECTORY) {
          return [...snapshot.values()]
            .filter((file) => file.path.startsWith(`${BACKUP_DIRECTORY}/`))
            .map((file) => ({
              type: "file",
              name: file.path.split("/").at(-1),
              path: file.path,
              sha: file.sha,
            }));
        }
        const file = snapshot.get(repoPath);
        if (!file) {
          return notFound();
        }
        return fileMetadata(repoPath, file.text, file.sha);
      }

      if (!endpoint.startsWith(gitPrefix)) {
        throw new Error(`Unexpected GitHub API URL: ${url}`);
      }
      const gitEndpoint = endpoint.slice(gitPrefix.length);
      if (
        request.method === "GET" &&
        gitEndpoint === "ref/heads/main"
      ) {
        return { ref: "refs/heads/main", object: { sha: headSha } };
      }
      if (
        request.method === "GET" &&
        gitEndpoint.startsWith("commits/")
      ) {
        const sha = decodeURIComponent(gitEndpoint.slice("commits/".length));
        const commit = commits.get(sha);
        if (!commit) {
          return notFound();
        }
        return {
          sha: commit.sha,
          message: commit.message,
          tree: commit.tree,
          parents: commit.parents,
        };
      }
      if (request.method === "POST" && gitEndpoint === "blobs") {
        const body = jsonBody();
        const text =
          body.encoding === "base64"
            ? Buffer.from(body.content, "base64").toString("utf8")
            : String(body.content ?? "");
        const sha = nextSha();
        blobs.set(sha, text);
        return { sha };
      }
      if (request.method === "POST" && gitEndpoint === "trees") {
        const body = jsonBody();
        const baseTree = trees.get(body.base_tree);
        if (!baseTree) {
          return notFound();
        }
        const nextFiles = cloneFiles(baseTree.files);
        for (const entry of body.tree ?? []) {
          if (entry.sha === null) {
            nextFiles.delete(entry.path);
            continue;
          }
          const text = blobs.get(entry.sha);
          if (text === undefined) {
            throw new Error(`Unknown blob SHA: ${entry.sha}`);
          }
          nextFiles.set(entry.path, {
            text,
            sha: entry.sha,
            path: entry.path,
            html_url:
              `https://github.com/example/anime-records/blob/main/${entry.path}`,
          });
        }
        const sha = nextSha();
        const tree = {
          sha,
          tree: [...nextFiles.values()].map((file) => ({
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: file.sha,
          })),
          files: nextFiles,
        };
        trees.set(sha, tree);
        return { sha, tree: tree.tree };
      }
      if (request.method === "POST" && gitEndpoint === "commits") {
        const body = jsonBody();
        const tree = trees.get(body.tree);
        if (!tree) {
          return notFound();
        }
        const sha = nextSha();
        const parents = (body.parents ?? []).map((parent) => ({
          sha: parent,
        }));
        const commit = {
          sha,
          message: body.message,
          tree: { sha: tree.sha },
          parents,
          files: cloneFiles(tree.files),
        };
        commits.set(sha, commit);
        return { sha, tree: commit.tree, parents };
      }
      if (
        request.method === "PATCH" &&
        gitEndpoint === "refs/heads/main"
      ) {
        if (onRefUpdate) {
          await onRefUpdate({ api, body: jsonBody() });
        }
        const body = jsonBody();
        const commit = commits.get(body.sha);
        if (!commit) {
          return notFound();
        }
        const expectedParent = commit.parents[0]?.sha ?? null;
        if (!body.force && expectedParent !== headSha) {
          const error = new Error("HTTP 409 conflict");
          error.status = 409;
          throw error;
        }
        headSha = commit.sha;
        state.clear();
        for (const [repoPath, file] of commit.files) {
          state.set(repoPath, { ...file });
        }
        return { ref: "refs/heads/main", object: { sha: headSha } };
      }

      throw new Error(
        `Unsupported GitHub Git API request: ${request.method} ${endpoint}`,
      );
    },
  };

  return api;
}

function createService(requestJson, now = "2026-10-25T09:00:00.000Z") {
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
    requestJsonImpl: requestJson,
    now: () => now,
  });
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

test("confirms existing records before replacing or appending a JSONL record", async () => {
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
  const originalAnimeText = serializeJsonl([existing]);
  const originalIndexText = serializeJsonl(buildAnimeIndex([existing]));
  const api = createGithubMock({ records: [existing] });
  const service = createService(api.requestJson);

  await assert.rejects(
    () =>
      service.saveRecord({
        item,
        selectedResult,
        rating: 9,
        review: "新评价",
      }),
    (error) =>
      error.code === "DUPLICATE_RECORDS" &&
      error.duplicates[0]?.kind === "existing",
  );
  assert.equal(
    api.calls.filter((call) => ["PUT", "PATCH"].includes(call.method))
      .length,
    0,
  );

  const replaced = await service.saveRecord({
    item,
    selectedResult,
    rating: 9,
    review: "替换后的评价",
    replaceExisting: true,
  });

  assert.equal(replaced.replacedExisting, true);
  assert.equal(replaced.appendedDuplicate, false);
  assert.equal(replaced.id, existing.id);
  assert.equal(replaced.record.rating, 9);
  assert.equal(replaced.record.review, "替换后的评价");
  assert.equal(replaced.record.note, "不能丢失");
  assert.equal(replaced.record.createdAt, existing.createdAt);

  const replacedRecords = parseJsonl(
    api.state.get(ANIME_JSONL_PATH).text,
    ANIME_JSONL_PATH,
  );
  assert.equal(replacedRecords.length, 1);
  assert.equal(replacedRecords[0].id, existing.id);
  assert.equal(replacedRecords[0].rating, 9);
  assert.equal(replacedRecords[0].review, "替换后的评价");
  assert.equal(replacedRecords[0].note, "不能丢失");
  assert.deepEqual(
    parseJsonl(
      api.state.get(ANIME_INDEX_JSONL_PATH).text,
      ANIME_INDEX_JSONL_PATH,
    ),
    buildAnimeIndex(replacedRecords),
  );

  const saved = await service.saveRecord({
    item,
    selectedResult,
    rating: 10,
    review: "另外追加的新评价",
    allowDuplicates: true,
  });

  assert.equal(saved.appendedDuplicate, true);
  assert.equal(saved.replacedExisting, false);
  assert.notEqual(saved.id, existing.id);
  assert.equal(saved.record.rating, 10);
  assert.equal(saved.record.note, "");
  assert.equal(saved.path, ANIME_JSONL_PATH);
  assert.equal(
    api.calls.filter((call) => call.method === "PUT").length,
    0,
  );
  const publishCalls = api.calls.filter((call) =>
    ["POST", "PATCH"].includes(call.method),
  );
  assert.equal(
    publishCalls.filter(
      (call) => new URL(call.url).pathname.endsWith("/git/blobs"),
    ).length,
    6,
  );
  assert.equal(
    publishCalls.filter(
      (call) => new URL(call.url).pathname.endsWith("/git/trees"),
    ).length,
    2,
  );
  assert.equal(
    publishCalls.filter(
      (call) => new URL(call.url).pathname.endsWith("/git/commits"),
    ).length,
    2,
  );
  assert.equal(
    publishCalls.filter((call) => call.method === "PATCH").length,
    2,
  );
  assert.ok(
    publishCalls.every(
      (call) =>
        call.options.headers.Authorization === "Bearer secret-token",
    ),
  );

  const uploadedRecords = parseJsonl(
    api.state.get(ANIME_JSONL_PATH).text,
    ANIME_JSONL_PATH,
  );
  assert.equal(uploadedRecords.length, 2);
  const original = uploadedRecords.find((record) => record.id === existing.id);
  const appended = uploadedRecords.find((record) => record.id === saved.id);
  assert.equal(original.rating, 9);
  assert.equal(original.review, "替换后的评价");
  assert.equal(original.note, "不能丢失");
  assert.equal(appended.rating, 10);
  assert.equal(appended.review, "另外追加的新评价");
  assert.deepEqual(appended.externalIds, existing.externalIds);

  const uploadedIndex = parseJsonl(
    api.state.get(ANIME_INDEX_JSONL_PATH).text,
    ANIME_INDEX_JSONL_PATH,
  );
  assert.deepEqual(uploadedIndex, buildAnimeIndex(uploadedRecords));

  const backupFile = [...api.state.entries()].find(([repoPath]) =>
    repoPath.startsWith(`${BACKUP_DIRECTORY}/library-`),
  )?.[1];
  assert.ok(backupFile);
  const backup = JSON.parse(backupFile.text);
  assert.equal(backup.kind, "anime-library-backup");
  assert.equal(backup.animeText, originalAnimeText);
  assert.equal(backup.indexText, originalIndexText);
});

test("replacement fails safely when no exact record exists", async () => {
  const similar = createAnimeRecord({
    item: {
      ...item,
      id: "bangumi:other",
      title: "相似的番剧",
      displayTitle: "相似的番剧",
      names: ["相似的番剧"],
      sites: { bangumi: "999999" },
    },
    id: "bgm-999999",
    rating: 7,
    review: "相似但不同",
    now: "2026-10-25T08:00:00.000Z",
  });
  const api = createGithubMock({ records: [similar] });
  const service = createService(api.requestJson);

  await assert.rejects(
    () =>
      service.saveRecord({
        item,
        selectedResult,
        rating: 9,
        review: "不应写入",
        replaceExisting: true,
      }),
    /未找到可替换的精确番剧记录/u,
  );
  assert.equal(
    api.calls.filter((call) => ["PUT", "PATCH"].includes(call.method))
      .length,
    0,
  );
});

test("batch imports new anime once and preserves existing ratings and reviews", async () => {
  const existing = createAnimeRecord({
    item,
    selectedResult,
    id: "bili-292073015",
    rating: 7,
    review: "已有评价不能被覆盖",
    now: "2026-10-25T08:00:00.000Z",
  });
  const newItem = {
    id: "bangumi:400602",
    title: "葬送のフリーレン",
    displayTitle: "葬送的芙莉莲",
    names: ["葬送的芙莉莲", "葬送のフリーレン"],
    coverUrl: "//i0.hdslb.com/bfs/anime/frieren.jpg",
    sites: {
      bangumi: "400602",
      bilibili: "4317671",
    },
  };
  const newSelection = {
    item: newItem,
    confidence: 1,
    matchedBy: ["bilibili-api-id"],
    bilibiliMetadata: {
      mediaId: "4317671",
      seasonId: "129142",
      title: "葬送的芙莉莲",
    },
  };
  const api = createGithubMock({ records: [existing] });
  const service = createService(api.requestJson);

  const result = await service.saveRecordsBatch({
    entries: [
      { item, selectedResult },
      { item: newItem, selectedResult: newSelection },
    ],
    now: "2026-10-25T09:00:00.000Z",
  });

  assert.equal(result.imported.length, 1);
  assert.equal(result.imported[0].id, "bili-ss129142");
  assert.equal(result.skippedCount, 1);
  assert.equal(result.scannedCount, 2);

  assert.equal(
    api.calls.filter((call) => call.method === "PUT").length,
    0,
  );
  assert.equal(
    api.calls.filter((call) => call.method === "PATCH").length,
    1,
  );
  assert.equal(
    api.calls.filter(
      (call) => new URL(call.url).pathname.endsWith("/git/blobs"),
    ).length,
    3,
  );

  const records = parseJsonl(
    api.state.get(ANIME_JSONL_PATH).text,
    ANIME_JSONL_PATH,
  );
  assert.equal(records.length, 2);
  const preserved = records.find((record) => record.id === "bili-292073015");
  const imported = records.find((record) => record.id === "bili-ss129142");
  assert.equal(preserved.rating, 7);
  assert.equal(preserved.review, "已有评价不能被覆盖");
  assert.equal(imported.rating, null);
  assert.equal(imported.review, "");
  assert.equal(imported.externalIds.bilibiliSeason, "129142");
  assert.equal(imported.externalIds.bilibiliMedia, "4317671");
  assert.equal(imported.coverUrl, "https://i0.hdslb.com/bfs/anime/frieren.jpg");

  const index = parseJsonl(
    api.state.get(ANIME_INDEX_JSONL_PATH).text,
    ANIME_INDEX_JSONL_PATH,
  );
  assert.deepEqual(index, buildAnimeIndex(records));
});

test("a confirmed duplicate appends even when the remote timestamp is ahead", async () => {
  const existing = createAnimeRecord({
    item,
    selectedResult,
    id: "bili-292073015",
    rating: 7,
    review: "旧评价",
    now: "2026-10-25T10:00:00.000Z",
  });
  const api = createGithubMock({ records: [existing] });
  const service = createService(
    api.requestJson,
    "2026-10-25T09:00:00.000Z",
  );

  const saved = await service.saveRecord({
    item,
    selectedResult,
    rating: 9,
    review: "时钟偏差下的新评价",
    allowDuplicates: true,
  });
  const records = parseJsonl(
    api.state.get(ANIME_JSONL_PATH).text,
    ANIME_JSONL_PATH,
  );

  assert.equal(saved.appendedDuplicate, true);
  assert.equal(saved.record.rating, 9);
  assert.equal(saved.record.updatedAt, "2026-10-25T09:00:00.000Z");
  assert.equal(records.length, 2);
  assert.equal(records.find((record) => record.id === existing.id).rating, 7);
  assert.equal(
    records.find((record) => record.id === saved.id).review,
    "时钟偏差下的新评价",
  );
});

test("refetches both JSONL files and retries once after a conflict", async () => {
  const first = createAnimeRecord({
    item,
    selectedResult,
    id: "bili-292073015",
    rating: 6,
    review: "第一次读取",
    now: "2026-10-25T08:00:00.000Z",
  });
  const remoteChange = {
    ...first,
    note: "冲突期间的新备注",
    updatedAt: "2026-10-25T08:30:00.000Z",
  };
  let failFirstRefUpdate = true;
  const api = createGithubMock({
    records: [first],
    onRefUpdate: async ({ api: currentApi }) => {
      if (failFirstRefUpdate) {
        failFirstRefUpdate = false;
        currentApi.setLibrary([remoteChange]);
        const error = new Error("HTTP 409 conflict");
        error.status = 409;
        throw error;
      }
    },
  });
  const service = createService(api.requestJson);

  const saved = await service.saveRecord({
    item,
    selectedResult,
    rating: 10,
    review: "最终评价",
    allowDuplicates: true,
  });

  assert.equal(saved.appendedDuplicate, true);
  const refUpdates = api.calls.filter(
    (call) =>
      call.method === "PATCH" &&
      new URL(call.url).pathname.endsWith("/git/refs/heads/main"),
  );
  assert.equal(refUpdates.length, 2);
  assert.equal(
    api.calls.filter((call) => call.method === "PUT").length,
    0,
  );

  const finalRecords = parseJsonl(
    api.state.get(ANIME_JSONL_PATH).text,
    ANIME_JSONL_PATH,
  );
  const finalIndex = parseJsonl(
    api.state.get(ANIME_INDEX_JSONL_PATH).text,
    ANIME_INDEX_JSONL_PATH,
  );
  assert.deepEqual(finalIndex, buildAnimeIndex(finalRecords));
  assert.equal(finalRecords.length, 2);
  assert.equal(
    finalRecords.find((record) => record.id === remoteChange.id).note,
    "冲突期间的新备注",
  );
  assert.equal(
    finalRecords.find((record) => record.id === saved.id).rating,
    10,
  );
  assert.equal(
    finalRecords.find((record) => record.id === saved.id).review,
    "最终评价",
  );
});

test("keeps only the newest five backup snapshots", async () => {
  const existing = createAnimeRecord({
    item,
    selectedResult,
    id: "bili-292073015",
    rating: 7,
    review: "旧评价",
    now: "2026-10-25T08:00:00.000Z",
  });
  const files = {};
  for (let index = 1; index <= 5; index += 1) {
    const name = `library-2026-10-2${index}T00-00-00-000Z-old${index}.json`;
    files[`${BACKUP_DIRECTORY}/${name}`] =
      `{"schemaVersion":1,"kind":"anime-library-backup"}\n`;
  }
  const api = createGithubMock({ records: [existing], files });
  const service = createService(api.requestJson);

  await service.saveRecord({
    item,
    selectedResult,
    rating: 8,
    review: "触发备份",
    allowDuplicates: true,
  });

  const backups = [...api.state.keys()]
    .filter((repoPath) => repoPath.startsWith(`${BACKUP_DIRECTORY}/library-`))
    .sort();
  assert.equal(backups.length, 5);
  assert.ok(!backups.some((repoPath) => repoPath.endsWith("old1.json")));
  assert.ok(backups.some((repoPath) => repoPath.includes("2026-10-25")));
});

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
  const api = createGithubMock({ records: [existing] });
  const service = createService(api.requestJson);
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
    sites: { bangumi: "300", bilibili: "902" },
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

test("checks whether the public onboarding repository is a usable template", async () => {
  const requests = [];
  const service = new GitHubRecordsService({
    requestJsonImpl: async (url, options = {}) => {
      requests.push({ url, options });
      return {
        full_name: "example/public-template",
        private: false,
        is_template: true,
        default_branch: "main",
        html_url: "https://github.com/example/public-template",
      };
    },
  });

  const result = await service.checkTemplateRepository();

  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/repos\/.+MyAnimeLife$/u);
  assert.equal(requests[0].options.timeout, 20000);
  assert.deepEqual(result, {
    fullName: "example/public-template",
    private: false,
    isTemplate: true,
    defaultBranch: "main",
    ready: true,
    webUrl: "https://github.com/example/public-template",
  });
});

test("marks a repository without template mode as not ready", async () => {
  const service = new GitHubRecordsService({
    requestJsonImpl: async () => ({
      full_name: "example/public-template",
      private: false,
      is_template: false,
      default_branch: "main",
      html_url: "https://github.com/example/public-template",
    }),
  });

  const result = await service.checkTemplateRepository();

  assert.equal(result.ready, false);
  assert.equal(result.isTemplate, false);
});
