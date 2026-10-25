function cleanString(value) {
  return String(value ?? "").trim();
}

export function normalizeDuplicateTitle(value) {
  return cleanString(value)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\p{P}\s]+/gu, "");
}

function titleBigrams(value) {
  const characters = [...value];
  if (characters.length < 2) {
    return new Set(characters);
  }
  const grams = new Set();
  for (let index = 0; index < characters.length - 1; index += 1) {
    grams.add(`${characters[index]}${characters[index + 1]}`);
  }
  return grams;
}

function titleSimilarity(left, right) {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  if (left.startsWith(right) || right.startsWith(left)) {
    return 0.92;
  }
  const leftGrams = titleBigrams(left);
  const rightGrams = titleBigrams(right);
  if (!leftGrams.size || !rightGrams.size) {
    return 0;
  }
  let intersection = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) {
      intersection += 1;
    }
  }
  return (2 * intersection) / (leftGrams.size + rightGrams.size);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function seasonIdentity(record) {
  return {
    number: numberOrNull(record?.season?.number),
    year: Number.isInteger(record?.season?.year)
      ? record.season.year
      : null,
    key: cleanString(record?.season?.key) || null,
  };
}

function seasonsConflict(left, right) {
  const leftSeason = seasonIdentity(left);
  const rightSeason = seasonIdentity(right);
  if (
    leftSeason.number &&
    rightSeason.number &&
    leftSeason.number !== rightSeason.number
  ) {
    return true;
  }
  if (
    leftSeason.year &&
    rightSeason.year &&
    leftSeason.year !== rightSeason.year
  ) {
    return true;
  }
  return false;
}

function externalEntries(record) {
  return Object.entries(record?.externalIds ?? {})
    .map(([source, id]) => ({
      key: `${source}:${cleanString(id)}`,
      source,
      id: cleanString(id),
    }))
    .filter((entry) => entry.id);
}

function groupMembers(groups, entries, group) {
  return [...group].map((index) => entries[index]);
}

function mergeRecords(groups, entries, leftIndex, rightIndex) {
  const left = groups.get(leftIndex);
  const right = groups.get(rightIndex);
  if (left === right) {
    return false;
  }
  const leftMembers = groupMembers(groups, entries, left);
  const rightMembers = groupMembers(groups, entries, right);
  if (
    leftMembers.some((leftMember) =>
      rightMembers.some((rightMember) =>
        seasonsConflict(leftMember.record, rightMember.record),
      ),
    )
  ) {
    return false;
  }
  const target = left.size >= right.size ? left : right;
  const source = target === left ? right : left;
  for (const index of source) {
    target.add(index);
    groups.set(index, target);
  }
  return true;
}

function duplicateRecordView(record) {
  return {
    id: record.id,
    title: record.title,
    rating: record.rating,
    review: record.review,
    note: record.note,
    coverUrl: record.coverUrl ?? null,
    externalIds: record.externalIds ?? {},
    season: record.season ?? null,
    match: record.match ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt ?? null,
  };
}

export function findDuplicateGroups(records) {
  const entries = (records ?? []).map((record, index) => ({
    record,
    index,
    normalizedTitle: normalizeDuplicateTitle(record?.title),
  }));
  if (entries.length < 2) {
    return [];
  }

  const groups = new Map(entries.map((entry) => [entry.index, new Set([entry.index])]));
  const reasonsByIndex = new Map(
    entries.map((entry) => [entry.index, new Set()]),
  );
  function connect(left, right, reason) {
    if (!mergeRecords(groups, entries, left.index, right.index)) {
      return;
    }
    reasonsByIndex.get(left.index).add(reason);
    reasonsByIndex.get(right.index).add(reason);
  }

  const externalBuckets = new Map();
  for (const entry of entries) {
    for (const external of externalEntries(entry.record)) {
      const key = external.key;
      const bucket = externalBuckets.get(key) ?? [];
      for (const previous of bucket) {
        connect(previous, entry, `external-id:${key}`);
      }
      bucket.push(entry);
      externalBuckets.set(key, bucket);
    }
  }

  const titleBuckets = new Map();
  for (const entry of entries) {
    if (!entry.normalizedTitle) {
      continue;
    }
    const bucket = titleBuckets.get(entry.normalizedTitle) ?? [];
    for (const previous of bucket) {
      connect(previous, entry, "title-exact");
    }
    bucket.push(entry);
    titleBuckets.set(entry.normalizedTitle, bucket);
  }

  const prefixBuckets = new Map();
  for (const entry of entries) {
    const title = entry.normalizedTitle;
    if ([...title].length < 4) {
      continue;
    }
    const prefix = [...title].slice(0, 2).join("");
    const bucket = prefixBuckets.get(prefix) ?? [];
    for (const previous of bucket) {
      if (previous.normalizedTitle === title) {
        continue;
      }
      const similarity = titleSimilarity(
        previous.normalizedTitle,
        entry.normalizedTitle,
      );
      if (similarity >= 0.8) {
        connect(previous, entry, `title-similar:${similarity.toFixed(2)}`);
      }
    }
    bucket.push(entry);
    prefixBuckets.set(prefix, bucket);
  }

  const seenGroups = new Set();
  const output = [];
  for (const entry of entries) {
    const group = groups.get(entry.index);
    if (group.size < 2 || seenGroups.has(group)) {
      continue;
    }
    seenGroups.add(group);
    const members = [...group]
      .sort((left, right) =>
        cleanString(records[left]?.title).localeCompare(
          cleanString(records[right]?.title),
          "zh-CN",
        ) ||
        cleanString(records[left]?.id).localeCompare(
          cleanString(records[right]?.id),
          "en",
        ),
      )
      .map((index) => records[index]);
    const reasons = new Set();
    for (const index of group) {
      for (const reason of reasonsByIndex.get(index) ?? []) {
        reasons.add(reason);
      }
    }
    const reasonList = [...reasons].sort();
    const confirmed = reasonList.some(
      (reason) =>
        reason.startsWith("external-id:") || reason === "title-exact",
    );
    output.push({
      id: `duplicates-${output.length + 1}`,
      severity: confirmed ? "confirmed" : "review",
      reasons: reasonList,
      members: members.map(duplicateRecordView),
    });
  }
  return output.sort(
    (left, right) =>
      (left.severity === "confirmed" ? 0 : 1) -
        (right.severity === "confirmed" ? 0 : 1) ||
      right.members.length - left.members.length ||
      cleanString(left.members[0]?.title).localeCompare(
        cleanString(right.members[0]?.title),
        "zh-CN",
      ),
  );
}
