import { requestJson } from "../core/network.js";
import { cleanDisplayTitle, extractTitleVariants } from "../core/title-normalize.js";

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
    rating: Number.isFinite(Number(result.rating?.score))
      ? Number(result.rating.score)
      : null,
    ratingCount: Number(result.rating?.count ?? 0) || null,
    publish: result.publish ?? null,
  };
}
