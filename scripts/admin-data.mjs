import {
  buildAnimeIndex,
  nextRecordTimestamp,
  serializeJsonl,
  sortRecordsById,
} from "./library-data.mjs";
import { createRecordFromCatalog } from "./catalog-data.mjs";

function cleanString(value) {
  return String(value ?? "").trim();
}

function sanitizeRating(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
    throw new Error("评分必须是 0 到 10 之间的数字");
  }
  return Math.round(rating * 10) / 10;
}

function validateText(value, label, maximumLength) {
  const text = String(value ?? "");
  if (text.length > maximumLength) {
    throw new Error(`${label}不能超过 ${maximumLength} 个字符`);
  }
  return text;
}

function externalIdEntries(record) {
  return Object.entries(record?.externalIds ?? {}).map(([source, id]) => ({
    key: `${source}:${id}`,
    source,
    id,
  }));
}

export function buildLibraryData(records) {
  const sortedRecords = sortRecordsById(records);
  const index = buildAnimeIndex(sortedRecords);
  return {
    records: sortedRecords,
    index,
    dataText: serializeJsonl(sortedRecords),
    indexText: serializeJsonl(index),
  };
}

export function updateLibraryRecord(records, recordId, changes, now) {
  const existing = records.find((record) => record.id === recordId);
  if (!existing) {
    const error = new Error("没有找到这条番剧记录");
    error.status = 404;
    throw error;
  }

  const title = cleanString(changes.title ?? existing.title);
  if (!title) {
    throw new Error("标题不能为空");
  }
  const updated = {
    ...existing,
    title: validateText(title, "标题", 200),
    rating: sanitizeRating(
      Object.hasOwn(changes, "rating") ? changes.rating : existing.rating,
    ),
    review: validateText(
      Object.hasOwn(changes, "review") ? changes.review : existing.review,
      "评价",
      20000,
    ),
    note: validateText(
      Object.hasOwn(changes, "note") ? changes.note : existing.note,
      "备注",
      5000,
    ),
    updatedAt: nextRecordTimestamp(existing.updatedAt, now),
  };
  const nextRecords = records.map((record) =>
    record.id === recordId ? updated : record,
  );
  return {
    ...buildLibraryData(nextRecords),
    record: updated,
  };
}

export function appendCatalogRecords(records, entries, now) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error("没有选择要添加的番剧");
  }
  if (entries.length > 100) {
    throw new Error("单次最多添加 100 部番剧");
  }

  const existingIds = new Set(records.map((record) => record.id));
  const existingExternalIds = new Map();
  for (const record of records) {
    for (const external of externalIdEntries(record)) {
      existingExternalIds.set(external.key, record);
    }
  }

  const addedRecords = [];
  const skipped = [];
  const batchExternalIds = new Map();
  const seenCatalogIds = new Set();
  for (const [position, entry] of entries.entries()) {
    const item = entry?.item ?? entry;
    if (!item || typeof item !== "object") {
      skipped.push({
        catalogId: null,
        title: `第 ${position + 1} 个候选`,
        reason: "invalid-item",
        message: "索引候选无效",
      });
      continue;
    }

    const catalogId = cleanString(item.id);
    const title = cleanString(item.displayTitle ?? item.title);
    if (!catalogId) {
      skipped.push({
        catalogId: null,
        title: title || `第 ${position + 1} 个候选`,
        reason: "invalid-item",
        message: "索引候选缺少 ID",
      });
      continue;
    }
    if (seenCatalogIds.has(catalogId)) {
      skipped.push({
        catalogId,
        title,
        reason: "batch-duplicate",
        message: "同一索引在本次选择中重复出现",
      });
      continue;
    }
    seenCatalogIds.add(catalogId);

    const record = createRecordFromCatalog(item, entry, now);
    if (existingIds.has(record.id)) {
      skipped.push({
        catalogId,
        title: record.title,
        reason: "existing-record-id",
        message: "相同记录 ID 已存在",
      });
      continue;
    }

    let conflict = null;
    for (const external of externalIdEntries(record)) {
      const existing = existingExternalIds.get(external.key);
      if (existing) {
        conflict = {
          key: external.key,
          record: existing,
          source: "library",
        };
        break;
      }
      const batchRecord = batchExternalIds.get(external.key);
      if (batchRecord) {
        conflict = {
          key: external.key,
          record: batchRecord,
          source: "batch",
        };
        break;
      }
    }
    if (conflict) {
      const reusedInBatch = conflict.source === "batch";
      skipped.push({
        catalogId,
        title: record.title,
        reason: reusedInBatch
          ? "batch-external-id"
          : "existing-external-id",
        message: reusedInBatch
          ? `外部站点 ID ${conflict.key} 已在本批次使用`
          : `外部站点 ID ${conflict.key} 已存在于《${conflict.record.title}》`,
        conflictRecordId: conflict.record.id ?? null,
        externalKey: conflict.key,
      });
      continue;
    }

    existingIds.add(record.id);
    for (const external of externalIdEntries(record)) {
      batchExternalIds.set(external.key, {
        id: record.id,
        title: record.title,
        key: external.key,
      });
    }
    addedRecords.push(record);
  }

  const nextRecords = [...records, ...addedRecords];
  return {
    ...buildLibraryData(nextRecords),
    addedRecords,
    skipped,
  };
}

export function applyLibraryChanges(records, changes, now) {
  let nextRecords = records;
  const updatedRecords = [];
  const edits = Array.isArray(changes?.edits) ? changes.edits : [];
  for (const edit of edits) {
    const result = updateLibraryRecord(
      nextRecords,
      cleanString(edit?.id),
      edit?.changes ?? {},
      now,
    );
    nextRecords = result.records;
    updatedRecords.push(result.record);
  }

  const additions = Array.isArray(changes?.additions)
    ? changes.additions
    : [];
  const appended = additions.length
    ? appendCatalogRecords(nextRecords, additions, now)
    : {
        ...buildLibraryData(nextRecords),
        addedRecords: [],
        skipped: [],
      };
  return {
    ...appended,
    updatedRecords,
  };
}

export function removeLibraryRecords(records, recordIds) {
  const ids = new Set(
    (recordIds ?? []).map((id) => cleanString(id)).filter(Boolean),
  );
  if (!ids.size) {
    throw new Error("没有选择要删除的番剧");
  }
  const remaining = records.filter((record) => !ids.has(record.id));
  if (remaining.length === records.length) {
    throw new Error("选择的番剧不在当前数据中");
  }
  return buildLibraryData(remaining);
}
