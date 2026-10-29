// ==UserScript==
// @name         Bangumi Scout - 番剧识别助手
// @name:zh-CN   Bangumi Scout - 番剧识别助手
// @namespace    local.anime-index-userscript
// @version      0.1.3
// @description  使用本地番剧索引、正则候选、模糊搜索与 DeepSeek 辅助识别当前番剧
// @author       local
// @match        *://bilibili.com/*
// @match        *://*.bilibili.com/*
// @match        *://bilibili.tv/*
// @match        *://*.bilibili.tv/*
// @match        *://bangumi.tv/*
// @match        *://*.bangumi.tv/*
// @match        *://bgm.tv/*
// @match        *://*.bgm.tv/*
// @match        *://acfun.cn/*
// @match        *://*.acfun.cn/*
// @match        *://iqiyi.com/*
// @match        *://*.iqiyi.com/*
// @match        *://iq.com/*
// @match        *://*.iq.com/*
// @match        *://v.qq.com/*
// @match        *://*.v.qq.com/*
// @match        *://youku.com/*
// @match        *://*.youku.com/*
// @match        *://mgtv.com/*
// @match        *://*.mgtv.com/*
// @match        *://tv.sohu.com/*
// @match        *://*.tv.sohu.com/*
// @match        *://pptv.com/*
// @match        *://*.pptv.com/*
// @match        *://1905.com/*
// @match        *://*.1905.com/*
// @match        *://le.com/*
// @match        *://*.le.com/*
// @match        *://douban.com/*
// @match        *://*.douban.com/*
// @match        *://imdb.com/*
// @match        *://*.imdb.com/*
// @match        *://themoviedb.org/*
// @match        *://*.themoviedb.org/*
// @match        *://thetvdb.com/*
// @match        *://*.thetvdb.com/*
// @match        *://myanimelist.net/*
// @match        *://*.myanimelist.net/*
// @match        *://anilist.co/*
// @match        *://*.anilist.co/*
// @match        *://anidb.net/*
// @match        *://*.anidb.net/*
// @match        *://annict.com/*
// @match        *://*.annict.com/*
// @match        *://filmarks.com/*
// @match        *://*.filmarks.com/*
// @match        *://kitsu.app/*
// @match        *://*.kitsu.app/*
// @match        *://shikimori.one/*
// @match        *://*.shikimori.one/*
// @match        *://simkl.com/*
// @match        *://*.simkl.com/*
// @match        *://trakt.tv/*
// @match        *://*.trakt.tv/*
// @match        *://crunchyroll.com/*
// @match        *://*.crunchyroll.com/*
// @match        *://netflix.com/*
// @match        *://*.netflix.com/*
// @match        *://primevideo.com/*
// @match        *://*.primevideo.com/*
// @match        *://disneyplus.com/*
// @match        *://*.disneyplus.com/*
// @match        *://hulu.com/*
// @match        *://*.hulu.com/*
// @match        *://hulu.jp/*
// @match        *://*.hulu.jp/*
// @match        *://max.com/*
// @match        *://*.max.com/*
// @match        *://hbomax.com/*
// @match        *://*.hbomax.com/*
// @match        *://tv.apple.com/*
// @match        *://*.tv.apple.com/*
// @match        *://viki.com/*
// @match        *://*.viki.com/*
// @match        *://wetv.vip/*
// @match        *://*.wetv.vip/*
// @match        *://viu.com/*
// @match        *://*.viu.com/*
// @match        *://ani.gamer.com.tw/*
// @match        *://*.ani.gamer.com.tw/*
// @match        *://nicovideo.jp/*
// @match        *://*.nicovideo.jp/*
// @match        *://abema.tv/*
// @match        *://*.abema.tv/*
// @match        *://unext.jp/*
// @match        *://*.unext.jp/*
// @match        *://animestore.docomo.ne.jp/*
// @match        *://*.animestore.docomo.ne.jp/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      data.jsdelivr.com
// @connect      cdn.jsdelivr.net
// @connect      unpkg.com
// @connect      raw.githubusercontent.com
// @connect      gist.githubusercontent.com
// @connect      api.github.com
// @connect      api.bgm.tv
// @connect      api.bilibili.com
// @connect      api.deepseek.com
// @run-at       document-idle
// ==/UserScript==


(() => {
  // src/core/settings.js
  var SETTINGS_KEY = "bangumi-scout.settings.v1";
  var INDEX_SOURCES = Object.freeze({
    BANGUMI_DATA: "bangumi-data",
    CUSTOM: "custom"
  });
  var UPDATE_FREQUENCIES = Object.freeze({
    STARTUP: "startup",
    DAILY: "daily",
    WEEKLY: "weekly",
    MANUAL: "manual"
  });
  var DEFAULT_SETTINGS = Object.freeze({
    index: {
      enabled: true,
      source: INDEX_SOURCES.BANGUMI_DATA,
      customIndexUrl: "",
      updateFrequency: UPDATE_FREQUENCIES.DAILY
    },
    matching: {
      fuzzyThreshold: 0.42,
      useRegexCandidates: true,
      autoAiThreshold: 0.62
    },
    ai: {
      enabled: false,
      autoFallback: false,
      apiKey: "",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      maxContextChars: 6e3
    },
    github: {
      enabled: false,
      repositoryUrl: "",
      token: "",
      branch: "main",
      lastSyncedAt: ""
    },
    ui: {
      launcherVisible: true,
      panelWidth: 420,
      panelHeight: 680
    }
  });
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function mergeSettings(base, incoming) {
    const result = clone(base);
    if (!incoming || typeof incoming !== "object") {
      return result;
    }
    for (const section of Object.keys(result)) {
      if (incoming[section] && typeof incoming[section] === "object" && !Array.isArray(incoming[section])) {
        Object.assign(result[section], incoming[section]);
      }
    }
    return sanitizeSettings(result);
  }
  function sanitizeSettings(input) {
    const settings = mergeRawDefaults(input);
    settings.index.enabled = Boolean(settings.index.enabled);
    settings.index.source = Object.values(INDEX_SOURCES).includes(
      settings.index.source
    ) ? settings.index.source : INDEX_SOURCES.BANGUMI_DATA;
    settings.index.customIndexUrl = String(
      settings.index.customIndexUrl ?? ""
    ).trim();
    settings.index.updateFrequency = Object.values(UPDATE_FREQUENCIES).includes(
      settings.index.updateFrequency
    ) ? settings.index.updateFrequency : UPDATE_FREQUENCIES.DAILY;
    settings.matching.fuzzyThreshold = clampNumber(
      settings.matching.fuzzyThreshold,
      0.15,
      0.8,
      0.42
    );
    settings.matching.useRegexCandidates = Boolean(
      settings.matching.useRegexCandidates
    );
    settings.matching.autoAiThreshold = clampNumber(
      settings.matching.autoAiThreshold,
      0.3,
      0.95,
      0.62
    );
    settings.ai.enabled = Boolean(settings.ai.enabled);
    settings.ai.autoFallback = Boolean(settings.ai.autoFallback);
    settings.ai.apiKey = String(settings.ai.apiKey ?? "").trim();
    settings.ai.baseUrl = String(settings.ai.baseUrl ?? "").trim() || "https://api.deepseek.com";
    settings.ai.model = String(settings.ai.model ?? "").trim() || "deepseek-chat";
    settings.ai.maxContextChars = Math.round(
      clampNumber(settings.ai.maxContextChars, 1e3, 16e3, 6e3)
    );
    settings.github.enabled = Boolean(settings.github.enabled);
    settings.github.repositoryUrl = String(
      settings.github.repositoryUrl ?? ""
    ).trim();
    settings.github.token = String(settings.github.token ?? "").trim();
    settings.github.branch = String(settings.github.branch ?? "").trim() || "main";
    settings.github.lastSyncedAt = String(
      settings.github.lastSyncedAt ?? ""
    ).trim();
    settings.ui.launcherVisible = Boolean(settings.ui.launcherVisible);
    settings.ui.panelWidth = Math.round(
      clampNumber(settings.ui.panelWidth, 340, 1100, 420)
    );
    settings.ui.panelHeight = Math.round(
      clampNumber(settings.ui.panelHeight, 420, 1e3, 680)
    );
    return settings;
  }
  function mergeRawDefaults(input) {
    const result = clone(DEFAULT_SETTINGS);
    if (!input || typeof input !== "object") {
      return result;
    }
    for (const section of Object.keys(result)) {
      if (input[section] && typeof input[section] === "object") {
        Object.assign(result[section], input[section]);
      }
    }
    return result;
  }
  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, number));
  }
  function rawGet(key, fallback) {
    if (typeof GM_getValue === "function") {
      return GM_getValue(key, fallback);
    }
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function rawSet(key, value) {
    if (typeof GM_setValue === "function") {
      GM_setValue(key, value);
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
    }
  }
  function loadSettings() {
    const stored = rawGet(SETTINGS_KEY, "");
    if (!stored) {
      return clone(DEFAULT_SETTINGS);
    }
    try {
      const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
      return mergeSettings(DEFAULT_SETTINGS, parsed);
    } catch {
      return clone(DEFAULT_SETTINGS);
    }
  }
  function createSettingsStore() {
    let value = loadSettings();
    const listeners = /* @__PURE__ */ new Set();
    function notify() {
      for (const listener of listeners) {
        listener(clone(value));
      }
    }
    return {
      get() {
        return clone(value);
      },
      update(patch) {
        value = mergeSettings(value, patch);
        rawSet(SETTINGS_KEY, JSON.stringify(value));
        notify();
        return clone(value);
      },
      reset() {
        value = clone(DEFAULT_SETTINGS);
        rawSet(SETTINGS_KEY, JSON.stringify(value));
        notify();
        return clone(value);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }

  // src/core/site-allowlist.js
  var ENABLED_SITE_DOMAINS = Object.freeze([
    "bilibili.com",
    "bilibili.tv",
    "bangumi.tv",
    "bgm.tv",
    "acfun.cn",
    "iqiyi.com",
    "iq.com",
    "v.qq.com",
    "youku.com",
    "mgtv.com",
    "tv.sohu.com",
    "pptv.com",
    "1905.com",
    "le.com",
    "douban.com",
    "imdb.com",
    "themoviedb.org",
    "thetvdb.com",
    "myanimelist.net",
    "anilist.co",
    "anidb.net",
    "annict.com",
    "filmarks.com",
    "kitsu.app",
    "shikimori.one",
    "simkl.com",
    "trakt.tv",
    "crunchyroll.com",
    "netflix.com",
    "primevideo.com",
    "disneyplus.com",
    "hulu.com",
    "hulu.jp",
    "max.com",
    "hbomax.com",
    "tv.apple.com",
    "viki.com",
    "wetv.vip",
    "viu.com",
    "ani.gamer.com.tw",
    "nicovideo.jp",
    "abema.tv",
    "unext.jp",
    "animestore.docomo.ne.jp"
  ]);
  function normalizedHostname(value) {
    return String(value ?? "").trim().toLocaleLowerCase().replace(/\.$/u, "");
  }
  function isEnabledSite(input) {
    let url;
    try {
      url = input instanceof URL ? input : new URL(String(input ?? ""));
    } catch {
      return false;
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }
    const hostname = normalizedHostname(url.hostname);
    return ENABLED_SITE_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  }

  // src/core/personal-records.js
  var RECORDS_KEY = "bangumi-scout.personal-records.v1";
  function rawGet2(key, fallback) {
    if (typeof GM_getValue === "function") {
      return GM_getValue(key, fallback);
    }
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function rawSet2(key, value) {
    if (typeof GM_setValue === "function") {
      GM_setValue(key, value);
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
    }
  }
  function loadRecords() {
    const stored = rawGet2(RECORDS_KEY, "");
    if (!stored) {
      return {};
    }
    try {
      const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function sanitizeRecord(record) {
    const rating = Number(record?.rating);
    return {
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 10 ? Math.round(rating) : null,
      review: String(record?.review ?? "").slice(0, 2e4),
      updatedAt: String(record?.updatedAt ?? "")
    };
  }
  function createPersonalRecordStore() {
    let records = loadRecords();
    function persist() {
      try {
        rawSet2(RECORDS_KEY, JSON.stringify(records));
        return true;
      } catch {
        return false;
      }
    }
    return {
      get(itemId) {
        return sanitizeRecord(records[String(itemId ?? "")]);
      },
      save(itemId, record, options = {}) {
        const key = String(itemId ?? "");
        if (!key) {
          return null;
        }
        const requestedTimestamp = String(record?.updatedAt ?? "");
        const preservedTimestamp = options.preserveUpdatedAt && Number.isFinite(Date.parse(requestedTimestamp)) ? new Date(requestedTimestamp).toISOString() : null;
        const next = {
          ...sanitizeRecord(record),
          updatedAt: preservedTimestamp ?? (/* @__PURE__ */ new Date()).toISOString()
        };
        records = { ...records, [key]: next };
        persist();
        return next;
      },
      remove(itemId) {
        const key = String(itemId ?? "");
        if (!key || !Object.hasOwn(records, key)) {
          return false;
        }
        const next = { ...records };
        delete next[key];
        records = next;
        persist();
        return true;
      }
    };
  }

  // src/core/recognition-cache.js
  var CACHE_KEY = "bangumi-scout.recognition-drafts.v1";
  var MAX_DRAFTS = 20;
  function rawGet3(key, fallback) {
    if (typeof GM_getValue === "function") {
      return GM_getValue(key, fallback);
    }
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function rawSet3(key, value) {
    if (typeof GM_setValue === "function") {
      GM_setValue(key, value);
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
    }
  }
  function pageKey(pageUrl) {
    try {
      const url = new URL(pageUrl);
      return `${url.origin}${url.pathname}`;
    } catch {
      return String(pageUrl ?? "");
    }
  }
  function loadDrafts() {
    const stored = rawGet3(CACHE_KEY, "");
    if (!stored) {
      return {};
    }
    try {
      const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  function sanitizeRecognitionResult(result) {
    if (!result || typeof result !== "object") {
      return null;
    }
    const context = result.context ?? {};
    return {
      status: String(result.status ?? "unmatched"),
      best: result.best ?? null,
      results: Array.isArray(result.results) ? result.results.slice(0, 10) : [],
      titleCandidates: Array.isArray(result.titleCandidates) ? result.titleCandidates.slice(0, 8) : [],
      aiResult: result.aiResult ?? null,
      bilibiliMetadata: result.bilibiliMetadata ?? null,
      diagnostics: Array.isArray(result.diagnostics) ? result.diagnostics.slice(0, 8) : [],
      context: {
        ...context,
        summary: String(context.summary ?? "").slice(0, 5e3),
        comments: Array.isArray(context.comments) ? context.comments.slice(0, 8) : [],
        titleMentions: Array.isArray(context.titleMentions) ? context.titleMentions.slice(0, 12) : []
      }
    };
  }
  function sanitizeDraft(draft) {
    const item = draft?.item;
    const selectedResult = draft?.selectedResult;
    if (!item?.id && !selectedResult?.item?.id) {
      return null;
    }
    const rating = Number(draft?.rating);
    return {
      item: item?.id ? item : selectedResult.item,
      selectedResult: selectedResult?.item?.id ? selectedResult : null,
      recognitionResult: sanitizeRecognitionResult(draft?.recognitionResult),
      rating: Number.isFinite(rating) && rating >= 1 && rating <= 10 ? Math.round(rating) : null,
      review: String(draft?.review ?? "").slice(0, 2e4),
      updatedAt: String(draft?.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString())
    };
  }
  function createRecognitionCacheStore() {
    let drafts = loadDrafts();
    function persist() {
      const entries = Object.entries(drafts).sort(
        ([, left], [, right]) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      ).slice(0, MAX_DRAFTS);
      drafts = Object.fromEntries(entries);
      rawSet3(CACHE_KEY, JSON.stringify(drafts));
    }
    return {
      get(pageUrl) {
        const entry = drafts[pageKey(pageUrl)];
        return entry ? sanitizeDraft(entry) : null;
      },
      save(pageUrl, draft) {
        const key = pageKey(pageUrl);
        const value = sanitizeDraft({
          ...draft,
          updatedAt: draft?.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString()
        });
        if (!key || !value) {
          return null;
        }
        drafts = { ...drafts, [key]: value };
        persist();
        return value;
      },
      clear(pageUrl) {
        const key = pageKey(pageUrl);
        if (!drafts[key]) {
          return false;
        }
        const next = { ...drafts };
        delete next[key];
        drafts = next;
        persist();
        return true;
      },
      clearItem(itemId) {
        const id = String(itemId ?? "");
        if (!id) {
          return false;
        }
        const next = Object.fromEntries(
          Object.entries(drafts).filter(
            ([, entry]) => String(entry?.item?.id ?? "") !== id
          )
        );
        if (Object.keys(next).length === Object.keys(drafts).length) {
          return false;
        }
        drafts = next;
        persist();
        return true;
      }
    };
  }

  // src/core/cover-url.js
  function normalizeCoverUrl(value) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const resolved = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    return /^(?:https?:\/\/|data:image\/)/iu.test(resolved) ? resolved : null;
  }

  // src/core/network.js
  function gmRequest(details) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...details,
        onload(response) {
          resolve(response);
        },
        onerror(error) {
          const requestError = new Error(
            error?.error ?? "Network request failed"
          );
          requestError.status = 0;
          reject(requestError);
        },
        ontimeout() {
          const timeoutError = new Error("Network request timed out");
          timeoutError.status = 0;
          reject(timeoutError);
        }
      });
    });
  }
  var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([
    408,
    425,
    429,
    500,
    502,
    503,
    504
  ]);
  var IDEMPOTENT_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD"]);
  var DEFAULT_MAX_ATTEMPTS = 3;
  var DEFAULT_RETRY_BASE_DELAY_MS = 600;
  var DEFAULT_RETRY_MAX_DELAY_MS = 6e3;
  function responseSnippet(text, maxLength = 280) {
    const normalized = String(text ?? "").replace(/\s+/gu, " ").trim();
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
  }
  function parseResponseHeaders(value) {
    const headers = /* @__PURE__ */ new Map();
    for (const line of String(value ?? "").split(/\r?\n/u)) {
      const separator = line.indexOf(":");
      if (separator <= 0) {
        continue;
      }
      headers.set(
        line.slice(0, separator).trim().toLocaleLowerCase(),
        line.slice(separator + 1).trim()
      );
    }
    return headers;
  }
  function retryAfterMs(responseHeaders, maxDelayMs) {
    const raw = responseHeaders instanceof Headers ? responseHeaders.get("retry-after") : parseResponseHeaders(responseHeaders).get("retry-after");
    if (!raw) {
      return null;
    }
    const seconds = Number(raw);
    const delay = Number.isFinite(seconds) ? seconds * 1e3 : Date.parse(raw) - Date.now();
    return Number.isFinite(delay) && delay > 0 ? Math.min(delay, maxDelayMs) : null;
  }
  function httpError(response, url, body) {
    const host = new URL(url).host;
    const detail = responseSnippet(body);
    const error = new Error(
      `HTTP ${response.status} while requesting ${host}${detail ? `: ${detail}` : ""}`
    );
    error.name = "HttpError";
    error.status = response.status;
    error.body = String(body ?? "");
    error.url = url;
    error.responseHeaders = response.responseHeaders ?? "";
    error.retryAfterMs = retryAfterMs(
      response.headers ?? response.responseHeaders,
      DEFAULT_RETRY_MAX_DELAY_MS
    );
    return error;
  }
  function isRetryableError(error) {
    if (!error) {
      return false;
    }
    if (error.status === 0 || RETRYABLE_STATUS_CODES.has(Number(error.status))) {
      return true;
    }
    return Number(error.status) === 403 && (Number(error.retryAfterMs) > 0 || /rate limit|secondary rate|abuse detection/iu.test(
      String(error.body ?? error.message ?? "")
    ));
  }
  function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
  }
  function nonNegativeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }
  async function requestTextOnce(url, details, options = {}) {
    const fetchImpl = options.fetchImpl ?? fetch;
    if (typeof GM_xmlhttpRequest === "function" && !options.fetchImpl) {
      const response = await gmRequest(details);
      if (response.status < 200 || response.status >= 300) {
        throw httpError(response, url, response.responseText);
      }
      return response.responseText;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), details.timeout);
    try {
      const response = await fetchImpl(url, {
        method: details.method,
        headers: details.headers,
        body: options.body,
        signal: controller.signal
      });
      if (!response.ok) {
        const body = await response.text();
        throw httpError(response, url, body);
      }
      return response.text();
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") {
        const timeoutError = new Error("Network request timed out");
        timeoutError.status = 0;
        throw timeoutError;
      }
      if (Number.isFinite(Number(error?.status))) {
        throw error;
      }
      const networkError = new Error(error?.message || "Network request failed");
      networkError.status = 0;
      throw networkError;
    } finally {
      clearTimeout(timer);
    }
  }
  async function requestText(url, options = {}) {
    const method = String(options.method ?? "GET").toUpperCase();
    const details = {
      method,
      url,
      headers: options.headers ?? {},
      timeout: options.timeout ?? 2e4
    };
    if (options.body !== void 0) {
      details.data = options.body;
    }
    const canRetry = IDEMPOTENT_METHODS.has(method) || options.retryUnsafe;
    const maxAttempts = canRetry ? positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS) : 1;
    const retryBaseDelayMs = nonNegativeNumber(
      options.retryBaseDelayMs,
      DEFAULT_RETRY_BASE_DELAY_MS
    );
    const retryMaxDelayMs = nonNegativeNumber(
      options.retryMaxDelayMs,
      DEFAULT_RETRY_MAX_DELAY_MS
    );
    const sleep = options.sleepImpl ?? ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await requestTextOnce(url, details, options);
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !isRetryableError(error)) {
          break;
        }
        const exponentialDelay = Math.min(
          retryMaxDelayMs,
          retryBaseDelayMs * 2 ** (attempt - 1)
        );
        const delayMs = Number(error.retryAfterMs) > 0 ? Math.min(Number(error.retryAfterMs), retryMaxDelayMs) : exponentialDelay;
        try {
          options.onRetry?.({
            attempt,
            nextAttempt: attempt + 1,
            maxAttempts,
            delayMs,
            status: Number(error.status) || 0,
            method,
            url
          });
        } catch {
        }
        await sleep(delayMs);
      }
    }
    throw lastError;
  }
  async function requestJson(url, options = {}) {
    const text = await requestText(url, options);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Response was not valid JSON");
    }
  }
  function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return String(error ?? "未知错误");
  }

  // src/recognizers/bangumi.js
  function extractBangumiCoverUrl(subject) {
    return [
      subject?.images?.large,
      subject?.images?.common,
      subject?.images?.medium,
      subject?.images?.small,
      subject?.images?.grid,
      subject?.image
    ].map(normalizeCoverUrl).find(Boolean) ?? null;
  }
  async function fetchBangumiCover(subjectId) {
    const id = String(subjectId ?? "").trim();
    if (!id) {
      return null;
    }
    const subject = await requestJson(
      `https://api.bgm.tv/v0/subjects/${encodeURIComponent(id)}`,
      {
        timeout: 12e3,
        headers: {
          Accept: "application/json",
          "User-Agent": "anime-index-userscript/0.1"
        }
      }
    );
    return extractBangumiCoverUrl(subject);
  }

  // src/core/cover-cache.js
  var COVER_CACHE_KEY = "bangumi-scout.cover-cache.v1";
  var CACHE_LIMIT = 600;
  var MAX_CACHE_AGE = 90 * 24 * 60 * 60 * 1e3;
  function rawGet4(key, fallback) {
    if (typeof GM_getValue === "function") {
      return GM_getValue(key, fallback);
    }
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }
  function rawSet4(key, value) {
    if (typeof GM_setValue === "function") {
      GM_setValue(key, value);
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
    }
  }
  function loadCache() {
    const stored = rawGet4(COVER_CACHE_KEY, "");
    if (!stored) {
      return {};
    }
    try {
      const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  function recentCachedUrl(entry) {
    const url = normalizeCoverUrl(entry?.url);
    const updatedAt = Number(entry?.updatedAt);
    return url && Number.isFinite(updatedAt) && Date.now() - updatedAt < MAX_CACHE_AGE ? url : null;
  }
  function trimCache(cache) {
    return Object.fromEntries(
      Object.entries(cache).sort(
        (left, right) => Number(right[1]?.updatedAt ?? 0) - Number(left[1]?.updatedAt ?? 0)
      ).slice(0, CACHE_LIMIT)
    );
  }
  function createCoverResolver() {
    let cache = loadCache();
    const pending = /* @__PURE__ */ new Map();
    async function persistCover(subjectId) {
      try {
        const url = await fetchBangumiCover(subjectId);
        if (!url) {
          return null;
        }
        cache = trimCache({
          ...cache,
          [subjectId]: { url, updatedAt: Date.now() }
        });
        rawSet4(COVER_CACHE_KEY, JSON.stringify(cache));
        return url;
      } catch {
        return null;
      }
    }
    return function resolveCover(item) {
      const directUrl = normalizeCoverUrl(item?.coverUrl) ?? normalizeCoverUrl(item?.images?.large) ?? normalizeCoverUrl(item?.images?.common);
      if (directUrl) {
        return Promise.resolve(directUrl);
      }
      const subjectId = String(item?.sites?.bangumi ?? "").trim();
      if (!subjectId) {
        return Promise.resolve(null);
      }
      const cachedUrl = recentCachedUrl(cache[subjectId]);
      if (cachedUrl) {
        return Promise.resolve(cachedUrl);
      }
      if (!pending.has(subjectId)) {
        pending.set(
          subjectId,
          persistCover(subjectId).finally(() => pending.delete(subjectId))
        );
      }
      return pending.get(subjectId);
    };
  }

  // src/core/season.js
  var CHINESE_DIGITS = {
    零: 0,
    "〇": 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9
  };
  var ROMAN_NUMERALS = {
    i: 1,
    ii: 2,
    iii: 3,
    iv: 4,
    v: 5,
    vi: 6,
    vii: 7,
    viii: 8,
    ix: 9,
    x: 10
  };
  var SEASON_PATTERNS = [
    {
      pattern: /第\s*([0-9一二两三四五六七八九十百零〇]+)\s*[季期部篇]/iu,
      number: (value) => parsePositiveInteger(value)
    },
    {
      pattern: /\bseason\s*0*([0-9]{1,2})\b/iu,
      number: (value) => parsePositiveInteger(value)
    },
    {
      pattern: /\b0*([0-9]{1,2})(?:st|nd|rd|th)\s+season\b/iu,
      number: (value) => parsePositiveInteger(value)
    },
    {
      pattern: /\bpart\s*0*([0-9]{1,2})\b/iu,
      number: (value) => parsePositiveInteger(value)
    },
    {
      pattern: /\bs0*([1-9][0-9]?)\b/iu,
      number: (value) => parsePositiveInteger(value)
    },
    {
      pattern: /(?:^|[\s:：·\-])([ivx]{1,8})(?=\s*(?:season|part)\b|$)/iu,
      number: (value) => ROMAN_NUMERALS[value.toLocaleLowerCase()] ?? null
    }
  ];
  function parsePositiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 99 ? number : null;
  }
  function parseChineseNumber(value) {
    const text = String(value ?? "").trim();
    if (!text) {
      return null;
    }
    if (/^\d+$/u.test(text)) {
      return parsePositiveInteger(text);
    }
    let total = 0;
    let current = 0;
    for (const character of text) {
      if (Object.hasOwn(CHINESE_DIGITS, character)) {
        current = CHINESE_DIGITS[character];
        continue;
      }
      if (character === "十") {
        total += (current || 1) * 10;
        current = 0;
        continue;
      }
      if (character === "百") {
        total += (current || 1) * 100;
        current = 0;
        continue;
      }
      return null;
    }
    const number = total + current;
    return Number.isInteger(number) && number >= 1 && number <= 99 ? number : null;
  }
  function parseSeasonLabel(value) {
    const text = String(value ?? "").normalize("NFKC").trim();
    if (!text) {
      return { number: null, label: null };
    }
    for (const candidate of SEASON_PATTERNS) {
      const match = text.match(candidate.pattern);
      if (!match) {
        continue;
      }
      const raw = match[1];
      const number = /^[0-9]+$/u.test(raw) ? parsePositiveInteger(raw) : candidate.number(raw) ?? parseChineseNumber(raw);
      if (number) {
        return {
          number,
          label: `第${number}季`
        };
      }
    }
    return { number: null, label: null };
  }
  function coerceYear(value) {
    const match = String(value ?? "").match(/^(\d{4})/u);
    return match ? Number(match[1]) : null;
  }
  function coerceSeasonNumber(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 99 ? number : null;
  }
  function createSeasonDescriptor({
    key,
    title,
    names = [],
    begin = null,
    year = null,
    season = null
  } = {}) {
    const explicitNumber = coerceSeasonNumber(season?.number);
    const parsed = [title, ...names].map(parseSeasonLabel).find((candidate) => candidate.number);
    const number = explicitNumber ?? parsed?.number ?? null;
    const label = String(season?.label ?? "").trim() || parsed?.label || (number ? `第${number}季` : null);
    const cleanKey = String(key ?? season?.key ?? "").trim() || null;
    return {
      key: cleanKey,
      number,
      label,
      year: coerceYear(year) ?? coerceYear(begin)
    };
  }
  function seasonLabelFromItem(item) {
    if (item?.season?.label) {
      return String(item.season.label);
    }
    if (item?.season?.number) {
      return `第${item.season.number}季`;
    }
    return parseSeasonLabel(
      [item?.displayTitle, item?.title, ...item?.names ?? []].filter(Boolean).join(" ")
    ).label;
  }

  // src/core/title-normalize.js
  var HTML_ENTITIES = {
    "&amp;": "&",
    "&apos;": "'",
    "&#39;": "'",
    "&quot;": '"',
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " "
  };
  var SITE_SUFFIXES = [
    /\s*[_|｜-]\s*番剧\s*[_|｜-]\s*bilibili\s*[_|｜-]\s*哔哩哔哩.*$/iu,
    /\s*[_|｜-]\s*哔哩哔哩\s*[_|｜-]\s*bilibili.*$/iu,
    /\s*[-_|｜]\s*(?:哔哩哔哩|bilibili|Bangumi|番组计划).*$/iu,
    /\s*[-_|｜]\s*(?:在线观看|免费观看|动漫|动画|番剧).*$/iu
  ];
  var NOISE_PATTERNS = [
    /[【[(（]\s*(?:独家|免费|高清|正版|完整版|在线观看|中文字幕|无修版)[^】\])）]*[】\])）]/giu,
    /(?:免费)?(?:高清)?(?:完整版)?在线观看/giu,
    /高清完整版/giu,
    /更新至\s*(?:第\s*)?\d+\s*(?:集|话|話|期)/giu,
    /全\s*\d+\s*(?:集|话|話)/giu
  ];
  var EPISODE_PATTERNS = [
    /\s*(?:第\s*)?\d+\s*(?:集|话|話|期)\s*$/iu,
    /\s*[-_ ]?S\d{1,2}E\d{1,3}\s*$/iu,
    /\s*[-_ ]?EP?\s*\d{1,4}\s*$/iu
  ];
  var SEPARATORS = /\s+[-–—|｜]\s+|\s*[|｜]\s*/u;
  function replaceHtmlEntities(value) {
    return value.replace(
      /&(?:amp|apos|quot|lt|gt|nbsp|#39);/giu,
      (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity
    );
  }
  function cleanDisplayTitle(rawTitle) {
    if (typeof rawTitle !== "string") {
      return "";
    }
    let title = replaceHtmlEntities(rawTitle).normalize("NFKC").replace(/\u00a0/g, " ").replace(/[\u200b-\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
    for (const pattern of SITE_SUFFIXES) {
      title = title.replace(pattern, "");
    }
    for (const pattern of NOISE_PATTERNS) {
      title = title.replace(pattern, " ");
    }
    for (const pattern of EPISODE_PATTERNS) {
      title = title.replace(pattern, "");
    }
    return title.replace(/\s+/g, " ").replace(/^[\s\-–—_:：|｜]+|[\s\-–—_:：|｜]+$/g, "").trim();
  }
  function normalizeTitle(rawTitle) {
    return cleanDisplayTitle(rawTitle).toLocaleLowerCase().replace(/[\p{P}\s]+/gu, "").trim();
  }
  function extractTitleVariants(rawTitle, options = {}) {
    const maxVariants = options.maxVariants ?? 8;
    const base = cleanDisplayTitle(rawTitle);
    if (!base) {
      return [];
    }
    const variants = [];
    const add = (value) => {
      const cleaned = cleanDisplayTitle(value);
      const key = normalizeTitle(cleaned);
      if (cleaned && key && key.length >= 2 && !variants.some((item) => normalizeTitle(item) === key)) {
        variants.push(cleaned);
      }
    };
    add(base);
    const bracketMatches = base.matchAll(/[【[(（]([^】\])）]{2,80})[】\])）]/gu);
    for (const match of bracketMatches) {
      add(match[1]);
    }
    const leadingBracketSuffix = base.match(
      /^(?:[【[(（][^】\])）]{1,80}[】\])）]\s*)+(.+)$/u
    );
    if (leadingBracketSuffix?.[1]) {
      add(leadingBracketSuffix[1]);
    }
    for (const part of base.split(SEPARATORS)) {
      add(part);
    }
    const colonIndex = base.search(/[：:]/u);
    if (colonIndex > 1) {
      add(base.slice(0, colonIndex));
    }
    return variants.slice(0, maxVariants);
  }
  function extractBilibiliIds(input) {
    const value = typeof input === "string" ? input : String(input?.url ?? "");
    let url;
    try {
      url = new URL(value, "https://www.bilibili.com");
    } catch {
      return {};
    }
    const mediaId = url.pathname.match(/\/bangumi\/media\/md(\d+)/iu)?.[1] ?? url.searchParams.get("media_id") ?? void 0;
    const episodeId = url.pathname.match(/\/bangumi\/play\/ep(\d+)/iu)?.[1] ?? url.searchParams.get("ep_id") ?? void 0;
    const seasonId = url.pathname.match(/\/bangumi\/play\/ss(\d+)/iu)?.[1] ?? url.searchParams.get("season_id") ?? void 0;
    return {
      ...mediaId ? { mediaId: String(mediaId) } : {},
      ...episodeId ? { episodeId: String(episodeId) } : {},
      ...seasonId ? { seasonId: String(seasonId) } : {}
    };
  }
  function uniqueByTitle(items) {
    const seen = /* @__PURE__ */ new Set();
    return items.filter((item) => {
      const key = normalizeTitle(item.title ?? "");
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // src/core/record-jsonl.js
  var ANIME_JSONL_PATH = "data/anime.jsonl";
  var ANIME_INDEX_JSONL_PATH = "data/anime-index.jsonl";
  var BACKUP_DIRECTORY = "data/backups";
  var MAX_BACKUP_SNAPSHOTS = 5;
  function cleanString(value) {
    return String(value ?? "").trim();
  }
  function timestamp(value) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function uniqueStrings(values) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const value of values) {
      const cleaned = cleanString(value);
      const key = cleaned.toLocaleLowerCase();
      if (!cleaned || seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(cleaned);
    }
    return result;
  }
  function parseJsonl(text, label = "JSONL") {
    const records = [];
    const lines = String(text ?? "").split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) {
        continue;
      }
      let record;
      try {
        record = JSON.parse(line);
      } catch (error) {
        throw new Error(`${label} 第 ${index + 1} 行不是有效 JSON: ${error.message}`);
      }
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error(`${label} 第 ${index + 1} 行必须是 JSON 对象`);
      }
      records.push(record);
    }
    return records;
  }
  function serializeJsonl(records) {
    const lines = (records ?? []).map((record) => JSON.stringify(record));
    return lines.length ? `${lines.join("\n")}
` : "";
  }
  function sortRecordsById(records) {
    return [...records ?? []].sort(
      (left, right) => cleanString(left?.id).localeCompare(cleanString(right?.id), "zh-CN")
    );
  }
  function chooseLatestRecord(existing, incoming) {
    if (!existing) {
      return incoming;
    }
    if (!incoming) {
      return existing;
    }
    return timestamp(incoming.updatedAt) >= timestamp(existing.updatedAt) ? incoming : existing;
  }
  function upsertRecord(records, incoming) {
    const next = [];
    let replaced = false;
    for (const record of records ?? []) {
      if (cleanString(record?.id) !== cleanString(incoming?.id)) {
        next.push(record);
        continue;
      }
      next.push(chooseLatestRecord(record, incoming));
      replaced = true;
    }
    if (!replaced) {
      next.push(incoming);
    }
    return sortRecordsById(next);
  }
  function reviewExcerpt(review) {
    return cleanString(review).replace(/[`*_>#~\[\]()]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, 180);
  }
  function indexRecordFromRecord(record) {
    return {
      schemaVersion: 1,
      id: cleanString(record.id),
      title: cleanString(record.title),
      aliases: uniqueStrings([
        record.match?.matchedTitle,
        ...Array.isArray(record.names) ? record.names : []
      ]),
      rating: record.rating === null || record.rating === void 0 ? null : Number(record.rating),
      reviewExcerpt: reviewExcerpt(record.review),
      coverUrl: record.coverUrl ?? null,
      externalIds: record.externalIds ?? {},
      season: record.season ?? null,
      match: {
        status: record.match?.status ?? "unmatched",
        method: record.match?.method ?? "manual",
        confidence: Number(record.match?.confidence) || 0,
        matchedTitle: record.match?.matchedTitle ?? null
      },
      createdAt: record.createdAt ?? null,
      updatedAt: record.updatedAt ?? null,
      deletedAt: record.deletedAt ?? null
    };
  }
  function buildAnimeIndex(records) {
    return sortRecordsById(records ?? []).map(indexRecordFromRecord).sort((left, right) => left.id.localeCompare(right.id, "zh-CN"));
  }
  function createBackupSnapshot({
    animeText = "",
    indexText = "",
    createdAt = (/* @__PURE__ */ new Date()).toISOString()
  } = {}) {
    return {
      schemaVersion: 1,
      kind: "anime-library-backup",
      createdAt,
      animeText,
      indexText
    };
  }

  // src/core/github-records.js
  var TEMPLATE_REPOSITORY = "zjsycwmrbig/MyAnimeLife";
  var TEMPLATE_GENERATE_URL = `https://github.com/${TEMPLATE_REPOSITORY}/generate`;
  var TEMPLATE_REPOSITORY_API_URL = `https://api.github.com/repos/${TEMPLATE_REPOSITORY}`;
  var FINE_GRAINED_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";
  var GITHUB_PAGES_DOCS_URL = "https://docs.github.com/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site";
  var API_ROOT = "https://api.github.com";
  var MAX_REVIEW_LENGTH = 2e4;
  var LIBRARY_CACHE_MS = 5 * 60 * 1e3;
  var DUPLICATE_SCORE_THRESHOLD = 0.72;
  var MAX_PUBLISH_ATTEMPTS = 3;
  var RETRYABLE_GITHUB_STATUS_CODES = /* @__PURE__ */ new Set([
    408,
    425,
    429,
    500,
    502,
    503,
    504
  ]);
  var DuplicateRecordError = class extends Error {
    constructor(duplicates, scannedCount = 0) {
      super(`发现 ${duplicates.length} 条疑似重复记录，请确认如何处理`);
      this.name = "DuplicateRecordError";
      this.code = "DUPLICATE_RECORDS";
      this.duplicates = duplicates;
      this.scannedCount = scannedCount;
    }
  };
  function cleanString2(value) {
    return String(value ?? "").trim();
  }
  function commitTitle(value) {
    return cleanString2(value).replace(/\s+/gu, " ").slice(0, 48);
  }
  function commitTitleSummary(records, limit = 5) {
    const titles = [...new Set(
      (records ?? []).map((record) => commitTitle(record?.title)).filter(Boolean)
    )];
    if (!titles.length) {
      return "";
    }
    const visible = titles.slice(0, limit);
    const suffix = titles.length > visible.length ? ` 等 ${titles.length} 部` : "";
    return `${visible.join("、")}${suffix}`;
  }
  function fnv1a(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function createDuplicateRecordId(baseId, records, now) {
    const occupiedIds = new Set(
      (records ?? []).map((record) => cleanString2(record?.id)).filter(Boolean)
    );
    const compactTimestamp = cleanString2(now).replace(/[^0-9a-z]/giu, "").toLocaleLowerCase().slice(0, 20) || fnv1a(now);
    let counter = 1;
    while (counter < 1e3) {
      const suffix = `-copy-${compactTimestamp}${counter > 1 ? `-${counter}` : ""}`;
      const prefix = (cleanString2(baseId) || "anime").slice(
        0,
        Math.max(3, 64 - suffix.length)
      );
      const candidate = `${prefix}${suffix}`;
      if (!occupiedIds.has(candidate)) {
        return candidate;
      }
      counter += 1;
    }
    throw new Error("无法为重复番剧生成新的记录 ID");
  }
  function itemDisplayTitle(item) {
    const chineseName = item?.names?.find(
      (name) => /[\u3400-\u9fff]/u.test(String(name ?? ""))
    );
    return item?.displayTitle || chineseName || item?.title || "";
  }
  function manuallyNormalizeItemId(text) {
    return cleanString2(text).normalize("NFKC").toLocaleLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 46);
  }
  function parseGithubRepository(repositoryUrl) {
    const raw = cleanString2(repositoryUrl);
    if (!raw) {
      throw new Error("请填写 GitHub 仓库地址");
    }
    let owner;
    let repo;
    if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?$/iu.test(raw)) {
      [owner, repo] = raw.split("/");
      repo = repo.replace(/\.git$/iu, "");
    } else {
      let parsed;
      try {
        parsed = new URL(raw);
      } catch {
        throw new Error("GitHub 仓库地址格式不正确");
      }
      if (parsed.protocol !== "https:" || !["github.com", "www.github.com"].includes(
        parsed.hostname.toLocaleLowerCase()
      )) {
        throw new Error("仓库地址必须来自 github.com");
      }
      const parts = parsed.pathname.replace(/\.git$/iu, "").split("/").filter(Boolean);
      if (parts.length !== 2) {
        throw new Error("请填写 GitHub 仓库主页地址，例如 owner/repo");
      }
      [owner, repo] = parts;
    }
    if (!/^[a-z0-9_.-]+$/iu.test(owner ?? "") || !/^[a-z0-9_.-]+$/iu.test(repo ?? "")) {
      throw new Error("GitHub 仓库地址格式不正确");
    }
    return {
      owner,
      repo: repo.replace(/\.git$/iu, ""),
      fullName: `${owner}/${repo.replace(/\.git$/iu, "")}`,
      webUrl: `https://github.com/${owner}/${repo.replace(/\.git$/iu, "")}`
    };
  }
  function deriveGithubUrls(repositoryUrl, branch = "main") {
    const repository = parseGithubRepository(repositoryUrl);
    const safeBranch = cleanString2(branch) || "main";
    const pagesBaseUrl = repository.repo.toLocaleLowerCase() === `${repository.owner.toLocaleLowerCase()}.github.io` ? `https://${repository.owner}.github.io/` : `https://${repository.owner}.github.io/${repository.repo}/`;
    return {
      ...repository,
      branch: safeBranch,
      apiUrl: `${API_ROOT}/repos/${encodeURIComponent(
        repository.owner
      )}/${encodeURIComponent(repository.repo)}`,
      pagesBaseUrl,
      pagesLibraryUrl: `${pagesBaseUrl}data/library.json`,
      rawLibraryUrl: `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${safeBranch.split("/").map(encodeURIComponent).join("/")}/dist/data/library.json`,
      contentsUrl: `${API_ROOT}/repos/${encodeURIComponent(
        repository.owner
      )}/${encodeURIComponent(repository.repo)}/contents`
    };
  }
  function externalIdsForItem(item, selectedResult = null) {
    const sites = item?.sites ?? {};
    const candidateSites = selectedResult?.item?.sites ?? {};
    const result = {};
    const bangumi = cleanString2(sites.bangumi ?? candidateSites.bangumi);
    const bilibiliMedia = cleanString2(
      sites.bilibili ?? candidateSites.bilibili
    );
    const anilist = cleanString2(
      sites.aniList ?? sites.anilist ?? candidateSites.aniList ?? candidateSites.anilist
    );
    const mal = cleanString2(sites.mal ?? candidateSites.mal);
    const bilibiliSeason = cleanString2(
      selectedResult?.bilibiliMetadata?.seasonId ?? selectedResult?.seasonId ?? item?.season?.bilibiliSeason
    );
    if (bangumi) {
      result.bangumi = bangumi;
    }
    if (bilibiliMedia) {
      result.bilibiliMedia = bilibiliMedia;
    }
    if (bilibiliSeason) {
      result.bilibiliSeason = bilibiliSeason;
    }
    if (anilist) {
      result.anilist = anilist;
    }
    if (mal) {
      result.mal = mal;
    }
    return result;
  }
  function recordIdsForItem(item, selectedResult = null) {
    const externalIds = externalIdsForItem(item, selectedResult);
    const ids = [
      externalIds.bilibiliSeason ? `bili-ss${externalIds.bilibiliSeason}` : null,
      externalIds.bilibiliMedia ? `bili-${externalIds.bilibiliMedia}` : null,
      externalIds.bangumi ? `bgm-${externalIds.bangumi}` : null,
      externalIds.anilist ? `anilist-${externalIds.anilist}` : null,
      externalIds.mal ? `mal-${externalIds.mal}` : null
    ].filter(Boolean);
    if (!ids.length) {
      const title = itemDisplayTitle(item) || "untitled";
      const slug = manuallyNormalizeItemId(title) || "untitled";
      ids.push(`manual-${slug}-${fnv1a(title)}`.slice(0, 64));
    }
    return [...new Set(ids)];
  }
  function recordIdentityTokens(record) {
    const externalIds = record?.externalIds ?? {};
    return [
      cleanString2(record?.id),
      cleanString2(externalIds.bilibiliSeason) ? `bili-ss${cleanString2(externalIds.bilibiliSeason)}` : "",
      cleanString2(externalIds.bilibiliMedia) ? `bili-${cleanString2(externalIds.bilibiliMedia)}` : "",
      cleanString2(externalIds.bangumi) ? `bgm-${cleanString2(externalIds.bangumi)}` : "",
      cleanString2(externalIds.anilist) ? `anilist-${cleanString2(externalIds.anilist)}` : "",
      cleanString2(externalIds.mal) ? `mal-${cleanString2(externalIds.mal)}` : ""
    ].filter(Boolean);
  }
  function seasonKeyFromExternalIds(externalIds = {}) {
    for (const [source, id] of Object.entries(externalIds)) {
      if (cleanString2(id)) {
        return `${source}:${cleanString2(id)}`;
      }
    }
    return null;
  }
  function seasonForItem(item, selectedResult = null) {
    if (!item) {
      return null;
    }
    const externalIds = externalIdsForItem(item, selectedResult);
    const bilibiliMetadata = selectedResult?.bilibiliMetadata ?? null;
    return createSeasonDescriptor({
      key: cleanString2(item.season?.key) || cleanString2(item.id) || seasonKeyFromExternalIds(externalIds),
      title: itemDisplayTitle(item),
      names: [
        item.title,
        ...Array.isArray(item.names) ? item.names : [],
        bilibiliMetadata?.seasonTitle,
        bilibiliMetadata?.title
      ].filter(Boolean),
      begin: item.begin,
      year: item.year,
      season: item.season
    });
  }
  function seasonForRecord(record) {
    if (!record) {
      return null;
    }
    return createSeasonDescriptor({
      key: cleanString2(record.season?.key) || cleanString2(record.id) || seasonKeyFromExternalIds(record.externalIds),
      title: record.title,
      names: [record.match?.matchedTitle].filter(Boolean),
      begin: record.season?.begin ?? record.begin,
      year: record.season?.year,
      season: record.season
    });
  }
  function sanitizeRating(value, fallback = null) {
    if (value === null || value === void 0 || cleanString2(value) === "") {
      return fallback;
    }
    const rating = Number(value);
    return Number.isFinite(rating) && rating >= 0 && rating <= 10 ? Math.round(rating * 10) / 10 : fallback;
  }
  function nextRecordTimestamp(previous, now) {
    const currentTime = new Date(now).getTime();
    const previousTime = new Date(previous).getTime();
    if (Number.isFinite(currentTime) && Number.isFinite(previousTime) && currentTime <= previousTime) {
      return new Date(previousTime + 1).toISOString();
    }
    return now;
  }
  function matchMethod(selectedResult, aiResult) {
    if (selectedResult?.manualSelection) {
      return "manual";
    }
    const matchedBy = Array.isArray(selectedResult?.matchedBy) ? selectedResult.matchedBy : [];
    if (matchedBy.some(
      (method) => ["bilibili-id", "bilibili-api-id", "site-id"].includes(method)
    )) {
      return "site-id";
    }
    if (matchedBy.includes("exact")) {
      return "title-exact";
    }
    if (matchedBy.some((method) => ["fuzzy", "substring"].includes(method))) {
      return "title-fuzzy";
    }
    return aiResult ? "ai" : "manual";
  }
  function createAnimeRecord({
    item,
    selectedResult = null,
    aiResult = null,
    id,
    rating,
    review,
    now = (/* @__PURE__ */ new Date()).toISOString()
  }) {
    const title = itemDisplayTitle(item).slice(0, 200);
    if (!title) {
      throw new Error("无法为没有标题的番剧创建 GitHub 记录");
    }
    const manual = Boolean(selectedResult?.manualSelection);
    const externalIds = externalIdsForItem(item, selectedResult);
    return {
      $schema: "../../schemas/anime.schema.json",
      schemaVersion: 1,
      id,
      title,
      rating: sanitizeRating(rating),
      review: cleanString2(review).slice(0, MAX_REVIEW_LENGTH),
      coverUrl: normalizeCoverUrl(item?.coverUrl),
      note: "",
      externalIds,
      season: seasonForItem(item, selectedResult),
      match: {
        status: manual ? "manual" : "matched",
        method: matchMethod(selectedResult, aiResult),
        source: "bangumi-data",
        confidence: Math.max(
          0,
          Math.min(1, Number(selectedResult?.confidence) || (manual ? 1 : 0))
        ),
        matchedTitle: cleanString2(item?.title) || null,
        matchedAt: now
      },
      createdAt: now,
      updatedAt: now
    };
  }
  function mergeAnimeRecord(existingRecord, {
    item,
    selectedResult = null,
    aiResult = null,
    id,
    rating,
    review,
    now = (/* @__PURE__ */ new Date()).toISOString()
  }) {
    if (!existingRecord) {
      return createAnimeRecord({
        item,
        selectedResult,
        aiResult,
        id,
        rating,
        review,
        now
      });
    }
    const updated = {
      ...existingRecord,
      id: cleanString2(existingRecord.id) || id,
      rating: sanitizeRating(rating),
      review: cleanString2(review).slice(0, MAX_REVIEW_LENGTH),
      updatedAt: nextRecordTimestamp(existingRecord.updatedAt, now)
    };
    const season = seasonForItem(item, selectedResult);
    if (season) {
      updated.season = season;
    }
    return updated;
  }
  function normalizeComparable(value) {
    return normalizeTitle(value);
  }
  function titleSimilarity(left, right) {
    const a = normalizeComparable(left);
    const b = normalizeComparable(right);
    if (!a || !b) {
      return 0;
    }
    if (a === b) {
      return 1;
    }
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length > b.length ? a : b;
    if (shorter.length >= 4 && longer.includes(shorter)) {
      return 0.92;
    }
    const leftPairs = /* @__PURE__ */ new Map();
    for (let index = 0; index < a.length - 1; index += 1) {
      const pair = a.slice(index, index + 2);
      leftPairs.set(pair, (leftPairs.get(pair) ?? 0) + 1);
    }
    let overlap = 0;
    for (let index = 0; index < b.length - 1; index += 1) {
      const pair = b.slice(index, index + 2);
      const count = leftPairs.get(pair) ?? 0;
      if (count) {
        overlap += 1;
        leftPairs.set(pair, count - 1);
      }
    }
    const total = Math.max(0, a.length - 1) + Math.max(0, b.length - 1);
    return total ? overlap * 2 / total : 0;
  }
  function bestTitleSimilarity(incomingTitles, existingTitles) {
    let best = 0;
    for (const incoming of incomingTitles) {
      for (const existing of existingTitles) {
        best = Math.max(best, titleSimilarity(incoming, existing));
      }
    }
    return best;
  }
  function duplicateCandidate(incoming, existing, score, reason, titleScore, kind = "similar") {
    return {
      kind,
      id: cleanString2(existing.id) || null,
      title: itemDisplayTitle(existing) || cleanString2(existing.title),
      season: seasonForRecord(existing),
      score: Math.round(score * 100) / 100,
      reason,
      titleScore: Math.round(titleScore * 100) / 100,
      updatedAt: cleanString2(existing.updatedAt) || null
    };
  }
  function compareRecordDuplicate({
    item,
    selectedResult,
    aiResult,
    existing
  }) {
    const incomingIds = recordIdsForItem(item, selectedResult);
    const existingIdentityTokens = new Set(recordIdentityTokens(existing));
    const matchingIds = incomingIds.filter(
      (id) => existingIdentityTokens.has(cleanString2(id))
    );
    if (matchingIds.length) {
      return duplicateCandidate(
        item,
        existing,
        1,
        `个人仓库中已存在同一番剧：${matchingIds.join("、")}`,
        1,
        "existing"
      );
    }
    const incomingSeason = seasonForItem(item, selectedResult);
    const existingSeason = seasonForRecord(existing);
    if (incomingSeason?.number && existingSeason?.number && incomingSeason.number !== existingSeason.number) {
      return null;
    }
    if (incomingSeason?.year && existingSeason?.year && incomingSeason.year !== existingSeason.year) {
      return null;
    }
    const incomingExternalIds = externalIdsForItem(item, selectedResult);
    const existingExternalIds = existing?.externalIds ?? {};
    const sharedExternalIds = Object.entries(incomingExternalIds).filter(
      ([source, id]) => cleanString2(id) && cleanString2(existingExternalIds[source]) === cleanString2(id)
    );
    if (sharedExternalIds.length) {
      return duplicateCandidate(
        item,
        existing,
        1,
        `相同站点索引：${sharedExternalIds.map(([source, id]) => `${source}:${id}`).join("、")}`,
        1,
        "existing"
      );
    }
    const incomingTitles = [
      itemDisplayTitle(item),
      item?.title,
      ...item?.names ?? [],
      aiResult?.title,
      ...aiResult?.alternateTitles ?? []
    ].map(cleanString2).filter(Boolean);
    const existingTitles = [
      existing?.title,
      existing?.match?.matchedTitle,
      ...existing?.aliases ?? []
    ].map(cleanString2).filter(Boolean);
    const titleScore = bestTitleSimilarity(incomingTitles, existingTitles);
    let score = 0;
    let reason = "";
    if (incomingSeason?.key && existingSeason?.key && incomingSeason.key === existingSeason.key) {
      score = 0.98;
      reason = "相同季度身份";
    } else if (incomingSeason?.number && existingSeason?.number && incomingSeason.number === existingSeason.number && titleScore >= 0.86) {
      score = 0.94;
      reason = `同一季度：第${incomingSeason.number}季`;
    } else if (titleScore === 1) {
      score = 0.86;
      reason = "标题完全一致，季度信息不足以区分";
    } else if (titleScore >= 0.9) {
      score = 0.79;
      reason = "标题高度相似，季度信息不足以区分";
    } else if (titleScore >= 0.82) {
      score = 0.73;
      reason = "标题较相似，建议人工确认";
    }
    return score >= DUPLICATE_SCORE_THRESHOLD ? duplicateCandidate(item, existing, score, reason, titleScore) : null;
  }
  function encodeBase64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  function decodeBase64Utf8(value) {
    const binary = atob(String(value ?? "").replace(/\s+/gu, ""));
    const bytes = Uint8Array.from(
      binary,
      (character) => character.charCodeAt(0)
    );
    return new TextDecoder().decode(bytes);
  }
  function githubHeaders(token, includeContentType = false) {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (includeContentType) {
      headers["Content-Type"] = "application/json; charset=utf-8";
    }
    if (cleanString2(token)) {
      headers.Authorization = `Bearer ${cleanString2(token)}`;
    }
    return headers;
  }
  function isNotFound(error) {
    if (Number(error?.status) === 404) {
      return true;
    }
    return /^HTTP 404\b/u.test(toErrorMessage(error));
  }
  function isConflict(error) {
    return [409, 422].includes(Number(error?.status));
  }
  function isRetryableGithubError(error) {
    if (!error) {
      return false;
    }
    if (Number(error.status) === 0 || RETRYABLE_GITHUB_STATUS_CODES.has(Number(error.status))) {
      return true;
    }
    return Number(error.status) === 403 && (Number(error.retryAfterMs) > 0 || /rate limit|secondary rate|abuse detection/iu.test(
      String(error.body ?? error.message ?? "")
    ));
  }
  function encodePath(value) {
    return String(value).split("/").map((segment) => encodeURIComponent(segment)).join("/");
  }
  function reportProgress(options, phase, message, detail = {}) {
    try {
      options?.onProgress?.({
        phase,
        message,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        ...detail
      });
    } catch {
    }
  }
  function progressRetryHandler(options, phase, label) {
    return (retry) => {
      const seconds = Math.max(1, Math.ceil(Number(retry.delayMs) / 1e3));
      reportProgress(
        options,
        "retry",
        `${label}遇到临时网络问题，${seconds} 秒后自动重试（${retry.nextAttempt}/${retry.maxAttempts}）`,
        {
          attempt: retry.attempt,
          nextAttempt: retry.nextAttempt,
          maxAttempts: retry.maxAttempts,
          delayMs: retry.delayMs,
          status: retry.status,
          networkRetry: true
        }
      );
    };
  }
  function parseContentResponse(payload, path) {
    if (!payload || typeof payload !== "object") {
      throw new Error("GitHub 返回了无效的文件内容");
    }
    const file = payload.content && typeof payload.content === "object" ? payload.content : payload;
    if (!Object.hasOwn(file, "content")) {
      return {
        text: "",
        sha: cleanString2(file.sha),
        htmlUrl: cleanString2(file.html_url),
        path: cleanString2(file.path) || path,
        exists: false
      };
    }
    const text = file.encoding === "base64" ? decodeBase64Utf8(file.content) : String(file.content ?? "");
    return {
      text,
      sha: cleanString2(file.sha),
      htmlUrl: cleanString2(file.html_url),
      path: cleanString2(file.path) || path,
      exists: true
    };
  }
  var GitHubRecordsService = class {
    constructor({
      settingsStore = null,
      requestJsonImpl = requestJson,
      now = () => (/* @__PURE__ */ new Date()).toISOString(),
      sleepImpl = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
      retryBaseDelayMs = 700
    } = {}) {
      this.settingsStore = settingsStore;
      this.requestJson = requestJsonImpl;
      this.now = now;
      this.sleep = sleepImpl;
      this.retryBaseDelayMs = Math.max(0, Number(retryBaseDelayMs) || 0);
      this.fileCache = /* @__PURE__ */ new Map();
    }
    getConfig(override = null) {
      const settings = override ?? this.settingsStore?.get?.()?.github ?? {};
      const repositoryUrl = cleanString2(settings.repositoryUrl);
      const branch = cleanString2(settings.branch) || "main";
      return {
        enabled: Boolean(settings.enabled),
        token: cleanString2(settings.token),
        branch,
        repositoryUrl,
        urls: repositoryUrl ? deriveGithubUrls(repositoryUrl, branch) : null
      };
    }
    assertConfigured(override = null) {
      const config = this.getConfig(override);
      if (!config.enabled) {
        throw new Error("GitHub 同步尚未启用");
      }
      if (!config.urls) {
        throw new Error("请先填写 GitHub 仓库地址");
      }
      return config;
    }
    fileCacheKey(config, filePath) {
      return `${config.urls.fullName}:${config.branch}:${filePath}`;
    }
    contentUrl(config, filePath) {
      return `${config.urls.contentsUrl}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
    }
    async getContentFile(config, filePath, options = {}) {
      const key = this.fileCacheKey(config, filePath);
      const cached = this.fileCache.get(key);
      if (!options.force && cached && Date.now() - cached.cachedAt < LIBRARY_CACHE_MS) {
        return cached.file;
      }
      const ref = cleanString2(options.ref) || config.branch;
      const url = `${this.contentUrl(config, filePath)}?ref=${encodeURIComponent(
        ref
      )}`;
      try {
        const payload = await this.requestJson(url, {
          headers: githubHeaders(config.token),
          timeout: 2e4,
          onRetry: progressRetryHandler(
            options,
            "load",
            `读取 ${filePath}`
          )
        });
        const file = parseContentResponse(payload, filePath);
        this.fileCache.set(key, { file, cachedAt: Date.now() });
        return file;
      } catch (error) {
        if (isNotFound(error)) {
          const file = {
            text: "",
            sha: null,
            htmlUrl: "",
            path: filePath,
            exists: false
          };
          this.fileCache.set(key, { file, cachedAt: Date.now() });
          return file;
        }
        throw error;
      }
    }
    async getIndexRecords(config, options = {}) {
      const indexFile = await this.getContentFile(
        config,
        ANIME_INDEX_JSONL_PATH,
        options
      );
      if (indexFile.exists) {
        return parseJsonl(indexFile.text, ANIME_INDEX_JSONL_PATH);
      }
      const library = await this.loadLibrary(config, options);
      return buildAnimeIndex(library.records);
    }
    async loadLibrary(config, options = {}) {
      const [animeFile, indexFile] = await Promise.all([
        this.getContentFile(config, ANIME_JSONL_PATH, options),
        this.getContentFile(config, ANIME_INDEX_JSONL_PATH, options)
      ]);
      const records = parseJsonl(animeFile.text, ANIME_JSONL_PATH);
      const index = indexFile.exists ? parseJsonl(indexFile.text, ANIME_INDEX_JSONL_PATH) : buildAnimeIndex(records);
      return {
        records,
        index,
        animeFile,
        indexFile
      };
    }
    async listDirectoryFiles(config, directory, options = {}) {
      const ref = cleanString2(options.ref) || config.branch;
      const url = `${this.contentUrl(config, directory)}?ref=${encodeURIComponent(
        ref
      )}`;
      let payload;
      try {
        payload = await this.requestJson(url, {
          headers: githubHeaders(config.token),
          timeout: 2e4,
          onRetry: progressRetryHandler(
            options,
            "load",
            `读取目录 ${directory}`
          )
        });
      } catch (error) {
        if (isNotFound(error)) {
          return [];
        }
        throw error;
      }
      if (!Array.isArray(payload)) {
        throw new Error(`GitHub 目录 ${directory} 返回了无效内容`);
      }
      return payload.filter(
        (entry) => entry?.type === "file" && (!options.extension || String(entry?.name ?? "").toLocaleLowerCase().endsWith(
          options.extension.toLocaleLowerCase()
        ))
      ).map((entry) => ({
        name: String(entry.name),
        path: cleanString2(entry.path),
        sha: cleanString2(entry.sha)
      })).filter((entry) => entry.name && entry.path);
    }
    async listRecords(config, options = {}) {
      const library = await this.loadLibrary(config, options);
      return library.records;
    }
    inspectDuplicateRecords(records, { item, selectedResult, aiResult, excludeIds }) {
      const excluded = new Set(
        (excludeIds ?? []).map((id) => cleanString2(id)).filter(Boolean)
      );
      const duplicates = (records ?? []).filter(({ id }) => !excluded.has(cleanString2(id))).map(
        (record) => compareRecordDuplicate({
          item,
          selectedResult,
          aiResult,
          existing: record
        })
      ).filter(Boolean).sort((left, right) => right.score - left.score).slice(0, 8);
      return {
        duplicates,
        scannedCount: records?.length ?? 0
      };
    }
    async inspectDuplicates({
      item,
      selectedResult = null,
      aiResult = null,
      excludeIds = []
    }) {
      const config = this.assertConfigured();
      if (!item) {
        return { duplicates: [], scannedCount: 0 };
      }
      const records = await this.getIndexRecords(config);
      return this.inspectDuplicateRecords(records, {
        item,
        selectedResult,
        aiResult,
        excludeIds
      });
    }
    async findRecord(item, selectedResult = null) {
      const config = this.assertConfigured();
      const ids = recordIdsForItem(item, selectedResult);
      const library = await this.loadLibrary(config);
      const idSet = new Set(ids);
      const record = library.records.find((entry) => idSet.has(cleanString2(entry.id)));
      if (!record) {
        return null;
      }
      return {
        id: cleanString2(record.id),
        record,
        sha: library.animeFile.sha,
        htmlUrl: library.animeFile.htmlUrl,
        path: library.animeFile.path
      };
    }
    async loadForItem(item, selectedResult = null) {
      if (!item) {
        return null;
      }
      try {
        return await this.findRecord(item, selectedResult);
      } catch (error) {
        if (Number(error?.status) === 401 || Number(error?.status) === 403) {
          throw new Error(
            "GitHub 读取失败，请检查 Token 是否仍有效以及 Contents 权限"
          );
        }
        throw error;
      }
    }
    async requestGit(config, path, options = {}) {
      const { onProgress, progressLabel, retryUnsafe = false } = options;
      const requestOptions = {
        method: options.method ?? "GET",
        headers: githubHeaders(
          config.token,
          options.body !== void 0
        ),
        timeout: options.timeout ?? 3e4,
        retryUnsafe,
        maxAttempts: options.maxAttempts ?? 3,
        onRetry: progressRetryHandler(
          { onProgress },
          options.phase ?? "request",
          progressLabel ?? "GitHub 请求"
        )
      };
      if (options.body !== void 0) {
        requestOptions.body = JSON.stringify(options.body);
      }
      return this.requestJson(`${config.urls.apiUrl}${path}`, requestOptions);
    }
    async getBranchHead(config, options = {}) {
      const payload = await this.requestGit(
        config,
        `/git/ref/heads/${encodePath(config.branch)}`,
        {
          ...options,
          progressLabel: "读取远端分支"
        }
      );
      const sha = cleanString2(payload?.object?.sha);
      if (!sha) {
        throw new Error(`找不到 GitHub 分支 ${config.branch}`);
      }
      return sha;
    }
    async loadPublishSnapshot(config, options = {}) {
      reportProgress(
        options,
        "load",
        `正在读取个人仓库最新版本（第 ${options.attempt ?? 1} 次尝试）`,
        {
          attempt: options.attempt ?? 1,
          maxAttempts: MAX_PUBLISH_ATTEMPTS,
          percent: 6
        }
      );
      const headSha = await this.getBranchHead(config, options);
      const commit = await this.requestGit(
        config,
        `/git/commits/${encodeURIComponent(headSha)}`,
        {
          ...options,
          progressLabel: "读取远端提交"
        }
      );
      const baseTreeSha = cleanString2(commit?.tree?.sha);
      if (!baseTreeSha) {
        throw new Error("无法读取远端分支的 Git Tree");
      }
      const library = await this.loadLibrary(config, {
        force: true,
        ref: headSha,
        onProgress: options.onProgress
      });
      reportProgress(
        options,
        "loaded",
        `已读取 ${library.records.length} 条个人记录，正在准备提交`,
        {
          attempt: options.attempt ?? 1,
          maxAttempts: MAX_PUBLISH_ATTEMPTS,
          percent: 18,
          recordCount: library.records.length
        }
      );
      return {
        ...library,
        headSha,
        baseTreeSha
      };
    }
    async createGitBlob(config, text, options = {}) {
      const payload = await this.requestGit(config, "/git/blobs", {
        method: "POST",
        body: {
          content: encodeBase64Utf8(text),
          encoding: "base64"
        },
        phase: options.phase ?? "data",
        progressLabel: options.progressLabel ?? "上传 Git Blob",
        retryUnsafe: true,
        onProgress: options.onProgress
      });
      const sha = cleanString2(payload?.sha);
      if (!sha) {
        throw new Error("GitHub 没有返回 Git Blob SHA");
      }
      return sha;
    }
    async publishLibrary(config, {
      library,
      records,
      index,
      message,
      onProgress = null
    }) {
      const animeText = serializeJsonl(records);
      const indexText = serializeJsonl(index);
      const hasPreviousData = Boolean(
        (library.animeFile.text ?? "") || (library.indexFile.text ?? "")
      );
      let backupPath = null;
      let backupText = null;
      let staleBackups = [];
      if (hasPreviousData) {
        const createdAt = this.now();
        const safeTime = cleanString2(createdAt).replace(/[:.]/gu, "-").replace(/[^0-9A-Za-z_-]/gu, "");
        const suffix = fnv1a(
          `${library.animeFile.text ?? ""}
${library.indexFile.text ?? ""}`
        );
        backupPath = `${BACKUP_DIRECTORY}/library-${safeTime}-${suffix}.json`;
        backupText = `${JSON.stringify(
          createBackupSnapshot({
            animeText: library.animeFile.text ?? "",
            indexText: library.indexFile.text ?? "",
            createdAt
          }),
          null,
          2
        )}
`;
        reportProgress(
          { onProgress },
          "backup",
          "正在把当前远端数据加入同一个提交的备份",
          { percent: 24 }
        );
        const backups = (await this.listDirectoryFiles(config, BACKUP_DIRECTORY, {
          extension: ".json",
          ref: library.headSha,
          onProgress
        })).sort(
          (left, right) => right.name.localeCompare(left.name, "en")
        );
        const backupName = backupPath.split("/").at(-1);
        staleBackups = [
          backupName,
          ...backups.map((backup) => backup.name).filter((name) => name !== backupName)
        ].sort((left, right) => right.localeCompare(left, "en")).slice(MAX_BACKUP_SNAPSHOTS);
        staleBackups = staleBackups.filter((name) => name !== backupName).map((name) => `${BACKUP_DIRECTORY}/${name}`);
      }
      reportProgress(
        { onProgress },
        "data",
        "正在生成并上传完整数据文件",
        { percent: 32 }
      );
      const animeBlob = await this.createGitBlob(config, animeText, {
        onProgress,
        phase: "data",
        progressLabel: "上传 anime.jsonl"
      });
      reportProgress(
        { onProgress },
        "index",
        "正在生成并上传轻量索引",
        { percent: 46 }
      );
      const indexBlob = await this.createGitBlob(config, indexText, {
        onProgress,
        phase: "index",
        progressLabel: "上传 anime-index.jsonl"
      });
      const backupBlob = backupText ? await this.createGitBlob(config, backupText, {
        onProgress,
        phase: "backup",
        progressLabel: "上传备份快照"
      }) : null;
      const treeEntries = [
        {
          path: ANIME_JSONL_PATH,
          mode: "100644",
          type: "blob",
          sha: animeBlob
        },
        {
          path: ANIME_INDEX_JSONL_PATH,
          mode: "100644",
          type: "blob",
          sha: indexBlob
        }
      ];
      if (backupPath && backupBlob) {
        treeEntries.push({
          path: backupPath,
          mode: "100644",
          type: "blob",
          sha: backupBlob
        });
      }
      for (const stalePath of staleBackups) {
        treeEntries.push({
          path: stalePath,
          mode: "100644",
          type: "blob",
          sha: null
        });
      }
      reportProgress(
        { onProgress },
        "tree",
        "正在构建数据、索引与备份的原子文件树",
        { percent: 64 }
      );
      const tree = await this.requestGit(config, "/git/trees", {
        method: "POST",
        body: {
          base_tree: library.baseTreeSha,
          tree: treeEntries
        },
        phase: "tree",
        progressLabel: "创建 Git Tree",
        retryUnsafe: true,
        onProgress
      });
      const treeSha = cleanString2(tree?.sha);
      if (!treeSha) {
        throw new Error("GitHub 没有返回新的 Git Tree SHA");
      }
      reportProgress(
        { onProgress },
        "commit",
        "正在创建包含数据、索引和备份的单一提交",
        { percent: 76 }
      );
      const commit = await this.requestGit(config, "/git/commits", {
        method: "POST",
        body: {
          message,
          tree: treeSha,
          parents: [library.headSha]
        },
        phase: "commit",
        progressLabel: "创建 Git Commit",
        retryUnsafe: true,
        onProgress
      });
      const commitSha = cleanString2(commit?.sha);
      if (!commitSha) {
        throw new Error("GitHub 没有返回新的提交 SHA");
      }
      reportProgress(
        { onProgress },
        "publish",
        `正在发布提交 ${commitSha.slice(0, 7)} 到 ${config.branch}`,
        {
          percent: 90,
          commit: commitSha,
          branch: config.branch
        }
      );
      try {
        await this.requestGit(
          config,
          `/git/refs/heads/${encodePath(config.branch)}`,
          {
            method: "PATCH",
            body: { sha: commitSha, force: false },
            phase: "publish",
            progressLabel: "发布远端分支",
            retryUnsafe: false,
            maxAttempts: 1,
            onProgress
          }
        );
      } catch (error) {
        if (isRetryableGithubError(error)) {
          reportProgress(
            { onProgress },
            "verify",
            "发布响应中断，正在核对远端分支是否已经更新",
            { percent: 94 }
          );
          try {
            const currentHead = await this.getBranchHead(config, {
              onProgress
            });
            if (currentHead === commitSha) {
              return {
                commitSha,
                animeText,
                indexText,
                animeBlob,
                indexBlob,
                backupPath,
                backupBlob
              };
            }
          } catch {
          }
        }
        throw error;
      }
      return {
        commitSha,
        animeText,
        indexText,
        animeBlob,
        indexBlob,
        backupPath,
        backupBlob
      };
    }
    cachePublishedLibrary(config, published) {
      const htmlBase = `${config.urls.webUrl}/blob/${config.branch}`;
      this.cacheWrittenFile(
        config,
        ANIME_JSONL_PATH,
        published.animeText,
        {
          content: {
            sha: published.animeBlob,
            path: ANIME_JSONL_PATH,
            html_url: `${htmlBase}/${ANIME_JSONL_PATH}`
          }
        }
      );
      this.cacheWrittenFile(
        config,
        ANIME_INDEX_JSONL_PATH,
        published.indexText,
        {
          content: {
            sha: published.indexBlob,
            path: ANIME_INDEX_JSONL_PATH,
            html_url: `${htmlBase}/${ANIME_INDEX_JSONL_PATH}`
          }
        }
      );
    }
    async waitBeforePublishRetry(options, attempt, error) {
      const delayMs = Math.min(
        6e3,
        Math.max(1, this.retryBaseDelayMs) * 2 ** (attempt - 1)
      );
      const reason = isConflict(error) ? "远端在保存期间出现了新提交" : "GitHub 暂时不可用";
      reportProgress(
        options,
        "retry",
        `${reason}，${Math.max(1, Math.ceil(delayMs / 1e3))} 秒后自动重新读取并重试（${attempt + 1}/${MAX_PUBLISH_ATTEMPTS}）`,
        {
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: MAX_PUBLISH_ATTEMPTS,
          delayMs,
          status: Number(error?.status) || 0,
          percent: 8
        }
      );
      await this.sleep(delayMs);
    }
    async saveRecord({
      item,
      selectedResult = null,
      aiResult = null,
      rating,
      review,
      allowDuplicates = false,
      replaceExisting = false,
      onProgress = null
    }) {
      const config = this.assertConfigured();
      const ids = recordIdsForItem(item, selectedResult);
      const requestedAt = this.now();
      const progressOptions = { onProgress };
      for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
        try {
          const library = await this.loadPublishSnapshot(config, {
            ...progressOptions,
            attempt
          });
          const idSet = new Set(ids);
          let existing = library.records.find(
            (record) => idSet.has(cleanString2(record.id))
          ) ?? null;
          let existingId = cleanString2(existing?.id) || null;
          if (!allowDuplicates || replaceExisting) {
            reportProgress(
              progressOptions,
              "duplicates",
              `正在检查 ${library.index.length} 条索引中的重复项`,
              { percent: 22 }
            );
            const inspection = this.inspectDuplicateRecords(library.index, {
              item,
              selectedResult,
              aiResult
            });
            if (replaceExisting) {
              const exactDuplicate = inspection.duplicates.find(
                (duplicate) => duplicate.kind === "existing"
              );
              if (!exactDuplicate?.id) {
                throw new Error(
                  "未找到可替换的精确番剧记录，请重新识别后再试"
                );
              }
              existing = library.records.find(
                (record) => cleanString2(record.id) === exactDuplicate.id
              ) ?? null;
              existingId = cleanString2(existing?.id) || null;
              if (!existing) {
                throw new Error(
                  "要替换的番剧记录已发生变化，请重新识别后再试"
                );
              }
            } else if (inspection.duplicates.length) {
              throw new DuplicateRecordError(
                inspection.duplicates,
                inspection.scannedCount
              );
            }
          }
          const appendedDuplicate = Boolean(
            allowDuplicates && !replaceExisting && existing
          );
          const replacedExisting = Boolean(replaceExisting && existing);
          const id = appendedDuplicate ? createDuplicateRecordId(
            existingId ?? ids[0],
            library.records,
            requestedAt
          ) : existingId ?? ids[0];
          const merged = appendedDuplicate ? createAnimeRecord({
            item,
            selectedResult,
            aiResult,
            id,
            rating,
            review,
            now: requestedAt
          }) : mergeAnimeRecord(existing, {
            item,
            selectedResult,
            aiResult,
            id,
            rating,
            review,
            now: requestedAt
          });
          const nextRecords = upsertRecord(library.records, merged);
          const nextIndex = buildAnimeIndex(nextRecords);
          const published = await this.publishLibrary(config, {
            library,
            records: nextRecords,
            index: nextIndex,
            message: `chore(data): ${replacedExisting ? "replace review" : appendedDuplicate ? "append duplicate" : "save"} ${commitTitle(merged.title)} (${id})

Anime: ${commitTitle(merged.title)}
Record-Id: ${id}
Rating: ${merged.rating ?? "unrated"}
Source: Tampermonkey userscript`,
            onProgress
          });
          this.cachePublishedLibrary(config, published);
          reportProgress(
            progressOptions,
            "complete",
            `同步完成：提交 ${published.commitSha.slice(0, 7)} 已发布`,
            {
              percent: 100,
              commit: published.commitSha
            }
          );
          return {
            id,
            record: merged,
            appendedDuplicate,
            replacedExisting,
            commit: published.commitSha,
            sha: published.animeBlob,
            htmlUrl: `${config.urls.webUrl}/blob/${config.branch}/${ANIME_JSONL_PATH}`,
            path: ANIME_JSONL_PATH
          };
        } catch (error) {
          if (attempt >= MAX_PUBLISH_ATTEMPTS || !isConflict(error) && !isRetryableGithubError(error)) {
            throw error;
          }
          await this.waitBeforePublishRetry(
            progressOptions,
            attempt,
            error
          );
        }
      }
      throw new Error("GitHub 记录写入失败，请稍后重试");
    }
    async saveRecordsBatch({
      entries = [],
      now = this.now(),
      onProgress = null
    } = {}) {
      const config = this.assertConfigured();
      const progressOptions = { onProgress };
      const queued = [];
      const queuedIds = /* @__PURE__ */ new Set();
      let inputDuplicateCount = 0;
      for (const entry of entries) {
        if (!entry?.item) {
          continue;
        }
        const selectedResult = entry.selectedResult ?? null;
        const ids = recordIdsForItem(entry.item, selectedResult);
        if (ids.some((id) => queuedIds.has(id))) {
          inputDuplicateCount += 1;
          continue;
        }
        for (const id of ids) {
          queuedIds.add(id);
        }
        queued.push({
          item: entry.item,
          selectedResult,
          ids,
          id: ids[0]
        });
      }
      if (!queued.length) {
        return {
          imported: [],
          skippedCount: inputDuplicateCount,
          scannedCount: 0
        };
      }
      for (let attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1) {
        try {
          const library = await this.loadPublishSnapshot(config, {
            ...progressOptions,
            attempt
          });
          const existingTokens = new Set(
            library.records.flatMap((record) => recordIdentityTokens(record))
          );
          const added = [];
          let nextRecords = library.records;
          for (const entry of queued) {
            if (entry.ids.some((id) => existingTokens.has(id))) {
              continue;
            }
            const record = createAnimeRecord({
              item: entry.item,
              selectedResult: entry.selectedResult,
              id: entry.id,
              rating: null,
              review: "",
              now
            });
            nextRecords = upsertRecord(nextRecords, record);
            entry.ids.forEach((id) => existingTokens.add(id));
            added.push(record);
          }
          const nextIndex = buildAnimeIndex(nextRecords);
          const animeText = serializeJsonl(nextRecords);
          const indexText = serializeJsonl(nextIndex);
          const changed = animeText !== (library.animeFile.text ?? "") || indexText !== (library.indexFile.text ?? "");
          if (!changed) {
            reportProgress(
              progressOptions,
              "complete",
              "检查完成：选中记录均已存在，没有需要写入的数据",
              { percent: 100 }
            );
            return {
              imported: [],
              skippedCount: queued.length + inputDuplicateCount,
              scannedCount: library.records.length,
              records: nextRecords,
              path: ANIME_JSONL_PATH,
              htmlUrl: library.animeFile.htmlUrl,
              sha: library.animeFile.sha
            };
          }
          const summary = commitTitleSummary(added) || "待处理番剧";
          reportProgress(
            progressOptions,
            "prepare",
            `已识别 ${added.length} 条新增记录，正在准备原子提交`,
            {
              percent: 22,
              addedCount: added.length,
              skippedCount: queued.length - added.length
            }
          );
          const published = await this.publishLibrary(config, {
            library,
            records: nextRecords,
            index: nextIndex,
            message: `chore(data): import ${added.length || queued.length} Bilibili anime

Anime: ${summary}
Added-Count: ${added.length}
Source: Bilibili follow page in Tampermonkey`,
            onProgress
          });
          this.cachePublishedLibrary(config, published);
          const imported = added.map((record) => ({
            id: record.id,
            title: record.title,
            mediaId: cleanString2(record.externalIds?.bilibiliMedia)
          }));
          reportProgress(
            progressOptions,
            "complete",
            `同步完成：新增 ${imported.length} 条，跳过 ${queued.length - imported.length} 条`,
            {
              percent: 100,
              commit: published.commitSha,
              importedCount: imported.length,
              skippedCount: queued.length - imported.length
            }
          );
          return {
            imported,
            skippedCount: queued.length - imported.length + inputDuplicateCount,
            scannedCount: nextRecords.length,
            records: nextRecords,
            path: ANIME_JSONL_PATH,
            htmlUrl: `${config.urls.webUrl}/blob/${config.branch}/${ANIME_JSONL_PATH}`,
            sha: published.animeBlob,
            commit: published.commitSha
          };
        } catch (error) {
          if (attempt >= MAX_PUBLISH_ATTEMPTS || !isConflict(error) && !isRetryableGithubError(error)) {
            throw error;
          }
          await this.waitBeforePublishRetry(
            progressOptions,
            attempt,
            error
          );
        }
      }
      throw new Error("GitHub 批量记录写入失败，请稍后重试");
    }
    cacheWrittenFile(config, filePath, text, payload) {
      const parsed = parseContentResponse(payload, filePath);
      this.fileCache.set(this.fileCacheKey(config, filePath), {
        file: {
          ...parsed,
          text,
          exists: true
        },
        cachedAt: Date.now()
      });
    }
    async checkConnection(override = null) {
      const config = this.getConfig(override);
      if (!config.urls) {
        throw new Error("请先填写 GitHub 仓库地址");
      }
      const repository = await this.requestJson(config.urls.apiUrl, {
        headers: githubHeaders(config.token),
        timeout: 2e4
      });
      const permissions = repository.permissions ?? null;
      const canWrite = typeof permissions?.push === "boolean" ? permissions.push : null;
      return {
        fullName: cleanString2(repository.full_name) || config.urls.fullName,
        defaultBranch: cleanString2(repository.default_branch) || "main",
        private: Boolean(repository.private),
        permissions,
        canWrite,
        hasToken: Boolean(config.token),
        pagesLibraryUrl: config.urls.pagesLibraryUrl,
        pagesSetupUrl: `${config.urls.webUrl}/settings/pages`
      };
    }
    async checkTemplateRepository() {
      const repository = await this.requestJson(TEMPLATE_REPOSITORY_API_URL, {
        timeout: 2e4
      });
      const fullName = cleanString2(repository.full_name);
      const publicRepository = repository.private === false;
      const templateEnabled = repository.is_template === true;
      return {
        fullName: fullName || TEMPLATE_REPOSITORY,
        private: !publicRepository,
        isTemplate: templateEnabled,
        defaultBranch: cleanString2(repository.default_branch) || "main",
        ready: publicRepository && templateEnabled,
        webUrl: cleanString2(repository.html_url) || `https://github.com/${TEMPLATE_REPOSITORY}`
      };
    }
  };
  function createGithubRecordsService(options = {}) {
    return new GitHubRecordsService(options);
  }

  // src/core/indexed-db.js
  var DB_NAME = "bangumi-scout-index";
  var DB_VERSION = 1;
  var STORE_NAME = "snapshots";
  var SNAPSHOT_KEY = "current";
  var memorySnapshot = null;
  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    });
  }
  async function readIndexSnapshot() {
    if (memorySnapshot) {
      return memorySnapshot;
    }
    try {
      const database = await openDatabase();
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error ?? new Error("Failed to read index cache"));
        transaction.oncomplete = () => database.close();
      });
    } catch {
      return null;
    }
  }
  async function writeIndexSnapshot(snapshot) {
    memorySnapshot = snapshot;
    try {
      const database = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error ?? new Error("Failed to write index cache"));
      });
      database.close();
    } catch {
    }
  }
  async function clearIndexSnapshot() {
    memorySnapshot = null;
    try {
      const database = await openDatabase();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error ?? new Error("Failed to clear index cache"));
      });
      database.close();
    } catch {
    }
  }

  // src/index/build-index.js
  var INDEX_SCHEMA_VERSION = 1;
  var TRACKED_SITES = /* @__PURE__ */ new Set([
    "bilibili",
    "bangumi",
    "mal",
    "aniList",
    "anidb",
    "mikan",
    "tmdb"
  ]);
  var LANGUAGE_ORDER = ["zh-Hans", "zh-Hant", "zh", "ja", "en"];
  var DISPLAY_TITLE_LANGUAGES = ["zh-Hans", "zh-Hant", "zh"];
  function uniqueStrings2(values) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const value of values) {
      if (typeof value !== "string") {
        continue;
      }
      const cleaned = value.trim();
      const key = cleaned.toLocaleLowerCase();
      if (cleaned && !seen.has(key)) {
        seen.add(key);
        result.push(cleaned);
      }
    }
    return result;
  }
  function collectNames(item) {
    const translations = item.titleTranslate ?? {};
    const translatedNames = [];
    const languageKeys = [
      ...LANGUAGE_ORDER,
      ...Object.keys(translations).filter(
        (language) => !LANGUAGE_ORDER.includes(language)
      )
    ];
    for (const language of languageKeys) {
      const values = translations[language];
      if (Array.isArray(values)) {
        translatedNames.push(...values);
      } else if (typeof values === "string") {
        translatedNames.push(values);
      }
    }
    return uniqueStrings2([item.title, ...translatedNames]);
  }
  function collectDisplayTitle(item, names) {
    const translations = item.titleTranslate ?? {};
    for (const language of DISPLAY_TITLE_LANGUAGES) {
      const values = translations[language];
      const candidates = Array.isArray(values) ? values : [values];
      const translated = uniqueStrings2(candidates)[0];
      if (translated) {
        return translated;
      }
    }
    return names[0] ?? String(item.title ?? "").trim();
  }
  function collectCoverUrl(item) {
    const candidates = [
      item?.coverUrl,
      item?.cover,
      item?.image,
      item?.images?.large,
      item?.images?.common,
      item?.images?.medium
    ];
    return candidates.map(normalizeCoverUrl).find(Boolean) ?? null;
  }
  function collectSites(sites) {
    const result = {};
    if (!Array.isArray(sites)) {
      return result;
    }
    for (const site of sites) {
      const name = String(site?.site ?? "");
      const id = String(site?.id ?? "");
      if (name && id && TRACKED_SITES.has(name) && !result[name]) {
        result[name] = id;
      }
    }
    return result;
  }
  function stableItemId(title, names, sites, year) {
    const preferredSite = ["bangumi", "aniList", "mal", "bilibili"].find(
      (site) => sites[site]
    );
    if (preferredSite) {
      return `${preferredSite}:${sites[preferredSite]}`;
    }
    return `title:${normalizeTitle(names[0] ?? title)}:${year || "unknown"}`;
  }
  function coerceYear2(begin) {
    const match = String(begin ?? "").match(/^(\d{4})/u);
    return match ? Number(match[1]) : null;
  }
  function buildSlimIndex(raw, metadata = {}) {
    if (!raw || !Array.isArray(raw.items)) {
      throw new Error("Index source must contain an items array");
    }
    const items = raw.items.map((item) => {
      const title = String(item?.title ?? "").trim();
      const names = collectNames(item);
      if (!title || names.length === 0) {
        return null;
      }
      const sites = collectSites(item.sites);
      const begin = String(item.begin ?? "") || null;
      const year = coerceYear2(begin);
      const id = stableItemId(title, names, sites, year);
      return {
        id,
        title,
        displayTitle: collectDisplayTitle(item, names),
        names,
        normalizedNames: uniqueStrings2(names.map(normalizeTitle)),
        searchText: names.join(" "),
        type: String(item.type ?? "unknown"),
        begin,
        year,
        sites,
        season: createSeasonDescriptor({
          key: id,
          title,
          names,
          begin,
          year,
          season: item.season
        }),
        coverUrl: collectCoverUrl(item)
      };
    }).filter(Boolean);
    return {
      schemaVersion: INDEX_SCHEMA_VERSION,
      source: {
        id: metadata.sourceId ?? metadata.sourceName ?? "bangumi-data",
        name: metadata.sourceName ?? "bangumi-data",
        version: String(metadata.sourceVersion ?? "unknown"),
        fetchedAt: metadata.fetchedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
        lastCheckedAt: metadata.lastCheckedAt ?? null,
        license: metadata.license ?? "CC BY 4.0",
        contentHash: metadata.contentHash ?? null,
        sourceUrl: metadata.sourceUrl ?? null
      },
      builtAt: (/* @__PURE__ */ new Date()).toISOString(),
      itemCount: items.length,
      items
    };
  }
  function normalizeIndexPayload(payload, metadata = {}) {
    if (Array.isArray(payload?.items) && indexItemsHaveSearchFields(payload.items)) {
      return {
        ...payload,
        schemaVersion: INDEX_SCHEMA_VERSION,
        items: payload.items.map((item) => {
          if (item.season?.key) {
            return item;
          }
          return {
            ...item,
            season: createSeasonDescriptor({
              key: item.id,
              title: item.displayTitle || item.title,
              names: item.names,
              begin: item.begin,
              year: item.year
            })
          };
        }),
        source: {
          ...payload.source,
          ...metadata
        },
        itemCount: payload.items.length
      };
    }
    return buildSlimIndex(payload, metadata);
  }
  function indexItemsHaveSearchFields(items) {
    return Array.isArray(items) && items.every(
      (item) => typeof item?.id === "string" && typeof item?.title === "string" && Array.isArray(item?.names) && item?.sites && typeof item.sites === "object"
    );
  }

  // node_modules/fuse.js/dist/fuse.mjs
  function isArray(value) {
    return !Array.isArray ? getTag(value) === "[object Array]" : Array.isArray(value);
  }
  function baseToString(value) {
    if (typeof value == "string") return value;
    if (typeof value === "bigint") return value.toString();
    const result = value + "";
    return result == "0" && 1 / value == -Infinity ? "-0" : result;
  }
  function toString(value) {
    return value == null ? "" : baseToString(value);
  }
  function isString(value) {
    return typeof value === "string";
  }
  function isNumber(value) {
    return typeof value === "number";
  }
  function isBoolean(value) {
    return value === true || value === false || isObjectLike(value) && getTag(value) == "[object Boolean]";
  }
  function isObject(value) {
    return typeof value === "object";
  }
  function isObjectLike(value) {
    return isObject(value) && value !== null;
  }
  function isDefined(value) {
    return value !== void 0 && value !== null;
  }
  function isBlank(value) {
    return !value.trim().length;
  }
  function getTag(value) {
    return value == null ? value === void 0 ? "[object Undefined]" : "[object Null]" : Object.prototype.toString.call(value);
  }
  var INCORRECT_INDEX_TYPE = "Incorrect 'index' type";
  var INVALID_DOC_INDEX = "Invalid doc index: must be a non-negative integer within the bounds of the docs array";
  var LOGICAL_SEARCH_INVALID_QUERY_FOR_KEY = (key) => `Invalid value for key ${key}`;
  var PATTERN_LENGTH_TOO_LARGE = (max) => `Pattern length exceeds max of ${max}.`;
  var MISSING_KEY_PROPERTY = (name) => `Missing ${name} property in key`;
  var INVALID_KEY_WEIGHT_VALUE = (key) => `Property 'weight' in key '${key}' must be a positive integer`;
  var FUSE_MATCH_TOKEN_SEARCH_UNSUPPORTED = "Fuse.match does not support useTokenSearch: token search requires corpus-level statistics (df, fieldCount) that a one-off string comparison does not have. Use new Fuse(...).search(...) instead.";
  var hasOwn = Object.prototype.hasOwnProperty;
  var KeyStore = class {
    constructor(keys) {
      this._keys = [];
      this._keyMap = {};
      let totalWeight = 0;
      keys.forEach((key) => {
        const obj = createKey(key);
        this._keys.push(obj);
        this._keyMap[obj.id] = obj;
        totalWeight += obj.weight;
      });
      this._keys.forEach((key) => {
        key.weight /= totalWeight;
      });
    }
    get(keyId) {
      return this._keyMap[keyId];
    }
    keys() {
      return this._keys;
    }
    toJSON() {
      return JSON.stringify(this._keys);
    }
  };
  function createKey(key) {
    let path = null;
    let id = null;
    let src = null;
    let weight = 1;
    let getFn = null;
    if (isString(key) || isArray(key)) {
      src = key;
      path = createKeyPath(key);
      id = createKeyId(key);
    } else {
      if (!hasOwn.call(key, "name")) throw new Error(MISSING_KEY_PROPERTY("name"));
      const name = key.name;
      src = name;
      if (hasOwn.call(key, "weight") && key.weight !== void 0) {
        weight = key.weight;
        if (weight <= 0) throw new Error(INVALID_KEY_WEIGHT_VALUE(createKeyId(name)));
      }
      path = createKeyPath(name);
      id = createKeyId(name);
      getFn = key.getFn ?? null;
    }
    return {
      path,
      id,
      weight,
      src,
      getFn
    };
  }
  function createKeyPath(key) {
    return isArray(key) ? key : key.split(".");
  }
  function createKeyId(key) {
    return isArray(key) ? key.join(".") : key;
  }
  function get(obj, path) {
    const list = [];
    let arr = false;
    const deepGet = (obj2, path2, index, arrayIndex) => {
      if (!isDefined(obj2)) return;
      if (!path2[index]) list.push(arrayIndex !== void 0 ? {
        v: obj2,
        i: arrayIndex
      } : obj2);
      else {
        const value = obj2[path2[index]];
        if (!isDefined(value)) return;
        if (index === path2.length - 1 && (isString(value) || isNumber(value) || isBoolean(value) || typeof value === "bigint")) list.push(arrayIndex !== void 0 ? {
          v: toString(value),
          i: arrayIndex
        } : toString(value));
        else if (isArray(value)) {
          arr = true;
          for (let i = 0, len = value.length; i < len; i += 1) deepGet(value[i], path2, index + 1, i);
        } else if (path2.length) deepGet(value, path2, index + 1, arrayIndex);
      }
    };
    deepGet(obj, isString(path) ? path.split(".") : path, 0);
    return arr ? list : list[0];
  }
  var MatchOptions = {
    includeMatches: false,
    findAllMatches: false,
    minMatchCharLength: 1
  };
  var BasicOptions = {
    isCaseSensitive: false,
    ignoreDiacritics: false,
    includeScore: false,
    keys: [],
    shouldSort: true,
    sortFn: (a, b) => a.score === b.score ? a.idx < b.idx ? -1 : 1 : a.score < b.score ? -1 : 1
  };
  var FuzzyOptions = {
    location: 0,
    threshold: 0.6,
    distance: 100
  };
  var AdvancedOptions = {
    useExtendedSearch: false,
    useTokenSearch: false,
    tokenize: void 0,
    tokenMatch: "any",
    getFn: get,
    ignoreLocation: false,
    ignoreFieldNorm: false,
    fieldNormWeight: 1
  };
  var Config = Object.freeze({
    ...BasicOptions,
    ...MatchOptions,
    ...FuzzyOptions,
    ...AdvancedOptions
  });
  function isWordSeparator(code) {
    return code >= 9 && code <= 13 || code === 32 || code === 160;
  }
  function norm(weight = 1, mantissa = 3) {
    const cache = /* @__PURE__ */ new Map();
    const m = Math.pow(10, mantissa);
    return {
      get(value) {
        let numTokens = 0;
        let inWord = false;
        for (let i = 0; i < value.length; i++) if (!isWordSeparator(value.charCodeAt(i))) {
          if (!inWord) {
            numTokens++;
            inWord = true;
          }
        } else inWord = false;
        if (numTokens === 0) numTokens = 1;
        if (cache.has(numTokens)) return cache.get(numTokens);
        const n = Math.round(m / Math.pow(numTokens, 0.5 * weight)) / m;
        cache.set(numTokens, n);
        return n;
      },
      clear() {
        cache.clear();
      }
    };
  }
  var FuseIndex = class {
    constructor({ getFn = Config.getFn, fieldNormWeight = Config.fieldNormWeight } = {}) {
      this.norm = norm(fieldNormWeight, 3);
      this.getFn = getFn;
      this.isCreated = false;
      this.docs = [];
      this.keys = [];
      this._keysMap = {};
      this.setIndexRecords();
    }
    setSources(docs = []) {
      this.docs = docs;
    }
    setIndexRecords(records = []) {
      this.records = records;
    }
    setKeys(keys = []) {
      this.keys = keys;
      this._keysMap = {};
      keys.forEach((key, idx) => {
        this._keysMap[key.id] = idx;
      });
    }
    create() {
      if (this.isCreated || !this.docs.length) return;
      this.isCreated = true;
      const len = this.docs.length;
      this.records = new Array(len);
      let recordCount = 0;
      if (isString(this.docs[0])) for (let i = 0; i < len; i++) {
        const record = this._createStringRecord(this.docs[i], i);
        if (record) this.records[recordCount++] = record;
      }
      else for (let i = 0; i < len; i++) this.records[recordCount++] = this._createObjectRecord(this.docs[i], i);
      this.records.length = recordCount;
      this.norm.clear();
    }
    add(doc, docIndex) {
      if (!Number.isInteger(docIndex) || docIndex < 0) throw new Error(INVALID_DOC_INDEX);
      if (isString(doc)) {
        const record2 = this._createStringRecord(doc, docIndex);
        if (record2) this.records.push(record2);
        return record2;
      }
      const record = this._createObjectRecord(doc, docIndex);
      this.records.push(record);
      return record;
    }
    removeAt(idx) {
      if (!Number.isInteger(idx) || idx < 0) throw new Error(INVALID_DOC_INDEX);
      for (let i = 0, len = this.records.length; i < len; i += 1) if (this.records[i].i === idx) {
        this.records.splice(i, 1);
        break;
      }
      for (let i = 0, len = this.records.length; i < len; i += 1) if (this.records[i].i > idx) this.records[i].i -= 1;
    }
    removeAll(indices) {
      const toRemove = /* @__PURE__ */ new Set();
      for (const v of indices) if (Number.isInteger(v) && v >= 0) toRemove.add(v);
      if (toRemove.size === 0) return;
      this.records = this.records.filter((r) => !toRemove.has(r.i));
      const sorted = Array.from(toRemove).sort((a, b) => a - b);
      for (const record of this.records) {
        let lo = 0;
        let hi = sorted.length;
        while (lo < hi) {
          const mid = lo + hi >>> 1;
          if (sorted[mid] < record.i) lo = mid + 1;
          else hi = mid;
        }
        record.i -= lo;
      }
    }
    getValueForItemAtKeyId(item, keyId) {
      return item[this._keysMap[keyId]];
    }
    size() {
      return this.records.length;
    }
    _createStringRecord(doc, docIndex) {
      if (!isDefined(doc) || isBlank(doc)) return null;
      return {
        v: doc,
        i: docIndex,
        n: this.norm.get(doc)
      };
    }
    _createObjectRecord(doc, docIndex) {
      const record = {
        i: docIndex,
        $: {}
      };
      for (let keyIndex = 0, keyLen = this.keys.length; keyIndex < keyLen; keyIndex++) {
        const key = this.keys[keyIndex];
        const value = key.getFn ? key.getFn(doc) : this.getFn(doc, key.path);
        if (!isDefined(value)) continue;
        if (isArray(value)) {
          const subRecords = [];
          for (let i = 0, len = value.length; i < len; i += 1) {
            const item = value[i];
            if (!isDefined(item)) continue;
            if (isString(item)) {
              if (!isBlank(item)) {
                const subRecord = {
                  v: item,
                  i,
                  n: this.norm.get(item)
                };
                subRecords.push(subRecord);
              }
            } else if (isDefined(item.v)) {
              const text = isString(item.v) ? item.v : toString(item.v);
              if (!isBlank(text)) {
                const subRecord = {
                  v: text,
                  i: item.i,
                  n: this.norm.get(text)
                };
                subRecords.push(subRecord);
              }
            }
          }
          record.$[keyIndex] = subRecords;
        } else if (isString(value) && !isBlank(value)) {
          const subRecord = {
            v: value,
            n: this.norm.get(value)
          };
          record.$[keyIndex] = subRecord;
        }
      }
      return record;
    }
    toJSON() {
      return {
        keys: this.keys.map(({ getFn, ...key }) => key),
        records: this.records
      };
    }
  };
  function createIndex(keys, docs, { getFn = Config.getFn, fieldNormWeight = Config.fieldNormWeight } = {}) {
    const myIndex = new FuseIndex({
      getFn,
      fieldNormWeight
    });
    myIndex.setKeys(keys.map(createKey));
    myIndex.setSources(docs);
    myIndex.create();
    return myIndex;
  }
  function parseIndex(data, { getFn = Config.getFn, fieldNormWeight = Config.fieldNormWeight } = {}) {
    const { keys, records } = data;
    const myIndex = new FuseIndex({
      getFn,
      fieldNormWeight
    });
    myIndex.setKeys(keys);
    myIndex.setIndexRecords(records);
    return myIndex;
  }
  function convertMaskToIndices(matchmask = [], minMatchCharLength = Config.minMatchCharLength) {
    const indices = [];
    let start = -1;
    let end = -1;
    let i = 0;
    for (let len = matchmask.length; i < len; i += 1) {
      const match = matchmask[i];
      if (match && start === -1) start = i;
      else if (!match && start !== -1) {
        end = i - 1;
        if (end - start + 1 >= minMatchCharLength) indices.push([start, end]);
        start = -1;
      }
    }
    if (matchmask[i - 1] && i - start >= minMatchCharLength) indices.push([start, i - 1]);
    return indices;
  }
  function search(text, pattern, patternAlphabet, { location: location2 = Config.location, distance = Config.distance, threshold = Config.threshold, findAllMatches = Config.findAllMatches, minMatchCharLength = Config.minMatchCharLength, includeMatches = Config.includeMatches, ignoreLocation = Config.ignoreLocation } = {}) {
    if (pattern.length > 32) throw new Error(PATTERN_LENGTH_TOO_LARGE(32));
    const patternLen = pattern.length;
    const textLen = text.length;
    const expectedLocation = Math.max(0, Math.min(location2, textLen));
    let currentThreshold = threshold;
    let bestLocation = expectedLocation;
    const calcScore = (errors, currentLocation) => {
      const accuracy = errors / patternLen;
      if (ignoreLocation) return accuracy;
      const proximity = Math.abs(expectedLocation - currentLocation);
      if (!distance) return proximity ? 1 : accuracy;
      return accuracy + proximity / distance;
    };
    const computeMatches = minMatchCharLength > 1 || includeMatches;
    const matchMask = computeMatches ? Array(textLen) : [];
    let index;
    while ((index = text.indexOf(pattern, bestLocation)) > -1) {
      const score = calcScore(0, index);
      currentThreshold = Math.min(score, currentThreshold);
      bestLocation = index + patternLen;
      if (computeMatches) {
        let i = 0;
        while (i < patternLen) {
          matchMask[index + i] = 1;
          i += 1;
        }
      }
    }
    bestLocation = -1;
    let lastBitArr = [];
    let finalScore = 1;
    let bestErrors = 0;
    let binMax = patternLen + textLen;
    const mask = 1 << patternLen - 1;
    for (let i = 0; i < patternLen; i += 1) {
      let binMin = 0;
      let binMid = binMax;
      while (binMin < binMid) {
        if (calcScore(i, expectedLocation + binMid) <= currentThreshold) binMin = binMid;
        else binMax = binMid;
        binMid = Math.floor((binMax - binMin) / 2 + binMin);
      }
      binMax = binMid;
      let start = Math.max(1, expectedLocation - binMid + 1);
      const finish = findAllMatches ? textLen : Math.min(expectedLocation + binMid, textLen) + patternLen;
      const bitArr = Array(finish + 2);
      bitArr[finish + 1] = (1 << i) - 1;
      for (let j = finish; j >= start; j -= 1) {
        const currentLocation = j - 1;
        const charMatch = patternAlphabet[text[currentLocation]];
        bitArr[j] = (bitArr[j + 1] << 1 | 1) & charMatch;
        if (i) bitArr[j] |= (lastBitArr[j + 1] | lastBitArr[j]) << 1 | 1 | lastBitArr[j + 1];
        if (bitArr[j] & mask) {
          finalScore = calcScore(i, currentLocation);
          if (finalScore <= currentThreshold) {
            currentThreshold = finalScore;
            bestLocation = currentLocation;
            bestErrors = i;
            if (bestLocation <= expectedLocation) break;
            start = Math.max(1, 2 * expectedLocation - bestLocation);
          }
        }
      }
      if (calcScore(i + 1, expectedLocation) > currentThreshold) break;
      lastBitArr = bitArr;
    }
    if (computeMatches && bestLocation >= 0) {
      const matchEnd = Math.min(textLen - 1, bestLocation + patternLen - 1 + bestErrors);
      for (let k = bestLocation; k <= matchEnd; k += 1) if (patternAlphabet[text[k]]) matchMask[k] = 1;
    }
    const result = {
      isMatch: bestLocation >= 0,
      score: Math.max(1e-3, finalScore)
    };
    if (computeMatches) {
      const indices = convertMaskToIndices(matchMask, minMatchCharLength);
      if (!indices.length) result.isMatch = false;
      else if (includeMatches) result.indices = indices;
    }
    return result;
  }
  function createPatternAlphabet(pattern) {
    const mask = {};
    for (let i = 0, len = pattern.length; i < len; i += 1) {
      const char = pattern.charAt(i);
      mask[char] = (mask[char] || 0) | 1 << len - i - 1;
    }
    return mask;
  }
  function mergeIndices(indices) {
    if (indices.length <= 1) return indices;
    indices.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [indices[0]];
    for (let i = 1, len = indices.length; i < len; i += 1) {
      const last = merged[merged.length - 1];
      const curr = indices[i];
      if (curr[0] <= last[1] + 1) last[1] = Math.max(last[1], curr[1]);
      else merged.push(curr);
    }
    return merged;
  }
  var NON_DECOMPOSABLE_MAP = {
    "ł": "l",
    "Ł": "L",
    "đ": "d",
    "Đ": "D",
    "ø": "o",
    "Ø": "O",
    "ħ": "h",
    "Ħ": "H",
    "ŧ": "t",
    "Ŧ": "T",
    "ı": "i",
    "ß": "ss"
  };
  var NON_DECOMPOSABLE_RE = new RegExp("[" + Object.keys(NON_DECOMPOSABLE_MAP).join("") + "]", "g");
  var stripDiacritics = typeof String.prototype.normalize === "function" ? (str) => str.normalize("NFD").replace(/[\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u0711\u0730-\u074A\u07A6-\u07B0\u07EB-\u07F3\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u08D3-\u08E1\u08E3-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962\u0963\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7\u09E2\u09E3\u09FE\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A70\u0A71\u0A75\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2\u0AE3\u0AFA-\u0AFF\u0B01-\u0B03\u0B3C\u0B3E-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B56\u0B57\u0B62\u0B63\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0C00-\u0C04\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C81-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CE2\u0CE3\u0D00-\u0D03\u0D3B\u0D3C\u0D3E-\u0D44\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D62\u0D63\u0D82\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DF2\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0EB1\u0EB4-\u0EB9\u0EBB\u0EBC\u0EC8-\u0ECD\u0F18\u0F19\u0F35\u0F37\u0F39\u0F3E\u0F3F\u0F71-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102B-\u103E\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F\u109A-\u109D\u135D-\u135F\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17B4-\u17D3\u17DD\u180B-\u180D\u1885\u1886\u18A9\u1920-\u192B\u1930-\u193B\u1A17-\u1A1B\u1A55-\u1A5E\u1A60-\u1A7C\u1A7F\u1AB0-\u1ABE\u1B00-\u1B04\u1B34-\u1B44\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BE6-\u1BF3\u1C24-\u1C37\u1CD0-\u1CD2\u1CD4-\u1CE8\u1CED\u1CF2-\u1CF4\u1CF7-\u1CF9\u1DC0-\u1DF9\u1DFB-\u1DFF\u20D0-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099\u309A\uA66F-\uA672\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA880\uA881\uA8B4-\uA8C5\uA8E0-\uA8F1\uA8FF\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9E5\uAA29-\uAA36\uAA43\uAA4C\uAA4D\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5\uAAF6\uABE3-\uABEA\uABEC\uABED\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F]/g, "").replace(NON_DECOMPOSABLE_RE, (ch) => NON_DECOMPOSABLE_MAP[ch]) : (str) => str;
  var BitapSearch = class {
    constructor(pattern, { location: location2 = Config.location, threshold = Config.threshold, distance = Config.distance, includeMatches = Config.includeMatches, findAllMatches = Config.findAllMatches, minMatchCharLength = Config.minMatchCharLength, isCaseSensitive = Config.isCaseSensitive, ignoreDiacritics = Config.ignoreDiacritics, ignoreLocation = Config.ignoreLocation } = {}) {
      this.options = {
        location: location2,
        threshold,
        distance,
        includeMatches,
        findAllMatches,
        minMatchCharLength,
        isCaseSensitive,
        ignoreDiacritics,
        ignoreLocation
      };
      pattern = isCaseSensitive ? pattern : pattern.toLowerCase();
      pattern = ignoreDiacritics ? stripDiacritics(pattern) : pattern;
      this.pattern = pattern;
      this.chunks = [];
      if (!this.pattern.length) return;
      const addChunk = (pattern2, startIndex) => {
        this.chunks.push({
          pattern: pattern2,
          alphabet: createPatternAlphabet(pattern2),
          startIndex
        });
      };
      const len = this.pattern.length;
      if (len > 32) {
        let i = 0;
        const remainder = len % 32;
        const end = len - remainder;
        while (i < end) {
          addChunk(this.pattern.substr(i, 32), i);
          i += 32;
        }
        if (remainder) {
          const startIndex = len - 32;
          addChunk(this.pattern.substr(startIndex), startIndex);
        }
      } else addChunk(this.pattern, 0);
    }
    searchIn(text) {
      const { isCaseSensitive, ignoreDiacritics, includeMatches } = this.options;
      text = isCaseSensitive ? text : text.toLowerCase();
      text = ignoreDiacritics ? stripDiacritics(text) : text;
      if (this.pattern === text) {
        if (text.length < this.options.minMatchCharLength) return {
          isMatch: false,
          score: 1
        };
        const result2 = {
          isMatch: true,
          score: 0
        };
        if (includeMatches) result2.indices = [[0, text.length - 1]];
        return result2;
      }
      const { location: location2, distance, threshold, findAllMatches, minMatchCharLength, ignoreLocation } = this.options;
      const allIndices = [];
      let totalScore = 0;
      let hasMatches = false;
      this.chunks.forEach(({ pattern, alphabet, startIndex }) => {
        const { isMatch, score, indices } = search(text, pattern, alphabet, {
          location: location2 + startIndex,
          distance,
          threshold,
          findAllMatches,
          minMatchCharLength,
          includeMatches,
          ignoreLocation
        });
        if (isMatch) hasMatches = true;
        totalScore += score;
        if (isMatch && indices) allIndices.push(...indices);
      });
      const result = {
        isMatch: hasMatches,
        score: hasMatches ? totalScore / this.chunks.length : 1
      };
      if (hasMatches && includeMatches) result.indices = mergeIndices(allIndices);
      return result;
    }
  };
  var MULTI_MATCH_TYPES = /* @__PURE__ */ new Set(["fuzzy", "include"]);
  function isInverse(type) {
    return type.startsWith("inverse");
  }
  var matchers = [
    {
      type: "exact",
      multiRegex: /^="(.*)"$/,
      singleRegex: /^=(.*)$/,
      create: (pattern) => ({
        type: "exact",
        search(text) {
          const isMatch = text === pattern;
          return {
            isMatch,
            score: isMatch ? 0 : 1,
            indices: [0, pattern.length - 1]
          };
        }
      })
    },
    {
      type: "include",
      multiRegex: /^'"(.*)"$/,
      singleRegex: /^'(.*)$/,
      create: (pattern) => ({
        type: "include",
        search(text) {
          let location2 = 0;
          let index;
          const indices = [];
          const patternLen = pattern.length;
          while ((index = text.indexOf(pattern, location2)) > -1) {
            location2 = index + patternLen;
            indices.push([index, location2 - 1]);
          }
          const isMatch = !!indices.length;
          return {
            isMatch,
            score: isMatch ? 0 : 1,
            indices
          };
        }
      })
    },
    {
      type: "prefix-exact",
      multiRegex: /^\^"(.*)"$/,
      singleRegex: /^\^(.*)$/,
      create: (pattern) => ({
        type: "prefix-exact",
        search(text) {
          const isMatch = text.startsWith(pattern);
          return {
            isMatch,
            score: isMatch ? 0 : 1,
            indices: [0, pattern.length - 1]
          };
        }
      })
    },
    {
      type: "inverse-prefix-exact",
      multiRegex: /^!\^"(.*)"$/,
      singleRegex: /^!\^(.*)$/,
      create: (pattern) => ({
        type: "inverse-prefix-exact",
        search(text) {
          const isMatch = !text.startsWith(pattern);
          return {
            isMatch,
            score: isMatch ? 0 : 1,
            indices: [0, text.length - 1]
          };
        }
      })
    },
    {
      type: "inverse-suffix-exact",
      multiRegex: /^!"(.*)"\$$/,
      singleRegex: /^!(.*)\$$/,
      create: (pattern) => ({
        type: "inverse-suffix-exact",
        search(text) {
          const isMatch = !text.endsWith(pattern);
          return {
            isMatch,
            score: isMatch ? 0 : 1,
            indices: [0, text.length - 1]
          };
        }
      })
    },
    {
      type: "suffix-exact",
      multiRegex: /^"(.*)"\$$/,
      singleRegex: /^(.*)\$$/,
      create: (pattern) => ({
        type: "suffix-exact",
        search(text) {
          const isMatch = text.endsWith(pattern);
          return {
            isMatch,
            score: isMatch ? 0 : 1,
            indices: [text.length - pattern.length, text.length - 1]
          };
        }
      })
    },
    {
      type: "inverse-exact",
      multiRegex: /^!"(.*)"$/,
      singleRegex: /^!(.*)$/,
      create: (pattern) => ({
        type: "inverse-exact",
        search(text) {
          const isMatch = text.indexOf(pattern) === -1;
          return {
            isMatch,
            score: isMatch ? 0 : 1,
            indices: [0, text.length - 1]
          };
        }
      })
    },
    {
      type: "fuzzy",
      multiRegex: /^"(.*)"$/,
      singleRegex: /^(.*)$/,
      create: (pattern, options = {}) => {
        const bitap = new BitapSearch(pattern, {
          location: options.location ?? Config.location,
          threshold: options.threshold ?? Config.threshold,
          distance: options.distance ?? Config.distance,
          includeMatches: options.includeMatches ?? Config.includeMatches,
          findAllMatches: options.findAllMatches ?? Config.findAllMatches,
          minMatchCharLength: options.minMatchCharLength ?? Config.minMatchCharLength,
          isCaseSensitive: options.isCaseSensitive ?? Config.isCaseSensitive,
          ignoreDiacritics: options.ignoreDiacritics ?? Config.ignoreDiacritics,
          ignoreLocation: options.ignoreLocation ?? Config.ignoreLocation
        });
        return {
          type: "fuzzy",
          search(text) {
            return bitap.searchIn(text);
          }
        };
      }
    }
  ];
  var matchersLen = matchers.length;
  var ESCAPED_PIPE = "\0";
  var OR_TOKEN = "|";
  function tokenize(pattern) {
    const tokens = [];
    const len = pattern.length;
    let i = 0;
    while (i < len) {
      while (i < len && pattern[i] === " ") i++;
      if (i >= len) break;
      let j = i;
      while (j < len && pattern[j] !== " " && pattern[j] !== '"') j++;
      if (j < len && pattern[j] === '"') {
        j++;
        while (j < len) {
          if (pattern[j] === '"') {
            const next = j + 1;
            if (next >= len || pattern[next] === " ") {
              j++;
              break;
            }
            if (pattern[next] === "$" && (next + 1 >= len || pattern[next + 1] === " ")) {
              j += 2;
              break;
            }
          }
          j++;
        }
        tokens.push(pattern.substring(i, j));
        i = j;
      } else {
        while (j < len && pattern[j] !== " ") j++;
        tokens.push(pattern.substring(i, j));
        i = j;
      }
    }
    return tokens;
  }
  function getMatch(pattern, exp) {
    const matches = pattern.match(exp);
    return matches ? matches[1] : null;
  }
  function parseQuery(pattern, options = {}) {
    return pattern.replace(/\\\|/g, ESCAPED_PIPE).split(OR_TOKEN).map((item) => {
      const query = tokenize(item.replace(/\u0000/g, "|").trim()).filter((item2) => item2 && !!item2.trim());
      const results = [];
      for (let i = 0, len = query.length; i < len; i += 1) {
        const queryItem = query[i];
        let found = false;
        let idx = -1;
        while (!found && ++idx < matchersLen) {
          const def = matchers[idx];
          const token = getMatch(queryItem, def.multiRegex);
          if (token) {
            results.push(def.create(token, options));
            found = true;
          }
        }
        if (found) continue;
        idx = -1;
        while (++idx < matchersLen) {
          const def = matchers[idx];
          const token = getMatch(queryItem, def.singleRegex);
          if (token) {
            results.push(def.create(token, options));
            break;
          }
        }
      }
      return results;
    });
  }
  var ExtendedSearch = class {
    constructor(pattern, { isCaseSensitive = Config.isCaseSensitive, ignoreDiacritics = Config.ignoreDiacritics, includeMatches = Config.includeMatches, minMatchCharLength = Config.minMatchCharLength, ignoreLocation = Config.ignoreLocation, findAllMatches = Config.findAllMatches, location: location2 = Config.location, threshold = Config.threshold, distance = Config.distance } = {}) {
      this.query = null;
      this.options = {
        isCaseSensitive,
        ignoreDiacritics,
        includeMatches,
        minMatchCharLength,
        findAllMatches,
        ignoreLocation,
        location: location2,
        threshold,
        distance
      };
      pattern = isCaseSensitive ? pattern : pattern.toLowerCase();
      pattern = ignoreDiacritics ? stripDiacritics(pattern) : pattern;
      this.pattern = pattern;
      this.query = parseQuery(this.pattern, this.options);
    }
    static condition(_, options) {
      return options.useExtendedSearch;
    }
    searchIn(text) {
      const query = this.query;
      if (!query) return {
        isMatch: false,
        score: 1
      };
      const { includeMatches, isCaseSensitive, ignoreDiacritics } = this.options;
      text = isCaseSensitive ? text : text.toLowerCase();
      text = ignoreDiacritics ? stripDiacritics(text) : text;
      let numMatches = 0;
      const allIndices = [];
      let totalScore = 0;
      let hasInverse = false;
      for (let i = 0, qLen = query.length; i < qLen; i += 1) {
        const searchers = query[i];
        allIndices.length = 0;
        numMatches = 0;
        hasInverse = false;
        for (let j = 0, pLen = searchers.length; j < pLen; j += 1) {
          const matcher = searchers[j];
          const { isMatch, indices, score } = matcher.search(text);
          if (isMatch) {
            numMatches += 1;
            totalScore += score;
            if (isInverse(matcher.type)) hasInverse = true;
            if (includeMatches) if (MULTI_MATCH_TYPES.has(matcher.type)) allIndices.push(...indices);
            else allIndices.push(indices);
          } else {
            totalScore = 0;
            numMatches = 0;
            allIndices.length = 0;
            hasInverse = false;
            break;
          }
        }
        if (numMatches) {
          const result = {
            isMatch: true,
            score: totalScore / numMatches
          };
          if (hasInverse) result.hasInverse = true;
          if (includeMatches) result.indices = mergeIndices(allIndices);
          return result;
        }
      }
      return {
        isMatch: false,
        score: 1
      };
    }
  };
  var registeredSearchers = [];
  function register(...args) {
    registeredSearchers.push(...args);
  }
  function createSearcher(pattern, options) {
    for (let i = 0, len = registeredSearchers.length; i < len; i += 1) {
      const searcherClass = registeredSearchers[i];
      if (searcherClass.condition(pattern, options)) return new searcherClass(pattern, options);
    }
    return new BitapSearch(pattern, options);
  }
  var LogicalOperator = {
    AND: "$and",
    OR: "$or"
  };
  var KeyType = {
    PATH: "$path",
    PATTERN: "$val"
  };
  var isExpression = (query) => !!(query[LogicalOperator.AND] || query[LogicalOperator.OR]);
  var isPath = (query) => !!query[KeyType.PATH];
  var isLeaf = (query) => !isArray(query) && isObject(query) && !isExpression(query);
  var convertToExplicit = (query) => ({ [LogicalOperator.AND]: Object.keys(query).map((key) => ({ [key]: query[key] })) });
  function parse(query, options, { auto = true } = {}) {
    const next = (query2) => {
      if (isString(query2)) {
        const obj = {
          keyId: null,
          pattern: query2
        };
        if (auto) obj.searcher = createSearcher(query2, options);
        return obj;
      }
      const keys = Object.keys(query2);
      const isQueryPath = isPath(query2);
      if (!isQueryPath && keys.length > 1 && !isExpression(query2)) return next(convertToExplicit(query2));
      if (isLeaf(query2)) {
        const key = isQueryPath ? query2[KeyType.PATH] : keys[0];
        const pattern = isQueryPath ? query2[KeyType.PATTERN] : query2[key];
        if (!isString(pattern)) throw new Error(LOGICAL_SEARCH_INVALID_QUERY_FOR_KEY(key));
        const obj = {
          keyId: createKeyId(key),
          pattern
        };
        if (auto) obj.searcher = createSearcher(pattern, options);
        return obj;
      }
      const node = {
        children: [],
        operator: keys[0]
      };
      keys.forEach((key) => {
        const value = query2[key];
        if (isArray(value)) value.forEach((item) => {
          node.children.push(next(item));
        });
      });
      return node;
    };
    if (!isExpression(query)) query = convertToExplicit(query);
    return next(query);
  }
  function computeScoreSingle(matches, { ignoreFieldNorm = Config.ignoreFieldNorm }) {
    let totalScore = 1;
    matches.forEach(({ key, norm: norm2, score }) => {
      const weight = key ? key.weight : null;
      totalScore *= Math.pow(score === 0 && weight ? Number.EPSILON : score, (weight || 1) * (ignoreFieldNorm ? 1 : norm2));
    });
    return totalScore;
  }
  function computeScore(results, { ignoreFieldNorm = Config.ignoreFieldNorm }) {
    results.forEach((result) => {
      result.score = computeScoreSingle(result.matches, { ignoreFieldNorm });
    });
  }
  var MaxHeap = class {
    constructor(limit, comparator) {
      this.limit = limit;
      this.heap = [];
      this.comparator = comparator;
    }
    get size() {
      return this.heap.length;
    }
    insert(item) {
      if (this.size < this.limit) {
        this.heap.push(item);
        this._bubbleUp(this.size - 1);
      } else if (this.comparator(item, this.heap[0]) < 0) {
        this.heap[0] = item;
        this._sinkDown(0);
      }
    }
    extractSorted() {
      return this.heap.sort(this.comparator);
    }
    _bubbleUp(i) {
      const heap = this.heap;
      while (i > 0) {
        const parent = i - 1 >> 1;
        if (this.comparator(heap[i], heap[parent]) <= 0) break;
        const tmp = heap[i];
        heap[i] = heap[parent];
        heap[parent] = tmp;
        i = parent;
      }
    }
    _sinkDown(i) {
      const heap = this.heap;
      const len = heap.length;
      let largest = i;
      do {
        i = largest;
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        if (left < len && this.comparator(heap[left], heap[largest]) > 0) largest = left;
        if (right < len && this.comparator(heap[right], heap[largest]) > 0) largest = right;
        if (largest !== i) {
          const tmp = heap[i];
          heap[i] = heap[largest];
          heap[largest] = tmp;
        }
      } while (largest !== i);
    }
  };
  function formatMatches(result) {
    const matches = [];
    result.matches.forEach((match) => {
      if (!isDefined(match.indices) || !match.indices.length) return;
      const obj = {
        indices: match.indices,
        value: match.value
      };
      if (match.key) obj.key = match.key.id;
      if (match.idx > -1) obj.refIndex = match.idx;
      matches.push(obj);
    });
    return matches;
  }
  function format(results, docs, { includeMatches = Config.includeMatches, includeScore = Config.includeScore } = {}) {
    return results.map((result) => {
      const { idx } = result;
      const data = {
        item: docs[idx],
        refIndex: idx
      };
      if (includeMatches) data.matches = formatMatches(result);
      if (includeScore) data.score = result.score;
      return data;
    });
  }
  var DEFAULT_TOKEN = /[\p{L}\p{M}\p{N}_]+/gu;
  var warned = /* @__PURE__ */ new WeakSet();
  function warnNonGlobal(regex) {
    if (!warned.has(regex)) {
      warned.add(regex);
      console.warn(`[Fuse] tokenize regex ${regex} lacks the global flag; only the first match per text will be returned. Add the 'g' flag.`);
    }
  }
  function resolveTokenize(tokenize2) {
    if (typeof tokenize2 === "function") {
      let validated = false;
      return (text) => {
        const result = tokenize2(text);
        if (!validated) {
          validated = true;
          if (!Array.isArray(result) || result.some((t) => typeof t !== "string")) throw new Error(`[Fuse] tokenize function must return string[]; received ${Array.isArray(result) ? "array containing non-strings" : typeof result}.`);
        }
        return result;
      };
    }
    if (tokenize2 instanceof RegExp) {
      if (!tokenize2.global) warnNonGlobal(tokenize2);
      return (text) => text.match(tokenize2) || [];
    }
    return (text) => text.match(DEFAULT_TOKEN) || [];
  }
  function createAnalyzer({ isCaseSensitive = false, ignoreDiacritics = false, tokenize: tokenize2 } = {}) {
    const tokenizeFn = resolveTokenize(tokenize2);
    return { tokenize(text) {
      if (!isCaseSensitive) text = text.toLowerCase();
      if (ignoreDiacritics) text = stripDiacritics(text);
      return tokenizeFn(text);
    } };
  }
  var TokenSearch = class {
    static condition(_, options) {
      return options.useTokenSearch;
    }
    constructor(pattern, options) {
      this.options = options;
      this.analyzer = createAnalyzer({
        isCaseSensitive: options.isCaseSensitive,
        ignoreDiacritics: options.ignoreDiacritics,
        tokenize: options.tokenize
      });
      const queryTerms = this.analyzer.tokenize(pattern);
      const { df, fieldCount } = options._invertedIndex;
      this.termSearchers = [];
      this.idfWeights = [];
      for (const term of queryTerms) {
        this.termSearchers.push(new BitapSearch(term, {
          location: options.location,
          threshold: options.threshold,
          distance: options.distance,
          includeMatches: options.includeMatches,
          findAllMatches: options.findAllMatches,
          minMatchCharLength: options.minMatchCharLength,
          isCaseSensitive: options.isCaseSensitive,
          ignoreDiacritics: options.ignoreDiacritics,
          ignoreLocation: true
        }));
        const docFreq = df.get(term) || 0;
        const idf = Math.log(1 + (fieldCount - docFreq + 0.5) / (docFreq + 0.5));
        this.idfWeights.push(idf);
      }
      this.combineAll = options.tokenMatch === "all";
      this.numTerms = this.termSearchers.length;
      this.useMask = this.numTerms <= 31;
    }
    searchIn(text) {
      if (!this.termSearchers.length) return {
        isMatch: false,
        score: 1
      };
      const allIndices = [];
      let weightedScore = 0;
      let maxPossibleScore = 0;
      let matchedCount = 0;
      let matchedMask = 0;
      const matchedTerms = this.combineAll && !this.useMask ? /* @__PURE__ */ new Set() : null;
      for (let i = 0; i < this.termSearchers.length; i++) {
        const result = this.termSearchers[i].searchIn(text);
        const idf = this.idfWeights[i];
        maxPossibleScore += idf;
        if (result.isMatch) {
          matchedCount++;
          weightedScore += idf * (1 - result.score);
          if (result.indices) allIndices.push(...result.indices);
          if (this.combineAll) if (this.useMask) matchedMask |= 1 << i;
          else matchedTerms.add(i);
        }
      }
      if (matchedCount === 0) return {
        isMatch: false,
        score: 1
      };
      const normalized = maxPossibleScore > 0 ? 1 - weightedScore / maxPossibleScore : 0;
      const searchResult = {
        isMatch: true,
        score: Math.max(1e-3, normalized)
      };
      if (this.options.includeMatches && allIndices.length) searchResult.indices = mergeIndices(allIndices);
      if (this.combineAll) {
        if (this.useMask) searchResult.matchedMask = matchedMask;
        else searchResult.matchedTerms = matchedTerms;
        searchResult.termCount = this.numTerms;
      }
      return searchResult;
    }
  };
  function addField(index, text, docIdx, analyzer) {
    const tokens = analyzer.tokenize(text);
    if (!tokens.length) return;
    index.fieldCount++;
    index.docFieldCount.set(docIdx, (index.docFieldCount.get(docIdx) || 0) + 1);
    const distinctTerms = new Set(tokens);
    let perDocTerms = index.docTermFieldHits.get(docIdx);
    if (!perDocTerms) {
      perDocTerms = /* @__PURE__ */ new Map();
      index.docTermFieldHits.set(docIdx, perDocTerms);
    }
    for (const term of distinctTerms) {
      perDocTerms.set(term, (perDocTerms.get(term) || 0) + 1);
      index.df.set(term, (index.df.get(term) || 0) + 1);
    }
  }
  function ingestRecord(index, record, keyCount, analyzer) {
    const { i: docIdx, v, $: fields } = record;
    if (v !== void 0) {
      addField(index, v, docIdx, analyzer);
      return;
    }
    if (!fields) return;
    for (let keyIdx = 0; keyIdx < keyCount; keyIdx++) {
      const value = fields[keyIdx];
      if (!value) continue;
      if (Array.isArray(value)) for (const sub of value) addField(index, sub.v, docIdx, analyzer);
      else addField(index, value.v, docIdx, analyzer);
    }
  }
  function buildInvertedIndex(records, keyCount, analyzer) {
    const index = {
      fieldCount: 0,
      df: /* @__PURE__ */ new Map(),
      docFieldCount: /* @__PURE__ */ new Map(),
      docTermFieldHits: /* @__PURE__ */ new Map()
    };
    for (const record of records) ingestRecord(index, record, keyCount, analyzer);
    return index;
  }
  function addToInvertedIndex(index, record, keyCount, analyzer) {
    ingestRecord(index, record, keyCount, analyzer);
  }
  function removeFromInvertedIndex(index, docIdx) {
    const fieldCount = index.docFieldCount.get(docIdx);
    if (fieldCount === void 0) return;
    index.fieldCount -= fieldCount;
    index.docFieldCount.delete(docIdx);
    const perDocTerms = index.docTermFieldHits.get(docIdx);
    if (!perDocTerms) return;
    for (const [term, hits] of perDocTerms) {
      const next = (index.df.get(term) || 0) - hits;
      if (next <= 0) index.df.delete(term);
      else index.df.set(term, next);
    }
    index.docTermFieldHits.delete(docIdx);
  }
  function removeAndShiftInvertedIndex(index, removedIndices) {
    if (removedIndices.length === 0) return;
    const sorted = Array.from(new Set(removedIndices)).sort((a, b) => a - b);
    for (const idx of sorted) removeFromInvertedIndex(index, idx);
    const shift = (oldIdx) => {
      let lo = 0;
      let hi = sorted.length;
      while (lo < hi) {
        const mid = lo + hi >>> 1;
        if (sorted[mid] < oldIdx) lo = mid + 1;
        else hi = mid;
      }
      return oldIdx - lo;
    };
    const firstRemoved = sorted[0];
    const shiftedDocFieldCount = /* @__PURE__ */ new Map();
    for (const [oldKey, count] of index.docFieldCount) shiftedDocFieldCount.set(oldKey > firstRemoved ? shift(oldKey) : oldKey, count);
    index.docFieldCount = shiftedDocFieldCount;
    const shiftedDocTermFieldHits = /* @__PURE__ */ new Map();
    for (const [oldKey, terms] of index.docTermFieldHits) shiftedDocTermFieldHits.set(oldKey > firstRemoved ? shift(oldKey) : oldKey, terms);
    index.docTermFieldHits = shiftedDocTermFieldHits;
  }
  var Fuse = class {
    constructor(docs, options, index) {
      this.options = {
        ...Config,
        ...options
      };
      if (this.options.useExtendedSearch && false) ;
      if (this.options.useTokenSearch && false) ;
      this._keyStore = new KeyStore(this.options.keys);
      this._docs = docs;
      this._myIndex = null;
      this._invertedIndex = null;
      this.setCollection(docs, index);
      this._lastQuery = null;
      this._lastSearcher = null;
    }
    _getSearcher(query) {
      if (this._lastQuery === query) return this._lastSearcher;
      const searcher = createSearcher(query, this._invertedIndex ? {
        ...this.options,
        _invertedIndex: this._invertedIndex
      } : this.options);
      this._lastQuery = query;
      this._lastSearcher = searcher;
      return searcher;
    }
    setCollection(docs, index) {
      this._docs = docs;
      if (index && !(index instanceof FuseIndex)) throw new Error(INCORRECT_INDEX_TYPE);
      this._myIndex = index || createIndex(this.options.keys, this._docs, {
        getFn: this.options.getFn,
        fieldNormWeight: this.options.fieldNormWeight
      });
      if (this.options.useTokenSearch) {
        const analyzer = createAnalyzer({
          isCaseSensitive: this.options.isCaseSensitive,
          ignoreDiacritics: this.options.ignoreDiacritics,
          tokenize: this.options.tokenize
        });
        this._invertedIndex = buildInvertedIndex(this._myIndex.records, this._myIndex.keys.length, analyzer);
      }
      this._invalidateSearcherCache();
    }
    add(doc) {
      if (!isDefined(doc)) return;
      this._docs.push(doc);
      const record = this._myIndex.add(doc, this._docs.length - 1);
      if (this._invertedIndex && record) {
        const analyzer = createAnalyzer({
          isCaseSensitive: this.options.isCaseSensitive,
          ignoreDiacritics: this.options.ignoreDiacritics,
          tokenize: this.options.tokenize
        });
        addToInvertedIndex(this._invertedIndex, record, this._myIndex.keys.length, analyzer);
      }
      this._invalidateSearcherCache();
    }
    remove(predicate = () => false) {
      const results = [];
      const indicesToRemove = [];
      for (let i = 0, len = this._docs.length; i < len; i += 1) if (predicate(this._docs[i], i)) {
        results.push(this._docs[i]);
        indicesToRemove.push(i);
      }
      if (indicesToRemove.length) {
        if (this._invertedIndex) removeAndShiftInvertedIndex(this._invertedIndex, indicesToRemove);
        const toRemove = new Set(indicesToRemove);
        this._docs = this._docs.filter((_, i) => !toRemove.has(i));
        this._myIndex.removeAll(indicesToRemove);
        this._invalidateSearcherCache();
      }
      return results;
    }
    removeAt(idx) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= this._docs.length) throw new Error(INVALID_DOC_INDEX);
      if (this._invertedIndex) removeAndShiftInvertedIndex(this._invertedIndex, [idx]);
      const doc = this._docs.splice(idx, 1)[0];
      this._myIndex.removeAt(idx);
      this._invalidateSearcherCache();
      return doc;
    }
    _invalidateSearcherCache() {
      this._lastQuery = null;
      this._lastSearcher = null;
    }
    getIndex() {
      return this._myIndex;
    }
    _normalizedKeys() {
      return this._myIndex.keys.map((key) => this._keyStore.get(key.id) || key);
    }
    search(query, options) {
      const { limit = -1 } = options || {};
      const { includeMatches, includeScore, shouldSort, sortFn, ignoreFieldNorm } = this.options;
      if (isString(query) && !query.trim()) {
        let docs = this._docs.map((item, idx) => ({
          item,
          refIndex: idx
        }));
        if (isNumber(limit) && limit > -1) docs = docs.slice(0, limit);
        return docs;
      }
      const useHeap = shouldSort && isNumber(limit) && limit > 0 && isString(query);
      const comparator = sortFn;
      const stable = (a, b) => comparator(a, b) || a.idx - b.idx;
      let results;
      if (useHeap) {
        const heap = new MaxHeap(limit, stable);
        if (isString(this._docs[0])) this._searchStringList(query, {
          heap,
          ignoreFieldNorm
        });
        else this._searchObjectList(query, {
          heap,
          ignoreFieldNorm
        });
        results = heap.extractSorted();
      } else {
        results = isString(query) ? isString(this._docs[0]) ? this._searchStringList(query) : this._searchObjectList(query) : this._searchLogical(query);
        computeScore(results, { ignoreFieldNorm });
        if (shouldSort) results.sort(isString(query) ? stable : comparator);
        if (isNumber(limit) && limit > -1) results = results.slice(0, limit);
      }
      return format(results, this._docs, {
        includeMatches,
        includeScore
      });
    }
    _searchStringList(query, { heap, ignoreFieldNorm } = {}) {
      const searcher = this._getSearcher(query);
      const requireAllTokens = this.options.useTokenSearch && this.options.tokenMatch === "all";
      const { records } = this._myIndex;
      const results = heap ? null : [];
      records.forEach(({ v: text, i: idx, n: norm2 }) => {
        if (!isDefined(text)) return;
        const searchResult = searcher.searchIn(text);
        if (searchResult.isMatch) {
          const match = {
            score: searchResult.score,
            value: text,
            norm: norm2,
            indices: searchResult.indices
          };
          if (requireAllTokens) {
            match.matchedMask = searchResult.matchedMask;
            match.matchedTerms = searchResult.matchedTerms;
            match.termCount = searchResult.termCount;
          }
          const matches = [match];
          if (!requireAllTokens || this._coversAllTokens(matches)) {
            const result = {
              item: text,
              idx,
              matches
            };
            if (heap) {
              result.score = computeScoreSingle(result.matches, { ignoreFieldNorm });
              heap.insert(result);
            } else results.push(result);
          }
        }
      });
      return results;
    }
    _searchLogical(query) {
      const expression = parse(query, this.options);
      const keys = this._normalizedKeys();
      const evaluate = (node, item, idx) => {
        if (!("children" in node)) {
          const { keyId, searcher } = node;
          let matches;
          if (keyId === null) {
            matches = [];
            keys.forEach((key, keyIndex) => {
              matches.push(...this._findMatches({
                key,
                value: item[keyIndex],
                searcher
              }));
            });
          } else matches = this._findMatches({
            key: this._keyStore.get(keyId),
            value: this._myIndex.getValueForItemAtKeyId(item, keyId),
            searcher
          });
          if (matches && matches.length) return [{
            idx,
            item,
            matches
          }];
          return [];
        }
        const { children, operator } = node;
        const res = [];
        for (let i = 0, len = children.length; i < len; i += 1) {
          const child = children[i];
          const result = evaluate(child, item, idx);
          if (result.length) res.push(...result);
          else if (operator === LogicalOperator.AND) return [];
        }
        return res;
      };
      const records = this._myIndex.records;
      const resultMap = /* @__PURE__ */ new Map();
      const results = [];
      records.forEach(({ $: item, i: idx }) => {
        if (isDefined(item)) {
          const expResults = evaluate(expression, item, idx);
          if (expResults.length) {
            if (!resultMap.has(idx)) {
              resultMap.set(idx, {
                idx,
                item,
                matches: []
              });
              results.push(resultMap.get(idx));
            }
            expResults.forEach(({ matches }) => {
              resultMap.get(idx).matches.push(...matches);
            });
          }
        }
      });
      return results;
    }
    _searchObjectList(query, { heap, ignoreFieldNorm } = {}) {
      const searcher = this._getSearcher(query);
      const requireAllTokens = this.options.useTokenSearch && this.options.tokenMatch === "all";
      const { records } = this._myIndex;
      const keys = this._normalizedKeys();
      const results = heap ? null : [];
      records.forEach(({ $: item, i: idx }) => {
        if (!isDefined(item)) return;
        const matches = [];
        let anyKeyFailed = false;
        let hasInverse = false;
        keys.forEach((key, keyIndex) => {
          const keyMatches = this._findMatches({
            key,
            value: item[keyIndex],
            searcher
          });
          if (keyMatches.length) {
            matches.push(...keyMatches);
            if (keyMatches[0].hasInverse) hasInverse = true;
          } else anyKeyFailed = true;
        });
        if (hasInverse && anyKeyFailed) return;
        if (matches.length && (!requireAllTokens || this._coversAllTokens(matches))) {
          const result = {
            idx,
            item,
            matches
          };
          if (heap) {
            result.score = computeScoreSingle(result.matches, { ignoreFieldNorm });
            heap.insert(result);
          } else results.push(result);
        }
      });
      return results;
    }
    _findMatches({ key, value, searcher }) {
      if (!isDefined(value)) return [];
      const matches = [];
      if (isArray(value)) value.forEach(({ v: text, i: idx, n: norm2 }) => {
        if (!isDefined(text)) return;
        const searchResult = searcher.searchIn(text);
        if (searchResult.isMatch) {
          const match = {
            score: searchResult.score,
            key,
            value: text,
            idx,
            norm: norm2,
            indices: searchResult.indices,
            hasInverse: searchResult.hasInverse
          };
          if (searchResult.termCount !== void 0) {
            match.matchedMask = searchResult.matchedMask;
            match.matchedTerms = searchResult.matchedTerms;
            match.termCount = searchResult.termCount;
          }
          matches.push(match);
        }
      });
      else {
        const { v: text, n: norm2 } = value;
        const searchResult = searcher.searchIn(text);
        if (searchResult.isMatch) {
          const match = {
            score: searchResult.score,
            key,
            value: text,
            norm: norm2,
            indices: searchResult.indices,
            hasInverse: searchResult.hasInverse
          };
          if (searchResult.termCount !== void 0) {
            match.matchedMask = searchResult.matchedMask;
            match.matchedTerms = searchResult.matchedTerms;
            match.termCount = searchResult.termCount;
          }
          matches.push(match);
        }
      }
      return matches;
    }
    _coversAllTokens(matches) {
      const termCount = matches.length ? matches[0].termCount : void 0;
      if (termCount === void 0) return true;
      if (termCount <= 31) {
        let coverage2 = 0;
        for (let i = 0; i < matches.length; i++) coverage2 |= matches[i].matchedMask || 0;
        return coverage2 === 2 ** termCount - 1;
      }
      const coverage = /* @__PURE__ */ new Set();
      for (let i = 0; i < matches.length; i++) {
        const terms = matches[i].matchedTerms;
        if (terms) for (const t of terms) coverage.add(t);
      }
      return coverage.size === termCount;
    }
  };
  Fuse.version = "7.5.0";
  Fuse.createIndex = createIndex;
  Fuse.parseIndex = parseIndex;
  Fuse.config = Config;
  Fuse.match = function(pattern, text, options) {
    if (options && options.useTokenSearch) throw new Error(FUSE_MATCH_TOKEN_SEARCH_UNSUPPORTED);
    return createSearcher(pattern, {
      ...Config,
      ...options
    }).searchIn(text);
  };
  Fuse.parseQuery = parse;
  register(ExtendedSearch);
  register(TokenSearch);
  Fuse.use = function(...plugins) {
    plugins.forEach((plugin) => register(plugin));
  };
  var entry_default = Fuse;

  // src/search/fuzzy-search.js
  function makeExactIndex(items) {
    const index = /* @__PURE__ */ new Map();
    for (const item of items) {
      const keys = [
        item.title,
        ...item.names ?? [],
        ...item.normalizedNames ?? []
      ];
      for (const key of keys) {
        const normalized = normalizeTitle(key);
        if (!normalized) {
          continue;
        }
        const bucket = index.get(normalized) ?? [];
        if (!bucket.some((candidate) => candidate.id === item.id)) {
          bucket.push(item);
        }
        index.set(normalized, bucket);
      }
    }
    return index;
  }
  function makeInitialIndex(items) {
    const index = /* @__PURE__ */ new Map();
    for (const item of items) {
      const initials = new Set(
        (item.normalizedNames ?? []).map((name) => String(name ?? "").slice(0, 1)).filter(Boolean)
      );
      for (const initial of initials) {
        const bucket = index.get(initial) ?? [];
        bucket.push(item);
        index.set(initial, bucket);
      }
    }
    return index;
  }
  function makeResult(item, score, matchedBy) {
    return {
      item,
      score,
      confidence: Math.max(0, Math.min(1, 1 - score)),
      matchedBy
    };
  }
  var LocalAnimeSearch = class {
    constructor(items, options = {}) {
      this.items = Array.isArray(items) ? items : [];
      this.threshold = options.threshold ?? 0.42;
      this.exactIndex = makeExactIndex(this.items);
      this.initialIndex = makeInitialIndex(this.items);
      this.siteIndex = makeSiteIndex(this.items);
      this.fuse = null;
      this.fuseOptions = {
        includeScore: true,
        ignoreLocation: true,
        minMatchCharLength: 2,
        threshold: this.threshold,
        keys: [
          { name: "title", weight: 0.35 },
          { name: "names", weight: 0.4 },
          { name: "normalizedNames", weight: 0.2 },
          { name: "searchText", weight: 0.05 }
        ]
      };
    }
    setThreshold(threshold) {
      this.threshold = threshold;
      if (this.fuse) {
        this.fuse.options.threshold = threshold;
      }
    }
    getFuse() {
      if (!this.fuse) {
        this.fuse = new entry_default(this.items, {
          ...this.fuseOptions,
          threshold: this.threshold
        });
      }
      return this.fuse;
    }
    search(query, options = {}) {
      const originalQuery = String(query ?? "").trim();
      const normalizedQuery = normalizeTitle(originalQuery);
      if (!normalizedQuery) {
        return [];
      }
      const limit = options.limit ?? 10;
      const threshold = options.threshold ?? this.threshold;
      const results = /* @__PURE__ */ new Map();
      const exactMatches = this.exactIndex.get(normalizedQuery) ?? [];
      for (const item of exactMatches) {
        results.set(item.id, makeResult(item, 0, "exact"));
      }
      if (normalizedQuery.length >= 2) {
        const candidates = this.initialIndex.get(normalizedQuery.slice(0, 1)) ?? this.items;
        for (const item of candidates) {
          const keys = item.normalizedNames ?? [];
          if (keys.some(
            (key) => key.length >= normalizedQuery.length && (key.startsWith(normalizedQuery) || key.includes(normalizedQuery))
          )) {
            if (!results.has(item.id)) {
              results.set(item.id, makeResult(item, 0.12, "substring"));
            }
          }
        }
      }
      if (options.fuzzy !== false) {
        const fuse = this.getFuse();
        if (fuse.options.threshold !== threshold) {
          fuse.options.threshold = threshold;
        }
        for (const result of fuse.search(originalQuery, { limit: limit * 2 })) {
          const existing = results.get(result.item.id);
          if (!existing || result.score < existing.score) {
            results.set(
              result.item.id,
              makeResult(result.item, result.score ?? 1, "fuzzy")
            );
          }
        }
      }
      return [...results.values()].sort((left, right) => left.score - right.score).slice(0, limit);
    }
    findBySiteId(site, id) {
      const expected = String(id ?? "");
      if (!site || !expected) {
        return null;
      }
      return this.siteIndex.get(site)?.get(expected) ?? null;
    }
  };
  function makeSiteIndex(items) {
    const index = /* @__PURE__ */ new Map();
    for (const item of items) {
      for (const [site, id] of Object.entries(item.sites ?? {})) {
        const expected = String(id ?? "");
        if (!site || !expected) {
          continue;
        }
        const siteEntries = index.get(site) ?? /* @__PURE__ */ new Map();
        if (!siteEntries.has(expected)) {
          siteEntries.set(expected, item);
        }
        index.set(site, siteEntries);
      }
    }
    return index;
  }

  // src/index/index-service.js
  var PACKAGE_META_URL = "https://data.jsdelivr.com/v1/package/npm/bangumi-data";
  var NPM_LATEST_URL = "https://registry.npmjs.org/bangumi-data/latest";
  var CHECK_INTERVAL_MS = {
    [UPDATE_FREQUENCIES.STARTUP]: 15 * 60 * 1e3,
    [UPDATE_FREQUENCIES.DAILY]: 24 * 60 * 60 * 1e3,
    [UPDATE_FREQUENCIES.WEEKLY]: 7 * 24 * 60 * 60 * 1e3
  };
  var INDEX_STATES = Object.freeze({
    DISABLED: "disabled",
    LOADING: "loading",
    EMPTY: "empty",
    READY: "ready",
    CHECKING: "checking",
    UPDATING: "updating",
    ERROR: "error"
  });
  function sourceIdForSettings(settings) {
    if (settings.index.source === INDEX_SOURCES.CUSTOM) {
      return `custom:${settings.index.customIndexUrl}`;
    }
    return INDEX_SOURCES.BANGUMI_DATA;
  }
  function sourceMatchesSettings(snapshot, settings) {
    return snapshot?.schemaVersion === INDEX_SCHEMA_VERSION && snapshot?.source?.id === sourceIdForSettings(settings) && indexItemsHaveSearchFields(snapshot.items) && (settings.index.source !== INDEX_SOURCES.BANGUMI_DATA || snapshot.items.every(
      (item) => typeof item.displayTitle === "string" && item.displayTitle.trim()
    ));
  }
  function fnv1a2(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
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
  var AnimeIndexService = class {
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
        lastCheckedAt: null
      };
      this.listeners = /* @__PURE__ */ new Set();
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
        lastCheckedAt: this.snapshot?.source?.lastCheckedAt ?? null
      };
      for (const listener of this.listeners) {
        listener(this.getState());
      }
    }
    rebuildSearch() {
      const threshold = this.settingsStore.get().matching.fuzzyThreshold ?? this.searchOptions.threshold;
      this.search = new LocalAnimeSearch(this.snapshot?.items ?? [], {
        ...this.searchOptions,
        threshold
      });
    }
    async initialize() {
      const settings = this.settingsStore.get();
      if (!settings.index.enabled) {
        this.snapshot = null;
        this.rebuildSearch();
        this.emit({
          status: INDEX_STATES.DISABLED,
          message: "番剧索引已关闭"
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
          message: `已加载 ${cached.itemCount.toLocaleString("zh-CN")} 条番剧`
        });
      } else {
        this.snapshot = null;
        this.rebuildSearch();
        this.emit({
          status: INDEX_STATES.EMPTY,
          message: "本地暂无可用索引"
        });
      }
      if (isCheckDue(this.snapshot, settings.index.updateFrequency)) {
        this.checkForUpdates({ automatic: true }).catch(() => {
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
      if (!options.force && !isCheckDue(this.snapshot, settings.index.updateFrequency)) {
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
        const updated = settings.index.source === INDEX_SOURCES.CUSTOM ? await this.updateFromCustomSource(settings) : await this.updateFromBangumiData(settings);
        this.rebuildSearch();
        const message = updated ? `索引已更新至 ${this.snapshot?.source?.version ?? "新版本"}` : options.force ? "索引已是最新版本" : "索引检查完成";
        this.emit({ status: INDEX_STATES.READY, message });
        return updated;
      } catch (error) {
        this.emit({
          status: this.snapshot ? INDEX_STATES.READY : INDEX_STATES.ERROR,
          message: this.snapshot ? `更新失败，继续使用本地索引：${toErrorMessage(error)}` : `索引下载失败：${toErrorMessage(error)}`
        });
        throw error;
      }
    }
    async updateFromBangumiData(settings) {
      const version = await this.fetchLatestBangumiDataVersion();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (this.snapshot?.source?.version === version) {
        this.snapshot = {
          ...this.snapshot,
          source: { ...this.snapshot.source, lastCheckedAt: now }
        };
        await writeIndexSnapshot(this.snapshot);
        return false;
      }
      this.emit({
        status: INDEX_STATES.UPDATING,
        message: `正在下载 bangumi-data ${version}`
      });
      const sourceUrl = `https://cdn.jsdelivr.net/npm/bangumi-data@${encodeURIComponent(version)}/dist/data.json`;
      let raw;
      try {
        raw = await requestJson(sourceUrl, { timeout: 6e4 });
      } catch {
        raw = await requestJson(
          `https://unpkg.com/bangumi-data@${encodeURIComponent(version)}/dist/data.json`,
          { timeout: 6e4 }
        );
      }
      this.snapshot = buildSlimIndex(raw, {
        sourceId: INDEX_SOURCES.BANGUMI_DATA,
        sourceName: "bangumi-data",
        sourceVersion: version,
        sourceUrl,
        fetchedAt: now,
        lastCheckedAt: now,
        license: "CC BY 4.0"
      });
      await writeIndexSnapshot(this.snapshot);
      return true;
    }
    async fetchLatestBangumiDataVersion() {
      try {
        const metadata = await requestJson(PACKAGE_META_URL, { timeout: 15e3 });
        const version = metadata?.tags?.latest;
        if (version) {
          return String(version);
        }
      } catch {
      }
      const latest = await requestJson(NPM_LATEST_URL, { timeout: 15e3 });
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
        message: "正在检查自定义索引"
      });
      const text = await requestText(sourceUrl, {
        timeout: 6e4,
        headers: { "Cache-Control": "no-cache" }
      });
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error("自定义索引不是有效 JSON");
      }
      const contentHash = fnv1a2(text);
      if (this.snapshot?.source?.contentHash === contentHash && this.snapshot?.source?.id === `custom:${sourceUrl}`) {
        this.snapshot = {
          ...this.snapshot,
          source: {
            ...this.snapshot.source,
            lastCheckedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        };
        await writeIndexSnapshot(this.snapshot);
        return false;
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      this.snapshot = normalizeIndexPayload(raw, {
        id: `custom:${sourceUrl}`,
        sourceId: `custom:${sourceUrl}`,
        sourceName: raw?.source?.name ?? "custom-index",
        sourceVersion: raw?.source?.version ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        sourceUrl,
        fetchedAt: now,
        lastCheckedAt: now,
        license: raw?.source?.license ?? "unknown",
        contentHash
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
          message: "番剧索引已关闭"
        });
        return;
      }
      if (!sourceMatchesSettings(this.snapshot, settings)) {
        this.initialize();
        return;
      }
      if (isCheckDue(this.snapshot, settings.index.updateFrequency)) {
        this.checkForUpdates({ automatic: true }).catch(() => {
        });
      }
    }
  };

  // src/recognizers/page-context.js
  var MAX_TITLE_CANDIDATES = 24;
  var MENTION_PATTERNS = [
    /《([^》\n]{2,80})》/gu,
    /(?:番名|番剧名|作品名|动画名)[：:\s]*(?:是|叫|为)?\s*[「“"]([^」”"\n]{2,80})[」”"]/giu,
    /(?:番名|番剧名|作品名|动画名)[：:\s]*(?:是|叫|为)?\s*([^\s，。！？,；;]{2,50})/giu,
    /(?:这部|该部|本)(?:番|番剧|动画|作品)(?:就是|是|叫|名为)\s*[「“"]?([^」”"\n，。！？,；;]{2,50})/giu
  ];
  var GENERIC_MENTIONS = /* @__PURE__ */ new Set([
    "动画",
    "番剧",
    "本作",
    "作品",
    "这部番",
    "这个番"
  ]);
  function textOf(element2) {
    return element2?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  }
  function metaContent(...selectors) {
    for (const selector of selectors) {
      const element2 = document.querySelector(selector);
      const content = element2?.getAttribute("content")?.trim();
      if (content) {
        return content;
      }
    }
    return "";
  }
  function collectJsonLdValues() {
    const titles = [];
    const names = /* @__PURE__ */ new Set();
    for (const script of document.querySelectorAll(
      'script[type="application/ld+json"]'
    )) {
      try {
        const parsed = JSON.parse(script.textContent ?? "");
        const queue = Array.isArray(parsed) ? [...parsed] : Array.isArray(parsed?.["@graph"]) ? [...parsed["@graph"]] : [parsed];
        for (const node of queue) {
          if (!node || typeof node !== "object") {
            continue;
          }
          const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
          if (!types.some(
            (type) => /^(?:TVSeries|TVSeason|CreativeWork|Movie|VideoObject)$/u.test(
              String(type ?? "")
            )
          )) {
            continue;
          }
          for (const value of [
            node.name,
            node.alternateName,
            ...Array.isArray(node.alternateName) ? node.alternateName : []
          ]) {
            if (typeof value === "string") {
              const cleaned = cleanDisplayTitle(value);
              if (cleaned && !names.has(cleaned)) {
                names.add(cleaned);
                titles.push(cleaned);
              }
            }
          }
        }
      } catch {
      }
    }
    return titles.slice(0, 8);
  }
  function collectHeadingTitles() {
    return [...document.querySelectorAll("h1")].map((element2) => cleanDisplayTitle(textOf(element2))).filter(Boolean).slice(0, 4);
  }
  function collectSiteTitleSelectors() {
    const selectors = [
      ".media-title",
      ".bangumi-title",
      "[class*='media-title']",
      "[class*='bangumi-title']",
      "[class*='season-title']"
    ];
    return [...new Set(selectors)].flatMap((selector) => [...document.querySelectorAll(selector)]).map((element2) => cleanDisplayTitle(textOf(element2))).filter(Boolean).slice(0, 8);
  }
  function collectBreadcrumbText() {
    const element2 = document.querySelector("[class*='breadcrumb']") ?? document.querySelector("nav[aria-label*='breadcrumb' i]");
    return textOf(element2).slice(0, 300);
  }
  function collectPageExcerpt(maxChars) {
    const main = document.querySelector("main") ?? document.querySelector("article") ?? document.body;
    return textOf(main).slice(0, maxChars);
  }
  function collectTextBlocks(selectors, options = {}) {
    const minLength = options.minLength ?? 4;
    const maxLength = options.maxLength ?? 800;
    const limit = options.limit ?? 20;
    const seen = /* @__PURE__ */ new Set();
    const blocks = [];
    for (const element2 of document.querySelectorAll(selectors.join(","))) {
      const text = textOf(element2).slice(0, maxLength);
      const key = normalizeTitle(text);
      if (text.length < minLength || seen.has(key)) {
        continue;
      }
      seen.add(key);
      blocks.push(text);
      if (blocks.length >= limit) {
        break;
      }
    }
    return blocks;
  }
  function collectDocumentDescription() {
    return metaContent(
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
      '[itemprop="description"]'
    );
  }
  function collectSummary() {
    const siteSummary = collectTextBlocks(
      [
        "#v_desc",
        ".desc-info-text",
        ".basic-desc-info",
        ".video-desc",
        ".media-summary",
        ".bangumi-summary",
        ".summary-content",
        "[class*='media-intro']",
        "[class*='bangumi-intro']"
      ],
      { minLength: 8, maxLength: 1600, limit: 4 }
    );
    const description = collectDocumentDescription();
    return [...new Set([...siteSummary, description].filter(Boolean))].join("\n").slice(0, 2400);
  }
  function collectComments() {
    return collectTextBlocks(
      [
        ".reply-item .reply-content",
        ".comment-item .comment-content",
        ".bb-comment .con",
        "#comment .reply-content",
        "[class*='short-review'] [class*='content']"
      ],
      { minLength: 2, maxLength: 500, limit: 24 }
    );
  }
  function extractTitleMentions(texts) {
    const seen = /* @__PURE__ */ new Set();
    const mentions = [];
    for (const text of texts ?? []) {
      const value = String(text ?? "");
      for (const pattern of MENTION_PATTERNS) {
        pattern.lastIndex = 0;
        for (const match of value.matchAll(pattern)) {
          const title = cleanDisplayTitle(match[1]).replace(
            /^[《「“"']+|[》」”"']+$/gu,
            ""
          );
          const key = normalizeTitle(title);
          if (title.length < 2 || title.length > 80 || key.length < 2 || GENERIC_MENTIONS.has(title) || seen.has(key)) {
            continue;
          }
          seen.add(key);
          mentions.push(title);
        }
      }
    }
    return mentions.slice(0, 16);
  }
  function isBilibiliHost(hostname) {
    const host = String(hostname ?? "").toLocaleLowerCase();
    return host === "bilibili.com" || host.endsWith(".bilibili.com");
  }
  function numericId(value) {
    const id = String(value ?? "").trim();
    return /^\d+$/u.test(id) ? id : null;
  }
  function cookieUserId(cookie) {
    return String(cookie ?? "").match(/(?:^|;\s*)DedeUserID=(\d+)(?:;|$)/u)?.[1] ?? null;
  }
  function stateUserId(state) {
    return [
      state?.mid,
      state?.user?.mid,
      state?.userInfo?.mid,
      state?.profile?.mid,
      state?.space?.mid
    ].map(numericId).find(Boolean) ?? null;
  }
  function extractBilibiliFollowUid(input, options = {}) {
    let url;
    try {
      url = new URL(
        typeof input === "string" ? input : String(input?.url ?? globalThis.location?.href ?? ""),
        "https://www.bilibili.com"
      );
    } catch {
      return null;
    }
    if (!isBilibiliHost(url.hostname)) {
      return null;
    }
    const pathUid = url.pathname.match(/^\/(\d+)\/bangumi(?:\/|$)/u)?.[1];
    if (pathUid) {
      return pathUid;
    }
    if (!/^\/bangumi\/mine\/(?:follow|bangumi)(?:\/|$)/u.test(url.pathname)) {
      return null;
    }
    return cookieUserId(
      options.cookie ?? (typeof document === "undefined" ? "" : document.cookie)
    ) ?? stateUserId(
      options.initialState ?? (typeof globalThis === "undefined" ? null : globalThis.__INITIAL_STATE__)
    );
  }
  function detectPageKind(url) {
    if (isBilibiliHost(url.hostname)) {
      if (/^\/(?:\d+\/bangumi|bangumi\/mine\/(?:follow|bangumi))(?:\/|$)/iu.test(
        url.pathname
      )) {
        return "bilibili-follow";
      }
      if (/\/bangumi\/media\/md\d+/iu.test(url.pathname)) {
        return "bilibili-media";
      }
      if (/\/bangumi\/play\/(?:ep|ss)\d+/iu.test(url.pathname)) {
        return "bilibili-play";
      }
    }
    return "generic";
  }
  function createPageContext(options = {}) {
    const url = new URL(location.href);
    const maxExcerptChars = options.maxExcerptChars ?? 6e3;
    const summary = collectSummary();
    const comments = collectComments();
    const summaryMentions = extractTitleMentions([summary]);
    const commentMentions = extractTitleMentions(comments);
    return {
      url: location.href,
      host: url.hostname,
      path: url.pathname,
      pageKind: detectPageKind(url),
      documentTitle: cleanDisplayTitle(document.title),
      openGraphTitle: cleanDisplayTitle(
        metaContent(
          'meta[property="og:title"]',
          'meta[name="twitter:title"]',
          "title"
        )
      ),
      headings: collectHeadingTitles(),
      siteTitles: collectSiteTitleSelectors(),
      jsonLdTitles: collectJsonLdValues(),
      breadcrumb: collectBreadcrumbText(),
      excerpt: collectPageExcerpt(maxExcerptChars),
      summary,
      comments,
      summaryMentions,
      commentMentions,
      titleMentions: [.../* @__PURE__ */ new Set([...summaryMentions, ...commentMentions])],
      bilibiliIds: extractBilibiliIds(location.href),
      bilibiliFollowUid: extractBilibiliFollowUid(location.href)
    };
  }
  function extractTitleCandidates(context) {
    const sources = [
      {
        titles: context.jsonLdTitles,
        source: "regex:json-ld",
        confidence: 0.97
      },
      {
        titles: context.siteTitles,
        source: "regex:site-title",
        confidence: 0.93
      },
      {
        titles: [context.openGraphTitle],
        source: "regex:open-graph",
        confidence: 0.86
      },
      {
        titles: context.headings,
        source: "regex:heading",
        confidence: 0.82
      },
      {
        titles: [context.documentTitle],
        source: "regex:document-title",
        confidence: 0.74
      },
      {
        titles: context.summaryMentions,
        source: "regex:summary-mention",
        confidence: 0.7
      },
      {
        titles: context.commentMentions,
        source: "regex:comment-mention",
        confidence: 0.6
      },
      {
        titles: [...new Set(context.titleMentions)].filter(
          (title) => !context.summaryMentions.includes(title) && !context.commentMentions.includes(title)
        ),
        source: "regex:page-mention",
        confidence: 0.64
      },
      {
        titles: [context.breadcrumb],
        source: "regex:breadcrumb",
        confidence: 0.58
      },
      {
        titles: context.siteTitles.length ? [] : context.headings.length ? [] : [context.documentTitle],
        source: "regex:fallback",
        confidence: 0.5
      }
    ];
    const candidates = [];
    for (const source of sources) {
      for (const rawTitle of source.titles) {
        extractTitleVariants(rawTitle).forEach((title, variantIndex) => {
          candidates.push({
            title,
            source: source.source,
            rawTitle,
            confidence: Math.max(0.35, source.confidence - variantIndex * 0.07)
          });
        });
      }
    }
    return uniqueByTitle(candidates).sort((left, right) => right.confidence - left.confidence).slice(0, MAX_TITLE_CANDIDATES);
  }
  function collectBilibiliCards(limit = 100) {
    const cards = /* @__PURE__ */ new Map();
    const links = document.querySelectorAll(
      'a[href*="/bangumi/media/md"], a[href*="bangumi/media/md"]'
    );
    for (const link of links) {
      const match = link.getAttribute("href")?.match(/\/bangumi\/media\/md(\d+)/iu);
      const mediaId = match?.[1];
      if (!mediaId) {
        continue;
      }
      const container = link.closest(
        "li, article, [class*='card'], [class*='item'], [class*='cover']"
      );
      const titleNode = container?.querySelector(
        "h1, h2, h3, h4, [class*='title'], [title]"
      );
      const imageAlt = container?.querySelector("img[alt]")?.getAttribute("alt");
      const image = container?.querySelector("img");
      const title = cleanDisplayTitle(
        textOf(titleNode) || link.getAttribute("title") || imageAlt || textOf(link)
      ) || `Bilibili media ${mediaId}`;
      const existing = cards.get(mediaId);
      if (!existing || existing.title.startsWith("Bilibili media")) {
        cards.set(mediaId, {
          mediaId,
          title,
          coverUrl: image?.currentSrc || image?.getAttribute("src") || image?.getAttribute("data-src") || null,
          source: "bilibili-dom"
        });
      }
      if (cards.size >= limit) {
        break;
      }
    }
    return [...cards.values()];
  }

  // src/recognizers/bilibili.js
  var FOLLOW_PAGE_SIZE = 30;
  var MAX_FOLLOW_ITEMS = 2e3;
  var MAX_FOLLOW_PAGES = 100;
  async function fetchBilibiliSeasonMetadata(ids) {
    const queryKey = ids.episodeId ? "ep_id" : ids.seasonId ? "season_id" : null;
    if (!queryKey) {
      return null;
    }
    const endpoint = new URL("https://api.bilibili.com/pgc/view/web/season");
    endpoint.searchParams.set(queryKey, ids.episodeId ?? ids.seasonId);
    const response = await requestJson(endpoint.toString(), {
      timeout: 15e3,
      headers: {
        Accept: "application/json",
        Referer: "https://www.bilibili.com/"
      }
    });
    if (response?.code !== 0 || !response?.result) {
      throw new Error(response?.message ?? "Bilibili PGC 接口未返回数据");
    }
    const result = response.result;
    const aliases = String(result.alias ?? "").split(/[、,，/]/u).map(cleanDisplayTitle).filter(Boolean);
    const primaryTitle = cleanDisplayTitle(
      result.title || result.season_title || aliases[0]
    );
    const names = [
      primaryTitle,
      cleanDisplayTitle(result.season_title),
      ...aliases
    ].filter(Boolean);
    return {
      mediaId: result.media_id ? String(result.media_id) : null,
      seasonId: result.season_id ? String(result.season_id) : null,
      title: primaryTitle,
      names: [...new Set(names)],
      titleVariants: names.flatMap((title) => extractTitleVariants(title)),
      summary: String(result.evaluate ?? ""),
      coverUrl: normalizeCoverUrl(result.cover),
      rating: Number.isFinite(Number(result.rating?.score)) ? Number(result.rating.score) : null,
      ratingCount: Number(result.rating?.count ?? 0) || null,
      publish: result.publish ?? null
    };
  }
  function parseBilibiliShortComments(payload, limit = 12) {
    const comments = Array.isArray(payload?.data?.list) ? payload.data.list : [];
    const seen = /* @__PURE__ */ new Set();
    return comments.map((comment) => ({
      text: String(comment?.content ?? "").replace(/\s+/gu, " ").trim().slice(0, 500),
      score: Number(comment?.score) || null,
      progress: String(comment?.progress ?? "").trim(),
      author: String(comment?.author?.uname ?? "").trim(),
      source: "bilibili:short-review"
    })).filter((comment) => {
      if (comment.text.length < 2 || seen.has(comment.text)) {
        return false;
      }
      seen.add(comment.text);
      return true;
    }).slice(0, limit);
  }
  async function fetchBilibiliShortComments(mediaId, options = {}) {
    const id = String(mediaId ?? "").trim();
    if (!id) {
      return [];
    }
    const endpoint = new URL(
      "https://api.bilibili.com/pgc/review/short/list"
    );
    endpoint.searchParams.set("media_id", id);
    endpoint.searchParams.set("ps", String(options.limit ?? 12));
    endpoint.searchParams.set("sort", "0");
    const response = await requestJson(endpoint.toString(), {
      timeout: 12e3,
      headers: {
        Accept: "application/json",
        Referer: "https://www.bilibili.com/"
      }
    });
    if (response?.code !== 0) {
      throw new Error(response?.message ?? "Bilibili 短评接口未返回数据");
    }
    return parseBilibiliShortComments(response, options.limit ?? 12);
  }
  function parseBilibiliFollowPage(payload) {
    const data = payload?.data ?? {};
    const rawItems = Array.isArray(data.list) ? data.list : [];
    const items = rawItems.map((item) => {
      const mediaId = String(item?.media_id ?? "").trim();
      const seasonId = String(item?.season_id ?? "").trim();
      const title = cleanDisplayTitle(
        item?.title ?? item?.season_title ?? item?.name
      );
      if (!mediaId) {
        return null;
      }
      return {
        mediaId,
        seasonId: seasonId || null,
        title: title || `Bilibili media ${mediaId}`,
        coverUrl: normalizeCoverUrl(item?.cover),
        source: "bilibili-follow-api"
      };
    }).filter(Boolean);
    return {
      items,
      page: Math.max(1, Number(data.pn) || 1),
      pageSize: Math.max(1, Number(data.ps) || rawItems.length || FOLLOW_PAGE_SIZE),
      total: Math.max(0, Number(data.total) || 0)
    };
  }
  async function fetchBilibiliFollowList(uid, options = {}) {
    const vmid = String(uid ?? "").trim();
    if (!/^\d+$/u.test(vmid)) {
      throw new Error("无法从当前追番页识别用户 UID");
    }
    const request = options.requestJsonImpl ?? requestJson;
    const maxItems = Math.max(
      1,
      Math.min(MAX_FOLLOW_ITEMS, Number(options.maxItems) || MAX_FOLLOW_ITEMS)
    );
    const maxPages = Math.max(
      1,
      Math.min(MAX_FOLLOW_PAGES, Number(options.maxPages) || MAX_FOLLOW_PAGES)
    );
    const concurrency = Math.max(
      1,
      Math.min(4, Number(options.concurrency) || 3)
    );
    const cards = [];
    const seen = /* @__PURE__ */ new Set();
    let total = 0;
    let reachedEnd = false;
    let fetchedPages = 0;
    const fetchPage = async (page) => {
      const endpoint = new URL(
        "https://api.bilibili.com/x/space/bangumi/follow/list"
      );
      endpoint.searchParams.set("type", "1");
      endpoint.searchParams.set("follow_status", "0");
      endpoint.searchParams.set("pn", String(page));
      endpoint.searchParams.set("ps", String(FOLLOW_PAGE_SIZE));
      endpoint.searchParams.set("vmid", vmid);
      endpoint.searchParams.set("order", "0");
      const response = await request(endpoint.toString(), {
        timeout: 2e4,
        headers: {
          Accept: "application/json",
          Referer: `https://space.bilibili.com/${vmid}/bangumi`
        }
      });
      if (response?.code !== 0) {
        throw new Error(response?.message ?? "Bilibili 追番接口未返回数据");
      }
      fetchedPages = Math.max(fetchedPages, page);
      return parseBilibiliFollowPage(response);
    };
    const appendPage = (parsed) => {
      total = Math.max(total, parsed.total);
      for (const card of parsed.items) {
        if (!seen.has(card.mediaId)) {
          seen.add(card.mediaId);
          cards.push(card);
        }
        if (cards.length >= maxItems) {
          break;
        }
      }
      if (total > 0 && seen.size >= total) {
        reachedEnd = true;
      }
      if (parsed.items.length < parsed.pageSize) {
        reachedEnd = true;
      }
      options.onProgress?.({
        phase: "fetch",
        fetchedPages,
        page: parsed.page,
        itemCount: cards.length,
        total
      });
      return parsed;
    };
    const firstPage = appendPage(await fetchPage(1));
    let expectedPages = total ? Math.ceil(total / firstPage.pageSize) : firstPage.items.length >= firstPage.pageSize ? maxPages : 1;
    expectedPages = Math.min(expectedPages, maxPages);
    let nextPage = 2;
    while (nextPage <= expectedPages && cards.length < maxItems && !reachedEnd) {
      const pageNumbers = [];
      for (let page = nextPage; page <= expectedPages && page < nextPage + concurrency && cards.length < maxItems; page += 1) {
        pageNumbers.push(page);
      }
      const parsedPages = await Promise.all(pageNumbers.map(fetchPage));
      for (const parsed of parsedPages) {
        appendPage(parsed);
        if (!parsed.items.length) {
          expectedPages = Math.min(expectedPages, parsed.page);
          reachedEnd = true;
          break;
        }
        if (cards.length >= maxItems) {
          break;
        }
      }
      nextPage += pageNumbers.length;
    }
    const truncated = total > 0 ? cards.length < total : !reachedEnd;
    return {
      cards,
      total,
      truncated,
      fetchedPages
    };
  }

  // src/recognizers/deepseek.js
  function completionEndpoint(baseUrl) {
    const trimmed = String(baseUrl ?? "").trim().replace(/\/+$/u, "");
    if (/\/chat\/completions$/u.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}/chat/completions`;
  }
  function stripCodeFence(value) {
    return String(value ?? "").trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  }
  function parseModelJson(content) {
    const text = stripCodeFence(content);
    try {
      return JSON.parse(text);
    } catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(text.slice(start, end + 1));
      }
      throw new Error("DeepSeek 未返回可解析的 JSON");
    }
  }
  async function inferAnimeWithDeepSeek(settings, pageContext) {
    if (!settings.ai?.enabled) {
      throw new Error("AI 识别尚未启用");
    }
    if (!settings.ai.apiKey) {
      throw new Error("请先在设置中填写 DeepSeek API Key");
    }
    const maxChars = settings.ai.maxContextChars;
    const promptPayload = {
      url: pageContext.url,
      pageTitle: pageContext.documentTitle,
      openGraphTitle: pageContext.openGraphTitle,
      headings: pageContext.headings.slice(0, 4),
      structuredDataTitles: pageContext.jsonLdTitles.slice(0, 6),
      breadcrumb: pageContext.breadcrumb,
      synopsis: pageContext.summary,
      comments: pageContext.comments.slice(0, 24),
      regexMentions: pageContext.titleMentions.slice(0, 12),
      bilibiliMetadata: pageContext.bilibiliMetadata ? {
        title: pageContext.bilibiliMetadata.title,
        names: pageContext.bilibiliMetadata.names,
        synopsis: pageContext.bilibiliMetadata.summary,
        rating: pageContext.bilibiliMetadata.rating
      } : null,
      pageExcerpt: pageContext.excerpt.slice(0, maxChars)
    };
    const response = await requestJson(completionEndpoint(settings.ai.baseUrl), {
      method: "POST",
      timeout: 3e4,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.ai.apiKey}`
      },
      body: JSON.stringify({
        model: settings.ai.model,
        temperature: 0,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: "你是番剧识别器。根据网页上下文判断页面正在介绍、播放或讨论的具体动画系列。页面标题、结构化数据、作品简介比评论更可靠；评论可用于补充别名和线索，但评论里也可能提到其他作品。不要把集数、播放平台、清晰度、文章标题或评论者的泛称误认为作品名。只输出 JSON。"
          },
          {
            role: "user",
            content: `${JSON.stringify(promptPayload)}

输出格式：{"title":"作品主标题或null","alternateTitles":["别名"],"confidence":0到1,"reason":"简短依据"}。无法确定时 title 为 null。`
          }
        ]
      })
    });
    const content = response?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("DeepSeek 返回内容为空");
    }
    const parsed = parseModelJson(content);
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const alternateTitles = Array.isArray(parsed.alternateTitles) ? parsed.alternateTitles.filter((item) => typeof item === "string") : [];
    return {
      title: title || null,
      alternateTitles,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reason: String(parsed.reason ?? "")
    };
  }

  // src/recognizers/recognizer.js
  var MAX_REGEX_INDEX_QUERIES = 8;
  var BATCH_MATCH_CHUNK_SIZE = 40;
  function yieldToEventLoop() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
  function mergeResult(results, result, extra) {
    const existing = results.get(result.item.id);
    if (!existing) {
      results.set(result.item.id, {
        item: result.item,
        confidence: extra.confidence,
        searchConfidence: result.confidence,
        matchedBy: /* @__PURE__ */ new Set([result.matchedBy]),
        candidates: [
          {
            title: extra.title,
            source: extra.source,
            confidence: extra.sourceConfidence
          }
        ]
      });
      return;
    }
    existing.matchedBy.add(result.matchedBy);
    existing.candidates.push({
      title: extra.title,
      source: extra.source,
      confidence: extra.sourceConfidence
    });
    if (extra.confidence > existing.confidence) {
      existing.confidence = extra.confidence;
      existing.searchConfidence = result.confidence;
    }
  }
  function finalizeResults(results) {
    return [...results.values()].map((result) => ({
      ...result,
      matchedBy: [...result.matchedBy],
      candidates: result.candidates.sort((left, right) => right.confidence - left.confidence).slice(0, 4)
    })).sort((left, right) => right.confidence - left.confidence);
  }
  function statusForResults(results, context) {
    if (results.some((result) => result.matchedBy.includes("bilibili-id"))) {
      return "matched";
    }
    if (!results.length) {
      return "unmatched";
    }
    const best = results[0];
    const second = results[1];
    if (best.confidence >= 0.72 && (!second || best.confidence - second.confidence >= 0.04)) {
      return "matched";
    }
    if (best.confidence >= 0.48 || context.pageKind !== "generic") {
      return "ambiguous";
    }
    return "unmatched";
  }
  var AnimeRecognizer = class {
    constructor({ settingsStore, indexService }) {
      this.settingsStore = settingsStore;
      this.indexService = indexService;
    }
    async recognize(options = {}) {
      const settings = this.settingsStore.get();
      let context = createPageContext({
        maxExcerptChars: settings.ai.maxContextChars
      });
      const indexSearch = this.indexService.getSearch();
      const results = /* @__PURE__ */ new Map();
      const diagnostics = [];
      const mediaId = context.bilibiliIds.mediaId;
      if (mediaId) {
        const exactItem = indexSearch.findBySiteId("bilibili", mediaId);
        if (exactItem) {
          results.set(exactItem.id, {
            item: exactItem,
            confidence: 1,
            searchConfidence: 1,
            matchedBy: /* @__PURE__ */ new Set(["bilibili-id"]),
            candidates: [
              {
                title: exactItem.title,
                source: "bilibili:media-id",
                confidence: 1
              }
            ]
          });
        }
      }
      let bilibiliMetadata = null;
      if (options.includeBilibiliApi !== false) {
        try {
          bilibiliMetadata = await fetchBilibiliSeasonMetadata(
            context.bilibiliIds
          );
          if (bilibiliMetadata?.mediaId) {
            const exactItem = indexSearch.findBySiteId(
              "bilibili",
              bilibiliMetadata.mediaId
            );
            if (exactItem) {
              mergeResult(
                results,
                {
                  item: exactItem,
                  confidence: 1,
                  matchedBy: "bilibili-api-id"
                },
                {
                  title: exactItem.title,
                  source: "bilibili:pgc-api",
                  sourceConfidence: 1,
                  confidence: 1
                }
              );
            }
          }
        } catch (error) {
          diagnostics.push(`Bilibili API：${error.message}`);
        }
      }
      if (options.includeBilibiliApi !== false) {
        const mediaId2 = context.bilibiliIds.mediaId ?? bilibiliMetadata?.mediaId ?? null;
        if (mediaId2) {
          try {
            const apiComments = await fetchBilibiliShortComments(mediaId2, {
              limit: 12
            });
            const comments = [
              ...context.comments,
              ...apiComments.map((comment) => comment.text)
            ];
            const summary = [
              bilibiliMetadata?.summary,
              context.summary
            ].filter(Boolean).join("\n").slice(0, 2400);
            const summaryMentions = extractTitleMentions([summary]);
            const commentMentions = extractTitleMentions(comments);
            context = {
              ...context,
              summary,
              comments,
              summaryMentions,
              commentMentions,
              titleMentions: [
                .../* @__PURE__ */ new Set([...summaryMentions, ...commentMentions])
              ],
              bilibiliMetadata
            };
            diagnostics.push(`Bilibili 评论：已读取 ${apiComments.length} 条`);
          } catch (error) {
            diagnostics.push(`Bilibili 评论：${error.message}`);
          }
        }
      }
      const titleCandidates = extractTitleCandidates(context);
      const hasExactSiteMatch = results.size > 0;
      if (settings.matching.useRegexCandidates && !hasExactSiteMatch) {
        for (const candidate of titleCandidates.slice(0, MAX_REGEX_INDEX_QUERIES)) {
          for (const result of indexSearch.search(candidate.title, { limit: 3 })) {
            const confidence = result.confidence * 0.82 + candidate.confidence * 0.18;
            mergeResult(
              results,
              result,
              {
                title: candidate.title,
                source: candidate.source,
                sourceConfidence: candidate.confidence,
                confidence
              }
            );
          }
        }
      }
      if (bilibiliMetadata && !hasExactSiteMatch) {
        for (const title of bilibiliMetadata.titleVariants) {
          for (const result of indexSearch.search(title, { limit: 3 })) {
            mergeResult(results, result, {
              title,
              source: "bilibili:title",
              sourceConfidence: 0.98,
              confidence: result.confidence * 0.82 + 0.98 * 0.18
            });
          }
        }
      }
      let currentResults = finalizeResults(results);
      const indexState = this.indexService.getState();
      const indexReadyForAutoAi = !settings.index.enabled || indexState.status === "ready";
      const shouldUseAi = options.ai === "force" || settings.ai.enabled && settings.ai.autoFallback && indexReadyForAutoAi && (!currentResults.length || currentResults[0].confidence < settings.matching.autoAiThreshold);
      let aiResult = null;
      if (shouldUseAi) {
        try {
          aiResult = await inferAnimeWithDeepSeek(settings, context);
          const aiTitles = [
            aiResult.title,
            ...aiResult.alternateTitles
          ].filter(Boolean);
          for (const title of aiTitles) {
            for (const result of indexSearch.search(title, { limit: 4 })) {
              mergeResult(results, result, {
                title,
                source: "deepseek",
                sourceConfidence: aiResult.confidence,
                confidence: result.confidence * 0.72 + aiResult.confidence * 0.28
              });
            }
          }
          diagnostics.push(`AI：${aiResult.reason || "已返回标题建议"}`);
        } catch (error) {
          diagnostics.push(`AI 识别失败：${error.message}`);
        }
        currentResults = finalizeResults(results);
      }
      const status = statusForResults(currentResults, context);
      return {
        status,
        context,
        titleCandidates,
        bilibiliMetadata,
        aiResult,
        diagnostics,
        results: currentResults.slice(0, 10),
        best: currentResults[0] ?? null,
        indexState: this.indexService.getState()
      };
    }
    search(query, options = {}) {
      return this.indexService.getSearch().search(query, options);
    }
    async scanBilibiliCards(limit = 2e3, options = {}) {
      const diagnostics = [];
      const domCards = collectBilibiliCards(limit);
      const followUid = extractBilibiliFollowUid(location.href);
      let apiResult = null;
      const reportProgress2 = (progress) => {
        try {
          options.onProgress?.(progress);
        } catch {
        }
      };
      if (followUid && options.includeBilibiliApi !== false) {
        try {
          apiResult = await fetchBilibiliFollowList(followUid, {
            maxItems: limit,
            requestJsonImpl: options.requestJsonImpl,
            onProgress: (progress) => reportProgress2({
              ...progress,
              phase: "fetch"
            })
          });
          diagnostics.push(
            `Bilibili 追番：读取 ${apiResult.cards.length}/${apiResult.total} 部`
          );
          if (apiResult.truncated) {
            diagnostics.push(
              `追番数量超过单次上限，仅载入前 ${apiResult.cards.length} 部`
            );
          }
        } catch (error) {
          diagnostics.push(`Bilibili 追番接口：${error.message}，已改用页面扫描`);
        }
      } else if (!followUid) {
        diagnostics.push("未取得 Bilibili UID，已使用当前页面已加载的追番卡片");
      }
      const cards = /* @__PURE__ */ new Map();
      for (const card of apiResult?.cards ?? []) {
        cards.set(card.mediaId, card);
      }
      for (const card of domCards) {
        if (!cards.has(card.mediaId)) {
          cards.set(card.mediaId, card);
        }
      }
      const search2 = this.indexService.getSearch();
      const sourceCards = [...cards.values()].slice(0, limit);
      const processedCards = [];
      let matchedCount = 0;
      reportProgress2({
        phase: "matching",
        processed: 0,
        totalItems: sourceCards.length,
        matched: 0,
        cards: []
      });
      for (let index = 0; index < sourceCards.length; index += 1) {
        const card = sourceCards[index];
        const exactItem = search2.findBySiteId("bilibili", card.mediaId);
        let processedCard = null;
        if (exactItem) {
          const item = {
            ...exactItem,
            coverUrl: exactItem.coverUrl || card.coverUrl || null
          };
          processedCard = {
            ...card,
            item,
            confidence: 1,
            selectedResult: {
              item,
              confidence: 1,
              matchedBy: [
                card.source === "bilibili-follow-api" ? "bilibili-api-id" : "bilibili-id"
              ],
              bilibiliMetadata: {
                mediaId: card.mediaId,
                seasonId: card.seasonId,
                title: card.title,
                names: [card.title],
                coverUrl: card.coverUrl || null
              }
            }
          };
        } else {
          const titleMatch = search2.search(card.title, {
            limit: 1,
            fuzzy: false
          })[0];
          if (titleMatch?.confidence >= 0.7) {
            const item = {
              ...titleMatch.item,
              coverUrl: titleMatch.item.coverUrl || card.coverUrl || null
            };
            processedCard = {
              ...card,
              item,
              confidence: titleMatch.confidence,
              selectedResult: {
                ...titleMatch,
                item,
                bilibiliMetadata: {
                  mediaId: card.mediaId,
                  seasonId: card.seasonId,
                  title: card.title,
                  names: [card.title],
                  coverUrl: card.coverUrl || null
                }
              }
            };
          } else {
            processedCard = {
              ...card,
              item: null,
              confidence: 0,
              selectedResult: null
            };
          }
        }
        processedCards.push(processedCard);
        if (processedCard.selectedResult) {
          matchedCount += 1;
        }
        const processed = index + 1;
        if (processed % BATCH_MATCH_CHUNK_SIZE === 0 || processed === sourceCards.length) {
          reportProgress2({
            phase: "matching",
            processed,
            totalItems: sourceCards.length,
            matched: matchedCount,
            cards: processedCards.slice()
          });
          if (processed < sourceCards.length) {
            await yieldToEventLoop();
          }
        }
      }
      return {
        cards: processedCards,
        diagnostics,
        source: apiResult ? "bilibili-follow-api" : "bilibili-dom",
        total: apiResult?.total ?? domCards.length,
        truncated: Boolean(apiResult?.truncated)
      };
    }
  };

  // node_modules/lucide/dist/esm/createElement.js
  var createElement = (tag, attrs, children = []) => {
    const element2 = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs).forEach((name) => {
      element2.setAttribute(name, String(attrs[name]));
    });
    if (children.length) {
      children.forEach((child) => {
        const childElement = createElement(...child);
        element2.appendChild(childElement);
      });
    }
    return element2;
  };
  var createElement$1 = ([tag, attrs, children]) => createElement(tag, attrs, children);

  // node_modules/lucide/dist/esm/defaultAttributes.js
  var defaultAttributes = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  };

  // node_modules/lucide/dist/esm/icons/bot.js
  var Bot = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M12 8V4H8" }],
      ["rect", { width: "16", height: "12", x: "4", y: "8", rx: "2" }],
      ["path", { d: "M2 14h2" }],
      ["path", { d: "M20 14h2" }],
      ["path", { d: "M15 13v2" }],
      ["path", { d: "M9 13v2" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/check.js
  var Check = ["svg", defaultAttributes, [["path", { d: "M20 6 9 17l-5-5" }]]];

  // node_modules/lucide/dist/esm/icons/circle-alert.js
  var CircleAlert = [
    "svg",
    defaultAttributes,
    [
      ["circle", { cx: "12", cy: "12", r: "10" }],
      ["line", { x1: "12", x2: "12", y1: "8", y2: "12" }],
      ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/circle-check.js
  var CircleCheck = [
    "svg",
    defaultAttributes,
    [
      ["circle", { cx: "12", cy: "12", r: "10" }],
      ["path", { d: "m9 12 2 2 4-4" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/circle-help.js
  var CircleHelp = [
    "svg",
    defaultAttributes,
    [
      ["circle", { cx: "12", cy: "12", r: "10" }],
      ["path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }],
      ["path", { d: "M12 17h.01" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/cloud-download.js
  var CloudDownload = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M12 13v8l-4-4" }],
      ["path", { d: "m12 21 4-4" }],
      ["path", { d: "M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/database.js
  var Database = [
    "svg",
    defaultAttributes,
    [
      ["ellipse", { cx: "12", cy: "5", rx: "9", ry: "3" }],
      ["path", { d: "M3 5V19A9 3 0 0 0 21 19V5" }],
      ["path", { d: "M3 12A9 3 0 0 0 21 12" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/external-link.js
  var ExternalLink = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M15 3h6v6" }],
      ["path", { d: "M10 14 21 3" }],
      ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/git-branch.js
  var GitBranch = [
    "svg",
    defaultAttributes,
    [
      ["line", { x1: "6", x2: "6", y1: "3", y2: "15" }],
      ["circle", { cx: "18", cy: "6", r: "3" }],
      ["circle", { cx: "6", cy: "18", r: "3" }],
      ["path", { d: "M18 9a9 9 0 0 1-9 9" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/git-fork.js
  var GitFork = [
    "svg",
    defaultAttributes,
    [
      ["circle", { cx: "12", cy: "18", r: "3" }],
      ["circle", { cx: "6", cy: "6", r: "3" }],
      ["circle", { cx: "18", cy: "6", r: "3" }],
      ["path", { d: "M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" }],
      ["path", { d: "M12 12v3" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/github.js
  var Github = [
    "svg",
    defaultAttributes,
    [
      [
        "path",
        {
          d: "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"
        }
      ],
      ["path", { d: "M9 18c-4.51 2-5-2-7-2" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/grip-horizontal.js
  var GripHorizontal = [
    "svg",
    defaultAttributes,
    [
      ["circle", { cx: "12", cy: "9", r: "1" }],
      ["circle", { cx: "19", cy: "9", r: "1" }],
      ["circle", { cx: "5", cy: "9", r: "1" }],
      ["circle", { cx: "12", cy: "15", r: "1" }],
      ["circle", { cx: "19", cy: "15", r: "1" }],
      ["circle", { cx: "5", cy: "15", r: "1" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/info.js
  var Info = [
    "svg",
    defaultAttributes,
    [
      ["circle", { cx: "12", cy: "12", r: "10" }],
      ["path", { d: "M12 16v-4" }],
      ["path", { d: "M12 8h.01" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/key-round.js
  var KeyRound = [
    "svg",
    defaultAttributes,
    [
      [
        "path",
        {
          d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"
        }
      ],
      ["circle", { cx: "16.5", cy: "7.5", r: ".5", fill: "currentColor" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/list.js
  var List = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M3 12h.01" }],
      ["path", { d: "M3 18h.01" }],
      ["path", { d: "M3 6h.01" }],
      ["path", { d: "M8 12h13" }],
      ["path", { d: "M8 18h13" }],
      ["path", { d: "M8 6h13" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/loader-circle.js
  var LoaderCircle = [
    "svg",
    defaultAttributes,
    [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }]]
  ];

  // node_modules/lucide/dist/esm/icons/message-square-text.js
  var MessageSquareText = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }],
      ["path", { d: "M13 8H7" }],
      ["path", { d: "M17 12H7" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/panel-right-close.js
  var PanelRightClose = [
    "svg",
    defaultAttributes,
    [
      ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }],
      ["path", { d: "M15 3v18" }],
      ["path", { d: "m8 9 3 3-3 3" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/refresh-cw.js
  var RefreshCw = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }],
      ["path", { d: "M21 3v5h-5" }],
      ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }],
      ["path", { d: "M8 16H3v5" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/rotate-ccw.js
  var RotateCcw = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }],
      ["path", { d: "M3 3v5h5" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/save.js
  var Save = [
    "svg",
    defaultAttributes,
    [
      [
        "path",
        {
          d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
        }
      ],
      ["path", { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" }],
      ["path", { d: "M7 3v4a1 1 0 0 0 1 1h7" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/scan-search.js
  var ScanSearch = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2" }],
      ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2" }],
      ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2" }],
      ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2" }],
      ["circle", { cx: "12", cy: "12", r: "3" }],
      ["path", { d: "m16 16-1.9-1.9" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/search.js
  var Search = [
    "svg",
    defaultAttributes,
    [
      ["circle", { cx: "11", cy: "11", r: "8" }],
      ["path", { d: "m21 21-4.3-4.3" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/settings-2.js
  var Settings2 = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M20 7h-9" }],
      ["path", { d: "M14 17H5" }],
      ["circle", { cx: "17", cy: "17", r: "3" }],
      ["circle", { cx: "7", cy: "7", r: "3" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/shield-check.js
  var ShieldCheck = [
    "svg",
    defaultAttributes,
    [
      [
        "path",
        {
          d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        }
      ],
      ["path", { d: "m9 12 2 2 4-4" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/sliders-horizontal.js
  var SlidersHorizontal = [
    "svg",
    defaultAttributes,
    [
      ["line", { x1: "21", x2: "14", y1: "4", y2: "4" }],
      ["line", { x1: "10", x2: "3", y1: "4", y2: "4" }],
      ["line", { x1: "21", x2: "12", y1: "12", y2: "12" }],
      ["line", { x1: "8", x2: "3", y1: "12", y2: "12" }],
      ["line", { x1: "21", x2: "16", y1: "20", y2: "20" }],
      ["line", { x1: "12", x2: "3", y1: "20", y2: "20" }],
      ["line", { x1: "14", x2: "14", y1: "2", y2: "6" }],
      ["line", { x1: "8", x2: "8", y1: "10", y2: "14" }],
      ["line", { x1: "16", x2: "16", y1: "18", y2: "22" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/sparkles.js
  var Sparkles = [
    "svg",
    defaultAttributes,
    [
      [
        "path",
        {
          d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
        }
      ],
      ["path", { d: "M20 3v4" }],
      ["path", { d: "M22 5h-4" }],
      ["path", { d: "M4 17v2" }],
      ["path", { d: "M5 18H3" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/star.js
  var Star = [
    "svg",
    defaultAttributes,
    [
      [
        "path",
        {
          d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"
        }
      ]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/trash-2.js
  var Trash2 = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M3 6h18" }],
      ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }],
      ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }],
      ["line", { x1: "10", x2: "10", y1: "11", y2: "17" }],
      ["line", { x1: "14", x2: "14", y1: "11", y2: "17" }]
    ]
  ];

  // node_modules/lucide/dist/esm/icons/x.js
  var X = [
    "svg",
    defaultAttributes,
    [
      ["path", { d: "M18 6 6 18" }],
      ["path", { d: "m6 6 12 12" }]
    ]
  ];

  // src/ui/panel.css
  var panel_default = ':host {\n  all: initial;\n  --scout-bg: #f7f7f4;\n  --scout-panel: #ffffff;\n  --scout-ink: #161917;\n  --scout-muted: #66706a;\n  --scout-line: #dfe3df;\n  --scout-accent: #2563eb;\n  --scout-accent-soft: #e8efff;\n  --scout-good: #16845b;\n  --scout-warn: #b66a16;\n  --scout-bad: #c13c3c;\n  --scout-shadow: 0 18px 48px rgb(18 25 21 / 18%);\n  color: var(--scout-ink);\n  font-family:\n    Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui,\n    sans-serif;\n  font-size: 14px;\n  line-height: 1.5;\n}\n\n.scout-launcher[data-page-kind="bilibili-follow"],\n.scout-panel[data-page-kind="bilibili-follow"] {\n  --scout-accent: #e45886;\n  --scout-accent-soft: #fff0f5;\n  --scout-good: #be3e6a;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbutton,\ninput,\nselect,\ntextarea {\n  font: inherit;\n}\n\nbutton {\n  color: inherit;\n  -webkit-tap-highlight-color: transparent;\n}\n\n.scout-root {\n  position: fixed;\n  right: 20px;\n  bottom: 20px;\n  z-index: 2147483646;\n}\n\n.scout-launcher {\n  position: fixed;\n  right: 20px;\n  bottom: 20px;\n  display: grid;\n  width: 44px;\n  height: 44px;\n  padding: 0;\n  border: 1px solid rgb(255 255 255 / 22%);\n  border-radius: 9px;\n  background: #17201b;\n  color: #fff;\n  box-shadow: 0 8px 26px rgb(10 15 12 / 28%);\n  cursor: grab;\n  place-items: center;\n  touch-action: none;\n  user-select: none;\n  transition:\n    transform 140ms ease,\n    background 140ms ease,\n    width 140ms ease,\n    height 140ms ease,\n    border-radius 140ms ease;\n}\n\n.scout-launcher:hover {\n  background: #25312a;\n  transform: translateY(-1px);\n}\n\n.scout-launcher[data-page-kind="bilibili-follow"] {\n  border-color: rgb(255 255 255 / 42%);\n  background: #9f2f58;\n  box-shadow: 0 9px 28px rgb(133 31 70 / 34%);\n}\n\n.scout-launcher[data-page-kind="bilibili-follow"]:hover {\n  background: #b43a67;\n}\n\n.scout-launcher:active {\n  transform: translateY(1px) scale(0.98);\n}\n\n.scout-launcher.is-dragging {\n  cursor: grabbing;\n  transform: none;\n  transition: none;\n}\n\n.scout-launcher-label {\n  display: none;\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0;\n  line-height: 1;\n  writing-mode: vertical-rl;\n}\n\n.scout-launcher.is-side-docked {\n  display: flex;\n  width: 30px;\n  height: 92px;\n  flex-direction: column;\n  gap: 6px;\n  padding: 7px 3px;\n}\n\n.scout-launcher.is-side-docked .lucide {\n  width: 17px;\n  height: 17px;\n  flex: 0 0 auto;\n}\n\n.scout-launcher.is-side-docked .scout-launcher-label {\n  display: block;\n}\n\n.scout-launcher.is-docked-left {\n  border-radius: 0 8px 8px 0;\n}\n\n.scout-launcher.is-docked-right {\n  border-radius: 8px 0 0 8px;\n}\n\n.scout-launcher.is-side-docked .scout-launcher-dot {\n  top: 4px;\n  right: 4px;\n}\n\n.scout-root button:focus-visible,\n.scout-root input:focus-visible,\n.scout-root select:focus-visible,\n.scout-root textarea:focus-visible {\n  outline: 2px solid var(--scout-accent);\n  outline-offset: 2px;\n}\n\n.scout-launcher .lucide {\n  width: 21px;\n  height: 21px;\n}\n\n.scout-launcher-dot {\n  position: absolute;\n  top: -3px;\n  right: -3px;\n  width: 10px;\n  height: 10px;\n  border: 2px solid #fff;\n  border-radius: 999px;\n  background: var(--scout-muted);\n}\n\n.scout-launcher-dot[data-tone="good"] {\n  background: var(--scout-good);\n}\n\n.scout-launcher-dot[data-tone="warn"] {\n  background: var(--scout-warn);\n}\n\n.scout-launcher-dot[data-tone="bad"] {\n  background: var(--scout-bad);\n}\n\n.scout-panel {\n  position: fixed;\n  right: 20px;\n  bottom: 64px;\n  display: flex;\n  overflow: hidden;\n  width: min(420px, calc(100vw - 24px));\n  height: min(680px, calc(100vh - 96px));\n  min-width: 340px;\n  min-height: 420px;\n  max-width: calc(100vw - 24px);\n  max-height: calc(100vh - 24px);\n  flex-direction: column;\n  border: 1px solid var(--scout-line);\n  border-radius: 12px;\n  background: var(--scout-panel);\n  box-shadow: var(--scout-shadow);\n  container-name: scout-panel;\n  container-type: inline-size;\n}\n\n.scout-panel-header {\n  cursor: grab;\n  touch-action: none;\n}\n\n.scout-panel.is-dragging,\n.scout-panel.is-dragging .scout-panel-header {\n  cursor: grabbing;\n  user-select: none;\n}\n\n.scout-panel.is-dragging .scout-panel-header {\n  background: var(--scout-bg);\n}\n\n.scout-panel.is-resizing,\n.scout-panel.is-resizing * {\n  cursor: nwse-resize !important;\n  user-select: none;\n}\n\n.scout-resize-handle {\n  position: absolute;\n  right: 2px;\n  bottom: 2px;\n  z-index: 5;\n  width: 25px;\n  height: 25px;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  cursor: nwse-resize;\n  touch-action: none;\n}\n\n.scout-resize-handle::before,\n.scout-resize-handle::after {\n  position: absolute;\n  right: 5px;\n  bottom: 5px;\n  width: 10px;\n  height: 10px;\n  border-right: 2px solid #9aa39d;\n  border-bottom: 2px solid #9aa39d;\n  content: "";\n}\n\n.scout-resize-handle::after {\n  right: 9px;\n  bottom: 9px;\n  width: 5px;\n  height: 5px;\n  opacity: 0.55;\n}\n\n.scout-drag-indicator {\n  display: inline-grid;\n  width: 24px;\n  height: 30px;\n  flex: 0 0 auto;\n  color: #98a09b;\n  place-items: center;\n}\n\n.scout-drag-indicator .lucide {\n  width: 16px;\n  height: 16px;\n}\n\n.scout-dock-button:hover {\n  color: var(--scout-accent);\n}\n\n.scout-settings-backdrop {\n  position: fixed;\n  z-index: 2147483645;\n  inset: 0;\n  background: rgb(12 18 14 / 24%);\n}\n\n.scout-cover-viewer {\n  position: fixed;\n  z-index: 2147483647;\n  display: grid;\n  padding: 28px;\n  background: rgb(7 11 9 / 88%);\n  cursor: zoom-out;\n  inset: 0;\n  place-items: center;\n}\n\n.scout-cover-viewer-image {\n  display: block;\n  width: auto;\n  max-width: min(92vw, 900px);\n  height: auto;\n  max-height: min(84vh, 1100px);\n  border: 1px solid rgb(255 255 255 / 24%);\n  border-radius: 10px;\n  object-fit: contain;\n  box-shadow: 0 30px 90px rgb(0 0 0 / 50%);\n  cursor: default;\n}\n\n.scout-cover-viewer-title {\n  position: absolute;\n  right: 28px;\n  bottom: 18px;\n  left: 28px;\n  margin: 0;\n  color: rgb(255 255 255 / 72%);\n  font-size: 12px;\n  text-align: center;\n}\n\n.scout-cover-viewer-close {\n  position: absolute;\n  top: 18px;\n  right: 18px;\n  border-color: rgb(255 255 255 / 28%);\n  background: rgb(15 22 18 / 76%);\n  color: #fff;\n  cursor: pointer;\n}\n\n.scout-settings-window {\n  position: fixed;\n  top: 50%;\n  left: 50%;\n  z-index: 2147483647;\n  display: flex;\n  overflow: hidden;\n  width: min(430px, calc(100vw - 24px));\n  max-height: min(780px, calc(100vh - 48px));\n  flex-direction: column;\n  border: 1px solid var(--scout-line);\n  border-radius: 12px;\n  background: var(--scout-panel);\n  box-shadow: var(--scout-shadow);\n  transform: translate(-50%, -50%);\n}\n\n.scout-panel[hidden],\n.scout-settings-window[hidden],\n.scout-settings-backdrop[hidden],\n.scout-view[hidden],\n[hidden] {\n  display: none !important;\n}\n\n.scout-header {\n  display: flex;\n  min-height: 54px;\n  align-items: center;\n  gap: 10px;\n  padding: 10px 12px;\n  border-bottom: 1px solid var(--scout-line);\n}\n\n.scout-brand-mark {\n  display: grid;\n  width: 30px;\n  height: 30px;\n  flex: 0 0 auto;\n  border-radius: 7px;\n  background: #17201b;\n  color: #fff;\n  place-items: center;\n}\n\n.scout-panel[data-page-kind="bilibili-follow"] .scout-brand-mark {\n  background: #9f2f58;\n}\n\n.scout-panel[data-page-kind="bilibili-follow"] .scout-section-title .lucide {\n  color: #c74574;\n}\n\n.scout-brand-mark .lucide {\n  width: 17px;\n  height: 17px;\n}\n\n.scout-brand {\n  min-width: 0;\n  flex: 1;\n}\n\n.scout-brand-title {\n  overflow: hidden;\n  margin: 0;\n  font-size: 14px;\n  font-weight: 700;\n  letter-spacing: 0;\n  line-height: 1.25;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-brand-state {\n  overflow: hidden;\n  margin: 2px 0 0;\n  color: var(--scout-muted);\n  font-size: 11px;\n  line-height: 1.3;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-icon-button {\n  display: inline-grid;\n  width: 30px;\n  height: 30px;\n  padding: 0;\n  flex: 0 0 auto;\n  border: 1px solid transparent;\n  border-radius: 7px;\n  background: transparent;\n  cursor: pointer;\n  place-items: center;\n}\n\n.scout-icon-button:hover {\n  border-color: var(--scout-line);\n  background: var(--scout-bg);\n}\n\n.scout-icon-button .lucide {\n  width: 16px;\n  height: 16px;\n}\n\n.scout-body {\n  overflow: auto;\n  min-height: 0;\n  flex: 1;\n  overscroll-behavior: contain;\n}\n\n.scout-view {\n  padding: 14px;\n}\n\n.scout-result-head {\n  padding: 4px 2px 13px;\n  border-bottom: 1px solid var(--scout-line);\n}\n\n.scout-result-head.has-cover {\n  display: grid;\n  grid-template-columns: clamp(96px, 29%, 148px) minmax(0, 1fr);\n  gap: 14px;\n  align-items: start;\n}\n\n.scout-result-copy {\n  min-width: 0;\n}\n\n.scout-cover {\n  display: block;\n  overflow: hidden;\n  width: 100%;\n  padding: 0;\n  aspect-ratio: 3 / 4;\n  border: 1px solid var(--scout-line);\n  border-radius: 8px;\n  background: var(--scout-bg);\n  cursor: zoom-in;\n  box-shadow: 0 8px 20px rgb(19 28 23 / 12%);\n  transition:\n    transform 140ms ease,\n    box-shadow 140ms ease;\n}\n\n.scout-cover:hover:not(:disabled) {\n  transform: translateY(-1px);\n  box-shadow: 0 12px 26px rgb(19 28 23 / 18%);\n}\n\n.scout-cover-image {\n  display: block;\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n}\n\n.scout-eyebrow {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  margin-bottom: 7px;\n  color: var(--scout-muted);\n  font-size: 11px;\n  font-weight: 700;\n  letter-spacing: 0.02em;\n}\n\n.scout-confidence {\n  display: inline-flex;\n  align-items: center;\n  min-height: 19px;\n  padding: 1px 6px;\n  border-radius: 4px;\n  background: var(--scout-accent-soft);\n  color: #1d4ed8;\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0;\n}\n\n.scout-confidence[data-tone="good"] {\n  background: #e5f5ed;\n  color: #116b49;\n}\n\n.scout-confidence[data-tone="warn"] {\n  background: #fff1df;\n  color: #8a4c0a;\n}\n\n.scout-title {\n  margin: 0;\n  font-size: 23px;\n  font-weight: 760;\n  letter-spacing: 0;\n  line-height: 1.2;\n  overflow-wrap: anywhere;\n}\n\n.scout-subtitle {\n  margin: 7px 0 0;\n  color: var(--scout-muted);\n  font-size: 12px;\n  overflow-wrap: anywhere;\n}\n\n.scout-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 7px;\n  margin-top: 12px;\n}\n\n.scout-button {\n  display: inline-flex;\n  min-height: 32px;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  padding: 5px 10px;\n  border: 1px solid var(--scout-line);\n  border-radius: 6px;\n  background: var(--scout-panel);\n  color: var(--scout-ink);\n  font-size: 12px;\n  font-weight: 650;\n  text-decoration: none;\n  cursor: pointer;\n  transition:\n    transform 110ms ease,\n    border-color 110ms ease,\n    background 110ms ease,\n    box-shadow 110ms ease;\n}\n\n.scout-button:hover {\n  background: var(--scout-bg);\n}\n\n.scout-button:active:not(:disabled) {\n  transform: translateY(1px) scale(0.98);\n}\n\n.scout-button.is-confirmed {\n  animation: scout-confirm 420ms ease;\n}\n\n.scout-button[data-variant="primary"] {\n  border-color: var(--scout-accent);\n  background: var(--scout-accent);\n  color: #fff;\n}\n\n.scout-button[data-variant="primary"]:hover {\n  background: #1d4fd0;\n}\n\n.scout-button:disabled {\n  cursor: not-allowed;\n  opacity: 0.48;\n}\n\n.scout-button .lucide {\n  width: 14px;\n  height: 14px;\n}\n\n.scout-spin {\n  animation: scout-spin 900ms linear infinite;\n}\n\n.scout-button.is-loading .lucide {\n  animation: scout-spin 900ms linear infinite;\n}\n\n@keyframes scout-confirm {\n  0% {\n    box-shadow: 0 0 0 0 rgb(37 99 235 / 32%);\n  }\n\n  100% {\n    box-shadow: 0 0 0 8px rgb(37 99 235 / 0%);\n  }\n}\n\n@keyframes scout-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n.scout-search {\n  position: relative;\n  margin-top: 12px;\n}\n\n.scout-search .lucide {\n  position: absolute;\n  top: 50%;\n  left: 10px;\n  width: 15px;\n  height: 15px;\n  color: var(--scout-muted);\n  pointer-events: none;\n  transform: translateY(-50%);\n}\n\n.scout-search input,\n.scout-field input,\n.scout-field select,\n.scout-review {\n  width: 100%;\n  min-height: 34px;\n  border: 1px solid var(--scout-line);\n  border-radius: 6px;\n  background: #fff;\n  color: var(--scout-ink);\n}\n\n.scout-search input {\n  padding: 6px 9px 6px 32px;\n}\n\n.scout-field input,\n.scout-field select {\n  padding: 6px 9px;\n}\n\n.scout-field input::placeholder {\n  color: #929a95;\n}\n\n.scout-review {\n  min-height: 82px;\n  margin-top: 10px;\n  padding: 8px 9px;\n  line-height: 1.5;\n  resize: vertical;\n}\n\n.scout-review:disabled {\n  cursor: not-allowed;\n  opacity: 0.6;\n}\n\n.scout-evidence {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 5px;\n  margin-top: 9px;\n}\n\n.scout-evidence-item {\n  display: inline-flex;\n  min-height: 22px;\n  align-items: center;\n  gap: 4px;\n  padding: 2px 6px;\n  border: 1px solid var(--scout-line);\n  border-radius: 4px;\n  background: var(--scout-bg);\n  color: #4e5752;\n  font-size: 10px;\n  font-weight: 650;\n}\n\n.scout-evidence-item .lucide {\n  width: 12px;\n  height: 12px;\n  color: var(--scout-muted);\n}\n\n.scout-section {\n  padding: 14px 0;\n  border-top: 1px solid var(--scout-line);\n}\n\n.scout-section:first-child {\n  padding-top: 0;\n  border-top: 0;\n}\n\n.scout-section-title {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  margin: 0 0 10px;\n  font-size: 12px;\n  font-weight: 750;\n  letter-spacing: 0;\n}\n\n.scout-section-title .lucide {\n  width: 15px;\n  height: 15px;\n  color: var(--scout-muted);\n}\n\n.scout-list {\n  display: grid;\n  gap: 0;\n  margin: 7px 0 0;\n}\n\n.scout-list-row {\n  display: grid;\n  width: 100%;\n  min-height: 48px;\n  grid-template-columns: minmax(0, 1fr) auto;\n  gap: 10px;\n  align-items: center;\n  padding: 8px 7px;\n  border: 0;\n  border-top: 1px solid var(--scout-line);\n  border-radius: 0;\n  background: transparent;\n  color: var(--scout-ink);\n  font: inherit;\n  text-align: left;\n  transition:\n    transform 100ms ease,\n    background 120ms ease,\n    box-shadow 120ms ease;\n}\n\n.scout-list-row:first-child {\n  border-top: 0;\n}\n\nbutton.scout-list-row {\n  cursor: pointer;\n}\n\nbutton.scout-list-row:hover {\n  border-radius: 6px;\n  background: #f3f6f4;\n  box-shadow: inset 0 0 0 1px var(--scout-line);\n}\n\nbutton.scout-list-row:active {\n  transform: scale(0.988);\n  background: var(--scout-accent-soft);\n}\n\n.scout-list-row.is-selected {\n  border-radius: 6px;\n  background: var(--scout-accent-soft);\n  box-shadow: inset 0 0 0 1px #b9caf6;\n}\n\n.scout-list-copy {\n  min-width: 0;\n}\n\n.scout-list-title {\n  overflow: hidden;\n  font-size: 12px;\n  font-weight: 650;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-list-meta {\n  overflow: hidden;\n  margin-top: 2px;\n  color: var(--scout-muted);\n  font-size: 10px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-score {\n  color: var(--scout-muted);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n.scout-row-tail {\n  display: inline-flex;\n  min-width: 48px;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 4px;\n}\n\n.scout-row-check {\n  display: inline-grid;\n  width: 17px;\n  height: 17px;\n  border-radius: 999px;\n  background: var(--scout-accent);\n  color: #fff;\n  opacity: 0;\n  place-items: center;\n  transform: scale(0.7);\n  transition:\n    opacity 120ms ease,\n    transform 120ms ease;\n}\n\n.scout-row-check .lucide {\n  width: 11px;\n  height: 11px;\n  stroke-width: 3;\n}\n\n.scout-list-row.is-selected .scout-row-check {\n  opacity: 1;\n  transform: scale(1);\n}\n\n.scout-batch-heading {\n  display: flex;\n  min-width: 0;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 10px;\n}\n\n.scout-batch-heading .scout-section-title {\n  min-width: 0;\n  margin-bottom: 0;\n}\n\n.scout-batch-heading .scout-section-title span {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-batch-summary {\n  flex: 0 0 auto;\n  color: var(--scout-muted);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n.scout-batch-progress {\n  margin-top: 9px;\n  padding: 8px 9px;\n  border: 1px solid var(--scout-line);\n  border-radius: 6px;\n  background: #fafbfa;\n}\n\n.scout-batch-progress-copy {\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  color: var(--scout-muted);\n  font-size: 10px;\n}\n\n.scout-batch-progress-label {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-batch-progress-value {\n  flex: 0 0 auto;\n  color: var(--scout-ink);\n  font-variant-numeric: tabular-nums;\n}\n\n.scout-batch-progress-bar {\n  position: relative;\n  overflow: hidden;\n  height: 4px;\n  margin-top: 7px;\n  border-radius: 999px;\n  background: #e7ebe8;\n}\n\n.scout-batch-progress-fill {\n  display: block;\n  height: 100%;\n  border-radius: inherit;\n  background: var(--scout-accent);\n  transition: width 160ms ease;\n}\n\n.scout-batch-progress-bar[data-mode="indeterminate"]\n  .scout-batch-progress-fill {\n  width: 38%;\n  animation: scout-progress-indeterminate 1.15s ease-in-out infinite;\n}\n\n.scout-batch-list {\n  margin-top: 8px;\n}\n\n.scout-batch-skeleton {\n  display: grid;\n}\n\n.scout-batch-skeleton-row {\n  display: grid;\n  min-height: 48px;\n  grid-template-columns: 18px minmax(0, 1fr) 42px;\n  gap: 9px;\n  align-items: center;\n  padding: 8px 7px;\n  border-top: 1px solid var(--scout-line);\n}\n\n.scout-batch-skeleton-row:first-child {\n  border-top: 0;\n}\n\n.scout-batch-skeleton-check,\n.scout-batch-skeleton-title,\n.scout-batch-skeleton-meta,\n.scout-batch-skeleton-tail {\n  display: block;\n  border-radius: 4px;\n  background: #e7ebe8;\n  animation: scout-skeleton-pulse 1.1s ease-in-out infinite alternate;\n}\n\n.scout-batch-skeleton-check {\n  width: 15px;\n  height: 15px;\n  border-radius: 4px;\n}\n\n.scout-batch-skeleton-copy {\n  display: grid;\n  gap: 5px;\n}\n\n.scout-batch-skeleton-title {\n  width: min(76%, 180px);\n  height: 9px;\n}\n\n.scout-batch-skeleton-meta {\n  width: min(48%, 120px);\n  height: 7px;\n}\n\n.scout-batch-skeleton-tail {\n  width: 40px;\n  height: 7px;\n}\n\n@keyframes scout-progress-indeterminate {\n  from {\n    transform: translateX(-105%);\n  }\n\n  to {\n    transform: translateX(270%);\n  }\n}\n\n@keyframes scout-skeleton-pulse {\n  from {\n    opacity: 0.5;\n  }\n\n  to {\n    opacity: 0.95;\n  }\n}\n\n.scout-batch-row {\n  display: grid;\n  width: 100%;\n  min-height: 48px;\n  grid-template-columns: 18px minmax(0, 1fr) auto;\n  gap: 9px;\n  align-items: center;\n  padding: 8px 7px;\n  border-top: 1px solid var(--scout-line);\n  border-radius: 0;\n  color: var(--scout-ink);\n  cursor: pointer;\n  transition:\n    background 120ms ease,\n    box-shadow 120ms ease;\n}\n\n.scout-batch-row:first-child {\n  border-top: 0;\n}\n\n.scout-batch-row:hover {\n  border-radius: 6px;\n  background: #f3f6f4;\n  box-shadow: inset 0 0 0 1px var(--scout-line);\n}\n\n.scout-batch-row.is-selected {\n  border-radius: 6px;\n  background: var(--scout-accent-soft);\n  box-shadow: inset 0 0 0 1px #e1a7ba;\n  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--scout-accent) 35%, white);\n}\n\n.scout-batch-row.is-unmatched {\n  cursor: default;\n  opacity: 0.62;\n}\n\n.scout-batch-checkbox {\n  width: 16px;\n  height: 16px;\n  margin: 0;\n  accent-color: var(--scout-accent);\n  cursor: pointer;\n}\n\n.scout-batch-checkbox:disabled {\n  cursor: not-allowed;\n}\n\n.scout-batch-message {\n  margin: 0;\n  padding: 15px 6px 10px;\n  color: var(--scout-muted);\n  font-size: 11px;\n  line-height: 1.5;\n  text-align: center;\n}\n\n.scout-batch-status {\n  position: relative;\n  margin: 9px 0 0;\n  padding: 8px 9px 8px 26px;\n  border: 1px solid var(--scout-line);\n  border-radius: 6px;\n  background: #f6f8f6;\n  color: var(--scout-muted);\n  font-size: 10px;\n  line-height: 1.5;\n  overflow-wrap: anywhere;\n}\n\n.scout-batch-status::before {\n  position: absolute;\n  top: 9px;\n  left: 9px;\n  width: 9px;\n  height: 9px;\n  border: 2px solid currentColor;\n  border-radius: 999px;\n  content: "";\n}\n\n.scout-batch-status[data-tone="success"] {\n  border-color: #9ed4bf;\n  background: #eff9f4;\n  color: #126b4c;\n}\n\n.scout-batch-status[data-tone="progress"] {\n  border-color: #a9bee9;\n  background: #f0f5ff;\n  color: #2452a8;\n}\n\n.scout-batch-status[data-tone="progress"]::before {\n  border-color: #2452a8;\n  border-right-color: transparent;\n  animation: scout-spin 900ms linear infinite;\n}\n\n.scout-batch-status[data-tone="warning"] {\n  border-color: #e4c477;\n  background: #fff9eb;\n  color: #7d5516;\n}\n\n.scout-batch-status[data-tone="error"] {\n  border-color: #e4a1a8;\n  background: #fff3f4;\n  color: #a32f3d;\n}\n\n.scout-batch-status[hidden] {\n  display: none;\n}\n\n.scout-batch-note {\n  margin: 6px 0 0;\n  color: var(--scout-muted);\n  font-size: 10px;\n  line-height: 1.45;\n}\n\n.scout-batch-note[data-tone="warn"] {\n  color: #92631d;\n}\n\n.scout-batch-toolbar {\n  display: flex;\n  flex-wrap: wrap;\n  justify-content: flex-end;\n  gap: 6px;\n  margin-top: 9px;\n}\n\n.scout-batch-toolbar .scout-button {\n  min-height: 30px;\n  padding: 5px 9px;\n  font-size: 11px;\n}\n\n.scout-batch-load-more {\n  width: 100%;\n  min-height: 34px;\n  margin-top: 6px;\n  border: 1px dashed var(--scout-line);\n  border-radius: 5px;\n  background: #fff;\n  color: var(--scout-muted);\n  cursor: pointer;\n  font: inherit;\n  font-size: 10px;\n}\n\n.scout-batch-load-more:hover {\n  border-color: #9eb7ee;\n  background: var(--scout-accent-soft);\n  color: #1d4ed8;\n}\n\n.scout-suggestions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n}\n\n.scout-suggestion {\n  display: inline-flex;\n  min-height: 28px;\n  max-width: 100%;\n  align-items: center;\n  gap: 6px;\n  padding: 3px 7px;\n  border: 1px solid var(--scout-line);\n  border-radius: 5px;\n  background: #fff;\n  color: var(--scout-ink);\n  cursor: pointer;\n  transition:\n    transform 100ms ease,\n    border-color 120ms ease,\n    background 120ms ease;\n}\n\n.scout-suggestion:hover {\n  border-color: #bdc7c0;\n  background: var(--scout-bg);\n}\n\n.scout-suggestion:active {\n  transform: translateY(1px) scale(0.985);\n  background: var(--scout-accent-soft);\n}\n\n.scout-suggestion-title {\n  overflow: hidden;\n  max-width: 215px;\n  font-size: 11px;\n  font-weight: 650;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-suggestion-source {\n  flex: 0 0 auto;\n  color: var(--scout-muted);\n  font-size: 9px;\n}\n\n.scout-record-head {\n  display: flex;\n  min-width: 0;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 10px;\n}\n\n.scout-record-head .scout-section-title {\n  flex: 0 0 auto;\n  margin-bottom: 0;\n}\n\n.scout-record-context {\n  display: flex;\n  min-width: 0;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 8px;\n}\n\n.scout-record-item {\n  min-width: 0;\n  overflow: hidden;\n  color: var(--scout-muted);\n  font-size: 10px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-reselect {\n  display: inline-flex;\n  min-height: 24px;\n  flex: 0 0 auto;\n  align-items: center;\n  gap: 4px;\n  padding: 2px 6px;\n  border: 1px solid var(--scout-line);\n  border-radius: 5px;\n  background: #fff;\n  color: var(--scout-muted);\n  cursor: pointer;\n  font-size: 10px;\n  font-weight: 650;\n  transition:\n    transform 100ms ease,\n    border-color 120ms ease,\n    background 120ms ease,\n    color 120ms ease;\n}\n\n.scout-reselect:hover {\n  border-color: #b9caf6;\n  background: var(--scout-accent-soft);\n  color: #1d4ed8;\n}\n\n.scout-reselect:active {\n  transform: scale(0.96);\n}\n\n.scout-reselect .lucide {\n  width: 12px;\n  height: 12px;\n}\n\n.scout-record:focus {\n  outline: none;\n}\n\n.scout-record-rating-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-top: 0;\n}\n\n.scout-record-value {\n  color: var(--scout-muted);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n.scout-rating-options {\n  display: grid;\n  grid-template-columns: repeat(10, minmax(0, 1fr));\n  gap: 3px;\n  margin-top: 6px;\n}\n\n.scout-rating-option {\n  display: grid;\n  min-width: 0;\n  height: 29px;\n  padding: 0;\n  border: 1px solid var(--scout-line);\n  border-radius: 4px;\n  background: #fff;\n  color: var(--scout-muted);\n  cursor: pointer;\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n  place-items: center;\n  transition:\n    transform 100ms ease,\n    border-color 120ms ease,\n    background 120ms ease,\n    color 120ms ease;\n}\n\n.scout-review {\n  flex: 1;\n  min-height: 112px;\n  margin-top: 10px;\n  padding: 10px 11px;\n  line-height: 1.65;\n  resize: vertical;\n}\n\n.scout-review-display {\n  position: relative;\n  display: block;\n  flex: 1;\n  min-height: 112px;\n  margin: 10px 0 0;\n  padding: 17px 16px 14px 28px;\n  border: 1px solid #d9e2dc;\n  border-left: 3px solid var(--scout-accent);\n  border-radius: 7px;\n  outline: 0;\n  background: linear-gradient(135deg, #f8faf8, #f2f5f2);\n  color: #26312c;\n  cursor: text;\n}\n\n.scout-review-display:hover,\n.scout-review-display:focus-visible {\n  border-color: #b9c9bf;\n  box-shadow: inset 0 0 0 1px rgb(37 99 235 / 8%);\n}\n\n.scout-review-display-mark {\n  position: absolute;\n  top: 1px;\n  left: 9px;\n  color: color-mix(in srgb, var(--scout-accent) 54%, white);\n  font-family: Georgia, "Songti SC", serif;\n  font-size: 32px;\n  line-height: 1;\n}\n\n.scout-review-display-text {\n  display: block;\n  overflow-wrap: anywhere;\n  font-family: Georgia, "Songti SC", "Noto Serif CJK SC", serif;\n  font-size: 15px;\n  font-weight: 500;\n  line-height: 1.72;\n  white-space: pre-wrap;\n}\n\n.scout-rating-option:hover:not(:disabled) {\n  border-color: #9eb7ee;\n  background: var(--scout-accent-soft);\n  color: #1d4ed8;\n}\n\n.scout-rating-option:active:not(:disabled) {\n  transform: scale(0.94);\n}\n\n.scout-rating-option.is-selected {\n  border-color: var(--scout-accent);\n  background: var(--scout-accent);\n  color: #fff;\n}\n\n.scout-rating-option:disabled {\n  cursor: not-allowed;\n  opacity: 0.48;\n}\n\n.scout-record-footer {\n  display: grid;\n  min-width: 0;\n  gap: 7px;\n  margin-top: 9px;\n}\n\n.scout-record-footer .scout-footer-status {\n  min-width: 0;\n  overflow: hidden;\n  padding: 4px 6px;\n  border-radius: 5px;\n  color: var(--scout-muted);\n  font-size: 9px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-record-footer .scout-footer-status[data-tone="progress"] {\n  background: #edf3ff;\n  color: #2452a8;\n}\n\n.scout-record-footer .scout-footer-status[data-tone="success"] {\n  background: #eaf7f1;\n  color: #126b4c;\n}\n\n.scout-record-footer .scout-footer-status[data-tone="warning"] {\n  background: #fff7e7;\n  color: #805713;\n}\n\n.scout-record-footer .scout-footer-status[data-tone="error"] {\n  background: #fff0f2;\n  color: #a32f3d;\n}\n\n.scout-record-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 6px;\n}\n\n.scout-record-actions .scout-button {\n  min-height: 30px;\n  padding: 4px 8px;\n  font-size: 10px;\n}\n\n@media (max-width: 520px) {\n  .scout-record-footer {\n    align-items: stretch;\n    flex-direction: column;\n  }\n\n  .scout-record-actions {\n    display: grid;\n    grid-template-columns: 1fr 1fr;\n  }\n\n  .scout-record-actions .scout-button {\n    justify-content: center;\n  }\n}\n\n.scout-record-remote-link {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  margin-top: 9px;\n  color: #1d4ed8;\n  font-size: 10px;\n  font-weight: 650;\n  text-decoration: none;\n}\n\n.scout-record-remote-link:hover {\n  text-decoration: underline;\n}\n\n.scout-record-remote-link .lucide {\n  width: 12px;\n  height: 12px;\n}\n\n.scout-duplicate-warning {\n  margin-top: 10px;\n  padding: 10px;\n  border: 1px solid #e6c77a;\n  border-radius: 7px;\n  background: #fffaf0;\n  color: #5f4917;\n}\n\n.scout-duplicate-warning[data-kind="existing"] {\n  border-color: #e49b5a;\n  background: #fff5e9;\n  box-shadow: 0 0 0 3px rgb(228 155 90 / 12%);\n}\n\n.scout-duplicate-heading {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 11px;\n}\n\n.scout-duplicate-heading .lucide {\n  width: 14px;\n  height: 14px;\n  flex: 0 0 auto;\n}\n\n.scout-duplicate-summary {\n  margin: 6px 0 8px;\n  font-size: 10px;\n  line-height: 1.45;\n}\n\n.scout-duplicate-list {\n  display: grid;\n  gap: 6px;\n}\n\n.scout-duplicate-row {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  gap: 8px;\n  align-items: center;\n  padding-top: 6px;\n  border-top: 1px solid #ead9ad;\n}\n\n.scout-duplicate-copy {\n  display: grid;\n  min-width: 0;\n  gap: 2px;\n}\n\n.scout-duplicate-copy strong,\n.scout-duplicate-copy span,\n.scout-duplicate-row code {\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-duplicate-copy strong {\n  font-size: 10px;\n}\n\n.scout-duplicate-copy span,\n.scout-duplicate-row code {\n  color: #80672e;\n  font-size: 9px;\n}\n\n.scout-duplicate-row code {\n  max-width: 110px;\n}\n\n.scout-duplicate-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 6px;\n  margin-top: 9px;\n}\n\n.scout-empty {\n  padding: 18px 6px 10px;\n  color: var(--scout-muted);\n  font-size: 12px;\n  text-align: center;\n}\n\n.scout-diagnostics {\n  margin-top: 12px;\n  color: var(--scout-muted);\n  font-size: 11px;\n}\n\n.scout-diagnostics summary {\n  cursor: pointer;\n}\n\n.scout-diagnostics ul {\n  margin: 7px 0 0;\n  padding-left: 18px;\n}\n\n.scout-field {\n  display: grid;\n  gap: 5px;\n  margin-top: 10px;\n}\n\n.scout-field:first-child {\n  margin-top: 0;\n}\n\n.scout-field > span,\n.scout-range-label {\n  color: #3d4641;\n  font-size: 11px;\n  font-weight: 650;\n}\n\n.scout-field-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 8px;\n}\n\n.scout-switch {\n  display: flex;\n  min-height: 32px;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 3px 0;\n  font-size: 12px;\n  font-weight: 650;\n}\n\n.scout-switch input {\n  position: relative;\n  width: 34px;\n  height: 19px;\n  flex: 0 0 auto;\n  appearance: none;\n  border: 1px solid #c6ccc8;\n  border-radius: 999px;\n  background: #dfe3df;\n  cursor: pointer;\n  transition: background 120ms ease;\n}\n\n.scout-switch input::after {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: 13px;\n  height: 13px;\n  border-radius: 999px;\n  background: #fff;\n  box-shadow: 0 1px 2px rgb(0 0 0 / 18%);\n  content: "";\n  transition: transform 120ms ease;\n}\n\n.scout-switch input:checked {\n  border-color: var(--scout-accent);\n  background: var(--scout-accent);\n}\n\n.scout-switch input:checked::after {\n  transform: translateX(15px);\n}\n\n.scout-range-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  margin-top: 12px;\n}\n\n.scout-range-head output {\n  color: var(--scout-muted);\n  font-size: 11px;\n  font-variant-numeric: tabular-nums;\n}\n\n.scout-range {\n  width: 100%;\n  margin: 5px 0 0;\n  accent-color: var(--scout-accent);\n}\n\n.scout-note {\n  margin: 7px 0 0;\n  color: var(--scout-muted);\n  font-size: 10px;\n  line-height: 1.45;\n}\n\n.scout-note[data-tone="good"] {\n  color: #116b49;\n}\n\n.scout-note[data-tone="bad"] {\n  color: #a13c1d;\n}\n\n.scout-onboarding {\n  margin: 10px 0 12px;\n  padding: 10px 11px;\n  border: 1px solid #cdd9f2;\n  border-radius: 7px;\n  background: #f4f7fd;\n}\n\n.scout-onboarding h4 {\n  margin: 0;\n  color: #26334c;\n  font-size: 11px;\n  font-weight: 750;\n}\n\n.scout-onboarding h4 + * {\n  margin-top: 7px;\n}\n\n.scout-onboarding h4:not(:first-child) {\n  margin-top: 11px;\n  padding-top: 10px;\n  border-top: 1px solid #dbe4f5;\n}\n\n.scout-repo-roles {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 6px;\n}\n\n.scout-repo-role {\n  display: grid;\n  min-width: 0;\n  gap: 3px;\n  padding: 8px;\n  border: 1px solid #d7e1f3;\n  border-radius: 6px;\n  background: #fff;\n}\n\n.scout-repo-role-own {\n  border-color: #bccef0;\n  background: #edf3ff;\n}\n\n.scout-repo-role-label {\n  color: #62708a;\n  font-size: 9px;\n  font-weight: 750;\n}\n\n.scout-repo-role strong {\n  overflow: hidden;\n  color: #25334d;\n  font-size: 10px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-repo-role small {\n  color: #657187;\n  font-size: 9px;\n  line-height: 1.4;\n}\n\n.scout-onboarding ol {\n  margin: 7px 0 9px;\n  padding-left: 18px;\n  color: #4e5c72;\n  font-size: 10px;\n  line-height: 1.55;\n}\n\n.scout-onboarding-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n}\n\n.scout-setup-checklist {\n  display: grid;\n  gap: 4px;\n  margin-top: 9px;\n  padding-top: 9px;\n  border-top: 1px solid #dbe4f5;\n}\n\n.scout-setup-step {\n  display: grid;\n  min-height: 25px;\n  grid-template-columns: 14px minmax(0, 1fr) auto;\n  gap: 6px;\n  align-items: center;\n  color: #4e5c72;\n  font-size: 10px;\n}\n\n.scout-setup-step .lucide {\n  width: 13px;\n  height: 13px;\n  color: #9aa5b8;\n}\n\n.scout-setup-state {\n  overflow: hidden;\n  max-width: 150px;\n  color: #7d879a;\n  font-size: 9px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-setup-step[data-state="ready"] .lucide,\n.scout-setup-step[data-state="ready"] .scout-setup-state {\n  color: #16845b;\n}\n\n.scout-setup-step[data-state="bad"] .lucide,\n.scout-setup-step[data-state="bad"] .scout-setup-state {\n  color: #b33245;\n}\n\n.scout-setup-step[data-state="bad"] {\n  color: #913044;\n}\n\n.scout-setup-summary {\n  margin: 2px 0 0;\n  color: #52627d;\n  font-size: 9px;\n  font-weight: 700;\n}\n\n.scout-footer {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 10px 14px;\n  border-top: 1px solid var(--scout-line);\n  background: var(--scout-bg);\n}\n\n.scout-footer-status {\n  overflow: hidden;\n  color: var(--scout-muted);\n  font-size: 10px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-footer-actions {\n  display: flex;\n  flex: 0 0 auto;\n  gap: 6px;\n}\n\n.scout-toast {\n  position: absolute;\n  right: 10px;\n  bottom: 10px;\n  left: 10px;\n  display: grid;\n  max-height: min(190px, calc(100% - 20px));\n  grid-template-columns: 22px minmax(0, 1fr) 22px;\n  gap: 9px;\n  align-items: start;\n  overflow: auto;\n  padding: 10px;\n  border: 1px solid rgb(255 255 255 / 18%);\n  border-radius: 8px;\n  background: #17201b;\n  color: #fff;\n  font-size: 11px;\n  box-shadow: 0 10px 28px rgb(0 0 0 / 26%);\n  animation: scout-toast-in 160ms ease-out;\n  z-index: 8;\n}\n\n.scout-toast::after {\n  position: absolute;\n  right: 0;\n  bottom: 0;\n  left: 0;\n  height: 2px;\n  background: currentColor;\n  content: "";\n  opacity: 0.42;\n  transform-origin: left;\n}\n\n.scout-toast[data-auto-dismiss="true"]::after {\n  animation: scout-toast-progress var(--scout-toast-duration) linear forwards;\n}\n\n.scout-toast[data-tone="success"] {\n  border-color: #2d9d76;\n  background: #0f3d2e;\n}\n\n.scout-toast[data-tone="warning"] {\n  border-color: #d8a441;\n  background: #49330f;\n}\n\n.scout-toast[data-tone="error"] {\n  border-color: #e16d78;\n  background: #4b1720;\n}\n\n.scout-toast[data-tone="progress"] {\n  border-color: #7295e5;\n  background: #142b55;\n}\n\n.scout-toast-icon {\n  display: grid;\n  width: 22px;\n  height: 22px;\n  border-radius: 999px;\n  background: rgb(255 255 255 / 10%);\n  place-items: center;\n}\n\n.scout-toast-icon .lucide {\n  width: 15px;\n  height: 15px;\n  stroke-width: 2.25;\n}\n\n.scout-toast-copy {\n  min-width: 0;\n}\n\n.scout-toast-title,\n.scout-toast-message {\n  display: block;\n  overflow-wrap: anywhere;\n}\n\n.scout-toast-title {\n  margin: 0 0 2px;\n  font-size: 12px;\n  line-height: 1.4;\n}\n\n.scout-toast-message {\n  margin: 0;\n  color: rgb(255 255 255 / 78%);\n  line-height: 1.55;\n  white-space: pre-wrap;\n}\n\n.scout-toast-close {\n  display: grid;\n  width: 22px;\n  height: 22px;\n  padding: 0;\n  border: 0;\n  border-radius: 5px;\n  background: transparent;\n  color: rgb(255 255 255 / 70%);\n  cursor: pointer;\n  place-items: center;\n}\n\n.scout-toast-close:hover {\n  background: rgb(255 255 255 / 12%);\n  color: #fff;\n}\n\n.scout-toast-close .lucide {\n  width: 13px;\n  height: 13px;\n}\n\n@keyframes scout-toast-in {\n  from {\n    opacity: 0;\n    transform: translateY(5px);\n  }\n\n  to {\n    opacity: 1;\n    transform: translateY(0);\n  }\n}\n\n@keyframes scout-toast-progress {\n  from {\n    transform: scaleX(1);\n  }\n\n  to {\n    transform: scaleX(0);\n  }\n}\n\n@media (max-width: 520px) {\n  .scout-root {\n    right: 12px;\n    bottom: 12px;\n  }\n\n  .scout-launcher {\n    right: 12px;\n    bottom: 12px;\n  }\n\n  .scout-panel {\n    right: 12px;\n    bottom: 64px;\n    left: 12px;\n    width: auto;\n    height: min(720px, calc(100vh - 84px));\n    min-width: 0;\n    max-height: calc(100vh - 84px);\n  }\n\n  .scout-resize-handle {\n    display: none;\n  }\n\n  .scout-settings-window {\n    width: calc(100vw - 24px);\n    max-height: calc(100vh - 24px);\n  }\n\n  .scout-repo-roles {\n    grid-template-columns: 1fr;\n  }\n\n  .scout-setup-state {\n    max-width: 120px;\n  }\n}\n\n@container scout-panel (max-width: 380px) {\n  .scout-record-footer {\n    align-items: stretch;\n    flex-direction: column;\n  }\n\n  .scout-record-actions {\n    display: grid;\n    grid-template-columns: 1fr 1fr;\n  }\n\n  .scout-record-actions .scout-button {\n    justify-content: center;\n  }\n}\n\n@media (prefers-color-scheme: dark) {\n  :host {\n    --scout-bg: #eef0ed;\n    --scout-panel: #ffffff;\n    --scout-ink: #161917;\n    --scout-muted: #66706a;\n    --scout-line: #dfe3df;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  * {\n    scroll-behavior: auto !important;\n    transition: none !important;\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n  }\n}\n';

  // src/ui/panel.js
  var TYPE_LABELS = {
    tv: "TV",
    web: "WEB",
    movie: "剧场版",
    ova: "OVA",
    oad: "OAD",
    music: "音乐",
    unknown: "番剧"
  };
  var SOURCE_LABELS = {
    "regex:json-ld": "结构化数据",
    "regex:site-title": "站点标题",
    "regex:open-graph": "Open Graph",
    "regex:heading": "页面标题",
    "regex:document-title": "网页标题",
    "regex:summary-mention": "简介提及",
    "regex:comment-mention": "评论提及",
    "regex:page-mention": "页面提及",
    "regex:breadcrumb": "面包屑",
    "regex:fallback": "备用标题",
    "bilibili:media-id": "B站 ID",
    "bilibili:pgc-api": "B站接口",
    "bilibili:title": "B站标题",
    deepseek: "DeepSeek"
  };
  function sourceLabel(source) {
    return SOURCE_LABELS[source] ?? String(source ?? "页面线索");
  }
  function itemDisplayTitle2(item) {
    const chineseName = item?.names?.find(
      (name) => /[\u3400-\u9fff]/u.test(String(name ?? ""))
    );
    return item?.displayTitle || chineseName || item?.title || "";
  }
  function element(tag, options = {}, children = []) {
    const node = document.createElement(tag);
    if (options.className) {
      node.className = options.className;
    }
    if (options.text !== void 0) {
      node.textContent = String(options.text);
    }
    for (const [key, value] of Object.entries(options.attrs ?? {})) {
      if (value !== void 0 && value !== null) {
        node.setAttribute(key, String(value));
      }
    }
    for (const [key, value] of Object.entries(options.dataset ?? {})) {
      node.dataset[key] = String(value);
    }
    for (const property of [
      "type",
      "name",
      "value",
      "placeholder",
      "checked",
      "disabled",
      "autocomplete",
      "min",
      "max",
      "step",
      "rows",
      "maxLength"
    ]) {
      if (options[property] !== void 0) {
        node[property] = options[property];
      }
    }
    for (const [event, handler] of Object.entries(options.on ?? {})) {
      node.addEventListener(event, handler);
    }
    for (const child of children) {
      if (child === null || child === void 0) {
        continue;
      }
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }
  function icon(iconNode, className = "") {
    const node = createElement$1(iconNode);
    node.classList.add("lucide");
    if (className) {
      node.classList.add(className);
    }
    node.setAttribute("aria-hidden", "true");
    return node;
  }
  function iconButton(label, iconNode, handler, className = "scout-icon-button") {
    return element(
      "button",
      {
        className,
        attrs: {
          type: "button",
          title: label,
          "aria-label": label
        },
        on: { click: handler }
      },
      [icon(iconNode)]
    );
  }
  function button(label, iconNode, handler, options = {}) {
    const node = element(
      "button",
      {
        className: "scout-button",
        dataset: options.variant ? { variant: options.variant } : {},
        attrs: { type: options.type ?? "button" },
        disabled: options.disabled,
        on: { click: handler }
      },
      [iconNode ? icon(iconNode) : null, label]
    );
    if (options.iconRef) {
      options.iconRef.current = node.querySelector(".lucide");
    }
    return node;
  }
  function formatConfidence(value) {
    return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
  }
  function clampNumber2(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function recordTimestamp(record) {
    const timestamp2 = Date.parse(String(record?.updatedAt ?? ""));
    return Number.isFinite(timestamp2) ? timestamp2 : 0;
  }
  function hasRecordContent(record) {
    const rating = record?.rating;
    return rating !== null && rating !== "" && Number.isFinite(Number(rating)) && Number(rating) >= 0 || Boolean(String(record?.review ?? "").trim());
  }
  function formatRecordTime(value) {
    const timestamp2 = Date.parse(String(value ?? ""));
    if (!Number.isFinite(timestamp2)) {
      return "";
    }
    return new Date(timestamp2).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function confidenceTone(value) {
    if (value >= 0.72) {
      return "good";
    }
    if (value >= 0.45) {
      return "warn";
    }
    return "bad";
  }
  function stateTone(status) {
    if (status === INDEX_STATES.READY || status === INDEX_STATES.LOADING || status === INDEX_STATES.CHECKING || status === INDEX_STATES.UPDATING) {
      if (status === INDEX_STATES.READY) {
        return "good";
      }
      return "warn";
    }
    if (status === INDEX_STATES.ERROR) {
      return "bad";
    }
    return "none";
  }
  function option(value, label, selected) {
    return element("option", { value, text: label, checked: selected });
  }
  function feedbackIcon(tone) {
    if (tone === "success") {
      return CircleCheck;
    }
    if (tone === "error") {
      return CircleAlert;
    }
    if (tone === "warning") {
      return CircleHelp;
    }
    if (tone === "progress") {
      return LoaderCircle;
    }
    return Info;
  }
  var ScoutPanel = class {
    constructor(options) {
      this.settingsStore = options.settingsStore;
      this.indexService = options.indexService;
      this.recognizer = options.recognizer;
      this.personalRecordStore = options.personalRecordStore;
      this.recognitionCache = options.recognitionCache;
      this.coverResolver = options.coverResolver;
      this.githubRecords = options.githubRecords;
      this.onRecognize = options.onRecognize;
      this.onSettingsSaved = options.onSettingsSaved;
      this.onUpdateIndex = options.onUpdateIndex;
      this.onClearIndex = options.onClearIndex;
      this.onScanCards = options.onScanCards;
      this.indexState = this.indexService.getState();
      this.currentResult = null;
      this.selectedResult = null;
      this.recordItem = null;
      this.recordRating = null;
      this.recordDirty = false;
      this.recordRemoteRecord = null;
      this.pendingGithubSave = null;
      this.draftSaveTimer = null;
      this.recordLoadRequestId = 0;
      this.recordSaving = false;
      this.githubConnectionChecking = false;
      this.githubTemplateChecking = false;
      this.githubConnectionChecked = false;
      this.githubLastSyncedAt = "";
      this.manualSearchRows = [];
      this.candidateCollapsed = false;
      this.batchCards = [];
      this.batchRenderTimer = null;
      this.batchProgressRenderTimer = null;
      this.batchScanRequestId = 0;
      this.batchSelectedIds = /* @__PURE__ */ new Set();
      this.batchVisibleLimit = 50;
      this.batchLoading = false;
      this.batchImporting = false;
      this.batchMessage = "";
      this.batchMessageTone = "";
      this.batchDiagnostics = [];
      this.batchTotal = 0;
      this.batchProgress = null;
      this.pageKind = "generic";
      this.presentationPageKind = null;
      this.coverRequestId = 0;
      this.busy = false;
      this.searchTimer = null;
      this.dragState = null;
      this.resizeState = null;
      this.launcherDragState = null;
      this.suppressLauncherClick = false;
      this.dockedSide = null;
      this.panelHasCustomPosition = false;
      const initialUi = this.settingsStore.get().ui;
      this.panelWidth = initialUi.panelWidth;
      this.panelHeight = initialUi.panelHeight;
      this.currentCoverUrl = null;
    }
    mount() {
      const existing = document.getElementById("bangumi-scout-host");
      if (existing) {
        this.host = existing;
        this.shadow = existing.shadowRoot;
        return;
      }
      this.host = element("div", { attrs: { id: "bangumi-scout-host" } });
      this.shadow = this.host.attachShadow({ mode: "open" });
      this.shadow.append(element("style", { text: panel_default }));
      this.launcherDot = element("span", {
        className: "scout-launcher-dot",
        dataset: { tone: "none" }
      });
      this.launcherLabel = element("span", {
        className: "scout-launcher-label",
        text: "番剧"
      });
      this.launcherIconNode = icon(ScanSearch);
      this.launcher = element(
        "button",
        {
          className: "scout-launcher",
          attrs: {
            type: "button",
            title: "Bangumi Scout",
            "aria-label": "打开 Bangumi Scout",
            "aria-expanded": "false"
          },
          on: {
            click: () => {
              if (this.suppressLauncherClick) {
                this.suppressLauncherClick = false;
                return;
              }
              this.toggle();
            },
            pointerdown: (event) => this.startLauncherDrag(event),
            pointermove: (event) => this.moveLauncher(event),
            pointerup: (event) => this.finishLauncherDrag(event),
            pointercancel: (event) => this.finishLauncherDrag(event)
          }
        },
        [this.launcherIconNode, this.launcherLabel, this.launcherDot]
      );
      this.panelStatus = element("p", {
        className: "scout-brand-state",
        text: "本地索引准备中"
      });
      this.recognitionView = this.buildRecognitionView();
      this.panelBody = element("div", { className: "scout-body" }, [
        this.recognitionView
      ]);
      this.settingsView = null;
      this.settingsBody = element("div", { className: "scout-body" });
      this.brandIconNode = icon(ScanSearch);
      this.panelBrandMark = element(
        "div",
        { className: "scout-brand-mark" },
        [this.brandIconNode]
      );
      this.brandTitle = element("h1", {
        className: "scout-brand-title",
        text: "Bangumi Scout"
      });
      this.panelHeader = element(
        "header",
        {
          className: "scout-header scout-panel-header",
          attrs: { title: "拖动面板" },
          on: {
            pointerdown: (event) => this.startPanelDrag(event),
            pointermove: (event) => this.movePanel(event),
            pointerup: (event) => this.finishPanelDrag(event),
            pointercancel: (event) => this.finishPanelDrag(event)
          }
        },
        [
          this.panelBrandMark,
          element("div", { className: "scout-brand" }, [
            this.brandTitle,
            this.panelStatus
          ]),
          element(
            "span",
            {
              className: "scout-drag-indicator",
              attrs: { "aria-hidden": "true" }
            },
            [icon(GripHorizontal)]
          ),
          iconButton(
            "隐藏到侧边栏",
            PanelRightClose,
            () => this.hideToSide(),
            "scout-icon-button scout-dock-button"
          ),
          iconButton("关闭", X, () => this.close())
        ]
      );
      this.panel = element(
        "section",
        {
          className: "scout-panel",
          attrs: {
            hidden: "",
            "aria-label": "Bangumi Scout 番剧识别"
          }
        },
        [
          this.panelHeader,
          this.panelBody,
          element("button", {
            className: "scout-resize-handle",
            attrs: {
              type: "button",
              title: "拖拽调整面板大小",
              "aria-label": "拖拽调整面板大小"
            },
            on: {
              pointerdown: (event) => this.startPanelResize(event),
              pointermove: (event) => this.movePanelResize(event),
              pointerup: (event) => this.finishPanelResize(event),
              pointercancel: (event) => this.finishPanelResize(event)
            }
          })
        ]
      );
      this.settingsWindowStatus = element("p", {
        className: "scout-brand-state",
        text: "脚本设置"
      });
      this.settingsWindow = element(
        "section",
        {
          className: "scout-settings-window",
          attrs: {
            hidden: "",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "Bangumi Scout 设置"
          }
        },
        [
          element("header", { className: "scout-header" }, [
            element("div", { className: "scout-brand-mark" }, [icon(Settings2)]),
            element("div", { className: "scout-brand" }, [
              element("h2", {
                className: "scout-brand-title",
                text: "Bangumi Scout 设置"
              }),
              this.settingsWindowStatus
            ]),
            iconButton("关闭设置", X, () => this.closeSettings())
          ]),
          this.settingsBody
        ]
      );
      this.settingsBackdrop = element("div", {
        className: "scout-settings-backdrop",
        attrs: { hidden: "" },
        on: { click: () => this.closeSettings() }
      });
      this.coverViewerImage = element("img", {
        className: "scout-cover-viewer-image",
        attrs: { alt: "番剧封面大图" }
      });
      this.coverViewerTitle = element("p", {
        className: "scout-cover-viewer-title"
      });
      this.coverViewer = element(
        "div",
        {
          className: "scout-cover-viewer",
          attrs: {
            hidden: "",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "番剧封面大图"
          },
          on: {
            click: (event) => {
              if (event.target === this.coverViewer) {
                this.closeCoverViewer();
              }
            }
          }
        },
        [
          iconButton("关闭封面大图", X, () => this.closeCoverViewer(), "scout-cover-viewer-close"),
          this.coverViewerImage,
          this.coverViewerTitle
        ]
      );
      this.root = element("div", { className: "scout-root" }, [
        this.settingsBackdrop,
        this.settingsWindow,
        this.coverViewer,
        this.panel,
        this.launcher
      ]);
      this.shadow.append(this.root);
      document.documentElement.append(this.host);
      for (const eventName of ["keydown", "keypress", "keyup"]) {
        this.host.addEventListener(
          eventName,
          (event) => {
            event.stopPropagation();
          },
          true
        );
      }
      this.updatePagePresentation();
      this.applyPanelSize(this.panelWidth, this.panelHeight);
      this.shadow.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (!this.coverViewer.hidden) {
            this.closeCoverViewer();
          } else if (!this.settingsWindow.hidden) {
            this.closeSettings();
          } else if (!this.panel.hidden) {
            this.close();
          }
        }
      });
      this.setIndexState(this.indexState);
      window.addEventListener("resize", () => this.handleViewportResize());
    }
    updatePagePresentation() {
      let pageKind = "generic";
      try {
        pageKind = detectPageKind(new URL(location.href));
      } catch {
      }
      this.pageKind = pageKind;
      if (pageKind === this.presentationPageKind) {
        return;
      }
      this.presentationPageKind = pageKind;
      const followPage = pageKind === "bilibili-follow";
      const nextIcon = followPage ? List : ScanSearch;
      const refreshIconNode = (node) => {
        const replacement = icon(nextIcon);
        replacement.dataset.icon = followPage ? "list" : "scan-search";
        node.replaceWith(replacement);
        return replacement;
      };
      this.launcherIconNode = refreshIconNode(this.launcherIconNode);
      this.brandIconNode = refreshIconNode(this.brandIconNode);
      this.root.dataset.pageKind = pageKind;
      this.panel.dataset.pageKind = pageKind;
      this.launcher.dataset.pageKind = pageKind;
      this.launcherLabel.textContent = followPage ? "追番" : "番剧";
      this.launcher.title = followPage ? "打开 B 站追番批量导入" : "打开 Bangumi Scout";
      this.launcher.setAttribute(
        "aria-label",
        followPage ? "打开 B 站追番批量导入" : "打开 Bangumi Scout"
      );
      this.brandTitle.textContent = followPage ? "Bangumi Scout · 追番" : "Bangumi Scout";
    }
    buildRecognitionView() {
      this.resultBadge = element("span", {
        className: "scout-confidence",
        text: "等待识别",
        dataset: { tone: "none" }
      });
      this.resultTitle = element("h2", {
        className: "scout-title",
        text: "尚未识别"
      });
      this.resultSubtitle = element("p", {
        className: "scout-subtitle",
        text: "点击入口或“重新识别”读取当前页面。"
      });
      this.evidenceStrip = element("div", { className: "scout-evidence" });
      this.coverImage = element("img", {
        className: "scout-cover-image",
        attrs: {
          alt: "番剧封面",
          loading: "eager",
          decoding: "async",
          referrerpolicy: "no-referrer"
        },
        on: {
          error: () => {
            if (this.coverImage.getAttribute("src")) {
              this.setSelectedCover(null);
            }
          }
        }
      });
      this.coverFrame = element(
        "button",
        {
          className: "scout-cover",
          attrs: {
            type: "button",
            hidden: "",
            title: "查看封面大图",
            "aria-label": "查看封面大图"
          },
          on: { click: () => this.openCoverViewer() }
        },
        [this.coverImage]
      );
      this.rescanIcon = icon(RefreshCw);
      this.rescanButton = button(
        "识别当前页",
        null,
        () => this.onRecognize({
          source: "manual",
          ignoreRecognitionCache: true
        }),
        { variant: "primary" }
      );
      this.rescanButtonTextNode = this.rescanButton.lastChild;
      this.rescanButton.prepend(this.rescanIcon);
      this.aiButton = button(
        "AI 辅助",
        Sparkles,
        () => this.requestAi()
      );
      this.manualSearchButton = button(
        "手动搜索",
        Search,
        () => this.showManualSearch()
      );
      this.resultActions = element("div", { className: "scout-actions" }, [
        this.rescanButton,
        this.aiButton,
        this.manualSearchButton
      ]);
      this.siteLink = element("a", {
        className: "scout-button",
        attrs: { target: "_blank", rel: "noreferrer" }
      }, [icon(ExternalLink), "打开 B 站"]);
      this.siteLink.hidden = true;
      this.resultActions.append(this.siteLink);
      this.resultList = element("div", { className: "scout-list" });
      this.resultListSection = element("section", { className: "scout-section" }, [
        element("h3", { className: "scout-section-title" }, [
          icon(List),
          "候选结果"
        ]),
        this.resultList
      ]);
      this.titleCandidateList = element("div", {
        className: "scout-suggestions"
      });
      this.titleCandidateSection = element(
        "section",
        { className: "scout-section" },
        [
          element("h3", { className: "scout-section-title" }, [
            icon(Sparkles),
            "识别线索"
          ]),
          this.titleCandidateList
        ]
      );
      this.titleCandidateSection.hidden = true;
      this.searchInput = element("input", {
        type: "search",
        placeholder: "手动搜索番剧名或别名",
        autocomplete: "off",
        attrs: { "aria-label": "手动搜索番剧" },
        on: { input: () => this.scheduleManualSearch() }
      });
      this.manualSearchResults = element("div", {
        className: "scout-list scout-manual-results"
      });
      this.manualSearchSection = element(
        "section",
        { className: "scout-section" },
        [
          element("h3", { className: "scout-section-title" }, [
            icon(Search),
            "索引搜索"
          ]),
          element("div", { className: "scout-search" }, [
            icon(Search),
            this.searchInput
          ]),
          this.manualSearchResults
        ]
      );
      this.manualSearchSection.hidden = true;
      this.batchList = element("div", {
        className: "scout-list scout-batch-list"
      });
      this.batchTitle = element("span", { text: "追番列表" });
      this.batchSelectionSummary = element("span", {
        className: "scout-batch-summary",
        text: "已选 0 项"
      });
      this.batchStatus = element("p", {
        className: "scout-batch-status",
        attrs: { role: "status", "aria-live": "polite" }
      });
      this.batchProgressLabel = element("span", {
        className: "scout-batch-progress-label",
        text: "正在准备追番列表"
      });
      this.batchProgressValue = element("span", {
        className: "scout-batch-progress-value",
        text: "0%"
      });
      this.batchProgressFill = element("span", {
        className: "scout-batch-progress-fill"
      });
      this.batchProgressBar = element(
        "div",
        {
          className: "scout-batch-progress-bar",
          dataset: { mode: "indeterminate" }
        },
        [this.batchProgressFill]
      );
      this.batchProgressPanel = element(
        "div",
        {
          className: "scout-batch-progress",
          attrs: {
            role: "progressbar",
            "aria-label": "B 站追番导入进度",
            hidden: ""
          }
        },
        [
          element("div", { className: "scout-batch-progress-copy" }, [
            this.batchProgressLabel,
            this.batchProgressValue
          ]),
          this.batchProgressBar
        ]
      );
      this.batchActionNote = element("p", {
        className: "scout-batch-note",
        text: "新记录默认未评分、无评价；已存在的番剧会自动跳过。"
      });
      this.batchSelectAllButton = button(
        "全选可导入",
        Check,
        () => this.toggleAllBatchCards()
      );
      this.batchImportButton = button(
        "导入并同步",
        CloudDownload,
        () => this.syncSelectedBatchCards(),
        { variant: "primary", disabled: true }
      );
      this.batchImportButtonTextNode = this.batchImportButton.lastChild;
      this.batchSection = element("section", { className: "scout-section" }, [
        element("div", { className: "scout-batch-heading" }, [
          element("h3", { className: "scout-section-title" }, [
            icon(ScanSearch),
            this.batchTitle
          ]),
          this.batchSelectionSummary
        ]),
        this.batchProgressPanel,
        this.batchList,
        this.batchStatus,
        this.batchActionNote,
        element("div", { className: "scout-batch-toolbar" }, [
          this.batchSelectAllButton,
          this.batchImportButton
        ])
      ]);
      this.batchSection.hidden = true;
      this.recordItemLabel = element("span", {
        className: "scout-record-item",
        text: "先选定一个候选"
      });
      this.reselectButton = element(
        "button",
        {
          className: "scout-reselect",
          attrs: {
            type: "button",
            title: "展开候选并重新选择"
          },
          on: { click: () => this.showCandidateSelection() }
        },
        [icon(Search), "重新选择"]
      );
      this.recordRatingValue = element("span", {
        className: "scout-record-value",
        text: "未评分"
      });
      this.ratingButtons = [];
      const ratingOptions = element(
        "div",
        {
          className: "scout-rating-options",
          attrs: {
            role: "radiogroup",
            "aria-label": "个人评分，1 到 10 分"
          }
        },
        Array.from({ length: 10 }, (_, index) => {
          const rating = index + 1;
          const ratingButton = element(
            "button",
            {
              className: "scout-rating-option",
              dataset: { rating },
              attrs: {
                type: "button",
                role: "radio",
                "aria-checked": "false",
                "aria-label": `${rating} 分`
              },
              on: { click: () => this.selectRating(rating) }
            },
            [String(rating)]
          );
          this.ratingButtons.push(ratingButton);
          return ratingButton;
        })
      );
      this.reviewInput = element("textarea", {
        className: "scout-review",
        name: "personal.review",
        rows: 3,
        maxLength: 2e4,
        placeholder: "写下你的评价或备注",
        attrs: { "aria-label": "个人评价" },
        on: {
          focus: () => this.enterRecordReviewEdit(),
          blur: () => setTimeout(() => this.renderRecordReview(), 80),
          input: () => {
            this.enterRecordFocusMode();
            this.recordDirty = true;
            this.setRecordStatus("正在缓存本机草稿", "progress");
            this.clearDuplicateWarning();
            this.scheduleRecognitionDraftSave();
          }
        }
      });
      this.reviewDisplayText = element("span", {
        className: "scout-review-display-text"
      });
      this.reviewDisplay = element(
        "blockquote",
        {
          className: "scout-review-display",
          attrs: {
            hidden: "",
            tabindex: "0",
            role: "button",
            "aria-label": "编辑短评"
          },
          on: {
            click: () => this.enterRecordReviewEdit(),
            keydown: (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                this.enterRecordReviewEdit();
              }
            }
          }
        },
        [
          element("span", {
            className: "scout-review-display-mark",
            text: "“",
            attrs: { "aria-hidden": "true" }
          }),
          this.reviewDisplayText
        ]
      );
      this.recordStatus = element("span", {
        className: "scout-footer-status",
        text: "尚未填写"
      });
      this.saveRecordButton = button(
        "同步到 GitHub",
        Save,
        () => this.savePersonalRecord(),
        { variant: "primary" }
      );
      this.saveRecordButtonTextNode = this.saveRecordButton.lastChild;
      this.clearRecordButton = button(
        "清除草稿",
        Trash2,
        () => this.clearPersonalRecordDraft()
      );
      this.recordNote = element("p", {
        className: "scout-note",
        text: "当前保存为本机草稿；在扩展设置中连接 GitHub 后可写入自己的番剧仓库。"
      });
      this.recordRemoteLink = element(
        "a",
        {
          className: "scout-record-remote-link",
          attrs: {
            href: "#",
            target: "_blank",
            rel: "noreferrer",
            hidden: ""
          }
        },
        [icon(ExternalLink), "查看 GitHub 记录"]
      );
      this.duplicateWarningTitle = element("strong", {
        text: "发现疑似重复番剧"
      });
      this.duplicateWarningSummary = element("p", {
        className: "scout-duplicate-summary",
        text: "仓库中已有相似记录。继续会新增一条独立记录，不会修改原记录。"
      });
      this.duplicateWarningList = element("div", {
        className: "scout-duplicate-list"
      });
      this.cancelDuplicateButton = button(
        "取消同步",
        X,
        () => this.cancelDuplicateSync()
      );
      this.confirmDuplicateButton = button(
        "仍然添加",
        CloudDownload,
        () => this.confirmDuplicateSync()
      );
      this.replaceDuplicateButton = button(
        "替换评价",
        RefreshCw,
        () => this.replaceDuplicateSync(),
        { variant: "primary" }
      );
      this.duplicateWarning = element(
        "div",
        {
          className: "scout-duplicate-warning",
          attrs: { hidden: "", role: "alert" }
        },
        [
          element("div", { className: "scout-duplicate-heading" }, [
            icon(CircleHelp),
            this.duplicateWarningTitle
          ]),
          this.duplicateWarningSummary,
          this.duplicateWarningList,
          element("div", { className: "scout-duplicate-actions" }, [
            this.cancelDuplicateButton,
            this.confirmDuplicateButton,
            this.replaceDuplicateButton
          ])
        ]
      );
      this.recordSection = element(
        "section",
        {
          className: "scout-section scout-record",
          attrs: { tabindex: "-1" }
        },
        [
          element("div", { className: "scout-record-head" }, [
            element("h3", { className: "scout-section-title" }, [
              icon(Star),
              "我的评分与短评"
            ]),
            element("div", { className: "scout-record-context" }, [
              this.recordItemLabel,
              this.reselectButton
            ])
          ]),
          element("div", { className: "scout-record-rating-head" }, [
            element("span", { className: "scout-range-label", text: "我的评分" }),
            this.recordRatingValue
          ]),
          ratingOptions,
          this.reviewInput,
          this.reviewDisplay,
          this.duplicateWarning,
          element("div", { className: "scout-record-footer" }, [
            this.recordStatus,
            element("div", { className: "scout-record-actions" }, [
              this.clearRecordButton,
              this.saveRecordButton
            ])
          ]),
          this.recordNote,
          this.recordRemoteLink
        ]
      );
      this.recordSection.hidden = true;
      this.diagnosticsList = element("ul");
      this.diagnostics = element(
        "details",
        { className: "scout-diagnostics" },
        [
          element("summary", { text: "识别详情" }),
          this.diagnosticsList
        ]
      );
      this.diagnostics.hidden = true;
      this.resultHead = element("div", { className: "scout-result-head" }, [
        this.coverFrame,
        element("div", { className: "scout-result-copy" }, [
          element("div", { className: "scout-eyebrow" }, [
            this.resultBadge,
            element("span", { text: "当前页面" })
          ]),
          this.resultTitle,
          this.resultSubtitle,
          this.evidenceStrip,
          this.resultActions
        ])
      ]);
      return element("div", {
        className: "scout-view",
        attrs: {
          "data-view": "recognition",
          role: "region",
          "aria-label": "番剧识别结果"
        }
      }, [
        this.resultHead,
        this.manualSearchSection,
        this.batchSection,
        this.resultListSection,
        this.titleCandidateSection,
        this.recordSection,
        this.diagnostics
      ]);
    }
    buildSettingsView() {
      const settings = this.settingsStore.get();
      this.indexEnabled = element("input", {
        type: "checkbox",
        name: "index.enabled",
        checked: settings.index.enabled,
        on: { change: () => this.syncSettingsDisabledState() }
      });
      this.indexSource = element("select", {
        name: "index.source",
        on: {
          change: () => {
            this.syncCustomUrlVisibility();
            this.syncSettingsDisabledState();
          }
        }
      }, [
        option(INDEX_SOURCES.BANGUMI_DATA, "bangumi-data（自动更新）"),
        option(INDEX_SOURCES.CUSTOM, "自定义精简索引 URL")
      ]);
      this.customIndexUrl = element("input", {
        type: "url",
        name: "index.customIndexUrl",
        placeholder: "https://raw.githubusercontent.com/...",
        autocomplete: "off"
      });
      this.customUrlField = element("label", { className: "scout-field" }, [
        element("span", { text: "自定义索引 URL" }),
        this.customIndexUrl
      ]);
      this.updateFrequency = element("select", {
        name: "index.updateFrequency"
      }, [
        option(UPDATE_FREQUENCIES.STARTUP, "每次启动（最多每 15 分钟一次）"),
        option(UPDATE_FREQUENCIES.DAILY, "每天"),
        option(UPDATE_FREQUENCIES.WEEKLY, "每周"),
        option(UPDATE_FREQUENCIES.MANUAL, "仅手动")
      ]);
      this.indexStatusLine = element("p", {
        className: "scout-note",
        text: "尚未读取索引状态。"
      });
      this.updateIndexButton = button(
        "检查更新",
        CloudDownload,
        () => this.runIndexUpdate()
      );
      this.clearIndexButton = button(
        "清除缓存",
        Trash2,
        () => this.runClearIndex()
      );
      this.regexCandidates = element("input", {
        type: "checkbox",
        name: "matching.useRegexCandidates",
        checked: settings.matching.useRegexCandidates
      });
      this.fuzzyThreshold = element("input", {
        className: "scout-range",
        type: "range",
        name: "matching.fuzzyThreshold",
        min: "0.15",
        max: "0.8",
        step: "0.01",
        value: settings.matching.fuzzyThreshold
      });
      this.fuzzyOutput = element("output", {
        text: settings.matching.fuzzyThreshold.toFixed(2)
      });
      this.fuzzyThreshold.addEventListener("input", () => {
        this.fuzzyOutput.value = Number(this.fuzzyThreshold.value).toFixed(2);
      });
      this.autoAiThreshold = element("input", {
        className: "scout-range",
        type: "range",
        name: "matching.autoAiThreshold",
        min: "0.3",
        max: "0.95",
        step: "0.01",
        value: settings.matching.autoAiThreshold
      });
      this.autoAiOutput = element("output", {
        text: settings.matching.autoAiThreshold.toFixed(2)
      });
      this.autoAiThreshold.addEventListener("input", () => {
        this.autoAiOutput.value = Number(this.autoAiThreshold.value).toFixed(2);
      });
      this.aiEnabled = element("input", {
        type: "checkbox",
        name: "ai.enabled",
        checked: settings.ai.enabled,
        on: { change: () => this.syncSettingsDisabledState() }
      });
      this.aiAutoFallback = element("input", {
        type: "checkbox",
        name: "ai.autoFallback",
        checked: settings.ai.autoFallback
      });
      this.apiKey = element("input", {
        type: "password",
        name: "ai.apiKey",
        autocomplete: "off",
        placeholder: "sk-..."
      });
      this.aiBaseUrl = element("input", {
        type: "url",
        name: "ai.baseUrl",
        autocomplete: "off"
      });
      this.aiModel = element("input", {
        type: "text",
        name: "ai.model",
        autocomplete: "off"
      });
      this.maxContextChars = element("input", {
        type: "number",
        name: "ai.maxContextChars",
        min: "1000",
        max: "16000",
        step: "500"
      });
      this.githubEnabled = element("input", {
        type: "checkbox",
        name: "github.enabled",
        checked: settings.github.enabled,
        on: { change: () => this.syncGithubDisabledState() }
      });
      this.githubRepositoryUrl = element("input", {
        type: "text",
        name: "github.repositoryUrl",
        autocomplete: "off",
        placeholder: "https://github.com/你的用户名/my-anime-life",
        on: {
          input: () => {
            this.githubConnectionChecked = false;
            this.syncGithubRepositoryLinks();
            this.updateGithubSetupChecklist();
          },
          change: () => {
            this.githubConnectionChecked = false;
            this.syncGithubRepositoryLinks();
            this.updateGithubSetupChecklist();
          }
        }
      });
      this.githubBranch = element("input", {
        type: "text",
        name: "github.branch",
        autocomplete: "off",
        placeholder: "main",
        on: {
          input: () => {
            this.githubConnectionChecked = false;
            this.updateGithubSetupChecklist();
          }
        }
      });
      this.githubToken = element("input", {
        type: "password",
        name: "github.token",
        autocomplete: "off",
        placeholder: "github_pat_...",
        on: {
          input: () => {
            this.githubConnectionChecked = false;
            this.updateGithubSetupChecklist();
          }
        }
      });
      this.githubConnectionStatus = element("p", {
        className: "scout-note",
        text: "尚未检查仓库连接。"
      });
      this.githubTemplateStatus = element("p", {
        className: "scout-note",
        attrs: {
          "aria-live": "polite"
        },
        text: "模板状态尚未检查。创建个人仓库前建议先确认。"
      });
      this.githubTemplateCheckButton = button(
        "检查模板",
        RefreshCw,
        () => this.runGithubTemplateCheck()
      );
      this.githubCheckButton = button(
        "检查连接",
        RefreshCw,
        () => this.runGithubConnectionCheck()
      );
      this.githubOpenRepoLink = element(
        "a",
        {
          className: "scout-button",
          attrs: {
            href: "#",
            target: "_blank",
            rel: "noreferrer",
            hidden: ""
          }
        },
        [icon(Github), "打开仓库"]
      );
      this.githubPagesLink = element(
        "a",
        {
          className: "scout-button",
          attrs: {
            href: GITHUB_PAGES_DOCS_URL,
            target: "_blank",
            rel: "noreferrer"
          }
        },
        [icon(GitBranch), "Pages 设置说明"]
      );
      const setupStep = (label) => {
        const status = element("span", {
          className: "scout-setup-state",
          text: "待完成"
        });
        return {
          row: element("div", { className: "scout-setup-step" }, [
            icon(Check),
            element("span", { text: label }),
            status
          ]),
          status
        };
      };
      this.githubRepositoryStep = setupStep("填写个人数据仓库");
      this.githubTokenStep = setupStep("填写仓库专用 Token");
      this.githubConnectionStep = setupStep("检查仓库连接");
      this.githubSyncStep = setupStep("完成首次同步");
      this.githubSetupSummary = element("p", {
        className: "scout-setup-summary",
        text: "配置进度 0/4"
      });
      this.githubSetupChecklist = element("div", {
        className: "scout-setup-checklist",
        attrs: { "aria-label": "GitHub 配置进度" }
      }, [
        this.githubRepositoryStep.row,
        this.githubTokenStep.row,
        this.githubConnectionStep.row,
        this.githubSyncStep.row,
        this.githubSetupSummary
      ]);
      this.settingsFooterStatus = element("span", {
        className: "scout-footer-status",
        text: "设置保存在油猴扩展中"
      });
      this.saveButton = button(
        "保存",
        Save,
        () => this.saveSettings(),
        { variant: "primary", type: "button" }
      );
      this.resetButton = button(
        "重置",
        RotateCcw,
        () => this.resetSettings()
      );
      this.settingsView = element(
        "form",
        {
          className: "scout-view",
          attrs: {
            "data-view": "settings"
          },
          on: {
            submit: (event) => {
              event.preventDefault();
              this.saveSettings();
            }
          }
        },
        [
          element("section", { className: "scout-section" }, [
            element("h3", { className: "scout-section-title" }, [
              icon(Database),
              "本地索引"
            ]),
            this.switchRow("启用番剧缓存索引", this.indexEnabled),
            this.field("索引来源", this.indexSource),
            this.customUrlField,
            this.field("更新频率", this.updateFrequency),
            element("div", { className: "scout-actions" }, [
              this.updateIndexButton,
              this.clearIndexButton
            ]),
            this.indexStatusLine
          ]),
          element("section", { className: "scout-section" }, [
            element("h3", { className: "scout-section-title" }, [
              icon(SlidersHorizontal),
              "匹配"
            ]),
            this.switchRow("启用正则标题候选", this.regexCandidates),
            element("div", { className: "scout-range-head" }, [
              element("span", { className: "scout-range-label", text: "模糊搜索阈值" }),
              this.fuzzyOutput
            ]),
            this.fuzzyThreshold,
            element("p", {
              className: "scout-note",
              text: "数值越低越严格，建议保持 0.35 至 0.5。"
            }),
            element("div", { className: "scout-range-head" }, [
              element("span", {
                className: "scout-range-label",
                text: "AI 自动兜底阈值"
              }),
              this.autoAiOutput
            ]),
            this.autoAiThreshold
          ]),
          element("section", { className: "scout-section" }, [
            element("h3", { className: "scout-section-title" }, [
              icon(KeyRound),
              "DeepSeek"
            ]),
            this.switchRow("启用 AI 识别", this.aiEnabled),
            this.switchRow("低置信度时自动调用", this.aiAutoFallback),
            this.field("API Key", this.apiKey),
            element("div", { className: "scout-field-grid" }, [
              this.field("API 地址", this.aiBaseUrl),
              this.field("模型", this.aiModel)
            ]),
            this.field("页面上下文上限（字符）", this.maxContextChars),
            element("p", {
              className: "scout-note",
              text: "密钥仅保存在本机 Tampermonkey 存储中，不会写入当前 Git 仓库。"
            })
          ]),
          element("section", { className: "scout-section" }, [
            element("h3", { className: "scout-section-title" }, [
              icon(Github),
              "GitHub 番剧仓库"
            ]),
            element("div", { className: "scout-onboarding" }, [
              element("h4", { text: "先区分两个仓库" }),
              element("div", { className: "scout-repo-roles" }, [
                element("div", { className: "scout-repo-role" }, [
                  element("span", {
                    className: "scout-repo-role-label",
                    text: "公开模板仓库"
                  }),
                  element("strong", { text: TEMPLATE_REPOSITORY }),
                  element("small", {
                    text: "只提供代码、页面和脚本，不要填写到同步地址。"
                  })
                ]),
                element("div", {
                  className: "scout-repo-role scout-repo-role-own"
                }, [
                  element("span", {
                    className: "scout-repo-role-label",
                    text: "你的个人数据仓库"
                  }),
                  element("strong", { text: "owner/my-anime-life" }),
                  element("small", {
                    text: "评分、评价和 JSONL 记录都保存到这里。"
                  })
                ])
              ]),
              element("h4", { text: "四步完成配置" }),
              element("ol", {}, [
                element("li", {
                  text: "点击“用模板新建”，创建自己的个人数据仓库。推荐命名为 my-anime-life；不要直接 Fork 模板。"
                }),
                element("li", {
                  text: "创建 Fine-grained Token，只授权这个个人数据仓库，权限设为 Contents: Read and write；Token 不是账户密码。"
                }),
                element("li", {
                  text: "填写个人数据仓库地址、分支和 Token。Token 只保存在本机 Tampermonkey 存储中。"
                }),
                element("li", {
                  text: "点击“检查连接”，成功后保存。如果希望发布展示页，再把仓库 Pages 来源设为 GitHub Actions。"
                })
              ]),
              element("div", { className: "scout-onboarding-actions" }, [
                this.githubTemplateCheckButton,
                element(
                  "a",
                  {
                    className: "scout-button",
                    attrs: {
                      href: TEMPLATE_GENERATE_URL,
                      target: "_blank",
                      rel: "noreferrer"
                    }
                  },
                  [icon(GitFork), "用模板新建"]
                ),
                element(
                  "a",
                  {
                    className: "scout-button",
                    attrs: {
                      href: FINE_GRAINED_TOKEN_URL,
                      target: "_blank",
                      rel: "noreferrer"
                    }
                  },
                  [icon(ShieldCheck), "创建 Token"]
                ),
                element(
                  "a",
                  {
                    className: "scout-button",
                    attrs: {
                      href: GITHUB_PAGES_DOCS_URL,
                      target: "_blank",
                      rel: "noreferrer"
                    }
                  },
                  [icon(CircleHelp), "Pages 帮助"]
                )
              ]),
              this.githubTemplateStatus,
              this.githubSetupChecklist
            ]),
            this.switchRow("启用 GitHub 同步", this.githubEnabled),
            this.field("仓库地址", this.githubRepositoryUrl),
            element("div", { className: "scout-field-grid" }, [
              this.field("分支", this.githubBranch),
              this.field("细粒度 Token", this.githubToken)
            ]),
            element("div", { className: "scout-actions" }, [
              this.githubCheckButton,
              this.githubOpenRepoLink,
              this.githubPagesLink
            ]),
            this.githubConnectionStatus,
            element("p", {
              className: "scout-note",
              text: "同步地址必须填写你从模板生成的个人数据仓库，不能填写公开模板仓库。Fork 会复制公开分支和旧提交，无法只排除数据文件，因此不推荐。"
            })
          ]),
          element("footer", { className: "scout-footer" }, [
            this.settingsFooterStatus,
            element("div", { className: "scout-footer-actions" }, [
              this.resetButton,
              this.saveButton
            ])
          ])
        ]
      );
      this.populateSettings(settings);
      return this.settingsView;
    }
    field(label, control) {
      return element("label", { className: "scout-field" }, [
        element("span", { text: label }),
        control
      ]);
    }
    switchRow(label, control) {
      return element("label", { className: "scout-switch" }, [
        element("span", { text: label }),
        control
      ]);
    }
    populateSettings(settings, options = {}) {
      const preserveGithubConnection = options.preserveGithubConnection === true && this.githubConnectionChecked;
      this.githubConnectionChecked = preserveGithubConnection;
      this.indexEnabled.checked = settings.index.enabled;
      this.indexSource.value = settings.index.source;
      this.customIndexUrl.value = settings.index.customIndexUrl;
      this.updateFrequency.value = settings.index.updateFrequency;
      this.regexCandidates.checked = settings.matching.useRegexCandidates;
      this.fuzzyThreshold.value = settings.matching.fuzzyThreshold;
      this.fuzzyOutput.value = Number(settings.matching.fuzzyThreshold).toFixed(2);
      this.autoAiThreshold.value = settings.matching.autoAiThreshold;
      this.autoAiOutput.value = Number(settings.matching.autoAiThreshold).toFixed(2);
      this.aiEnabled.checked = settings.ai.enabled;
      this.aiAutoFallback.checked = settings.ai.autoFallback;
      this.apiKey.value = settings.ai.apiKey;
      this.aiBaseUrl.value = settings.ai.baseUrl;
      this.aiModel.value = settings.ai.model;
      this.maxContextChars.value = settings.ai.maxContextChars;
      this.githubEnabled.checked = settings.github.enabled;
      this.githubRepositoryUrl.value = settings.github.repositoryUrl;
      this.githubBranch.value = settings.github.branch;
      this.githubToken.value = settings.github.token;
      this.githubLastSyncedAt = settings.github.lastSyncedAt;
      if (!preserveGithubConnection) {
        this.githubConnectionStatus.textContent = this.githubLastSyncedAt ? `上次 GitHub 保存：${formatRecordTime(this.githubLastSyncedAt)}` : "尚未检查仓库连接。";
        delete this.githubConnectionStatus.dataset.tone;
      }
      this.githubTemplateStatus.textContent = "模板状态尚未检查。创建个人仓库前建议先确认。";
      delete this.githubTemplateStatus.dataset.tone;
      this.syncCustomUrlVisibility();
      this.syncSettingsDisabledState();
      this.syncGithubRepositoryLinks();
      this.syncGithubDisabledState();
      this.updateGithubSetupChecklist();
    }
    syncCustomUrlVisibility() {
      this.customUrlField.hidden = this.indexSource.value !== INDEX_SOURCES.CUSTOM;
    }
    syncSettingsDisabledState() {
      const indexControlsDisabled = !this.indexEnabled.checked;
      this.indexSource.disabled = indexControlsDisabled;
      this.updateFrequency.disabled = indexControlsDisabled;
      this.clearIndexButton.disabled = indexControlsDisabled;
      this.customIndexUrl.disabled = indexControlsDisabled || this.indexSource.value !== INDEX_SOURCES.CUSTOM;
      const aiDisabled = !this.aiEnabled.checked;
      this.aiAutoFallback.disabled = aiDisabled;
      this.apiKey.disabled = aiDisabled;
      this.aiBaseUrl.disabled = aiDisabled;
      this.aiModel.disabled = aiDisabled;
      this.maxContextChars.disabled = aiDisabled;
      this.aiButton.disabled = this.busy;
    }
    syncGithubRepositoryLinks() {
      let repository = null;
      try {
        repository = parseGithubRepository(this.githubRepositoryUrl.value);
      } catch {
        this.githubOpenRepoLink.hidden = true;
        this.githubOpenRepoLink.setAttribute("href", "#");
        this.githubPagesLink.href = GITHUB_PAGES_DOCS_URL;
        this.githubPagesLink.lastChild.textContent = "Pages 设置说明";
        return;
      }
      this.githubOpenRepoLink.hidden = false;
      this.githubOpenRepoLink.href = repository.webUrl;
      this.githubPagesLink.href = `${repository.webUrl}/settings/pages`;
      this.githubPagesLink.lastChild.textContent = "Pages 设置";
    }
    syncGithubDisabledState() {
      const githubDisabled = !this.githubEnabled.checked;
      this.githubRepositoryUrl.disabled = githubDisabled;
      this.githubBranch.disabled = githubDisabled;
      this.githubToken.disabled = githubDisabled;
      this.githubCheckButton.disabled = githubDisabled || this.githubConnectionChecking;
    }
    setGithubSetupStep(step, state, text) {
      step.row.dataset.state = state;
      step.status.textContent = text;
    }
    updateGithubSetupChecklist() {
      if (!this.githubSetupChecklist) {
        return;
      }
      let repository = null;
      let repositoryState = "pending";
      let repositoryText = "待填写";
      try {
        repository = parseGithubRepository(this.githubRepositoryUrl.value);
        if (repository.fullName.toLocaleLowerCase() === TEMPLATE_REPOSITORY.toLocaleLowerCase()) {
          repositoryState = "bad";
          repositoryText = "不能使用模板仓库";
        } else {
          repositoryState = "ready";
          repositoryText = repository.fullName;
        }
      } catch {
        repositoryText = this.githubRepositoryUrl.value.trim() ? "地址格式有误" : "待填写";
      }
      const tokenReady = Boolean(this.githubToken.value.trim());
      const connectionReady = this.githubConnectionChecked && repositoryState === "ready" && tokenReady;
      const syncReady = Boolean(this.githubLastSyncedAt);
      this.setGithubSetupStep(
        this.githubRepositoryStep,
        repositoryState,
        repositoryText
      );
      this.setGithubSetupStep(
        this.githubTokenStep,
        tokenReady ? "ready" : "pending",
        tokenReady ? "已填写" : "待填写"
      );
      this.setGithubSetupStep(
        this.githubConnectionStep,
        connectionReady ? "ready" : "pending",
        connectionReady ? "连接正常" : "待检查"
      );
      this.setGithubSetupStep(
        this.githubSyncStep,
        syncReady ? "ready" : "pending",
        syncReady ? formatRecordTime(this.githubLastSyncedAt) : "待完成"
      );
      const completed = [
        repositoryState === "ready",
        tokenReady,
        connectionReady,
        syncReady
      ].filter(Boolean).length;
      this.githubSetupSummary.textContent = `配置进度 ${completed}/4`;
      if (repositoryState === "bad") {
        this.githubSetupSummary.textContent += " · 同步地址不能是公开模板仓库";
      }
    }
    collectGithubSettings() {
      return {
        enabled: this.githubEnabled.checked,
        repositoryUrl: this.githubRepositoryUrl.value.trim(),
        branch: this.githubBranch.value.trim() || "main",
        token: this.githubToken.value.trim(),
        lastSyncedAt: this.githubLastSyncedAt
      };
    }
    githubRecordConfig(settings = this.settingsStore.get()) {
      const github = settings?.github ?? {};
      if (!github.enabled || !String(github.repositoryUrl ?? "").trim()) {
        return null;
      }
      try {
        parseGithubRepository(github.repositoryUrl);
        return github;
      } catch {
        return null;
      }
    }
    saveSettings(options = {}) {
      const previous = this.settingsStore.get();
      const settings = this.settingsStore.update({
        index: {
          enabled: this.indexEnabled.checked,
          source: this.indexSource.value,
          customIndexUrl: this.customIndexUrl.value,
          updateFrequency: this.updateFrequency.value
        },
        matching: {
          useRegexCandidates: this.regexCandidates.checked,
          fuzzyThreshold: Number(this.fuzzyThreshold.value),
          autoAiThreshold: Number(this.autoAiThreshold.value)
        },
        ai: {
          enabled: this.aiEnabled.checked,
          autoFallback: this.aiAutoFallback.checked,
          apiKey: this.apiKey.value,
          baseUrl: this.aiBaseUrl.value,
          model: this.aiModel.value,
          maxContextChars: Number(this.maxContextChars.value)
        },
        github: this.collectGithubSettings()
      });
      this.populateSettings(settings, {
        preserveGithubConnection: true
      });
      if (options.quiet !== true) {
        this.showToast("设置已保存");
      }
      if (options.notify !== false) {
        this.onSettingsSaved?.(settings, previous);
      }
      if (this.currentResult?.context?.pageKind === "bilibili-follow" && this.batchSection) {
        this.renderBatchCards();
      }
      if (options.reloadGithub !== false && this.recordItem?.id && this.githubRecordConfig(settings)) {
        this.loadRemoteRecordForCurrentItem();
      }
      return settings;
    }
    resetSettings() {
      const previous = this.settingsStore.get();
      const settings = this.settingsStore.reset();
      this.populateSettings(settings);
      this.showToast("设置已恢复默认值");
      this.onSettingsSaved?.(settings, previous);
      this.recordLoadRequestId += 1;
      this.recordRemoteRecord = null;
      this.setRecordRemoteLink(null);
      this.syncRecordGithubState();
      if (this.currentResult?.context?.pageKind === "bilibili-follow" && this.batchSection) {
        this.renderBatchCards();
      }
    }
    async runGithubTemplateCheck() {
      if (!this.githubRecords || this.githubTemplateChecking) {
        return;
      }
      this.githubTemplateChecking = true;
      this.githubTemplateCheckButton.classList.add("is-loading");
      this.githubTemplateCheckButton.disabled = true;
      this.githubTemplateStatus.textContent = "正在检查公开模板仓库…";
      delete this.githubTemplateStatus.dataset.tone;
      try {
        const result = await this.githubRecords.checkTemplateRepository();
        if (result.ready && result.defaultBranch === "main") {
          this.githubTemplateStatus.textContent = `${result.fullName} 已公开并启用 Template · 默认分支 main`;
          this.githubTemplateStatus.dataset.tone = "good";
        } else {
          const issues = [];
          if (result.private) {
            issues.push("仓库不是公开状态");
          }
          if (!result.isTemplate) {
            issues.push("尚未启用 Template repository");
          }
          if (result.defaultBranch !== "main") {
            issues.push(`默认分支为 ${result.defaultBranch}`);
          }
          this.githubTemplateStatus.textContent = `模板尚未就绪：${issues.join("；")}`;
          this.githubTemplateStatus.dataset.tone = "bad";
        }
      } catch (error) {
        this.githubTemplateStatus.textContent = `模板检查失败：${toErrorMessage(error)}`;
        this.githubTemplateStatus.dataset.tone = "bad";
      } finally {
        this.githubTemplateChecking = false;
        this.githubTemplateCheckButton.classList.remove("is-loading");
        this.githubTemplateCheckButton.disabled = false;
      }
    }
    async runGithubConnectionCheck() {
      if (!this.githubRecords || this.githubConnectionChecking) {
        return;
      }
      const token = this.githubToken.value.trim();
      if (!token) {
        this.githubConnectionChecked = false;
        this.githubConnectionStatus.textContent = "请先填写仅限个人数据仓库的细粒度 Token。未认证的 GitHub API 很容易触发限流。";
        this.githubConnectionStatus.dataset.tone = "bad";
        this.githubToken.focus();
        this.updateGithubSetupChecklist();
        return;
      }
      try {
        const repository = parseGithubRepository(
          this.githubRepositoryUrl.value
        );
        if (repository.fullName.toLocaleLowerCase() === TEMPLATE_REPOSITORY.toLocaleLowerCase()) {
          this.githubConnectionChecked = false;
          this.githubConnectionStatus.textContent = "当前填写的是公开模板仓库。请先用“用模板新建”创建个人数据仓库，再填写新仓库地址。";
          this.githubConnectionStatus.dataset.tone = "bad";
          this.updateGithubSetupChecklist();
          return;
        }
      } catch (error) {
        this.githubConnectionChecked = false;
        this.githubConnectionStatus.textContent = toErrorMessage(error);
        this.githubConnectionStatus.dataset.tone = "bad";
        this.updateGithubSetupChecklist();
        return;
      }
      this.githubConnectionChecking = true;
      this.githubCheckButton.classList.add("is-loading");
      this.githubConnectionStatus.textContent = "正在检查 GitHub 仓库…";
      delete this.githubConnectionStatus.dataset.tone;
      this.syncGithubDisabledState();
      try {
        const result = await this.githubRecords.checkConnection({
          enabled: this.githubEnabled.checked,
          repositoryUrl: this.githubRepositoryUrl.value,
          branch: this.githubBranch.value,
          token
        });
        if (result.canWrite === false) {
          this.githubConnectionChecked = false;
          this.githubConnectionStatus.textContent = "仓库可访问，但 Token 没有 Contents 写权限。请编辑 Token，将 Contents 设为 Read and write。";
          this.githubConnectionStatus.dataset.tone = "bad";
          return;
        }
        this.githubConnectionChecked = true;
        const visibility = result.private ? "私有仓库" : "公开仓库";
        const accessLabel = result.canWrite === true ? "可读写" : "可访问 · 写权限待实际同步确认";
        this.githubConnectionStatus.textContent = `${result.fullName} ${accessLabel} · ${visibility} · 默认分支 ${result.defaultBranch}`;
        this.githubConnectionStatus.dataset.tone = "good";
      } catch (error) {
        this.githubConnectionChecked = false;
        this.githubConnectionStatus.textContent = `连接失败：${toErrorMessage(error)}`;
        this.githubConnectionStatus.dataset.tone = "bad";
      } finally {
        this.githubConnectionChecking = false;
        this.githubCheckButton.classList.remove("is-loading");
        this.syncGithubDisabledState();
        this.updateGithubSetupChecklist();
      }
    }
    async runIndexUpdate() {
      this.updateIndexButton.disabled = true;
      try {
        await this.onUpdateIndex?.();
      } catch (error) {
        this.showToast(error.message);
      } finally {
        this.updateIndexButton.disabled = !this.indexEnabled.checked;
      }
    }
    async runClearIndex() {
      this.clearIndexButton.disabled = true;
      try {
        await this.onClearIndex?.();
        this.showToast("本地索引缓存已清除");
      } catch (error) {
        this.showToast(error.message);
      } finally {
        this.clearIndexButton.disabled = !this.indexEnabled.checked;
      }
    }
    setIndexState(state) {
      this.indexState = state;
      const version = state.sourceVersion ? ` · ${state.sourceVersion}` : "";
      const count = state.itemCount ? ` · ${state.itemCount.toLocaleString("zh-CN")} 条` : "";
      this.panelStatus.textContent = `${state.message}${count}${version}`;
      this.launcherDot.dataset.tone = stateTone(state.status);
      if (this.indexStatusLine) {
        this.indexStatusLine.textContent = `${state.message}${count}${version}`;
      }
      if (this.settingsFooterStatus) {
        this.settingsFooterStatus.textContent = state.status === INDEX_STATES.READY ? "设置保存在油猴扩展中" : state.message;
      }
      this.settingsWindowStatus.textContent = state.message;
      if (this.updateIndexButton) {
        this.updateIndexButton.disabled = !this.settingsStore.get().index.enabled || state.status === INDEX_STATES.UPDATING || state.status === INDEX_STATES.CHECKING;
      }
    }
    setBusy(busy, message = "正在识别") {
      this.busy = busy;
      this.rescanButton.disabled = busy;
      this.aiButton.disabled = busy;
      this.panel.setAttribute("aria-busy", busy ? "true" : "false");
      this.rescanIcon.classList.toggle("scout-spin", busy);
      if (this.rescanButtonTextNode) {
        this.rescanButtonTextNode.textContent = busy ? "正在识别" : this.currentResult ? "重新识别" : "识别当前页";
      }
      if (busy) {
        this.resultBadge.textContent = message;
        this.resultBadge.dataset.tone = "none";
      }
    }
    setResult(result, options = {}) {
      this.currentResult = result;
      const cachedDraft = options.ignoreCachedSelection ? null : this.recognitionCache?.get(location.href) ?? null;
      const cachedSelection = cachedDraft?.selectedResult?.item?.id ? cachedDraft.selectedResult : cachedDraft?.item?.id ? {
        item: cachedDraft.item,
        confidence: 0,
        matchedBy: ["local-cache"]
      } : null;
      this.selectedResult = cachedSelection ? {
        ...cachedSelection,
        bilibiliMetadata: result.bilibiliMetadata ?? cachedSelection.bilibiliMetadata ?? null,
        manualSelection: true,
        selectionSource: "local-cache"
      } : result.best ? {
        ...result.best,
        bilibiliMetadata: result.bilibiliMetadata ?? null,
        selectionSource: "automatic"
      } : null;
      this.recordDirty = false;
      this.candidateCollapsed = false;
      this.batchCards = [];
      this.batchSelectedIds.clear();
      this.batchVisibleLimit = 50;
      this.batchLoading = false;
      this.batchImporting = false;
      this.batchMessage = "";
      this.batchMessageTone = "";
      this.batchDiagnostics = [];
      this.batchTotal = 0;
      this.batchProgress = null;
      clearTimeout(this.batchProgressRenderTimer);
      this.batchProgressRenderTimer = null;
      this.batchScanRequestId += 1;
      this.renderRecognitionResult(result);
      if (this.recordItem?.id) {
        this.persistRecognitionDraft({ silent: true });
      }
      if (cachedSelection) {
        this.showToast("已恢复本机尚未同步的识别草稿");
      }
      if (this.rescanButtonTextNode) {
        this.rescanButtonTextNode.textContent = "重新识别";
      }
    }
    renderRecognitionResult(result) {
      this.resultListSection.hidden = false;
      this.renderSelectedResult();
      this.renderTitleCandidates(result.titleCandidates);
      this.renderEvidence(result);
      this.renderDiagnostics(result.diagnostics);
      this.scheduleBatchCards();
    }
    renderSelectedResult() {
      const result = this.currentResult ?? {
        aiResult: null,
        results: [],
        status: "unmatched",
        titleCandidates: []
      };
      const selected = this.selectedResult;
      const item = selected?.item ?? null;
      const aiTitle = result.aiResult?.title;
      const fallbackTitle = result.titleCandidates?.[0]?.title;
      const title = itemDisplayTitle2(item) || aiTitle || fallbackTitle || "未识别到番剧";
      const confidence = selected?.confidence ?? result.aiResult?.confidence ?? 0;
      const statusLabels = {
        matched: "精确匹配",
        ambiguous: "可能匹配",
        unmatched: "未找到可靠匹配"
      };
      this.resultTitle.textContent = title;
      this.resultBadge.textContent = selected?.manualSelection ? "已选定候选" : statusLabels[result.status] ?? "识别完成";
      this.resultBadge.dataset.tone = confidenceTone(confidence);
      if (item) {
        const displayTitle = itemDisplayTitle2(item);
        const alternateNames = item.names.filter((name) => name !== displayTitle).slice(0, 3);
        const metadata = [
          seasonLabelFromItem(item),
          item.year,
          TYPE_LABELS[item.type] ?? item.type,
          alternateNames.join(" / ")
        ].filter(Boolean);
        this.resultSubtitle.textContent = metadata.join(" · ") || "已命中本地番剧索引";
      } else if (result.aiResult?.reason) {
        this.resultSubtitle.textContent = result.aiResult.reason;
      } else if (fallbackTitle) {
        this.resultSubtitle.textContent = `页面标题候选：${fallbackTitle}`;
      } else {
        this.resultSubtitle.textContent = "当前页面没有足够的番剧信息。";
      }
      const bilibiliId = item?.sites?.bilibili;
      this.siteLink.hidden = !bilibiliId;
      if (bilibiliId) {
        this.siteLink.href = `https://www.bilibili.com/bangumi/media/md${bilibiliId}`;
      }
      this.renderSelectedCover(item);
      this.renderResultRows(this.resultList, result.results, {
        emptyText: "本地索引没有返回候选，可尝试手动搜索或 AI 识别。",
        selectedId: item?.id ?? null,
        onSelect: (row) => this.selectResultRow(row, "候选结果")
      });
      this.renderPersonalRecord(item);
    }
    setSelectedCover(url) {
      const safeUrl = normalizeCoverUrl(url);
      this.currentCoverUrl = safeUrl;
      this.coverFrame.disabled = !safeUrl;
      this.coverFrame.classList.toggle("has-cover", Boolean(safeUrl));
      this.coverFrame.hidden = !safeUrl;
      this.resultHead.classList.toggle("has-cover", Boolean(safeUrl));
      if (safeUrl) {
        this.coverImage.src = safeUrl;
        this.coverImage.alt = this.recordItem ? `${itemDisplayTitle2(this.recordItem)} 封面` : "番剧封面";
      } else {
        this.coverImage.removeAttribute("src");
      }
    }
    renderSelectedCover(item) {
      const requestId = ++this.coverRequestId;
      const isCurrentPageItem = Boolean(item?.id) && this.currentResult?.best?.item?.id === item.id;
      const pageCoverUrl = isCurrentPageItem ? this.currentResult?.bilibiliMetadata?.coverUrl : null;
      const directUrl = normalizeCoverUrl(item?.coverUrl || pageCoverUrl);
      if (item && directUrl && !item.coverUrl) {
        item.coverUrl = directUrl;
      }
      this.setSelectedCover(directUrl);
      if (!item || item?.coverUrl || pageCoverUrl || !this.coverResolver) {
        return;
      }
      Promise.resolve(this.coverResolver(item)).then((url) => {
        if (requestId === this.coverRequestId && url) {
          item.coverUrl = normalizeCoverUrl(url);
          this.setSelectedCover(item.coverUrl);
        }
      }).catch(() => {
      });
    }
    renderResultRows(container, rows, options = {}) {
      container.replaceChildren();
      if (!rows?.length) {
        container.append(
          element("div", {
            className: "scout-empty",
            text: options.emptyText ?? "没有结果"
          })
        );
        return;
      }
      for (const row of rows.slice(0, 10)) {
        const item = row.item ?? row;
        const confidence = row.confidence ?? 0;
        const methods = Array.isArray(row.matchedBy) ? row.matchedBy.join(" / ") : row.matchedBy;
        const selected = options.selectedId === item.id;
        const selectable = typeof options.onSelect === "function";
        const displayTitle = itemDisplayTitle2(item);
        const originalTitle = item.title && item.title !== displayTitle ? item.title : null;
        const content = [
          element("div", { className: "scout-list-copy" }, [
            element("div", {}, [
              element("div", {
                className: "scout-list-title",
                text: displayTitle
              }),
              element("div", {
                className: "scout-list-meta",
                text: [
                  item.year,
                  TYPE_LABELS[item.type] ?? item.type,
                  originalTitle,
                  methods
                ].filter(Boolean).join(" · ")
              })
            ])
          ]),
          element("span", { className: "scout-row-tail" }, [
            element("span", {
              className: "scout-score",
              text: options.showConfidence === false ? String(confidence) : formatConfidence(confidence)
            }),
            selectable ? element("span", {
              className: "scout-row-check",
              attrs: { "aria-hidden": "true" }
            }, [icon(Check)]) : null
          ])
        ];
        const rowNode = element(selectable ? "button" : "div", {
          className: `scout-list-row${selected ? " is-selected" : ""}`,
          dataset: { itemId: item.id },
          attrs: selectable ? {
            type: "button",
            "aria-pressed": selected ? "true" : "false"
          } : {},
          on: selectable ? { click: () => options.onSelect(row) } : {}
        }, content);
        container.append(rowNode);
      }
    }
    renderTitleCandidates(candidates) {
      const rows = (candidates ?? []).slice(0, 8);
      this.titleCandidateSection.hidden = rows.length === 0;
      this.titleCandidateList.replaceChildren();
      for (const candidate of rows) {
        this.titleCandidateList.append(
          element(
            "button",
            {
              className: "scout-suggestion",
              dataset: { source: candidate.source },
              attrs: {
                type: "button",
                title: `${candidate.title} · ${sourceLabel(candidate.source)}`
              },
              on: { click: () => this.useTitleCandidate(candidate) }
            },
            [
              element("span", {
                className: "scout-suggestion-title",
                text: candidate.title
              }),
              element("span", {
                className: "scout-suggestion-source",
                text: sourceLabel(candidate.source)
              })
            ]
          )
        );
      }
    }
    renderEvidence(result) {
      const context = result.context ?? {};
      const evidence = [];
      if (context.summary) {
        evidence.push({ icon: List, label: "简介已读取" });
      }
      if (context.comments?.length) {
        evidence.push({
          icon: MessageSquareText,
          label: `评论 ${context.comments.length} 条`
        });
      }
      if (context.titleMentions?.length) {
        evidence.push({
          icon: Sparkles,
          label: `标题线索 ${context.titleMentions.length} 条`
        });
      }
      if (result.aiResult) {
        evidence.push({ icon: Bot, label: "AI 已参与" });
      }
      this.evidenceStrip.replaceChildren();
      this.evidenceStrip.hidden = evidence.length === 0;
      for (const entry of evidence) {
        this.evidenceStrip.append(
          element("span", { className: "scout-evidence-item" }, [
            icon(entry.icon),
            entry.label
          ])
        );
      }
    }
    selectResultRow(row, selectionSource = "候选结果") {
      if (!row?.item?.id) {
        return;
      }
      const usesCurrentBilibiliItem = row.item.id === this.currentResult?.best?.item?.id;
      this.selectedResult = {
        ...row,
        bilibiliMetadata: usesCurrentBilibiliItem ? this.currentResult?.bilibiliMetadata ?? null : null,
        manualSelection: true,
        selectionSource
      };
      this.recordDirty = false;
      this.renderSelectedResult();
      this.renderBatchCards();
      this.renderManualSearchRows(this.manualSearchRows);
      this.collapseCandidatesForRecord();
      this.showToast(`已选择：${itemDisplayTitle2(row.item)}`);
    }
    collapseCandidatesForRecord() {
      this.candidateCollapsed = true;
      this.manualSearchSection.hidden = true;
      this.batchSection.hidden = true;
      this.resultListSection.hidden = true;
      this.titleCandidateSection.hidden = true;
      this.recordSection.hidden = false;
      requestAnimationFrame(() => {
        this.recordSection.scrollIntoView({
          block: "nearest",
          behavior: "smooth"
        });
        this.recordSection.focus({ preventScroll: true });
      });
    }
    showCandidateSelection() {
      this.candidateCollapsed = false;
      this.resultListSection.hidden = false;
      this.titleCandidateSection.hidden = this.titleCandidateList.childElementCount === 0;
      this.batchSection.hidden = this.batchList.childElementCount === 0;
      const hasManualQuery = Boolean(this.searchInput.value.trim());
      this.manualSearchSection.hidden = !hasManualQuery;
      const target = hasManualQuery ? this.manualSearchSection : this.resultListSection;
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (hasManualQuery) {
        this.searchInput.focus({ preventScroll: true });
      }
    }
    useTitleCandidate(candidate) {
      const rows = this.recognizer.search(candidate.title, { limit: 10 });
      this.searchInput.value = candidate.title;
      this.manualSearchSection.hidden = false;
      this.renderManualSearchRows(rows);
      if (!rows.length) {
        this.showToast(`索引中没有找到“${candidate.title}”`);
        return;
      }
      this.selectResultRow(rows[0], "识别线索");
    }
    renderManualSearchRows(rows = this.manualSearchRows) {
      this.manualSearchRows = rows;
      this.renderResultRows(this.manualSearchResults, rows, {
        emptyText: "没有搜索到番剧。",
        selectedId: this.selectedResult?.item?.id ?? null,
        onSelect: (row) => this.selectResultRow(row, "索引搜索")
      });
    }
    scheduleRecognitionDraftSave(delay = 300) {
      clearTimeout(this.draftSaveTimer);
      if (!this.recordItem?.id) {
        return;
      }
      this.draftSaveTimer = setTimeout(() => {
        this.draftSaveTimer = null;
        this.persistRecognitionDraft();
      }, delay);
    }
    persistRecognitionDraft(options = {}) {
      const item = this.recordItem;
      if (!item?.id) {
        return null;
      }
      const record = {
        rating: this.recordRating,
        review: this.reviewInput.value
      };
      const saved = this.personalRecordStore?.save(item.id, record);
      const draft = this.recognitionCache?.save(location.href, {
        item,
        selectedResult: this.selectedResult?.item?.id === item.id ? this.selectedResult : null,
        recognitionResult: this.currentResult,
        ...record
      });
      this.recordDirty = false;
      if (!options.silent) {
        const savedAt = formatRecordTime(saved?.updatedAt || draft?.updatedAt);
        this.setRecordStatus(
          savedAt ? `已缓存本机 · ${savedAt}` : "已缓存本机草稿",
          "warning"
        );
      }
      return draft;
    }
    clearPersonalRecordDraft() {
      const item = this.recordItem;
      if (!item?.id) {
        return;
      }
      clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = null;
      this.personalRecordStore?.remove(item.id);
      this.recognitionCache?.clear(location.href);
      this.recordRating = null;
      this.reviewInput.value = "";
      this.renderRecordReview();
      this.recordDirty = false;
      this.clearDuplicateWarning();
      this.syncRecordRating();
      this.setRecordStatus("本机草稿已清除");
      this.showToast("已清除当前番剧的本机草稿");
    }
    selectRating(rating) {
      if (!this.recordItem || this.busy) {
        return;
      }
      this.recordRating = this.recordRating === rating ? null : rating;
      this.enterRecordFocusMode();
      this.recordDirty = true;
      this.clearDuplicateWarning();
      this.setRecordStatus("正在缓存本机草稿", "progress");
      this.syncRecordRating();
      this.scheduleRecognitionDraftSave();
    }
    enterRecordFocusMode() {
      if (this.candidateCollapsed || !this.recordItem?.id) {
        return;
      }
      this.candidateCollapsed = true;
      this.resultListSection.hidden = true;
      this.titleCandidateSection.hidden = true;
      this.manualSearchSection.hidden = true;
      this.batchSection.hidden = true;
      this.recordSection.hidden = false;
    }
    enterRecordReviewEdit() {
      if (this.reviewInput.disabled || !this.recordItem) {
        return;
      }
      this.reviewDisplay.hidden = true;
      this.reviewInput.hidden = false;
      this.reviewInput.focus();
      const end = this.reviewInput.value.length;
      this.reviewInput.setSelectionRange?.(end, end);
    }
    renderRecordReview() {
      const text = this.reviewInput.value.trim();
      if (!text) {
        this.reviewDisplay.hidden = true;
        this.reviewInput.hidden = false;
        return;
      }
      this.reviewDisplayText.textContent = text;
      this.reviewInput.hidden = true;
      this.reviewDisplay.hidden = false;
    }
    openCoverViewer() {
      if (!this.currentCoverUrl) {
        return;
      }
      this.coverViewerImage.src = this.currentCoverUrl;
      this.coverViewerTitle.textContent = this.recordItem ? itemDisplayTitle2(this.recordItem) : "";
      this.coverViewer.hidden = false;
      this.coverViewer.querySelector("button")?.focus({ preventScroll: true });
    }
    closeCoverViewer() {
      this.coverViewer.hidden = true;
      this.coverViewerImage.removeAttribute("src");
      this.coverFrame.focus({ preventScroll: true });
    }
    syncRecordRating() {
      for (const ratingButton of this.ratingButtons) {
        const selected = Number(ratingButton.dataset.rating) === this.recordRating;
        ratingButton.classList.toggle("is-selected", selected);
        ratingButton.setAttribute("aria-checked", selected ? "true" : "false");
      }
      this.recordRatingValue.textContent = this.recordRating ? `${this.recordRating} / 10` : "未评分";
    }
    renderPersonalRecord(item) {
      const recordStoreReady = Boolean(this.personalRecordStore);
      const itemChanged = this.recordItem?.id !== item?.id;
      if (itemChanged) {
        if (this.recordDirty) {
          this.persistRecognitionDraft({ silent: true });
        }
        clearTimeout(this.draftSaveTimer);
        this.draftSaveTimer = null;
        this.recordLoadRequestId += 1;
        this.clearDuplicateWarning();
        this.recordItem = item ?? null;
        this.recordRemoteRecord = null;
        this.setRecordRemoteLink(null);
        const cachedDraft = item?.id ? this.recognitionCache?.get(location.href) : null;
        const matchingDraft = cachedDraft?.item?.id === item?.id ? cachedDraft : null;
        const record = matchingDraft ?? (item?.id ? this.personalRecordStore?.get(item.id) : null);
        this.recordRating = record?.rating ?? null;
        this.recordDirty = false;
        this.reviewInput.value = record?.review ?? "";
        this.renderRecordReview();
        this.setRecordStatus(
          matchingDraft ? "已恢复本机未同步草稿" : record?.rating || record?.review ? "已载入本地草稿" : "尚未填写",
          matchingDraft ? "warning" : ""
        );
        if (item?.id && !matchingDraft) {
          this.recognitionCache?.save(location.href, {
            item,
            selectedResult: this.selectedResult?.item?.id === item.id ? this.selectedResult : null,
            recognitionResult: this.currentResult,
            rating: record?.rating ?? null,
            review: record?.review ?? ""
          });
        }
      }
      const enabled = Boolean(item?.id && recordStoreReady);
      const displayTitle = itemDisplayTitle2(item);
      this.recordSection.hidden = !enabled;
      this.recordItemLabel.textContent = displayTitle || "先选定一个候选";
      this.recordItemLabel.title = displayTitle;
      if (this.currentCoverUrl) {
        this.coverImage.alt = displayTitle ? `${displayTitle} 封面` : "番剧封面";
        this.coverFrame.setAttribute(
          "aria-label",
          `${displayTitle || "番剧"}封面大图`
        );
      }
      this.syncRecordRating();
      this.syncRecordGithubState();
      if (itemChanged && enabled && this.githubRecordConfig(this.settingsStore.get())) {
        this.loadRemoteRecordForCurrentItem();
      }
    }
    setRecordRemoteLink(remoteRecord) {
      if (!this.recordRemoteLink) {
        return;
      }
      let href = String(remoteRecord?.htmlUrl ?? "");
      if (!href && remoteRecord?.id) {
        try {
          const repository = parseGithubRepository(
            this.settingsStore.get().github.repositoryUrl
          );
          const branch = (this.settingsStore.get().github.branch || "main").split("/").map(encodeURIComponent).join("/");
          href = `${repository.webUrl}/blob/${branch}/data/anime.jsonl`;
        } catch {
          href = "";
        }
      }
      this.recordRemoteLink.hidden = !href;
      if (href) {
        this.recordRemoteLink.href = href;
        this.recordRemoteLink.title = remoteRecord?.path ? `${remoteRecord.path} · ${remoteRecord.sha ?? ""}`.trim() : "查看 GitHub 记录";
      } else {
        this.recordRemoteLink.setAttribute("href", "#");
        this.recordRemoteLink.removeAttribute("title");
      }
    }
    syncRecordGithubState() {
      if (!this.saveRecordButtonTextNode) {
        return;
      }
      const settings = this.settingsStore.get();
      const configured = Boolean(this.githubRecordConfig(settings));
      const writable = configured && Boolean(String(settings.github.token ?? "").trim());
      const enabled = Boolean(this.recordItem?.id && this.personalRecordStore);
      this.saveRecordButtonTextNode.textContent = writable ? "同步到 GitHub" : "保存草稿";
      this.reviewInput.disabled = !enabled || this.recordSaving;
      this.saveRecordButton.disabled = !enabled || this.recordSaving;
      if (this.clearRecordButton) {
        this.clearRecordButton.disabled = !enabled || this.recordSaving;
      }
      for (const ratingButton of this.ratingButtons) {
        ratingButton.disabled = !enabled || this.recordSaving;
      }
      if (this.cancelDuplicateButton) {
        this.cancelDuplicateButton.disabled = this.recordSaving;
      }
      if (this.confirmDuplicateButton) {
        this.confirmDuplicateButton.disabled = this.recordSaving;
      }
      if (writable) {
        this.recordNote.textContent = "评分和短评会自动缓存到本机；点击同步后才会写入 GitHub，失败时缓存保留。";
      } else if (configured) {
        this.recordNote.textContent = "评分和短评会自动缓存到本机。仓库已配置但缺少 Token，请在扩展设置中补充。";
      } else {
        this.recordNote.textContent = "评分和短评会自动缓存到本机；在扩展设置中连接 GitHub 后可同步。";
      }
    }
    applyRemoteRecord(record) {
      const rating = Number(record?.rating);
      this.recordRating = record?.rating !== null && record?.rating !== "" && Number.isFinite(rating) && rating >= 0 && rating <= 10 ? Math.round(rating * 10) / 10 : null;
      this.reviewInput.value = String(record?.review ?? "");
      this.renderRecordReview();
      this.recordDirty = false;
      clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = null;
      this.recognitionCache?.clear(location.href);
      this.syncRecordRating();
      this.personalRecordStore?.save(
        this.recordItem.id,
        {
          rating: this.recordRating,
          review: this.reviewInput.value,
          updatedAt: record?.updatedAt
        },
        { preserveUpdatedAt: true }
      );
    }
    async loadRemoteRecordForCurrentItem() {
      const item = this.recordItem;
      const settings = this.settingsStore.get();
      if (!item?.id || !this.githubRecords || !this.githubRecordConfig(settings)) {
        this.recordRemoteRecord = null;
        this.setRecordRemoteLink(null);
        this.syncRecordGithubState();
        return;
      }
      const requestId = ++this.recordLoadRequestId;
      const selectedResult = this.selectedResult?.item?.id === item.id ? this.selectedResult : null;
      this.setRecordStatus("本地草稿已载入 · 正在读取 GitHub", "progress");
      try {
        const remote = await this.githubRecords.loadForItem(
          item,
          selectedResult
        );
        if (requestId !== this.recordLoadRequestId || this.recordItem?.id !== item.id) {
          return;
        }
        this.recordRemoteRecord = remote;
        this.setRecordRemoteLink(remote);
        if (!remote) {
          this.setRecordStatus(
            hasRecordContent(this.personalRecordStore?.get(item.id)) ? "已载入本地草稿 · GitHub 尚无记录" : "尚未填写 · GitHub 尚无记录",
            "warning"
          );
          return;
        }
        const local = this.personalRecordStore?.get(item.id);
        if (this.recordDirty) {
          this.setRecordStatus(
            "GitHub 记录已载入，当前编辑尚未覆盖",
            "warning"
          );
          return;
        }
        if (!hasRecordContent(local) || recordTimestamp(remote.record) >= recordTimestamp(local)) {
          this.applyRemoteRecord(remote.record);
          const updatedAt = formatRecordTime(remote.record?.updatedAt);
          this.setRecordStatus(
            updatedAt ? `已从 GitHub 载入 · ${updatedAt}` : "已从 GitHub 载入",
            "success"
          );
        } else {
          this.setRecordStatus(
            "本地草稿较新 · 保存时将同步到 GitHub",
            "warning"
          );
        }
      } catch (error) {
        if (requestId !== this.recordLoadRequestId || this.recordItem?.id !== item.id) {
          return;
        }
        const local = this.personalRecordStore?.get(item.id);
        this.setRecordStatus(
          hasRecordContent(local) ? "本地草稿可用 · GitHub 读取失败" : "尚未填写 · GitHub 读取失败",
          "error"
        );
        this.showToast(
          hasRecordContent(local) ? `无法读取远端记录。本地草稿仍然保留。
${toErrorMessage(error)}` : `无法读取远端记录。
${toErrorMessage(error)}`,
          {
            tone: "error",
            title: "GitHub 读取失败"
          }
        );
      } finally {
        this.syncRecordGithubState();
      }
    }
    async savePersonalRecord() {
      if (!this.recordItem?.id || !this.personalRecordStore) {
        return;
      }
      clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = null;
      const item = this.recordItem;
      const selectedResult = this.selectedResult?.item?.id === item.id ? this.selectedResult : null;
      const rating = this.recordRating;
      const review = this.reviewInput.value;
      await this.resolveItemCover(item);
      this.recordLoadRequestId += 1;
      const saved = this.personalRecordStore.save(item.id, {
        rating: this.recordRating,
        review: this.reviewInput.value
      });
      if (!saved) {
        this.setRecordStatus("本机草稿保存失败", "error");
        this.showToast("无法写入浏览器本机存储，请检查脚本存储权限。", {
          tone: "error",
          title: "草稿保存失败"
        });
        return;
      }
      this.recordDirty = false;
      this.recognitionCache?.save(location.href, {
        item,
        selectedResult,
        recognitionResult: this.currentResult,
        rating,
        review,
        updatedAt: saved.updatedAt
      });
      const savedAt = new Date(
        saved.updatedAt
      ).toLocaleString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit"
      });
      this.setRecordStatus(`本地草稿已保存 · ${savedAt}`, "warning");
      this.saveRecordButton.classList.add("is-confirmed");
      setTimeout(
        () => this.saveRecordButton.classList.remove("is-confirmed"),
        500
      );
      const settings = this.settingsStore.get();
      const writable = this.githubRecordConfig(settings) && Boolean(String(settings.github.token ?? "").trim());
      if (!writable || !this.githubRecords) {
        this.syncRecordGithubState();
        this.showToast("评分与短评已保存为本地草稿，刷新页面后仍可恢复。", {
          tone: "success",
          title: "草稿已保存"
        });
        return;
      }
      const saveRequest = {
        item,
        selectedResult,
        aiResult: this.currentResult?.aiResult ?? null,
        rating,
        review
      };
      this.pendingGithubSave = saveRequest;
      await this.syncGithubRecord(saveRequest);
    }
    async syncGithubRecord(saveRequest, options = {}) {
      if (!saveRequest || !this.githubRecords) {
        return;
      }
      let latestProgress = null;
      const reportProgress2 = (progress) => {
        latestProgress = progress;
        const message = String(progress?.message ?? "").trim();
        const percent = Number(progress?.percent);
        const percentLabel = Number.isFinite(percent) ? ` · ${percent}%` : "";
        const retrying = progress?.phase === "retry";
        this.saveRecordButtonTextNode.textContent = retrying ? "自动重试" : "正在同步";
        this.setRecordStatus(
          `本地草稿已保存 · ${message || "正在同步到 GitHub"}${percentLabel}`,
          retrying ? "warning" : "progress"
        );
        this.showToast(
          `${message || "正在同步到 GitHub"}${percentLabel}`,
          {
            tone: retrying ? "warning" : "progress",
            title: retrying ? "正在自动重试" : "正在同步到 GitHub",
            duration: 0
          }
        );
      };
      this.recordSaving = true;
      this.syncRecordGithubState();
      this.saveRecordButton.classList.add("is-loading");
      this.saveRecordButtonTextNode.textContent = "正在同步";
      this.setRecordStatus(
        options.replaceExisting ? "本地草稿已保存 · 正在替换仓库中的评分与短评" : options.allowDuplicates ? "本地草稿已保存 · 已确认仍要添加，正在同步" : "本地草稿已保存 · 正在同步到 GitHub",
        "progress"
      );
      try {
        const remote = await this.githubRecords.saveRecord({
          ...saveRequest,
          allowDuplicates: Boolean(options.allowDuplicates),
          replaceExisting: Boolean(options.replaceExisting),
          onProgress: reportProgress2
        });
        this.recordRemoteRecord = remote;
        this.setRecordRemoteLink(remote);
        this.pendingGithubSave = null;
        this.clearDuplicateWarning();
        clearTimeout(this.draftSaveTimer);
        this.draftSaveTimer = null;
        this.recognitionCache?.clear(location.href);
        if (saveRequest.item?.id) {
          this.personalRecordStore?.remove(saveRequest.item.id);
        }
        const syncedAt = remote.record?.updatedAt || this.settingsStore.get().github.lastSyncedAt;
        const updatedSettings = this.settingsStore.update({
          github: {
            ...this.settingsStore.get().github,
            lastSyncedAt: syncedAt || (/* @__PURE__ */ new Date()).toISOString()
          }
        });
        this.githubLastSyncedAt = updatedSettings.github.lastSyncedAt;
        const syncedAtLabel = formatRecordTime(this.githubLastSyncedAt);
        this.setRecordStatus(
          `已保存到 GitHub · ${syncedAtLabel}`,
          "success"
        );
        this.showToast(
          `《${itemDisplayTitle2(saveRequest.item)}》的评分与短评${remote.replacedExisting ? "已替换原记录" : remote.appendedDuplicate ? "已作为新记录追加" : "已写入"}到个人数据仓库。` + (syncedAtLabel ? `
同步时间：${syncedAtLabel}` : ""),
          {
            tone: "success",
            title: "同步成功"
          }
        );
      } catch (error) {
        if (error instanceof DuplicateRecordError) {
          const hasExistingRecord = error.duplicates.some(
            (duplicate) => duplicate.kind === "existing"
          );
          this.pendingGithubSave = saveRequest;
          this.renderDuplicateWarning(error);
          this.setRecordStatus(
            hasExistingRecord ? "本地草稿已保存 · 请选择替换评价或仍然添加" : "本地草稿已保存 · 等待确认疑似重复",
            "warning"
          );
          this.showToast(
            hasExistingRecord ? "个人仓库中已有这部番剧。默认替换原记录的评分与短评；也可以仍然添加为独立记录。" : `${error.message}。请检查下方候选，确认不是同一季度后再同步。`,
            {
              tone: "warning",
              title: hasExistingRecord ? "仓库中已有该番剧" : "需要确认重复项"
            }
          );
          return;
        }
        this.pendingGithubSave = null;
        this.clearDuplicateWarning();
        const lastProgress = String(latestProgress?.message ?? "").trim();
        this.setRecordStatus(
          `本地草稿已保存 · GitHub 同步失败${lastProgress ? `（${lastProgress}）` : ""}`,
          "error"
        );
        this.showToast(
          `评分与短评仍保留在本机，修正问题后可再次点击同步。
${toErrorMessage(
            error
          )}${lastProgress ? `
最后阶段：${lastProgress}` : ""}`,
          {
            tone: "error",
            title: "GitHub 同步失败",
            duration: 12e3
          }
        );
      } finally {
        this.recordSaving = false;
        this.saveRecordButton.classList.remove("is-loading");
        this.syncRecordGithubState();
        if (!this.duplicateWarning.hidden) {
          const hasExistingRecord = this.duplicateWarning.dataset.kind === "existing";
          this.cancelDuplicateButton.disabled = false;
          this.confirmDuplicateButton.disabled = false;
          this.replaceDuplicateButton.disabled = !hasExistingRecord;
          if (hasExistingRecord) {
            this.replaceDuplicateButton.focus({ preventScroll: true });
          }
        }
      }
    }
    renderDuplicateWarning(error) {
      const hasExistingRecord = error.duplicates.some(
        (duplicate) => duplicate.kind === "existing"
      );
      this.duplicateWarningTitle.textContent = hasExistingRecord ? "这部番剧已在个人仓库中" : "发现疑似重复番剧";
      this.duplicateWarning.dataset.kind = hasExistingRecord ? "existing" : "similar";
      this.duplicateWarningSummary.textContent = hasExistingRecord ? `扫描 ${error.scannedCount} 条记录后发现已有记录。“替换评价”会更新原记录的评分与短评，并保留备注等资料；“仍然添加”会新增一条独立记录。` : `扫描 ${error.scannedCount} 条记录后发现 ${error.duplicates.length} 条可能重复。不同季度属于不同番剧，继续会新增一条独立记录。`;
      this.confirmDuplicateButton.lastChild.textContent = "仍然添加";
      this.replaceDuplicateButton.lastChild.textContent = "替换评价";
      this.replaceDuplicateButton.hidden = !hasExistingRecord;
      this.duplicateWarningList.replaceChildren();
      for (const duplicate of error.duplicates) {
        const season = duplicate.season?.label ? ` · ${duplicate.season.label}` : "";
        this.duplicateWarningList.append(
          element("div", { className: "scout-duplicate-row" }, [
            element("div", { className: "scout-duplicate-copy" }, [
              element("strong", {
                text: `${duplicate.title || duplicate.id}${season}`
              }),
              element("span", {
                text: `${duplicate.reason} · ${formatConfidence(
                  duplicate.score
                )}`
              })
            ]),
            element("code", { text: duplicate.id })
          ])
        );
      }
      this.duplicateWarning.hidden = false;
      this.cancelDuplicateButton.disabled = this.recordSaving;
      this.confirmDuplicateButton.disabled = this.recordSaving;
      this.replaceDuplicateButton.disabled = this.recordSaving || !hasExistingRecord;
      this.duplicateWarning.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      if (hasExistingRecord) {
        this.replaceDuplicateButton.focus({ preventScroll: true });
      }
    }
    clearDuplicateWarning() {
      if (!this.duplicateWarning) {
        return;
      }
      this.pendingGithubSave = null;
      this.duplicateWarning.hidden = true;
      delete this.duplicateWarning.dataset.kind;
      this.duplicateWarningList.replaceChildren();
      this.confirmDuplicateButton.lastChild.textContent = "仍然添加";
      this.replaceDuplicateButton.lastChild.textContent = "替换评价";
      this.replaceDuplicateButton.hidden = true;
      this.replaceDuplicateButton.disabled = false;
    }
    cancelDuplicateSync() {
      this.pendingGithubSave = null;
      this.clearDuplicateWarning();
      this.setRecordStatus(
        "本地草稿已保留 · 已取消 GitHub 同步",
        "warning"
      );
      this.showToast("没有写入 GitHub，评分与短评仍保留在本机。", {
        tone: "warning",
        title: "已取消同步"
      });
    }
    confirmDuplicateSync() {
      const pending = this.pendingGithubSave;
      if (!pending || this.recordSaving) {
        return;
      }
      this.syncGithubRecord(pending, { allowDuplicates: true });
    }
    replaceDuplicateSync() {
      const pending = this.pendingGithubSave;
      if (!pending || this.recordSaving) {
        return;
      }
      this.syncGithubRecord(pending, { replaceExisting: true });
    }
    renderDiagnostics(diagnostics) {
      this.diagnosticsList.replaceChildren();
      const entries = (diagnostics ?? []).filter(Boolean);
      this.diagnostics.hidden = entries.length === 0;
      for (const entry of entries) {
        this.diagnosticsList.append(element("li", { text: entry }));
      }
    }
    batchGithubWritable() {
      const settings = this.settingsStore.get();
      return Boolean(
        this.githubRecords && this.githubRecordConfig(settings) && String(settings.github?.token ?? "").trim()
      );
    }
    batchImportableCards() {
      return this.batchCards.filter((card) => card.selectedResult?.item?.id);
    }
    renderBatchProgress() {
      const progress = this.batchProgress;
      const visible = Boolean(
        (this.batchLoading || this.batchImporting) && (progress || this.batchImporting)
      );
      if (!this.batchProgressPanel) {
        return;
      }
      this.batchProgressPanel.hidden = !visible;
      if (!visible) {
        return;
      }
      let label = String(progress?.message ?? "").trim() || "正在同步到 GitHub";
      let value = "请稍候";
      let percent = Number.isFinite(Number(progress?.percent)) ? Math.max(0, Math.min(100, Number(progress.percent))) : null;
      if (!this.batchImporting && progress?.phase === "fetch") {
        const fetched = Number(progress.itemCount) || 0;
        const total = Number(progress.total) || 0;
        label = `正在读取追番列表 · 已读取 ${Number(progress.fetchedPages) || 0} 页`;
        value = total > 0 ? `${fetched}/${total}` : `${fetched} 部`;
        percent = null;
      } else if (!this.batchImporting && progress?.phase === "matching") {
        const processed = Number(progress.processed) || 0;
        const totalItems = Number(progress.totalItems) || 0;
        const matched = Number(progress.matched) || 0;
        label = `正在匹配本地索引 · 已命中 ${matched}`;
        value = totalItems > 0 ? `${processed}/${totalItems}` : "准备中";
        percent = totalItems > 0 ? Math.round(processed / totalItems * 100) : null;
      } else if (progress?.phase === "retry") {
        const attempt = Number(progress.nextAttempt) || 0;
        const maxAttempts = Number(progress.maxAttempts) || 0;
        value = attempt > 0 && maxAttempts > 0 ? `第 ${attempt}/${maxAttempts} 次尝试` : "等待自动重试";
      } else if (progress?.phase === "complete") {
        value = "已完成";
      }
      this.batchProgressPanel.setAttribute("aria-label", label);
      this.batchProgressLabel.textContent = label;
      this.batchProgressValue.textContent = percent === null ? value : `${value} · ${percent}%`;
      this.batchProgressBar.dataset.mode = percent === null ? "indeterminate" : "determinate";
      this.batchProgressFill.style.width = percent === null ? "" : `${Math.max(0, Math.min(100, percent))}%`;
      if (percent === null) {
        this.batchProgressPanel.removeAttribute("aria-valuemin");
        this.batchProgressPanel.removeAttribute("aria-valuemax");
        this.batchProgressPanel.removeAttribute("aria-valuenow");
      } else {
        this.batchProgressPanel.setAttribute("aria-valuemin", "0");
        this.batchProgressPanel.setAttribute("aria-valuemax", "100");
        this.batchProgressPanel.setAttribute("aria-valuenow", String(percent));
      }
    }
    toggleBatchCard(mediaId, checked) {
      if (checked) {
        this.batchSelectedIds.add(String(mediaId));
      } else {
        this.batchSelectedIds.delete(String(mediaId));
      }
      this.batchMessage = "";
      this.batchMessageTone = "";
      this.renderBatchCards();
    }
    toggleAllBatchCards() {
      const importableIds = this.batchImportableCards().map(
        (card) => String(card.mediaId)
      );
      const allSelected = importableIds.length > 0 && importableIds.every((id) => this.batchSelectedIds.has(id));
      this.batchSelectedIds = allSelected ? /* @__PURE__ */ new Set() : new Set(importableIds);
      this.batchMessage = "";
      this.batchMessageTone = "";
      this.renderBatchCards();
    }
    renderBatchCards() {
      if (this.currentResult?.context?.pageKind !== "bilibili-follow") {
        this.batchSection.hidden = true;
        return;
      }
      const cards = this.batchCards;
      const importable = this.batchImportableCards();
      const importableIds = new Set(importable.map((card) => String(card.mediaId)));
      for (const mediaId of [...this.batchSelectedIds]) {
        if (!importableIds.has(mediaId)) {
          this.batchSelectedIds.delete(mediaId);
        }
      }
      this.batchSection.hidden = false;
      this.batchList.replaceChildren();
      this.renderBatchProgress();
      const matched = importable.length;
      const totalSuffix = this.batchTotal > cards.length ? ` · 接口共 ${this.batchTotal} 部` : "";
      this.batchTitle.textContent = this.batchLoading ? cards.length > 0 ? `正在读取追番列表 (${cards.length}${this.batchTotal > cards.length ? `/${this.batchTotal}` : ""})` : "正在读取追番列表" : `追番列表 (${matched}/${cards.length})${totalSuffix}`;
      this.batchSelectionSummary.textContent = `已选 ${this.batchSelectedIds.size} 项 · 可导入 ${matched}`;
      if (this.batchLoading && cards.length === 0) {
        this.batchList.append(
          element(
            "div",
            {
              className: "scout-batch-skeleton",
              attrs: { "aria-hidden": "true" }
            },
            Array.from(
              { length: 4 },
              () => element("div", { className: "scout-batch-skeleton-row" }, [
                element("span", { className: "scout-batch-skeleton-check" }),
                element("span", { className: "scout-batch-skeleton-copy" }, [
                  element("span", { className: "scout-batch-skeleton-title" }),
                  element("span", { className: "scout-batch-skeleton-meta" })
                ]),
                element("span", { className: "scout-batch-skeleton-tail" })
              ])
            )
          )
        );
        this.batchList.append(
          element("p", {
            className: "scout-batch-message",
            text: "正在分批读取并匹配，列表会随进度更新。"
          })
        );
      } else if (!cards.length) {
        this.batchList.append(
          element("p", {
            className: "scout-batch-message",
            text: "没有读取到可导入的追番。"
          })
        );
      } else {
        for (const card of cards.slice(0, this.batchVisibleLimit)) {
          const mediaId = String(card.mediaId);
          const selectable = Boolean(card.selectedResult?.item?.id);
          const selected = selectable && this.batchSelectedIds.has(mediaId);
          const displayTitle = card.item ? itemDisplayTitle2(card.item) : card.title;
          const meta = card.item ? [
            card.item.year,
            seasonLabelFromItem(card.item),
            card.item.names?.find(
              (name) => name !== itemDisplayTitle2(card.item)
            )
          ].filter(Boolean).join(" · ") : `Bilibili md${card.mediaId} · 索引未命中`;
          const checkbox = element("input", {
            className: "scout-batch-checkbox",
            type: "checkbox",
            checked: selected,
            disabled: !selectable || this.batchLoading || this.batchImporting,
            attrs: {
              "aria-label": selectable ? `选择 ${displayTitle}` : `${displayTitle} 未命中本地索引`
            },
            on: {
              change: (event) => this.toggleBatchCard(mediaId, event.currentTarget.checked)
            }
          });
          this.batchList.append(
            element(
              "label",
              {
                className: `scout-batch-row${selected ? " is-selected" : ""}${selectable ? "" : " is-unmatched"}`,
                dataset: {
                  itemId: card.item?.id ?? card.mediaId,
                  mediaId
                }
              },
              [
                checkbox,
                element("div", { className: "scout-list-copy" }, [
                  element("div", {
                    className: "scout-list-title",
                    text: displayTitle
                  }),
                  element("div", {
                    className: "scout-list-meta",
                    text: meta
                  })
                ]),
                element("span", {
                  className: "scout-score",
                  text: selectable ? "可导入" : "未命中"
                })
              ]
            )
          );
        }
        if (this.batchLoading) {
          this.batchList.append(
            element("p", {
              className: "scout-batch-message",
              text: "已显示部分结果，其余追番仍在分批匹配。"
            })
          );
        }
        if (cards.length > this.batchVisibleLimit) {
          const remaining = cards.length - this.batchVisibleLimit;
          this.batchList.append(
            element(
              "button",
              {
                className: "scout-batch-load-more",
                attrs: { type: "button" },
                on: {
                  click: () => {
                    this.batchVisibleLimit += 50;
                    this.renderBatchCards();
                  }
                }
              },
              [`再显示 ${Math.min(50, remaining)} 项`]
            )
          );
        }
      }
      this.batchStatus.textContent = this.batchMessage;
      this.batchStatus.hidden = !this.batchMessage;
      if (this.batchMessageTone) {
        this.batchStatus.dataset.tone = this.batchMessageTone;
      } else {
        delete this.batchStatus.dataset.tone;
      }
      const writable = this.batchGithubWritable();
      this.batchActionNote.textContent = writable ? "新记录默认未评分、无评价；已存在的番剧会自动跳过，并一次写入当前选择。" : "批量同步需要先在设置中连接 GitHub 仓库和 Token。";
      this.batchActionNote.dataset.tone = writable ? "" : "warn";
      const allSelected = importable.length > 0 && importable.every(
        (card) => this.batchSelectedIds.has(String(card.mediaId))
      );
      this.batchSelectAllButton.disabled = this.batchLoading || this.batchImporting || importable.length === 0;
      this.batchSelectAllButton.lastChild.textContent = allSelected ? "取消全选" : "全选可导入";
      this.batchImportButton.disabled = this.batchLoading || this.batchImporting || !writable || this.batchSelectedIds.size === 0;
      this.batchImportButtonTextNode.textContent = this.batchImporting ? "正在同步" : "导入并同步";
      this.batchImportButton.classList.toggle(
        "is-loading",
        this.batchImporting
      );
    }
    async syncSelectedBatchCards() {
      if (this.batchImporting || !this.githubRecords) {
        return;
      }
      if (!this.batchGithubWritable()) {
        this.showToast("请先在设置中连接 GitHub 仓库并填写 Token。", {
          tone: "warning",
          title: "尚未配置同步仓库"
        });
        return;
      }
      const selectedCards = this.batchImportableCards().filter(
        (card) => this.batchSelectedIds.has(String(card.mediaId))
      );
      if (!selectedCards.length) {
        this.showToast("请先勾选至少一部可以导入的追番。", {
          tone: "warning",
          title: "尚未选择番剧"
        });
        return;
      }
      this.batchImporting = true;
      this.batchMessageTone = "progress";
      this.batchMessage = `正在获取封面并写入 ${selectedCards.length} 项`;
      this.batchProgress = {
        phase: "cover",
        message: `正在补齐 ${selectedCards.length} 部番剧的封面`,
        percent: 4
      };
      this.renderBatchCards();
      this.showToast(
        `正在处理 ${selectedCards.length} 部追番，请勿关闭面板。完成后会显示写入结果。`,
        {
          tone: "progress",
          title: "正在批量同步",
          duration: 0
        }
      );
      try {
        await this.resolveBatchCovers(
          selectedCards.map((card) => card.selectedResult.item)
        );
        const result = await this.githubRecords.saveRecordsBatch({
          entries: selectedCards.map((card) => ({
            item: card.selectedResult.item,
            selectedResult: card.selectedResult
          })),
          onProgress: (progress) => {
            this.batchProgress = progress;
            this.batchMessage = String(progress?.message ?? "").trim();
            this.batchMessageTone = progress?.phase === "retry" ? "warning" : "progress";
            clearTimeout(this.batchProgressRenderTimer);
            this.batchProgressRenderTimer = setTimeout(() => {
              this.batchProgressRenderTimer = null;
              if (this.batchImporting) {
                this.renderBatchCards();
              }
            }, 80);
          }
        });
        const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
        const settings = this.settingsStore.get();
        const updatedSettings = this.settingsStore.update({
          github: {
            ...settings.github,
            lastSyncedAt: syncedAt
          }
        });
        this.githubLastSyncedAt = updatedSettings.github.lastSyncedAt;
        this.batchSelectedIds.clear();
        const importedCount = result.imported.length;
        const skippedCount = result.skippedCount;
        this.batchMessage = importedCount > 0 ? `已导入 ${importedCount} 条，跳过 ${skippedCount} 条` : `选中的 ${skippedCount} 条均已存在，没有重复写入`;
        this.batchMessageTone = importedCount > 0 ? "success" : "warning";
        this.showToast(
          importedCount > 0 ? `已写入个人数据仓库。
新增 ${importedCount} 条，跳过已有记录 ${skippedCount} 条。` : `这 ${skippedCount} 部追番都已在个人数据仓库中，本次没有重复写入。`,
          {
            tone: this.batchMessageTone,
            title: importedCount > 0 ? "批量同步成功" : "没有需要新增的记录"
          }
        );
        this.updateGithubSetupChecklist();
      } catch (error) {
        const detail = toErrorMessage(error);
        const lastProgress = String(this.batchProgress?.message ?? "").trim();
        this.batchMessageTone = "error";
        this.batchMessage = `批量同步失败${lastProgress ? ` · ${lastProgress}` : ""} · 请检查仓库权限、Token 与网络后重试`;
        this.showToast(
          `本次没有在远端写入新增记录。请检查仓库权限、Token 与网络后重试。
${detail}${lastProgress ? `
最后阶段：${lastProgress}` : ""}`,
          {
            tone: "error",
            title: "批量同步失败",
            duration: 12e3
          }
        );
      } finally {
        this.batchImporting = false;
        this.batchProgress = null;
        this.renderBatchCards();
      }
    }
    async resolveItemCover(item) {
      if (!item || item.coverUrl || !this.coverResolver) {
        return item?.coverUrl ?? null;
      }
      try {
        const url = await this.coverResolver(item);
        if (url) {
          item.coverUrl = normalizeCoverUrl(url);
        }
      } catch {
      }
      return item.coverUrl ?? null;
    }
    async resolveBatchCovers(items) {
      const pending = [...new Set(items ?? [])].filter(
        (item) => item && !item.coverUrl
      );
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const item = pending[cursor];
          cursor += 1;
          await this.resolveItemCover(item);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(4, pending.length) },
          () => worker()
        )
      );
    }
    scheduleBatchCards() {
      clearTimeout(this.batchRenderTimer);
      this.batchRenderTimer = null;
      clearTimeout(this.batchProgressRenderTimer);
      this.batchProgressRenderTimer = null;
      const requestId = ++this.batchScanRequestId;
      this.batchCards = [];
      this.batchSelectedIds.clear();
      this.batchVisibleLimit = 50;
      this.batchLoading = false;
      this.batchImporting = false;
      this.batchMessage = "";
      this.batchMessageTone = "";
      this.batchDiagnostics = [];
      this.batchTotal = 0;
      this.batchProgress = null;
      this.batchSection.hidden = true;
      this.batchList.replaceChildren();
      if (this.currentResult?.context?.pageKind !== "bilibili-follow") {
        return;
      }
      const result = this.currentResult;
      this.batchLoading = true;
      this.batchProgress = {
        phase: "fetch",
        fetchedPages: 0,
        itemCount: 0,
        total: 0
      };
      this.renderBatchCards();
      const scan = async () => {
        this.batchRenderTimer = null;
        if (requestId !== this.batchScanRequestId || this.currentResult !== result) {
          return;
        }
        try {
          const scanned = await this.onScanCards?.({
            onProgress: (progress) => {
              if (requestId !== this.batchScanRequestId || this.currentResult !== result) {
                return;
              }
              this.batchProgress = progress;
              if (Array.isArray(progress?.cards)) {
                this.batchCards = progress.cards;
              }
              if (Number(progress?.total) > this.batchTotal) {
                this.batchTotal = Number(progress.total);
              }
              clearTimeout(this.batchProgressRenderTimer);
              this.batchProgressRenderTimer = setTimeout(() => {
                if (requestId !== this.batchScanRequestId || this.currentResult !== result) {
                  return;
                }
                this.renderBatchCards();
              }, 80);
            }
          });
          if (requestId !== this.batchScanRequestId || this.currentResult !== result) {
            return;
          }
          const payload = Array.isArray(scanned) ? { cards: scanned, diagnostics: [], total: scanned.length } : scanned ?? {};
          this.batchCards = Array.isArray(payload.cards) ? payload.cards : [];
          this.batchTotal = Number(payload.total) || this.batchCards.length;
          this.batchDiagnostics = (payload.diagnostics ?? []).filter(Boolean);
          this.batchMessage = this.batchDiagnostics.join("；");
          this.batchMessageTone = this.batchDiagnostics.length > 0 ? "warning" : "";
          this.batchProgress = null;
        } catch (error) {
          if (requestId !== this.batchScanRequestId) {
            return;
          }
          this.batchCards = [];
          this.batchMessageTone = "error";
          this.batchMessage = `追番列表读取失败：${toErrorMessage(error)}`;
        } finally {
          if (requestId === this.batchScanRequestId && this.currentResult === result) {
            this.batchProgress = null;
            this.batchLoading = false;
            clearTimeout(this.batchProgressRenderTimer);
            this.batchProgressRenderTimer = null;
            this.renderBatchCards();
          }
        }
      };
      this.batchRenderTimer = window.setTimeout(scan, 0);
    }
    scheduleManualSearch() {
      clearTimeout(this.searchTimer);
      const query = this.searchInput.value.trim();
      if (!query) {
        this.manualSearchSection.hidden = true;
        return;
      }
      this.manualSearchSection.hidden = false;
      this.searchTimer = setTimeout(() => {
        const results = this.recognizer.search(query, { limit: 10 });
        this.renderManualSearchRows(results);
      }, 180);
    }
    showManualSearch() {
      this.candidateCollapsed = false;
      this.resultListSection.hidden = false;
      if (this.titleCandidateList.childElementCount > 0) {
        this.titleCandidateSection.hidden = false;
      }
      if (this.batchList.childElementCount > 0) {
        this.batchSection.hidden = false;
      }
      this.manualSearchSection.hidden = false;
      this.searchInput.focus();
    }
    restoreCachedRecognition() {
      const draft = this.recognitionCache?.get(location.href);
      const item = draft?.selectedResult?.item ?? draft?.item;
      if (!draft || !item?.id) {
        return false;
      }
      const cachedResult = draft.recognitionResult ?? {};
      const selectedResult = draft.selectedResult ?? {
        item,
        confidence: 0,
        matchedBy: ["local-cache"]
      };
      this.setResult({
        ...cachedResult,
        status: cachedResult.status ?? "matched",
        best: selectedResult,
        results: Array.isArray(cachedResult.results) && cachedResult.results.length ? cachedResult.results : [{ ...selectedResult, confidence: selectedResult.confidence ?? 0 }],
        titleCandidates: cachedResult.titleCandidates ?? [],
        context: cachedResult.context ?? {},
        aiResult: cachedResult.aiResult ?? null,
        bilibiliMetadata: cachedResult.bilibiliMetadata ?? selectedResult.bilibiliMetadata ?? null,
        diagnostics: cachedResult.diagnostics ?? []
      });
      this.candidateCollapsed = true;
      this.resultListSection.hidden = true;
      this.titleCandidateSection.hidden = true;
      this.manualSearchSection.hidden = true;
      this.batchSection.hidden = true;
      this.recordSection.hidden = false;
      if (this.rescanButtonTextNode) {
        this.rescanButtonTextNode.textContent = "重新识别";
      }
      return true;
    }
    requestAi() {
      if (!this.settingsStore.get().ai.enabled) {
        this.openSettings();
        this.showToast("请先启用并配置 DeepSeek");
        this.aiEnabled.focus();
        return;
      }
      this.onRecognize({
        source: "manual",
        ai: "force",
        ignoreRecognitionCache: true
      });
    }
    setRecordStatus(message, tone = "") {
      if (!this.recordStatus) {
        return;
      }
      this.recordStatus.textContent = message;
      if (tone) {
        this.recordStatus.dataset.tone = tone;
      } else {
        delete this.recordStatus.dataset.tone;
      }
    }
    showToast(message, options = {}) {
      const allowedTones = /* @__PURE__ */ new Set([
        "info",
        "success",
        "warning",
        "error",
        "progress"
      ]);
      const tone = allowedTones.has(options.tone) ? options.tone : "info";
      const title = String(options.title ?? "").trim();
      this.shadow.querySelector(".scout-toast")?.remove();
      const closeButton = element(
        "button",
        {
          className: "scout-toast-close",
          attrs: {
            type: "button",
            title: "关闭提示",
            "aria-label": "关闭提示"
          },
          on: {
            click: (event) => event.currentTarget.closest(".scout-toast")?.remove()
          }
        },
        [icon(X)]
      );
      const iconNode = icon(feedbackIcon(tone));
      if (tone === "progress") {
        iconNode.classList.add("scout-spin");
      }
      const toast = element("div", {
        className: "scout-toast",
        dataset: { tone },
        attrs: {
          role: tone === "error" ? "alert" : "status",
          "aria-live": tone === "error" ? "assertive" : "polite",
          "aria-atomic": "true"
        }
      }, [
        element("span", { className: "scout-toast-icon" }, [iconNode]),
        element("div", { className: "scout-toast-copy" }, [
          title ? element("strong", {
            className: "scout-toast-title",
            text: title
          }) : null,
          element("p", {
            className: "scout-toast-message",
            text: message
          })
        ]),
        closeButton
      ]);
      const defaults = {
        error: 1e4,
        success: 6500,
        warning: 7e3,
        progress: 0,
        info: 3600
      };
      const duration = Number.isFinite(options.duration) ? Math.max(0, options.duration) : defaults[tone];
      toast.dataset.autoDismiss = duration > 0 ? "true" : "false";
      toast.style.setProperty("--scout-toast-duration", `${duration || 1}ms`);
      const container = this.settingsWindow.hidden ? this.panel : this.settingsWindow;
      container.append(toast);
      if (duration > 0) {
        setTimeout(() => toast.remove(), duration);
      }
      return toast;
    }
    open(options = {}) {
      this.updatePagePresentation();
      this.closeSettings();
      if (!this.currentResult && options.recognize !== true) {
        this.restoreCachedRecognition();
      }
      this.panel.hidden = false;
      this.launcher.hidden = true;
      this.launcher.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => this.positionPanelForOpen());
      if (options.recognize === true && !this.busy && typeof this.onRecognize === "function") {
        Promise.resolve(this.onRecognize({ source: "panel-open" })).catch(
          () => {
          }
        );
      }
    }
    close() {
      this.panel.hidden = true;
      this.launcher.hidden = false;
      this.launcher.setAttribute("aria-expanded", "false");
    }
    openSettings() {
      this.updatePagePresentation();
      this.close();
      this.settingsBackdrop.hidden = false;
      this.settingsWindow.hidden = false;
      this.launcher.setAttribute("aria-expanded", "true");
      if (this.settingsView) {
        this.indexEnabled.focus({ preventScroll: true });
        return;
      }
      this.settingsWindowStatus.textContent = "正在打开设置";
      requestAnimationFrame(() => {
        this.settingsView = this.buildSettingsView();
        this.settingsBody.append(this.settingsView);
        this.settingsWindowStatus.textContent = this.indexState.message;
        this.indexEnabled.focus({ preventScroll: true });
      });
    }
    closeSettings() {
      this.settingsBackdrop.hidden = true;
      this.settingsWindow.hidden = true;
      this.launcher.setAttribute("aria-expanded", "false");
    }
    toggle() {
      if (this.panel.hidden) {
        this.open();
      } else {
        this.close();
      }
    }
    startLauncherDrag(event) {
      if (event.button !== 0) {
        return;
      }
      const rect = this.launcher.getBoundingClientRect();
      this.launcherDragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        top: rect.top,
        height: rect.height,
        moved: false
      };
      this.suppressLauncherClick = false;
      this.launcher.setPointerCapture?.(event.pointerId);
    }
    moveLauncher(event) {
      const drag = this.launcherDragState;
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) {
        return;
      }
      drag.moved = true;
      this.suppressLauncherClick = true;
      this.launcher.classList.add("is-dragging");
      const side = event.clientX < window.innerWidth / 2 ? "left" : "right";
      this.dockedSide = side;
      this.applyLauncherDock(side, drag.top + deltaY, drag.height);
      event.preventDefault();
    }
    finishLauncherDrag(event) {
      const drag = this.launcherDragState;
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      this.launcherDragState = null;
      this.launcher.classList.remove("is-dragging");
      if (this.launcher.hasPointerCapture?.(event.pointerId)) {
        this.launcher.releasePointerCapture(event.pointerId);
      }
      if (drag.moved && this.dockedSide) {
        this.suppressLauncherClick = true;
        this.applyLauncherDock(
          this.dockedSide,
          this.launcher.getBoundingClientRect().top,
          this.launcher.getBoundingClientRect().height
        );
      }
    }
    applyPanelSize(width, height) {
      if (window.matchMedia("(max-width: 520px)").matches) {
        this.panel.style.removeProperty("width");
        this.panel.style.removeProperty("height");
        return;
      }
      const maximumWidth = Math.max(340, window.innerWidth - 24);
      const maximumHeight = Math.max(420, window.innerHeight - 96);
      this.panelWidth = Math.round(
        clampNumber2(width, Math.min(340, maximumWidth), Math.min(1100, maximumWidth))
      );
      this.panelHeight = Math.round(
        clampNumber2(height, Math.min(420, maximumHeight), Math.min(900, maximumHeight))
      );
      this.panel.style.width = `${this.panelWidth}px`;
      this.panel.style.height = `${this.panelHeight}px`;
    }
    startPanelResize(event) {
      if (event.button !== 0 || window.matchMedia("(max-width: 520px)").matches) {
        return;
      }
      const rect = this.panel.getBoundingClientRect();
      this.resizeState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: rect.width,
        startHeight: rect.height
      };
      this.panel.classList.add("is-resizing");
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    }
    movePanelResize(event) {
      if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) {
        return;
      }
      this.applyPanelSize(
        this.resizeState.startWidth + event.clientX - this.resizeState.startX,
        this.resizeState.startHeight + event.clientY - this.resizeState.startY
      );
      event.preventDefault();
      event.stopPropagation();
    }
    finishPanelResize(event) {
      if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) {
        return;
      }
      const handle = event.currentTarget;
      this.resizeState = null;
      this.panel.classList.remove("is-resizing");
      if (handle.hasPointerCapture?.(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      const settings = this.settingsStore.get();
      this.settingsStore.update({
        ui: {
          ...settings.ui,
          panelWidth: this.panelWidth,
          panelHeight: this.panelHeight
        }
      });
      this.clampPanelToViewport();
    }
    startPanelDrag(event) {
      if (event.button !== 0 || event.target?.closest?.("button") || window.matchMedia("(max-width: 520px)").matches) {
        return;
      }
      const rect = this.panel.getBoundingClientRect();
      this.dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        width: rect.width,
        height: rect.height
      };
      this.panel.classList.add("is-dragging");
      this.panelHeader.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
    movePanel(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }
      const left = clampNumber2(
        this.dragState.startLeft + event.clientX - this.dragState.startX,
        8,
        Math.max(8, window.innerWidth - this.dragState.width - 8)
      );
      const top = clampNumber2(
        this.dragState.startTop + event.clientY - this.dragState.startY,
        8,
        Math.max(8, window.innerHeight - this.dragState.height - 8)
      );
      this.setPanelPosition(left, top);
      event.preventDefault();
    }
    finishPanelDrag(event) {
      if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
        return;
      }
      this.panelHasCustomPosition = true;
      this.dragState = null;
      this.panel.classList.remove("is-dragging");
      if (this.panelHeader.hasPointerCapture?.(event.pointerId)) {
        this.panelHeader.releasePointerCapture(event.pointerId);
      }
    }
    setPanelPosition(left, top) {
      this.panel.style.left = `${Math.round(left)}px`;
      this.panel.style.top = `${Math.round(top)}px`;
      this.panel.style.right = "auto";
      this.panel.style.bottom = "auto";
    }
    clearPanelPosition() {
      this.panel.style.removeProperty("left");
      this.panel.style.removeProperty("top");
      this.panel.style.removeProperty("right");
      this.panel.style.removeProperty("bottom");
    }
    positionPanelForOpen() {
      if (this.panel.hidden) {
        return;
      }
      if (window.matchMedia("(max-width: 520px)").matches) {
        this.clearPanelPosition();
        return;
      }
      if (this.panelHasCustomPosition) {
        this.clampPanelToViewport();
        return;
      }
      if (this.dockedSide) {
        this.positionPanelNextToDock();
      }
    }
    clampPanelToViewport() {
      const rect = this.panel.getBoundingClientRect();
      const left = clampNumber2(
        rect.left,
        8,
        Math.max(8, window.innerWidth - rect.width - 8)
      );
      const top = clampNumber2(
        rect.top,
        8,
        Math.max(8, window.innerHeight - rect.height - 8)
      );
      this.setPanelPosition(left, top);
    }
    hideToSide() {
      const rect = this.panel.getBoundingClientRect();
      const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
      const top = rect.top;
      this.dockedSide = side;
      this.panelHasCustomPosition = false;
      this.close();
      this.applyLauncherDock(side, top);
    }
    applyLauncherDock(side, top, height = 92) {
      this.launcher.classList.remove("is-docked-left", "is-docked-right");
      this.launcher.classList.add("is-side-docked", `is-docked-${side}`);
      this.launcher.dataset.docked = side;
      this.launcher.style.top = `${Math.round(
        clampNumber2(top, 8, Math.max(8, window.innerHeight - height - 8))
      )}px`;
      this.launcher.style.bottom = "auto";
      if (side === "left") {
        this.launcher.style.left = "0";
        this.launcher.style.right = "auto";
      } else {
        this.launcher.style.left = "auto";
        this.launcher.style.right = "0";
      }
    }
    positionPanelNextToDock() {
      const launcherRect = this.launcher.getBoundingClientRect();
      const panelRect = this.panel.getBoundingClientRect();
      const left = this.dockedSide === "left" ? launcherRect.width + 8 : window.innerWidth - launcherRect.width - panelRect.width - 8;
      const top = clampNumber2(
        launcherRect.top - 8,
        8,
        Math.max(8, window.innerHeight - panelRect.height - 8)
      );
      this.setPanelPosition(
        clampNumber2(
          left,
          8,
          Math.max(8, window.innerWidth - panelRect.width - 8)
        ),
        top
      );
    }
    handleViewportResize() {
      if (window.matchMedia("(max-width: 520px)").matches) {
        this.clearPanelPosition();
        this.applyPanelSize(this.panelWidth, this.panelHeight);
        return;
      }
      this.applyPanelSize(this.panelWidth, this.panelHeight);
      if (!this.panel.hidden) {
        if (this.panelHasCustomPosition) {
          this.clampPanelToViewport();
        } else if (this.dockedSide) {
          this.positionPanelNextToDock();
        }
      }
      if (this.dockedSide && !this.launcher.hidden) {
        this.applyLauncherDock(
          this.dockedSide,
          this.launcher.getBoundingClientRect().top
        );
      }
    }
  };

  // src/main.js
  var enabledSite = isEnabledSite(location.href) || globalThis.__BANGUMI_SCOUT_TEST_MODE__ === true;
  if (enabledSite && window.top === window.self && !document.getElementById("bangumi-scout-host")) {
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
        threshold: initialSettings.matching.fuzzyThreshold
      }
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
          updated ? "番剧索引已更新，点击重新识别后生效" : "番剧索引已是最新版本"
        );
      },
      onClearIndex: async () => {
        await indexService.clearCache();
      },
      onScanCards: (options = {}) => recognizer.scanBilibiliCards(2e3, options)
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
        await recognitionPromise.catch(() => {
        });
      }
      if (options.ignoreRecognitionCache) {
        recognitionCache.clear(location.href);
      }
      panel.setBusy(true, options.ai === "force" ? "AI 正在推断" : "正在识别");
      recognitionPromise = recognizer.recognize({
        ai: options.ai,
        includeBilibiliApi: options.includeBilibiliApi
      }).then((result) => {
        panel.setResult(result, {
          ignoreCachedSelection: Boolean(options.ignoreRecognitionCache)
        });
        return result;
      }).catch((error) => {
        panel.showToast(`识别失败：${toErrorMessage(error)}`);
        throw error;
      }).finally(() => {
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
          ignoreRecognitionCache: true
        }).catch(() => {
        });
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
      getSettings: () => settingsStore.get()
    };
  }
})();
