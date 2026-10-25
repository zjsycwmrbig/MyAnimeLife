import { BrowserCatalogStore } from "./browser-catalog-store.js";
import {
  GitHubAdminStore,
  GitHubClient,
} from "./github-client.js";
import { findDuplicateGroups } from "../scripts/duplicate-data.mjs";

const SETTINGS_KEY = "myanimelife.admin.github.settings";
const TOKEN_KEY = "myanimelife.admin.github.token";

function cleanString(value) {
  return String(value ?? "").trim();
}

function readStorage(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function inferPagesRepository() {
  const hostname = location.hostname;
  if (!hostname.endsWith(".github.io")) {
    return "";
  }
  const owner = hostname.slice(0, -".github.io".length);
  const repository = location.pathname.split("/").filter(Boolean)[0] ?? "";
  return owner && repository ? `${owner}/${repository}` : "";
}

const injected = globalThis.ANIME_ADMIN_CONFIG ?? {};
const storedSettings = readStorage(localStorage, SETTINGS_KEY) ?? {};
const isLocalAdmin =
  ["127.0.0.1", "localhost", "::1"].includes(location.hostname) &&
  location.protocol === "http:";
const mode = isLocalAdmin ? "local" : "github";
const settings = {
  repository:
    cleanString(storedSettings.repository) ||
    cleanString(injected.repository) ||
    inferPagesRepository(),
  branch:
    cleanString(storedSettings.branch) ||
    cleanString(injected.branch) ||
    "main",
};
function readCachedToken() {
  try {
    const localToken = cleanString(localStorage.getItem(TOKEN_KEY));
    if (localToken) {
      return localToken;
    }
    const legacyToken = cleanString(sessionStorage.getItem(TOKEN_KEY));
    if (legacyToken) {
      localStorage.setItem(TOKEN_KEY, legacyToken);
      return legacyToken;
    }
  } catch {
    // Storage can be unavailable in private browsing.
  }
  return "";
}

let token = readCachedToken();
let onlineStore = null;
let catalogStore = null;
let libraryCache = null;

const elements = {
  runtimeBadge: document.querySelector("#runtimeBadge"),
  connectionButton: document.querySelector("#connectionButton"),
  connectionDialog: document.querySelector("#connectionDialog"),
  connectionForm: document.querySelector("#connectionForm"),
  connectionClose: document.querySelector("#connectionClose"),
  connectionCancel: document.querySelector("#connectionCancel"),
  connectionDisconnect: document.querySelector("#connectionDisconnect"),
  connectionStatus: document.querySelector("#connectionStatus"),
  repositoryInput: document.querySelector("#repositoryInput"),
  branchInput: document.querySelector("#branchInput"),
  tokenInput: document.querySelector("#tokenInput"),
  connectionSubmit: document.querySelector("#connectionSubmit"),
};

function createOnlineStore() {
  const client = new GitHubClient({
    repository: settings.repository,
    branch: settings.branch,
    token,
  });
  return new GitHubAdminStore(client);
}

function getOnlineStore() {
  if (!settings.repository) {
    throw new Error(
      "尚未配置数据仓库。请点击右上角“连接 GitHub”填写 owner/repository",
    );
  }
  onlineStore ??= createOnlineStore();
  return onlineStore;
}

function getCatalogStore() {
  catalogStore ??= new BrowserCatalogStore();
  return catalogStore;
}

function invalidateLibraryCache() {
  libraryCache = null;
}

function renderRuntime() {
  if (!elements.runtimeBadge || !elements.connectionButton) {
    return;
  }
  if (mode === "local") {
    elements.runtimeBadge.textContent = "本地服务";
    elements.runtimeBadge.className = "runtime-badge is-local";
    elements.connectionButton.textContent = "本地管理模式";
    return;
  }
  elements.runtimeBadge.textContent = token ? "GitHub 可写" : "GitHub 只读";
  elements.runtimeBadge.className = `runtime-badge is-github${
    token ? " is-writable" : ""
  }`;
  elements.connectionButton.textContent = [
    settings.repository || "配置仓库",
    token ? "已连接" : "连接 GitHub",
  ].join(" · ");
}

function setConnectionStatus(message, options = {}) {
  if (!elements.connectionStatus) {
    return;
  }
  elements.connectionStatus.textContent = message;
  elements.connectionStatus.classList.toggle(
    "is-error",
    Boolean(options.error),
  );
  elements.connectionStatus.classList.toggle(
    "is-success",
    Boolean(options.success),
  );
}

function openConnectionDialog() {
  if (!elements.connectionDialog) {
    return;
  }
  elements.repositoryInput.value = settings.repository;
  elements.branchInput.value = settings.branch;
  elements.tokenInput.value = token;
  elements.connectionDisconnect.hidden = !token;
  if (mode === "local") {
    elements.repositoryInput.disabled = true;
    elements.branchInput.disabled = true;
    elements.tokenInput.disabled = true;
    elements.connectionSubmit.hidden = true;
    setConnectionStatus(
      "当前由本地管理服务写入文件。GitHub Pages 版会自动启用在线模式。",
      { success: true },
    );
  } else {
    setConnectionStatus(
      token
        ? `当前以 ${settings.repository} 的 ${settings.branch} 分支连接。`
        : "当前为公开只读模式。填写 Token 后可编辑并直接提交。",
      { success: token },
    );
  }
  if (typeof elements.connectionDialog.showModal === "function") {
    elements.connectionDialog.showModal();
  } else {
    elements.connectionDialog.setAttribute("open", "");
  }
}

function closeConnectionDialog() {
  if (typeof elements.connectionDialog?.close === "function") {
    elements.connectionDialog.close();
  } else {
    elements.connectionDialog?.removeAttribute("open");
  }
}

async function saveConnection(event) {
  event.preventDefault();
  if (mode === "local") {
    closeConnectionDialog();
    return;
  }

  const repository = cleanString(elements.repositoryInput.value);
  const branch = cleanString(elements.branchInput.value) || "main";
  const nextToken = cleanString(elements.tokenInput.value);
  elements.connectionSubmit.disabled = true;
  elements.connectionSubmit.classList.add("is-loading");
  setConnectionStatus("正在验证仓库和 Token...");
  try {
    const probe = new GitHubClient({ repository, branch, token: nextToken });
    const repositoryInfo = await probe.getRepository();
    await probe.getRef();
    settings.repository = repositoryInfo.full_name || repository;
    settings.branch = branch;
    token = nextToken;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
    onlineStore = null;
    invalidateLibraryCache();
    catalogStore = null;
    renderRuntime();
    setConnectionStatus(
      token
        ? `连接成功，可写入 ${settings.repository}`
        : "连接成功。当前没有 Token，仅能读取公开仓库。",
      { success: true },
    );
    window.dispatchEvent(
      new CustomEvent("anime-runtime:changed", {
        detail: { mode, repository: settings.repository, token: Boolean(token) },
      }),
    );
    setTimeout(closeConnectionDialog, 350);
  } catch (error) {
    setConnectionStatus(error.message, { error: true });
  } finally {
    elements.connectionSubmit.disabled = false;
    elements.connectionSubmit.classList.remove("is-loading");
  }
}

function disconnectToken() {
  token = "";
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  onlineStore = null;
  invalidateLibraryCache();
  elements.tokenInput.value = "";
  elements.connectionDisconnect.hidden = true;
  renderRuntime();
  setConnectionStatus("已移除浏览器本地缓存中的 Token，当前切换为只读。", {
    success: true,
  });
  window.dispatchEvent(
    new CustomEvent("anime-runtime:changed", {
      detail: { mode, repository: settings.repository, token: false },
    }),
  );
}

async function localApi(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || `请求失败 (${response.status})`);
  }
  return payload;
}

function parseBody(options) {
  if (!options.body) {
    return {};
  }
  try {
    return JSON.parse(options.body);
  } catch {
    throw new Error("请求内容不是有效 JSON");
  }
}

async function githubLibrary(fresh = false) {
  if (!fresh && libraryCache) {
    return libraryCache;
  }
  const snapshot = await getOnlineStore().load();
  libraryCache = snapshot;
  return snapshot;
}

async function onlineApi(path, options) {
  const method = options.method ?? "GET";
  const url = new URL(path, location.href);
  const store = getOnlineStore();

  if (url.pathname === "/api/library" && method === "GET") {
    const library = await githubLibrary();
    return {
      records: library.records,
      index: library.index,
      backupLimit: library.backupLimit,
      git: {
        branch: settings.branch,
        remote: settings.repository,
        dirty: false,
        changes: [],
        mode: "github",
      },
    };
  }
  if (url.pathname === "/api/status" && method === "GET") {
    return store.status();
  }
  if (url.pathname === "/api/template/status" && method === "GET") {
    return store.templateStatus();
  }
  if (url.pathname === "/api/template/update" && method === "POST") {
    const result = await store.updateTemplate();
    invalidateLibraryCache();
    return result;
  }
  if (url.pathname === "/api/duplicates" && method === "GET") {
    const library = await githubLibrary(true);
    const groups = findDuplicateGroups(library.records);
    return {
      groups,
      recordCount: library.records.length,
      groupCount: groups.length,
      confirmedCount: groups.filter(
        (group) => group.severity === "confirmed",
      ).length,
    };
  }
  if (url.pathname === "/api/catalog" && method === "GET") {
    const library = await githubLibrary();
    const payload = await getCatalogStore().search(
      {
        query: url.searchParams.get("q") ?? "",
        year: url.searchParams.get("year") ?? "",
        source: url.searchParams.get("source") ?? "",
        offset: url.searchParams.get("offset") ?? "0",
        limit: url.searchParams.get("limit") ?? "30",
        refresh: url.searchParams.get("refresh") === "1",
      },
      library.index,
    );
    return payload;
  }
  if (url.pathname === "/api/catalog/bulk" && method === "POST") {
    const body = parseBody(options);
    const selections = Array.isArray(body.items) ? body.items : [];
    if (!selections.length) {
      throw new Error("没有选择要添加的番剧");
    }
    if (selections.length > 100) {
      throw new Error("单次最多添加 100 部番剧");
    }
    const uniqueIds = [
      ...new Set(
        selections
          .map((selection) => cleanString(selection?.id))
          .filter(Boolean),
      ),
    ];
    const catalogItems = await getCatalogStore().getItems(uniqueIds);
    const byId = new Map(catalogItems.map((item) => [item.id, item]));
    const missing = selections
      .filter((selection) => !byId.has(cleanString(selection?.id)))
      .map((selection) => ({
        catalogId: cleanString(selection?.id) || null,
        title: cleanString(selection?.title) || "未知候选",
        reason: "catalog-not-found",
        message: "全量索引中已找不到该候选",
      }));
    const entries = selections
      .map((selection) => {
        const item = byId.get(cleanString(selection?.id));
        return item ? { item, ...selection } : null;
      })
      .filter(Boolean);
    const result = await store.addCatalogRecords(entries);
    invalidateLibraryCache();
    return {
      ...result,
      skipped: [...missing, ...(result.skipped ?? [])],
      backupLimit: result.config?.backupLimit,
      sync:
        body.sync && result.addedRecords?.length
          ? {
              commit: result.commitShort ?? result.commit ?? "",
              branch: settings.branch,
            }
          : null,
      syncError: null,
    };
  }
  if (url.pathname.startsWith("/api/records/") && method === "PUT") {
    const recordId = decodeURIComponent(
      url.pathname.slice("/api/records/".length),
    );
    const result = await store.saveRecord(recordId, parseBody(options));
    invalidateLibraryCache();
    return result;
  }
  if (url.pathname === "/api/records" && method === "DELETE") {
    const result = await store.deleteRecords(parseBody(options).ids);
    invalidateLibraryCache();
    return result;
  }
  if (url.pathname === "/api/sync" && method === "POST") {
    return store.sync(parseBody(options).message);
  }
  throw new Error(`在线管理不支持接口：${url.pathname}`);
}

export function api(path, options = {}) {
  return mode === "local" ? localApi(path, options) : onlineApi(path, options);
}

export function getRuntime() {
  return {
    mode,
    repository: settings.repository,
    branch: settings.branch,
    writable: mode === "local" || Boolean(token),
  };
}

export function refreshRuntimeLibrary() {
  invalidateLibraryCache();
}

renderRuntime();

elements.connectionButton?.addEventListener("click", openConnectionDialog);
elements.connectionClose?.addEventListener("click", closeConnectionDialog);
elements.connectionCancel?.addEventListener("click", closeConnectionDialog);
elements.connectionDisconnect?.addEventListener("click", disconnectToken);
elements.connectionForm?.addEventListener("submit", saveConnection);
elements.connectionDialog?.addEventListener("click", (event) => {
  if (event.target === elements.connectionDialog) {
    closeConnectionDialog();
  }
});
