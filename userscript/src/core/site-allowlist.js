export const ENABLED_SITE_DOMAINS = Object.freeze([
  "bilibili.com",
  "bilibili.tv",
  "bangumi.tv",
  "bgm.tv",
  "acfun.cn",
  "iqiyi.com",
  "iq.com",
  "v.qq.com",
  "youku.com",
  "mgtv.com",
  "tv.sohu.com",
  "pptv.com",
  "1905.com",
  "le.com",
  "douban.com",
  "imdb.com",
  "themoviedb.org",
  "thetvdb.com",
  "myanimelist.net",
  "anilist.co",
  "anidb.net",
  "annict.com",
  "filmarks.com",
  "kitsu.app",
  "shikimori.one",
  "simkl.com",
  "trakt.tv",
  "crunchyroll.com",
  "netflix.com",
  "primevideo.com",
  "disneyplus.com",
  "hulu.com",
  "hulu.jp",
  "max.com",
  "hbomax.com",
  "tv.apple.com",
  "viki.com",
  "wetv.vip",
  "viu.com",
  "ani.gamer.com.tw",
  "nicovideo.jp",
  "abema.tv",
  "unext.jp",
  "animestore.docomo.ne.jp",
]);

function normalizedHostname(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\.$/u, "");
}

export function isEnabledSite(input) {
  let url;
  try {
    url = input instanceof URL ? input : new URL(String(input ?? ""));
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return false;
  }
  const hostname = normalizedHostname(url.hostname);
  return ENABLED_SITE_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

export function userscriptMatchPatterns() {
  return ENABLED_SITE_DOMAINS.flatMap((domain) => [
    `*://${domain}/*`,
    `*://*.${domain}/*`,
  ]);
}
