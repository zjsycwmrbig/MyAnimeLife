import {
  api,
  getRuntime,
  refreshRuntimeLibrary,
} from "./runtime.js";

const MAX_BATCH_SIZE = 100;

const state = {
  view: "library",
  catalogLoaded: false,
  loading: false,
  busy: false,
  items: [],
  total: 0,
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
  catalogSearch: document.querySelector("#catalogSearch"),
  catalogYear: document.querySelector("#catalogYear"),
  catalogSource: document.querySelector("#catalogSource"),
  catalogRefresh: document.querySelector("#catalogRefresh"),
  catalogRows: document.querySelector("#catalogRows"),
  catalogCount: document.querySelector("#catalogCount"),
  catalogStatus: document.querySelector("#catalogStatus"),
  catalogResultLabel: document.querySelector("#catalogResultLabel"),
  catalogSelectionLabel: document.querySelector("#catalogSelectionLabel"),
  catalogClearSelection: document.querySelector("#catalogClearSelection"),
  catalogSelectAll: document.querySelector("#catalogSelectAll"),
  catalogEmpty: document.querySelector("#catalogEmpty"),
  catalogEmptyTitle: document.querySelector("#catalogEmptyTitle"),
  catalogEmptyText: document.querySelector("#catalogEmptyText"),
  catalogMoreButton: document.querySelector("#catalogMoreButton"),
  catalogEditorEmpty: document.querySelector("#catalogEditorEmpty"),
  catalogBatchForm: document.querySelector("#catalogBatchForm"),
  catalogSelectionBadge: document.querySelector("#catalogSelectionBadge"),
  catalogSelectionList: document.querySelector("#catalogSelectionList"),
  catalogSaveButton: document.querySelector("#catalogSaveButton"),
  catalogSyncButton: document.querySelector("#catalogSyncButton"),
  toast: document.querySelector("#toast"),
};

let searchTimer = null;
let toastTimer = null;
let requestSequence = 0;

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
    rating: "",
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
  if (view === "catalog") {
    renderBatchEditor();
    if (!state.catalogLoaded) {
      loadCatalog();
    }
  }
  if (view === "duplicates") {
    window.dispatchEvent(new CustomEvent("anime-duplicates:activate"));
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

function createCover(item) {
  const cover = document.createElement("span");
  cover.className = "catalog-row-cover";
  const fallback = document.createElement("span");
  fallback.className = "catalog-row-fallback";
  fallback.textContent = [...item.displayTitle][0] ?? "A";
  cover.append(fallback);
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
  }
  state.dirty = false;
  renderCatalogRows();
  renderBatchEditor();
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
  work.append(createCover(item));
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
  elements.catalogRows.replaceChildren(...state.items.map(createCatalogRow));
  elements.catalogCount.textContent = state.total
    ? state.total.toLocaleString("zh-CN")
    : "0";
  elements.catalogResultLabel.textContent = state.loading
    ? "正在读取索引"
    : `匹配 ${state.total.toLocaleString("zh-CN")} 条 · 已显示 ${state.items.length}`;
  elements.catalogEmpty.hidden = state.loading || state.items.length > 0;
  elements.catalogMoreButton.hidden =
    state.loading || state.items.length >= state.total;
  if (!state.items.length && !state.loading) {
    elements.catalogEmptyTitle.textContent = "没有匹配的索引";
    elements.catalogEmptyText.textContent = "换一个标题或调整筛选条件。";
  }
  renderSelectionSummary();
}

async function loadCatalog(options = {}) {
  state.loading = true;
  const sequence = ++requestSequence;
  elements.catalogRefresh.classList.add("is-loading");
  elements.catalogRefresh.disabled = true;
  elements.catalogMoreButton.disabled = true;
  elements.catalogStatus.textContent =
    "正在检查索引；首次使用需要下载并建立本地缓存";
  renderCatalogRows();

  const offset = options.append ? state.items.length : 0;
  const params = new URLSearchParams({
    limit: "30",
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
    state.catalogLoaded = true;
    state.total = payload.total ?? 0;
    state.items = options.append
      ? [...state.items, ...(payload.items ?? [])]
      : payload.items ?? [];
    populateFacets(payload.facets);
    elements.catalogStatus.textContent = [
      `bangumi-data ${payload.meta?.version ?? "未知版本"}`,
      `检查于 ${formatDate(payload.meta?.checkedAt)}`,
      payload.meta?.license,
    ]
      .filter(Boolean)
      .join(" · ");
    if (options.refresh) {
      showToast("全量索引已检查");
    }
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
      elements.catalogMoreButton.disabled = false;
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
  heading.append(createCover(item));
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
  const ratingLabel = document.createElement("label");
  ratingLabel.className = "field";
  const ratingText = document.createElement("span");
  ratingText.textContent = "评分";
  const rating = document.createElement("input");
  rating.type = "number";
  rating.min = "0";
  rating.max = "10";
  rating.step = "0.1";
  rating.placeholder = "未评分";
  rating.value = draft.rating;
  rating.disabled = !getRuntime().writable;
  rating.addEventListener("input", () => {
    draft.rating = rating.value;
    setDirty(true);
  });
  ratingLabel.append(ratingText, rating);

  const reviewLabel = document.createElement("label");
  reviewLabel.className = "field catalog-draft-review";
  const reviewText = document.createElement("span");
  reviewText.textContent = "评价";
  const review = document.createElement("textarea");
  review.maxLength = 20000;
  review.rows = 3;
  review.placeholder = "写下这部作品的评价";
  review.value = draft.review;
  review.disabled = !getRuntime().writable;
  review.addEventListener("input", () => {
    draft.review = review.value;
    setDirty(true);
  });
  reviewLabel.append(reviewText, review);
  fields.append(ratingLabel, reviewLabel);
  section.append(fields);

  const details = document.createElement("details");
  details.className = "catalog-draft-extra";
  const summary = document.createElement("summary");
  summary.textContent = "更多选项";
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

  const noteLabel = document.createElement("label");
  noteLabel.className = "field";
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
  details.append(titleLabel, noteLabel);
  section.append(details);

  const source = document.createElement("span");
  source.className = "catalog-draft-id";
  source.textContent = item.id;
  section.append(source);
  return section;
}

function renderBatchEditor() {
  const items = [...state.selectedItems.values()];
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
  const items = [...state.selectedItems.values()].map((item) => {
    const draft = state.drafts.get(item.id) ?? createDraft(item);
    return {
      id: item.id,
      title: draft.title,
      rating: draft.rating,
      review: draft.review,
      note: draft.note,
    };
  });
  state.busy = true;
  renderSelectionSummary();
  try {
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

elements.catalogSearch.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = elements.catalogSearch.value.trim();
    loadCatalog();
  }, 260);
});

for (const select of [elements.catalogYear, elements.catalogSource]) {
  select.addEventListener("change", () => {
    state.year = elements.catalogYear.value;
    state.source = elements.catalogSource.value;
    loadCatalog();
  });
}

elements.catalogRefresh.addEventListener("click", () => {
  loadCatalog({ refresh: true });
});

elements.catalogMoreButton.addEventListener("click", () => {
  loadCatalog({ append: true });
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
