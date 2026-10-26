import { api, getRuntime } from "./runtime.js";

const DRAFT_VERSION = 2;
const DRAFT_PREFIX = "myanimelife.admin.pending.v2";

function clean(value) {
  return String(value ?? "").trim();
}

function storageKey() {
  const runtime = getRuntime();
  const repository = encodeURIComponent(runtime.repository || "local");
  const branch = encodeURIComponent(runtime.branch || "main");
  return `${DRAFT_PREFIX}:${repository}:${branch}`;
}

function normalizeRating(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 0 && rating <= 10
    ? Math.round(rating * 10) / 10
    : null;
}

function normalizeChanges(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    title: String(value.title ?? ""),
    rating: normalizeRating(value.rating),
    review: String(value.review ?? ""),
    note: String(value.note ?? ""),
  };
}

export function compactCatalogItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  const id = clean(item.id);
  if (!id) {
    return null;
  }
  return {
    id,
    title: String(item.title ?? ""),
    displayTitle: String(item.displayTitle ?? item.title ?? ""),
    names: Array.isArray(item.names) ? item.names.slice(0, 8) : [],
    type: item.type ?? "tv",
    begin: item.begin ?? null,
    year: item.year ?? null,
    sites:
      item.sites && typeof item.sites === "object" ? item.sites : {},
    season: item.season ?? null,
    coverUrl: item.coverUrl ?? null,
    sources: Array.isArray(item.sources) ? item.sources : [],
  };
}

function normalizeDrafts(value) {
  if (!value || typeof value !== "object") {
    return { edits: [], additions: [] };
  }
  const edits = Array.isArray(value.edits)
    ? value.edits
        .map((entry) => ({
          id: clean(entry?.id),
          title: String(entry?.title ?? ""),
          coverUrl: entry?.coverUrl ?? null,
          season: entry?.season ?? null,
          changes: normalizeChanges(entry?.changes),
          savedAt: entry?.savedAt ?? null,
        }))
        .filter((entry) => entry.id && entry.changes)
    : [];
  const additions = Array.isArray(value.additions)
    ? value.additions
        .map((entry) => ({
          item: compactCatalogItem(entry?.item),
          changes: normalizeChanges(entry?.changes),
          savedAt: entry?.savedAt ?? null,
        }))
        .filter((entry) => entry.item?.id && entry.changes)
    : [];
  return { edits, additions };
}

export function readPendingDrafts() {
  try {
    return normalizeDrafts(
      JSON.parse(localStorage.getItem(storageKey()) || "null"),
    );
  } catch {
    return { edits: [], additions: [] };
  }
}

export function writePendingDrafts(drafts, options = {}) {
  const normalized = normalizeDrafts(drafts);
  const empty = !normalized.edits.length && !normalized.additions.length;
  try {
    if (empty) {
      localStorage.removeItem(storageKey());
    } else {
      localStorage.setItem(
        storageKey(),
        JSON.stringify({
          version: DRAFT_VERSION,
          ...normalized,
          savedAt: new Date().toISOString(),
        }),
      );
    }
  } catch {
    // A storage failure must not prevent editing in memory.
  }
  if (!options.silent) {
    window.dispatchEvent(
      new CustomEvent("anime-pending:changed", {
        detail: {
          drafts: normalized,
          source: options.source ?? "admin",
        },
      }),
    );
  }
  return normalized;
}

export function clearPendingDrafts() {
  return writePendingDrafts(
    { edits: [], additions: [] },
    { source: "clear" },
  );
}

export function pendingDraftsKey() {
  return storageKey();
}

export function pendingCount(drafts = readPendingDrafts()) {
  return drafts.edits.length + drafts.additions.length;
}

function selectionPayload(entry) {
  return {
    id: entry.item.id,
    title: entry.changes.title,
    rating: entry.changes.rating,
    review: entry.changes.review,
    note: entry.changes.note,
    coverUrl: entry.item.coverUrl ?? null,
  };
}

export async function commitPendingDrafts(options = {}) {
  const pending = readPendingDrafts();
  if (!pendingCount(pending)) {
    return { empty: true, changed: false };
  }
  const payload = await api("/api/library/batch", {
    method: "POST",
    body: JSON.stringify({
      edits: pending.edits.map((entry) => ({
        id: entry.id,
        changes: entry.changes,
      })),
      additions: pending.additions.map(selectionPayload),
      sync: Boolean(options.sync),
      message: options.message ?? "",
    }),
  });
  const changed = payload.changed !== false;
  if (changed) {
    clearPendingDrafts();
  }
  window.dispatchEvent(
    new CustomEvent("anime-pending:committed", {
      detail: { payload, changed },
    }),
  );
  return { ...payload, empty: false, changed };
}
