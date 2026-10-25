const state = {
  groups: [],
  selectedIds: new Set(),
  loading: false,
};

const elements = {
  groupCount: document.querySelector("#duplicateGroupCount"),
  status: document.querySelector("#duplicateStatus"),
  refreshButton: document.querySelector("#duplicateRefresh"),
  selectionLabel: document.querySelector("#duplicateSelectionLabel"),
  deleteButton: document.querySelector("#duplicateDeleteButton"),
  groups: document.querySelector("#duplicateGroups"),
  empty: document.querySelector("#duplicateEmpty"),
  toast: document.querySelector("#toast"),
};

let toastTimer = null;

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

function seasonText(season) {
  if (season?.label) {
    return season.label;
  }
  if (season?.number) {
    return `第${season.number}季`;
  }
  return "季度未标注";
}

function reasonLabel(reason) {
  if (reason === "title-exact") {
    return "同季度标题完全相同";
  }
  if (reason.startsWith("title-similar:")) {
    return `标题高度相似 ${reason.split(":")[1]}`;
  }
  if (reason.startsWith("external-id:")) {
    return `站点 ID 相同 · ${reason.slice("external-id:".length)}`;
  }
  return reason;
}

function sourceText(externalIds) {
  const entries = Object.entries(externalIds ?? {});
  return entries.length
    ? entries.map(([source, id]) => `${source}:${id}`).join(" · ")
    : "无站点索引";
}

function createCover(member) {
  const cover = document.createElement("span");
  cover.className = "duplicate-cover";
  const fallback = document.createElement("span");
  fallback.textContent = [...member.title][0] ?? "A";
  cover.append(fallback);
  if (member.coverUrl) {
    const image = document.createElement("img");
    image.src = member.coverUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove(), { once: true });
    cover.append(image);
  }
  return cover;
}

function renderSelection() {
  const count = state.selectedIds.size;
  elements.selectionLabel.textContent = count
    ? `已选择 ${count} 条记录`
    : "未选择重复记录";
  elements.deleteButton.disabled = state.loading || count === 0;
}

function toggleRecord(recordId, checked) {
  if (checked) {
    state.selectedIds.add(recordId);
  } else {
    state.selectedIds.delete(recordId);
  }
  renderGroups();
}

function editRecord(recordId) {
  document.querySelector('[data-view="library"]')?.click();
  window.dispatchEvent(
    new CustomEvent("anime-library:edit", { detail: { recordId } }),
  );
}

function createMemberRow(member) {
  const row = document.createElement("div");
  const picked = state.selectedIds.has(member.id);
  row.className = "duplicate-member";
  row.classList.toggle("is-selected", picked);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = picked;
  checkbox.setAttribute("aria-label", `选择 ${member.title}`);
  checkbox.addEventListener("change", () => {
    toggleRecord(member.id, checkbox.checked);
  });
  row.append(checkbox, createCover(member));

  const copy = document.createElement("div");
  copy.className = "duplicate-member-copy";
  const title = document.createElement("strong");
  title.textContent = member.title;
  const meta = document.createElement("span");
  meta.textContent = [
    `评分 ${member.rating === null ? "未评分" : Number(member.rating).toFixed(1)}`,
    seasonText(member.season),
    member.season?.year || "年份未知",
  ].join(" · ");
  const identity = document.createElement("code");
  identity.textContent = `${member.id} · ${sourceText(member.externalIds)}`;
  copy.append(title, meta, identity);
  row.append(copy);

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "button button-quiet duplicate-edit";
  editButton.textContent = "编辑";
  editButton.addEventListener("click", () => editRecord(member.id));
  row.append(editButton);
  return row;
}

function createGroup(group) {
  const section = document.createElement("section");
  section.className = `duplicate-group is-${group.severity}`;
  const heading = document.createElement("div");
  heading.className = "duplicate-group-heading";

  const selectAllLabel = document.createElement("label");
  selectAllLabel.className = "duplicate-group-select";
  const selectAll = document.createElement("input");
  selectAll.type = "checkbox";
  const memberIds = group.members.map((member) => member.id);
  const selectedCount = memberIds.filter((id) =>
    state.selectedIds.has(id),
  ).length;
  selectAll.checked = memberIds.length > 0 && selectedCount === memberIds.length;
  selectAll.indeterminate =
    selectedCount > 0 && selectedCount < memberIds.length;
  selectAll.setAttribute("aria-label", "选择本组全部记录");
  selectAll.addEventListener("change", () => {
    for (const id of memberIds) {
      if (selectAll.checked) {
        state.selectedIds.add(id);
      } else {
        state.selectedIds.delete(id);
      }
    }
    renderGroups();
  });
  const selectedLabel = document.createElement("span");
  selectedLabel.textContent = `本组 ${memberIds.length} 条`;
  selectAllLabel.append(selectAll, selectedLabel);

  const title = document.createElement("div");
  title.className = "duplicate-group-title";
  const badge = document.createElement("span");
  badge.className = "duplicate-severity";
  badge.textContent =
    group.severity === "confirmed" ? "确定重复" : "疑似重复";
  const headingText = document.createElement("strong");
  headingText.textContent = group.members[0]?.title ?? "重复记录";
  title.append(badge, headingText);
  heading.append(selectAllLabel, title);
  section.append(heading);

  const reasons = document.createElement("div");
  reasons.className = "duplicate-reasons";
  for (const reason of group.reasons) {
    const item = document.createElement("span");
    item.textContent = reasonLabel(reason);
    reasons.append(item);
  }
  section.append(reasons);

  const members = document.createElement("div");
  members.className = "duplicate-members";
  members.append(...group.members.map(createMemberRow));
  section.append(members);
  return section;
}

function renderGroups() {
  elements.groupCount.textContent = String(state.groups.length);
  elements.groups.replaceChildren(...state.groups.map(createGroup));
  elements.empty.hidden = state.loading || state.groups.length > 0;
  elements.groups.hidden = state.loading || state.groups.length === 0;
  renderSelection();
}

async function loadDuplicates() {
  if (state.loading) {
    return;
  }
  state.loading = true;
  elements.refreshButton.disabled = true;
  elements.refreshButton.classList.add("is-loading");
  elements.status.textContent = "正在读取完整 JSONL 并检查重复项";
  renderSelection();
  try {
    const payload = await api("/api/duplicates");
    state.groups = payload.groups ?? [];
    const visibleIds = new Set(
      state.groups.flatMap((group) =>
        group.members.map((member) => member.id),
      ),
    );
    for (const id of state.selectedIds) {
      if (!visibleIds.has(id)) {
        state.selectedIds.delete(id);
      }
    }
    const confirmedCount = state.groups.filter(
      (group) => group.severity === "confirmed",
    ).length;
    elements.status.textContent = [
      `检查 ${payload.recordCount ?? 0} 条记录`,
      `确定重复 ${confirmedCount} 组`,
      `疑似重复 ${state.groups.length - confirmedCount} 组`,
    ].join(" · ");
  } catch (error) {
    state.groups = [];
    elements.status.textContent = error.message;
    showToast(error.message, { error: true, duration: 7000 });
  } finally {
    state.loading = false;
    elements.refreshButton.disabled = false;
    elements.refreshButton.classList.remove("is-loading");
    renderGroups();
  }
}

async function deleteSelected() {
  if (!state.selectedIds.size || state.loading) {
    return;
  }
  const ids = [...state.selectedIds];
  if (
    !window.confirm(
      `确定删除所选 ${ids.length} 条记录吗？覆盖前会创建备份快照。`,
    )
  ) {
    return;
  }
  state.loading = true;
  elements.deleteButton.disabled = true;
  elements.deleteButton.classList.add("is-loading");
  try {
    await api("/api/records", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    });
    state.selectedIds.clear();
    window.dispatchEvent(new CustomEvent("anime-library:changed"));
    showToast(`已删除 ${ids.length} 条记录并写入备份`);
    state.loading = false;
    await loadDuplicates();
  } catch (error) {
    showToast(error.message, { error: true });
  } finally {
    state.loading = false;
    elements.deleteButton.classList.remove("is-loading");
    renderSelection();
  }
}

elements.refreshButton.addEventListener("click", loadDuplicates);
elements.deleteButton.addEventListener("click", deleteSelected);
window.addEventListener("anime-duplicates:activate", loadDuplicates);
window.addEventListener("anime-library:changed", () => {
  if (!document.querySelector("#duplicateWorkspace")?.hidden) {
    loadDuplicates();
  }
});
