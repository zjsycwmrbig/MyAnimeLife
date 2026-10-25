const SETTINGS_KEY = "bangumi-scout.settings.v1";

export const INDEX_SOURCES = Object.freeze({
  BANGUMI_DATA: "bangumi-data",
  CUSTOM: "custom",
});

export const UPDATE_FREQUENCIES = Object.freeze({
  STARTUP: "startup",
  DAILY: "daily",
  WEEKLY: "weekly",
  MANUAL: "manual",
});

export const DEFAULT_SETTINGS = Object.freeze({
  index: {
    enabled: true,
    source: INDEX_SOURCES.BANGUMI_DATA,
    customIndexUrl: "",
    updateFrequency: UPDATE_FREQUENCIES.DAILY,
  },
  matching: {
    fuzzyThreshold: 0.42,
    useRegexCandidates: true,
    autoAiThreshold: 0.62,
  },
  ai: {
    enabled: false,
    autoFallback: false,
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    maxContextChars: 6000,
  },
  ui: {
    launcherVisible: true,
  },
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
    if (
      incoming[section] &&
      typeof incoming[section] === "object" &&
      !Array.isArray(incoming[section])
    ) {
      Object.assign(result[section], incoming[section]);
    }
  }
  return sanitizeSettings(result);
}

export function sanitizeSettings(input) {
  const settings = mergeRawDefaults(input);

  settings.index.enabled = Boolean(settings.index.enabled);
  settings.index.source = Object.values(INDEX_SOURCES).includes(
    settings.index.source,
  )
    ? settings.index.source
    : INDEX_SOURCES.BANGUMI_DATA;
  settings.index.customIndexUrl = String(
    settings.index.customIndexUrl ?? "",
  ).trim();
  settings.index.updateFrequency = Object.values(UPDATE_FREQUENCIES).includes(
    settings.index.updateFrequency,
  )
    ? settings.index.updateFrequency
    : UPDATE_FREQUENCIES.DAILY;

  settings.matching.fuzzyThreshold = clampNumber(
    settings.matching.fuzzyThreshold,
    0.15,
    0.8,
    0.42,
  );
  settings.matching.useRegexCandidates = Boolean(
    settings.matching.useRegexCandidates,
  );
  settings.matching.autoAiThreshold = clampNumber(
    settings.matching.autoAiThreshold,
    0.3,
    0.95,
    0.62,
  );

  settings.ai.enabled = Boolean(settings.ai.enabled);
  settings.ai.autoFallback = Boolean(settings.ai.autoFallback);
  settings.ai.apiKey = String(settings.ai.apiKey ?? "").trim();
  settings.ai.baseUrl =
    String(settings.ai.baseUrl ?? "").trim() || "https://api.deepseek.com";
  settings.ai.model =
    String(settings.ai.model ?? "").trim() || "deepseek-chat";
  settings.ai.maxContextChars = Math.round(
    clampNumber(settings.ai.maxContextChars, 1000, 16000, 6000),
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
    // Settings remain in memory when browser storage is unavailable.
  }
}

export function loadSettings() {
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

export function createSettingsStore() {
  let value = loadSettings();
  const listeners = new Set();

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
    },
  };
}
