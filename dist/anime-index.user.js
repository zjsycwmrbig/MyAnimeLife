// ==UserScript==
// @name         Bangumi Scout - 番剧识别助手
// @name:zh-CN   Bangumi Scout - 番剧识别助手
// @namespace    local.anime-index-userscript
// @version      0.1.0
// @description  使用本地番剧索引、正则候选、模糊搜索与 DeepSeek 辅助识别当前番剧
// @author       local
// @match        *://*/*
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
    ui: {
      launcherVisible: true
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
    settings.ui.launcherVisible = Boolean(settings.ui.launcherVisible);
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

  // src/core/network.js
  function gmRequest(details) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...details,
        onload(response) {
          resolve(response);
        },
        onerror(error) {
          reject(new Error(error?.error ?? "Network request failed"));
        },
        ontimeout() {
          reject(new Error("Network request timed out"));
        }
      });
    });
  }
  async function requestText(url, options = {}) {
    const details = {
      method: options.method ?? "GET",
      url,
      headers: options.headers ?? {},
      timeout: options.timeout ?? 2e4
    };
    if (typeof GM_xmlhttpRequest === "function") {
      const response2 = await gmRequest(details);
      if (response2.status < 200 || response2.status >= 300) {
        throw new Error(
          `HTTP ${response2.status} while requesting ${new URL(url).host}`
        );
      }
      return response2.responseText;
    }
    const response = await fetch(url, {
      method: details.method,
      headers: details.headers
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} while requesting ${new URL(url).host}`
      );
    }
    return response.text();
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
  var LANGUAGE_ORDER = ["zh-Hans", "zh-Hant", "ja", "en"];
  function uniqueStrings(values) {
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
    return uniqueStrings([item.title, ...translatedNames]);
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
  function coerceYear(begin) {
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
      const year = coerceYear(begin);
      return {
        id: stableItemId(title, names, sites, year),
        title,
        names,
        normalizedNames: uniqueStrings(names.map(normalizeTitle)),
        searchText: names.join(" "),
        type: String(item.type ?? "unknown"),
        begin,
        year,
        sites
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
    if (payload?.schemaVersion === INDEX_SCHEMA_VERSION && Array.isArray(payload.items)) {
      return {
        ...payload,
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
      this.fuse = new entry_default(this.items, {
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
      });
    }
    setThreshold(threshold) {
      this.threshold = threshold;
      this.fuse.options.threshold = threshold;
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
        for (const item of this.items) {
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
      if (this.fuse.options.threshold !== threshold) {
        this.fuse.options.threshold = threshold;
      }
      for (const result of this.fuse.search(originalQuery, { limit: limit * 2 })) {
        const existing = results.get(result.item.id);
        if (!existing || result.score < existing.score) {
          results.set(
            result.item.id,
            makeResult(result.item, result.score ?? 1, "fuzzy")
          );
        }
      }
      return [...results.values()].sort((left, right) => left.score - right.score).slice(0, limit);
    }
    findBySiteId(site, id) {
      const expected = String(id ?? "");
      if (!site || !expected) {
        return null;
      }
      return this.items.find((item) => String(item.sites?.[site] ?? "") === expected) ?? null;
    }
  };

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
    return snapshot?.schemaVersion === INDEX_SCHEMA_VERSION && snapshot?.source?.id === sourceIdForSettings(settings) && indexItemsHaveSearchFields(snapshot.items);
  }
  function fnv1a(text) {
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
      const contentHash = fnv1a(text);
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
  function detectPageKind(url) {
    if (url.hostname.endsWith("bilibili.com")) {
      if (/\/(?:bangumi\/mine\/follow|bangumi\/mine\/bangumi)/iu.test(url.pathname)) {
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
      bilibiliIds: extractBilibiliIds(location.href)
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
      const title = cleanDisplayTitle(
        textOf(titleNode) || link.getAttribute("title") || imageAlt || textOf(link)
      ) || `Bilibili media ${mediaId}`;
      const existing = cards.get(mediaId);
      if (!existing || existing.title.startsWith("Bilibili media")) {
        cards.set(mediaId, {
          mediaId,
          title,
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
      rating: Number.isFinite(Number(result.rating?.score)) ? Number(result.rating.score) : null,
      ratingCount: Number(result.rating?.count ?? 0) || null,
      publish: result.publish ?? null
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
            content: "你是番剧识别器。根据网页上下文判断页面讨论的具体动画系列，不要把集数、播放平台、清晰度或文章标题误认为作品名。只输出 JSON。"
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
      const context = createPageContext({
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
      const titleCandidates = extractTitleCandidates(context);
      if (settings.matching.useRegexCandidates) {
        for (const candidate of titleCandidates) {
          for (const result of indexSearch.search(candidate.title, { limit: 4 })) {
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
      if (bilibiliMetadata) {
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
    scanBilibiliCards(limit = 100) {
      return collectBilibiliCards(limit).map((card) => {
        const item = this.indexService.getSearch().findBySiteId("bilibili", card.mediaId);
        return {
          ...card,
          item,
          confidence: item ? 1 : 0
        };
      });
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
  var panel_default = ':host {\n  all: initial;\n  --scout-bg: #f7f7f4;\n  --scout-panel: #ffffff;\n  --scout-ink: #161917;\n  --scout-muted: #66706a;\n  --scout-line: #dfe3df;\n  --scout-accent: #2563eb;\n  --scout-accent-soft: #e8efff;\n  --scout-good: #16845b;\n  --scout-warn: #b66a16;\n  --scout-bad: #c13c3c;\n  --scout-shadow: 0 18px 48px rgb(18 25 21 / 18%);\n  color: var(--scout-ink);\n  font-family:\n    Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui,\n    sans-serif;\n  font-size: 14px;\n  line-height: 1.5;\n}\n\n* {\n  box-sizing: border-box;\n}\n\nbutton,\ninput,\nselect,\ntextarea {\n  font: inherit;\n}\n\nbutton {\n  color: inherit;\n}\n\n.scout-root {\n  position: fixed;\n  right: 20px;\n  bottom: 20px;\n  z-index: 2147483646;\n}\n\n.scout-launcher {\n  position: relative;\n  display: grid;\n  width: 44px;\n  height: 44px;\n  padding: 0;\n  border: 1px solid rgb(255 255 255 / 22%);\n  border-radius: 9px;\n  background: #17201b;\n  color: #fff;\n  box-shadow: 0 8px 26px rgb(10 15 12 / 28%);\n  cursor: pointer;\n  place-items: center;\n  transition:\n    transform 140ms ease,\n    background 140ms ease;\n}\n\n.scout-launcher:hover {\n  background: #25312a;\n  transform: translateY(-1px);\n}\n\n.scout-launcher:focus-visible,\n.scout-panel button:focus-visible,\n.scout-panel input:focus-visible,\n.scout-panel select:focus-visible {\n  outline: 2px solid var(--scout-accent);\n  outline-offset: 2px;\n}\n\n.scout-launcher .lucide {\n  width: 21px;\n  height: 21px;\n}\n\n.scout-launcher-dot {\n  position: absolute;\n  top: -3px;\n  right: -3px;\n  width: 10px;\n  height: 10px;\n  border: 2px solid #fff;\n  border-radius: 999px;\n  background: var(--scout-muted);\n}\n\n.scout-launcher-dot[data-tone="good"] {\n  background: var(--scout-good);\n}\n\n.scout-launcher-dot[data-tone="warn"] {\n  background: var(--scout-warn);\n}\n\n.scout-launcher-dot[data-tone="bad"] {\n  background: var(--scout-bad);\n}\n\n.scout-panel {\n  position: absolute;\n  right: 0;\n  bottom: 54px;\n  display: flex;\n  overflow: hidden;\n  width: min(390px, calc(100vw - 24px));\n  max-height: min(720px, calc(100vh - 96px));\n  flex-direction: column;\n  border: 1px solid var(--scout-line);\n  border-radius: 12px;\n  background: var(--scout-panel);\n  box-shadow: var(--scout-shadow);\n}\n\n.scout-settings-backdrop {\n  position: fixed;\n  z-index: 2147483645;\n  inset: 0;\n  background: rgb(12 18 14 / 24%);\n}\n\n.scout-settings-window {\n  position: fixed;\n  top: 50%;\n  left: 50%;\n  z-index: 2147483647;\n  display: flex;\n  overflow: hidden;\n  width: min(430px, calc(100vw - 24px));\n  max-height: min(780px, calc(100vh - 48px));\n  flex-direction: column;\n  border: 1px solid var(--scout-line);\n  border-radius: 12px;\n  background: var(--scout-panel);\n  box-shadow: var(--scout-shadow);\n  transform: translate(-50%, -50%);\n}\n\n.scout-panel[hidden],\n.scout-settings-window[hidden],\n.scout-settings-backdrop[hidden],\n.scout-view[hidden],\n[hidden] {\n  display: none !important;\n}\n\n.scout-header {\n  display: flex;\n  min-height: 54px;\n  align-items: center;\n  gap: 10px;\n  padding: 10px 12px;\n  border-bottom: 1px solid var(--scout-line);\n}\n\n.scout-brand-mark {\n  display: grid;\n  width: 30px;\n  height: 30px;\n  flex: 0 0 auto;\n  border-radius: 7px;\n  background: #17201b;\n  color: #fff;\n  place-items: center;\n}\n\n.scout-brand-mark .lucide {\n  width: 17px;\n  height: 17px;\n}\n\n.scout-brand {\n  min-width: 0;\n  flex: 1;\n}\n\n.scout-brand-title {\n  overflow: hidden;\n  margin: 0;\n  font-size: 14px;\n  font-weight: 700;\n  letter-spacing: 0;\n  line-height: 1.25;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-brand-state {\n  overflow: hidden;\n  margin: 2px 0 0;\n  color: var(--scout-muted);\n  font-size: 11px;\n  line-height: 1.3;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-icon-button {\n  display: inline-grid;\n  width: 30px;\n  height: 30px;\n  padding: 0;\n  flex: 0 0 auto;\n  border: 1px solid transparent;\n  border-radius: 7px;\n  background: transparent;\n  cursor: pointer;\n  place-items: center;\n}\n\n.scout-icon-button:hover {\n  border-color: var(--scout-line);\n  background: var(--scout-bg);\n}\n\n.scout-icon-button .lucide {\n  width: 16px;\n  height: 16px;\n}\n\n.scout-body {\n  overflow: auto;\n  min-height: 0;\n  flex: 1;\n  overscroll-behavior: contain;\n}\n\n.scout-view {\n  padding: 14px;\n}\n\n.scout-result-head {\n  padding: 4px 2px 13px;\n  border-bottom: 1px solid var(--scout-line);\n}\n\n.scout-eyebrow {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  margin-bottom: 7px;\n  color: var(--scout-muted);\n  font-size: 11px;\n  font-weight: 700;\n  letter-spacing: 0.02em;\n}\n\n.scout-confidence {\n  display: inline-flex;\n  align-items: center;\n  min-height: 19px;\n  padding: 1px 6px;\n  border-radius: 4px;\n  background: var(--scout-accent-soft);\n  color: #1d4ed8;\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0;\n}\n\n.scout-confidence[data-tone="good"] {\n  background: #e5f5ed;\n  color: #116b49;\n}\n\n.scout-confidence[data-tone="warn"] {\n  background: #fff1df;\n  color: #8a4c0a;\n}\n\n.scout-title {\n  margin: 0;\n  font-size: 23px;\n  font-weight: 760;\n  letter-spacing: 0;\n  line-height: 1.2;\n  overflow-wrap: anywhere;\n}\n\n.scout-subtitle {\n  margin: 7px 0 0;\n  color: var(--scout-muted);\n  font-size: 12px;\n  overflow-wrap: anywhere;\n}\n\n.scout-actions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 7px;\n  margin-top: 12px;\n}\n\n.scout-button {\n  display: inline-flex;\n  min-height: 32px;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  padding: 5px 10px;\n  border: 1px solid var(--scout-line);\n  border-radius: 6px;\n  background: var(--scout-panel);\n  color: var(--scout-ink);\n  font-size: 12px;\n  font-weight: 650;\n  cursor: pointer;\n}\n\n.scout-button:hover {\n  background: var(--scout-bg);\n}\n\n.scout-button[data-variant="primary"] {\n  border-color: var(--scout-accent);\n  background: var(--scout-accent);\n  color: #fff;\n}\n\n.scout-button[data-variant="primary"]:hover {\n  background: #1d4fd0;\n}\n\n.scout-button:disabled {\n  cursor: not-allowed;\n  opacity: 0.48;\n}\n\n.scout-button .lucide {\n  width: 14px;\n  height: 14px;\n}\n\n.scout-spin {\n  animation: scout-spin 900ms linear infinite;\n}\n\n@keyframes scout-spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n\n.scout-search {\n  position: relative;\n  margin-top: 12px;\n}\n\n.scout-search .lucide {\n  position: absolute;\n  top: 50%;\n  left: 10px;\n  width: 15px;\n  height: 15px;\n  color: var(--scout-muted);\n  pointer-events: none;\n  transform: translateY(-50%);\n}\n\n.scout-search input,\n.scout-field input,\n.scout-field select {\n  width: 100%;\n  min-height: 34px;\n  border: 1px solid var(--scout-line);\n  border-radius: 6px;\n  background: #fff;\n  color: var(--scout-ink);\n}\n\n.scout-search input {\n  padding: 6px 9px 6px 32px;\n}\n\n.scout-field input,\n.scout-field select {\n  padding: 6px 9px;\n}\n\n.scout-field input::placeholder {\n  color: #929a95;\n}\n\n.scout-section {\n  padding: 14px 0;\n  border-top: 1px solid var(--scout-line);\n}\n\n.scout-section:first-child {\n  padding-top: 0;\n  border-top: 0;\n}\n\n.scout-section-title {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  margin: 0 0 10px;\n  font-size: 12px;\n  font-weight: 750;\n  letter-spacing: 0;\n}\n\n.scout-section-title .lucide {\n  width: 15px;\n  height: 15px;\n  color: var(--scout-muted);\n}\n\n.scout-list {\n  display: grid;\n  gap: 0;\n  margin: 7px 0 0;\n}\n\n.scout-list-row {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  gap: 10px;\n  align-items: center;\n  padding: 9px 2px;\n  border-top: 1px solid var(--scout-line);\n}\n\n.scout-list-row:first-child {\n  border-top: 0;\n}\n\n.scout-list-title {\n  overflow: hidden;\n  font-size: 12px;\n  font-weight: 650;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-list-meta {\n  overflow: hidden;\n  margin-top: 2px;\n  color: var(--scout-muted);\n  font-size: 10px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-score {\n  color: var(--scout-muted);\n  font-size: 10px;\n  font-variant-numeric: tabular-nums;\n}\n\n.scout-empty {\n  padding: 18px 6px 10px;\n  color: var(--scout-muted);\n  font-size: 12px;\n  text-align: center;\n}\n\n.scout-diagnostics {\n  margin-top: 12px;\n  color: var(--scout-muted);\n  font-size: 11px;\n}\n\n.scout-diagnostics summary {\n  cursor: pointer;\n}\n\n.scout-diagnostics ul {\n  margin: 7px 0 0;\n  padding-left: 18px;\n}\n\n.scout-field {\n  display: grid;\n  gap: 5px;\n  margin-top: 10px;\n}\n\n.scout-field:first-child {\n  margin-top: 0;\n}\n\n.scout-field > span,\n.scout-range-label {\n  color: #3d4641;\n  font-size: 11px;\n  font-weight: 650;\n}\n\n.scout-field-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 8px;\n}\n\n.scout-switch {\n  display: flex;\n  min-height: 32px;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 3px 0;\n  font-size: 12px;\n  font-weight: 650;\n}\n\n.scout-switch input {\n  position: relative;\n  width: 34px;\n  height: 19px;\n  flex: 0 0 auto;\n  appearance: none;\n  border: 1px solid #c6ccc8;\n  border-radius: 999px;\n  background: #dfe3df;\n  cursor: pointer;\n  transition: background 120ms ease;\n}\n\n.scout-switch input::after {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: 13px;\n  height: 13px;\n  border-radius: 999px;\n  background: #fff;\n  box-shadow: 0 1px 2px rgb(0 0 0 / 18%);\n  content: "";\n  transition: transform 120ms ease;\n}\n\n.scout-switch input:checked {\n  border-color: var(--scout-accent);\n  background: var(--scout-accent);\n}\n\n.scout-switch input:checked::after {\n  transform: translateX(15px);\n}\n\n.scout-range-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  margin-top: 12px;\n}\n\n.scout-range-head output {\n  color: var(--scout-muted);\n  font-size: 11px;\n  font-variant-numeric: tabular-nums;\n}\n\n.scout-range {\n  width: 100%;\n  margin: 5px 0 0;\n  accent-color: var(--scout-accent);\n}\n\n.scout-note {\n  margin: 7px 0 0;\n  color: var(--scout-muted);\n  font-size: 10px;\n  line-height: 1.45;\n}\n\n.scout-footer {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 10px 14px;\n  border-top: 1px solid var(--scout-line);\n  background: var(--scout-bg);\n}\n\n.scout-footer-status {\n  overflow: hidden;\n  color: var(--scout-muted);\n  font-size: 10px;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.scout-footer-actions {\n  display: flex;\n  flex: 0 0 auto;\n  gap: 6px;\n}\n\n.scout-toast {\n  position: absolute;\n  right: 10px;\n  bottom: 10px;\n  left: 10px;\n  padding: 8px 10px;\n  border: 1px solid #cfd7d1;\n  border-radius: 7px;\n  background: #17201b;\n  color: #fff;\n  font-size: 11px;\n  box-shadow: 0 8px 20px rgb(0 0 0 / 20%);\n}\n\n@media (max-width: 520px) {\n  .scout-root {\n    right: 12px;\n    bottom: 12px;\n  }\n\n  .scout-panel {\n    position: fixed;\n    right: 12px;\n    bottom: 64px;\n    left: 12px;\n    width: auto;\n    max-height: calc(100vh - 84px);\n  }\n\n  .scout-settings-window {\n    width: calc(100vw - 24px);\n    max-height: calc(100vh - 24px);\n  }\n}\n\n@media (prefers-color-scheme: dark) {\n  :host {\n    --scout-bg: #eef0ed;\n    --scout-panel: #ffffff;\n    --scout-ink: #161917;\n    --scout-muted: #66706a;\n    --scout-line: #dfe3df;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  * {\n    scroll-behavior: auto !important;\n    transition: none !important;\n    animation-duration: 0.01ms !important;\n    animation-iteration-count: 1 !important;\n  }\n}\n';

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
      "step"
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
  var ScoutPanel = class {
    constructor(options) {
      this.settingsStore = options.settingsStore;
      this.indexService = options.indexService;
      this.recognizer = options.recognizer;
      this.onRecognize = options.onRecognize;
      this.onSettingsSaved = options.onSettingsSaved;
      this.onUpdateIndex = options.onUpdateIndex;
      this.onClearIndex = options.onClearIndex;
      this.onScanCards = options.onScanCards;
      this.indexState = this.indexService.getState();
      this.currentResult = null;
      this.busy = false;
      this.searchTimer = null;
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
          on: { click: () => this.toggle() }
        },
        [icon(ScanSearch), this.launcherDot]
      );
      this.panelStatus = element("p", {
        className: "scout-brand-state",
        text: "本地索引准备中"
      });
      this.recognitionView = this.buildRecognitionView();
      this.settingsView = this.buildSettingsView();
      this.panelBody = element("div", { className: "scout-body" }, [
        this.recognitionView
      ]);
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
          element("header", { className: "scout-header" }, [
            element("div", { className: "scout-brand-mark" }, [icon(ScanSearch)]),
            element("div", { className: "scout-brand" }, [
              element("h1", {
                className: "scout-brand-title",
                text: "Bangumi Scout"
              }),
              this.panelStatus
            ]),
            iconButton("关闭", X, () => this.close())
          ]),
          this.panelBody
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
          element("div", { className: "scout-body" }, [this.settingsView])
        ]
      );
      this.settingsBackdrop = element("div", {
        className: "scout-settings-backdrop",
        attrs: { hidden: "" },
        on: { click: () => this.closeSettings() }
      });
      this.root = element("div", { className: "scout-root" }, [
        this.settingsBackdrop,
        this.settingsWindow,
        this.panel,
        this.launcher
      ]);
      this.shadow.append(this.root);
      document.documentElement.append(this.host);
      this.shadow.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (!this.settingsWindow.hidden) {
            this.closeSettings();
          } else if (!this.panel.hidden) {
            this.close();
          }
        }
      });
      this.setIndexState(this.indexState);
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
        text: "打开面板后读取当前页面。"
      });
      this.rescanIcon = icon(RefreshCw);
      this.rescanButton = button(
        "重新识别",
        null,
        () => this.onRecognize({ source: "manual" }),
        { variant: "primary" }
      );
      this.rescanButton.prepend(this.rescanIcon);
      this.aiButton = button(
        "AI 辅助",
        Sparkles,
        () => this.requestAi()
      );
      this.resultActions = element("div", { className: "scout-actions" }, [
        this.rescanButton,
        this.aiButton
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
      this.searchInput = element("input", {
        type: "search",
        placeholder: "手动搜索番剧名或别名",
        autocomplete: "off",
        attrs: { "aria-label": "手动搜索番剧" },
        on: { input: () => this.scheduleManualSearch() }
      });
      this.manualSearchResults = element("div", { className: "scout-list" });
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
      this.batchList = element("div", { className: "scout-list" });
      this.batchTitle = element("span", { text: "当前页面番剧" });
      this.batchSection = element("section", { className: "scout-section" }, [
        element("h3", { className: "scout-section-title" }, [
          icon(ScanSearch),
          this.batchTitle
        ]),
        this.batchList
      ]);
      this.batchSection.hidden = true;
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
      return element("div", {
        className: "scout-view",
        attrs: {
          "data-view": "recognition",
          role: "region",
          "aria-label": "番剧识别结果"
        }
      }, [
        element("div", { className: "scout-result-head" }, [
          element("div", { className: "scout-eyebrow" }, [
            this.resultBadge,
            element("span", { text: "当前页面" })
          ]),
          this.resultTitle,
          this.resultSubtitle,
          this.resultActions
        ]),
        this.manualSearchSection,
        this.batchSection,
        this.resultListSection,
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
    populateSettings(settings) {
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
      this.syncCustomUrlVisibility();
      this.syncSettingsDisabledState();
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
    saveSettings() {
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
        }
      });
      this.populateSettings(settings);
      this.showToast("设置已保存");
      this.onSettingsSaved?.(settings, previous);
    }
    resetSettings() {
      const previous = this.settingsStore.get();
      const settings = this.settingsStore.reset();
      this.populateSettings(settings);
      this.showToast("设置已恢复默认值");
      this.onSettingsSaved?.(settings, previous);
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
      this.settingsFooterStatus.textContent = state.status === INDEX_STATES.READY ? "设置保存在油猴扩展中" : state.message;
      this.settingsWindowStatus.textContent = state.message;
      if (this.updateIndexButton) {
        this.updateIndexButton.disabled = !this.settingsStore.get().index.enabled || state.status === INDEX_STATES.UPDATING || state.status === INDEX_STATES.CHECKING;
      }
    }
    setBusy(busy, message = "正在识别") {
      this.busy = busy;
      this.rescanButton.disabled = busy;
      this.aiButton.disabled = busy;
      this.rescanIcon.classList.toggle("scout-spin", busy);
      if (busy) {
        this.resultBadge.textContent = message;
        this.resultBadge.dataset.tone = "none";
      }
    }
    setResult(result) {
      this.currentResult = result;
      this.renderRecognitionResult(result);
    }
    renderRecognitionResult(result) {
      const best = result.best;
      const item = best?.item ?? null;
      const aiTitle = result.aiResult?.title;
      const fallbackTitle = result.titleCandidates?.[0]?.title;
      const title = item?.title ?? aiTitle ?? fallbackTitle ?? "未识别到番剧";
      const confidence = best?.confidence ?? result.aiResult?.confidence ?? 0;
      const statusLabels = {
        matched: "精确匹配",
        ambiguous: "可能匹配",
        unmatched: "未找到可靠匹配"
      };
      this.resultTitle.textContent = title;
      this.resultBadge.textContent = statusLabels[result.status] ?? "识别完成";
      this.resultBadge.dataset.tone = confidenceTone(confidence);
      if (item) {
        const alternateNames = item.names.filter((name) => name !== item.title).slice(0, 3);
        const metadata = [
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
      this.renderResultRows(this.resultList, result.results, {
        emptyText: "本地索引没有返回候选，可尝试手动搜索或 AI 识别。"
      });
      this.renderDiagnostics(result.diagnostics);
      this.renderBatchCards();
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
        const methods = row.matchedBy?.join(" / ");
        container.append(
          element("div", { className: "scout-list-row" }, [
            element("div", {}, [
              element("div", {
                className: "scout-list-title",
                text: item.title
              }),
              element("div", {
                className: "scout-list-meta",
                text: [
                  item.year,
                  TYPE_LABELS[item.type] ?? item.type,
                  methods
                ].filter(Boolean).join(" · ")
              })
            ]),
            element("span", {
              className: "scout-score",
              text: formatConfidence(confidence)
            })
          ])
        );
      }
    }
    renderDiagnostics(diagnostics) {
      this.diagnosticsList.replaceChildren();
      const entries = (diagnostics ?? []).filter(Boolean);
      this.diagnostics.hidden = entries.length === 0;
      for (const entry of entries) {
        this.diagnosticsList.append(element("li", { text: entry }));
      }
    }
    renderBatchCards() {
      const cards = this.onScanCards?.() ?? [];
      this.batchSection.hidden = cards.length === 0;
      this.batchList.replaceChildren();
      if (!cards.length) {
        return;
      }
      const matched = cards.filter((card) => card.item).length;
      for (const card of cards.slice(0, 30)) {
        this.batchList.append(
          element("div", { className: "scout-list-row" }, [
            element("div", {}, [
              element("div", {
                className: "scout-list-title",
                text: card.item?.title ?? card.title
              }),
              element("div", {
                className: "scout-list-meta",
                text: card.item ? [card.item.year, card.item.names.slice(1, 2).join("")].filter(Boolean).join(" · ") : `Bilibili md${card.mediaId}`
              })
            ]),
            element("span", {
              className: "scout-score",
              text: card.item ? "已匹配" : "未命中"
            })
          ])
        );
      }
      this.batchTitle.textContent = `当前页面番剧 (${matched}/${cards.length})`;
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
        this.renderResultRows(this.manualSearchResults, results, {
          emptyText: "没有搜索到番剧。"
        });
      }, 180);
    }
    requestAi() {
      if (!this.settingsStore.get().ai.enabled) {
        this.openSettings();
        this.showToast("请先启用并配置 DeepSeek");
        this.aiEnabled.focus();
        return;
      }
      this.onRecognize({ source: "manual", ai: "force" });
    }
    showToast(message) {
      this.shadow.querySelector(".scout-toast")?.remove();
      const toast = element("div", {
        className: "scout-toast",
        text: message
      });
      const container = this.settingsWindow.hidden ? this.panel : this.settingsWindow;
      container.append(toast);
      setTimeout(() => toast.remove(), 3200);
    }
    open() {
      this.closeSettings();
      this.panel.hidden = false;
      this.launcher.setAttribute("aria-expanded", "true");
    }
    close() {
      this.panel.hidden = true;
      this.launcher.setAttribute("aria-expanded", "false");
    }
    openSettings() {
      this.close();
      this.settingsBackdrop.hidden = false;
      this.settingsWindow.hidden = false;
      this.launcher.setAttribute("aria-expanded", "true");
      this.indexEnabled.focus();
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
  };

  // src/main.js
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
        threshold: initialSettings.matching.fuzzyThreshold
      }
    });
    const recognizer = new AnimeRecognizer({ settingsStore, indexService });
    let recognitionPromise = null;
    let lastIndexToken = "";
    let lastPageSignature = `${location.href}
${document.title}`;
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
      onScanCards: () => recognizer.scanBilibiliCards().map((card) => ({
        ...card,
        item: card.item ?? indexService.getSearch().findBySiteId("bilibili", card.mediaId)
      }))
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
      recognitionPromise = recognizer.recognize({
        ai: options.ai,
        includeBilibiliApi: options.includeBilibiliApi
      }).then((result) => {
        panel.setResult(result);
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
    function scheduleRecognition(delay = 500) {
      clearTimeout(pageTimer);
      pageTimer = setTimeout(() => {
        const signature = `${location.href}
${document.title}`;
        lastPageSignature = signature;
        runRecognition().catch(() => {
        });
      }, delay);
    }
    await indexService.initialize();
    await runRecognition().catch(() => {
    });
    const observer = new MutationObserver(() => {
      const signature = `${location.href}
${document.title}`;
      if (signature !== lastPageSignature) {
        scheduleRecognition(700);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
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
      getSettings: () => settingsStore.get()
    };
  }
})();
