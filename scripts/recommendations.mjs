const SCHEMA_VERSION = 1;
const TAG_ALIASES = new Map([
  ["漫改", "漫画改"],
  ["轻改", "轻小说改"],
]);
const IGNORED_TAGS = new Set([
  "tv",
  "ova",
  "oad",
  "web",
  "剧场版",
  "总集篇",
  "日本",
  "日本动画",
  "动画",
]);

function cleanString(value) {
  return String(value ?? "").trim();
}

function integerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTagKey(value) {
  const normalized = cleanString(value)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/gu, "");
  return TAG_ALIASES.get(normalized) ?? normalized;
}

function normalizeTag(value) {
  const rawName = Array.isArray(value) ? value[0] : value?.name;
  const rawCount = Array.isArray(value) ? value[1] : value?.count;
  const sourceName = cleanString(rawName);
  const normalized = cleanString(sourceName)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/gu, "");
  const key = TAG_ALIASES.get(normalized) ?? normalized;
  if (
    !key ||
    /^\d{4}$/u.test(key) ||
    IGNORED_TAGS.has(key)
  ) {
    return null;
  }
  const count = Number(rawCount);
  return {
    key,
    name: TAG_ALIASES.has(normalized)
      ? TAG_ALIASES.get(normalized)
      : sourceName,
    count: Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0,
  };
}

export function normalizeRecommendationTags(values) {
  const tags = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const tag = normalizeTag(value);
    if (!tag) {
      continue;
    }
    const previous = tags.get(tag.key);
    if (!previous || tag.count > previous.count) {
      tags.set(tag.key, tag);
    }
  }
  return [...tags.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.name.localeCompare(right.name, "zh-CN"),
  );
}

function publicSnapshotTags(compactSubject) {
  if (!Array.isArray(compactSubject)) {
    return [];
  }
  return normalizeRecommendationTags(compactSubject[3]);
}

function normalizeCatalogEntry(value) {
  if (Array.isArray(value)) {
    return {
      displayTitle: cleanString(value[0]),
      originalTitle: cleanString(value[1]),
      year: integerOrNull(value[2]),
      type: cleanString(value[3]) || "unknown",
      begin: cleanString(value[4]) || null,
      seasonNumber: integerOrNull(value[5]),
      seasonLabel: cleanString(value[6]) || null,
      coverUrl: cleanString(value[7]) || null,
    };
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const year = integerOrNull(value.year);
  const seasonNumber = integerOrNull(
    value.seasonNumber ?? value.season?.number,
  );
  return {
    displayTitle: cleanString(value.displayTitle ?? value.title),
    originalTitle: cleanString(value.originalTitle ?? value.title),
    year,
    type: cleanString(value.type) || "unknown",
    begin: cleanString(value.begin) || null,
    seasonNumber,
    seasonLabel: cleanString(value.seasonLabel ?? value.season?.label) || null,
    coverUrl: cleanString(value.coverUrl) || null,
  };
}

export function normalizePublicCatalogMetadata(payload) {
  const items = payload?.items;
  if (!items || typeof items !== "object" || Array.isArray(items)) {
    return new Map();
  }
  const metadata = new Map();
  for (const [subjectId, value] of Object.entries(items)) {
    const normalized = normalizeCatalogEntry(value);
    if (subjectId && normalized?.displayTitle) {
      metadata.set(subjectId, normalized);
    }
  }
  return metadata;
}

export function compactPublicCatalogMetadata(catalog, generatedAt) {
  if (!Array.isArray(catalog?.items)) {
    throw new Error("全量索引缺少 items 数组");
  }
  const items = {};
  for (const item of catalog.items) {
    const subjectId = cleanString(item?.sites?.bangumi);
    if (!subjectId) {
      continue;
    }
    const title = cleanString(item.displayTitle ?? item.title);
    if (!title) {
      continue;
    }
    items[subjectId] = [
      title.slice(0, 240),
      cleanString(item.title ?? title).slice(0, 240),
      integerOrNull(item.year),
      cleanString(item.type) || "unknown",
      cleanString(item.begin) || null,
      integerOrNull(item.season?.number),
      cleanString(item.season?.label) || null,
      cleanString(item.coverUrl) || null,
    ];
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt:
      cleanString(generatedAt) || new Date().toISOString(),
    source: {
      id: "bangumi-data",
      name: "bangumi-data",
      version: cleanString(catalog?.source?.version) || "unknown",
      license: "CC BY 4.0",
      sourceUrl: cleanString(catalog?.source?.sourceUrl) || null,
    },
    itemCount: Object.keys(items).length,
    items,
  };
}

function publicSubjectDocuments(publicSnapshot) {
  const documents = new Map();
  const subjects = publicSnapshot?.subjects;
  if (!subjects || typeof subjects !== "object" || Array.isArray(subjects)) {
    return documents;
  }
  for (const [subjectId, compactSubject] of Object.entries(subjects)) {
    const id = cleanString(subjectId);
    if (!id || !Array.isArray(compactSubject)) {
      continue;
    }
    documents.set(id, {
      subjectId: id,
      score: finiteNumberOrNull(compactSubject[0]),
      ratingCount: Number(compactSubject[1]) || 0,
      rank: Number(compactSubject[2]) || null,
      tags: publicSnapshotTags(compactSubject),
    });
  }
  return documents;
}

function mergeDocumentTags(existing, incoming) {
  return normalizeRecommendationTags([
    ...(existing?.tags ?? []),
    ...(incoming?.tags ?? []),
  ]);
}

function recommendationDocuments(publicSnapshot, personalCacheEntries) {
  const documents = publicSubjectDocuments(publicSnapshot);
  for (const entry of personalCacheEntries ?? []) {
    const subjectId = cleanString(entry?.subjectId);
    if (!subjectId) {
      continue;
    }
    const incoming = {
      subjectId,
      score: finiteNumberOrNull(entry.score),
      ratingCount: Number(entry.ratingCount) || 0,
      rank: Number(entry.rank) || null,
      tags: normalizeRecommendationTags(entry.tags),
      coverUrl: cleanString(entry.coverUrl) || null,
    };
    const previous = documents.get(subjectId);
    documents.set(subjectId, {
      ...incoming,
      ...previous,
      score: previous?.score ?? incoming.score,
      ratingCount: previous?.ratingCount || incoming.ratingCount,
      rank: previous?.rank ?? incoming.rank,
      tags: mergeDocumentTags(previous, incoming),
      coverUrl: previous?.coverUrl || incoming.coverUrl,
    });
  }
  return documents;
}

function buildSimilarityIndex(documents) {
  const documentFrequency = new Map();
  const postings = new Map();
  for (const document of documents.values()) {
    for (const tag of document.tags) {
      documentFrequency.set(
        tag.key,
        (documentFrequency.get(tag.key) ?? 0) + 1,
      );
      const ids = postings.get(tag.key) ?? new Set();
      ids.add(document.subjectId);
      postings.set(tag.key, ids);
    }
  }
  const total = Math.max(1, documents.size);
  const weights = new Map();
  for (const [key, frequency] of documentFrequency) {
    weights.set(key, Math.log((total + 1) / (frequency + 1)) + 1);
  }
  const norms = new Map();
  for (const document of documents.values()) {
    const score = document.tags.reduce((sum, tag) => {
      const weight = weights.get(tag.key) ?? 0;
      return sum + weight * weight;
    }, 0);
    norms.set(document.subjectId, Math.sqrt(score));
  }
  return { weights, postings, norms };
}

function sourceSeason(record) {
  return {
    year: Number.isInteger(record?.season?.year) ? record.season.year : null,
    number: Number.isInteger(record?.season?.number)
      ? record.season.number
      : null,
  };
}

function metadataSeason(metadata) {
  return {
    year: Number.isInteger(metadata?.year) ? metadata.year : null,
    number: Number.isInteger(metadata?.seasonNumber)
      ? metadata.seasonNumber
      : null,
  };
}

function sameSeason(source, candidate) {
  if (
    source.number === null ||
    candidate.number === null ||
    source.number !== candidate.number
  ) {
    return false;
  }
  return source.year === null || candidate.year === null
    ? true
    : source.year === candidate.year;
}

function yearDistance(sourceYear, candidateYear) {
  if (sourceYear === null || candidateYear === null) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(sourceYear - candidateYear);
}

function compareCandidates(source, left, right) {
  const byShared = right.sharedCount - left.sharedCount;
  if (byShared) {
    return byShared;
  }
  const bySimilarity = right.similarity - left.similarity;
  if (bySimilarity) {
    return bySimilarity;
  }
  if (left.seasonMatch !== right.seasonMatch) {
    return left.seasonMatch ? -1 : 1;
  }
  const byYearDistance =
    yearDistance(source.year, left.year) -
    yearDistance(source.year, right.year);
  if (byYearDistance) {
    return byYearDistance;
  }
  const byScore = (right.score ?? -1) - (left.score ?? -1);
  if (byScore) {
    return byScore;
  }
  return left.subjectId.localeCompare(right.subjectId, "en", {
    numeric: true,
  });
}

function buildSourceRecommendations(options) {
  const {
    record,
    sourceDocument,
    documents,
    index,
    metadataBySubject,
    ownedBySubject,
    generatedAt,
  } = options;
  const sourceId = cleanString(record.id);
  const sourceSubjectId = cleanString(record.externalIds?.bangumi);
  const sourceTags = sourceDocument?.tags ?? [];
  const shared = new Map();

  for (const tag of sourceTags) {
    for (const candidateId of index.postings.get(tag.key) ?? []) {
      if (candidateId === sourceSubjectId) {
        continue;
      }
      const candidate = shared.get(candidateId) ?? {
        subjectId: candidateId,
        sharedCount: 0,
        dotProduct: 0,
        commonTags: [],
      };
      const weight = index.weights.get(tag.key) ?? 0;
      candidate.sharedCount += 1;
      candidate.dotProduct += weight * weight;
      candidate.commonTags.push({
        name: tag.name,
        count: tag.count,
        weight,
      });
      shared.set(candidateId, candidate);
    }
  }

  const sourceNorm = index.norms.get(sourceSubjectId) ?? 0;
  const season = sourceSeason(record);
  const items = [...shared.values()]
    .map((candidate) => {
      const document = documents.get(candidate.subjectId);
      const metadata = metadataBySubject.get(candidate.subjectId) ?? null;
      const candidateSeason = metadataSeason(metadata);
      const candidateNorm = index.norms.get(candidate.subjectId) ?? 0;
      const similarity =
        sourceNorm && candidateNorm
          ? candidate.dotProduct / (sourceNorm * candidateNorm)
          : 0;
      const ownedRecord = ownedBySubject.get(candidate.subjectId) ?? null;
      const displayTitle =
        cleanString(ownedRecord?.title) ||
        cleanString(metadata?.displayTitle) ||
        cleanString(metadata?.originalTitle) ||
        `Bangumi #${candidate.subjectId}`;
      const coverUrl =
        cleanString(ownedRecord?.coverUrl) ||
        cleanString(document?.coverUrl) ||
        cleanString(metadata?.coverUrl) ||
        null;
      const tagHeat = candidate.commonTags.reduce(
        (sum, tag) => sum + (Number(tag.count) || 0),
        0,
      );
      return {
        id: `bgm-${candidate.subjectId}`,
        subjectId: candidate.subjectId,
        recordId: ownedRecord?.id ?? null,
        owned: Boolean(ownedRecord),
        title: displayTitle,
        originalTitle:
          cleanString(metadata?.originalTitle) ||
          cleanString(metadata?.displayTitle) ||
          null,
        coverUrl,
        type: cleanString(metadata?.type) || "unknown",
        begin: cleanString(metadata?.begin) || null,
        seasonLabel: cleanString(metadata?.seasonLabel) || null,
        recordRating: finiteNumberOrNull(ownedRecord?.rating),
        sharedCount: candidate.sharedCount,
        similarity: Math.round(similarity * 10000) / 10000,
        commonTags: candidate.commonTags
          .sort(
            (left, right) =>
              right.weight - left.weight ||
              right.count - left.count ||
              left.name.localeCompare(right.name, "zh-CN"),
          )
          .slice(0, 6)
          .map((tag) => tag.name),
        score: document?.score ?? null,
        ratingCount: Number.isInteger(Number(document?.ratingCount))
          ? Number(document.ratingCount)
          : 0,
        tagHeat,
        rank: document?.rank ?? null,
        year: metadata?.year ?? null,
        seasonMatch: sameSeason(season, candidateSeason),
      };
    })
    .sort((left, right) => compareCandidates(season, left, right));

  const ownedTotal = items.filter((item) => item.owned).length;
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceId,
    sourceBangumiId: sourceSubjectId || null,
    sourceTagCount: sourceTags.length,
    total: items.length,
    ownedTotal,
    unownedTotal: items.length - ownedTotal,
    items,
  };
}

export function buildSimilarRecommendations({
  publicSnapshot,
  catalogMetadata,
  personalCacheEntries,
  records,
  generatedAt,
}) {
  const timestamp = cleanString(generatedAt) || new Date().toISOString();
  const documents = recommendationDocuments(
    publicSnapshot,
    personalCacheEntries,
  );
  const metadataBySubject =
    catalogMetadata instanceof Map
      ? catalogMetadata
      : normalizePublicCatalogMetadata(catalogMetadata);
  const index = buildSimilarityIndex(documents);
  const ownedBySubject = new Map();
  const publicRecords = (records ?? []).filter(
    (record) => !record.deletedAt,
  );
  for (const record of publicRecords) {
    const subjectId = cleanString(record.externalIds?.bangumi);
    if (subjectId && !ownedBySubject.has(subjectId)) {
      ownedBySubject.set(subjectId, record);
    }
  }

  const shards = new Map();
  for (const record of publicRecords) {
    const sourceSubjectId = cleanString(record.externalIds?.bangumi);
    const sourceDocument = documents.get(sourceSubjectId) ?? null;
    shards.set(
      cleanString(record.id),
      buildSourceRecommendations({
        record,
        sourceDocument,
        documents,
        index,
        metadataBySubject,
        ownedBySubject,
        generatedAt: timestamp,
      }),
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: timestamp,
    documentCount: documents.size,
    metadataCount: metadataBySubject.size,
    shards,
  };
}

export function createSimilarCatalogIndex(recommendations) {
  const shards =
    recommendations?.shards instanceof Map ? recommendations.shards : new Map();
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: cleanString(recommendations?.generatedAt) || null,
    documentCount: Number(recommendations?.documentCount) || 0,
    metadataCount: Number(recommendations?.metadataCount) || 0,
    itemCount: shards.size,
    items: [...shards.entries()]
      .map(([recordId, shard]) => ({
        recordId,
        sourceBangumiId: cleanString(shard?.sourceBangumiId) || null,
        sourceTagCount: Number(shard?.sourceTagCount) || 0,
        total: Number(shard?.total) || 0,
        ownedTotal: Number(shard?.ownedTotal) || 0,
        unownedTotal: Number(shard?.unownedTotal) || 0,
      }))
      .sort((left, right) =>
        left.recordId.localeCompare(right.recordId, "en", { numeric: true }),
      ),
  };
}
