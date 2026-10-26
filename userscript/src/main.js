import { createSettingsStore } from "./core/settings.js";
import { createPersonalRecordStore } from "./core/personal-records.js";
import { createRecognitionCacheStore } from "./core/recognition-cache.js";
import { createCoverResolver } from "./core/cover-cache.js";
import { createGithubRecordsService } from "./core/github-records.js";
import { toErrorMessage } from "./core/network.js";
import { AnimeIndexService } from "./index/index-service.js";
import { AnimeRecognizer } from "./recognizers/recognizer.js";
import { ScoutPanel } from "./ui/panel.js";

if (window.top === window.self && !document.getElementById("bangumi-scout-host")) {
  bootstrap().catch((error) => {
    console.error("[Bangumi Scout] bootstrap failed", error);
  });
}

async function bootstrap() {
  const settingsStore = createSettingsStore();
  const personalRecordStore = createPersonalRecordStore();
  const recognitionCache = createRecognitionCacheStore();
  const coverResolver = createCoverResolver();
  const githubRecords = createGithubRecordsService({ settingsStore });
  const initialSettings = settingsStore.get();
  const indexService = new AnimeIndexService({
    settingsStore,
    searchOptions: {
      threshold: initialSettings.matching.fuzzyThreshold,
    },
  });
  const recognizer = new AnimeRecognizer({ settingsStore, indexService });

  let recognitionPromise = null;

  const panel = new ScoutPanel({
    settingsStore,
    indexService,
    recognizer,
    personalRecordStore,
    recognitionCache,
    coverResolver,
    githubRecords,
    onRecognize: async (options = {}) => {
      if (!panel.panel.hidden) {
        panel.open({ recognize: false });
      }
      return runRecognition(options);
    },
    onSettingsSaved: async (settings) => {
      indexService.onSettingsChanged();
      if (settings.ai.enabled) {
        panel.showToast("设置已保存，可重新识别或使用 AI 辅助");
      }
    },
    onUpdateIndex: async () => {
      const updated = await indexService.forceUpdate();
      panel.showToast(
        updated
          ? "番剧索引已更新，点击重新识别后生效"
          : "番剧索引已是最新版本",
      );
    },
    onClearIndex: async () => {
      await indexService.clearCache();
    },
    onScanCards: (options = {}) =>
      recognizer.scanBilibiliCards(2000, options),
  });
  panel.mount();

  indexService.subscribe((state) => {
    panel.setIndexState(state);
  });

  async function runRecognition(options = {}) {
    if (recognitionPromise) {
      if (options.ai !== "force") {
        return recognitionPromise;
      }
      await recognitionPromise.catch(() => {});
    }

    if (options.ignoreRecognitionCache) {
      recognitionCache.clear(location.href);
    }
    panel.setBusy(true, options.ai === "force" ? "AI 正在推断" : "正在识别");
    recognitionPromise = recognizer
      .recognize({
        ai: options.ai,
        includeBilibiliApi: options.includeBilibiliApi,
      })
      .then((result) => {
        panel.setResult(result, {
          ignoreCachedSelection: Boolean(options.ignoreRecognitionCache),
        });
        return result;
      })
      .catch((error) => {
        panel.showToast(`识别失败：${toErrorMessage(error)}`);
        throw error;
      })
      .finally(() => {
        panel.setBusy(false);
        recognitionPromise = null;
      });
    return recognitionPromise;
  }

  await indexService.initialize();

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("打开 Bangumi Scout", () => panel.open());
    GM_registerMenuCommand("识别当前页面", () => {
      panel.open({ recognize: false });
      runRecognition({
        source: "menu",
        ignoreRecognitionCache: true,
      }).catch(() => {});
    });
    GM_registerMenuCommand("Bangumi Scout 设置", () => panel.openSettings());
    GM_registerMenuCommand("检查番剧索引更新", () => {
      panel.openSettings();
      indexService.forceUpdate().catch((error) => {
        panel.showToast(`索引更新失败：${toErrorMessage(error)}`);
      });
    });
  }

  window.BangumiScout = {
    open: () => panel.open(),
    openSettings: () => panel.openSettings(),
    recognize: (options) => runRecognition(options),
    refreshIndex: () => indexService.forceUpdate(),
    getSettings: () => settingsStore.get(),
  };
}
