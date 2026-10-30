const ANILIST_ENDPOINT = "https://graphql.anilist.co";
const IDS_PER_PAGE = 50;
const PAGES_PER_REQUEST = 10;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizeAniListId(value) {
  const id = clean(value);
  return /^\d+$/u.test(id) && Number(id) > 0 ? id : "";
}

function normalizeCoverUrl(value) {
  const candidate = clean(value);
  if (!candidate) {
    return "";
  }
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function pageQuery(pageCount) {
  const variables = Array.from(
    { length: pageCount },
    (_, index) => `$page${index}:[Int]`,
  ).join(",");
  const pages = Array.from(
    { length: pageCount },
    (_, index) =>
      `page${index}:Page(page:1,perPage:${IDS_PER_PAGE}){` +
      `media(id_in:$page${index},type:ANIME){id coverImage{extraLarge large}}}`,
  ).join(" ");
  return `query(${variables}){${pages}}`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response, fallback) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1000;
  }
  return fallback;
}

async function requestPageGroup(pageIds, options) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const query = pageQuery(pageIds.length);
  const variables = Object.fromEntries(
    pageIds.map((ids, index) => [`page${index}`, ids.map(Number)]),
  );
  let lastError = null;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs,
    );
    try {
      const response = await fetchImpl(ANILIST_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "myanimelife-cover-index",
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`AniList HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (payload?.errors?.length && !payload?.data) {
        throw new Error(payload.errors[0]?.message || "AniList 返回错误");
      }
      return payload?.data ?? {};
    } catch (error) {
      lastError = error;
      if (attempt >= options.retries) {
        break;
      }
      await sleep(
        retryAfterMilliseconds(
          error?.response,
          options.retryDelayMs * (attempt + 1),
        ),
      );
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("AniList 请求失败");
}

export function collectAniListCoverIds(catalog, options = {}) {
  return [
    ...new Set(
      (catalog?.items ?? [])
        .filter(
          (item) =>
            !options.missingOnly || !normalizeCoverUrl(item?.coverUrl),
        )
        .map((item) => normalizeAniListId(item?.sites?.anilist))
        .filter(Boolean),
    ),
  ];
}

export async function fetchAniListCoverMap(ids, options = {}) {
  const settings = {
    fetchImpl: globalThis.fetch,
    retries: 2,
    retryDelayMs: 1200,
    requestDelayMs: 650,
    timeoutMs: 45000,
    onProgress: null,
    ...options,
  };
  const normalizedIds = [
    ...new Set((ids ?? []).map(normalizeAniListId).filter(Boolean)),
  ];
  const pages = chunk(normalizedIds, IDS_PER_PAGE);
  const groups = chunk(pages, PAGES_PER_REQUEST);
  const covers = new Map();
  const failures = [];
  for (const [groupIndex, pageIds] of groups.entries()) {
    try {
      const data = await requestPageGroup(pageIds, settings);
      for (let pageIndex = 0; pageIndex < pageIds.length; pageIndex += 1) {
        const media = data?.[`page${pageIndex}`]?.media ?? [];
        for (const item of media) {
          const id = normalizeAniListId(item?.id);
          const coverUrl = normalizeCoverUrl(
            item?.coverImage?.extraLarge ?? item?.coverImage?.large,
          );
          if (id && coverUrl) {
            covers.set(id, coverUrl);
          }
        }
      }
    } catch (error) {
      failures.push({
        pageCount: pageIds.length,
        message: error.message || "AniList 请求失败",
      });
    }
    settings.onProgress?.({
      completed: Math.min(
        normalizedIds.length,
        (groupIndex + 1) * PAGES_PER_REQUEST * IDS_PER_PAGE,
      ),
      total: normalizedIds.length,
      covers: covers.size,
      failures: failures.length,
    });
    if (groupIndex < groups.length - 1 && settings.requestDelayMs > 0) {
      await sleep(settings.requestDelayMs);
    }
  }
  return {
    covers,
    requested: normalizedIds.length,
    matched: covers.size,
    failures,
  };
}

export function applyAniListCovers(catalog, covers) {
  let applied = 0;
  for (const item of catalog?.items ?? []) {
    const aniListId = normalizeAniListId(item?.sites?.anilist);
    const coverUrl = aniListId ? covers.get(aniListId) : "";
    if (!normalizeCoverUrl(item?.coverUrl) && coverUrl) {
      item.coverUrl = coverUrl;
      applied += 1;
    }
  }
  return applied;
}

export function hydrateCatalogCoversFromCompact(catalog, compactCatalog) {
  const coversByBangumiId = new Map(
    Object.entries(compactCatalog?.items ?? {})
      .map(([subjectId, item]) => [clean(subjectId), normalizeCoverUrl(item?.[7])])
      .filter(([subjectId, coverUrl]) => subjectId && coverUrl),
  );
  let hydrated = 0;
  for (const item of catalog?.items ?? []) {
    const subjectId = clean(item?.sites?.bangumi);
    const coverUrl = coversByBangumiId.get(subjectId);
    if (!item?.coverUrl && coverUrl) {
      item.coverUrl = coverUrl;
      hydrated += 1;
    }
  }
  return hydrated;
}

export async function enrichCatalogWithAniListCovers(catalog, options = {}) {
  const ids = collectAniListCoverIds(catalog, { missingOnly: true });
  const result = await fetchAniListCoverMap(ids, options);
  const applied = applyAniListCovers(catalog, result.covers);
  catalog.source = {
    ...(catalog.source ?? {}),
    coverSource: {
      id: "anilist",
      name: "AniList",
      endpoint: ANILIST_ENDPOINT,
      requested: result.requested,
      matched: result.matched,
      applied,
      failures: result.failures.length,
      updatedAt: new Date().toISOString(),
    },
  };
  return {
    ...result,
    applied,
  };
}
