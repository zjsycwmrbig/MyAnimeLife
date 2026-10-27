(() => {
  globalThis.__BANGUMI_SCOUT_TEST_MODE__ = true;
  const storageKey = "bangumi-scout.preview-gm-storage.v1";
  let persisted = {};
  try {
    persisted = JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    persisted = {};
  }
  const memory = new Map(Object.entries(persisted));
  const persistMemory = () => {
    localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(memory)));
  };
  const animePath = "data/anime.jsonl";
  const indexPath = "data/anime-index.jsonl";
  const backupDirectory = "data/backups";
  const githubRecord = {
    $schema: "../../schemas/anime.schema.json",
    schemaVersion: 1,
    id: "bili-292073015",
    title: "相反的你和我",
    rating: 8,
    review: "这条评价来自预览 GitHub 仓库。",
    coverUrl: null,
    note: "",
    externalIds: {
      bangumi: "525565",
      bilibiliMedia: "292073015",
      mal: "60371",
    },
    match: {
      status: "matched",
      method: "site-id",
      source: "bangumi-data",
      confidence: 1,
      matchedTitle: "正反対な君と僕",
      matchedAt: "2026-10-25T08:00:00.000Z",
    },
    createdAt: "2026-10-25T08:00:00.000Z",
    updatedAt: "2026-10-25T08:00:00.000Z",
  };
  const buildIndexRecord = (record) => ({
    schemaVersion: 1,
    id: record.id,
    title: record.title,
    aliases: [record.match?.matchedTitle].filter(Boolean),
    rating: record.rating,
    reviewExcerpt: String(record.review ?? "").slice(0, 180),
    coverUrl: record.coverUrl ?? null,
    externalIds: record.externalIds ?? {},
    season: record.season ?? null,
    match: {
      status: record.match?.status ?? "unmatched",
      method: record.match?.method ?? "manual",
      confidence: Number(record.match?.confidence) || 0,
      matchedTitle: record.match?.matchedTitle ?? null,
    },
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
    deletedAt: record.deletedAt ?? null,
  });
  const initialAnimeText = `${JSON.stringify(githubRecord)}\n`;
  const initialIndexText = `${JSON.stringify(buildIndexRecord(githubRecord))}\n`;
  const githubFiles = new Map([
    [
      animePath,
      {
        sha: "sha-preview-1",
        text: initialAnimeText,
      },
    ],
    [
      indexPath,
      {
        sha: "sha-preview-index-1",
        text: initialIndexText,
      },
    ],
  ]);
  let githubRevision = 2;
  let githubHead = "commit-preview-initial";
  const githubBlobs = new Map(
    [...githubFiles.values()].map((file) => [file.sha, file.text]),
  );
  const githubTrees = new Map([
    [
      "tree-preview-initial",
      {
        sha: "tree-preview-initial",
        files: new Map(
          [...githubFiles.entries()].map(([path, file]) => [
            path,
            { ...file },
          ]),
        ),
      },
    ],
  ]);
  const githubCommits = new Map([
    [
      githubHead,
      {
        sha: githubHead,
        message: "Initial preview repository",
        tree: { sha: "tree-preview-initial" },
        parents: [],
      },
    ],
  ]);

  function encodeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  function decodeBase64(value) {
    const binary = atob(String(value ?? "").replace(/\s+/gu, ""));
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
  }

  function githubFileResponse(path, file) {
    return {
      type: "file",
      encoding: "base64",
      content: encodeBase64(file.text),
      path,
      sha: file.sha,
      html_url: `https://github.com/preview-user/anime-records/blob/main/${path}`,
    };
  }

  function nextGithubSha(kind) {
    githubRevision += 1;
    return `${kind}-preview-${githubRevision}`;
  }

  function cloneGithubFiles(source = githubFiles) {
    return new Map(
      [...source.entries()].map(([path, file]) => [path, { ...file }]),
    );
  }

  function githubSnapshot(ref) {
    if (!ref || ref === "main" || ref === githubHead) {
      return githubFiles;
    }
    const commit = githubCommits.get(ref);
    return commit ? githubTrees.get(commit.tree.sha)?.files ?? null : null;
  }

  const fixtureIndex = {
    items: [
      {
        title: "正反対な君と僕",
        titleTranslate: {
          "zh-Hans": ["相反的你和我", "正相反的你与我"],
          "zh-Hant": ["相反的你和我"],
          en: ["You and I Are Polar Opposites"],
        },
        type: "tv",
        begin: "2023-01-01T00:00:00.000Z",
        sites: [
          { site: "bangumi", id: "525565" },
          { site: "bilibili", id: "292073015" },
          { site: "mal", id: "60371" },
        ],
      },
      {
        title: "葬送のフリーレン",
        titleTranslate: {
          "zh-Hans": ["葬送的芙莉莲"],
          en: ["Frieren: Beyond Journey's End"],
        },
        type: "tv",
        begin: "2023-09-29T00:00:00.000Z",
        sites: [
          { site: "bangumi", id: "400602" },
          { site: "bilibili", id: "4317671" },
        ],
      },
    ],
  };

  window.GM_getValue = (key, fallback) =>
    memory.has(key) ? memory.get(key) : fallback;
  window.GM_setValue = (key, value) => {
    memory.set(key, value);
    persistMemory();
  };
  window.GM_deleteValue = (key) => {
    memory.delete(key);
    persistMemory();
  };
  window.GM_registerMenuCommand = () => {};
  window.__previewRequests = [];
  window.__previewBilibiliDelay = 0;
  window.GM_xmlhttpRequest = (details) => {
    setTimeout(() => {
      try {
        const url = new URL(details.url);
        window.__previewRequests.push({
          method: details.method,
          url: details.url,
          data: details.data,
          headers: details.headers ?? {},
        });
        let status = 200;
        let responseText;
        if (url.hostname === "data.jsdelivr.com") {
          responseText = JSON.stringify({ tags: { latest: "preview-1" } });
        } else if (url.hostname === "cdn.jsdelivr.net") {
          responseText = JSON.stringify(fixtureIndex);
        } else if (url.hostname === "api.bilibili.com") {
          if (url.pathname === "/x/space/bangumi/follow/list") {
            responseText = JSON.stringify({
              code: 0,
              data: {
                pn: Number(url.searchParams.get("pn")) || 1,
                ps: 30,
                total: 2,
                list: [
                  {
                    media_id: 292073015,
                    season_id: 129142,
                    title: "相反的你和我",
                    season_title: "相反的你和我",
                    cover:
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'%3E%3Crect width='300' height='400' fill='%23f4c86a'/%3E%3C/svg%3E",
                  },
                  {
                    media_id: 4317671,
                    season_id: 209901,
                    title: "葬送的芙莉莲",
                    season_title: "葬送的芙莉莲",
                    cover:
                      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'%3E%3Crect width='300' height='400' fill='%2367829b'/%3E%3C/svg%3E",
                  },
                ],
              },
            });
          } else if (url.pathname === "/pgc/review/short/list") {
            responseText = JSON.stringify({
              code: 0,
              data: {
                list: [
                  {
                    content: "节奏很舒服，人物关系也写得很自然。",
                    score: 10,
                    progress: "看到第 8 话",
                    author: { uname: "preview-user" },
                  },
                ],
              },
            });
          } else {
            responseText = JSON.stringify({
              code: 0,
              result: {
                media_id: 292073015,
                season_id: 129142,
                title: "相反的你和我",
                season_title: "相反的你和我",
                alias: "正相反的你与我",
                evaluate: "个性迥异的两个人，慢慢靠近彼此。",
                rating: { score: 9.5, count: 9821 },
              },
            });
          }
        } else if (url.hostname === "api.deepseek.com") {
          responseText = JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "相反的你和我",
                    alternateTitles: ["正相反的你与我"],
                    confidence: 0.94,
                    reason: "页面标题和结构化数据均指向该作品",
                  }),
                },
              },
            ],
          });
        } else if (url.hostname === "api.bgm.tv") {
          responseText = JSON.stringify({
            id: 525565,
            name: "正反対な君と僕",
            images: {
              large:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'%3E%3Crect width='300' height='400' fill='%23f4c86a'/%3E%3Cpath d='M0 180 300 60v150L0 350Z' fill='%23de775e'/%3E%3Cpath d='M0 280 300 180v220H0Z' fill='%23435c8d'/%3E%3C/svg%3E",
              common:
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'%3E%3Crect width='300' height='400' fill='%23f4c86a'/%3E%3C/svg%3E",
            },
          });
        } else if (url.hostname === "api.github.com") {
          const repositoryPath = "/repos/preview-user/anime-records";
          const contentsPrefix = `${repositoryPath}/contents/`;
          const gitPrefix = `${repositoryPath}/git/`;
          const authorization =
            details.headers?.Authorization ??
            details.headers?.authorization ??
            "";
          const rejectWrite = () => {
            if (authorization !== "Bearer write-fail-token") {
              return false;
            }
            status = 401;
            responseText = JSON.stringify({
              message: "Preview write failure",
            });
            return true;
          };
          const requestBody = () =>
            details.data ? JSON.parse(details.data) : {};
          if (url.pathname === repositoryPath) {
            responseText = JSON.stringify({
              full_name: "preview-user/anime-records",
              default_branch: "main",
              private: false,
              permissions: { push: true },
            });
          } else if (url.pathname.startsWith(contentsPrefix)) {
            const path = decodeURIComponent(
              url.pathname.slice(contentsPrefix.length),
            );
            if (details.method !== "GET") {
              status = 405;
              responseText = JSON.stringify({
                message: "Contents API is read-only in preview",
              });
            } else if (path === backupDirectory) {
              const snapshot = githubSnapshot(url.searchParams.get("ref"));
              if (!snapshot) {
                status = 404;
                responseText = JSON.stringify({ message: "Not Found" });
                details.onload({
                  status,
                  responseText,
                  responseHeaders: "",
                  finalUrl: details.url,
                });
                return;
              }
              responseText = JSON.stringify(
                [...snapshot.entries()]
                  .filter(([filePath]) =>
                    filePath.startsWith(`${backupDirectory}/`),
                  )
                  .map(([filePath, file]) => ({
                    type: "file",
                    name: filePath.split("/").at(-1),
                    path: filePath,
                    sha: file.sha,
                  })),
              );
            } else {
              const snapshot = githubSnapshot(url.searchParams.get("ref"));
              const file = snapshot?.get(path);
              if (!file) {
                status = 404;
                responseText = JSON.stringify({ message: "Not Found" });
              } else {
                responseText = JSON.stringify(githubFileResponse(path, file));
              }
            }
          } else if (url.pathname.startsWith(gitPrefix)) {
            const gitEndpoint = url.pathname.slice(gitPrefix.length);
            if (
              details.method === "GET" &&
              gitEndpoint === "ref/heads/main"
            ) {
              responseText = JSON.stringify({
                ref: "refs/heads/main",
                object: { sha: githubHead },
              });
            } else if (
              details.method === "GET" &&
              gitEndpoint.startsWith("commits/")
            ) {
              const commit = githubCommits.get(
                decodeURIComponent(gitEndpoint.slice("commits/".length)),
              );
              if (!commit) {
                status = 404;
                responseText = JSON.stringify({ message: "Not Found" });
              } else {
                responseText = JSON.stringify(commit);
              }
            } else if (
              details.method === "POST" &&
              gitEndpoint === "blobs"
            ) {
              if (!rejectWrite()) {
                const body = requestBody();
                const text = decodeBase64(body.content);
                const sha = nextGithubSha("blob");
                githubBlobs.set(sha, text);
                window.__previewRequests.at(-1).responseSha = sha;
                responseText = JSON.stringify({ sha });
              }
            } else if (
              details.method === "POST" &&
              gitEndpoint === "trees"
            ) {
              if (!rejectWrite()) {
                const body = requestBody();
                const baseTree = githubTrees.get(body.base_tree);
                if (!baseTree) {
                  status = 404;
                  responseText = JSON.stringify({ message: "Not Found" });
                } else {
                  const files = cloneGithubFiles(baseTree.files);
                  for (const entry of body.tree ?? []) {
                    if (entry.sha === null) {
                      files.delete(entry.path);
                      continue;
                    }
                    const text = githubBlobs.get(entry.sha);
                    if (text === undefined) {
                      status = 422;
                      responseText = JSON.stringify({
                        message: `Unknown blob: ${entry.sha}`,
                      });
                      break;
                    }
                    files.set(entry.path, {
                      sha: entry.sha,
                      text,
                    });
                  }
                  if (status === 200) {
                    const sha = nextGithubSha("tree");
                    const tree = { sha, files };
                    githubTrees.set(sha, tree);
                    responseText = JSON.stringify({
                      sha,
                      tree: [...files.entries()].map(
                        ([path, file]) => ({
                          path,
                          mode: "100644",
                          type: "blob",
                          sha: file.sha,
                        }),
                      ),
                    });
                  }
                }
              }
            } else if (
              details.method === "POST" &&
              gitEndpoint === "commits"
            ) {
              if (!rejectWrite()) {
                const body = requestBody();
                const tree = githubTrees.get(body.tree);
                if (!tree) {
                  status = 404;
                  responseText = JSON.stringify({ message: "Not Found" });
                } else {
                  const sha = nextGithubSha("commit");
                  const commit = {
                    sha,
                    message: body.message,
                    tree: { sha: tree.sha },
                    parents: (body.parents ?? []).map((parent) => ({
                      sha: parent,
                    })),
                  };
                  githubCommits.set(sha, commit);
                  responseText = JSON.stringify(commit);
                }
              }
            } else if (
              details.method === "PATCH" &&
              gitEndpoint === "refs/heads/main"
            ) {
              if (!rejectWrite()) {
                const body = requestBody();
                const commit = githubCommits.get(body.sha);
                const expectedParent = commit?.parents?.[0]?.sha ?? null;
                if (!commit) {
                  status = 404;
                  responseText = JSON.stringify({ message: "Not Found" });
                } else if (!body.force && expectedParent !== githubHead) {
                  status = 409;
                  responseText = JSON.stringify({
                    message: "Preview ref conflict",
                  });
                } else {
                  githubHead = commit.sha;
                  githubFiles.clear();
                  const files = githubTrees.get(commit.tree.sha)?.files;
                  for (const [path, file] of files ?? []) {
                    githubFiles.set(path, { ...file });
                  }
                  responseText = JSON.stringify({
                    ref: "refs/heads/main",
                    object: { sha: githubHead },
                  });
                }
              }
            } else {
              status = 404;
              responseText = JSON.stringify({ message: "Not Found" });
            }
          } else {
            status = 404;
            responseText = JSON.stringify({ message: "Not Found" });
          }
        } else {
          throw new Error(`Unexpected preview request: ${details.url}`);
        }
        details.onload({
          status,
          responseText,
          responseHeaders: "",
          finalUrl: details.url,
        });
      } catch (error) {
        details.onerror?.({ error: error.message });
      }
    }, 80 + Math.max(0, Number(window.__previewBilibiliDelay) || 0));
  };
})();
