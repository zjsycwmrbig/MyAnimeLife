import {
  api,
  getRuntime,
  refreshRuntimeLibrary,
} from "./runtime.js";
import { TEMPLATE_REPOSITORY } from "./template-updater.js";
import {
  getPaginationState,
  renderPagination,
} from "./pagination.js";
import { createRatingControl } from "./rating-control.js";
import { resolveCatalogCovers } from "./cover-cache.js";

const MAX_BATCH_SIZE = 100;

const state = {
  view: "library",
  catalogLoaded: false,
  loading: false,
  busy: false,
  items: [],
  total: 0,
  page: 1,
  pageSize: 30,
  layout: "list",
  query: "",
  year: "",
  source: "",
  facetsLoaded: false,
  selectedItems: new Map(),
  drafts: new Map(),
  dirty: false,
};

const elements = {
  switchButtons: [...document.querySelectorAll("[data-view]")],
  libraryWorkspace: document.querySelector("#libraryWorkspace"),
  catalogWorkspace: document.querySelector("#catalogWorkspace"),
  duplicateWorkspace: document.querySelector("#duplicateWorkspace"),
  aboutWorkspace: document.querySelector("#aboutWorkspace"),
  catalogSearch: document.querySelector("#catalogSearch"),
  catalogYear: document.querySelector("#catalogYear"),
  catalogSource: document.querySelector("#catalogSource"),
  catalogRefresh: document.querySelector("#catalogRefresh"),
  catalogRows: document.querySelector("#catalogRows"),
  catalogTable: document.querySelector("#catalogTable"),
  catalogCards: document.querySelector("#catalogCards"),
  catalogCount: document.querySelector("#catalogCount"),
  catalogStatus: document.querySelector("#catalogStatus"),
  catalogSourceSummary: document.querySelector("#catalogSourceSummary"),
  catalogSourceVersion: document.querySelector("#catalogSourceVersion"),
  catalogSourceCheckedAt: document.querySelector("#catalogSourceCheckedAt"),
  catalogSourceLicense: document.querySelector("#catalogSourceLicense"),
  catalogResultLabel: document.querySelector("#catalogResultLabel"),
  catalogSelectionLabel: document.querySelector("#catalogSelectionLabel"),
  catalogClearSelection: document.querySelector("#catalogClearSelection"),
  catalogSelectAll: document.querySelector("#catalogSelectAll"),
  catalogEmpty: document.querySelector("#catalogEmpty"),
  catalogEmptyTitle: document.querySelector("#catalogEmptyTitle"),
  catalogEmptyText: document.querySelector("#catalogEmptyText"),
  catalogPagination: document.querySelector("#catalogPagination"),
  catalogPageSummary: document.querySelector("#catalogPageSummary"),
  catalogPageButtons: document.querySelector("#catalogPageButtons"),
  catalogPageSize: document.querySelector("#catalogPageSize"),
  catalogPageSizeCustom: document.querySelector("#catalogPageSizeCustom"),
  catalogPreviousPage: document.querySelector("#catalogPreviousPage"),
  catalogNextPage: document.querySelector("#catalogNextPage"),
  catalogEditorEmpty: document.querySelector("#catalogEditorEmpty"),
  catalogBatchForm: document.querySelector("#catalogBatchForm"),
  catalogSelectionBadge: document.querySelector("#catalogSelectionBadge"),
  catalogSelectionList: document.querySelector("#catalogSelectionList"),
  catalogSaveButton: document.querySelector("#catalogSaveButton"),
  catalogSyncButton: document.querySelector("#catalogSyncButton"),
  toast: document.querySelector("#toast"),
  templateUpdateBadge: document.querySelector("#templateUpdateBadge"),
  templateRepositoryLink: document.querySelector("#templateRepositoryLink"),
  aboutTargetRepository: document.querySelector("#aboutTargetRepository"),
  templateCommitLabel: document.querySelector("#templateCommitLabel"),
  templateCommitMessage: document.querySelector("#templateCommitMessage"),
  templateCommitMeta: document.querySelector("#templateCommitMeta"),
  templateCommitLink: document.querySelector("#templateCommitLink"),
  templateUpdateStatus: document.querySelector("#templateUpdateStatus"),
  templateCheckButton: document.querySelector("#templateCheckButton"),
  templateUpdateButton: document.querySelector("#templateUpdateButton"),
};

let searchTimer = null;
let toastTimer = null;
let requestSequence = 0;
let templateBusy = false;

function showToast(message, options = {}) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", Boolean(options.error));
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(
    () => elements.toast.classList.remove("is-visible"),
    options.duration ?? 3600,
  );
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function seasonText(season) {
  if (season?.label) {
    return season.label;
  }
  if (season?.number) {
    return `第${season.number}季`;
  }
  return "季度未标注";
}

function itemMeta(item) {
  return [
    item.year || "年份未知",
    seasonText(item.season),
    item.sources.map((source) => source.label).join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");
}

function createDraft(item) {
  return {
    title: item.displayTitle,
    rating: null,
    review: "",
    note: "",
  };
}

function renderBatchActions() {
  const count = state.selectedItems.size;
  const writable = getRuntime().writable;
  const disabled = state.busy || count === 0 || !writable;
  const online = getRuntime().mode === "github";
  elements.catalogSaveButton.disabled = disabled;
  elements.catalogSyncButton.disabled = disabled;
  elements.catalogSyncButton.hidden = online;
  const suffix = state.dirty ? " *" : "";
  elements.catalogSaveButton.textContent = state.busy
    ? "正在写入"
    : !writable
      ? "填写 Token 后可编辑"
    : online
      ? `加入并提交 ${count} 部${suffix}`
      : `加入 ${count} 部到本地${suffix}`;
  elements.catalogSyncButton.textContent = state.busy
    ? "正在同步"
    : `加入并同步${suffix}`;
  elements.catalogSaveButton.classList.toggle("is-loading", state.busy);
  elements.catalogSyncButton.classList.toggle("is-loading", state.busy);
}

function setDirty(dirty) {
  state.dirty = dirty;
  renderBatchActions();
}

function confirmCatalogDiscard() {
  return (
    !state.dirty ||
    window.confirm("当前填写的评分或评价尚未加入本地，确定放弃吗？")
  );
}

function requestLibraryDiscard() {
  const detail = { allowed: false };
  window.dispatchEvent(
    new CustomEvent("anime-editor:request-close", { detail }),
  );
  return detail.allowed;
}

function resetSelectionState() {
  state.selectedItems.clear();
  state.drafts.clear();
  state.dirty = false;
  renderCatalogRows();
  renderBatchEditor();
}

function activateView(view, options = {}) {
  if (view === state.view) {
    return;
  }
  if (!options.force) {
    if (
      state.view === "library" &&
      view !== "library" &&
      !requestLibraryDiscard()
    ) {
      return;
    }
    if (
      state.view === "catalog" &&
      view !== "catalog" &&
      !confirmCatalogDiscard()
    ) {
      return;
    }
  }
  if (state.view === "library" && view !== "library") {
    window.dispatchEvent(new CustomEvent("anime-editor:discard"));
  }
  if (state.view === "catalog" && view !== "catalog" && state.dirty) {
    state.selectedItems.clear();
    state.drafts.clear();
    state.dirty = false;
  }
  state.view = view;
  for (const button of elements.switchButtons) {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  elements.libraryWorkspace.hidden = view !== "library";
  elements.catalogWorkspace.hidden = view !== "catalog";
  elements.duplicateWorkspace.hidden = view !== "duplicates";
  elements.aboutWorkspace.hidden = view !== "about";
  if (view === "catalog") {
    renderBatchEditor();
    if (!state.catalogLoaded) {
      loadCatalog();
    }
  }
  if (view === "duplicates") {
    window.dispatchEvent(new CustomEvent("anime-duplicates:activate"));
  }
  if (view === "about") {
    renderAbout();
    checkTemplate(false);
  }
}

function renderAbout() {
  const runtime = getRuntime();
  elements.templateRepositoryLink.href = `https://github.com/${TEMPLATE_REPOSITORY}`;
  elements.templateRepositoryLink.textContent = TEMPLATE_REPOSITORY;
  elements.aboutTargetRepository.textContent = runtime.repository || "尚未连接";
  const writable = runtime.mode === "github" && runtime.writable;
  elements.templateCheckButton.disabled = templateBusy;
  elements.templateUpdateButton.disabled = templateBusy || !writable;
  if (runtime.mode === "local") {
    elements.templateUpdateStatus.textContent =
      "当前是本地管理模式，代码更新请在仓库目录中执行 Git 更新；GitHub Pages 版可以在这里直接拉取。";
    elements.templateUpdateBadge.textContent = "本地模式";
  } else if (!runtime.writable) {
    if (elements.templateCommitLabel.textContent === "尚未检查") {
      elements.templateUpdateStatus.textContent = "当前为只读模式。填写有 Contents: Read and write 权限的 Token 后才可以更新。";
      elements.templateUpdateBadge.textContent = "需要 Token";
    }
  }
}

async function checkTemplate(showMessage = true) {
  if (templateBusy || getRuntime().mode === "local") {
    renderAbout();
    return;
  }
  templateBusy = true;
  renderAbout();
  elements.templateUpdateStatus.textContent = "正在读取模板仓库版本...";
  try {
    const status = await api("/api/template/status");
    elements.templateCommitLabel.textContent = status.commitShort;
    elements.templateCommitMessage.textContent = status.commitMessage || "无提交说明";
    elements.templateCommitMeta.textContent = [
      status.commitAuthor,
      status.commitDate ? formatDate(status.commitDate) : "时间未知",
    ].filter(Boolean).join(" · ");
    elements.templateCommitLink.href = status.commitUrl;
    elements.templateUpdateBadge.textContent = `最新 ${status.commitShort}`;
    elements.templateUpdateStatus.textContent = `模板 main 分支当前提交为 ${status.commitShort}：${status.commitMessage}。确认后可以拉取到当前数据仓库。`;
    if (showMessage) {
      showToast(`模板版本 ${status.commitShort}`);
    }
  } catch (error) {
    elements.templateUpdateBadge.textContent = "检查失败";
    elements.templateUpdateStatus.textContent = error.message;
    if (showMessage) {
      showToast(error.message, { error: true });
    }
  } finally {
    templateBusy = false;
    renderAbout();
  }
}

async function updateTemplate() {
  if (templateBusy || getRuntime().mode === "local" || !getRuntime().writable) {
    return;
  }
  const confirmed = window.confirm(
    "确定从 MyAnimeLife 模板更新吗？整个 data/ 目录会保留，但其他所有文件会被模板覆盖；你自行修改的页面、配置、工作流和脚本可能丢失。请确认已经备份或推送这些修改。",
  );
  if (!confirmed) {
    return;
  }
  templateBusy = true;
  renderAbout();
  elements.templateUpdateStatus.textContent = "正在拉取模板文件并创建提交，请不要关闭页面...";
  try {
    const result = await api("/api/template/update", {
      method: "POST",
      body: JSON.stringify({}),
    });
    elements.templateCommitLabel.textContent = result.templateCommit.slice(0, 7);
    elements.templateCommitMessage.textContent = result.templateCommitMessage || "无提交说明";
    elements.templateCommitMeta.textContent = [
      result.templateCommitAuthor,
      result.templateCommitDate ? formatDate(result.templateCommitDate) : "时间未知",
    ].filter(Boolean).join(" · ");
    elements.templateCommitLink.href = result.templateCommitUrl || elements.templateCommitLink.href;
    elements.templateUpdateBadge.textContent = `已更新 ${result.commitShort}`;
    elements.templateUpdateStatus.textContent = `更新完成：保留 ${result.preservedDataFiles} 个数据文件，更新 ${result.updatedFiles} 个文件，移除 ${result.removedFiles} 个旧文件。刷新页面后加载最新管理页。`;
    showToast(`管理页已更新，提交 ${result.commitShort}`, { duration: 7000 });
  } catch (error) {
    elements.templateUpdateStatus.textContent = error.message;
    showToast(error.message, { error: true, duration: 8000 });
  } finally {
    templateBusy = false;
    renderAbout();
  }
}

function populateFacets(facets) {
  if (state.facetsLoaded || !facets) {
    return;
  }
  for (const year of facets.years ?? []) {
    const option = document.createElement("option");
    option.value = String(year.value);
    option.textContent = `${year.value} · ${year.count}`;
    elements.catalogYear.append(option);
  }
  for (const source of facets.sources ?? []) {
    const option = document.createElement("option");
    option.value = source.value;
    option.textContent = `${source.label} · ${source.count}`;
    elements.catalogSource.append(option);
  }
  state.facetsLoaded = true;
}

function createLoadingSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("catalog-cover-loader");
  svg.setAttribute("viewBox", "0 0 32 32");
  svg.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "16");
  circle.setAttribute("cy", "16");
  circle.setAttribute("r", "10");
  circle.setAttribute("fill", "none");
  circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-width", "3");
  circle.setAttribute("stroke-linecap", "round");
  circle.setAttribute("stroke-dasharray", "42 21");
  svg.append(circle);
  return svg;
}

function createCover(item, options = {}) {
  const cover = document.createElement("span");
  cover.className = "catalog-row-cover";
  const fallback = document.createElement("span");
  fallback.className = "catalog-row-fallback";
  fallback.textContent = [...item.displayTitle][0] ?? "A";
  cover.append(fallback);
  if (options.loading) {
    cover.append(createLoadingSvg());
  }
  if (item.coverUrl) {
    const image = document.createElement("img");
    image.src = item.coverUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove(), { once: true });
    cover.append(image);
  }
  return cover;
}

function toggleSelection(item) {
  if (!getRuntime().writable) {
    showToast("当前为只读模式，请先连接 GitHub Token", { error: true });
    return;
  }
  if (item.ownedRecordId) {
    showToast(`《${item.displayTitle}》已经在本地档案中`);
    return;
  }
  if (state.selectedItems.has(item.id)) {
    state.selectedItems.delete(item.id);
    state.drafts.delete(item.id);
  } else {
    if (state.selectedItems.size >= MAX_BATCH_SIZE) {
      showToast(`单次最多选择 ${MAX_BATCH_SIZE} 部番剧`, { error: true });
      return;
    }
    state.selectedItems.set(item.id, item);
    state.drafts.set(item.id, createDraft(item));
    void hydrateSelectedCover(item);
  }
  state.dirty = false;
  renderCatalogRows();
  renderBatchEditor();
}

function createCatalogCard(item) {
  const card = document.createElement("article");
  card.className = "catalog-card";
  card.tabIndex = 0;
  card.classList.toggle("is-selected", state.selectedItems.has(item.id));
  card.classList.toggle("is-owned", Boolean(item.ownedRecordId));

  card.append(createCover(item, {
    loading: Boolean(item.sites?.bangumi && !item.coverUrl && !item.coverResolved),
  }));

  const body = document.createElement("div");
  body.className = "catalog-card-body";
  const top = document.createElement("div");
  top.className = "catalog-card-top";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.selectedItems.has(item.id);
  checkbox.disabled = Boolean(item.ownedRecordId) || !getRuntime().writable;
  checkbox.setAttribute(
    "aria-label",
    item.ownedRecordId ? `${item.displayTitle} 已收录` : `选择 ${item.displayTitle}`,
  );
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", () => toggleSelection(item));
  top.append(checkbox);
  if (item.ownedRecordId) {
    const owned = document.createElement("span");
    owned.className = "owned-badge";
    owned.textContent = "已收录";
    top.append(owned);
  }
  body.append(top);

  const title = document.createElement("h3");
  title.textContent = item.displayTitle;
  body.append(title);
  const alternate = item.title !== item.displayTitle
    ? item.title
    : item.names.find((name) => name !== item.displayTitle) ?? "";
  const subtitle = document.createElement("span");
  subtitle.className = "catalog-card-subtitle";
  subtitle.textContent = alternate;
  body.append(subtitle);
  const meta = document.createElement("span");
  meta.className = "catalog-card-meta";
  meta.textContent = itemMeta(item);
  body.append(meta);
  card.append(body);

  const select = () => toggleSelection(item);
  card.addEventListener("click", select);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  });
  return card;
}

function createCatalogRow(item) {
  const row = document.createElement("tr");
  row.className = "record-row catalog-row";
  row.tabIndex = 0;
  const picked = state.selectedItems.has(item.id);
  row.classList.toggle("is-selected", picked);
  row.classList.toggle("is-owned", Boolean(item.ownedRecordId));

  const checkCell = document.createElement("td");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = picked;
  checkbox.disabled = Boolean(item.ownedRecordId) || !getRuntime().writable;
  checkbox.setAttribute(
    "aria-label",
    item.ownedRecordId
      ? `${item.displayTitle} 已收录`
      : `选择 ${item.displayTitle}`,
  );
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", () => toggleSelection(item));
  checkCell.append(checkbox);
  row.append(checkCell);

  const titleCell = document.createElement("td");
  titleCell.className = "catalog-title-cell";
  const work = document.createElement("div");
  work.className = "catalog-work";
  work.append(createCover(item, {
    loading: Boolean(item.sites?.bangumi && !item.coverUrl && !item.coverResolved),
  }));
  const copy = document.createElement("div");
  copy.className = "catalog-work-copy";
  const titleLine = document.createElement("div");
  titleLine.className = "catalog-title-line";
  const title = document.createElement("span");
  title.className = "record-title";
  title.textContent = item.displayTitle;
  titleLine.append(title);
  if (item.ownedRecordId) {
    const owned = document.createElement("span");
    owned.className = "owned-badge";
    owned.textContent = "已收录";
    titleLine.append(owned);
  }
  const alternate =
    item.title !== item.displayTitle
      ? item.title
      : item.names.find((name) => name !== item.displayTitle) ?? "";
  const subtitle = document.createElement("span");
  subtitle.className = "record-subtitle";
  subtitle.textContent = alternate;
  copy.append(titleLine, subtitle);
  work.append(copy);
  titleCell.append(work);
  row.append(titleCell);

  const yearCell = document.createElement("td");
  yearCell.className = "catalog-year";
  yearCell.textContent = item.year ? String(item.year) : "未知";
  row.append(yearCell);

  const sourcesCell = document.createElement("td");
  sourcesCell.className = "catalog-sources";
  for (const source of item.sources) {
    const badge = document.createElement("span");
    badge.textContent = source.label;
    sourcesCell.append(badge);
  }
  if (!item.sources.length) {
    sourcesCell.textContent = "标题索引";
  }
  row.append(sourcesCell);

  const select = () => toggleSelection(item);
  row.addEventListener("click", select);
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  });
  return row;
}

function renderSelectionSummary() {
  const count = state.selectedItems.size;
  const selectable = state.items.filter((item) => !item.ownedRecordId);
  const selectedVisible = selectable.filter((item) =>
    state.selectedItems.has(item.id),
  ).length;
  elements.catalogSelectionLabel.textContent = `已选择 ${count} 部`;
  elements.catalogSelectionBadge.textContent = `已选择 ${count} 部`;
  elements.catalogClearSelection.disabled = state.busy || count === 0;
  elements.catalogSelectAll.checked =
    selectable.length > 0 && selectedVisible === selectable.length;
  elements.catalogSelectAll.indeterminate =
    selectedVisible > 0 && selectedVisible < selectable.length;
  elements.catalogSelectAll.disabled =
    state.busy || !getRuntime().writable || selectable.length === 0;
  renderBatchActions();
}

function renderCatalogRows() {
  const pageInfo = getPaginationState(
    state.total,
    state.pageSize,
    state.page,
  );
  elements.catalogTable.hidden = state.layout !== "list";
  elements.catalogCards.hidden = state.layout !== "cards";
  state.page = pageInfo.page;
  elements.catalogRows.replaceChildren(
    ...(state.layout === "list" ? state.items.map(createCatalogRow) : []),
  );
  elements.catalogCards.replaceChildren();
  if (state.layout === "cards") {
    elements.catalogCards.append(...state.items.map(createCatalogCard));
  }
  elements.catalogCount.textContent = state.total
    ? state.total.toLocaleString("zh-CN")
    : "0";
  elements.catalogResultLabel.textContent = state.loading
    ? "正在读取索引"
    : state.total
      ? `匹配 ${state.total.toLocaleString("zh-CN")} 条 · 第 ${state.page} / ${pageInfo.pageCount} 页 · 本页 ${state.items.length} 条`
      : "匹配 0 条";
  elements.catalogEmpty.hidden = state.loading || state.items.length > 0;
  if (!state.items.length && !state.loading) {
    elements.catalogEmptyTitle.textContent = "没有匹配的索引";
    elements.catalogEmptyText.textContent = "换一个标题或调整筛选条件。";
  }
  renderPagination(
    {
      nav: elements.catalogPagination,
      summary: elements.catalogPageSummary,
      pages: elements.catalogPageButtons,
      previous: elements.catalogPreviousPage,
      next: elements.catalogNextPage,
    },
    {
      totalItems: state.total,
      pageSize: state.pageSize,
      page: state.page,
      loading: state.loading,
      onSelect: (page) => {
        state.page = page;
        loadCatalog();
      },
    },
  );
  renderSelectionSummary();
}

async function hydrateVisibleCovers(sequence) {
  try {
    await hydrateCatalogCovers(state.items);
    if (sequence !== requestSequence) {
      return;
    }
    renderCatalogRows();
    if (state.selectedItems.size) {
      renderBatchEditor();
    }
  } catch {
    // A cover service failure leaves the title fallback in place.
  }
}

async function hydrateCatalogCovers(items) {
  try {
    const covers = await resolveCatalogCovers(items);
    for (const item of items) {
      const coverUrl = covers.get(item.id);
      if (coverUrl) {
        item.coverUrl = coverUrl;
      }
      if (item.sites?.bangumi && !item.coverUrl) {
        item.coverResolved = true;
      }
    }
  } catch {
    // Cover lookup is optional; records can still be saved with a title fallback.
  }
}

async function hydrateSelectedCover(item) {
  if (item.coverUrl || !item.sites?.bangumi) {
    return;
  }
  await hydrateCatalogCovers([item]);
  if (state.selectedItems.has(item.id)) {
    renderCatalogRows();
    renderBatchEditor();
  }
}

function renderCatalogSource(meta = {}) {
  const version = meta.version || "未知版本";
  elements.catalogSourceSummary.textContent = `bangumi-data ${version} · 当前默认`;
  elements.catalogSourceVersion.textContent = version;
  elements.catalogSourceCheckedAt.textContent = meta.checkedAt
    ? formatDate(meta.checkedAt)
    : "尚未检查";
  elements.catalogSourceLicense.textContent = meta.license || "CC BY 4.0";
}

async function loadCatalog(options = {}) {
  state.loading = true;
  const sequence = ++requestSequence;
  const requestedPage = state.page;
  elements.catalogRefresh.classList.add("is-loading");
  elements.catalogRefresh.disabled = true;
  elements.catalogStatus.textContent =
    "正在检查索引；首次使用需要下载并建立本地缓存";
  renderCatalogRows();

  const offset = (state.page - 1) * state.pageSize;
  const params = new URLSearchParams({
    limit: String(state.pageSize),
    offset: String(offset),
  });
  if (state.query) {
    params.set("q", state.query);
  }
  if (state.year) {
    params.set("year", state.year);
  }
  if (state.source) {
    params.set("source", state.source);
  }
  if (options.refresh) {
    params.set("refresh", "1");
  }

  try {
    const payload = await api(`/api/catalog?${params}`);
    if (sequence !== requestSequence) {
      return;
    }
    const pageInfo = getPaginationState(
      payload.total ?? 0,
      state.pageSize,
      requestedPage,
    );
    if (requestedPage > pageInfo.pageCount) {
      state.page = pageInfo.page;
      state.loading = false;
      elements.catalogRefresh.classList.remove("is-loading");
      elements.catalogRefresh.disabled = false;
      loadCatalog(options);
      return;
    }
    state.catalogLoaded = true;
    state.total = payload.total ?? 0;
    state.page = pageInfo.page;
    state.items = payload.items ?? [];
    populateFacets(payload.facets);
    renderCatalogSource(payload.meta);
    elements.catalogStatus.textContent = [
      `已加载第 ${state.page} 页`,
      `本页 ${state.items.length} 条`,
      "浏览器本地缓存 24 小时内复用",
    ]
      .filter(Boolean)
      .join(" · ");
    if (options.refresh) {
      showToast("全量索引已检查");
    }
    void hydrateVisibleCovers(sequence);
  } catch (error) {
    if (sequence !== requestSequence) {
      return;
    }
    elements.catalogStatus.textContent = error.message;
    state.items = [];
    state.total = 0;
    elements.catalogEmptyTitle.textContent = "索引加载失败";
    elements.catalogEmptyText.textContent =
      "请检查网络后重新点击“检查索引更新”。";
    showToast(error.message, { error: true, duration: 7000 });
  } finally {
    if (sequence === requestSequence) {
      state.loading = false;
      elements.catalogRefresh.classList.remove("is-loading");
      elements.catalogRefresh.disabled = false;
      renderCatalogRows();
    }
  }
}

function createDraftRow(item) {
  const draft = state.drafts.get(item.id) ?? createDraft(item);
  const section = document.createElement("section");
  section.className = "catalog-draft";
  section.dataset.catalogId = item.id;

  const heading = document.createElement("div");
  heading.className = "catalog-draft-heading";
  heading.append(createCover(item, {
    loading: Boolean(item.sites?.bangumi && !item.coverUrl && !item.coverResolved),
  }));
  const copy = document.createElement("div");
  copy.className = "catalog-draft-copy";
  const title = document.createElement("strong");
  title.textContent = item.displayTitle;
  const meta = document.createElement("span");
  meta.textContent = itemMeta(item);
  copy.append(title, meta);
  heading.append(copy);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "text-button catalog-draft-remove";
  removeButton.textContent = "移除";
  removeButton.addEventListener("click", () => toggleSelection(item));
  heading.append(removeButton);
  section.append(heading);

  const fields = document.createElement("div");
  fields.className = "catalog-draft-fields";
  const ratingField = document.createElement("div");
  ratingField.className = "field catalog-draft-rating";
  const ratingControl = createRatingControl({
    value: draft.rating,
    disabled: !getRuntime().writable,
    onChange: (rating) => {
      draft.rating = rating;
      setDirty(true);
    },
  });
  ratingField.append(ratingControl.element);

  const reviewLabel = document.createElement("label");
  reviewLabel.className = "field catalog-draft-review";
  const reviewText = document.createElement("span");
  reviewText.textContent = "短评 / 评价";
  const review = document.createElement("textarea");
  review.maxLength = 20000;
  review.rows = 3;
  review.placeholder = "写下简短的观看感受或完整评价";
  review.value = draft.review;
  review.disabled = !getRuntime().writable;
  review.addEventListener("input", () => {
    draft.review = review.value;
    setDirty(true);
  });
  reviewLabel.append(reviewText, review);

  const noteLabel = document.createElement("label");
  noteLabel.className = "field catalog-draft-note";
  const noteText = document.createElement("span");
  noteText.textContent = "备注";
  const note = document.createElement("textarea");
  note.maxLength = 5000;
  note.rows = 2;
  note.placeholder = "内部备注";
  note.value = draft.note;
  note.disabled = !getRuntime().writable;
  note.addEventListener("input", () => {
    draft.note = note.value;
    setDirty(true);
  });
  noteLabel.append(noteText, note);

  fields.append(ratingField, reviewLabel, noteLabel);
  section.append(fields);

  const details = document.createElement("details");
  details.className = "catalog-draft-extra";
  const summary = document.createElement("summary");
  summary.textContent = "自定义展示标题";
  details.append(summary);

  const titleLabel = document.createElement("label");
  titleLabel.className = "field";
  const titleText = document.createElement("span");
  titleText.textContent = "展示标题";
  const titleInput = document.createElement("input");
  titleInput.maxLength = 200;
  titleInput.value = draft.title;
  titleInput.disabled = !getRuntime().writable;
  titleInput.addEventListener("input", () => {
    draft.title = titleInput.value;
    setDirty(true);
  });
  titleLabel.append(titleText, titleInput);
  details.append(titleLabel);
  section.append(details);

  const source = document.createElement("span");
  source.className = "catalog-draft-id";
  source.textContent = item.id;
  section.append(source);
  return section;
}

function renderBatchEditor() {
  const items = [...state.selectedItems.values()].reverse();
  elements.catalogEditorEmpty.hidden = items.length > 0;
  elements.catalogBatchForm.hidden = items.length === 0;
  if (!items.length) {
    elements.catalogSelectionList.replaceChildren();
    renderSelectionSummary();
    return;
  }
  elements.catalogSelectionList.replaceChildren(
    ...items.map(createDraftRow),
  );
  renderSelectionSummary();
}

function clearSelection() {
  if (!confirmCatalogDiscard()) {
    return;
  }
  resetSelectionState();
}

function skippedSummary(skipped) {
  if (!skipped.length) {
    return "";
  }
  const reasons = new Map();
  for (const item of skipped) {
    reasons.set(item.reason, (reasons.get(item.reason) ?? 0) + 1);
  }
  const labels = {
    "catalog-not-found": "索引失效",
    "batch-duplicate": "批次重复",
    "existing-record-id": "已存在",
    "existing-external-id": "站点 ID 已存在",
    "batch-external-id": "批次站点重复",
    "invalid-item": "候选无效",
  };
  return [...reasons.entries()]
    .map(([reason, count]) => `${labels[reason] ?? reason} ${count}`)
    .join("，");
}

async function submitBatch(sync) {
  if (state.busy || !state.selectedItems.size) {
    return;
  }
  if (!getRuntime().writable) {
    showToast("当前为只读模式，请先连接 GitHub Token", { error: true });
    return;
  }
  const selectedItems = [...state.selectedItems.values()];
  state.busy = true;
  renderSelectionSummary();
  try {
    // Wait for lazy Bangumi covers so a successful lookup is persisted with the record.
    await hydrateCatalogCovers(selectedItems);
    const items = selectedItems.map((item) => {
      const draft = state.drafts.get(item.id) ?? createDraft(item);
      return {
        id: item.id,
        title: draft.title,
        rating: draft.rating,
        review: draft.review,
        note: draft.note,
        coverUrl: item.coverUrl ?? null,
      };
    });
    const payload = await api("/api/catalog/bulk", {
      method: "POST",
      body: JSON.stringify({ items, sync }),
    });
    const addedCount = payload.addedRecords?.length ?? 0;
    const skippedText = skippedSummary(payload.skipped ?? []);
    if (!addedCount) {
      showToast(
        skippedText
          ? `没有新增记录：${skippedText}`
          : "没有新增记录",
        { error: true, duration: 6500 },
      );
      return;
    }

    const resultText = [
      `已加入 ${addedCount} 部`,
      skippedText ? `跳过 ${payload.skipped.length} 部（${skippedText}）` : "",
      payload.sync?.commit ? `已同步 ${payload.sync.commit}` : "",
      payload.syncError ? `同步失败：${payload.syncError}` : "",
    ]
      .filter(Boolean)
      .join("；");
    state.selectedItems.clear();
    state.drafts.clear();
    state.dirty = false;
    window.dispatchEvent(
      new CustomEvent("anime-library:changed", {
        detail: {
          selectId: payload.addedRecords[0]?.id ?? null,
        },
      }),
    );
    activateView("library", { force: true });
    showToast(resultText, {
      error: Boolean(payload.syncError),
      duration: payload.syncError ? 8000 : 5000,
    });
  } catch (error) {
    showToast(error.message, { error: true, duration: 7000 });
  } finally {
    state.busy = false;
    renderSelectionSummary();
  }
}

for (const button of elements.switchButtons) {
  button.addEventListener("click", () => {
    activateView(button.dataset.view);
  });
}

elements.templateCheckButton.addEventListener("click", () => checkTemplate(true));
elements.templateUpdateButton.addEventListener("click", updateTemplate);

elements.catalogSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = elements.catalogSearch.value.trim();
    state.page = 1;
    loadCatalog();
  }, 260);
});

for (const select of [elements.catalogYear, elements.catalogSource]) {
  select.addEventListener("change", () => {
    state.year = elements.catalogYear.value;
    state.source = elements.catalogSource.value;
    state.page = 1;
    loadCatalog();
  });
}

elements.catalogRefresh.addEventListener("click", () => {
  loadCatalog({ refresh: true });
});

elements.catalogPageSize.addEventListener("change", () => {
  if (elements.catalogPageSize.value === "custom") {
    elements.catalogPageSizeCustom.hidden = false;
    elements.catalogPageSizeCustom.value = String(state.pageSize);
    elements.catalogPageSizeCustom.focus();
  } else {
    elements.catalogPageSizeCustom.hidden = true;
    state.pageSize = Number(elements.catalogPageSize.value);
  }
  state.page = 1;
  loadCatalog();
});

elements.catalogPageSizeCustom.addEventListener("change", () => {
  const pageSize = Number(elements.catalogPageSizeCustom.value);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    showToast("自定义每页数量必须是 1 到 200 的整数", { error: true });
    elements.catalogPageSizeCustom.value = String(state.pageSize);
    return;
  }
  state.pageSize = pageSize;
  state.page = 1;
  loadCatalog();
});

for (const button of document.querySelectorAll('[data-layout-target="catalog"]')) {
  button.addEventListener("click", () => {
    state.layout = button.dataset.layout;
    for (const candidate of document.querySelectorAll('[data-layout-target="catalog"]')) {
      candidate.classList.toggle("is-active", candidate === button);
      candidate.setAttribute("aria-pressed", String(candidate === button));
    }
    renderCatalogRows();
  });
}

elements.catalogPreviousPage.addEventListener("click", () => {
  state.page = Math.max(1, state.page - 1);
  loadCatalog();
});

elements.catalogNextPage.addEventListener("click", () => {
  state.page += 1;
  loadCatalog();
});

elements.catalogClearSelection.addEventListener("click", clearSelection);

elements.catalogSelectAll.addEventListener("change", () => {
  const selectable = state.items.filter((item) => !item.ownedRecordId);
  if (elements.catalogSelectAll.checked) {
    for (const item of selectable) {
      if (state.selectedItems.size >= MAX_BATCH_SIZE) {
        showToast(`单次最多选择 ${MAX_BATCH_SIZE} 部番剧`, { error: true });
        break;
      }
      if (!state.selectedItems.has(item.id)) {
        state.selectedItems.set(item.id, item);
        state.drafts.set(item.id, createDraft(item));
        void hydrateSelectedCover(item);
      }
    }
  } else {
    for (const item of selectable) {
      state.selectedItems.delete(item.id);
      state.drafts.delete(item.id);
    }
  }
  state.dirty = false;
  renderCatalogRows();
  renderBatchEditor();
});

elements.catalogBatchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitBatch(false);
});

elements.catalogSyncButton.addEventListener("click", () => {
  submitBatch(true);
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("anime-runtime:changed", () => {
  refreshRuntimeLibrary();
  if (!getRuntime().writable) {
    state.selectedItems.clear();
    state.drafts.clear();
    state.dirty = false;
  }
  state.catalogLoaded = false;
  state.items = [];
  state.total = 0;
  state.page = 1;
  state.facetsLoaded = false;
  for (const select of [elements.catalogYear, elements.catalogSource]) {
    while (select.options.length > 1) {
      select.options.remove(1);
    }
    select.value = "";
  }
  if (state.view === "catalog") {
    loadCatalog();
  }
  renderBatchEditor();
});
