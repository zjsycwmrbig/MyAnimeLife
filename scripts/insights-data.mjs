const SOURCE_LABELS = {
  bangumi: "Bangumi",
  bilibiliMedia: "Bilibili",
  bilibiliSeason: "Bilibili 剧集",
  anilist: "AniList",
  mal: "MyAnimeList",
};

function round(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  return numbers.length
    ? round(numbers.reduce((total, value) => total + value, 0) / numbers.length)
    : null;
}

function percent(value, total) {
  return total > 0 ? round((value / total) * 100) : 0;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date) {
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthSeries(records, now) {
  const months = [];
  const counts = new Map();
  for (const record of records) {
    const created = new Date(record.createdAt);
    if (!Number.isNaN(created.getTime())) {
      const key = monthKey(created);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
    );
    months.push({
      key: monthKey(date),
      label: monthLabel(date),
      shortLabel: `${date.getUTCMonth() + 1}月`,
      count: counts.get(monthKey(date)) ?? 0,
    });
  }
  const maximum = Math.max(1, ...months.map((month) => month.count));
  return months.map((month) => ({
    ...month,
    percent: percent(month.count, maximum),
  }));
}

function windowCount(records, now, days) {
  const end = now.getTime();
  const start = end - days * 24 * 60 * 60 * 1000;
  return records.filter((record) => {
    const created = new Date(record.createdAt).getTime();
    return created >= start && created <= end;
  }).length;
}

function decadeFor(record) {
  const year = Number(record.season?.year);
  return Number.isInteger(year) && year >= 1900 ? Math.floor(year / 10) * 10 : null;
}

function buildDistribution(records, keyFor, total) {
  const groups = new Map();
  for (const record of records) {
    const key = keyFor(record);
    const group = groups.get(key) ?? { key, count: 0, ratings: [] };
    group.count += 1;
    if (record.rating !== null) {
      group.ratings.push(Number(record.rating));
    }
    groups.set(key, group);
  }
  return groups;
}

export function calculateInsights(records, now = new Date()) {
  const ratings = records
    .map((record) => record.rating)
    .filter((rating) => rating !== null)
    .map(Number);
  const averageRating = average(ratings);
  const total = records.length;

  const decadesMap = buildDistribution(records, decadeFor, total);
  const decades = [...decadesMap.values()]
    .sort((left, right) => {
      if (left.key === null) return 1;
      if (right.key === null) return -1;
      return left.key - right.key;
    })
    .map((group) => ({
      key: group.key,
      label: group.key === null ? "年份未知" : `${group.key} 年代`,
      count: group.count,
      percent: percent(group.count, total),
      averageRating: average(group.ratings) ?? "—",
    }));

  const ratingBuckets = [
    { key: "0-5.9", label: "0 - 5.9", test: (rating) => rating < 6 },
    { key: "6-6.9", label: "6 - 6.9", test: (rating) => rating >= 6 && rating < 7 },
    { key: "7-7.9", label: "7 - 7.9", test: (rating) => rating >= 7 && rating < 8 },
    { key: "8-8.9", label: "8 - 8.9", test: (rating) => rating >= 8 && rating < 9 },
    { key: "9-10", label: "9 - 10", test: (rating) => rating >= 9 },
  ].map((bucket) => {
    const count = ratings.filter(bucket.test).length;
    return {
      key: bucket.key,
      label: bucket.label,
      count,
      percent: percent(count, total),
    };
  });
  ratingBuckets.push({
    key: "unrated",
    label: "未评分",
    count: total - ratings.length,
    percent: percent(total - ratings.length, total),
  });

  const sourceCounts = new Map();
  let sourcedCount = 0;
  let seasonCount = 0;
  for (const record of records) {
    const sources = Object.keys(record.externalIds ?? {});
    if (sources.length) {
      sourcedCount += 1;
    }
    if (Number.isInteger(record.season?.year)) {
      seasonCount += 1;
    }
    for (const source of sources) {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    }
  }
  const sources = [...sourceCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([key, count]) => ({
      key,
      label: SOURCE_LABELS[key] ?? key,
      count,
      percent: percent(count, total),
    }));

  const ratedDecades = decades
    .filter((entry) => entry.key !== null && entry.averageRating !== "—")
    .sort((left, right) => right.averageRating - left.averageRating);

  return {
    summary: {
      total,
      rated: ratings.length,
      averageRating: averageRating === null ? "—" : averageRating.toFixed(1),
      ratedPercent: percent(ratings.length, total),
      seasonPercent: percent(seasonCount, total),
      sourcePercent: percent(sourcedCount, total),
      latestMonth: monthSeries(records, now).at(-1).count,
    },
    windows: [
      { days: 7, label: "近 7 天", count: windowCount(records, now, 7) },
      { days: 30, label: "近 30 天", count: windowCount(records, now, 30) },
      { days: 365, label: "近一年", count: windowCount(records, now, 365) },
    ],
    months: monthSeries(records, now),
    decades,
    ratings: ratingBuckets,
    sources,
    bestDecade: ratedDecades[0] ?? null,
  };
}

function itemKeys(item) {
  const keys = new Set();
  if (item?.id) {
    keys.add(`id:${item.id}`);
  }
  for (const [source, id] of Object.entries(item?.externalIds ?? {})) {
    if (id) {
      keys.add(`${source}:${id}`);
    }
  }
  return [...keys];
}

function compactItem(item) {
  return {
    id: item.id,
    title: item.title,
    rating: item.rating ?? null,
    coverUrl: item.coverUrl ?? null,
    season: item.season ?? null,
    externalIds: item.externalIds ?? {},
  };
}

function averageRating(items) {
  const values = items
    .map((item) => item.rating)
    .filter((rating) => rating !== null)
    .map(Number);
  return average(values);
}

export function compareLibraries(currentItems, peerItems) {
  const current = (currentItems ?? []).map(compactItem);
  const peer = (peerItems ?? []).map(compactItem);
  const peerByKey = new Map();
  for (const item of peer) {
    for (const key of itemKeys(item)) {
      if (!peerByKey.has(key)) {
        peerByKey.set(key, item);
      }
    }
  }

  const matchedPeerIds = new Set();
  const shared = [];
  const currentOnly = [];
  for (const item of current) {
    const match = itemKeys(item)
      .map((key) => peerByKey.get(key))
      .find((candidate) => candidate && !matchedPeerIds.has(candidate.id));
    if (!match) {
      currentOnly.push(item);
      continue;
    }
    matchedPeerIds.add(match.id);
    const ratingDifference =
      item.rating !== null && match.rating !== null
        ? round(Number(item.rating) - Number(match.rating))
        : null;
    shared.push({
      id: item.id,
      peerId: match.id,
      title: item.title,
      season: item.season,
      currentRating: item.rating,
      peerRating: match.rating,
      ratingDifference,
    });
  }
  const peerOnly = peer.filter((item) => !matchedPeerIds.has(item.id));
  const unionSize = current.length + peerOnly.length;
  const ratingDifferences = shared
    .filter((item) => item.ratingDifference !== null)
    .sort(
      (left, right) =>
        Math.abs(right.ratingDifference) - Math.abs(left.ratingDifference),
    );

  return {
    current: {
      total: current.length,
      rated: current.filter((item) => item.rating !== null).length,
      averageRating: averageRating(current),
    },
    peer: {
      total: peer.length,
      rated: peer.filter((item) => item.rating !== null).length,
      averageRating: averageRating(peer),
    },
    overlap: {
      count: shared.length,
      percent: percent(shared.length, unionSize),
      currentPercent: percent(shared.length, current.length),
      peerPercent: percent(shared.length, peer.length),
    },
    shared,
    currentOnly: currentOnly.slice(0, 24),
    peerOnly: peerOnly.slice(0, 24),
    ratingDifferences: ratingDifferences.slice(0, 16),
  };
}
