const RECORDS_KEY = "bangumi-scout.personal-records.v1";

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
    // Keep the editor usable when browser storage is unavailable.
  }
}

function loadRecords() {
  const stored = rawGet(RECORDS_KEY, "");
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
    rating:
      Number.isFinite(rating) && rating >= 1 && rating <= 10
        ? Math.round(rating)
        : null,
    review: String(record?.review ?? "").slice(0, 20000),
    updatedAt: String(record?.updatedAt ?? ""),
  };
}

export function createPersonalRecordStore() {
  let records = loadRecords();

  function persist() {
    try {
      rawSet(RECORDS_KEY, JSON.stringify(records));
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
      const preservedTimestamp =
        options.preserveUpdatedAt &&
        Number.isFinite(Date.parse(requestedTimestamp))
          ? new Date(requestedTimestamp).toISOString()
          : null;
      const next = {
        ...sanitizeRecord(record),
        updatedAt: preservedTimestamp ?? new Date().toISOString(),
      };
      records = { ...records, [key]: next };
      persist();
      return next;
    },
  };
}
