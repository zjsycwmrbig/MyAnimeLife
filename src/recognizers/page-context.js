import {
  cleanDisplayTitle,
  extractBilibiliIds,
  extractTitleVariants,
  uniqueByTitle,
} from "../core/title-normalize.js";

const MAX_TITLE_CANDIDATES = 24;

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

function detectPageKind(url) {
  if (url.hostname.endsWith("bilibili.com")) {
    if (/\/(?:bangumi\/mine\/follow|bangumi\/mine\/bangumi)/iu.test(url.pathname)) {
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
    bilibiliIds: extractBilibiliIds(location.href),
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
        source: "bilibili-dom",
      });
    }
    if (cards.size >= limit) {
      break;
    }
  }

  return [...cards.values()];
}
