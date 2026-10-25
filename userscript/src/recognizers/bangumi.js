import { normalizeCoverUrl } from "../core/cover-url.js";
import { requestJson } from "../core/network.js";

export function extractBangumiCoverUrl(subject) {
  return [
    subject?.images?.large,
    subject?.images?.common,
    subject?.images?.medium,
    subject?.images?.small,
    subject?.images?.grid,
    subject?.image,
  ]
    .map(normalizeCoverUrl)
    .find(Boolean) ?? null;
}

export async function fetchBangumiCover(subjectId) {
  const id = String(subjectId ?? "").trim();
  if (!id) {
    return null;
  }

  const subject = await requestJson(
    `https://api.bgm.tv/v0/subjects/${encodeURIComponent(id)}`,
    {
      timeout: 12000,
      headers: {
        Accept: "application/json",
        "User-Agent": "anime-index-userscript/0.1",
      },
    },
  );
  return extractBangumiCoverUrl(subject);
}
