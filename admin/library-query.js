const DEFAULT_SORT = "created-desc";

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizedBounds(minimum, maximum) {
  let low = finiteNumber(minimum);
  let high = finiteNumber(maximum);
  if (low !== null && high !== null && low > high) {
    [low, high] = [high, low];
  }
  return [low, high];
}

function dateKey(value) {
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/u);
  return match?.[1] ?? null;
}

function normalizedDateBounds(from, to) {
  let start = dateKey(from);
  let end = dateKey(to);
  if (start !== null && end !== null && start > end) {
    [start, end] = [end, start];
  }
  return [start, end];
}

function ratingOf(record) {
  const rating = finiteNumber(record?.rating);
  return rating !== null && rating >= 0 && rating <= 10 ? rating : null;
}

function yearOf(record) {
  const year = finiteNumber(record?.season?.year);
  return Number.isInteger(year) && year > 0 ? year : null;
}

function hasText(value) {
  return String(value ?? "").trim().length > 0;
}

function seasonText(record) {
  if (record?.season?.label) {
    return record.season.label;
  }
  if (record?.season?.number) {
    return `第${record.season.number}季`;
  }
  return "";
}

function sourceText(record) {
  return Object.entries(record?.externalIds ?? {})
    .map(([source, id]) => `${source}:${id}`)
    .join(" ");
}

function searchText(record) {
  return [
    record?.id,
    record?.title,
    record?.review,
    record?.note,
    record?.season?.year,
    seasonText(record),
    sourceText(record),
    record?.match?.matchedTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("zh-CN");
}

function matchesStatus(record, status) {
  const rating = ratingOf(record);
  if (status === "rated") {
    return rating !== null;
  }
  if (status === "unrated") {
    return rating === null;
  }
  if (status === "reviewed") {
    return hasText(record?.review);
  }
  if (status === "noted") {
    return hasText(record?.note);
  }
  return true;
}

function matchesRange(value, [minimum, maximum]) {
  if (minimum === null && maximum === null) {
    return true;
  }
  if (value === null) {
    return false;
  }
  return (
    (minimum === null || value >= minimum) &&
    (maximum === null || value <= maximum)
  );
}

function timestamp(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullable(left, right, direction, nullsLast = true) {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return nullsLast ? 1 : -1;
  }
  if (right === null) {
    return nullsLast ? -1 : 1;
  }
  return direction * (left - right);
}

function compareTitle(left, right) {
  return String(left?.title ?? "").localeCompare(String(right?.title ?? ""), "zh-CN", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareCreatedDesc(left, right) {
  return compareNullable(
    timestamp(left?.createdAt),
    timestamp(right?.createdAt),
    -1,
  );
}

function tieBreak(left, right) {
  return compareCreatedDesc(left, right) || compareTitle(left, right);
}

export function sortLibraryRecords(records, sort = DEFAULT_SORT) {
  return records.slice().sort((left, right) => {
    let result = 0;
    if (sort === "created-asc") {
      result = compareNullable(
        timestamp(left.createdAt),
        timestamp(right.createdAt),
        1,
      );
    } else if (sort === "updated-desc") {
      result = compareNullable(
        timestamp(left.updatedAt),
        timestamp(right.updatedAt),
        -1,
      );
    } else if (sort === "updated-asc") {
      result = compareNullable(
        timestamp(left.updatedAt),
        timestamp(right.updatedAt),
        1,
      );
    } else if (sort === "rating-desc") {
      result = compareNullable(ratingOf(left), ratingOf(right), -1);
    } else if (sort === "rating-asc") {
      result = compareNullable(ratingOf(left), ratingOf(right), 1);
    } else if (sort === "year-desc") {
      result = compareNullable(yearOf(left), yearOf(right), -1);
    } else if (sort === "year-asc") {
      result = compareNullable(yearOf(left), yearOf(right), 1);
    } else if (sort === "title-asc") {
      result = compareTitle(left, right);
    } else if (sort === "title-desc") {
      result = compareTitle(right, left);
    } else {
      result = compareCreatedDesc(left, right);
    }
    return result || tieBreak(left, right);
  });
}

export function filterLibraryRecords(records, criteria = {}) {
  const query = String(criteria.query ?? "")
    .trim()
    .toLocaleLowerCase("zh-CN");
  const ratingBounds = normalizedBounds(criteria.ratingMin, criteria.ratingMax);
  const yearBounds = normalizedBounds(criteria.yearMin, criteria.yearMax);
  const dateBounds = normalizedDateBounds(
    criteria.createdFrom,
    criteria.createdTo,
  );
  const status = String(criteria.status ?? "all");

  return (records ?? []).filter((record) => {
    if (!matchesStatus(record, status)) {
      return false;
    }
    if (!matchesRange(ratingOf(record), ratingBounds)) {
      return false;
    }
    if (!matchesRange(yearOf(record), yearBounds)) {
      return false;
    }

    const createdAt = dateKey(record?.createdAt);
    if (
      (dateBounds[0] !== null || dateBounds[1] !== null) &&
      createdAt === null
    ) {
      return false;
    }
    if (dateBounds[0] !== null && createdAt < dateBounds[0]) {
      return false;
    }
    if (dateBounds[1] !== null && createdAt > dateBounds[1]) {
      return false;
    }
    return !query || searchText(record).includes(query);
  });
}

export function queryLibraryRecords(records, criteria = {}) {
  return sortLibraryRecords(
    filterLibraryRecords(records, criteria),
    criteria.sort ?? DEFAULT_SORT,
  );
}
