import { normalizeCoverUrl } from "./cover-url.js";
import { createSeasonDescriptor } from "./season.js";
import { normalizeTitle } from "./title-normalize.js";
import {
  ANIME_INDEX_JSONL_PATH,
  ANIME_JSONL_PATH,
  BACKUP_DIRECTORY,
  MAX_BACKUP_SNAPSHOTS,
  buildAnimeIndex,
  createBackupSnapshot,
  parseJsonl,
  serializeJsonl,
  upsertRecord,
} from "./record-jsonl.js";
import {
  requestJson,
  toErrorMessage,
} from "./network.js";

export const TEMPLATE_REPOSITORY = "zjsycwmrbig/MyAnimeLife";
export const TEMPLATE_GENERATE_URL =
  `https://github.com/${TEMPLATE_REPOSITORY}/generate`;
export const TEMPLATE_REPOSITORY_API_URL =
  `https://api.github.com/repos/${TEMPLATE_REPOSITORY}`;
export const FINE_GRAINED_TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new";
export const GITHUB_PAGES_DOCS_URL =
  "https://docs.github.com/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site";

const API_ROOT = "https://api.github.com";
const MAX_REVIEW_LENGTH = 20000;
const LIBRARY_CACHE_MS = 5 * 60 * 1000;
const DUPLICATE_SCORE_THRESHOLD = 0.72;

export class DuplicateRecordError extends Error {
  constructor(duplicates, scannedCount = 0) {
    super(`发现 ${duplicates.length} 条疑似重复记录，请确认后再同步`);
    this.name = "DuplicateRecordError";
    this.code = "DUPLICATE_RECORDS";
    this.duplicates = duplicates;
    this.scannedCount = scannedCount;
  }
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function itemDisplayTitle(item) {
  const chineseName = item?.names?.find((name) =>
    /[\u3400-\u9fff]/u.test(String(name ?? "")),
  );
  return item?.displayTitle || chineseName || item?.title || "";
}

function manuallyNormalizeItemId(text) {
  return cleanString(text)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 46);
}

export function parseGithubRepository(repositoryUrl) {
  const raw = cleanString(repositoryUrl);
  if (!raw) {
    throw new Error("请填写 GitHub 仓库地址");
  }

  let owner;
  let repo;
  if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+(?:\.git)?$/iu.test(raw)) {
    [owner, repo] = raw.split("/");
    repo = repo.replace(/\.git$/iu, "");
  } else {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("GitHub 仓库地址格式不正确");
    }
    if (
      parsed.protocol !== "https:" ||
      !["github.com", "www.github.com"].includes(
        parsed.hostname.toLocaleLowerCase(),
      )
    ) {
      throw new Error("仓库地址必须来自 github.com");
    }
    const parts = parsed.pathname
      .replace(/\.git$/iu, "")
      .split("/")
      .filter(Boolean);
    if (parts.length !== 2) {
      throw new Error("请填写 GitHub 仓库主页地址，例如 owner/repo");
    }
    [owner, repo] = parts;
  }

  if (
    !/^[a-z0-9_.-]+$/iu.test(owner ?? "") ||
    !/^[a-z0-9_.-]+$/iu.test(repo ?? "")
  ) {
    throw new Error("GitHub 仓库地址格式不正确");
  }

  return {
    owner,
    repo: repo.replace(/\.git$/iu, ""),
    fullName: `${owner}/${repo.replace(/\.git$/iu, "")}`,
    webUrl: `https://github.com/${owner}/${repo.replace(/\.git$/iu, "")}`,
  };
}

export function deriveGithubUrls(repositoryUrl, branch = "main") {
  const repository = parseGithubRepository(repositoryUrl);
  const safeBranch = cleanString(branch) || "main";
  const pagesBaseUrl =
    repository.repo.toLocaleLowerCase() ===
    `${repository.owner.toLocaleLowerCase()}.github.io`
      ? `https://${repository.owner}.github.io/`
      : `https://${repository.owner}.github.io/${repository.repo}/`;
  return {
    ...repository,
    branch: safeBranch,
    apiUrl: `${API_ROOT}/repos/${encodeURIComponent(
      repository.owner,
    )}/${encodeURIComponent(repository.repo)}`,
    pagesBaseUrl,
    pagesLibraryUrl: `${pagesBaseUrl}data/library.json`,
    rawLibraryUrl: `https://raw.githubusercontent.com/${repository.owner}/${
      repository.repo
    }/${safeBranch
      .split("/")
      .map(encodeURIComponent)
      .join("/")}/dist/data/library.json`,
    contentsUrl: `${API_ROOT}/repos/${encodeURIComponent(
      repository.owner,
    )}/${encodeURIComponent(repository.repo)}/contents`,
  };
}

export function externalIdsForItem(item, selectedResult = null) {
  const sites = item?.sites ?? {};
  const candidateSites = selectedResult?.item?.sites ?? {};
  const result = {};
  const bangumi = cleanString(sites.bangumi ?? candidateSites.bangumi);
  const bilibiliMedia = cleanString(
    sites.bilibili ?? candidateSites.bilibili,
  );
  const anilist = cleanString(
    sites.aniList ?? sites.anilist ?? candidateSites.aniList ?? candidateSites.anilist,
  );
  const mal = cleanString(sites.mal ?? candidateSites.mal);
  const bilibiliSeason = cleanString(
    selectedResult?.bilibiliMetadata?.seasonId ??
      selectedResult?.seasonId ??
      item?.season?.bilibiliSeason,
  );
  if (bangumi) {
    result.bangumi = bangumi;
  }
  if (bilibiliMedia) {
    result.bilibiliMedia = bilibiliMedia;
  }
  if (bilibiliSeason) {
    result.bilibiliSeason = bilibiliSeason;
  }
  if (anilist) {
    result.anilist = anilist;
  }
  if (mal) {
    result.mal = mal;
  }
  return result;
}

export function recordIdsForItem(item, selectedResult = null) {
  const externalIds = externalIdsForItem(item, selectedResult);
  const ids = [
    externalIds.bilibiliSeason
      ? `bili-ss${externalIds.bilibiliSeason}`
      : null,
    externalIds.bilibiliMedia
      ? `bili-${externalIds.bilibiliMedia}`
      : null,
    externalIds.bangumi ? `bgm-${externalIds.bangumi}` : null,
    externalIds.anilist ? `anilist-${externalIds.anilist}` : null,
    externalIds.mal ? `mal-${externalIds.mal}` : null,
  ].filter(Boolean);
  if (!ids.length) {
    const title = itemDisplayTitle(item) || "untitled";
    const slug = manuallyNormalizeItemId(title) || "untitled";
    ids.push(`manual-${slug}-${fnv1a(title)}`.slice(0, 64));
  }
  return [...new Set(ids)];
}

function recordIdentityTokens(record) {
  const externalIds = record?.externalIds ?? {};
  return [
    cleanString(record?.id),
    cleanString(externalIds.bilibiliSeason)
      ? `bili-ss${cleanString(externalIds.bilibiliSeason)}`
      : "",
    cleanString(externalIds.bilibiliMedia)
      ? `bili-${cleanString(externalIds.bilibiliMedia)}`
      : "",
    cleanString(externalIds.bangumi)
      ? `bgm-${cleanString(externalIds.bangumi)}`
      : "",
    cleanString(externalIds.anilist)
      ? `anilist-${cleanString(externalIds.anilist)}`
      : "",
    cleanString(externalIds.mal) ? `mal-${cleanString(externalIds.mal)}` : "",
  ].filter(Boolean);
}

function seasonKeyFromExternalIds(externalIds = {}) {
  for (const [source, id] of Object.entries(externalIds)) {
    if (cleanString(id)) {
      return `${source}:${cleanString(id)}`;
    }
  }
  return null;
}

export function seasonForItem(item, selectedResult = null) {
  if (!item) {
    return null;
  }
  const externalIds = externalIdsForItem(item, selectedResult);
  const bilibiliMetadata = selectedResult?.bilibiliMetadata ?? null;
  return createSeasonDescriptor({
    key:
      cleanString(item.season?.key) ||
      cleanString(item.id) ||
      seasonKeyFromExternalIds(externalIds),
    title: itemDisplayTitle(item),
    names: [
      item.title,
      ...(Array.isArray(item.names) ? item.names : []),
      bilibiliMetadata?.seasonTitle,
      bilibiliMetadata?.title,
    ].filter(Boolean),
    begin: item.begin,
    year: item.year,
    season: item.season,
  });
}

export function seasonForRecord(record) {
  if (!record) {
    return null;
  }
  return createSeasonDescriptor({
    key:
      cleanString(record.season?.key) ||
      cleanString(record.id) ||
      seasonKeyFromExternalIds(record.externalIds),
    title: record.title,
    names: [record.match?.matchedTitle].filter(Boolean),
    begin: record.season?.begin ?? record.begin,
    year: record.season?.year,
    season: record.season,
  });
}

function sanitizeRating(value, fallback = null) {
  if (value === null || value === undefined || cleanString(value) === "") {
    return fallback;
  }
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 0 && rating <= 10
    ? Math.round(rating * 10) / 10
    : fallback;
}

function nextRecordTimestamp(previous, now) {
  const currentTime = new Date(now).getTime();
  const previousTime = new Date(previous).getTime();
  if (
    Number.isFinite(currentTime) &&
    Number.isFinite(previousTime) &&
    currentTime <= previousTime
  ) {
    return new Date(previousTime + 1).toISOString();
  }
  return now;
}

function matchMethod(selectedResult, aiResult) {
  if (selectedResult?.manualSelection) {
    return "manual";
  }
  const matchedBy = Array.isArray(selectedResult?.matchedBy)
    ? selectedResult.matchedBy
    : [];
  if (
    matchedBy.some((method) =>
      ["bilibili-id", "bilibili-api-id", "site-id"].includes(method),
    )
  ) {
    return "site-id";
  }
  if (matchedBy.includes("exact")) {
    return "title-exact";
  }
  if (
    matchedBy.some((method) => ["fuzzy", "substring"].includes(method))
  ) {
    return "title-fuzzy";
  }
  return aiResult ? "ai" : "manual";
}

export function createAnimeRecord({
  item,
  selectedResult = null,
  aiResult = null,
  id,
  rating,
  review,
  now = new Date().toISOString(),
}) {
  const title = itemDisplayTitle(item).slice(0, 200);
  if (!title) {
    throw new Error("无法为没有标题的番剧创建 GitHub 记录");
  }
  const manual = Boolean(selectedResult?.manualSelection);
  const externalIds = externalIdsForItem(item, selectedResult);
  return {
    $schema: "../../schemas/anime.schema.json",
    schemaVersion: 1,
    id,
    title,
    rating: sanitizeRating(rating),
    review: cleanString(review).slice(0, MAX_REVIEW_LENGTH),
    coverUrl: normalizeCoverUrl(item?.coverUrl),
    note: "",
    externalIds,
    season: seasonForItem(item, selectedResult),
    match: {
      status: manual ? "manual" : "matched",
      method: matchMethod(selectedResult, aiResult),
      source: "bangumi-data",
      confidence: Math.max(
        0,
        Math.min(1, Number(selectedResult?.confidence) || (manual ? 1 : 0)),
      ),
      matchedTitle: cleanString(item?.title) || null,
      matchedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function mergeAnimeRecord(
  existingRecord,
  {
    item,
    selectedResult = null,
    aiResult = null,
    id,
    rating,
    review,
    now = new Date().toISOString(),
  },
) {
  if (!existingRecord) {
    return createAnimeRecord({
      item,
      selectedResult,
      aiResult,
      id,
      rating,
      review,
      now,
    });
  }

  const updated = {
    ...existingRecord,
    id: cleanString(existingRecord.id) || id,
    rating: sanitizeRating(rating),
    review: cleanString(review).slice(0, MAX_REVIEW_LENGTH),
    updatedAt: nextRecordTimestamp(existingRecord.updatedAt, now),
  };
  const season = seasonForItem(item, selectedResult);
  if (season) {
    updated.season = season;
  }
  return updated;
}

function normalizeComparable(value) {
  return normalizeTitle(value);
}

function titleSimilarity(left, right) {
  const a = normalizeComparable(left);
  const b = normalizeComparable(right);
  if (!a || !b) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 4 && longer.includes(shorter)) {
    return 0.92;
  }

  const leftPairs = new Map();
  for (let index = 0; index < a.length - 1; index += 1) {
    const pair = a.slice(index, index + 2);
    leftPairs.set(pair, (leftPairs.get(pair) ?? 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const pair = b.slice(index, index + 2);
    const count = leftPairs.get(pair) ?? 0;
    if (count) {
      overlap += 1;
      leftPairs.set(pair, count - 1);
    }
  }
  const total = Math.max(0, a.length - 1) + Math.max(0, b.length - 1);
  return total ? (overlap * 2) / total : 0;
}

function bestTitleSimilarity(incomingTitles, existingTitles) {
  let best = 0;
  for (const incoming of incomingTitles) {
    for (const existing of existingTitles) {
      best = Math.max(best, titleSimilarity(incoming, existing));
    }
  }
  return best;
}

function duplicateCandidate(incoming, existing, score, reason, titleScore) {
  return {
    id: cleanString(existing.id) || null,
    title: itemDisplayTitle(existing) || cleanString(existing.title),
    season: seasonForRecord(existing),
    score: Math.round(score * 100) / 100,
    reason,
    titleScore: Math.round(titleScore * 100) / 100,
    updatedAt: cleanString(existing.updatedAt) || null,
  };
}

function compareRecordDuplicate({
  item,
  selectedResult,
  aiResult,
  existing,
}) {
  const incomingSeason = seasonForItem(item, selectedResult);
  const existingSeason = seasonForRecord(existing);
  if (
    incomingSeason?.number &&
    existingSeason?.number &&
    incomingSeason.number !== existingSeason.number
  ) {
    return null;
  }
  if (
    incomingSeason?.year &&
    existingSeason?.year &&
    incomingSeason.year !== existingSeason.year
  ) {
    return null;
  }

  const incomingExternalIds = externalIdsForItem(item, selectedResult);
  const existingExternalIds = existing?.externalIds ?? {};
  const sharedExternalIds = Object.entries(incomingExternalIds).filter(
    ([source, id]) =>
      cleanString(id) &&
      cleanString(existingExternalIds[source]) === cleanString(id),
  );
  if (sharedExternalIds.length) {
    return duplicateCandidate(
      item,
      existing,
      1,
      `相同站点索引：${sharedExternalIds
        .map(([source, id]) => `${source}:${id}`)
        .join("、")}`,
      1,
    );
  }

  const incomingTitles = [
    itemDisplayTitle(item),
    item?.title,
    ...(item?.names ?? []),
    aiResult?.title,
    ...(aiResult?.alternateTitles ?? []),
  ]
    .map(cleanString)
    .filter(Boolean);
  const existingTitles = [
    existing?.title,
    existing?.match?.matchedTitle,
    ...(existing?.aliases ?? []),
  ]
    .map(cleanString)
    .filter(Boolean);
  const titleScore = bestTitleSimilarity(incomingTitles, existingTitles);
  let score = 0;
  let reason = "";

  if (
    incomingSeason?.key &&
    existingSeason?.key &&
    incomingSeason.key === existingSeason.key
  ) {
    score = 0.98;
    reason = "相同季度身份";
  } else if (
    incomingSeason?.number &&
    existingSeason?.number &&
    incomingSeason.number === existingSeason.number &&
    titleScore >= 0.86
  ) {
    score = 0.94;
    reason = `同一季度：第${incomingSeason.number}季`;
  } else if (titleScore === 1) {
    score = 0.86;
    reason = "标题完全一致，季度信息不足以区分";
  } else if (titleScore >= 0.9) {
    score = 0.79;
    reason = "标题高度相似，季度信息不足以区分";
  } else if (titleScore >= 0.82) {
    score = 0.73;
    reason = "标题较相似，建议人工确认";
  }

  return score >= DUPLICATE_SCORE_THRESHOLD
    ? duplicateCandidate(item, existing, score, reason, titleScore)
    : null;
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value ?? "").replace(/\s+/gu, ""));
  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0),
  );
  return new TextDecoder().decode(bytes);
}

function githubHeaders(token, includeContentType = false) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (includeContentType) {
    headers["Content-Type"] = "application/json; charset=utf-8";
  }
  if (cleanString(token)) {
    headers.Authorization = `Bearer ${cleanString(token)}`;
  }
  return headers;
}

function isNotFound(error) {
  if (Number(error?.status) === 404) {
    return true;
  }
  return /^HTTP 404\b/u.test(toErrorMessage(error));
}

function isConflict(error) {
  return [409, 422].includes(Number(error?.status));
}

function parseContentResponse(payload, path) {
  if (!payload || typeof payload !== "object") {
    throw new Error("GitHub 返回了无效的文件内容");
  }
  const file =
    payload.content && typeof payload.content === "object"
      ? payload.content
      : payload;
  if (!Object.hasOwn(file, "content")) {
    return {
      text: "",
      sha: cleanString(file.sha),
      htmlUrl: cleanString(file.html_url),
      path: cleanString(file.path) || path,
      exists: false,
    };
  }
  const text =
    file.encoding === "base64"
      ? decodeBase64Utf8(file.content)
      : String(file.content ?? "");
  return {
    text,
    sha: cleanString(file.sha),
    htmlUrl: cleanString(file.html_url),
    path: cleanString(file.path) || path,
    exists: true,
  };
}

export class GitHubRecordsService {
  constructor({
    settingsStore = null,
    requestJsonImpl = requestJson,
    now = () => new Date().toISOString(),
  } = {}) {
    this.settingsStore = settingsStore;
    this.requestJson = requestJsonImpl;
    this.now = now;
    this.fileCache = new Map();
  }

  getConfig(override = null) {
    const settings = override ?? this.settingsStore?.get?.()?.github ?? {};
    const repositoryUrl = cleanString(settings.repositoryUrl);
    const branch = cleanString(settings.branch) || "main";
    return {
      enabled: Boolean(settings.enabled),
      token: cleanString(settings.token),
      branch,
      repositoryUrl,
      urls: repositoryUrl
        ? deriveGithubUrls(repositoryUrl, branch)
        : null,
    };
  }

  assertConfigured(override = null) {
    const config = this.getConfig(override);
    if (!config.enabled) {
      throw new Error("GitHub 同步尚未启用");
    }
    if (!config.urls) {
      throw new Error("请先填写 GitHub 仓库地址");
    }
    return config;
  }

  fileCacheKey(config, filePath) {
    return `${config.urls.fullName}:${config.branch}:${filePath}`;
  }

  contentUrl(config, filePath) {
    return `${config.urls.contentsUrl}/${filePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
  }

  async getContentFile(config, filePath, options = {}) {
    const key = this.fileCacheKey(config, filePath);
    const cached = this.fileCache.get(key);
    if (
      !options.force &&
      cached &&
      Date.now() - cached.cachedAt < LIBRARY_CACHE_MS
    ) {
      return cached.file;
    }
    const url = `${this.contentUrl(config, filePath)}?ref=${encodeURIComponent(
      config.branch,
    )}`;
    try {
      const payload = await this.requestJson(url, {
        headers: githubHeaders(config.token),
        timeout: 20000,
      });
      const file = parseContentResponse(payload, filePath);
      this.fileCache.set(key, { file, cachedAt: Date.now() });
      return file;
    } catch (error) {
      if (isNotFound(error)) {
        const file = {
          text: "",
          sha: null,
          htmlUrl: "",
          path: filePath,
          exists: false,
        };
        this.fileCache.set(key, { file, cachedAt: Date.now() });
        return file;
      }
      throw error;
    }
  }

  async getIndexRecords(config, options = {}) {
    const indexFile = await this.getContentFile(
      config,
      ANIME_INDEX_JSONL_PATH,
      options,
    );
    if (indexFile.exists) {
      return parseJsonl(indexFile.text, ANIME_INDEX_JSONL_PATH);
    }
    const library = await this.loadLibrary(config, options);
    return buildAnimeIndex(library.records);
  }

  async loadLibrary(config, options = {}) {
    const [animeFile, indexFile] = await Promise.all([
      this.getContentFile(config, ANIME_JSONL_PATH, options),
      this.getContentFile(config, ANIME_INDEX_JSONL_PATH, options),
    ]);
    const records = parseJsonl(animeFile.text, ANIME_JSONL_PATH);
    const index = indexFile.exists
      ? parseJsonl(indexFile.text, ANIME_INDEX_JSONL_PATH)
      : buildAnimeIndex(records);
    return {
      records,
      index,
      animeFile,
      indexFile,
    };
  }

  async listDirectoryFiles(config, directory, options = {}) {
    const url = `${this.contentUrl(config, directory)}?ref=${encodeURIComponent(
      config.branch,
    )}`;
    let payload;
    try {
      payload = await this.requestJson(url, {
        headers: githubHeaders(config.token),
        timeout: 20000,
      });
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
    if (!Array.isArray(payload)) {
      throw new Error(`GitHub 目录 ${directory} 返回了无效内容`);
    }
    return payload
      .filter(
        (entry) =>
          entry?.type === "file" &&
          (!options.extension ||
            String(entry?.name ?? "").toLocaleLowerCase().endsWith(
              options.extension.toLocaleLowerCase(),
            )),
      )
      .map((entry) => ({
        name: String(entry.name),
        path: cleanString(entry.path),
        sha: cleanString(entry.sha),
      }))
      .filter((entry) => entry.name && entry.path);
  }

  async listRecords(config, options = {}) {
    const library = await this.loadLibrary(config, options);
    return library.records;
  }

  inspectDuplicateRecords(records, { item, selectedResult, aiResult, excludeIds }) {
    const excluded = new Set([
      ...recordIdsForItem(item, selectedResult),
      ...excludeIds.map((id) => cleanString(id)).filter(Boolean),
    ]);
    const duplicates = (records ?? [])
      .filter(({ id }) => !excluded.has(cleanString(id)))
      .map((record) =>
        compareRecordDuplicate({
          item,
          selectedResult,
          aiResult,
          existing: record,
        }),
      )
      .filter(Boolean)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
    return {
      duplicates,
      scannedCount: records?.length ?? 0,
    };
  }

  async inspectDuplicates({
    item,
    selectedResult = null,
    aiResult = null,
    excludeIds = [],
  }) {
    const config = this.assertConfigured();
    if (!item) {
      return { duplicates: [], scannedCount: 0 };
    }
    const records = await this.getIndexRecords(config);
    return this.inspectDuplicateRecords(records, {
      item,
      selectedResult,
      aiResult,
      excludeIds,
    });
  }

  async findRecord(item, selectedResult = null) {
    const config = this.assertConfigured();
    const ids = recordIdsForItem(item, selectedResult);
    const library = await this.loadLibrary(config);
    const idSet = new Set(ids);
    const record = library.records.find((entry) => idSet.has(cleanString(entry.id)));
    if (!record) {
      return null;
    }
    return {
      id: cleanString(record.id),
      record,
      sha: library.animeFile.sha,
      htmlUrl: library.animeFile.htmlUrl,
      path: library.animeFile.path,
    };
  }

  async loadForItem(item, selectedResult = null) {
    if (!item) {
      return null;
    }
    try {
      return await this.findRecord(item, selectedResult);
    } catch (error) {
      if (Number(error?.status) === 401 || Number(error?.status) === 403) {
        throw new Error(
          "GitHub 读取失败，请检查 Token 是否仍有效以及 Contents 权限",
        );
      }
      throw error;
    }
  }

  async saveRecord({
    item,
    selectedResult = null,
    aiResult = null,
    rating,
    review,
    allowDuplicates = false,
  }) {
    const config = this.assertConfigured();
    const ids = recordIdsForItem(item, selectedResult);
    const requestedAt = this.now();
    let backupWritten = false;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const library = await this.loadLibrary(config, {
        force: attempt > 0,
      });
      const idSet = new Set(ids);
      const existing =
        library.records.find((record) => idSet.has(cleanString(record.id))) ??
        null;
      const existingId = cleanString(existing?.id) || null;

      if (!allowDuplicates) {
        const inspection = this.inspectDuplicateRecords(library.index, {
          item,
          selectedResult,
          aiResult,
          excludeIds: ids,
        });
        if (inspection.duplicates.length) {
          throw new DuplicateRecordError(
            inspection.duplicates,
            inspection.scannedCount,
          );
        }
      }

      const id = existingId ?? ids[0];
      const merged = mergeAnimeRecord(existing, {
        item,
        selectedResult,
        aiResult,
        id,
        rating,
        review,
        now: requestedAt,
      });
      const nextRecords = upsertRecord(library.records, merged);
      const nextIndex = buildAnimeIndex(nextRecords);
      const animeText = serializeJsonl(nextRecords);
      const indexText = serializeJsonl(nextIndex);

      try {
        if (!backupWritten && (library.animeFile.exists || library.indexFile.exists)) {
          await this.writeBackupSnapshot(config, library, requestedAt);
          backupWritten = true;
        }
        const animeWrite = await this.putContentFile(
          config,
          ANIME_JSONL_PATH,
          animeText,
          library.animeFile.sha,
          `chore(data): sync ${id}`,
        );
        const indexWrite = await this.putContentFile(
          config,
          ANIME_INDEX_JSONL_PATH,
          indexText,
          library.indexFile.sha,
          `chore(data): refresh anime index for ${id}`,
        );
        this.cacheWrittenFile(config, ANIME_JSONL_PATH, animeText, animeWrite);
        this.cacheWrittenFile(
          config,
          ANIME_INDEX_JSONL_PATH,
          indexText,
          indexWrite,
        );
        return {
          id,
          record: merged,
          sha: animeWrite.sha,
          htmlUrl: animeWrite.htmlUrl,
          path: ANIME_JSONL_PATH,
        };
      } catch (error) {
        if (attempt > 0 || !isConflict(error)) {
          throw error;
        }
        this.fileCache.delete(this.fileCacheKey(config, ANIME_JSONL_PATH));
        this.fileCache.delete(this.fileCacheKey(config, ANIME_INDEX_JSONL_PATH));
      }
    }
    throw new Error("GitHub 记录写入冲突，请稍后重试");
  }

  async saveRecordsBatch({ entries = [], now = this.now() } = {}) {
    const config = this.assertConfigured();
    const queued = [];
    const queuedIds = new Set();
    let inputDuplicateCount = 0;

    for (const entry of entries) {
      if (!entry?.item) {
        continue;
      }
      const selectedResult = entry.selectedResult ?? null;
      const ids = recordIdsForItem(entry.item, selectedResult);
      if (ids.some((id) => queuedIds.has(id))) {
        inputDuplicateCount += 1;
        continue;
      }
      for (const id of ids) {
        queuedIds.add(id);
      }
      queued.push({
        item: entry.item,
        selectedResult,
        ids,
        id: ids[0],
      });
    }

    if (!queued.length) {
      return {
        imported: [],
        skippedCount: inputDuplicateCount,
        scannedCount: 0,
      };
    }

    const importedById = new Map();
    let backupWritten = false;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const library = await this.loadLibrary(config, {
        force: attempt > 0,
      });
      const existingTokens = new Set(
        library.records.flatMap((record) => recordIdentityTokens(record)),
      );
      const added = [];
      let nextRecords = library.records;
      for (const entry of queued) {
        if (entry.ids.some((id) => existingTokens.has(id))) {
          continue;
        }
        const record = createAnimeRecord({
          item: entry.item,
          selectedResult: entry.selectedResult,
          id: entry.id,
          rating: null,
          review: "",
          now,
        });
        nextRecords = upsertRecord(nextRecords, record);
        entry.ids.forEach((id) => existingTokens.add(id));
        added.push(record);
      }

      const nextIndex = buildAnimeIndex(nextRecords);
      const animeText = serializeJsonl(nextRecords);
      const indexText = serializeJsonl(nextIndex);
      const changed =
        animeText !== (library.animeFile.text ?? "") ||
        indexText !== (library.indexFile.text ?? "");

      if (!changed) {
        const imported = [...importedById.values()];
        return {
          imported,
          skippedCount:
            queued.length - imported.length + inputDuplicateCount,
          scannedCount: library.records.length,
          records: nextRecords,
          path: ANIME_JSONL_PATH,
          htmlUrl: library.animeFile.htmlUrl,
          sha: library.animeFile.sha,
        };
      }

      try {
        if (
          !backupWritten &&
          (library.animeFile.exists || library.indexFile.exists)
        ) {
          await this.writeBackupSnapshot(config, library, now);
          backupWritten = true;
        }
        const animeWrite = await this.putContentFile(
          config,
          ANIME_JSONL_PATH,
          animeText,
          library.animeFile.sha,
          `chore(data): import ${added.length || queued.length} Bilibili anime`,
        );
        for (const record of added) {
          importedById.set(record.id, {
            id: record.id,
            title: record.title,
            mediaId: cleanString(record.externalIds?.bilibiliMedia),
          });
        }
        const indexWrite = await this.putContentFile(
          config,
          ANIME_INDEX_JSONL_PATH,
          indexText,
          library.indexFile.sha,
          `chore(data): refresh index after Bilibili import`,
        );
        this.cacheWrittenFile(config, ANIME_JSONL_PATH, animeText, animeWrite);
        this.cacheWrittenFile(
          config,
          ANIME_INDEX_JSONL_PATH,
          indexText,
          indexWrite,
        );
        const imported = [...importedById.values()];
        return {
          imported,
          skippedCount:
            queued.length - imported.length + inputDuplicateCount,
          scannedCount: nextRecords.length,
          records: nextRecords,
          path: ANIME_JSONL_PATH,
          htmlUrl: animeWrite.htmlUrl,
          sha: animeWrite.sha,
        };
      } catch (error) {
        if (attempt > 0 || !isConflict(error)) {
          throw error;
        }
        this.fileCache.delete(this.fileCacheKey(config, ANIME_JSONL_PATH));
        this.fileCache.delete(this.fileCacheKey(config, ANIME_INDEX_JSONL_PATH));
      }
    }
    throw new Error("GitHub 批量记录写入冲突，请稍后重试");
  }

  cacheWrittenFile(config, filePath, text, payload) {
    const parsed = parseContentResponse(payload, filePath);
    this.fileCache.set(this.fileCacheKey(config, filePath), {
      file: {
        ...parsed,
        text,
        exists: true,
      },
      cachedAt: Date.now(),
    });
  }

  async putContentFile(config, filePath, text, sha, message) {
    const body = {
      message,
      content: encodeBase64Utf8(text),
      branch: config.branch,
    };
    if (sha) {
      body.sha = sha;
    }
    return this.requestJson(
      this.contentUrl(config, filePath),
      {
        method: "PUT",
        headers: githubHeaders(config.token, true),
        body: JSON.stringify(body),
        timeout: 30000,
      },
    );
  }

  async deleteContentFile(config, filePath, sha, message) {
    return this.requestJson(this.contentUrl(config, filePath), {
      method: "DELETE",
      headers: githubHeaders(config.token, true),
      body: JSON.stringify({
        message,
        sha,
        branch: config.branch,
      }),
      timeout: 30000,
    });
  }

  async writeBackupSnapshot(config, library, createdAt) {
    const animeText = library.animeFile.text ?? "";
    const indexText = library.indexFile.text ?? "";
    if (!animeText && !indexText) {
      return;
    }
    const safeTime = cleanString(createdAt)
      .replace(/[:.]/gu, "-")
      .replace(/[^0-9A-Za-z_-]/gu, "");
    const suffix = fnv1a(`${animeText}\n${indexText}`);
    const backupPath = `${BACKUP_DIRECTORY}/library-${safeTime}-${suffix}.json`;
    const snapshot = createBackupSnapshot({
      animeText,
      indexText,
      createdAt,
    });
    await this.putContentFile(
      config,
      backupPath,
      `${JSON.stringify(snapshot, null, 2)}\n`,
      null,
      `chore(backup): snapshot anime library ${safeTime}`,
    );

    const backups = (
      await this.listDirectoryFiles(config, BACKUP_DIRECTORY, {
        extension: ".json",
      })
    ).sort((left, right) => right.name.localeCompare(left.name, "en"));
    for (const stale of backups.slice(MAX_BACKUP_SNAPSHOTS)) {
      await this.deleteContentFile(
        config,
        stale.path,
        stale.sha,
        `chore(backup): prune ${stale.name}`,
      );
    }
  }

  async checkConnection(override = null) {
    const config = this.getConfig(override);
    if (!config.urls) {
      throw new Error("请先填写 GitHub 仓库地址");
    }
    const repository = await this.requestJson(config.urls.apiUrl, {
      headers: githubHeaders(config.token),
      timeout: 20000,
    });
    return {
      fullName: cleanString(repository.full_name) || config.urls.fullName,
      defaultBranch: cleanString(repository.default_branch) || "main",
      private: Boolean(repository.private),
      permissions: repository.permissions ?? null,
      hasToken: Boolean(config.token),
      pagesLibraryUrl: config.urls.pagesLibraryUrl,
      pagesSetupUrl: `${config.urls.webUrl}/settings/pages`,
    };
  }

  async checkTemplateRepository() {
    const repository = await this.requestJson(TEMPLATE_REPOSITORY_API_URL, {
      timeout: 20000,
    });
    const fullName = cleanString(repository.full_name);
    const publicRepository = repository.private === false;
    const templateEnabled = repository.is_template === true;
    return {
      fullName: fullName || TEMPLATE_REPOSITORY,
      private: !publicRepository,
      isTemplate: templateEnabled,
      defaultBranch: cleanString(repository.default_branch) || "main",
      ready: publicRepository && templateEnabled,
      webUrl:
        cleanString(repository.html_url) ||
        `https://github.com/${TEMPLATE_REPOSITORY}`,
    };
  }
}

export function createGithubRecordsService(options = {}) {
  return new GitHubRecordsService(options);
}
