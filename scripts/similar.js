(() => {
  const section = document.querySelector("[data-similar-anime]");
  if (!section) {
    return;
  }

  const endpoint = section.dataset.similarEndpoint;
  const version = section.dataset.similarVersion ?? "";
  const scopeSwitch = section.querySelector("[data-similar-scope-switch]");
  const sortSelect = section.querySelector("[data-similar-sort]");
  const status = section.querySelector("[data-similar-status]");
  const grid = section.querySelector("[data-similar-grid]");
  const pagination = section.querySelector("[data-similar-pagination]");
  const pageSummary = section.querySelector("[data-similar-page-summary]");
  const pages = section.querySelector("[data-similar-pages]");
  const previousButton = section.querySelector(
    '[data-similar-page="previous"]',
  );
  const nextButton = section.querySelector('[data-similar-page="next"]');
  const scopeButtons = [
    ...section.querySelectorAll("[data-similar-scope]"),
  ];
  const countElements = new Map(
    [...section.querySelectorAll("[data-similar-count]")].map((element) => [
      element.dataset.similarCount,
      element,
    ]),
  );

  if (
    !endpoint ||
    !scopeSwitch ||
    !sortSelect ||
    !status ||
    !grid ||
    !pagination ||
    !pageSummary ||
    !pages ||
    !previousButton ||
    !nextButton
  ) {
    return;
  }

  const PAGE_SIZE = 12;
  const typeLabels = {
    TV: "TV",
    OVA: "OVA",
    OAD: "OAD",
    WEB: "WEB",
    movie: "剧场版",
    TV_SP: "TV 特别篇",
    TV_SHORT: "短篇",
  };
  let recommendations = null;
  let selectedScope = "unowned";
  let selectedSort = "similarity";
  let currentPage = 1;
  let started = false;
  const coverCacheKey = "myanimelife.similar-cover-cache.v1";
  const coverCache = readCoverCache();
  const pendingCovers = new Set();
  const coverQueue = [];
  let activeCoverRequests = 0;

  function createElement(tag, className = "", text = "") {
    const element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (text) {
      element.textContent = text;
    }
    return element;
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function safeCoverUrl(value) {
    const candidate = String(value ?? "").trim();
    if (!candidate) {
      return "";
    }
    if (candidate.startsWith("data:image/")) {
      return candidate;
    }
    try {
      const url = new URL(candidate, window.location.href);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function readCoverCache() {
    try {
      const value = JSON.parse(localStorage.getItem(coverCacheKey) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function rememberCover(subjectId, coverUrl) {
    const now = Date.now();
    coverCache[subjectId] = { coverUrl, checkedAt: now };
    const recent = Object.entries(coverCache)
      .sort(
        ([, left], [, right]) =>
          Number(right?.checkedAt) - Number(left?.checkedAt),
      )
      .slice(0, 120);
    for (const key of Object.keys(coverCache)) {
      delete coverCache[key];
    }
    for (const [key, value] of recent) {
      coverCache[key] = value;
    }
    try {
      localStorage.setItem(coverCacheKey, JSON.stringify(coverCache));
    } catch {
      // Cover caching is an optimization; recommendations remain usable.
    }
  }

  function coverCacheState(subjectId) {
    const cached = coverCache[subjectId];
    if (!cached) {
      return { status: "missing", coverUrl: "" };
    }
    const ttl = cached.coverUrl ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    if (Date.now() - Number(cached.checkedAt) > ttl) {
      return { status: "expired", coverUrl: "" };
    }
    const coverUrl = safeCoverUrl(cached.coverUrl);
    return {
      status: coverUrl ? "available" : "missing",
      coverUrl,
    };
  }

  function appendCoverImage(cover, coverUrl, title) {
    const image = document.createElement("img");
    image.src = coverUrl;
    image.alt = "";
    image.title = `${title} 封面`;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    const loading = createElement("span", "similar-cover-loading");
    loading.setAttribute("aria-hidden", "true");
    cover.append(image, loading);
    image.addEventListener("load", () => {
      loading.hidden = true;
      image.dataset.loaded = "true";
    });
    image.addEventListener("error", () => {
      loading.hidden = true;
      image.remove();
    });
  }

  async function fetchBangumiCover(subjectId) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(
        `https://api.bgm.tv/v0/subjects/${encodeURIComponent(subjectId)}`,
        {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      return safeCoverUrl(
        payload?.images?.large ??
          payload?.images?.common ??
          payload?.images?.medium,
      );
    } finally {
      window.clearTimeout(timer);
    }
  }

  function pumpCoverQueue() {
    while (activeCoverRequests < 3 && coverQueue.length) {
      const task = coverQueue.shift();
      activeCoverRequests += 1;
      void task().finally(() => {
        activeCoverRequests -= 1;
        pumpCoverQueue();
      });
    }
  }

  function hydrateCover(item, cover) {
    const cached = coverCacheState(item.subjectId);
    if (cached.coverUrl) {
      appendCoverImage(cover, cached.coverUrl, item.title);
      return;
    }
    if (cached.status === "missing" || pendingCovers.has(item.subjectId)) {
      return;
    }
    pendingCovers.add(item.subjectId);
    coverQueue.push(async () => {
      try {
        const coverUrl = await fetchBangumiCover(item.subjectId);
        rememberCover(item.subjectId, coverUrl);
        if (coverUrl && cover.isConnected) {
          appendCoverImage(cover, coverUrl, item.title);
        }
      } catch {
        rememberCover(item.subjectId, "");
      } finally {
        pendingCovers.delete(item.subjectId);
      }
    });
    pumpCoverQueue();
  }

  function setStatus(message, tone = "") {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function renderLoading() {
    setStatus("正在整理相似条目");
    grid.replaceChildren(
      ...Array.from({ length: 6 }, () => {
        const card = createElement("div", "similar-card similar-card-skeleton");
        card.setAttribute("aria-hidden", "true");
        card.append(
          createElement("div", "similar-cover"),
          createElement("div", "similar-card-body"),
        );
        return card;
      }),
    );
  }

  function itemMeta(item) {
    const values = [];
    if (Number.isInteger(item.year)) {
      values.push(String(item.year));
    }
    if (item.seasonLabel) {
      values.push(item.seasonLabel);
    }
    if (item.type && item.type !== "unknown") {
      values.push(typeLabels[item.type] ?? item.type);
    }
    return values;
  }

  function createCard(item) {
    const card = createElement(
      "a",
      `similar-card ${item.owned ? "is-owned" : "is-candidate"}`,
    );
    const target =
      item.owned && item.recordId
        ? `../../anime/${encodeURIComponent(item.recordId)}/`
        : `https://bgm.tv/subject/${encodeURIComponent(item.subjectId)}`;
    card.href = target;
    if (!item.owned || !item.recordId) {
      card.target = "_blank";
      card.rel = "noreferrer noopener";
    }
    card.setAttribute(
      "aria-label",
      `${item.title}${item.owned ? "，已收录，查看档案" : "，Bangumi 条目"}`,
    );

    const cover = createElement("div", "similar-cover");
    const fallback = createElement(
      "span",
      "similar-cover-fallback",
      item.title,
    );
    fallback.setAttribute("aria-hidden", "true");
    cover.append(fallback);

    const coverUrl = safeCoverUrl(item.coverUrl);
    if (coverUrl) {
      appendCoverImage(cover, coverUrl, item.title);
    } else if (item.subjectId) {
      hydrateCover(item, cover);
    }

    const state = createElement(
      "span",
      "similar-card-state",
      item.owned ? "已收录" : "待发现",
    );
    const overlap = createElement(
      "span",
      "similar-overlap",
      `${Math.max(1, Number(item.sharedCount) || 1)} 个共同标签`,
    );
    cover.append(state, overlap);

    const body = createElement("div", "similar-card-body");
    const topLine = createElement("div", "similar-card-topline");
    const meta = createElement("p", "similar-card-meta");
    const metaValues = itemMeta(item);
    meta.textContent = metaValues.length ? metaValues.join(" · ") : "Bangumi";
    const score = createElement("p", "similar-public-score");
    const publicScore = numberOrNull(item.score);
    const ratingCount = Math.max(0, Number(item.ratingCount) || 0);
    if (publicScore !== null) {
      score.append(
        createElement("span", "", "BGM"),
        createElement("strong", "", publicScore.toFixed(1)),
      );
      if (ratingCount > 0) {
        score.append(
          createElement(
            "small",
            "",
            `${ratingCount.toLocaleString("zh-CN")} 人评分`,
          ),
        );
      }
    } else {
      score.textContent = "暂无评分";
    }
    topLine.append(meta, score);

    const title = createElement("h3", "", item.title);
    const tags = createElement("ul", "similar-tags");
    const commonTags = Array.isArray(item.commonTags)
      ? item.commonTags.slice(0, 3)
      : [];
    for (const tag of commonTags) {
      tags.append(createElement("li", "", String(tag)));
    }

    const footer = createElement("div", "similar-card-footer");
    if (item.owned) {
      const recordRating = numberOrNull(item.recordRating);
      footer.append(
        createElement(
          "span",
          "similar-own-rating",
          recordRating !== null
            ? `我的评分 ${recordRating.toFixed(1)}`
            : "我的档案",
        ),
        createElement("strong", "similar-card-action", "查看档案"),
      );
    } else {
      footer.append(
        createElement("span", "", "Bangumi"),
        createElement("strong", "similar-card-action", "查看条目"),
      );
    }

    body.append(topLine, title);
    if (commonTags.length) {
      body.append(tags);
    }
    body.append(footer);
    card.append(cover, body);
    return card;
  }

  function createEmptyState() {
    const empty = createElement("div", "similar-empty");
    const hasTags = Number(recommendations?.sourceTagCount) > 0;
    const hasOtherScope =
      selectedScope === "unowned" &&
      Number(recommendations?.ownedTotal) > 0;
    const title = createElement(
      "h3",
      "",
      hasTags
        ? hasOtherScope
          ? "未收录范围内暂时没有结果"
          : "暂时没有找到相似条目"
        : "当前条目缺少标签",
    );
    const copy = createElement(
      "p",
      "",
      hasTags
        ? hasOtherScope
          ? "已收录的相似条目仍然可以查看。"
          : "标签重叠较少，可以稍后再来看看。"
        : "补充 Bangumi 标签缓存后，这里会生成相似推荐。",
    );
    empty.append(title, copy);
    if (hasOtherScope) {
      const action = createElement("button", "", "查看已收录");
      action.type = "button";
      action.addEventListener("click", () => setScope("all"));
      empty.append(action);
    }
    return empty;
  }

  function pageTokens(pageCount) {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }
    const tokens = new Set([1, pageCount, currentPage]);
    for (
      let page = Math.max(2, currentPage - 1);
      page <= Math.min(pageCount - 1, currentPage + 1);
      page += 1
    ) {
      tokens.add(page);
    }
    const sorted = [...tokens].sort((left, right) => left - right);
    return sorted.flatMap((page, index) => {
      const previous = sorted[index - 1];
      return previous && page - previous > 1 ? ["ellipsis", page] : [page];
    });
  }

  function renderPagination(totalItems, pageCount) {
    pagination.hidden = totalItems === 0;
    previousButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= pageCount;
    pageSummary.textContent = `第 ${currentPage} / ${Math.max(1, pageCount)} 页 · ${totalItems} 部`;

    pages.replaceChildren(
      ...pageTokens(pageCount).map((token) => {
        if (token === "ellipsis") {
          const ellipsis = createElement("span", "similar-page-ellipsis", "…");
          ellipsis.setAttribute("aria-hidden", "true");
          return ellipsis;
        }
        const button = createElement("button", "", String(token));
        button.type = "button";
        button.dataset.similarPageNumber = String(token);
        button.setAttribute("aria-label", `第 ${token} 页`);
        if (token === currentPage) {
          button.setAttribute("aria-current", "page");
        }
        return button;
      }),
    );
  }

  function render() {
    const allItems = Array.isArray(recommendations?.items)
      ? recommendations.items
      : [];
    const scopeItems =
      selectedScope === "all"
        ? allItems
        : allItems.filter((item) => !item.owned);
    const items = sortItems(scopeItems);
    const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    currentPage = Math.min(pageCount, Math.max(1, currentPage));
    const start = (currentPage - 1) * PAGE_SIZE;
    const visibleItems = items.slice(start, start + PAGE_SIZE);

    setStatus(
      items.length
        ? ""
        : selectedScope === "unowned" && allItems.some((item) => item.owned)
          ? "默认隐藏已收录条目"
          : "",
    );
    grid.replaceChildren(
      ...(visibleItems.length
        ? visibleItems.map(createCard)
        : [createEmptyState()]),
    );
    renderPagination(items.length, pageCount);
  }

  function sortItems(items) {
    const sorted = [...items];
    const compareSubject = (left, right) =>
      String(left.subjectId).localeCompare(String(right.subjectId), "en", {
        numeric: true,
      });
    const compareScore = (left, right, direction) => {
      const leftScore = numberOrNull(left.score);
      const rightScore = numberOrNull(right.score);
      if (leftScore === null && rightScore === null) {
        return 0;
      }
      if (leftScore === null) {
        return 1;
      }
      if (rightScore === null) {
        return -1;
      }
      return direction * (leftScore - rightScore);
    };
    const popularity = (item) => Math.max(0, Number(item.ratingCount) || 0);
    const tagHeat = (item) => Math.max(0, Number(item.tagHeat) || 0);
    if (selectedSort === "score-desc") {
      sorted.sort(
        (left, right) =>
          compareScore(left, right, -1) ||
          popularity(right) - popularity(left) ||
          tagHeat(right) - tagHeat(left) ||
          (numberOrNull(right.similarity) ?? 0) -
            (numberOrNull(left.similarity) ?? 0) ||
          compareSubject(left, right),
      );
    } else if (selectedSort === "score-asc") {
      sorted.sort(
        (left, right) =>
          compareScore(left, right, 1) ||
          popularity(right) - popularity(left) ||
          tagHeat(right) - tagHeat(left) ||
          compareSubject(left, right),
      );
    } else if (selectedSort === "popularity-desc") {
      sorted.sort(
        (left, right) =>
          popularity(right) - popularity(left) ||
          compareScore(left, right, -1) ||
          tagHeat(right) - tagHeat(left) ||
          compareSubject(left, right),
      );
    } else if (selectedSort === "heat-desc") {
      sorted.sort(
        (left, right) =>
          tagHeat(right) - tagHeat(left) ||
          popularity(right) - popularity(left) ||
          compareScore(left, right, -1) ||
          compareSubject(left, right),
      );
    } else if (selectedSort === "shared-desc") {
      sorted.sort(
        (left, right) =>
          (Number(right.sharedCount) || 0) -
            (Number(left.sharedCount) || 0) ||
          (numberOrNull(right.similarity) ?? 0) -
            (numberOrNull(left.similarity) ?? 0) ||
          popularity(right) - popularity(left) ||
          compareSubject(left, right),
      );
    }
    return sorted;
  }

  function setScope(scope) {
    if (scope !== "unowned" && scope !== "all") {
      return;
    }
    selectedScope = scope;
    currentPage = 1;
    for (const button of scopeButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.similarScope === scope),
      );
    }
    render();
  }

  function syncControls() {
    const items = Array.isArray(recommendations?.items)
      ? recommendations.items
      : [];
    const ownedTotal = Number(recommendations?.ownedTotal) || 0;
    const unownedTotal = Number(recommendations?.unownedTotal) || 0;
    countElements.get("unowned").textContent = String(unownedTotal);
    countElements.get("owned").textContent = `+${ownedTotal}`;
    scopeSwitch.hidden = items.length === 0;
    setScope("unowned");
  }

  async function loadRecommendations() {
    if (started) {
      return;
    }
    started = true;
    renderLoading();
    try {
      const url = new URL(endpoint, window.location.href);
      if (version) {
        url.searchParams.set("v", version);
      }
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.items)) {
        throw new Error("推荐数据格式无效");
      }
      recommendations = payload;
      syncControls();
    } catch (error) {
      grid.replaceChildren();
      pagination.hidden = true;
      setStatus(`相似推荐加载失败：${error.message}`, "error");
    }
  }

  for (const button of scopeButtons) {
    button.addEventListener("click", () => {
      setScope(button.dataset.similarScope);
    });
  }
  sortSelect.addEventListener("change", () => {
    selectedSort = sortSelect.value;
    currentPage = 1;
    render();
  });

  previousButton.addEventListener("click", () => {
    currentPage = Math.max(1, currentPage - 1);
    render();
  });
  nextButton.addEventListener("click", () => {
    currentPage += 1;
    render();
  });
  pages.addEventListener("click", (event) => {
    const button = event.target.closest("[data-similar-page-number]");
    if (!button) {
      return;
    }
    currentPage = Number(button.dataset.similarPageNumber);
    render();
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          loadRecommendations();
        }
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(section);
  } else {
    loadRecommendations();
  }
})();
