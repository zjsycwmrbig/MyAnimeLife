import test from "node:test";
import assert from "node:assert/strict";
import {
  GitHubApiError,
  GitHubClient,
  base64ToText,
} from "../admin/github-client.js";
import { buildLibraryData } from "../scripts/admin-data.mjs";

const baseRecord = {
  $schema: "../../schemas/anime.schema.json",
  schemaVersion: 1,
  id: "manual-github-test",
  title: "远端测试",
  rating: null,
  review: "",
  coverUrl: null,
  note: "",
  externalIds: {},
  match: {
    status: "manual",
    method: "manual",
    source: "manual",
    confidence: 1,
    matchedTitle: "远端测试",
    matchedAt: "2026-10-25T12:00:00Z",
  },
  createdAt: "2026-10-25T12:00:00Z",
  updatedAt: "2026-10-25T12:00:00Z",
};

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function createSnapshot(oldLibrary, overrides = {}) {
  return {
    headSha: "a".repeat(40),
    baseTreeSha: "b".repeat(40),
    config: {
      dataFile: "data/anime.jsonl",
      indexFile: "data/anime-index.jsonl",
      backupDirectory: "data/backups",
      backupLimit: 2,
    },
    records: oldLibrary.records,
    index: oldLibrary.index,
    dataText: oldLibrary.dataText,
    indexText: oldLibrary.indexText,
    backups: [],
    ...overrides,
  };
}

function createPublishFetch(requests, options = {}) {
  let blobCount = 0;
  return async (url, init) => {
    const request = {
      url: String(url),
      method: init.method,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : null,
    };
    requests.push(request);
    const path = new URL(url).pathname;

    if (path.endsWith("/git/blobs")) {
      blobCount += 1;
      return response({ sha: `blob-${blobCount}` });
    }
    if (path.endsWith("/git/trees")) {
      return response({ sha: "tree-new" });
    }
    if (path.endsWith("/git/commits")) {
      return response({ sha: "c".repeat(40) });
    }
    if (path.endsWith("/git/refs/heads/main")) {
      if (options.refConflict) {
        return response({ message: "Reference update failed" }, 422);
      }
      return response({ object: { sha: "c".repeat(40) } });
    }
    return response({ message: "Not found" }, 404);
  };
}

test("calls the default fetch with the global browser receiver", async () => {
  const originalFetch = globalThis.fetch;
  let receivedThis = null;
  globalThis.fetch = function fetchProbe() {
    receivedThis = this;
    return Promise.resolve(response({ full_name: "example/anime" }));
  };

  try {
    const client = new GitHubClient({ repository: "example/anime" });
    const result = await client.request("");
    assert.equal(receivedThis, globalThis);
    assert.equal(result.full_name, "example/anime");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publishes data, index, and rotated backups in one Git Data commit", async () => {
  const oldLibrary = buildLibraryData([
    {
      ...baseRecord,
      title: "旧标题",
      updatedAt: "2026-10-25T10:00:00Z",
    },
  ]);
  const nextLibrary = buildLibraryData([
    {
      ...baseRecord,
      title: "新标题",
      rating: 9.2,
      updatedAt: "2026-10-25T13:00:00Z",
    },
  ]);
  const snapshot = createSnapshot(oldLibrary, {
    backups: [
      "library-2026-10-24T10-00-00-000Z-11111111.json",
      "library-2026-10-23T10-00-00-000Z-22222222.json",
    ],
  });
  const requests = [];
  const fetchImpl = createPublishFetch(requests);
  const client = new GitHubClient({
    repository: "example/anime",
    branch: "main",
    token: "github_pat_secret",
    fetchImpl,
    now: () => "2026-10-25T13:00:00.000Z",
  });

  const result = await client.publish(
    snapshot,
    nextLibrary,
    "chore(data): test atomic publish",
  );

  assert.equal(requests.length, 6);
  assert.equal(
    requests[0].headers.Authorization,
    "Bearer github_pat_secret",
  );
  assert.equal(base64ToText(requests[0].body.content), nextLibrary.dataText);
  assert.equal(base64ToText(requests[1].body.content), nextLibrary.indexText);
  assert.match(result.backupPath, /^data\/backups\/library-2026-10-25/u);

  const treeRequest = requests.find((request) =>
    request.url.endsWith("/git/trees"),
  );
  assert.equal(treeRequest.body.base_tree, snapshot.baseTreeSha);
  assert.equal(treeRequest.body.tree.length, 4);
  assert.equal(
    treeRequest.body.tree.find(
      (entry) => entry.path === snapshot.config.dataFile,
    ).sha,
    "blob-1",
  );
  assert.equal(
    treeRequest.body.tree.find(
      (entry) => entry.path === snapshot.config.indexFile,
    ).sha,
    "blob-2",
  );
  assert.equal(
    treeRequest.body.tree.find((entry) =>
      entry.path.endsWith("22222222.json"),
    ).sha,
    null,
  );

  const commitRequest = requests.find((request) =>
    request.url.endsWith("/git/commits"),
  );
  assert.deepEqual(commitRequest.body.parents, [snapshot.headSha]);
  assert.equal(commitRequest.body.tree, "tree-new");
  assert.equal(commitRequest.body.message, "chore(data): test atomic publish");

  const refRequest = requests.at(-1);
  assert.equal(refRequest.method, "PATCH");
  assert.deepEqual(refRequest.body, {
    sha: "c".repeat(40),
    force: false,
  });
});

test("does not call GitHub when the library is unchanged", async () => {
  const library = buildLibraryData([baseRecord]);
  let requestCount = 0;
  const client = new GitHubClient({
    repository: "example/anime",
    fetchImpl: async () => {
      requestCount += 1;
      return response({});
    },
  });

  const result = await client.publish(
    createSnapshot(library),
    library,
    "unused",
  );

  assert.equal(requestCount, 0);
  assert.equal(result.commit, "");
  assert.equal(result.backupPath, null);
});

test("loads public snapshots from raw content with two API calls", async () => {
  const library = buildLibraryData([baseRecord]);
  const headSha = "a".repeat(40);
  const config = {
    dataFile: "data/anime.jsonl",
    indexFile: "data/anime-index.jsonl",
    backupDirectory: "data/backups",
    backupLimit: 5,
  };
  const requests = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed);
    if (parsed.pathname.endsWith(`/git/ref/heads/main`)) {
      return response({ object: { sha: headSha } });
    }
    if (parsed.pathname.endsWith(`/git/commits/${headSha}`)) {
      return response({ tree: { sha: "b".repeat(40) } });
    }
    if (parsed.pathname.endsWith("/config/site.json")) {
      return textResponse(JSON.stringify(config));
    }
    if (parsed.pathname.endsWith("/data/anime.jsonl")) {
      return textResponse(library.dataText);
    }
    if (parsed.pathname.endsWith("/data/anime-index.jsonl")) {
      return textResponse(library.indexText);
    }
    return textResponse("Not found", 404);
  };
  const client = new GitHubClient({
    repository: "example/anime",
    branch: "main",
    fetchImpl,
  });

  const snapshot = await client.loadSnapshot();

  assert.equal(snapshot.headSha, headSha);
  assert.equal(snapshot.records[0].title, baseRecord.title);
  assert.equal(snapshot.dataText, library.dataText);
  assert.deepEqual(snapshot.backups, []);
  assert.equal(
    requests.filter((request) => request.hostname === "api.github.com").length,
    2,
  );
  assert.equal(
    requests.filter(
      (request) => request.hostname === "raw.githubusercontent.com",
    ).length,
    3,
  );
});

test("turns a stale branch update into an actionable conflict", async () => {
  const oldLibrary = buildLibraryData([baseRecord]);
  const nextLibrary = buildLibraryData([
    { ...baseRecord, rating: 8.6, updatedAt: "2026-10-25T13:00:00Z" },
  ]);
  const requests = [];
  const client = new GitHubClient({
    repository: "example/anime",
    branch: "main",
    token: "github_pat_secret",
    fetchImpl: createPublishFetch(requests, { refConflict: true }),
    now: () => "2026-10-25T13:00:00.000Z",
  });

  await assert.rejects(
    () =>
      client.publish(
        createSnapshot(oldLibrary, { backupLimit: 5 }),
        nextLibrary,
        "stale update",
      ),
    (error) =>
      error instanceof GitHubApiError &&
      error.status === 409 &&
      /刷新后重新操作/u.test(error.message),
  );
});
