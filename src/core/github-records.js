import { normalizeCoverUrl } from "./cover-url.js";
import {
  requestJson,
  requestText,
  toErrorMessage,
} from "./network.js";

export const TEMPLATE_REPOSITORY = "zjsycwmrbig/anime-records-template";
export const TEMPLATE_GENERATE_URL =
  `https://github.com/${TEMPLATE_REPOSITORY}/generate`;
export const FINE_GRAINED_TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new";
export const GITHUB_PAGES_DOCS_URL =
  "https://docs.github.com/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site";

const API_ROOT = "https://api.github.com";
const RECORD_DIRECTORY = "data/anime";
const MAX_REVIEW_LENGTH = 20000;

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
  if (bangumi) {
    result.bangumi = bangumi;
  }
  if (bilibiliMedia) {
    result.bilibiliMedia = bilibiliMedia;
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

function sanitizeRating(value, fallback = null) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating >= 0 && rating <= 10
    ? Math.round(rating * 10) / 10
    : fallback;
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
  return {
    $schema: "../../schemas/anime.schema.json",
    schemaVersion: 1,
    id,
    title,
    rating: sanitizeRating(rating),
    review: cleanString(review).slice(0, MAX_REVIEW_LENGTH),
    coverUrl: normalizeCoverUrl(item?.coverUrl),
    note: "",
    externalIds: externalIdsForItem(item, selectedResult),
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

  return {
    ...existingRecord,
    id: cleanString(existingRecord.id) || id,
    rating: sanitizeRating(rating),
    review: cleanString(review).slice(0, MAX_REVIEW_LENGTH),
    updatedAt: now,
  };
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

function recordPath(id) {
  return `${RECORD_DIRECTORY}/${id}.json`;
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

function parseContentResponse(payload, id) {
  if (!payload || typeof payload !== "object") {
    throw new Error("GitHub 返回了无效的记录内容");
  }
  const file =
    payload.content && typeof payload.content === "object"
      ? payload.content
      : payload;
  if (!Object.hasOwn(file, "content")) {
    return {
      id,
      record: null,
      sha: cleanString(file.sha),
      htmlUrl: cleanString(file.html_url),
      path: cleanString(file.path),
    };
  }
  const text =
    file.encoding === "base64"
      ? decodeBase64Utf8(file.content)
      : String(file.content ?? "");
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    throw new Error(`GitHub 记录 ${id}.json 不是有效 JSON`);
  }
  return {
    id,
    record,
    sha: cleanString(file.sha),
    htmlUrl: cleanString(file.html_url),
    path: cleanString(file.path),
  };
}

export class GitHubRecordsService {
  constructor({
    settingsStore = null,
    requestJsonImpl = requestJson,
    requestTextImpl = requestText,
    now = () => new Date().toISOString(),
  } = {}) {
    this.settingsStore = settingsStore;
    this.requestJson = requestJsonImpl;
    this.requestText = requestTextImpl;
    this.now = now;
    this.recordCache = new Map();
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

  cacheKey(config, id) {
    return `${config.urls.fullName}:${config.branch}:${id}`;
  }

  async getRecordById(config, id) {
    const key = this.cacheKey(config, id);
    if (this.recordCache.has(key)) {
      return this.recordCache.get(key);
    }
    const path = recordPath(id);
    const url = `${config.urls.contentsUrl}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(config.branch)}`;
    try {
      const payload = await this.requestJson(url, {
        headers: githubHeaders(config.token),
        timeout: 20000,
      });
      const parsed = parseContentResponse(payload, id);
      this.recordCache.set(key, parsed);
      return parsed;
    } catch (error) {
      if (isNotFound(error)) {
        this.recordCache.delete(key);
        return null;
      }
      throw error;
    }
  }

  async findRecord(item, selectedResult = null) {
    const config = this.assertConfigured();
    const ids = recordIdsForItem(item, selectedResult);
    for (const id of ids) {
      const record = await this.getRecordById(config, id);
      if (record) {
        return record;
      }
    }
    return null;
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
  }) {
    const config = this.assertConfigured();
    const ids = recordIdsForItem(item, selectedResult);
    let existing = null;
    let existingId = null;
    for (const id of ids) {
      existing = await this.getRecordById(config, id);
      if (existing) {
        existingId = id;
        break;
      }
    }

    const id = existingId ?? ids[0];
    let merged = mergeAnimeRecord(existing?.record, {
      item,
      selectedResult,
      aiResult,
      id,
      rating,
      review,
      now: this.now(),
    });
    let sha = existing?.sha ?? null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const payload = await this.putRecord(config, id, merged, sha);
        const parsed = parseContentResponse(payload, id);
        if (!parsed.record?.id) {
          parsed.record = merged;
        }
        this.recordCache.set(this.cacheKey(config, id), parsed);
        return parsed;
      } catch (error) {
        if (attempt > 0 || !isConflict(error)) {
          throw error;
        }
        this.recordCache.delete(this.cacheKey(config, id));
        existing = await this.getRecordById(config, id);
        if (!existing) {
          sha = null;
          merged = mergeAnimeRecord(null, {
            item,
            selectedResult,
            aiResult,
            id,
            rating,
            review,
            now: this.now(),
          });
          continue;
        }
        sha = existing.sha;
        merged = mergeAnimeRecord(existing.record, {
          item,
          selectedResult,
          aiResult,
          id,
          rating,
          review,
          now: this.now(),
        });
      }
    }
    throw new Error("GitHub 记录写入冲突，请稍后重试");
  }

  async putRecord(config, id, record, sha) {
    const path = recordPath(id);
    const body = {
      message: `chore(data): update ${id}`,
      content: encodeBase64Utf8(`${JSON.stringify(record, null, 2)}\n`),
      branch: config.branch,
    };
    if (sha) {
      body.sha = sha;
    }
    return this.requestJson(
      `${config.urls.contentsUrl}/${path
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`,
      {
        method: "PUT",
        headers: githubHeaders(config.token, true),
        body: JSON.stringify(body),
        timeout: 30000,
      },
    );
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
}

export function createGithubRecordsService(options = {}) {
  return new GitHubRecordsService(options);
}
