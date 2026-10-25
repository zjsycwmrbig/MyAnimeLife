export const ANIME_JSONL_PATH = "data/anime.jsonl";
export const ANIME_INDEX_JSONL_PATH = "data/anime-index.jsonl";
export const BACKUP_DIRECTORY = "data/backups";
export const MAX_BACKUP_SNAPSHOTS = 5;

function cleanString(value) {
  return String(value ?? "").trim();
}

function timestamp(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function nextRecordTimestamp(previous, now) {
  const currentTime = new Date(now).getTime();
  const previousTime = new Date(previous).getTime();
  if (
    Number.isFinite(currentTime) &&
    Number.isFinite(previousTime) &&
    currentTime <= previousTime
  ) {
    return new Date(previousTime + 1).toISOString();
  }
  return now;
}

function uniqueStrings(values) {
  const seen = new Set();
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

export function parseJsonl(text, label = "JSONL") {
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

export function serializeJsonl(records) {
  const lines = (records ?? []).map((record) => JSON.stringify(record));
  return lines.length ? `${lines.join("\n")}\n` : "";
}

export function sortRecordsById(records) {
  return [...(records ?? [])].sort((left, right) =>
    cleanString(left?.id).localeCompare(cleanString(right?.id), "zh-CN"),
  );
}

export function chooseLatestRecord(existing, incoming) {
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }
  return timestamp(incoming.updatedAt) >= timestamp(existing.updatedAt)
    ? incoming
    : existing;
}

export function upsertRecord(records, incoming) {
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
  return cleanString(review)
    .replace(/[`*_>#~\[\]()]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 180);
}

export function indexRecordFromRecord(record) {
  return {
    schemaVersion: 1,
    id: cleanString(record.id),
    title: cleanString(record.title),
    aliases: uniqueStrings([
      record.match?.matchedTitle,
      ...(Array.isArray(record.names) ? record.names : []),
    ]),
    rating:
      record.rating === null || record.rating === undefined
        ? null
        : Number(record.rating),
    reviewExcerpt: reviewExcerpt(record.review),
    coverUrl: record.coverUrl ?? null,
    externalIds: record.externalIds ?? {},
    season: record.season ?? null,
    match: {
      status: record.match?.status ?? "unmatched",
      method: record.match?.method ?? "manual",
      confidence: Number(record.match?.confidence) || 0,
      matchedTitle: record.match?.matchedTitle ?? null,
    },
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
    deletedAt: record.deletedAt ?? null,
  };
}

export function buildAnimeIndex(records) {
  return sortRecordsById(records ?? [])
    .map(indexRecordFromRecord)
    .sort((left, right) => left.id.localeCompare(right.id, "zh-CN"));
}

export function createBackupSnapshot({
  animeText = "",
  indexText = "",
  createdAt = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: 1,
    kind: "anime-library-backup",
    createdAt,
    animeText,
    indexText,
  };
}
