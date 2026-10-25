import { normalizeCoverUrl } from "../core/cover-url.js";
import { normalizeTitle } from "../core/title-normalize.js";

export const INDEX_SCHEMA_VERSION = 1;

const TRACKED_SITES = new Set([
  "bilibili",
  "bangumi",
  "mal",
  "aniList",
  "anidb",
  "mikan",
  "tmdb",
]);

const LANGUAGE_ORDER = ["zh-Hans", "zh-Hant", "zh", "ja", "en"];
const DISPLAY_TITLE_LANGUAGES = ["zh-Hans", "zh-Hant", "zh"];

function uniqueStrings(values) {
  const seen = new Set();
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
      (language) => !LANGUAGE_ORDER.includes(language),
    ),
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

function collectDisplayTitle(item, names) {
  const translations = item.titleTranslate ?? {};
  for (const language of DISPLAY_TITLE_LANGUAGES) {
    const values = translations[language];
    const candidates = Array.isArray(values) ? values : [values];
    const translated = uniqueStrings(candidates)[0];
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
    item?.images?.medium,
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
    (site) => sites[site],
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

export function buildSlimIndex(raw, metadata = {}) {
  if (!raw || !Array.isArray(raw.items)) {
    throw new Error("Index source must contain an items array");
  }

  const items = raw.items
    .map((item) => {
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
        displayTitle: collectDisplayTitle(item, names),
        names,
        normalizedNames: uniqueStrings(names.map(normalizeTitle)),
        searchText: names.join(" "),
        type: String(item.type ?? "unknown"),
        begin,
        year,
        sites,
        coverUrl: collectCoverUrl(item),
      };
    })
    .filter(Boolean);

  return {
    schemaVersion: INDEX_SCHEMA_VERSION,
    source: {
      id: metadata.sourceId ?? metadata.sourceName ?? "bangumi-data",
      name: metadata.sourceName ?? "bangumi-data",
      version: String(metadata.sourceVersion ?? "unknown"),
      fetchedAt: metadata.fetchedAt ?? new Date().toISOString(),
      lastCheckedAt: metadata.lastCheckedAt ?? null,
      license: metadata.license ?? "CC BY 4.0",
      contentHash: metadata.contentHash ?? null,
      sourceUrl: metadata.sourceUrl ?? null,
    },
    builtAt: new Date().toISOString(),
    itemCount: items.length,
    items,
  };
}

export function normalizeIndexPayload(payload, metadata = {}) {
  if (
    payload?.schemaVersion === INDEX_SCHEMA_VERSION &&
    Array.isArray(payload.items)
  ) {
    return {
      ...payload,
      source: {
        ...payload.source,
        ...metadata,
      },
      itemCount: payload.items.length,
    };
  }
  return buildSlimIndex(payload, metadata);
}

export function indexItemsHaveSearchFields(items) {
  return (
    Array.isArray(items) &&
    items.every(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.title === "string" &&
        Array.isArray(item?.names) &&
        item?.sites &&
        typeof item.sites === "object",
    )
  );
}
