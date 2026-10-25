(() => {
  const section = document.querySelector("#repository-compare");
  if (!section) {
    return;
  }

  const form = document.querySelector("#compareForm");
  const repositoryInput = document.querySelector("#peerRepository");
  const branchInput = document.querySelector("#peerBranch");
  const submitButton = document.querySelector("#compareSubmit");
  const shareButton = document.querySelector("#shareComparison");
  const status = document.querySelector("#compareStatus");
  const results = document.querySelector("#compareResults");
  const currentTotal = document.querySelector("#currentTotal");
  const currentAverage = document.querySelector("#currentAverage");
  const peerTotal = document.querySelector("#peerTotal");
  const peerAverage = document.querySelector("#peerAverage");
  const sharedTotal = document.querySelector("#sharedTotal");
  const overlapPercent = document.querySelector("#overlapPercent");
  const overlapBar = document.querySelector("#overlapBar");
  const sharedCount = document.querySelector("#sharedCount");
  const currentOnlyCount = document.querySelector("#currentOnlyCount");
  const peerOnlyCount = document.querySelector("#peerOnlyCount");
  const sharedList = document.querySelector("#sharedList");
  const currentOnlyList = document.querySelector("#currentOnlyList");
  const peerOnlyList = document.querySelector("#peerOnlyList");
  const ratingDifferenceList = document.querySelector("#ratingDifferenceList");
  const ownRepository = section.dataset.ownRepository.trim();
  const ownBranch = section.dataset.ownBranch.trim() || "main";
  const currentDataUrl = section.dataset.currentDataUrl;
  const storageKey = "anime-records:repository-peers";
  const maximumPayloadLength = 8 * 1024 * 1024;
  const listLimit = 12;
  const ratingDifferenceLimit = 10;
  let busy = false;

  function setStatus(message, state = "") {
    status.textContent = message;
    if (state) {
      status.dataset.state = state;
    } else {
      delete status.dataset.state;
    }
  }

  function normalizeRepository(value) {
    let candidate = String(value ?? "").trim();
    if (!candidate) {
      throw new Error("请输入对方 GitHub 仓库");
    }
    if (/^https?:\/\//iu.test(candidate)) {
      let parsed;
      try {
        parsed = new URL(candidate);
      } catch {
        throw new Error("GitHub 仓库地址格式不正确");
      }
      if (!["github.com", "www.github.com"].includes(parsed.hostname.toLowerCase())) {
        throw new Error("只支持 github.com 仓库");
      }
      candidate = parsed.pathname;
    }
    candidate = candidate
      .replace(/^\/+|\/+$/gu, "")
      .replace(/\.git$/iu, "");
    const match = candidate.match(
      /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u,
    );
    if (
      !match ||
      match[1].length > 100 ||
      match[2].length > 100 ||
      [".", ".."].includes(match[1]) ||
      [".", ".."].includes(match[2])
    ) {
      throw new Error("仓库格式应为 owner/repository");
    }
    return `${match[1]}/${match[2]}`;
  }

  function normalizeBranch(value) {
    const branch = String(value ?? "").trim();
    const segments = branch.split("/");
    if (
      !branch ||
      branch.length > 200 ||
      !/^[A-Za-z0-9._/-]+$/u.test(branch) ||
      branch.startsWith("/") ||
      branch.endsWith("/") ||
      segments.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          segment.startsWith(".") ||
          segment.endsWith("."),
      )
    ) {
      throw new Error("分支名称格式不正确");
    }
    return branch;
  }

  function rawIndexUrl(repository, branch) {
    const [owner, repo] = repository.split("/").map(encodeURIComponent);
    const branchPath = branch.split("/").map(encodeURIComponent).join("/");
    return `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${branchPath}/data/anime-index.jsonl`;
  }

  async function fetchText(url, label) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json, text/plain;q=0.9" },
    });
    if (!response.ok) {
      throw new Error(`${label}读取失败（HTTP ${response.status}）`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (declaredLength > maximumPayloadLength) {
      throw new Error(`${label}超过 8 MiB，已停止读取`);
    }
    const text = await response.text();
    if (text.length > maximumPayloadLength) {
      throw new Error(`${label}超过 8 MiB，已停止读取`);
    }
    return text;
  }

  async function loadCurrentItems() {
    const text = await fetchText(
      new URL(currentDataUrl, window.location.href),
      "当前档案",
    );
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("当前档案数据格式不正确");
    }
    if (!Array.isArray(payload.items)) {
      throw new Error("当前档案缺少 items 数组");
    }
    return payload.items.filter((item) => !item.deletedAt);
  }

  async function loadPeerItems(repository, branch) {
    const text = await fetchText(
      rawIndexUrl(repository, branch),
      "对方索引",
    );
    const items = [];
    for (const [index, line] of text.split(/\r?\n/u).entries()) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let item;
      try {
        item = JSON.parse(trimmed);
      } catch {
        throw new Error(`对方索引第 ${index + 1} 行不是有效 JSON`);
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`对方索引第 ${index + 1} 行不是对象`);
      }
      if (!item.deletedAt) {
        items.push(item);
      }
    }
    return items;
  }

  function itemKeys(item) {
    const keys = new Set();
    if (item?.id) {
      keys.add(`id:${item.id}`);
    }
    for (const [source, id] of Object.entries(item?.externalIds ?? {})) {
      if (id) {
        keys.add(`${source}:${id}`);
      }
    }
    return [...keys];
  }

  function compactItem(item) {
    return {
      id: item.id,
      title: item.title || item.id || "未命名作品",
      rating:
        item.rating === null || item.rating === undefined
          ? null
          : Number(item.rating),
      season: item.season ?? null,
      externalIds: item.externalIds ?? {},
    };
  }

  function average(items) {
    const ratings = items
      .map((item) => item.rating)
      .filter((rating) => Number.isFinite(rating));
    if (!ratings.length) {
      return null;
    }
    return (
      Math.round(
        (ratings.reduce((total, rating) => total + rating, 0) / ratings.length) *
          10,
      ) / 10
    );
  }

  function compareItems(currentItems, peerItems) {
    const current = currentItems
      .filter((item) => item && item.id)
      .map(compactItem);
    const peer = peerItems
      .filter((item) => item && item.id)
      .map(compactItem);
    const peerLookup = new Map();
    for (const item of peer) {
      for (const key of itemKeys(item)) {
        if (!peerLookup.has(key)) {
          peerLookup.set(key, item);
        }
      }
    }

    const matchedPeerIds = new Set();
    const shared = [];
    const currentOnly = [];
    for (const item of current) {
      const match = itemKeys(item)
        .map((key) => peerLookup.get(key))
        .find(
          (candidate) =>
            candidate && !matchedPeerIds.has(candidate.id),
        );
      if (!match) {
        currentOnly.push(item);
        continue;
      }
      matchedPeerIds.add(match.id);
      const ratingDifference =
        Number.isFinite(item.rating) && Number.isFinite(match.rating)
          ? Math.round((item.rating - match.rating) * 10) / 10
          : null;
      shared.push({
        ...item,
        peerTitle: match.title,
        peerRating: match.rating,
        ratingDifference,
      });
    }
    const peerOnly = peer.filter((item) => !matchedPeerIds.has(item.id));
    const unionSize = current.length + peerOnly.length;
    const ratingDifferences = shared
      .filter((item) => item.ratingDifference !== null)
      .sort(
        (left, right) =>
          Math.abs(right.ratingDifference) -
          Math.abs(left.ratingDifference),
      );

    return {
      current,
      peer,
      shared,
      currentOnly,
      peerOnly,
      ratingDifferences,
      overlapPercent: unionSize
        ? Math.round((shared.length / unionSize) * 1000) / 10
        : 0,
    };
  }

  function seasonLabel(season) {
    return (
      season?.label ||
      (season?.number ? `第${season.number}季` : "") ||
      (season?.year ? String(season.year) : "")
    );
  }

  function ratingLabel(rating) {
    return Number.isFinite(rating) ? rating.toFixed(1) : "—";
  }

  function createTextElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    element.textContent = text;
    return element;
  }

  function renderSimpleList(container, items, total, mode) {
    container.replaceChildren();
    for (const item of items.slice(0, listLimit)) {
      const row = document.createElement("div");
      row.className = "compare-item";
      row.append(createTextElement("strong", "", item.title));
      const meta = [
        seasonLabel(item.season),
        `评分 ${ratingLabel(item.rating)}`,
        mode === "shared"
          ? `对方 ${ratingLabel(item.peerRating)}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
      row.append(createTextElement("span", "", meta));
      container.append(row);
    }
    if (!items.length) {
      container.append(
        createTextElement("p", "compare-empty", "暂无作品"),
      );
    } else if (total > items.slice(0, listLimit).length) {
      container.append(
        createTextElement(
          "p",
          "compare-more",
          `另有 ${total - listLimit} 部未展开`,
        ),
      );
    }
  }

  function renderRatingDifferences(items) {
    ratingDifferenceList.replaceChildren();
    for (const item of items.slice(0, ratingDifferenceLimit)) {
      const row = document.createElement("div");
      row.className = "rating-difference-item";
      const copy = document.createElement("div");
      copy.append(createTextElement("strong", "", item.title));
      copy.append(
        createTextElement(
          "span",
          "",
          `当前 ${ratingLabel(item.rating)} · 对方 ${ratingLabel(item.peerRating)}`,
        ),
      );
      const difference = item.ratingDifference;
      const value = createTextElement(
        "span",
        `rating-difference-value ${
          difference > 0 ? "is-positive" : "is-negative"
        }`,
        `${difference > 0 ? "+" : ""}${difference.toFixed(1)}`,
      );
      row.append(copy, value);
      ratingDifferenceList.append(row);
    }
    if (!items.length) {
      ratingDifferenceList.append(
        createTextElement(
          "p",
          "compare-empty",
          "共同作品中还没有双方都已评分的条目",
        ),
      );
    }
  }

  function renderComparison(comparison) {
    currentTotal.textContent = comparison.current.length.toLocaleString("zh-CN");
    peerTotal.textContent = comparison.peer.length.toLocaleString("zh-CN");
    sharedTotal.textContent = comparison.shared.length.toLocaleString("zh-CN");
    currentAverage.textContent = `均分 ${
      average(comparison.current)?.toFixed(1) ?? "—"
    }`;
    peerAverage.textContent = `均分 ${
      average(comparison.peer)?.toFixed(1) ?? "—"
    }`;
    overlapPercent.textContent = `重合率 ${comparison.overlapPercent}%`;
    overlapBar.style.width = `${comparison.overlapPercent}%`;
    sharedCount.textContent = String(comparison.shared.length);
    currentOnlyCount.textContent = String(comparison.currentOnly.length);
    peerOnlyCount.textContent = String(comparison.peerOnly.length);
    renderSimpleList(
      sharedList,
      comparison.shared,
      comparison.shared.length,
      "shared",
    );
    renderSimpleList(
      currentOnlyList,
      comparison.currentOnly,
      comparison.currentOnly.length,
      "only",
    );
    renderSimpleList(
      peerOnlyList,
      comparison.peerOnly,
      comparison.peerOnly.length,
      "only",
    );
    renderRatingDifferences(comparison.ratingDifferences);
    results.hidden = false;
  }

  function rememberPeer(repository, branch) {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ repository, branch }),
      );
    } catch {
      // Private browsing can disable storage; the comparison still works.
    }
  }

  function syncUrl(repository, branch) {
    const url = new URL(window.location.href);
    url.searchParams.set("peer", repository);
    url.searchParams.set("branch", branch);
    window.history.replaceState(null, "", url);
  }

  function setBusy(value) {
    busy = value;
    submitButton.disabled = value;
    submitButton.textContent = value ? "正在比对" : "开始 PK";
    submitButton.classList.toggle("is-loading", value);
  }

  async function compare(event) {
    event?.preventDefault();
    if (busy) {
      return;
    }

    let repository;
    let branch;
    try {
      repository = normalizeRepository(repositoryInput.value);
      branch = normalizeBranch(branchInput.value);
    } catch (error) {
      setStatus(error.message, "error");
      return;
    }

    repositoryInput.value = repository;
    branchInput.value = branch;
    setBusy(true);
    results.hidden = true;
    setStatus(`正在读取 ${repository} 的公开轻量索引…`, "loading");

    try {
      const [currentItems, peerItems] = await Promise.all([
        loadCurrentItems(),
        loadPeerItems(repository, branch),
      ]);
      const comparison = compareItems(currentItems, peerItems);
      renderComparison(comparison);
      rememberPeer(repository, branch);
      syncUrl(repository, branch);
      setStatus(
        `已读取 ${repository}@${branch}，匹配 ${comparison.shared.length} 部共同作品。`,
      );
    } catch (error) {
      setStatus(
        error.message || "仓库比对失败，请检查仓库、分支与公开访问设置。",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) {
      throw new Error("浏览器未允许复制");
    }
  }

  async function shareComparison() {
    if (!ownRepository) {
      setStatus("请先在 config/site.json 配置 GitHub 仓库。", "error");
      return;
    }
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("peer", ownRepository);
    url.searchParams.set("branch", ownBranch);
    const label = shareButton.querySelector("span");
    const original = label.textContent;
    shareButton.disabled = true;
    try {
      await copyText(url.toString());
      shareButton.classList.add("is-success");
      label.textContent = "邀请链接已复制";
      setStatus("邀请链接已复制，打开后会填入你的分享仓库。");
      window.setTimeout(() => {
        shareButton.classList.remove("is-success");
        label.textContent = original;
        shareButton.disabled = false;
      }, 2200);
    } catch (error) {
      shareButton.disabled = false;
      setStatus(error.message || "复制失败，请手动复制浏览器地址。", "error");
    }
  }

  form.addEventListener("submit", compare);
  shareButton.addEventListener("click", shareComparison);

  const params = new URLSearchParams(window.location.search);
  let remembered = null;
  try {
    remembered = JSON.parse(window.localStorage.getItem(storageKey) || "null");
  } catch {
    remembered = null;
  }
  const sharedPeer = params.get("peer");
  repositoryInput.value =
    sharedPeer || remembered?.repository || "";
  branchInput.value =
    params.get("branch") || remembered?.branch || "main";

  if (sharedPeer) {
    setStatus("已填入分享者仓库，正在准备比对…");
    window.setTimeout(() => form.requestSubmit(), 0);
  } else if (remembered?.repository) {
    setStatus("已恢复上次使用的对比仓库。");
  }
})();
