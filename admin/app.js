import {
  api,
  getRuntime,
  refreshRuntimeLibrary,
} from "./runtime.js";
import {
  getPaginationState,
  renderPagination,
} from "./pagination.js";
import { createRatingControl } from "./rating-control.js";

const state = {
  records: [],
  index: [],
  selectedId: null,
  selectedIds: new Set(),
  query: "",
  filter: "all",
  page: 1,
  pageSize: 30,
  dirty: false,
  backupLimit: 5,
  git: null,
  busy: false,
};

const elements = {
  repoStatus: document.querySelector("#repoStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  syncButton: document.querySelector("#syncButton"),
  recordCount: document.querySelector("#recordCount"),
  searchInput: document.querySelector("#searchInput"),
  filterButtons: [...document.querySelectorAll("[data-filter]")],
  selectAll: document.querySelector("#selectAll"),
  selectionLabel: document.querySelector("#selectionLabel"),
  deleteButton: document.querySelector("#deleteButton"),
  recordRows: document.querySelector("#recordRows"),
  emptyState: document.querySelector("#emptyState"),
  editorEmpty: document.querySelector("#editorEmpty"),
  editorForm: document.querySelector("#editorForm"),
  editorTitle: document.querySelector("#editorTitle"),
  editorBadge: document.querySelector("#editorBadge"),
  titleInput: document.querySelector("#titleInput"),
  ratingControlMount: document.querySelector("#ratingControl"),
  recordId: document.querySelector("#recordId"),
  reviewInput: document.querySelector("#reviewInput"),
  noteInput: document.querySelector("#noteInput"),
  seasonLabel: document.querySelector("#seasonLabel"),
  updatedLabel: document.querySelector("#updatedLabel"),
  backupLabel: document.querySelector("#backupLabel"),
  saveButton: document.querySelector("#saveButton"),
  libraryPagination: document.querySelector("#libraryPagination"),
  libraryPageSummary: document.querySelector("#libraryPageSummary"),
  libraryPageButtons: document.querySelector("#libraryPageButtons"),
  libraryPageSize: document.querySelector("#libraryPageSize"),
  libraryPreviousPage: document.querySelector("#libraryPreviousPage"),
  libraryNextPage: document.querySelector("#libraryNextPage"),
  toast: document.querySelector("#toast"),
};

let toastTimer = null;
const ratingControl = createRatingControl({
  disabled: !getRuntime().writable,
  onChange: () => setDirty(true),
});
elements.ratingControlMount.append(ratingControl.element);

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

function seasonText(record) {
  if (record.season?.label) {
    return record.season.label;
  }
  if (record.season?.number) {
    return `第${record.season.number}季`;
  }
  return "";
}

function sourceText(record) {
  const ids = Object.entries(record.externalIds ?? {});
  return ids.length ? ids.map(([source, id]) => `${source}:${id}`).join(" · ") : "无站点索引";
}

function excerpt(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function recordMatches(record) {
  if (state.filter === "rated" && record.rating === null) {
    return false;
  }
  if (state.filter === "unrated" && record.rating !== null) {
    return false;
  }
  const query = state.query.trim().toLocaleLowerCase();
  if (!query) {
    return true;
  }
  const haystack = [
    record.id,
    record.title,
    record.review,
    record.note,
    seasonText(record),
    sourceText(record),
    record.match?.matchedTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query);
}

function filteredRecords() {
  return state.records
    .filter(recordMatches)
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}

function currentPageRecords(records = filteredRecords()) {
  const info = getPaginationState(
    records.length,
    state.pageSize,
    state.page,
  );
  state.page = info.page;
  return records.slice(info.offset, info.end);
}

function currentRecord() {
  return state.records.find((record) => record.id === state.selectedId) ?? null;
}

function setBusy(busy) {
  state.busy = busy;
  const writable = getRuntime().writable;
  ratingControl.setDisabled(busy || !writable);
  for (const button of [elements.refreshButton, elements.syncButton]) {
    button.classList.toggle("is-loading", busy);
    button.disabled = busy;
  }
  elements.saveButton.classList.toggle("is-loading", busy);
  elements.deleteButton.classList.toggle("is-loading", busy);
  elements.saveButton.disabled = busy || !writable;
  elements.deleteButton.disabled =
    busy || !writable || state.selectedIds.size === 0;
}

function renderGitStatus() {
  const git = state.git;
  if (!git) {
    elements.repoStatus.textContent = "未读取 Git 状态";
    return;
  }
  if (git.mode === "github") {
    elements.repoStatus.textContent = [
      "GitHub Pages 在线管理",
      `${git.remote}@${git.branch}`,
      getRuntime().writable ? "可写入" : "只读，填写 Token 后可编辑",
    ].join(" · ");
    return;
  }
  const stateLabel = git.dirty ? "有未提交更改" : "数据已提交";
  elements.repoStatus.textContent = [
    git.branch,
    stateLabel,
    git.remote ? "origin 已连接" : "未配置 origin",
  ].join(" · ");
}

function renderSelection() {
  const count = state.selectedIds.size;
  const writable = getRuntime().writable;
  elements.selectionLabel.textContent = count ? `已选择 ${count} 条` : "未选择";
  elements.deleteButton.disabled = state.busy || !writable || count === 0;
  const visible = currentPageRecords();
  elements.selectAll.disabled = state.busy || !writable || visible.length === 0;
  const selectedVisible = visible.filter((record) =>
    state.selectedIds.has(record.id),
  ).length;
  elements.selectAll.checked = visible.length > 0 && selectedVisible === visible.length;
  elements.selectAll.indeterminate =
    selectedVisible > 0 && selectedVisible < visible.length;
}

function renderRows() {
  const records = filteredRecords();
  const pageRecords = currentPageRecords(records);
  elements.recordRows.replaceChildren();
  elements.recordCount.textContent = String(state.records.length);
  elements.emptyState.hidden = records.length > 0;

  for (const record of pageRecords) {
    const row = document.createElement("tr");
    row.className = "record-row";
    row.tabIndex = 0;
    row.dataset.id = record.id;
    if (record.id === state.selectedId) {
      row.classList.add("is-selected");
    }

    const checkCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedIds.has(record.id);
    checkbox.disabled = !getRuntime().writable;
    checkbox.setAttribute("aria-label", `选择 ${record.title}`);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedIds.add(record.id);
      } else {
        state.selectedIds.delete(record.id);
      }
      renderSelection();
    });
    checkCell.append(checkbox);
    row.append(checkCell);

    const titleCell = document.createElement("td");
    titleCell.className = "record-title-cell";
    const title = document.createElement("span");
    title.className = "record-title";
    title.textContent = record.title;
    const subtitle = document.createElement("span");
    subtitle.className = "record-subtitle";
    subtitle.textContent = [seasonText(record), sourceText(record)]
      .filter(Boolean)
      .join(" · ");
    titleCell.append(title, subtitle);
    row.append(titleCell);

    const ratingCell = document.createElement("td");
    const rating = document.createElement("span");
    rating.className = "rating-value";
    if (record.rating === null) {
      rating.classList.add("is-empty");
      rating.textContent = "—";
    } else {
      rating.textContent = Number(record.rating).toFixed(1);
    }
    ratingCell.append(rating);
    row.append(ratingCell);

    const copyCell = document.createElement("td");
    copyCell.className = "record-copy-cell";
    const reviewLine = document.createElement("div");
    reviewLine.className = "record-copy-line";
    const reviewLabel = document.createElement("span");
    reviewLabel.className = "record-copy-label";
    reviewLabel.textContent = "短评";
    const reviewText = document.createElement("span");
    reviewText.className = "record-copy-text";
    reviewText.textContent = excerpt(record.review) || "未填写";
    reviewText.classList.toggle("is-empty", !excerpt(record.review));
    reviewLine.append(reviewLabel, reviewText);
    const noteLine = document.createElement("div");
    noteLine.className = "record-copy-line";
    const noteLabel = document.createElement("span");
    noteLabel.className = "record-copy-label";
    noteLabel.textContent = "备注";
    const noteText = document.createElement("span");
    noteText.className = "record-copy-text";
    noteText.textContent = excerpt(record.note) || "未填写";
    noteText.classList.toggle("is-empty", !excerpt(record.note));
    noteLine.append(noteLabel, noteText);
    copyCell.append(reviewLine, noteLine);
    row.append(copyCell);

    const selectRecord = () => selectRecordById(record.id);
    row.addEventListener("click", selectRecord);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectRecord();
      }
    });
    elements.recordRows.append(row);
  }
  renderPagination(
    {
      nav: elements.libraryPagination,
      summary: elements.libraryPageSummary,
      pages: elements.libraryPageButtons,
      previous: elements.libraryPreviousPage,
      next: elements.libraryNextPage,
    },
    {
      totalItems: records.length,
      pageSize: state.pageSize,
      page: state.page,
      onSelect: (page) => {
        state.page = page;
        renderRows();
      },
    },
  );
  renderSelection();
}

function setDirty(dirty) {
  state.dirty = dirty;
  elements.saveButton.textContent = dirty ? "保存修改 *" : "保存修改";
}

function renderEditor() {
  const record = currentRecord();
  const writable = getRuntime().writable;
  elements.editorEmpty.hidden = Boolean(record);
  elements.editorForm.hidden = !record;
  if (!record) {
    setDirty(false);
    return;
  }
  elements.editorTitle.textContent = record.title;
  elements.editorBadge.textContent = record.deletedAt ? "已删除" : "已收录";
  elements.editorBadge.classList.toggle("is-deleted", Boolean(record.deletedAt));
  elements.titleInput.value = record.title;
  ratingControl.setValue(record.rating);
  elements.recordId.textContent = record.id;
  elements.reviewInput.value = record.review ?? "";
  elements.noteInput.value = record.note ?? "";
  elements.seasonLabel.textContent = seasonText(record) || "季度未标注";
  elements.updatedLabel.textContent = `更新于 ${formatDate(record.updatedAt)}`;
  elements.backupLabel.textContent = `备份上限 ${state.backupLimit} 个`;
  for (const input of [
    elements.titleInput,
    elements.reviewInput,
    elements.noteInput,
  ]) {
    input.disabled = !writable;
  }
  ratingControl.setDisabled(state.busy || !writable);
  elements.saveButton.disabled = state.busy || !writable;
  setDirty(false);
}

function confirmDiscard() {
  return !state.dirty || window.confirm("当前修改尚未保存，确定放弃吗？");
}

function selectRecordById(recordId) {
  if (recordId === state.selectedId) {
    return;
  }
  if (!confirmDiscard()) {
    return;
  }
  state.selectedId = recordId;
  renderRows();
  renderEditor();
}

function revealRecordPage(recordId) {
  const records = filteredRecords();
  const index = records.findIndex((record) => record.id === recordId);
  if (index >= 0) {
    state.page = Math.floor(index / state.pageSize) + 1;
  }
}

function applyLibrary(payload) {
  state.records = payload.records ?? [];
  state.index = payload.index ?? [];
  state.backupLimit = payload.backupLimit ?? state.backupLimit;
  if (payload.git) {
    state.git = payload.git;
  }
  if (
    state.selectedId &&
    !state.records.some((record) => record.id === state.selectedId)
  ) {
    state.selectedId = null;
  }
  renderGitStatus();
  renderRows();
  renderEditor();
}

async function loadLibrary(options = {}) {
  if (!options.quiet) {
    elements.repoStatus.textContent = "正在读取数据";
  }
  const payload = await api("/api/library");
  applyLibrary(payload);
  if (!options.quiet) {
    showToast("数据已刷新");
  }
}

async function saveCurrentRecord() {
  const record = currentRecord();
  if (!record || state.busy) {
    return false;
  }
  if (!getRuntime().writable) {
    showToast("当前为只读模式，请先连接 GitHub Token", { error: true });
    return false;
  }
  setBusy(true);
  try {
    const payload = await api(`/api/records/${encodeURIComponent(record.id)}`, {
      method: "PUT",
      body: JSON.stringify({
        title: elements.titleInput.value,
        rating: ratingControl.getValue(),
        review: elements.reviewInput.value,
        note: elements.noteInput.value,
      }),
    });
    state.records = payload.records;
    state.index = payload.index;
    state.git = await api("/api/status");
    renderGitStatus();
    renderRows();
    renderEditor();
    const online = getRuntime().mode === "github";
    showToast(
      online
        ? `已提交到 GitHub${payload.commit ? ` (${payload.commit.slice(0, 7)})` : ""}`
        : payload.backupPath
          ? "已保存，并创建备份快照"
          : "已保存",
    );
    return true;
  } catch (error) {
    showToast(error.message, { error: true });
    return false;
  } finally {
    setBusy(false);
  }
}

async function deleteSelected() {
  if (!state.selectedIds.size || state.busy) {
    return;
  }
  if (!getRuntime().writable) {
    showToast("当前为只读模式，请先连接 GitHub Token", { error: true });
    return;
  }
  const ids = [...state.selectedIds];
  if (!window.confirm(`确定删除 ${ids.length} 条番剧记录吗？覆盖前会创建备份。`)) {
    return;
  }
  setBusy(true);
  try {
    const payload = await api("/api/records", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    });
    if (ids.includes(state.selectedId)) {
      state.selectedId = null;
    }
    state.selectedIds.clear();
    state.records = payload.records;
    state.index = payload.index;
    state.git = await api("/api/status");
    renderGitStatus();
    renderRows();
    renderEditor();
    showToast("所选记录已删除并写入备份");
  } catch (error) {
    showToast(error.message, { error: true });
  } finally {
    setBusy(false);
  }
}

async function syncRemote() {
  if (state.busy) {
    return;
  }
  if (state.dirty) {
    const saved = await saveCurrentRecord();
    if (!saved) {
      return;
    }
  }
  if (getRuntime().mode === "github") {
    refreshRuntimeLibrary();
    try {
      await loadLibrary({ quiet: true });
      showToast("已读取 GitHub 最新数据；在线保存会自动提交到远端");
    } catch (error) {
      showToast(error.message, { error: true });
    }
    return;
  }
  setBusy(true);
  elements.syncButton.textContent = "正在同步";
  try {
    const message = window.prompt(
      "提交说明",
      `chore(data): update anime library ${new Date().toISOString().slice(0, 10)}`,
    );
    if (message === null) {
      return;
    }
    const payload = await api("/api/sync", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    state.git = await api("/api/status");
    renderGitStatus();
    showToast(
      payload.commit
        ? `已提交 ${payload.commit} 并推送到 ${payload.branch}`
        : `没有新提交，已执行推送`,
    );
  } catch (error) {
    showToast(error.message, { error: true });
  } finally {
    elements.syncButton.textContent = "同步远端";
    setBusy(false);
  }
}

elements.searchInput.addEventListener("input", () => {
  state.query = elements.searchInput.value;
  state.page = 1;
  renderRows();
});

for (const button of elements.filterButtons) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    state.page = 1;
    for (const candidate of elements.filterButtons) {
      candidate.classList.toggle("is-active", candidate === button);
    }
    renderRows();
  });
}

elements.selectAll.addEventListener("change", () => {
  const visible = currentPageRecords();
  if (elements.selectAll.checked) {
    for (const record of visible) {
      state.selectedIds.add(record.id);
    }
  } else {
    for (const record of visible) {
      state.selectedIds.delete(record.id);
    }
  }
  renderRows();
});

for (const input of [
  elements.titleInput,
  elements.reviewInput,
  elements.noteInput,
]) {
  input.addEventListener("input", () => setDirty(true));
}

elements.libraryPageSize.addEventListener("change", () => {
  state.pageSize = Number(elements.libraryPageSize.value);
  state.page = 1;
  renderRows();
});

elements.libraryPreviousPage.addEventListener("click", () => {
  state.page = Math.max(1, state.page - 1);
  renderRows();
});

elements.libraryNextPage.addEventListener("click", () => {
  state.page += 1;
  renderRows();
});

elements.editorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveCurrentRecord();
});
elements.refreshButton.addEventListener("click", async () => {
  if (!confirmDiscard()) {
    return;
  }
  setBusy(true);
  try {
    await loadLibrary();
  } catch (error) {
    showToast(error.message, { error: true });
  } finally {
    setBusy(false);
  }
});
elements.deleteButton.addEventListener("click", deleteSelected);
elements.syncButton.addEventListener("click", syncRemote);

window.addEventListener("anime-editor:request-close", (event) => {
  event.detail.allowed = confirmDiscard();
});

window.addEventListener("anime-editor:discard", () => {
  state.dirty = false;
  renderEditor();
});

window.addEventListener("anime-library:edit", (event) => {
  const recordId = event.detail?.recordId;
  if (!recordId || !state.records.some((record) => record.id === recordId)) {
    return;
  }
  state.selectedId = recordId;
  state.dirty = false;
  revealRecordPage(recordId);
  renderRows();
  renderEditor();
});

window.addEventListener("anime-library:changed", async (event) => {
  try {
    await loadLibrary({ quiet: true });
    const recordId = event.detail?.selectId;
    if (recordId && state.records.some((record) => record.id === recordId)) {
      state.selectedId = recordId;
      state.dirty = false;
      revealRecordPage(recordId);
      renderRows();
      renderEditor();
    }
  } catch (error) {
    showToast(error.message, { error: true });
  }
});

window.addEventListener("anime-runtime:changed", async () => {
  refreshRuntimeLibrary();
  if (!getRuntime().writable) {
    state.selectedIds.clear();
  }
  try {
    await loadLibrary({ quiet: true });
  } catch (error) {
    showToast(error.message, { error: true, duration: 7000 });
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
});

loadLibrary({ quiet: true }).catch((error) => {
  showToast(error.message, { error: true, duration: 8000 });
});
