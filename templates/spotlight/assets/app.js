(() => {
  const searchInput = document.querySelector("#record-search");
  const clearSearchButton = document.querySelector("#clear-search");
  const ratingFilter = document.querySelector("#rating-filter");
  const sortOrder = document.querySelector("#sort-order");
  const recordsGrid = document.querySelector("#records-grid");
  const resultsSummary = document.querySelector("#results-summary");
  const emptyState = document.querySelector("#empty-state");
  const resetFiltersButton = document.querySelector("#reset-filters");
  const paginationNav = document.querySelector("#records-pagination");
  const paginationSummary = document.querySelector("#pagination-summary");
  const paginationPrevious = document.querySelector("#pagination-previous");
  const paginationNext = document.querySelector("#pagination-next");
  const paginationPages = document.querySelector("#pagination-pages");
  const paginationSizeSelect = document.querySelector("#pagination-size");
  const paginationSizeInput = document.querySelector("#pagination-size-custom");

  if (
    !searchInput ||
    !clearSearchButton ||
    !ratingFilter ||
    !sortOrder ||
    !recordsGrid ||
    !resultsSummary ||
    !emptyState ||
    !paginationNav ||
    !paginationSummary ||
    !paginationPrevious ||
    !paginationNext ||
    !paginationPages ||
    !paginationSizeSelect ||
    !paginationSizeInput
  ) {
    return;
  }

  const cards = [...recordsGrid.querySelectorAll(".record-card")];
  const total = cards.length;
  const defaultPageSize = Math.max(
    1,
    Number.parseInt(recordsGrid.dataset.pageSize ?? "25", 10) || 25,
  );
  const pageSizeOptions = new Set([10, 25, 50, 100]);
  const params = new URLSearchParams(window.location.search);
  const requestedPageSize = Number.parseInt(params.get("size") ?? "", 10);
  let pageSize =
    Number.isFinite(requestedPageSize) && requestedPageSize >= 1 && requestedPageSize <= 200
      ? requestedPageSize
      : defaultPageSize;
  const requestedPage = Number.parseInt(params.get("page") ?? "1", 10);
  let currentPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  let currentResultCount = 0;

  const allowedFilters = new Set(["all", "rated", "unrated"]);
  const allowedSorts = new Set(["year", "rating", "title"]);

  const initialState = {
    query: params.get("q") ?? "",
    filter: allowedFilters.has(params.get("status"))
      ? params.get("status")
      : "all",
    sort: allowedSorts.has(params.get("sort"))
      ? params.get("sort")
      : "year",
  };

  searchInput.value = initialState.query;
  ratingFilter.value = initialState.filter;
  sortOrder.value = initialState.sort;

  function syncPageSizeControls() {
    paginationSizeSelect.value = pageSizeOptions.has(pageSize)
      ? String(pageSize)
      : "custom";
    paginationSizeInput.value = String(pageSize);
    paginationSizeInput.hidden = paginationSizeSelect.value !== "custom";
  }

  function parsePageSize(value) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return Math.min(200, Math.max(1, parsed));
  }

  function setPageSize(value) {
    const nextPageSize = parsePageSize(value);
    if (nextPageSize === null) {
      syncPageSizeControls();
      return;
    }
    pageSize = nextPageSize;
    syncPageSizeControls();
    applyState({ resetPage: true });
  }

  syncPageSizeControls();

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase("zh-CN")
      .replace(/[\s\u3000·・:：,，.。!！?？'"“”‘’()（）[\]【】《》<>_\-]/gu, "");
  }

  function compareCards(left, right) {
    if (sortOrder.value === "rating") {
      const leftRating = Number(left.dataset.rating);
      const rightRating = Number(right.dataset.rating);
      const leftValue = Number.isFinite(leftRating) ? leftRating : -1;
      const rightValue = Number.isFinite(rightRating) ? rightRating : -1;
      return (
        rightValue - leftValue ||
        left.dataset.title.localeCompare(right.dataset.title, "zh-CN")
      );
    }

    if (sortOrder.value === "title") {
      return left.dataset.title.localeCompare(right.dataset.title, "zh-CN");
    }

    const leftYear = Number(left.dataset.year);
    const rightYear = Number(right.dataset.year);
    return (
      (Number.isFinite(rightYear) ? rightYear : -1) -
        (Number.isFinite(leftYear) ? leftYear : -1) ||
      Number(left.dataset.originalIndex) - Number(right.dataset.originalIndex)
    );
  }

  function syncUrl() {
    const next = new URLSearchParams();
    if (searchInput.value.trim()) {
      next.set("q", searchInput.value.trim());
    }
    if (ratingFilter.value !== "all") {
      next.set("status", ratingFilter.value);
    }
    if (sortOrder.value !== "year") {
      next.set("sort", sortOrder.value);
    }
    if (pageSize !== defaultPageSize) {
      next.set("size", String(pageSize));
    }
    if (currentPage > 1) {
      next.set("page", String(currentPage));
    }

    const nextUrl = `${window.location.pathname}${
      next.size ? `?${next.toString()}` : ""
    }${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }

  function getPageSequence(page, pageCount) {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }

    const pages = new Set([1, pageCount, page - 1, page, page + 1]);
    if (page <= 4) {
      pages.add(2);
      pages.add(3);
      pages.add(4);
      pages.add(5);
    }
    if (page >= pageCount - 3) {
      pages.add(pageCount - 4);
      pages.add(pageCount - 3);
      pages.add(pageCount - 2);
      pages.add(pageCount - 1);
    }

    const sortedPages = [...pages]
      .filter((item) => item >= 1 && item <= pageCount)
      .sort((left, right) => left - right);
    const sequence = [];
    for (const pageNumber of sortedPages) {
      const previous = sequence.at(-1);
      if (typeof previous === "number" && pageNumber - previous > 1) {
        sequence.push(null);
      }
      sequence.push(pageNumber);
    }
    return sequence;
  }

  function goToPage(page) {
    currentPage = page;
    applyState();
    paginationPages
      .querySelector('[aria-current="page"]')
      ?.focus({ preventScroll: true });
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    recordsGrid.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  function renderPagination(page, pageCount, visibleStart, visibleEnd, count) {
    paginationNav.hidden = count === 0;
    paginationSummary.textContent = count
      ? `显示第 ${visibleStart}-${visibleEnd} 条，共 ${count} 条`
      : "没有可显示的记录";

    const pageControls = getPageSequence(page, pageCount).map((pageNumber) => {
      if (pageNumber === null) {
        const gap = document.createElement("span");
        gap.className = "pagination-gap";
        gap.textContent = "...";
        gap.setAttribute("aria-hidden", "true");
        return gap;
      }

      const button = document.createElement("button");
      button.className = "pagination-page";
      button.type = "button";
      button.textContent = String(pageNumber);
      button.setAttribute("aria-label", `第 ${pageNumber} 页`);
      if (pageNumber === page) {
        button.setAttribute("aria-current", "page");
      }
      button.addEventListener("click", () => {
        if (pageNumber !== currentPage) {
          goToPage(pageNumber);
        }
      });
      return button;
    });

    paginationPages.replaceChildren(...pageControls);
    paginationPrevious.disabled = page <= 1;
    paginationNext.disabled = page >= pageCount;
  }

  function applyState({ resetPage = false } = {}) {
    if (resetPage) {
      currentPage = 1;
    }

    const query = normalize(searchInput.value);
    const filteredCards = [];

    for (const card of cards) {
      const matchesQuery =
        !query || normalize(card.dataset.search).includes(query);
      const hasRating = card.dataset.rating !== "";
      const matchesRating =
        ratingFilter.value === "all" ||
        (ratingFilter.value === "rated" && hasRating) ||
        (ratingFilter.value === "unrated" && !hasRating);
      card.hidden = true;
      if (matchesQuery && matchesRating) {
        filteredCards.push(card);
      }
    }

    filteredCards.sort(compareCards);
    filteredCards.forEach((card, index) => {
      card.dataset.coverPriority = String(index);
    });
    recordsGrid.append(...filteredCards);

    const pageCount = Math.max(1, Math.ceil(filteredCards.length / pageSize));
    currentResultCount = filteredCards.length;
    currentPage = Math.min(Math.max(1, currentPage), pageCount);
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, filteredCards.length);
    for (const card of filteredCards.slice(start, end)) {
      card.hidden = false;
    }

    clearSearchButton.hidden = !searchInput.value;
    emptyState.hidden = filteredCards.length !== 0;
    recordsGrid.hidden = filteredCards.length === 0;
    resultsSummary.textContent =
      filteredCards.length === 0
        ? `共 0 / ${total} 部作品`
        : filteredCards.length === total
        ? `共 ${total} 部作品`
        : `筛选出 ${filteredCards.length} / ${total} 部作品`;
    renderPagination(
      currentPage,
      pageCount,
      filteredCards.length ? start + 1 : 0,
      end,
      filteredCards.length,
    );
    syncUrl();
    recoverMissingCovers();
  }

  searchInput.addEventListener("input", () => applyState({ resetPage: true }));
  ratingFilter.addEventListener("change", () =>
    applyState({ resetPage: true }),
  );
  sortOrder.addEventListener("change", () => applyState({ resetPage: true }));
  paginationSizeSelect.addEventListener("change", () => {
    if (paginationSizeSelect.value === "custom") {
      paginationSizeInput.hidden = false;
      paginationSizeInput.focus();
      paginationSizeInput.select();
      return;
    }
    setPageSize(paginationSizeSelect.value);
  });
  paginationSizeInput.addEventListener("change", () => {
    setPageSize(paginationSizeInput.value);
  });
  paginationPrevious.addEventListener("click", () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  });
  paginationNext.addEventListener("click", () => {
    const pageCount = Math.max(1, Math.ceil(currentResultCount / pageSize));
    if (currentPage < pageCount) {
      goToPage(currentPage + 1);
    }
  });

  clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    searchInput.focus();
    applyState({ resetPage: true });
  });

  resetFiltersButton?.addEventListener("click", () => {
    searchInput.value = "";
    ratingFilter.value = "all";
    sortOrder.value = "year";
    applyState({ resetPage: true });
    searchInput.focus();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;

    if (event.key === "/" && !isTyping) {
      event.preventDefault();
      searchInput.focus();
    }
  });

  const coverCacheKey = "myanimelife.display-covers.v2";
  const coverCacheVersion =
    document.querySelector('meta[name="myanimelife-data-version"]')?.content ||
    "unknown";
  const coverCacheTtl = 90 * 24 * 60 * 60 * 1000;
  const coverRequests = new Map();
  const coverQueue = [];
  const queuedCoverFrames = new Set();
  const maxConcurrentCoverRequests = 3;
  let activeCoverRequests = 0;
  let coverObserver = null;

  function normalizeCoverUrl(value) {
    const candidate = String(value ?? "").trim();
    if (!candidate) {
      return null;
    }
    if (candidate.startsWith("//")) {
      return `https:${candidate}`;
    }
    if (/^http:\/\//iu.test(candidate)) {
      return candidate.replace(/^http:\/\//iu, "https://");
    }
    return /^(?:https:\/\/|data:image\/)/iu.test(candidate)
      ? candidate
      : null;
  }

  function readCoverCache() {
    try {
      const value = JSON.parse(localStorage.getItem(coverCacheKey) ?? "null");
      if (!value || typeof value !== "object") {
        return {};
      }
      if (value.version && value.version !== coverCacheVersion) {
        return {};
      }
      return value.items && typeof value.items === "object"
        ? value.items
        : value;
    } catch {
      return {};
    }
  }

  function writeCoverCache(cache) {
    try {
      localStorage.setItem(
        coverCacheKey,
        JSON.stringify({
          version: coverCacheVersion,
          updatedAt: new Date().toISOString(),
          items: cache,
        }),
      );
    } catch {
      // Private browsing and full storage should not break the archive page.
    }
  }

  function cachedCover(subjectId) {
    const entry = coverCache[subjectId];
    const url = typeof entry === "string" ? entry : entry?.url;
    const checkedAt = Number(entry?.checkedAt) || 0;
    if (checkedAt && Date.now() - checkedAt > coverCacheTtl) {
      return null;
    }
    return normalizeCoverUrl(url);
  }

  function fetchBangumiCover(subjectId) {
    const id = String(subjectId ?? "").trim();
    if (!id) {
      return Promise.resolve(null);
    }
    if (!coverRequests.has(id)) {
      coverRequests.set(
        id,
        fetch(`https://api.bgm.tv/v0/subjects/${encodeURIComponent(id)}`, {
          headers: { Accept: "application/json" },
          credentials: "omit",
        })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) =>
            normalizeCoverUrl(
              payload?.images?.large ??
                payload?.images?.common ??
                payload?.images?.medium,
            ),
          )
          .catch(() => null),
      );
    }
    return coverRequests.get(id);
  }

  const coverCache = readCoverCache();

  function isCoverFrameVisible(frame) {
    const card = frame.closest(".record-card");
    return !card || !card.hidden;
  }

  function getCoverPriority(frame) {
    const card = frame.closest(".record-card");
    if (!card) {
      return -1;
    }
    return Number(card.dataset.coverPriority ?? card.dataset.originalIndex ?? 0);
  }

  function processCoverQueue() {
    while (
      activeCoverRequests < maxConcurrentCoverRequests &&
      coverQueue.length
    ) {
      const frame = coverQueue.shift();
      queuedCoverFrames.delete(frame);
      if (
        !isCoverFrameVisible(frame) ||
        frame.querySelector("img") ||
        frame.dataset.coverLoading === "true"
      ) {
        continue;
      }

      frame.dataset.coverLoading = "true";
      activeCoverRequests += 1;
      fetchBangumiCover(frame.dataset.bangumiId)
        .then((url) => {
          if (!url) {
            return;
          }
          coverCache[frame.dataset.bangumiId] = {
            url,
            checkedAt: Date.now(),
          };
          writeCoverCache(coverCache);
          appendCoverImage(frame, url);
        })
        .finally(() => {
          delete frame.dataset.coverLoading;
          activeCoverRequests -= 1;
          processCoverQueue();
        });
    }
  }

  function enqueueCover(frame) {
    if (
      !frame.dataset.bangumiId ||
      frame.querySelector("img") ||
      frame.dataset.coverAttempted === "true" ||
      queuedCoverFrames.has(frame) ||
      !isCoverFrameVisible(frame)
    ) {
      return;
    }

    const cached = cachedCover(frame.dataset.bangumiId);
    if (cached) {
      appendCoverImage(frame, cached);
      return;
    }

    frame.dataset.coverAttempted = "true";
    queuedCoverFrames.add(frame);
    coverQueue.push(frame);
    coverQueue.sort((left, right) => getCoverPriority(left) - getCoverPriority(right));
    processCoverQueue();
  }

  function appendCoverImage(frame, url) {
    if (!url || frame.querySelector("img")) {
      return;
    }
    const image = document.createElement("img");
    image.src = url;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener(
      "error",
      () => frame.classList.add("has-image-error"),
      { once: true },
    );
    frame.classList.remove("has-image-error");
    frame.append(image);
  }

  function recoverMissingCovers() {
    const frames = [...
      document.querySelectorAll(
        ".record-cover[data-bangumi-id], .detail-cover[data-bangumi-id]",
      ),
    ].filter((frame) => frame.dataset.bangumiId && !frame.querySelector("img"));

    if ("IntersectionObserver" in window) {
      if (!coverObserver) {
        coverObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }
            if (!isCoverFrameVisible(entry.target)) {
              continue;
            }
            coverObserver.unobserve(entry.target);
            enqueueCover(entry.target);
          }
        },
        { rootMargin: "500px 0px" },
        );
      }
      frames.forEach((frame) => {
        const cached = cachedCover(frame.dataset.bangumiId);
        if (cached) {
          coverObserver.unobserve(frame);
          appendCoverImage(frame, cached);
          return;
        }
        coverObserver.observe(frame);
        enqueueCover(frame);
      });
      return;
    }
    frames.forEach((frame) => enqueueCover(frame));
  }

  for (const image of document.querySelectorAll(
    ".record-cover img, .detail-cover img",
  )) {
    const markMissing = () => {
      image.parentElement?.classList.add("has-image-error");
    };
    image.addEventListener("error", markMissing, { once: true });
    if (image.complete && image.naturalWidth === 0) {
      markMissing();
    }
  }

  applyState();
})();
