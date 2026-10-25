const state = {
  view: "library",
  catalogLoaded: false,
  loading: false,
  items: [],
  total: 0,
  selectedId: null,
  dirty: false,
  busy: false,
  query: "",
  year: "",
  source: "",
  facetsLoaded: false,
};

const elements = {
  switchButtons: [...document.querySelectorAll("[data-view]")],
  libraryWorkspace: document.querySelector("#libraryWorkspace"),
  catalogWorkspace: document.querySelector("#catalogWorkspace"),
  catalogSearch: document.querySelector("#catalogSearch"),
  catalogYear: document.querySelector("#catalogYear"),
  catalogSource: document.querySelector("#catalogSource"),
  catalogRefresh: document.querySelector("#catalogRefresh"),
  catalogRows: document.querySelector("#catalogRows"),
  catalogCount: document.querySelector("#catalogCount"),
  catalogStatus: document.querySelector("#catalogStatus"),
  catalogResultLabel: document.querySelector("#catalogResultLabel"),
  catalogEmpty: document.querySelector("#catalogEmpty"),
  catalogEmptyTitle: document.querySelector("#catalogEmptyTitle"),
  catalogEmptyText: document.querySelector("#catalogEmptyText"),
  catalogMoreButton: document.querySelector("#catalogMoreButton"),
  catalogEditorEmpty: document.querySelector("#catalogEditorEmpty"),
  catalogForm: document.querySelector("#catalogForm"),
  catalogEditorTitle: document.querySelector("#catalogEditorTitle"),
  catalogEditorBadge: document.querySelector("#catalogEditorBadge"),
  catalogCover: document.querySelector("#catalogCover"),
  catalogCoverFallback: document.querySelector("#catalogCoverFallback"),
  catalogCoverImage: document.querySelector("#catalogCoverImage"),
  catalogPreviewTitle: document.querySelector("#catalogPreviewTitle"),
  catalogPreviewOriginal: document.querySelector("#catalogPreviewOriginal"),
  catalogPreviewMeta: document.querySelector("#catalogPreviewMeta"),
  catalogTitleInput: document.querySelector("#catalogTitleInput"),
  catalogRatingInput: document.querySelector("#catalogRatingInput"),
  catalogRecordId: document.querySelector("#catalogRecordId"),
  catalogReviewInput: document.querySelector("#catalogReviewInput"),
  catalogNoteInput: document.querySelector("#catalogNoteInput"),
  catalogSourceLabel: document.querySelector("#catalogSourceLabel"),
  catalogSeasonLabel: document.querySelector("#catalogSeasonLabel"),
  catalogSaveButton: document.querySelector("#catalogSaveButton"),
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

async function api(path, options = {}) {
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

function currentCatalogItem() {
  return state.items.find((item) => item.id === state.selectedId) ?? null;
}

function setDirty(dirty) {
  state.dirty = dirty;
  if (!elements.catalogSaveButton.disabled) {
    elements.catalogSaveButton.textContent = dirty
      ? "添加到我的档案 *"
      : "添加到我的档案";
  }
}

function confirmCatalogDiscard() {
  return !state.dirty || window.confirm("当前评价尚未添加，确定放弃吗？");
}

function requestLibraryDiscard() {
  const detail = { allowed: false };
  window.dispatchEvent(
    new CustomEvent("anime-editor:request-close", { detail }),
  );
  return detail.allowed;
}

function activateView(view, options = {}) {
  if (view === state.view) {
    return;
  }
  if (
    !options.force &&
    ((view === "library" && !confirmCatalogDiscard()) ||
      (view === "catalog" && !requestLibraryDiscard()))
  ) {
    return;
  }
  if (view === "library" && !options.force) {
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
  if (view === "catalog" && !state.catalogLoaded) {
    loadCatalog();
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

function createCatalogRow(item) {
  const row = document.createElement("tr");
  row.className = "record-row catalog-row";
  row.tabIndex = 0;
  if (item.id === state.selectedId) {
    row.classList.add("is-selected");
  }
  if (item.ownedRecordId) {
    row.classList.add("is-owned");
  }

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

  const select = () => selectCatalogItem(item);
  row.addEventListener("click", select);
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  });
  return row;
}

function renderCatalogRows() {
  elements.catalogRows.replaceChildren(
    ...state.items.map(createCatalogRow),
  );
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
    if (
      state.selectedId &&
      !state.items.some((item) => item.id === state.selectedId)
    ) {
      clearCatalogSelection();
    }
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

function setCatalogInputsDisabled(disabled) {
  for (const input of [
    elements.catalogTitleInput,
    elements.catalogRatingInput,
    elements.catalogReviewInput,
    elements.catalogNoteInput,
  ]) {
    input.disabled = disabled;
  }
  elements.catalogSaveButton.disabled = disabled;
}

function clearCatalogSelection() {
  state.selectedId = null;
  state.dirty = false;
  elements.catalogEditorEmpty.hidden = false;
  elements.catalogForm.hidden = true;
}

function selectCatalogItem(item) {
  if (!confirmCatalogDiscard()) {
    return;
  }
  state.selectedId = item.id;
  state.dirty = false;
  elements.catalogEditorEmpty.hidden = true;
  elements.catalogForm.hidden = false;
  elements.catalogEditorTitle.textContent = item.displayTitle;
  elements.catalogEditorBadge.textContent = item.ownedRecordId
    ? "已收录"
    : "索引候选";
  elements.catalogEditorBadge.classList.toggle(
    "is-owned",
    Boolean(item.ownedRecordId),
  );
  elements.catalogPreviewTitle.textContent = item.displayTitle;
  elements.catalogPreviewOriginal.textContent =
    item.title !== item.displayTitle ? item.title : "";
  elements.catalogPreviewMeta.textContent = [
    item.year || "年份未知",
    seasonText(item.season),
    item.sources.map((source) => source.label).join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");
  elements.catalogTitleInput.value = item.displayTitle;
  elements.catalogRatingInput.value = "";
  elements.catalogReviewInput.value = "";
  elements.catalogNoteInput.value = "";
  elements.catalogRecordId.textContent = item.id;
  elements.catalogSourceLabel.textContent = item.sources.length
    ? item.sources.map((source) => source.label).join(" · ")
    : "仅标题索引";
  elements.catalogSeasonLabel.textContent = seasonText(item.season);
  elements.catalogCoverFallback.textContent = [...item.displayTitle][0] ?? "A";
  elements.catalogCover.classList.remove("has-image");
  elements.catalogCoverImage.hidden = true;
  elements.catalogCoverImage.removeAttribute("src");
  if (item.coverUrl) {
    elements.catalogCoverImage.addEventListener(
      "load",
      () => {
        elements.catalogCoverImage.hidden = false;
        elements.catalogCover.classList.add("has-image");
      },
      { once: true },
    );
    elements.catalogCoverImage.addEventListener(
      "error",
      () => {
        elements.catalogCoverImage.hidden = true;
        elements.catalogCover.classList.remove("has-image");
      },
      { once: true },
    );
    elements.catalogCoverImage.src = item.coverUrl;
  }

  setCatalogInputsDisabled(Boolean(item.ownedRecordId));
  elements.catalogSaveButton.textContent = item.ownedRecordId
    ? "已在当前档案中"
    : "添加到我的档案";
  renderCatalogRows();
  if (window.matchMedia("(max-width: 900px)").matches) {
    elements.catalogForm.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    elements.catalogTitleInput.focus();
  }
}

async function saveCatalogRecord() {
  const item = currentCatalogItem();
  if (!item || item.ownedRecordId || state.busy) {
    return;
  }
  if (!elements.catalogTitleInput.value.trim()) {
    showToast("展示标题不能为空", { error: true });
    elements.catalogTitleInput.focus();
    return;
  }
  state.busy = true;
  elements.catalogSaveButton.disabled = true;
  elements.catalogSaveButton.classList.add("is-loading");
  elements.catalogSaveButton.textContent = "正在添加";
  try {
    const payload = await api(
      `/api/catalog/${encodeURIComponent(item.id)}`,
      {
        method: "POST",
        body: JSON.stringify({
          title: elements.catalogTitleInput.value,
          rating: elements.catalogRatingInput.value,
          review: elements.catalogReviewInput.value,
          note: elements.catalogNoteInput.value,
        }),
      },
    );
    state.dirty = false;
    showToast(
      payload.backupPath
        ? `《${payload.record.title}》已添加，并创建备份快照`
        : `《${payload.record.title}》已添加`,
    );
    window.dispatchEvent(
      new CustomEvent("anime-library:changed", {
        detail: { selectId: payload.record.id },
      }),
    );
    activateView("library", { force: true });
  } catch (error) {
    showToast(error.message, { error: true });
  } finally {
    state.busy = false;
    elements.catalogSaveButton.classList.remove("is-loading");
    if (!item.ownedRecordId) {
      elements.catalogSaveButton.disabled = false;
      elements.catalogSaveButton.textContent = state.dirty
        ? "添加到我的档案 *"
        : "添加到我的档案";
    }
  }
}

for (const button of elements.switchButtons) {
  button.addEventListener("click", () => {
    activateView(button.dataset.view);
  });
}

for (const input of [
  elements.catalogTitleInput,
  elements.catalogRatingInput,
  elements.catalogReviewInput,
  elements.catalogNoteInput,
]) {
  input.addEventListener("input", () => setDirty(true));
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

elements.catalogForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCatalogRecord();
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
});
