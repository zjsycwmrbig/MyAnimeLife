const HTML_ENTITIES = {
  "&amp;": "&",
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

const SITE_SUFFIXES = [
  /\s*[_|｜-]\s*番剧\s*[_|｜-]\s*bilibili\s*[_|｜-]\s*哔哩哔哩.*$/iu,
  /\s*[_|｜-]\s*哔哩哔哩\s*[_|｜-]\s*bilibili.*$/iu,
  /\s*[-_|｜]\s*(?:哔哩哔哩|bilibili|Bangumi|番组计划).*$/iu,
  /\s*[-_|｜]\s*(?:在线观看|免费观看|动漫|动画|番剧).*$/iu,
];

const NOISE_PATTERNS = [
  /[【[(（]\s*(?:独家|免费|高清|正版|完整版|在线观看|中文字幕|无修版)[^】\])）]*[】\])）]/giu,
  /(?:免费)?(?:高清)?(?:完整版)?在线观看/giu,
  /高清完整版/giu,
  /更新至\s*(?:第\s*)?\d+\s*(?:集|话|話|期)/giu,
  /全\s*\d+\s*(?:集|话|話)/giu,
];

const EPISODE_PATTERNS = [
  /\s*(?:第\s*)?\d+\s*(?:集|话|話|期)\s*$/iu,
  /\s*[-_ ]?S\d{1,2}E\d{1,3}\s*$/iu,
  /\s*[-_ ]?EP?\s*\d{1,4}\s*$/iu,
];

const SEPARATORS = /\s+[-–—|｜]\s+|\s*[|｜]\s*/u;

function replaceHtmlEntities(value) {
  return value.replace(
    /&(?:amp|apos|quot|lt|gt|nbsp|#39);/giu,
    (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity,
  );
}

export function cleanDisplayTitle(rawTitle) {
  if (typeof rawTitle !== "string") {
    return "";
  }

  let title = replaceHtmlEntities(rawTitle)
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  for (const pattern of SITE_SUFFIXES) {
    title = title.replace(pattern, "");
  }
  for (const pattern of NOISE_PATTERNS) {
    title = title.replace(pattern, " ");
  }
  for (const pattern of EPISODE_PATTERNS) {
    title = title.replace(pattern, "");
  }

  return title
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—_:：|｜]+|[\s\-–—_:：|｜]+$/g, "")
    .trim();
}

export function normalizeTitle(rawTitle) {
  return cleanDisplayTitle(rawTitle)
    .toLocaleLowerCase()
    .replace(/[\p{P}\s]+/gu, "")
    .trim();
}

export function extractTitleVariants(rawTitle, options = {}) {
  const maxVariants = options.maxVariants ?? 8;
  const base = cleanDisplayTitle(rawTitle);
  if (!base) {
    return [];
  }

  const variants = [];
  const add = (value) => {
    const cleaned = cleanDisplayTitle(value);
    const key = normalizeTitle(cleaned);
    if (
      cleaned &&
      key &&
      key.length >= 2 &&
      !variants.some((item) => normalizeTitle(item) === key)
    ) {
      variants.push(cleaned);
    }
  };

  add(base);

  const bracketMatches = base.matchAll(/[【[(（]([^】\])）]{2,80})[】\])）]/gu);
  for (const match of bracketMatches) {
    add(match[1]);
  }

  const leadingBracketSuffix = base.match(
    /^(?:[【[(（][^】\])）]{1,80}[】\])）]\s*)+(.+)$/u,
  );
  if (leadingBracketSuffix?.[1]) {
    add(leadingBracketSuffix[1]);
  }

  for (const part of base.split(SEPARATORS)) {
    add(part);
  }

  const colonIndex = base.search(/[：:]/u);
  if (colonIndex > 1) {
    add(base.slice(0, colonIndex));
  }

  return variants.slice(0, maxVariants);
}

export function extractBilibiliIds(input) {
  const value = typeof input === "string" ? input : String(input?.url ?? "");
  let url;
  try {
    url = new URL(value, "https://www.bilibili.com");
  } catch {
    return {};
  }

  const mediaId =
    url.pathname.match(/\/bangumi\/media\/md(\d+)/iu)?.[1] ??
    url.searchParams.get("media_id") ??
    undefined;
  const episodeId =
    url.pathname.match(/\/bangumi\/play\/ep(\d+)/iu)?.[1] ??
    url.searchParams.get("ep_id") ??
    undefined;
  const seasonId =
    url.pathname.match(/\/bangumi\/play\/ss(\d+)/iu)?.[1] ??
    url.searchParams.get("season_id") ??
    undefined;

  return {
    ...(mediaId ? { mediaId: String(mediaId) } : {}),
    ...(episodeId ? { episodeId: String(episodeId) } : {}),
    ...(seasonId ? { seasonId: String(seasonId) } : {}),
  };
}

export function uniqueByTitle(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeTitle(item.title ?? "");
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
