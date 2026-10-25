import { fetchBangumiCover } from "../recognizers/bangumi.js";
import { normalizeCoverUrl } from "./cover-url.js";

const COVER_CACHE_KEY = "bangumi-scout.cover-cache.v1";
const CACHE_LIMIT = 600;
const MAX_CACHE_AGE = 90 * 24 * 60 * 60 * 1000;

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
    // Covers remain available for the current page when storage is blocked.
  }
}

function loadCache() {
  const stored = rawGet(COVER_CACHE_KEY, "");
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
  return url && Number.isFinite(updatedAt) && Date.now() - updatedAt < MAX_CACHE_AGE
    ? url
    : null;
}

function trimCache(cache) {
  return Object.fromEntries(
    Object.entries(cache)
      .sort(
        (left, right) =>
          Number(right[1]?.updatedAt ?? 0) - Number(left[1]?.updatedAt ?? 0),
      )
      .slice(0, CACHE_LIMIT),
  );
}

export function createCoverResolver() {
  let cache = loadCache();
  const pending = new Map();

  async function persistCover(subjectId) {
    try {
      const url = await fetchBangumiCover(subjectId);
      if (!url) {
        return null;
      }
      cache = trimCache({
        ...cache,
        [subjectId]: { url, updatedAt: Date.now() },
      });
      rawSet(COVER_CACHE_KEY, JSON.stringify(cache));
      return url;
    } catch {
      return null;
    }
  }

  return function resolveCover(item) {
    const directUrl =
      normalizeCoverUrl(item?.coverUrl) ??
      normalizeCoverUrl(item?.images?.large) ??
      normalizeCoverUrl(item?.images?.common);
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
        persistCover(subjectId).finally(() => pending.delete(subjectId)),
      );
    }
    return pending.get(subjectId);
  };
}
