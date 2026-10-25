import { normalizeCoverUrl } from "../core/cover-url.js";
import { requestJson } from "../core/network.js";
import {
  cleanDisplayTitle,
  extractTitleVariants,
} from "../core/title-normalize.js";

const FOLLOW_PAGE_SIZE = 30;
const MAX_FOLLOW_ITEMS = 2000;
const MAX_FOLLOW_PAGES = 100;

export async function fetchBilibiliSeasonMetadata(ids) {
  const queryKey = ids.episodeId ? "ep_id" : ids.seasonId ? "season_id" : null;
  if (!queryKey) {
    return null;
  }

  const endpoint = new URL("https://api.bilibili.com/pgc/view/web/season");
  endpoint.searchParams.set(queryKey, ids.episodeId ?? ids.seasonId);
  const response = await requestJson(endpoint.toString(), {
    timeout: 15000,
    headers: {
      Accept: "application/json",
      Referer: "https://www.bilibili.com/",
    },
  });

  if (response?.code !== 0 || !response?.result) {
    throw new Error(response?.message ?? "Bilibili PGC 接口未返回数据");
  }

  const result = response.result;
  const aliases = String(result.alias ?? "")
    .split(/[、,，/]/u)
    .map(cleanDisplayTitle)
    .filter(Boolean);
  const primaryTitle = cleanDisplayTitle(
    result.title || result.season_title || aliases[0],
  );
  const names = [
    primaryTitle,
    cleanDisplayTitle(result.season_title),
    ...aliases,
  ].filter(Boolean);

  return {
    mediaId: result.media_id ? String(result.media_id) : null,
    seasonId: result.season_id ? String(result.season_id) : null,
    title: primaryTitle,
    names: [...new Set(names)],
    titleVariants: names.flatMap((title) => extractTitleVariants(title)),
    summary: String(result.evaluate ?? ""),
    coverUrl: normalizeCoverUrl(result.cover),
    rating: Number.isFinite(Number(result.rating?.score))
      ? Number(result.rating.score)
      : null,
    ratingCount: Number(result.rating?.count ?? 0) || null,
    publish: result.publish ?? null,
  };
}

export function parseBilibiliShortComments(payload, limit = 12) {
  const comments = Array.isArray(payload?.data?.list) ? payload.data.list : [];
  const seen = new Set();
  return comments
    .map((comment) => ({
      text: String(comment?.content ?? "")
        .replace(/\s+/gu, " ")
        .trim()
        .slice(0, 500),
      score: Number(comment?.score) || null,
      progress: String(comment?.progress ?? "").trim(),
      author: String(comment?.author?.uname ?? "").trim(),
      source: "bilibili:short-review",
    }))
    .filter((comment) => {
      if (comment.text.length < 2 || seen.has(comment.text)) {
        return false;
      }
      seen.add(comment.text);
      return true;
    })
    .slice(0, limit);
}

export async function fetchBilibiliShortComments(mediaId, options = {}) {
  const id = String(mediaId ?? "").trim();
  if (!id) {
    return [];
  }

  const endpoint = new URL(
    "https://api.bilibili.com/pgc/review/short/list",
  );
  endpoint.searchParams.set("media_id", id);
  endpoint.searchParams.set("ps", String(options.limit ?? 12));
  endpoint.searchParams.set("sort", "0");
  const response = await requestJson(endpoint.toString(), {
    timeout: 12000,
    headers: {
      Accept: "application/json",
      Referer: "https://www.bilibili.com/",
    },
  });

  if (response?.code !== 0) {
    throw new Error(response?.message ?? "Bilibili 短评接口未返回数据");
  }
  return parseBilibiliShortComments(response, options.limit ?? 12);
}

export function parseBilibiliFollowPage(payload) {
  const data = payload?.data ?? {};
  const rawItems = Array.isArray(data.list) ? data.list : [];
  const items = rawItems
    .map((item) => {
      const mediaId = String(item?.media_id ?? "").trim();
      const seasonId = String(item?.season_id ?? "").trim();
      const title = cleanDisplayTitle(
        item?.title ?? item?.season_title ?? item?.name,
      );
      if (!mediaId) {
        return null;
      }
      return {
        mediaId,
        seasonId: seasonId || null,
        title: title || `Bilibili media ${mediaId}`,
        coverUrl: normalizeCoverUrl(item?.cover),
        source: "bilibili-follow-api",
      };
    })
    .filter(Boolean);

  return {
    items,
    page: Math.max(1, Number(data.pn) || 1),
    pageSize:
      Math.max(1, Number(data.ps) || rawItems.length || FOLLOW_PAGE_SIZE),
    total: Math.max(0, Number(data.total) || 0),
  };
}

export async function fetchBilibiliFollowList(uid, options = {}) {
  const vmid = String(uid ?? "").trim();
  if (!/^\d+$/u.test(vmid)) {
    throw new Error("无法从当前追番页识别用户 UID");
  }

  const request = options.requestJsonImpl ?? requestJson;
  const maxItems = Math.max(
    1,
    Math.min(MAX_FOLLOW_ITEMS, Number(options.maxItems) || MAX_FOLLOW_ITEMS),
  );
  const maxPages = Math.max(
    1,
    Math.min(MAX_FOLLOW_PAGES, Number(options.maxPages) || MAX_FOLLOW_PAGES),
  );
  const cards = [];
  const seen = new Set();
  let page = 1;
  let total = 0;
  let reachedEnd = false;

  while (page <= maxPages && cards.length < maxItems) {
    const endpoint = new URL(
      "https://api.bilibili.com/x/space/bangumi/follow/list",
    );
    endpoint.searchParams.set("type", "1");
    endpoint.searchParams.set("follow_status", "0");
    endpoint.searchParams.set("pn", String(page));
    endpoint.searchParams.set("ps", String(FOLLOW_PAGE_SIZE));
    endpoint.searchParams.set("vmid", vmid);
    endpoint.searchParams.set("order", "0");

    const response = await request(endpoint.toString(), {
      timeout: 20000,
      headers: {
        Accept: "application/json",
        Referer: `https://space.bilibili.com/${vmid}/bangumi`,
      },
    });
    if (response?.code !== 0) {
      throw new Error(response?.message ?? "Bilibili 追番接口未返回数据");
    }

    const parsed = parseBilibiliFollowPage(response);
    total = Math.max(total, parsed.total);
    for (const card of parsed.items) {
      if (!seen.has(card.mediaId)) {
        seen.add(card.mediaId);
        cards.push(card);
      }
      if (cards.length >= maxItems) {
        break;
      }
    }

    const expectedPages = total
      ? Math.ceil(total / parsed.pageSize)
      : parsed.items.length >= parsed.pageSize
        ? page + 1
        : page;
    if (
      !parsed.items.length ||
      page >= expectedPages ||
      (total > 0 && seen.size >= total)
    ) {
      reachedEnd = true;
      break;
    }
    page += 1;
  }

  const truncated =
    !reachedEnd || (total > 0 && cards.length < total);
  return {
    cards,
    total,
    truncated,
    fetchedPages: Math.min(page, maxPages),
  };
}
