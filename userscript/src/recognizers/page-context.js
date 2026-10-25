import {
  cleanDisplayTitle,
  extractBilibiliIds,
  extractTitleVariants,
  normalizeTitle,
  uniqueByTitle,
} from "../core/title-normalize.js";

const MAX_TITLE_CANDIDATES = 24;
const MENTION_PATTERNS = [
  /《([^》\n]{2,80})》/gu,
  /(?:番名|番剧名|作品名|动画名)[：:\s]*(?:是|叫|为)?\s*[「“"]([^」”"\n]{2,80})[」”"]/giu,
  /(?:番名|番剧名|作品名|动画名)[：:\s]*(?:是|叫|为)?\s*([^\s，。！？,；;]{2,50})/giu,
  /(?:这部|该部|本)(?:番|番剧|动画|作品)(?:就是|是|叫|名为)\s*[「“"]?([^」”"\n，。！？,；;]{2,50})/giu,
];
const GENERIC_MENTIONS = new Set([
  "动画",
  "番剧",
  "本作",
  "作品",
  "这部番",
  "这个番",
]);

function textOf(element) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function metaContent(...selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const content = element?.getAttribute("content")?.trim();
    if (content) {
      return content;
    }
  }
  return "";
}

function collectJsonLdValues() {
  const titles = [];
  const names = new Set();

  for (const script of document.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const parsed = JSON.parse(script.textContent ?? "");
      const queue = Array.isArray(parsed)
        ? [...parsed]
        : Array.isArray(parsed?.["@graph"])
          ? [...parsed["@graph"]]
          : [parsed];

      for (const node of queue) {
        if (!node || typeof node !== "object") {
          continue;
        }
        const types = Array.isArray(node["@type"])
          ? node["@type"]
          : [node["@type"]];
        if (
          !types.some((type) =>
            /^(?:TVSeries|TVSeason|CreativeWork|Movie|VideoObject)$/u.test(
              String(type ?? ""),
            ),
          )
        ) {
          continue;
        }

        for (const value of [
          node.name,
          node.alternateName,
          ...(Array.isArray(node.alternateName) ? node.alternateName : []),
        ]) {
          if (typeof value === "string") {
            const cleaned = cleanDisplayTitle(value);
            if (cleaned && !names.has(cleaned)) {
              names.add(cleaned);
              titles.push(cleaned);
            }
          }
        }
      }
    } catch {
      // Ignore malformed structured data.
    }
  }
  return titles.slice(0, 8);
}

function collectHeadingTitles() {
  return [...document.querySelectorAll("h1")]
    .map((element) => cleanDisplayTitle(textOf(element)))
    .filter(Boolean)
    .slice(0, 4);
}

function collectSiteTitleSelectors() {
  const selectors = [
    ".media-title",
    ".bangumi-title",
    "[class*='media-title']",
    "[class*='bangumi-title']",
    "[class*='season-title']",
  ];
  return [...new Set(selectors)]
    .flatMap((selector) => [...document.querySelectorAll(selector)])
    .map((element) => cleanDisplayTitle(textOf(element)))
    .filter(Boolean)
    .slice(0, 8);
}

function collectBreadcrumbText() {
  const element =
    document.querySelector("[class*='breadcrumb']") ??
    document.querySelector("nav[aria-label*='breadcrumb' i]");
  return textOf(element).slice(0, 300);
}

function collectPageExcerpt(maxChars) {
  const main =
    document.querySelector("main") ??
    document.querySelector("article") ??
    document.body;
  return textOf(main).slice(0, maxChars);
}

function collectTextBlocks(selectors, options = {}) {
  const minLength = options.minLength ?? 4;
  const maxLength = options.maxLength ?? 800;
  const limit = options.limit ?? 20;
  const seen = new Set();
  const blocks = [];

  for (const element of document.querySelectorAll(selectors.join(","))) {
    const text = textOf(element).slice(0, maxLength);
    const key = normalizeTitle(text);
    if (text.length < minLength || seen.has(key)) {
      continue;
    }
    seen.add(key);
    blocks.push(text);
    if (blocks.length >= limit) {
      break;
    }
  }
  return blocks;
}

function collectDocumentDescription() {
  return metaContent(
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
    '[itemprop="description"]',
  );
}

function collectSummary() {
  const siteSummary = collectTextBlocks(
    [
      "#v_desc",
      ".desc-info-text",
      ".basic-desc-info",
      ".video-desc",
      ".media-summary",
      ".bangumi-summary",
      ".summary-content",
      "[class*='media-intro']",
      "[class*='bangumi-intro']",
    ],
    { minLength: 8, maxLength: 1600, limit: 4 },
  );
  const description = collectDocumentDescription();
  return [...new Set([...siteSummary, description].filter(Boolean))]
    .join("\n")
    .slice(0, 2400);
}

function collectComments() {
  return collectTextBlocks(
    [
      ".reply-item .reply-content",
      ".comment-item .comment-content",
      ".bb-comment .con",
      "#comment .reply-content",
      "[class*='short-review'] [class*='content']",
    ],
    { minLength: 2, maxLength: 500, limit: 24 },
  );
}

export function extractTitleMentions(texts) {
  const seen = new Set();
  const mentions = [];

  for (const text of texts ?? []) {
    const value = String(text ?? "");
    for (const pattern of MENTION_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of value.matchAll(pattern)) {
        const title = cleanDisplayTitle(match[1]).replace(
          /^[《「“"']+|[》」”"']+$/gu,
          "",
        );
        const key = normalizeTitle(title);
        if (
          title.length < 2 ||
          title.length > 80 ||
          key.length < 2 ||
          GENERIC_MENTIONS.has(title) ||
          seen.has(key)
        ) {
          continue;
        }
        seen.add(key);
        mentions.push(title);
      }
    }
  }
  return mentions.slice(0, 16);
}

function isBilibiliHost(hostname) {
  const host = String(hostname ?? "").toLocaleLowerCase();
  return host === "bilibili.com" || host.endsWith(".bilibili.com");
}

function numericId(value) {
  const id = String(value ?? "").trim();
  return /^\d+$/u.test(id) ? id : null;
}

function cookieUserId(cookie) {
  return (
    String(cookie ?? "").match(/(?:^|;\s*)DedeUserID=(\d+)(?:;|$)/u)?.[1] ??
    null
  );
}

function stateUserId(state) {
  return [
    state?.mid,
    state?.user?.mid,
    state?.userInfo?.mid,
    state?.profile?.mid,
    state?.space?.mid,
  ]
    .map(numericId)
    .find(Boolean) ?? null;
}

export function extractBilibiliFollowUid(input, options = {}) {
  let url;
  try {
    url = new URL(
      typeof input === "string"
        ? input
        : String(input?.url ?? globalThis.location?.href ?? ""),
      "https://www.bilibili.com",
    );
  } catch {
    return null;
  }
  if (!isBilibiliHost(url.hostname)) {
    return null;
  }
  const pathUid = url.pathname.match(/^\/(\d+)\/bangumi(?:\/|$)/u)?.[1];
  if (pathUid) {
    return pathUid;
  }
  if (!/^\/bangumi\/mine\/(?:follow|bangumi)(?:\/|$)/u.test(url.pathname)) {
    return null;
  }
  return (
    cookieUserId(
      options.cookie ??
        (typeof document === "undefined" ? "" : document.cookie),
    ) ??
    stateUserId(
      options.initialState ??
        (typeof globalThis === "undefined"
          ? null
          : globalThis.__INITIAL_STATE__),
    )
  );
}

export function detectPageKind(url) {
  if (isBilibiliHost(url.hostname)) {
    if (
      /^\/(?:\d+\/bangumi|bangumi\/mine\/(?:follow|bangumi))(?:\/|$)/iu.test(
        url.pathname,
      )
    ) {
      return "bilibili-follow";
    }
    if (/\/bangumi\/media\/md\d+/iu.test(url.pathname)) {
      return "bilibili-media";
    }
    if (/\/bangumi\/play\/(?:ep|ss)\d+/iu.test(url.pathname)) {
      return "bilibili-play";
    }
  }
  return "generic";
}

export function createPageContext(options = {}) {
  const url = new URL(location.href);
  const maxExcerptChars = options.maxExcerptChars ?? 6000;
  const summary = collectSummary();
  const comments = collectComments();
  const summaryMentions = extractTitleMentions([summary]);
  const commentMentions = extractTitleMentions(comments);
  return {
    url: location.href,
    host: url.hostname,
    path: url.pathname,
    pageKind: detectPageKind(url),
    documentTitle: cleanDisplayTitle(document.title),
    openGraphTitle: cleanDisplayTitle(
      metaContent(
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        "title",
      ),
    ),
    headings: collectHeadingTitles(),
    siteTitles: collectSiteTitleSelectors(),
    jsonLdTitles: collectJsonLdValues(),
    breadcrumb: collectBreadcrumbText(),
    excerpt: collectPageExcerpt(maxExcerptChars),
    summary,
    comments,
    summaryMentions,
    commentMentions,
    titleMentions: [...new Set([...summaryMentions, ...commentMentions])],
    bilibiliIds: extractBilibiliIds(location.href),
    bilibiliFollowUid: extractBilibiliFollowUid(location.href),
  };
}

export function extractTitleCandidates(context) {
  const sources = [
    {
      titles: context.jsonLdTitles,
      source: "regex:json-ld",
      confidence: 0.97,
    },
    {
      titles: context.siteTitles,
      source: "regex:site-title",
      confidence: 0.93,
    },
    {
      titles: [context.openGraphTitle],
      source: "regex:open-graph",
      confidence: 0.86,
    },
    {
      titles: context.headings,
      source: "regex:heading",
      confidence: 0.82,
    },
    {
      titles: [context.documentTitle],
      source: "regex:document-title",
      confidence: 0.74,
    },
    {
      titles: context.summaryMentions,
      source: "regex:summary-mention",
      confidence: 0.7,
    },
    {
      titles: context.commentMentions,
      source: "regex:comment-mention",
      confidence: 0.6,
    },
    {
      titles: [...new Set(context.titleMentions)].filter(
        (title) =>
          !context.summaryMentions.includes(title) &&
          !context.commentMentions.includes(title),
      ),
      source: "regex:page-mention",
      confidence: 0.64,
    },
    {
      titles: [context.breadcrumb],
      source: "regex:breadcrumb",
      confidence: 0.58,
    },
    {
      titles: context.siteTitles.length
        ? []
        : context.headings.length
          ? []
          : [context.documentTitle],
      source: "regex:fallback",
      confidence: 0.5,
    },
  ];

  const candidates = [];
  for (const source of sources) {
    for (const rawTitle of source.titles) {
      extractTitleVariants(rawTitle).forEach((title, variantIndex) => {
        candidates.push({
          title,
          source: source.source,
          rawTitle,
          confidence: Math.max(0.35, source.confidence - variantIndex * 0.07),
        });
      });
    }
  }

  return uniqueByTitle(candidates)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_TITLE_CANDIDATES);
}

export function collectBilibiliCards(limit = 100) {
  const cards = new Map();
  const links = document.querySelectorAll(
    'a[href*="/bangumi/media/md"], a[href*="bangumi/media/md"]',
  );

  for (const link of links) {
    const match = link.getAttribute("href")?.match(/\/bangumi\/media\/md(\d+)/iu);
    const mediaId = match?.[1];
    if (!mediaId) {
      continue;
    }

    const container = link.closest(
      "li, article, [class*='card'], [class*='item'], [class*='cover']",
    );
    const titleNode = container?.querySelector(
      "h1, h2, h3, h4, [class*='title'], [title]",
    );
    const imageAlt = container?.querySelector("img[alt]")?.getAttribute("alt");
    const image = container?.querySelector("img");
    const title =
      cleanDisplayTitle(
        textOf(titleNode) ||
          link.getAttribute("title") ||
          imageAlt ||
          textOf(link),
      ) || `Bilibili media ${mediaId}`;
    const existing = cards.get(mediaId);
    if (!existing || existing.title.startsWith("Bilibili media")) {
      cards.set(mediaId, {
        mediaId,
        title,
        coverUrl:
          image?.currentSrc ||
          image?.getAttribute("src") ||
          image?.getAttribute("data-src") ||
          null,
        source: "bilibili-dom",
      });
    }
    if (cards.size >= limit) {
      break;
    }
  }

  return [...cards.values()];
}
