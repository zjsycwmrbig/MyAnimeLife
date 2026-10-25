import {
  readIndexSnapshot,
  writeIndexSnapshot,
  clearIndexSnapshot,
} from "../core/indexed-db.js";
import { requestJson, requestText, toErrorMessage } from "../core/network.js";
import {
  INDEX_SOURCES,
  UPDATE_FREQUENCIES,
} from "../core/settings.js";
import {
  buildSlimIndex,
  indexItemsHaveSearchFields,
  INDEX_SCHEMA_VERSION,
  normalizeIndexPayload,
} from "./build-index.js";
import { LocalAnimeSearch } from "../search/fuzzy-search.js";

const PACKAGE_META_URL =
  "https://data.jsdelivr.com/v1/package/npm/bangumi-data";
const NPM_LATEST_URL = "https://registry.npmjs.org/bangumi-data/latest";

const CHECK_INTERVAL_MS = {
  [UPDATE_FREQUENCIES.STARTUP]: 15 * 60 * 1000,
  [UPDATE_FREQUENCIES.DAILY]: 24 * 60 * 60 * 1000,
  [UPDATE_FREQUENCIES.WEEKLY]: 7 * 24 * 60 * 60 * 1000,
};

export const INDEX_STATES = Object.freeze({
  DISABLED: "disabled",
  LOADING: "loading",
  EMPTY: "empty",
  READY: "ready",
  CHECKING: "checking",
  UPDATING: "updating",
  ERROR: "error",
});

function sourceIdForSettings(settings) {
  if (settings.index.source === INDEX_SOURCES.CUSTOM) {
    return `custom:${settings.index.customIndexUrl}`;
  }
  return INDEX_SOURCES.BANGUMI_DATA;
}

function sourceMatchesSettings(snapshot, settings) {
  return (
    snapshot?.schemaVersion === INDEX_SCHEMA_VERSION &&
    snapshot?.source?.id === sourceIdForSettings(settings) &&
    indexItemsHaveSearchFields(snapshot.items) &&
    (settings.index.source !== INDEX_SOURCES.BANGUMI_DATA ||
      snapshot.items.every(
        (item) =>
          typeof item.displayTitle === "string" && item.displayTitle.trim(),
      ))
  );
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isCheckDue(snapshot, frequency) {
  if (frequency === UPDATE_FREQUENCIES.MANUAL) {
    return false;
  }
  const interval = CHECK_INTERVAL_MS[frequency];
  const lastChecked = Date.parse(snapshot?.source?.lastCheckedAt ?? "");
  return !Number.isFinite(lastChecked) || Date.now() - lastChecked >= interval;
}

export class AnimeIndexService {
  constructor({ settingsStore, searchOptions = {} }) {
    this.settingsStore = settingsStore;
    this.searchOptions = searchOptions;
    this.snapshot = null;
    this.search = new LocalAnimeSearch([], this.searchOptions);
    this.state = {
      status: INDEX_STATES.EMPTY,
      message: "索引尚未加载",
      itemCount: 0,
      sourceVersion: null,
      lastCheckedAt: null,
    };
    this.listeners = new Set();
    this.updatePromise = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState() {
    return { ...this.state };
  }

  getSearch() {
    return this.search;
  }

  emit(patch) {
    this.state = {
      ...this.state,
      ...patch,
      itemCount: this.snapshot?.itemCount ?? 0,
      sourceVersion: this.snapshot?.source?.version ?? null,
      lastCheckedAt: this.snapshot?.source?.lastCheckedAt ?? null,
    };
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  rebuildSearch() {
    const threshold =
      this.settingsStore.get().matching.fuzzyThreshold ??
      this.searchOptions.threshold;
    this.search = new LocalAnimeSearch(this.snapshot?.items ?? [], {
      ...this.searchOptions,
      threshold,
    });
  }

  async initialize() {
    const settings = this.settingsStore.get();
    if (!settings.index.enabled) {
      this.snapshot = null;
      this.rebuildSearch();
      this.emit({
        status: INDEX_STATES.DISABLED,
        message: "番剧索引已关闭",
      });
      return;
    }

    this.emit({ status: INDEX_STATES.LOADING, message: "正在读取本地索引" });
    const cached = await readIndexSnapshot();
    if (sourceMatchesSettings(cached, settings)) {
      this.snapshot = cached;
      this.rebuildSearch();
      this.emit({
        status: INDEX_STATES.READY,
        message: `已加载 ${cached.itemCount.toLocaleString("zh-CN")} 条番剧`,
      });
    } else {
      this.snapshot = null;
      this.rebuildSearch();
      this.emit({
        status: INDEX_STATES.EMPTY,
        message: "本地暂无可用索引",
      });
    }

    if (isCheckDue(this.snapshot, settings.index.updateFrequency)) {
      this.checkForUpdates({ automatic: true }).catch(() => {
        // The persisted cache remains usable after a failed background check.
      });
    }
  }

  async checkForUpdates(options = {}) {
    if (this.updatePromise) {
      return this.updatePromise;
    }

    const settings = this.settingsStore.get();
    if (!settings.index.enabled) {
      return false;
    }
    if (
      !options.force &&
      !isCheckDue(this.snapshot, settings.index.updateFrequency)
    ) {
      return false;
    }

    this.updatePromise = this.runUpdate(settings, options);
    try {
      return await this.updatePromise;
    } finally {
      this.updatePromise = null;
    }
  }

  async runUpdate(settings, options) {
    this.emit({ status: INDEX_STATES.CHECKING, message: "正在检查索引更新" });
    try {
      const updated =
        settings.index.source === INDEX_SOURCES.CUSTOM
          ? await this.updateFromCustomSource(settings)
          : await this.updateFromBangumiData(settings);

      this.rebuildSearch();
      const message = updated
        ? `索引已更新至 ${this.snapshot?.source?.version ?? "新版本"}`
        : options.force
          ? "索引已是最新版本"
          : "索引检查完成";
      this.emit({ status: INDEX_STATES.READY, message });
      return updated;
    } catch (error) {
      this.emit({
        status: this.snapshot ? INDEX_STATES.READY : INDEX_STATES.ERROR,
        message: this.snapshot
          ? `更新失败，继续使用本地索引：${toErrorMessage(error)}`
          : `索引下载失败：${toErrorMessage(error)}`,
      });
      throw error;
    }
  }

  async updateFromBangumiData(settings) {
    const version = await this.fetchLatestBangumiDataVersion();
    const now = new Date().toISOString();

    if (this.snapshot?.source?.version === version) {
      this.snapshot = {
        ...this.snapshot,
        source: { ...this.snapshot.source, lastCheckedAt: now },
      };
      await writeIndexSnapshot(this.snapshot);
      return false;
    }

    this.emit({
      status: INDEX_STATES.UPDATING,
      message: `正在下载 bangumi-data ${version}`,
    });
    const sourceUrl = `https://cdn.jsdelivr.net/npm/bangumi-data@${encodeURIComponent(version)}/dist/data.json`;
    let raw;
    try {
      raw = await requestJson(sourceUrl, { timeout: 60000 });
    } catch {
      raw = await requestJson(
        `https://unpkg.com/bangumi-data@${encodeURIComponent(version)}/dist/data.json`,
        { timeout: 60000 },
      );
    }

    this.snapshot = buildSlimIndex(raw, {
      sourceId: INDEX_SOURCES.BANGUMI_DATA,
      sourceName: "bangumi-data",
      sourceVersion: version,
      sourceUrl,
      fetchedAt: now,
      lastCheckedAt: now,
      license: "CC BY 4.0",
    });
    await writeIndexSnapshot(this.snapshot);
    return true;
  }

  async fetchLatestBangumiDataVersion() {
    try {
      const metadata = await requestJson(PACKAGE_META_URL, { timeout: 15000 });
      const version = metadata?.tags?.latest;
      if (version) {
        return String(version);
      }
    } catch {
      // Fall back to the npm registry metadata below.
    }

    const latest = await requestJson(NPM_LATEST_URL, { timeout: 15000 });
    if (!latest?.version) {
      throw new Error("无法取得 bangumi-data 最新版本号");
    }
    return String(latest.version);
  }

  async updateFromCustomSource(settings) {
    const sourceUrl = settings.index.customIndexUrl;
    if (!/^https?:\/\//iu.test(sourceUrl)) {
      throw new Error("请先填写有效的自定义索引 URL");
    }

    this.emit({
      status: INDEX_STATES.UPDATING,
      message: "正在检查自定义索引",
    });
    const text = await requestText(sourceUrl, {
      timeout: 60000,
      headers: { "Cache-Control": "no-cache" },
    });
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error("自定义索引不是有效 JSON");
    }

    const contentHash = fnv1a(text);
    if (
      this.snapshot?.source?.contentHash === contentHash &&
      this.snapshot?.source?.id === `custom:${sourceUrl}`
    ) {
      this.snapshot = {
        ...this.snapshot,
        source: {
          ...this.snapshot.source,
          lastCheckedAt: new Date().toISOString(),
        },
      };
      await writeIndexSnapshot(this.snapshot);
      return false;
    }

    const now = new Date().toISOString();
    this.snapshot = normalizeIndexPayload(raw, {
      id: `custom:${sourceUrl}`,
      sourceId: `custom:${sourceUrl}`,
      sourceName: raw?.source?.name ?? "custom-index",
      sourceVersion:
        raw?.source?.version ?? new Date().toISOString().slice(0, 10),
      sourceUrl,
      fetchedAt: now,
      lastCheckedAt: now,
      license: raw?.source?.license ?? "unknown",
      contentHash,
    });
    if (!indexItemsHaveSearchFields(this.snapshot.items)) {
      throw new Error("自定义索引数据格式不正确");
    }
    await writeIndexSnapshot(this.snapshot);
    return true;
  }

  async forceUpdate() {
    return this.checkForUpdates({ force: true });
  }

  async clearCache() {
    await clearIndexSnapshot();
    this.snapshot = null;
    this.rebuildSearch();
    this.emit({ status: INDEX_STATES.EMPTY, message: "本地索引已清除" });
  }

  onSettingsChanged() {
    const settings = this.settingsStore.get();
    this.search.setThreshold(settings.matching.fuzzyThreshold);
    if (!settings.index.enabled) {
      this.snapshot = null;
      this.rebuildSearch();
      this.emit({
        status: INDEX_STATES.DISABLED,
        message: "番剧索引已关闭",
      });
      return;
    }
    if (!sourceMatchesSettings(this.snapshot, settings)) {
      this.initialize();
      return;
    }
    if (isCheckDue(this.snapshot, settings.index.updateFrequency)) {
      this.checkForUpdates({ automatic: true }).catch(() => {});
    }
  }
}
