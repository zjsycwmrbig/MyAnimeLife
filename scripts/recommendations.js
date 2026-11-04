(() => {
  const section = document.querySelector("[data-anime-recommendations]");
  if (!section) return;

  const endpoint = section.dataset.recommendationsEndpoint;
  const profile = section.querySelector("[data-recommendation-profile]");
  const status = section.querySelector("[data-recommendation-status]");
  const grid = section.querySelector("[data-recommendation-grid]");
  const pagination = section.querySelector("[data-recommendation-pagination]");
  const summary = section.querySelector("[data-recommendation-summary]");
  const pages = section.querySelector("[data-recommendation-pages]");
  const previousButton = section.querySelector('[data-recommendation-page="previous"]');
  const nextButton = section.querySelector('[data-recommendation-page="next"]');
  const modeButtons = [...section.querySelectorAll("[data-recommendation-mode]")];

  if (!endpoint || !profile || !status || !grid || !pagination) return;

  const PAGE_SIZE = 12;
  const DETAIL_CACHE_KEY = "myanimelife.recommendation-details.v1";
  const DETAIL_TTL = 7 * 24 * 60 * 60 * 1000;
  const DETAIL_FAILURE_TTL = 60 * 60 * 1000;
  const DETAIL_CONCURRENCY = 2;
  const typeLabels = {
    tv: "TV",
    ova: "OVA",
    oad: "OAD",
    web: "WEB",
    movie: "剧场版",
    tv_sp: "TV 特别篇",
    tv_short: "短篇",
  };
  const detailCache = readDetailCache();
  const detailQueue = [];
  const pendingDetails = new Set();
  const seenCards = new WeakSet();
  let payload = null;
  let mode = "recommended";
  let page = 1;
  let activeDetailRequests = 0;

  function createElement(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function safeCoverUrl(value) {
    const candidate = String(value ?? "").trim();
    if (!candidate) return "";
    try {
      const url = new URL(candidate, window.location.href);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function readDetailCache() {
    try {
      const value = JSON.parse(localStorage.getItem(DETAIL_CACHE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch {
      return {};
    }
  }

  function writeDetailCache() {
    const recent = Object.entries(detailCache)
      .sort(([, left], [, right]) => Number(right?.fetchedAt) - Number(left?.fetchedAt))
      .slice(0, 120);
    for (const key of Object.keys(detailCache)) delete detailCache[key];
    for (const [key, value] of recent) detailCache[key] = value;
    try {
      localStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(detailCache));
    } catch {
      // The recommendation shelf remains usable without storage access.
    }
  }

  function freshDetail(subjectId) {
    const cached = detailCache[subjectId];
    if (!cached) return null;
    const ttl = cached.error ? DETAIL_FAILURE_TTL : DETAIL_TTL;
    if (Date.now() - Number(cached.fetchedAt) > ttl) return null;
    return cached;
  }

  function rememberDetail(subjectId, value) {
    detailCache[subjectId] = {
      summary: String(value.summary ?? "").trim(),
      coverUrl: safeCoverUrl(value.coverUrl),
      fetchedAt: Date.now(),
      error: Boolean(value.error),
    };
    writeDetailCache();
  }

  function appendCover(cover, item) {
    const url = safeCoverUrl(item.coverUrl);
    for (const child of [...cover.children]) {
      if (child.matches("img, .recommendation-cover-fallback")) child.remove();
    }
    const fallback = createElement("span", "recommendation-cover-fallback", item.title);
    fallback.setAttribute("aria-hidden", "true");
    cover.append(fallback);
    if (!url) return;
    const image = document.createElement("img");
    image.src = url;
    image.alt = "";
    image.title = `${item.title} 封面`;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("load", () => image.dataset.loaded = "true", { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });
    cover.append(image);
  }

  function itemMeta(item) {
    return [
      Number.isInteger(item.year) ? String(item.year) : "",
      item.seasonLabel || "",
      item.type && item.type !== "unknown"
        ? typeLabels[String(item.type).toLowerCase()] || item.type
        : "",
    ].filter(Boolean);
  }

  function sortedItems() {
    const items = [...(payload?.items ?? [])];
    if (mode === "acclaimed") {
      items.sort(
        (left, right) =>
          Number(right.qualityScore) - Number(left.qualityScore) ||
          Number(right.ratingCount) - Number(left.ratingCount) ||
          Number(right.recommendationScore) - Number(left.recommendationScore),
      );
    } else if (mode === "explore") {
      items.sort(
        (left, right) =>
          Number(right.tagMatch) - Number(left.tagMatch) ||
          Number(left.popularityScore) - Number(right.popularityScore) ||
          Number(right.qualityScore) - Number(left.qualityScore),
      );
    }
    return items;
  }

  function profileModeLabel(value) {
    if (value === "personalized") return "口味匹配已启用";
    if (value === "limited") return "轻量个性化";
    return "公共口碑推荐";
  }

  function renderProfile() {
    profile.replaceChildren();
    const heading = createElement("div", "recommendation-profile-heading");
    const badge = createElement(
      "strong",
      `recommendation-profile-mode is-${payload.mode || "public"}`,
      profileModeLabel(payload.mode),
    );
    const meta = createElement("span", "recommendation-profile-meta");
    const ratedCount = Math.max(0, Number(payload.profile?.ratedCount) || 0);
    const personalAverage = numberOrNull(payload.profile?.personalAverage);
    meta.textContent = ratedCount
      ? `已分析 ${ratedCount} 部评分${personalAverage === null ? "" : ` · 平均 ${personalAverage.toFixed(1)}`}`
      : "尚无评分，先按公共口碑推荐";
    heading.append(badge, meta);
    profile.append(heading);

    const tags = Array.isArray(payload.profile?.topTags)
      ? payload.profile.topTags.slice(0, 8)
      : [];
    if (tags.length) {
      const tagList = createElement("div", "recommendation-profile-tags");
      for (const tag of tags) {
        const chip = createElement("span", "recommendation-profile-tag");
        chip.append(
          createElement("span", "", tag.name),
          createElement("small", "", `${Math.max(1, Number(tag.count) || 1)} 部`),
        );
        tagList.append(chip);
      }
      profile.append(tagList);
    } else {
      profile.append(
        createElement(
          "p",
          "recommendation-profile-empty",
          "继续补充评分后，这里会显示更明确的标签偏好。",
        ),
      );
    }
  }

  function createCard(item) {
    const card = createElement("article", "recommendation-card");
    const link = createElement("a", "recommendation-card-link");
    link.href = `https://bgm.tv/subject/${encodeURIComponent(item.subjectId)}`;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.setAttribute("aria-label", `查看《${item.title}》的 Bangumi 条目`);

    const cover = createElement("div", "recommendation-cover");
    appendCover(cover, item);
    const publicScore = numberOrNull(item.score);
    if (publicScore !== null) {
      const score = createElement("span", "recommendation-public-score");
      score.append(
        createElement("small", "", "BGM"),
        createElement("strong", "", publicScore.toFixed(1)),
      );
      cover.append(score);
    }

    const body = createElement("div", "recommendation-card-body");
    const meta = createElement("div", "recommendation-card-meta");
    meta.append(...itemMeta(item).map((value) => createElement("span", "", value)));
    if (Number(item.ratingCount) > 0) {
      meta.append(
        createElement(
          "span",
          "",
          `${Number(item.ratingCount).toLocaleString("zh-CN")} 人评分`,
        ),
      );
    }
    const title = createElement("h3", "", item.title);
    const originalTitle = createElement(
      "p",
      "recommendation-original-title",
      item.originalTitle && item.originalTitle !== item.title ? item.originalTitle : "",
    );
    originalTitle.hidden = !originalTitle.textContent;

    const reason = createElement("p", "recommendation-reason", item.reason);
    const tags = createElement("ul", "recommendation-tags");
    const matchedNames = new Set(
      (item.matchedTags ?? []).map((tag) => String(tag.name)),
    );
    for (const tag of (item.tags ?? []).slice(0, 6)) {
      tags.append(
        createElement(
          "li",
          matchedNames.has(tag) ? "is-match" : "",
          String(tag),
        ),
      );
    }
    const detail = createElement(
      "p",
      "recommendation-summary",
      item.summary || "正在读取 Bangumi 简介…",
    );
    body.append(meta, title, originalTitle, reason, tags, detail);
    link.append(cover, body);
    card.append(link);
    observeDetail(item, detail, cover);
    return card;
  }

  function applyDetail(item, elements, value) {
    if (value?.summary) {
      item.summary = value.summary;
      if (elements.detail?.isConnected) elements.detail.textContent = value.summary;
    } else if (value?.error && elements.detail?.isConnected) {
      elements.detail.textContent = "暂时无法读取 Bangumi 简介。";
    }
    if (value?.coverUrl && !safeCoverUrl(item.coverUrl)) {
      item.coverUrl = value.coverUrl;
      if (elements.cover?.isConnected) appendCover(elements.cover, item);
    }
  }

  function observeDetail(item, detail, cover) {
    const elements = { detail, cover };
    const cached = freshDetail(item.subjectId);
    if (cached) {
      applyDetail(item, elements, cached);
      return;
    }
    if (!("IntersectionObserver" in window)) {
      enqueueDetail(item, elements);
      return;
    }
    const card = detail.closest(".recommendation-card");
    if (!card || seenCards.has(card)) return;
    seenCards.add(card);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        enqueueDetail(item, elements);
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(card);
  }

  function enqueueDetail(item, elements) {
    if (pendingDetails.has(item.subjectId)) return;
    pendingDetails.add(item.subjectId);
    detailQueue.push({ item, elements });
    pumpDetails();
  }

  function pumpDetails() {
    while (activeDetailRequests < DETAIL_CONCURRENCY && detailQueue.length) {
      const task = detailQueue.shift();
      activeDetailRequests += 1;
      loadDetail(task.item)
        .then((value) => applyDetail(task.item, task.elements, value))
        .catch(() => applyDetail(task.item, task.elements, { error: true }))
        .finally(() => {
          activeDetailRequests -= 1;
          pendingDetails.delete(task.item.subjectId);
          pumpDetails();
        });
    }
  }

  async function loadDetail(item) {
    const cached = freshDetail(item.subjectId);
    if (cached) return cached;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(
        `https://api.bgm.tv/v0/subjects/${encodeURIComponent(item.subjectId)}`,
        {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const detail = await response.json();
      const value = {
        summary: String(detail?.summary ?? "").trim(),
        coverUrl:
          detail?.images?.large ??
          detail?.images?.common ??
          detail?.images?.medium ??
          "",
        error: false,
      };
      if (!value.summary && !value.coverUrl) throw new Error("Bangumi 未返回详情");
      rememberDetail(item.subjectId, value);
      return value;
    } catch (error) {
      const value = { summary: "", coverUrl: "", error: true };
      rememberDetail(item.subjectId, value);
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function pageSequence(current, total) {
    const values = new Set([1, total, current - 1, current, current + 1]);
    return [...values]
      .filter((value) => value >= 1 && value <= total)
      .sort((left, right) => left - right);
  }

  function renderPagination(totalPages, totalItems) {
    if (!summary || !pages || !previousButton || !nextButton) return;
    pagination.hidden = totalItems <= PAGE_SIZE;
    summary.textContent = `第 ${page} / ${totalPages} 页 · 共 ${totalItems} 部推荐`;
    pages.replaceChildren();
    const sequence = pageSequence(page, totalPages);
    let previous = 0;
    for (const value of sequence) {
      if (previous && value - previous > 1) {
        pages.append(createElement("span", "recommendation-page-gap", "…"));
      }
      const button = createElement("button", value === page ? "is-active" : "", String(value));
      button.type = "button";
      button.setAttribute("aria-label", `第 ${value} 页`);
      if (value === page) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => {
        page = value;
        render();
      });
      pages.append(button);
      previous = value;
    }
    previousButton.disabled = page <= 1;
    nextButton.disabled = page >= totalPages;
  }

  function render() {
    if (!payload) return;
    const items = sortedItems();
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;
    grid.replaceChildren(...items.slice(start, start + PAGE_SIZE).map(createCard));
    setStatus(`${items.length} 部候选 · 当前按${mode === "acclaimed" ? " Bangumi 口碑" : mode === "explore" ? "小众标签匹配" : "综合匹配"}排序`);
    renderPagination(totalPages, items.length);
  }

  function setMode(nextMode) {
    mode = ["recommended", "acclaimed", "explore"].includes(nextMode)
      ? nextMode
      : "recommended";
    page = 1;
    for (const button of modeButtons) {
      const active = button.dataset.recommendationMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
    render();
  }

  async function load() {
    setStatus("正在读取推荐索引");
    try {
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = await response.json();
      if (!Array.isArray(value?.items) || !value.items.length) {
        throw new Error("推荐索引为空");
      }
      payload = value;
      renderProfile();
      render();
    } catch (error) {
      grid.replaceChildren();
      const empty = createElement("div", "recommendation-empty");
      empty.append(
        createElement("h3", "", "暂时无法生成推荐"),
        createElement(
          "p",
          "",
          error.message || "请稍后刷新页面，或检查公共索引是否已经生成。",
        ),
      );
      grid.append(empty);
      setStatus("推荐索引读取失败");
    }
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.recommendationMode));
  });
  previousButton?.addEventListener("click", () => {
    page = Math.max(1, page - 1);
    render();
  });
  nextButton?.addEventListener("click", () => {
    page += 1;
    render();
  });

  const start = () => void load();
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(start, { timeout: 1200 });
  } else {
    window.setTimeout(start, 0);
  }
})();
