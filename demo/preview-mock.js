(() => {
  const memory = new Map();
  const githubRecordPath = "data/anime/bili-292073015.json";
  let githubRecordSha = "sha-preview-1";
  let githubRecord = {
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
  window.GM_setValue = (key, value) => memory.set(key, value);
  window.GM_deleteValue = (key) => memory.delete(key);
  window.GM_registerMenuCommand = () => {};
  window.__previewRequests = [];
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
          if (url.pathname === "/pgc/review/short/list") {
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
            if (path !== githubRecordPath) {
              status = 404;
              responseText = JSON.stringify({ message: "Not Found" });
            } else if (details.method === "PUT") {
              const authorization =
                details.headers?.Authorization ??
                details.headers?.authorization ??
                "";
              if (authorization === "Bearer write-fail-token") {
                status = 500;
                responseText = JSON.stringify({
                  message: "Preview write failure",
                });
              } else {
                const body = JSON.parse(details.data);
                const binary = atob(body.content.replace(/\s+/gu, ""));
                const bytes = Uint8Array.from(binary, (character) =>
                  character.charCodeAt(0),
                );
                githubRecord = JSON.parse(new TextDecoder().decode(bytes));
                githubRecordSha = `sha-preview-${Date.now()}`;
                responseText = JSON.stringify({
                  content: {
                    name: `${githubRecord.id}.json`,
                    path,
                    sha: githubRecordSha,
                    html_url: `https://github.com/preview-user/anime-records/blob/main/${path}`,
                  },
                  commit: { sha: "commit-preview" },
                });
              }
            } else {
              const content = JSON.stringify(githubRecord, null, 2);
              const bytes = new TextEncoder().encode(content);
              let binary = "";
              for (const byte of bytes) {
                binary += String.fromCharCode(byte);
              }
              responseText = JSON.stringify({
                type: "file",
                encoding: "base64",
                content: btoa(binary),
                path,
                sha: githubRecordSha,
                html_url: `https://github.com/preview-user/anime-records/blob/main/${path}`,
              });
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
    }, 80);
  };
})();
