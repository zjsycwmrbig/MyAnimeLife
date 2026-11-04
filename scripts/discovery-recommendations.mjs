import {
  normalizePublicCatalogMetadata,
  normalizeRecommendationTags,
} from "./recommendations.mjs";
import { PROJECT_VERSION } from "./project-version.mjs";

export const DISCOVERY_ALGORITHM_NAME = "taste-hybrid-mmr";

const DEFAULT_LIMIT = 96;
const BAYESIAN_MINIMUM = 100;
const TAG_SHRINKAGE = 5;
const YEAR_SIGMA = 8;
const MMR_LAMBDA = 0.82;
const CANDIDATE_SHORTLIST = 320;

function cleanString(value) {
  return String(value ?? "").trim();
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function average(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length
    ? finite.reduce((total, value) => total + value, 0) / finite.length
    : null;
}

function normalizeSubjectDocuments(publicSnapshot, personalCacheEntries) {
  const documents = new Map();
  const subjects = publicSnapshot?.subjects;
  if (subjects && typeof subjects === "object" && !Array.isArray(subjects)) {
    for (const [subjectId, value] of Object.entries(subjects)) {
      if (!subjectId || !Array.isArray(value)) continue;
      documents.set(String(subjectId), {
        subjectId: String(subjectId),
        score: finiteNumberOrNull(value[0]),
        ratingCount: Math.max(0, Number(value[1]) || 0),
        rank: integerOrNull(value[2]),
        tags: normalizeRecommendationTags(value[3]),
        summary: "",
        coverUrl: "",
      });
    }
  }

  for (const entry of personalCacheEntries ?? []) {
    const subjectId = cleanString(entry?.subjectId);
    if (!subjectId) continue;
    const previous = documents.get(subjectId);
    const incoming = {
      subjectId,
      score: finiteNumberOrNull(entry.score),
      ratingCount: Math.max(0, Number(entry.ratingCount) || 0),
      rank: integerOrNull(entry.rank),
      tags: normalizeRecommendationTags(entry.tags),
      summary: cleanString(entry.summary),
      coverUrl: cleanString(entry.coverUrl),
    };
    const tags = new Map();
    for (const tag of [...(previous?.tags ?? []), ...incoming.tags]) {
      const old = tags.get(tag.key);
      if (!old || tag.count > old.count) tags.set(tag.key, tag);
    }
    documents.set(subjectId, {
      subjectId,
      score: previous?.score ?? incoming.score,
      ratingCount: previous?.ratingCount || incoming.ratingCount,
      rank: previous?.rank ?? incoming.rank,
      tags: [...tags.values()].sort(
        (left, right) =>
          right.count - left.count ||
          left.name.localeCompare(right.name, "zh-CN"),
      ),
      summary: previous?.summary || incoming.summary,
      coverUrl: previous?.coverUrl || incoming.coverUrl,
    });
  }
  return documents;
}

function buildDocumentFrequency(documents) {
  const frequency = new Map();
  for (const document of documents.values()) {
    for (const tag of document.tags) {
      frequency.set(tag.key, (frequency.get(tag.key) ?? 0) + 1);
    }
  }
  const total = Math.max(1, documents.size);
  const weights = new Map();
  for (const [key, count] of frequency) {
    weights.set(key, Math.log((total + 1) / (count + 1)) + 1);
  }
  return weights;
}

function vectorFromWeights(weights) {
  const vector = new Map();
  let norm = 0;
  for (const [key, value] of weights) {
    if (!Number.isFinite(value) || Math.abs(value) < 0.0001) continue;
    vector.set(key, value);
    norm += value * value;
  }
  return { vector, norm: Math.sqrt(norm) };
}

function candidateVector(document, idfWeights) {
  const weights = new Map();
  for (const tag of document.tags) {
    weights.set(tag.key, idfWeights.get(tag.key) ?? 1);
  }
  return vectorFromWeights(weights);
}

function dotVectors(left, right) {
  let total = 0;
  for (const [key, value] of left) {
    total += value * (right.get(key) ?? 0);
  }
  return total;
}

function cosine(left, right) {
  if (!left.norm || !right.norm) return 0;
  return clamp(dotVectors(left.vector, right.vector) / (left.norm * right.norm), 0, 1);
}

function ratingSignal(rating, personalAverage) {
  const relative = clamp((rating - personalAverage) / 2, -1, 1);
  const absolute = clamp((rating - 5.5) / 4.5, -1, 1);
  return clamp(relative * 0.7 + absolute * 0.3, -1, 1);
}

function buildTasteProfile(records, documents, metadataBySubject, idfWeights) {
  const rated = (records ?? []).filter(
    (record) =>
      !record.deletedAt &&
      record.rating !== null &&
      record.rating !== undefined &&
      record.rating !== "" &&
      Number.isFinite(Number(record.rating)),
  );
  const personalAverage = average(rated.map((record) => Number(record.rating)));
  const tagStats = new Map();
  const yearWeights = new Map();
  const typeWeights = new Map();
  let taggedRatingCount = 0;

  for (const record of rated) {
    const subjectId = cleanString(record.externalIds?.bangumi);
    const document = documents.get(subjectId);
    const signal = ratingSignal(
      Number(record.rating),
      personalAverage ?? Number(record.rating),
    );
    const metadata = metadataBySubject.get(subjectId) ?? null;
    const year = integerOrNull(record.season?.year) ?? metadata?.year ?? null;
    const type = cleanString(metadata?.type).toLocaleLowerCase("en");
    if (signal > 0.08 && year) {
      yearWeights.set(year, (yearWeights.get(year) ?? 0) + signal);
    }
    if (signal > 0.08 && type) {
      typeWeights.set(type, (typeWeights.get(type) ?? 0) + signal);
    }
    if (!document?.tags.length) continue;
    taggedRatingCount += 1;
    for (const tag of document.tags) {
      const idf = idfWeights.get(tag.key) ?? 1;
      const stat = tagStats.get(tag.key) ?? {
        key: tag.key,
        name: tag.name,
        weightedSignal: 0,
        evidenceWeight: 0,
        count: 0,
        anchorTitle: "",
        anchorRating: -Infinity,
      };
      stat.weightedSignal += signal * idf;
      stat.evidenceWeight += Math.abs(signal) * idf;
      stat.count += 1;
      if (signal > 0 && Number(record.rating) > stat.anchorRating) {
        stat.anchorRating = Number(record.rating);
        stat.anchorTitle = cleanString(record.title);
      }
      tagStats.set(tag.key, stat);
    }
  }

  const tags = [...tagStats.values()]
    .map((tag) => ({
      key: tag.key,
      name: tag.name,
      affinity:
        tag.evidenceWeight > 0
          ? (tag.weightedSignal / tag.evidenceWeight) *
            (tag.count / (tag.count + TAG_SHRINKAGE))
          : 0,
      count: tag.count,
      anchorTitle: tag.anchorTitle,
    }))
    .filter((tag) => Math.abs(tag.affinity) >= 0.025)
    .sort(
      (left, right) =>
        right.affinity - left.affinity || right.count - left.count,
    );
  const positiveTags = tags.filter((tag) => tag.affinity > 0).slice(0, 18);
  const negativeTags = tags
    .filter((tag) => tag.affinity < 0)
    .sort((left, right) => left.affinity - right.affinity)
    .slice(0, 12);
  const positive = vectorFromWeights(
    new Map(
      positiveTags.map((tag) => [
        tag.key,
        tag.affinity * (idfWeights.get(tag.key) ?? 1),
      ]),
    ),
  );
  const negative = vectorFromWeights(
    new Map(
      negativeTags.map((tag) => [
        tag.key,
        Math.abs(tag.affinity) * (idfWeights.get(tag.key) ?? 1),
      ]),
    ),
  );

  return {
    ratedCount: rated.length,
    taggedRatingCount,
    personalAverage,
    mode:
      taggedRatingCount >= 5 && positiveTags.length >= 2
        ? "personalized"
        : taggedRatingCount > 0 && positiveTags.length > 0
          ? "limited"
          : "public",
    positiveTags,
    negativeTags,
    positiveVector: positive,
    negativeVector: negative,
    yearWeights,
    typeWeights,
  };
}

function contextScore(profile, metadata) {
  const year = integerOrNull(metadata?.year);
  const type = cleanString(metadata?.type).toLocaleLowerCase("en");
  let yearScore = 0.5;
  if (year && profile.yearWeights.size) {
    let weighted = 0;
    let total = 0;
    for (const [preferredYear, weight] of profile.yearWeights) {
      const distance = preferredYear - year;
      weighted += weight * Math.exp(-(distance * distance) / (2 * YEAR_SIGMA * YEAR_SIGMA));
      total += weight;
    }
    if (total > 0) yearScore = clamp(weighted / total, 0, 1);
  }
  const typeScore = type && profile.typeWeights.size
    ? clamp(
        0.25 +
          (profile.typeWeights.get(type) ?? 0) /
            Math.max(
              0.0001,
              [...profile.typeWeights.values()].reduce(
                (total, weight) => total + weight,
                0,
              ),
            ) *
            0.75,
        0,
        1,
      )
    : 0.5;
  return clamp(yearScore * 0.5 + typeScore * 0.5, 0, 1);
}

function qualityPrior(document, globalAverage) {
  if (!Number.isFinite(document.score)) {
    return { quality: 0, popularity: 0 };
  }
  const count = Math.max(0, document.ratingCount);
  const bayes =
    (count * document.score + BAYESIAN_MINIMUM * globalAverage) /
    (count + BAYESIAN_MINIMUM);
  return {
    quality: clamp((bayes - 5.5) / 4.5, 0, 1),
    popularity: clamp(Math.log1p(count) / Math.log1p(10000), 0, 1),
  };
}

function rankPrior(rank) {
  if (!Number.isInteger(rank) || rank <= 0) return 0.45;
  return clamp(1 - Math.log(rank) / Math.log(10000), 0, 1);
}

function recommendationWeights(mode) {
  if (mode === "personalized") {
    return { tag: 0.6, quality: 0.22, rank: 0.08, context: 0.1 };
  }
  if (mode === "limited") {
    return { tag: 0.36, quality: 0.34, rank: 0.1, context: 0.2 };
  }
  return { tag: 0, quality: 0.62, rank: 0.18, context: 0.2 };
}

function rankCandidate(left, right) {
  return (
    right.recommendationScore - left.recommendationScore ||
    right.tagMatch - left.tagMatch ||
    right.qualityScore - left.qualityScore ||
    left.subjectId.localeCompare(right.subjectId, "en", { numeric: true })
  );
}

function diversify(candidates, limit) {
  const shortlist = candidates.slice(0, CANDIDATE_SHORTLIST);
  const selected = [];
  const remaining = new Set(shortlist);
  while (selected.length < Math.min(limit, shortlist.length) && remaining.size) {
    let best = null;
    let bestValue = -Infinity;
    for (const candidate of remaining) {
      let maximumSimilarity = 0;
      for (const chosen of selected) {
        maximumSimilarity = Math.max(
          maximumSimilarity,
          cosine(candidate.candidateVector, chosen.candidateVector),
        );
      }
      const value =
        MMR_LAMBDA * candidate.recommendationScore -
        (1 - MMR_LAMBDA) * maximumSimilarity;
      if (
        value > bestValue ||
        (value === bestValue &&
          best &&
          candidate.subjectId.localeCompare(best.subjectId, "en", { numeric: true }) < 0)
      ) {
        best = candidate;
        bestValue = value;
      }
    }
    if (!best) break;
    selected.push(best);
    remaining.delete(best);
  }
  return selected;
}

function createReason(profile, matchedTags, qualityScore) {
  if (matchedTags.length) {
    return `因为你偏爱 ${matchedTags.map((tag) => tag.name).join("、")}`;
  }
  if (qualityScore >= 0.72) return "Bangumi 高口碑作品";
  return "从公共索引中发现的新片";
}

export function buildDiscoveryRecommendations({
  publicSnapshot,
  catalogMetadata,
  personalCacheEntries = [],
  records = [],
  generatedAt = new Date().toISOString(),
  limit = DEFAULT_LIMIT,
} = {}) {
  const documents = normalizeSubjectDocuments(publicSnapshot, personalCacheEntries);
  const metadataBySubject =
    catalogMetadata instanceof Map
      ? catalogMetadata
      : normalizePublicCatalogMetadata(catalogMetadata);
  const idfWeights = buildDocumentFrequency(documents);
  const profile = buildTasteProfile(
    records,
    documents,
    metadataBySubject,
    idfWeights,
  );
  const ownedSubjectIds = new Set(
    (records ?? [])
      .filter((record) => !record.deletedAt)
      .map((record) => cleanString(record.externalIds?.bangumi))
      .filter(Boolean),
  );
  const ratedDocuments = [...documents.values()].filter(
    (document) => Number.isFinite(document.score) && document.ratingCount > 0,
  );
  const globalAverage = average(
    ratedDocuments.map((document) => document.score),
  ) ?? 6.5;
  const weights = recommendationWeights(profile.mode);
  const candidates = [];

  for (const [subjectId, document] of documents) {
    if (ownedSubjectIds.has(subjectId)) continue;
    const metadata = metadataBySubject.get(subjectId) ?? null;
    if (!metadata?.displayTitle) continue;
    const vector = candidateVector(document, idfWeights);
    if (!vector.norm) continue;
    const tagMatch = cosine(profile.positiveVector, vector);
    const negativePenalty = cosine(profile.negativeVector, vector);
    const prior = qualityPrior(document, globalAverage);
    const context = contextScore(profile, metadata);
    const rank = rankPrior(document.rank);
    const base =
      weights.tag * tagMatch +
      weights.quality * prior.quality +
      weights.rank * rank +
      weights.context * context;
    const recommendationScore = clamp(base - 0.25 * negativePenalty, 0, 1);
    const matchedTags = profile.positiveTags
      .map((tag) => ({
        name: tag.name,
        affinity: tag.affinity,
        contribution:
          tag.affinity *
          (idfWeights.get(tag.key) ?? 1) *
          (idfWeights.get(tag.key) ?? 1) *
          (document.tags.some((candidateTag) => candidateTag.key === tag.key) ? 1 : 0),
      }))
      .filter((tag) => tag.contribution > 0)
      .sort((left, right) => right.contribution - left.contribution)
      .slice(0, 3);
    candidates.push({
      subjectId,
      title: metadata.displayTitle,
      originalTitle: metadata.originalTitle || null,
      coverUrl: metadata.coverUrl || document.coverUrl || null,
      year: metadata.year,
      type: metadata.type,
      begin: metadata.begin,
      seasonLabel: metadata.seasonLabel,
      score: document.score,
      ratingCount: document.ratingCount,
      rank: document.rank,
      summary: document.summary || "",
      tags: document.tags.slice(0, 8).map((tag) => tag.name),
      matchedTags,
      reason: createReason(profile, matchedTags, prior.quality),
      recommendationScore: Math.round(recommendationScore * 10000) / 10000,
      tagMatch: Math.round(tagMatch * 10000) / 10000,
      negativePenalty: Math.round(negativePenalty * 10000) / 10000,
      qualityScore: Math.round(prior.quality * 10000) / 10000,
      popularityScore: Math.round(prior.popularity * 10000) / 10000,
      rankScore: Math.round(rank * 10000) / 10000,
      contextScore: Math.round(context * 10000) / 10000,
      candidateVector: vector,
    });
  }

  candidates.sort(rankCandidate);
  const diversified = diversify(candidates, clamp(Number(limit) || DEFAULT_LIMIT, 1, 300));
  const items = diversified.map(({ candidateVector, ...item }) => item);

  return {
    schemaVersion: 1,
    algorithm: {
      name: DISCOVERY_ALGORITHM_NAME,
      projectVersion: PROJECT_VERSION,
      status: "production",
      versionPolicy: "project-semver",
    },
    generatedAt: cleanString(generatedAt) || new Date().toISOString(),
    mode: profile.mode,
    profile: {
      ratedCount: profile.ratedCount,
      taggedRatingCount: profile.taggedRatingCount,
      personalAverage:
        profile.personalAverage === null
          ? null
          : Math.round(profile.personalAverage * 10) / 10,
      topTags: profile.positiveTags.slice(0, 10).map((tag) => ({
        name: tag.name,
        affinity: Math.round(tag.affinity * 1000) / 1000,
        count: tag.count,
        anchorTitle: tag.anchorTitle || null,
      })),
      yearPreferences: [...profile.yearWeights.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([year, weight]) => ({
          year,
          weight: Math.round(weight * 1000) / 1000,
        })),
    },
    candidateCount: candidates.length,
    itemCount: items.length,
    items,
  };
}
