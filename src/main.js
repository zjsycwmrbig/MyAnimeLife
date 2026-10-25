import { createSettingsStore } from "./core/settings.js";
import { toErrorMessage } from "./core/network.js";
import { AnimeIndexService, INDEX_STATES } from "./index/index-service.js";
import { AnimeRecognizer } from "./recognizers/recognizer.js";
import { ScoutPanel } from "./ui/panel.js";

if (window.top === window.self && !document.getElementById("bangumi-scout-host")) {
  bootstrap().catch((error) => {
    console.error("[Bangumi Scout] bootstrap failed", error);
  });
}

async function bootstrap() {
  const settingsStore = createSettingsStore();
  const initialSettings = settingsStore.get();
  const indexService = new AnimeIndexService({
    settingsStore,
    searchOptions: {
      threshold: initialSettings.matching.fuzzyThreshold,
    },
  });
  const recognizer = new AnimeRecognizer({ settingsStore, indexService });

  let recognitionPromise = null;
  let lastIndexToken = "";
  let lastPageSignature = `${location.href}\n${document.title}`;
  let pageTimer = null;

  const panel = new ScoutPanel({
    settingsStore,
    indexService,
    recognizer,
    onRecognize: async (options = {}) => {
      if (!panel.panel.hidden) {
        panel.open();
      }
      return runRecognition(options);
    },
    onSettingsSaved: async (settings) => {
      indexService.onSettingsChanged();
      scheduleRecognition(250);
      if (settings.ai.enabled) {
        panel.showToast("设置已保存，可重新识别或使用 AI 辅助");
      }
    },
    onUpdateIndex: async () => {
      const updated = await indexService.forceUpdate();
      panel.showToast(updated ? "番剧索引已更新" : "番剧索引已是最新版本");
      await runRecognition({ source: "index-update" });
    },
    onClearIndex: async () => {
      await indexService.clearCache();
    },
    onScanCards: () =>
      recognizer.scanBilibiliCards().map((card) => ({
        ...card,
        item:
          card.item ??
          indexService.getSearch().findBySiteId("bilibili", card.mediaId),
      })),
  });
  panel.mount();

  indexService.subscribe((state) => {
    panel.setIndexState(state);
    const token = `${state.status}:${state.sourceVersion ?? ""}:${state.itemCount}`;
    if (state.status === INDEX_STATES.READY && token !== lastIndexToken) {
      lastIndexToken = token;
      scheduleRecognition(200);
    }
  });

  async function runRecognition(options = {}) {
    if (recognitionPromise) {
      return recognitionPromise;
    }

    panel.setBusy(true, options.ai === "force" ? "AI 正在推断" : "正在识别");
    recognitionPromise = recognizer
      .recognize({
        ai: options.ai,
        includeBilibiliApi: options.includeBilibiliApi,
      })
      .then((result) => {
        panel.setResult(result);
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

  function scheduleRecognition(delay = 500) {
    clearTimeout(pageTimer);
    pageTimer = setTimeout(() => {
      const signature = `${location.href}\n${document.title}`;
      lastPageSignature = signature;
      runRecognition().catch(() => {});
    }, delay);
  }

  await indexService.initialize();
  await runRecognition().catch(() => {});

  const observer = new MutationObserver(() => {
    const signature = `${location.href}\n${document.title}`;
    if (signature !== lastPageSignature) {
      scheduleRecognition(700);
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener("popstate", () => scheduleRecognition(200));

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("打开 Bangumi Scout", () => panel.open());
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
