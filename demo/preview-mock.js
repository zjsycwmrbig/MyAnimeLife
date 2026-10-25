(() => {
  const memory = new Map();
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
  window.GM_xmlhttpRequest = (details) => {
    setTimeout(() => {
      try {
        const url = new URL(details.url);
        let responseText;
        if (url.hostname === "data.jsdelivr.com") {
          responseText = JSON.stringify({ tags: { latest: "preview-1" } });
        } else if (url.hostname === "cdn.jsdelivr.net") {
          responseText = JSON.stringify(fixtureIndex);
        } else if (url.hostname === "api.bilibili.com") {
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
        } else {
          throw new Error(`Unexpected preview request: ${details.url}`);
        }
        details.onload({
          status: 200,
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
