import Fuse from "fuse.js";
import { normalizeTitle } from "../core/title-normalize.js";

function makeExactIndex(items) {
  const index = new Map();
  for (const item of items) {
    const keys = [
      item.title,
      ...(item.names ?? []),
      ...(item.normalizedNames ?? []),
    ];
    for (const key of keys) {
      const normalized = normalizeTitle(key);
      if (!normalized) {
        continue;
      }
      const bucket = index.get(normalized) ?? [];
      if (!bucket.some((candidate) => candidate.id === item.id)) {
        bucket.push(item);
      }
      index.set(normalized, bucket);
    }
  }
  return index;
}

function makeResult(item, score, matchedBy) {
  return {
    item,
    score,
    confidence: Math.max(0, Math.min(1, 1 - score)),
    matchedBy,
  };
}

export class LocalAnimeSearch {
  constructor(items, options = {}) {
    this.items = Array.isArray(items) ? items : [];
    this.threshold = options.threshold ?? 0.42;
    this.exactIndex = makeExactIndex(this.items);
    this.fuse = new Fuse(this.items, {
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      threshold: this.threshold,
      keys: [
        { name: "title", weight: 0.35 },
        { name: "names", weight: 0.4 },
        { name: "normalizedNames", weight: 0.2 },
        { name: "searchText", weight: 0.05 },
      ],
    });
  }

  setThreshold(threshold) {
    this.threshold = threshold;
    this.fuse.options.threshold = threshold;
  }

  search(query, options = {}) {
    const originalQuery = String(query ?? "").trim();
    const normalizedQuery = normalizeTitle(originalQuery);
    if (!normalizedQuery) {
      return [];
    }

    const limit = options.limit ?? 10;
    const threshold = options.threshold ?? this.threshold;
    const results = new Map();
    const exactMatches = this.exactIndex.get(normalizedQuery) ?? [];

    for (const item of exactMatches) {
      results.set(item.id, makeResult(item, 0, "exact"));
    }

    if (normalizedQuery.length >= 2) {
      for (const item of this.items) {
        const keys = item.normalizedNames ?? [];
        if (
          keys.some(
            (key) =>
              key.length >= normalizedQuery.length &&
              (key.startsWith(normalizedQuery) ||
                key.includes(normalizedQuery)),
          )
        ) {
          if (!results.has(item.id)) {
            results.set(item.id, makeResult(item, 0.12, "substring"));
          }
        }
      }
    }

    if (this.fuse.options.threshold !== threshold) {
      this.fuse.options.threshold = threshold;
    }
    for (const result of this.fuse.search(originalQuery, { limit: limit * 2 })) {
      const existing = results.get(result.item.id);
      if (!existing || result.score < existing.score) {
        results.set(
          result.item.id,
          makeResult(result.item, result.score ?? 1, "fuzzy"),
        );
      }
    }

    return [...results.values()]
      .sort((left, right) => left.score - right.score)
      .slice(0, limit);
  }

  findBySiteId(site, id) {
    const expected = String(id ?? "");
    if (!site || !expected) {
      return null;
    }
    return (
      this.items.find((item) => String(item.sites?.[site] ?? "") === expected) ??
      null
    );
  }
}
