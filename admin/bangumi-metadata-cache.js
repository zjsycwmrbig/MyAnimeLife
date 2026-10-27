import {
  bangumiSubjectId,
  fetchBangumiSubject,
} from "./bangumi-subject.js";

const DATABASE_NAME = "myanimelife-bangumi-metadata";
const STORE_NAME = "subjects";
const DATABASE_VERSION = 1;
const MAX_TAGS = 40;
const FETCH_CONCURRENCY = 3;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeUrl(value) {
  const url = clean(value);
  if (!url) {
    return null;
  }
  const resolved = url.startsWith("//") ? `https:${url}` : url;
  return /^https?:\/\//iu.test(resolved) ? resolved : null;
}

function normalizeScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score > 0 && score <= 10
    ? Math.round(score * 10) / 10
    : null;
}

function normalizeCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

function normalizeTags(values) {
  const tags = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const name = clean(value?.name);
    const key = name.normalize("NFKC").toLocaleLowerCase("zh-CN");
    if (!name || !key) {
      continue;
    }
    const count = normalizeCount(value?.count);
    const previous = tags.get(key);
    if (!previous || count > previous.count) {
      tags.set(key, { name, count });
    }
  }
  return [...tags.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.name.localeCompare(right.name, "zh-CN"),
    )
    .slice(0, MAX_TAGS);
}

export function normalizeBangumiMetadata(
  payload,
  subjectId,
  fetchedAt = new Date().toISOString(),
) {
  const id = clean(subjectId) || clean(payload?.id);
  if (!id) {
    throw new Error("Bangumi 元数据缺少条目 ID");
  }
  return {
    schemaVersion: 1,
    subjectId: id,
    score: normalizeScore(payload?.rating?.score),
    ratingCount: normalizeCount(
      payload?.rating?.total ?? payload?.rating?.count,
    ),
    rank: normalizeCount(payload?.rank) || null,
    tags: normalizeTags(payload?.tags),
    summary: clean(payload?.summary).slice(0, 4000),
    coverUrl: normalizeUrl(
      payload?.images?.large ??
        payload?.images?.common ??
        payload?.images?.medium,
    ),
    fetchedAt,
  };
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("无法打开 Bangumi 元数据缓存")),
    );
  });
}

export async function readBangumiMetadata(subjectIds) {
  const ids = [
    ...new Set(
      (subjectIds ?? []).map((value) => bangumiSubjectId(value)).filter(Boolean),
    ),
  ];
  if (!ids.length) {
    return new Map();
  }
  const database = await openDatabase();
  if (!database) {
    return new Map();
  }
  try {
    return await new Promise((resolve, reject) => {
      const values = new Map();
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      for (const id of ids) {
        const request = store.get(id);
        request.addEventListener("success", () => {
          if (request.result?.subjectId) {
            values.set(id, request.result);
          }
        });
      }
      transaction.addEventListener("complete", () => resolve(values));
      transaction.addEventListener("error", () =>
        reject(transaction.error ?? new Error("读取 Bangumi 元数据缓存失败")),
      );
    });
  } finally {
    database.close();
  }
}

async function writeBangumiMetadata(entries) {
  if (!entries.size) {
    return;
  }
  const database = await openDatabase();
  if (!database) {
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      for (const [subjectId, metadata] of entries) {
        store.put(metadata, subjectId);
      }
      transaction.addEventListener("complete", resolve);
      transaction.addEventListener("error", () =>
        reject(transaction.error ?? new Error("写入 Bangumi 元数据缓存失败")),
      );
    });
  } finally {
    database.close();
  }
}

function createLimiter(limit) {
  let active = 0;
  const queue = [];
  const pump = () => {
    while (active < limit && queue.length) {
      active += 1;
      const { task, resolve } = queue.shift();
      Promise.resolve(task())
        .then(resolve, () => resolve(null))
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };
  return (task) =>
    new Promise((resolve) => {
      queue.push({ task, resolve });
      pump();
    });
}

export async function resolveBangumiMetadata(items, options = {}) {
  const candidates = new Map();
  for (const item of items ?? []) {
    const subjectId = bangumiSubjectId(item);
    if (subjectId && !candidates.has(subjectId)) {
      candidates.set(subjectId, item);
    }
  }
  const cached = await readBangumiMetadata([...candidates.keys()]);
  const pending = [...candidates.keys()].filter(
    (subjectId) => options.refresh || !cached.has(subjectId),
  );
  const updates = new Map();
  let completed = 0;
  let failed = 0;
  const limiter = createLimiter(FETCH_CONCURRENCY);
  await Promise.all(
    pending.map((subjectId) =>
      limiter(async () => {
        try {
          const payload = await fetchBangumiSubject(subjectId);
          updates.set(
            subjectId,
            normalizeBangumiMetadata(payload, subjectId),
          );
        } catch {
          failed += 1;
        } finally {
          completed += 1;
          options.onProgress?.({
            completed,
            total: pending.length,
            failed,
          });
        }
      }),
    ),
  );
  await writeBangumiMetadata(updates);
  return {
    metadata: new Map([...cached, ...updates]),
    requested: candidates.size,
    fetched: updates.size,
    failed,
    pending: pending.length,
  };
}

export function applyBangumiMetadata(items, metadata) {
  for (const item of items ?? []) {
    const metadataEntry = metadata.get(bangumiSubjectId(item)) ?? null;
    item.bangumiMetadata = metadataEntry;
    item.bangumiMetadataResolved = Boolean(metadataEntry);
    if (!item.coverUrl && metadataEntry?.coverUrl) {
      item.coverUrl = metadataEntry.coverUrl;
    }
  }
  return items;
}

export function hasUsableBangumiMetadata(metadata) {
  return Boolean(
    metadata &&
      (Number.isFinite(metadata.score) || metadata.tags?.length),
  );
}

function normalizedTag(value) {
  return clean(value).normalize("NFKC").toLocaleLowerCase("zh-CN");
}

function scoreBounds(options) {
  const minimum = Number(options.scoreMin);
  const maximum = Number(options.scoreMax);
  return {
    minimum:
      options.scoreMin === "" || options.scoreMin === null ||
      options.scoreMin === undefined || !Number.isFinite(minimum)
        ? null
        : Math.max(0, Math.min(10, minimum)),
    maximum:
      options.scoreMax === "" || options.scoreMax === null ||
      options.scoreMax === undefined || !Number.isFinite(maximum)
        ? null
        : Math.max(0, Math.min(10, maximum)),
  };
}

export function filterAndSortByBangumiMetadata(items, options = {}) {
  const bounds = scoreBounds(options);
  const selectedTags = new Set(
    (options.tags ?? []).map(normalizedTag).filter(Boolean),
  );
  const availability = clean(options.availability) || "all";
  const filtered = (items ?? [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const metadata = item.bangumiMetadata;
      const available = hasUsableBangumiMetadata(metadata);
      if (availability === "available" && !available) {
        return false;
      }
      if (availability === "unavailable" && available) {
        return false;
      }
      if (bounds.minimum !== null || bounds.maximum !== null) {
        if (!Number.isFinite(metadata?.score)) {
          return false;
        }
        if (bounds.minimum !== null && metadata.score < bounds.minimum) {
          return false;
        }
        if (bounds.maximum !== null && metadata.score > bounds.maximum) {
          return false;
        }
      }
      if (selectedTags.size) {
        const itemTags = new Set(
          (metadata?.tags ?? []).map((tag) => normalizedTag(tag.name)),
        );
        if (![...selectedTags].some((tag) => itemTags.has(tag))) {
          return false;
        }
      }
      return true;
    });

  const sort = clean(options.sort);
  if (sort === "bangumi-score-desc" || sort === "bangumi-score-asc") {
    const direction = sort === "bangumi-score-desc" ? -1 : 1;
    filtered.sort((left, right) => {
      const leftScore = Number.isFinite(left.item.bangumiMetadata?.score)
        ? left.item.bangumiMetadata.score
        : null;
      const rightScore = Number.isFinite(right.item.bangumiMetadata?.score)
        ? right.item.bangumiMetadata.score
        : null;
      if (leftScore === null && rightScore === null) {
        return left.index - right.index;
      }
      if (leftScore === null) {
        return 1;
      }
      if (rightScore === null) {
        return -1;
      }
      return (
        (leftScore - rightScore) * direction ||
        left.index - right.index
      );
    });
  }

  return {
    items: filtered.map(({ item }) => item),
    availableCount: (items ?? []).filter((item) =>
      hasUsableBangumiMetadata(item.bangumiMetadata),
    ).length,
    totalCount: items?.length ?? 0,
  };
}
