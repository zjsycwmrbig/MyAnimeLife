import {
  api,
  getRuntime,
  refreshRuntimeLibrary,
} from "./runtime.js";
import {
  getPaginationState,
  renderPagination,
} from "./pagination.js";
import { replaceChildrenSafe } from "./dom.js";
import { queryLibraryRecords } from "./library-query.js";
import { createRatingControl } from "./rating-control.js";
import {
  clearPendingDrafts,
  commitPendingDrafts,
  pendingCount,
  readPendingDrafts,
  writePendingDrafts,
} from "./draft-store.js";

const state = {
  records: [],
  index: [],
  selectedId: null,
  selectedIds: new Set(),
  query: "",
  status: "all",
  ratingMin: "",
  ratingMax: "",
  yearMin: "",
  yearMax: "",
  createdFrom: "",
  createdTo: "",
  sort: "created-desc",
  page: 1,
  pageSize: 30,
  layout: "list",
  dirty: false,
  pendingDrafts: { edits: [], additions: [] },
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
  librarySort: document.querySelector("#librarySort"),
  libraryStatusFilter: document.querySelector("#libraryStatusFilter"),
  libraryRatingMin: document.querySelector("#libraryRatingMin"),
  libraryRatingMax: document.querySelector("#libraryRatingMax"),
  libraryYearMin: document.querySelector("#libraryYearMin"),
  libraryYearMax: document.querySelector("#libraryYearMax"),
  libraryCreatedFrom: document.querySelector("#libraryCreatedFrom"),
  libraryCreatedTo: document.querySelector("#libraryCreatedTo"),
  libraryFilterReset: document.querySelector("#libraryFilterReset"),
  libraryResultLabel: document.querySelector("#libraryResultLabel"),
  selectAll: document.querySelector("#selectAll"),
  selectionLabel: document.querySelector("#selectionLabel"),
  deleteButton: document.querySelector("#deleteButton"),
  libraryTable: document.querySelector("#libraryTable"),
  recordRows: document.querySelector("#recordRows"),
  recordCards: document.querySelector("#recordCards"),
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
  backupLabel: document.querySelector("#backupLabel"),
  saveButton: document.querySelector("#saveButton"),
  pendingPanel: document.querySelector("#pendingPanel"),
  pendingList: document.querySelector("#pendingList"),
  pendingCount: document.querySelector("#pendingCount"),
  pendingClear: document.querySelector("#pendingClear"),
  libraryPagination: document.querySelector("#libraryPagination"),
  libraryPageSummary: document.querySelector("#libraryPageSummary"),
  libraryPageButtons: document.querySelector("#libraryPageButtons"),
  libraryPageSize: document.querySelector("#libraryPageSize"),
  libraryPageSizeCustom: document.querySelector("#libraryPageSizeCustom"),
  libraryPreviousPage: document.querySelector("#libraryPreviousPage"),
  libraryNextPage: document.querySelector("#libraryNextPage"),
  toast: document.querySelector("#toast"),
};

let toastTimer = null;
const recordDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const ratingControl = createRatingControl({
  disabled: !getRuntime().writable,
  onChange: () => scheduleCurrentDraft(),
});
elements.ratingControlMount.append(ratingControl.element);

function refreshPendingDrafts() {
  state.pendingDrafts = readPendingDrafts();
  return state.pendingDrafts;
}

function pendingEdit(recordId) {
  return (
    state.pendingDrafts.edits.find((entry) => entry.id === recordId) ?? null
  );
}

function hasPendingEdit(recordId) {
  return Boolean(pendingEdit(recordId));
}

function scheduleCurrentDraft() {
  if (queueCurrentRecordDraft()) {
    updatePendingSummary();
    renderRows();
    renderPendingListOnly();
    setDirty(true);
  }
}

function flushCurrentDraft() {
  if (queueCurrentRecordDraft()) {
    updatePendingSummary();
    replaceChildrenSafe("待提交记录", elements.pendingList, ...pendingRows());
  }
}

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

function seasonText(record) {
  if (record.season?.label) {
    return record.season.label;
  }
  if (record.season?.number) {
    return `第${record.season.number}季`;
  }
  return "";
}

function animeDateText(record) {
  return [
    record.season?.year ? String(record.season.year) : "",
    seasonText(record),
  ]
    .filter(Boolean)
    .join(" · ");
}

function sourceText(record) {
  const ids = Object.entries(record.externalIds ?? {});
  return ids.length ? ids.map(([source, id]) => `${source}:${id}`).join(" · ") : "无站点索引";
}

function excerpt(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function recordDateText(record) {
  const date = new Date(record?.createdAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `收录 ${recordDateFormatter.format(date)}`;
}

function filteredRecords() {
  return queryLibraryRecords(state.records.map(effectiveRecord), state);
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
  renderPendingActions();
}

function renderPendingActions() {
  const count = pendingCount(state.pendingDrafts);
  const currentPending = state.selectedId && hasPendingEdit(state.selectedId);
  elements.syncButton.textContent = count
    ? `保存并推送 (${count})`
    : "同步远端";
  elements.saveButton.textContent = currentPending
    ? "更新待提交"
    : "加入待提交";
}

function pendingCover(entry) {
  const cover = document.createElement("span");
  cover.className = "catalog-row-cover pending-cover";
  const fallback = document.createElement("span");
  fallback.className = "catalog-row-fallback";
  fallback.textContent = [...(entry.title || "A")][0] ?? "A";
  cover.append(fallback);
  if (entry.coverUrl) {
    const image = document.createElement("img");
    image.src = entry.coverUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove(), { once: true });
    cover.append(image);
  }
  return cover;
}

function pendingRow(entry, kind) {
  const isEdit = kind === "edit";
  const item = isEdit ? null : entry.item;
  const changes = entry.changes;
  const title = changes.title || (isEdit ? entry.title : item.displayTitle);
  const row = document.createElement("article");
  row.className = "pending-row";
  row.append(pendingCover({
    title,
    coverUrl: isEdit ? entry.coverUrl : item.coverUrl,
  }));
  const copy = document.createElement("div");
  copy.className = "pending-row-copy";
  const heading = document.createElement("div");
  heading.className = "pending-row-heading";
  const badge = document.createElement("span");
  badge.className = `pending-kind ${isEdit ? "is-edit" : "is-add"}`;
  badge.textContent = isEdit ? "修改" : "新增";
  const strong = document.createElement("strong");
  strong.textContent = title;
  heading.append(badge, strong);
  const meta = document.createElement("span");
  meta.className = "pending-row-meta";
  meta.textContent = [
    changes.rating === null ? "未评分" : `${changes.rating} 分`,
    excerpt(changes.review) || "未填写短评",
  ].join(" · ");
  copy.append(heading, meta);
  row.append(copy);

  const actions = document.createElement("div");
  actions.className = "pending-row-actions";
  if (isEdit) {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "text-button";
    edit.textContent = "继续编辑";
    edit.addEventListener("click", () => {
      window.dispatchEvent(
        new CustomEvent("anime-pending:open", {
          detail: { recordId: entry.id },
        }),
      );
    });
    actions.append(edit);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "text-button pending-remove";
  remove.textContent = "移除";
  remove.addEventListener("click", () => {
    removePendingEntry(kind, entry);
  });
  actions.append(remove);
  row.append(actions);
  return row;
}

function pendingRows() {
  return [
    ...state.pendingDrafts.edits.map((entry) => pendingRow(entry, "edit")),
    ...state.pendingDrafts.additions.map((entry) => pendingRow(entry, "add")),
  ];
}

function renderPendingListOnly() {
  updatePendingSummary();
  replaceChildrenSafe("待提交记录", elements.pendingList, ...pendingRows());
}

function updatePendingSummary() {
  const count = pendingCount(state.pendingDrafts);
  elements.pendingPanel.hidden = count === 0;
  elements.pendingCount.textContent = String(count);
  elements.pendingClear.disabled = state.busy || count === 0;
  elements.editorEmpty.hidden = Boolean(currentRecord()) || count > 0;
  renderPendingActions();
}

function renderPendingPanel() {
  const pending = refreshPendingDrafts();
  updatePendingSummary();
  replaceChildrenSafe("待提交记录", elements.pendingList, ...pendingRows());
}

function removePendingEntry(kind, entry) {
  if (state.busy) {
    return;
  }
  const pending = refreshPendingDrafts();
  if (kind === "edit") {
    pending.edits = pending.edits.filter((item) => item.id !== entry.id);
  } else {
    pending.additions = pending.additions.filter(
      (item) => item.item.id !== entry.item.id,
    );
  }
  state.pendingDrafts = writePendingDrafts(pending, { source: "editor" });
  if (kind === "edit" && state.selectedId === entry.id) {
    renderEditor();
  }
  renderRows();
  renderPendingPanel();
  renderPendingActions();
  showToast("已从待提交列表移除");
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

function createRecordCard(record) {
  const card = document.createElement("article");
  card.className = "record-card";
  card.tabIndex = 0;
  card.dataset.id = record.id;
  if (record.id === state.selectedId) {
    card.classList.add("is-selected");
  }
  if (hasPendingEdit(record.id)) {
    card.classList.add("is-pending-edit");
  }

  const cover = document.createElement("div");
  cover.className = "record-card-cover";
  const fallback = document.createElement("span");
  fallback.className = "record-card-fallback";
  fallback.textContent = [...record.title][0] ?? "A";
  cover.append(fallback);
  if (record.coverUrl) {
    const image = document.createElement("img");
    image.src = record.coverUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove(), { once: true });
    cover.append(image);
  }
  card.append(cover);

  const body = document.createElement("div");
  body.className = "record-card-body";
  const top = document.createElement("div");
  top.className = "record-card-top";
  if (hasPendingEdit(record.id)) {
    const pendingLabel = document.createElement("span");
    pendingLabel.className = "record-pending-label";
    pendingLabel.textContent = "待提交修改";
    top.append(pendingLabel);
  }
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
    renderRows();
  });
  top.append(checkbox);
  const rating = document.createElement("span");
  rating.className = "rating-value";
  rating.textContent = record.rating === null ? "未评分" : `${Number(record.rating).toFixed(1)} 分`;
  rating.classList.toggle("is-empty", record.rating === null);
  top.append(rating);
  body.append(top);

  const title = document.createElement("h3");
  title.textContent = record.title;
  body.append(title);
  const meta = document.createElement("span");
  meta.className = "record-card-meta";
  meta.textContent = [
    recordDateText(record),
    animeDateText(record),
    sourceText(record),
  ]
    .filter(Boolean)
    .join(" · ");
  body.append(meta);

  for (const [label, value] of [["短评", record.review], ["备注", record.note]]) {
    const line = document.createElement("p");
    line.className = "record-card-copy";
    const labelElement = document.createElement("strong");
    labelElement.textContent = label;
    const text = document.createElement("span");
    text.textContent = excerpt(value) || "未填写";
    text.classList.toggle("is-empty", !excerpt(value));
    line.append(labelElement, text);
    body.append(line);
  }
  card.append(body);

  const selectRecord = () => selectRecordById(record.id);
  card.addEventListener("click", selectRecord);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectRecord();
    }
  });
  return card;
}

function renderRows() {
  const records = filteredRecords();
  const pageRecords = currentPageRecords(records);
  if (elements.libraryTable) {
    elements.libraryTable.hidden = state.layout !== "list";
  }
  if (elements.recordCards) {
    elements.recordCards.hidden = state.layout !== "cards";
  }
  replaceChildrenSafe("番剧表格", elements.recordRows);
  replaceChildrenSafe("番剧卡片", elements.recordCards);
  elements.recordCount.textContent = String(state.records.length);
  elements.libraryResultLabel.textContent =
    records.length === state.records.length
      ? `当前显示全部 ${records.length.toLocaleString("zh-CN")} 条`
      : `筛选出 ${records.length.toLocaleString("zh-CN")} / ${state.records.length.toLocaleString("zh-CN")} 条`;
  elements.emptyState.hidden = records.length > 0;

  for (const record of state.layout === "list" ? pageRecords : []) {
    const row = document.createElement("tr");
    row.className = "record-row";
    row.tabIndex = 0;
    row.dataset.id = record.id;
    if (record.id === state.selectedId) {
      row.classList.add("is-selected");
    }
    if (hasPendingEdit(record.id)) {
      row.classList.add("is-pending-edit");
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
    if (hasPendingEdit(record.id)) {
      const pendingLabel = document.createElement("span");
      pendingLabel.className = "record-pending-label";
      pendingLabel.textContent = "待提交修改";
      title.append(pendingLabel);
    }
    const subtitle = document.createElement("span");
    subtitle.className = "record-subtitle";
    subtitle.textContent = [
      recordDateText(record),
      animeDateText(record),
      sourceText(record),
    ]
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
    elements.recordRows?.append(row);
  }
  if (state.layout === "cards") {
    elements.recordCards?.append(...pageRecords.map(createRecordCard));
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
  renderPendingActions();
}

function effectiveRecord(record) {
  const pending = pendingEdit(record.id);
  return pending ? { ...record, ...pending.changes } : record;
}

function currentEditorChanges() {
  return {
    title: elements.titleInput.value,
    rating: ratingControl.getValue(),
    review: elements.reviewInput.value,
    note: elements.noteInput.value,
  };
}

function sameRecordChanges(record, changes) {
  return (
    String(changes.title ?? "") === String(record.title ?? "") &&
    (changes.rating ?? null) === (record.rating ?? null) &&
    String(changes.review ?? "") === String(record.review ?? "") &&
    String(changes.note ?? "") === String(record.note ?? "")
  );
}

function queueCurrentRecordDraft() {
  const record = currentRecord();
  if (!record || !getRuntime().writable) {
    return false;
  }
  const pending = refreshPendingDrafts();
  const changes = currentEditorChanges();
  const existing = pending.edits.find((entry) => entry.id === record.id);
  if (sameRecordChanges(record, changes)) {
    pending.edits = pending.edits.filter((entry) => entry.id !== record.id);
  } else {
    const entry = {
      id: record.id,
      title: record.title,
      coverUrl: record.coverUrl ?? null,
      season: record.season ?? null,
      changes,
      savedAt: new Date().toISOString(),
    };
    const position = pending.edits.findIndex((item) => item.id === record.id);
    if (position >= 0) {
      pending.edits[position] = entry;
    } else {
      pending.edits.push(entry);
    }
  }
  const updated = pending.edits.find((entry) => entry.id === record.id);
  if (
    (!existing && !updated) ||
    (existing &&
      updated &&
      JSON.stringify(existing.changes) === JSON.stringify(updated.changes))
  ) {
    return false;
  }
  state.pendingDrafts = writePendingDrafts(pending, { source: "editor" });
  return true;
}

function renderEditor() {
  const record = currentRecord();
  const writable = getRuntime().writable;
  elements.editorEmpty.hidden = Boolean(record) || pendingCount() > 0;
  elements.editorForm.hidden = !record;
  if (!record) {
    setDirty(false);
    return;
  }
  const displayed = effectiveRecord(record);
  const pending = hasPendingEdit(record.id);
  elements.editorTitle.textContent = displayed.title;
  elements.editorBadge.textContent = pending
    ? "待保存"
    : record.deletedAt
      ? "已删除"
      : "已收录";
  elements.editorBadge.classList.toggle("is-deleted", Boolean(record.deletedAt));
  elements.titleInput.value = displayed.title;
  ratingControl.setValue(displayed.rating);
  elements.recordId.textContent = record.id;
  elements.reviewInput.value = displayed.review ?? "";
  elements.noteInput.value = displayed.note ?? "";
  elements.seasonLabel.textContent = animeDateText(record) || "作品年代未标注";
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
  setDirty(pending);
}

function confirmDiscard() {
  flushCurrentDraft();
  return true;
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
  if (!currentRecord() || state.busy) {
    return false;
  }
  flushCurrentDraft();
  showToast("修改已加入待提交列表；点击“保存并推送”统一提交");
  return true;
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
    const pending = refreshPendingDrafts();
    pending.edits = pending.edits.filter((entry) => !ids.includes(entry.id));
    state.pendingDrafts = writePendingDrafts(pending);
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
  flushCurrentDraft();
  if (!getRuntime().writable) {
    showToast("当前为只读模式，请先连接 GitHub Token", { error: true });
    return;
  }
  const pending = refreshPendingDrafts();
  const count = pendingCount(pending);
  if (!count) {
    showToast("没有待提交的修改或新增记录");
    return;
  }
  setBusy(true);
  elements.syncButton.textContent = "正在同步";
  try {
    const payload = await commitPendingDrafts({
      sync: getRuntime().mode === "local",
    });
    if (!payload.changed) {
      refreshPendingDrafts();
      renderPendingPanel();
      showToast("没有可写入的修改或新增记录，草稿仍保留在浏览器中");
      return;
    }
    refreshRuntimeLibrary();
    await loadLibrary({ quiet: true });
    state.git = await api("/api/status");
    renderGitStatus();
    renderRows();
    renderEditor();
    renderPendingPanel();
    const skipped = payload.skipped ?? [];
    const detail = [
      `已提交 ${payload.updatedRecords?.length ?? 0} 条修改`,
      `新增 ${payload.addedRecords?.length ?? 0} 条`,
      skipped.length ? `跳过 ${skipped.length} 条` : "",
      payload.commit || payload.sync?.commit
        ? `提交 ${(payload.commit || payload.sync.commit).slice(0, 7)}`
        : "",
      payload.syncError ? `推送失败：${payload.syncError}` : "",
    ]
      .filter(Boolean)
      .join("；");
    showToast(
      getRuntime().mode === "github" ? `${detail}；已提交到 GitHub` : detail,
      { error: Boolean(payload.syncError), duration: 7000 },
    );
  } catch (error) {
    showToast(error.message, { error: true });
  } finally {
    setBusy(false);
    renderPendingActions();
  }
}

elements.searchInput.addEventListener("input", () => {
  state.query = elements.searchInput.value;
  state.page = 1;
  renderRows();
});

for (const [element, key] of [
  [elements.libraryStatusFilter, "status"],
  [elements.libraryRatingMin, "ratingMin"],
  [elements.libraryRatingMax, "ratingMax"],
  [elements.libraryYearMin, "yearMin"],
  [elements.libraryYearMax, "yearMax"],
  [elements.libraryCreatedFrom, "createdFrom"],
  [elements.libraryCreatedTo, "createdTo"],
  [elements.librarySort, "sort"],
]) {
  element.addEventListener("input", () => {
    state[key] = element.value;
    state.page = 1;
    renderRows();
  });
}

elements.libraryFilterReset.addEventListener("click", () => {
  const defaults = {
    query: "",
    status: "all",
    ratingMin: "",
    ratingMax: "",
    yearMin: "",
    yearMax: "",
    createdFrom: "",
    createdTo: "",
    sort: "created-desc",
  };
  Object.assign(state, defaults, { page: 1 });
  elements.searchInput.value = defaults.query;
  elements.libraryStatusFilter.value = defaults.status;
  elements.libraryRatingMin.value = defaults.ratingMin;
  elements.libraryRatingMax.value = defaults.ratingMax;
  elements.libraryYearMin.value = defaults.yearMin;
  elements.libraryYearMax.value = defaults.yearMax;
  elements.libraryCreatedFrom.value = defaults.createdFrom;
  elements.libraryCreatedTo.value = defaults.createdTo;
  elements.librarySort.value = defaults.sort;
  renderRows();
});

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
  input.addEventListener("input", scheduleCurrentDraft);
  input.addEventListener("blur", flushCurrentDraft);
}

elements.libraryPageSize.addEventListener("change", () => {
  if (elements.libraryPageSize.value === "custom") {
    elements.libraryPageSizeCustom.hidden = false;
    elements.libraryPageSizeCustom.value = String(state.pageSize);
    elements.libraryPageSizeCustom.focus();
  } else {
    elements.libraryPageSizeCustom.hidden = true;
    state.pageSize = Number(elements.libraryPageSize.value);
  }
  state.page = 1;
  renderRows();
});

elements.libraryPageSizeCustom.addEventListener("change", () => {
  const pageSize = Number(elements.libraryPageSizeCustom.value);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    showToast("自定义每页数量必须是 1 到 200 的整数", { error: true });
    elements.libraryPageSizeCustom.value = String(state.pageSize);
    return;
  }
  state.pageSize = pageSize;
  state.page = 1;
  renderRows();
});

for (const button of document.querySelectorAll('[data-layout-target="library"]')) {
  button.addEventListener("click", () => {
    state.layout = button.dataset.layout;
    for (const candidate of document.querySelectorAll('[data-layout-target="library"]')) {
      candidate.classList.toggle("is-active", candidate === button);
      candidate.setAttribute("aria-pressed", String(candidate === button));
    }
    renderRows();
  });
}

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
elements.editorForm.addEventListener("change", flushCurrentDraft);
elements.editorForm.addEventListener("focusout", flushCurrentDraft);
elements.pendingClear.addEventListener("click", () => {
  if (pendingCount(state.pendingDrafts) && window.confirm("确定清空全部待提交草稿吗？")) {
    clearPendingDrafts();
    refreshPendingDrafts();
    renderPendingPanel();
    renderPendingActions();
    renderEditor();
  }
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
  flushCurrentDraft();
  state.dirty = pendingCount() > 0;
  renderEditor();
});

window.addEventListener("anime-pending:open", (event) => {
  const recordId = event.detail?.recordId;
  if (!recordId || !state.records.some((record) => record.id === recordId)) {
    return;
  }
  flushCurrentDraft();
  state.selectedId = recordId;
  revealRecordPage(recordId);
  renderRows();
  renderEditor();
});

window.addEventListener("anime-pending:committed", () => {
  refreshPendingDrafts();
  renderPendingPanel();
  renderPendingActions();
});

window.addEventListener("anime-pending:changed", (event) => {
  refreshPendingDrafts();
  updatePendingSummary();
  if (event.detail?.source !== "editor") {
    replaceChildrenSafe("待提交记录", elements.pendingList, ...pendingRows());
  }
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
    refreshPendingDrafts();
    await loadLibrary({ quiet: true });
    renderPendingPanel();
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
  refreshPendingDrafts();
  renderPendingPanel();
  if (!getRuntime().writable) {
    state.selectedIds.clear();
  }
  try {
    await loadLibrary({ quiet: true });
  } catch (error) {
    showToast(error.message, { error: true, duration: 7000 });
  }
});

window.addEventListener("beforeunload", () => {
  flushCurrentDraft();
});

refreshPendingDrafts();
renderPendingPanel();
renderPendingActions();
loadLibrary({ quiet: true })
  .then(() => renderEditor())
  .catch((error) => {
    showToast(error.message, { error: true, duration: 8000 });
  });
