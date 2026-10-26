const CACHE_KEY = "bangumi-scout.recognition-drafts.v1";
const MAX_DRAFTS = 20;

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
    // The editor remains usable when browser storage is unavailable.
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
  const stored = rawGet(CACHE_KEY, "");
  if (!stored) {
    return {};
  }
  try {
    const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
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
    titleCandidates: Array.isArray(result.titleCandidates)
      ? result.titleCandidates.slice(0, 8)
      : [],
    aiResult: result.aiResult ?? null,
    bilibiliMetadata: result.bilibiliMetadata ?? null,
    diagnostics: Array.isArray(result.diagnostics)
      ? result.diagnostics.slice(0, 8)
      : [],
    context: {
      ...context,
      summary: String(context.summary ?? "").slice(0, 5000),
      comments: Array.isArray(context.comments)
        ? context.comments.slice(0, 8)
        : [],
      titleMentions: Array.isArray(context.titleMentions)
        ? context.titleMentions.slice(0, 12)
        : [],
    },
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
    rating:
      Number.isFinite(rating) && rating >= 1 && rating <= 10
        ? Math.round(rating)
        : null,
    review: String(draft?.review ?? "").slice(0, 20000),
    updatedAt: String(draft?.updatedAt ?? new Date().toISOString()),
  };
}

export function createRecognitionCacheStore() {
  let drafts = loadDrafts();

  function persist() {
    const entries = Object.entries(drafts)
      .sort(
        ([, left], [, right]) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      )
      .slice(0, MAX_DRAFTS);
    drafts = Object.fromEntries(entries);
    rawSet(CACHE_KEY, JSON.stringify(drafts));
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
        updatedAt: draft?.updatedAt ?? new Date().toISOString(),
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
          ([, entry]) => String(entry?.item?.id ?? "") !== id,
        ),
      );
      if (Object.keys(next).length === Object.keys(drafts).length) {
        return false;
      }
      drafts = next;
      persist();
      return true;
    },
  };
}
