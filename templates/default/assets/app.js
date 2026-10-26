(() => {
  const searchInput = document.querySelector("#record-search");
  const clearSearchButton = document.querySelector("#clear-search");
  const ratingFilter = document.querySelector("#rating-filter");
  const yearFilter = document.querySelector("#year-filter");
  const ratingMinInput = document.querySelector("#rating-min");
  const ratingMaxInput = document.querySelector("#rating-max");
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
    !yearFilter ||
    !ratingMinInput ||
    !ratingMaxInput ||
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
  const allowedSorts = new Set([
    "year-desc",
    "year-asc",
    "rating-desc",
    "rating-asc",
    "created-desc",
    "created-asc",
    "updated-desc",
    "updated-asc",
    "title-asc",
    "title-desc",
  ]);
  const sortAliases = {
    year: "year-desc",
    rating: "rating-desc",
    title: "title-asc",
  };

  const yearValues = [...new Set(
    cards
      .map((card) => Number.parseInt(card.dataset.year ?? "", 10))
      .filter((year) => Number.isInteger(year)),
  )].sort((left, right) => right - left);
  for (const year of yearValues) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = `${year} 年`;
    yearFilter.append(option);
  }

  const initialState = {
    query: params.get("q") ?? "",
    filter: allowedFilters.has(params.get("status"))
      ? params.get("status")
      : "all",
    year: yearValues.includes(Number(params.get("year")))
      ? params.get("year")
      : "all",
    sort: allowedSorts.has(params.get("sort"))
      ? params.get("sort")
      : sortAliases[params.get("sort")] ?? "year-desc",
    ratingMin: params.get("minRating") ?? "",
    ratingMax: params.get("maxRating") ?? "",
  };

  searchInput.value = initialState.query;
  ratingFilter.value = initialState.filter;
  yearFilter.value = initialState.year;
  ratingMinInput.value = initialState.ratingMin;
  ratingMaxInput.value = initialState.ratingMax;
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

  function parseRating(value) {
    const parsed = Number.parseFloat(String(value ?? ""));
    return Number.isFinite(parsed) ? Math.min(10, Math.max(0, parsed)) : null;
  }

  function dateValue(value) {
    const parsed = Date.parse(String(value ?? ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function compareCards(left, right) {
    const leftIndex = Number(left.dataset.originalIndex);
    const rightIndex = Number(right.dataset.originalIndex);
    if (sortOrder.value === "rating-desc" || sortOrder.value === "rating-asc") {
      const leftRating = Number(left.dataset.rating);
      const rightRating = Number(right.dataset.rating);
      const leftValue = Number.isFinite(leftRating) ? leftRating : null;
      const rightValue = Number.isFinite(rightRating) ? rightRating : null;
      if (leftValue === null || rightValue === null) {
        return (leftValue === null) - (rightValue === null) || leftIndex - rightIndex;
      }
      return (
        (sortOrder.value === "rating-desc" ? rightValue - leftValue : leftValue - rightValue) ||
        leftIndex - rightIndex
      );
    }

    if (sortOrder.value === "title-asc" || sortOrder.value === "title-desc") {
      const direction = sortOrder.value === "title-asc" ? 1 : -1;
      return direction * left.dataset.title.localeCompare(right.dataset.title, "zh-CN") || leftIndex - rightIndex;
    }

    if (sortOrder.value === "created-desc" || sortOrder.value === "created-asc" || sortOrder.value === "updated-desc" || sortOrder.value === "updated-asc") {
      const field = sortOrder.value.startsWith("created") ? "created" : "updated";
      const direction = sortOrder.value.endsWith("desc") ? -1 : 1;
      return direction * (dateValue(left.dataset[field]) - dateValue(right.dataset[field])) || leftIndex - rightIndex;
    }

    const leftYear = Number(left.dataset.year);
    const rightYear = Number(right.dataset.year);
    const leftValue = Number.isFinite(leftYear) ? leftYear : null;
    const rightValue = Number.isFinite(rightYear) ? rightYear : null;
    if (leftValue === null || rightValue === null) {
      return (leftValue === null) - (rightValue === null) || leftIndex - rightIndex;
    }
    const direction = sortOrder.value === "year-asc" ? 1 : -1;
    return direction * (leftValue - rightValue) || leftIndex - rightIndex;
  }

  function syncUrl() {
    const next = new URLSearchParams();
    if (searchInput.value.trim()) {
      next.set("q", searchInput.value.trim());
    }
    if (ratingFilter.value !== "all") {
      next.set("status", ratingFilter.value);
    }
    if (sortOrder.value !== "year-desc") {
      next.set("sort", sortOrder.value);
    }
    if (yearFilter.value !== "all") {
      next.set("year", yearFilter.value);
    }
    const minimum = parseRating(ratingMinInput.value);
    const maximum = parseRating(ratingMaxInput.value);
    if (minimum !== null) next.set("minRating", String(minimum));
    if (maximum !== null) next.set("maxRating", String(maximum));
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
    const minimum = parseRating(ratingMinInput.value);
    const maximum = parseRating(ratingMaxInput.value);
    const filteredCards = [];

    for (const card of cards) {
      const matchesQuery =
        !query || normalize(card.dataset.search).includes(query);
      const hasRating = card.dataset.rating !== "";
      const matchesRating =
        ratingFilter.value === "all" ||
        (ratingFilter.value === "rated" && hasRating) ||
        (ratingFilter.value === "unrated" && !hasRating);
      const cardRating = hasRating ? Number(card.dataset.rating) : null;
      const matchesRange =
        (minimum === null && maximum === null) ||
        (cardRating !== null &&
          (minimum === null || cardRating >= minimum) &&
          (maximum === null || cardRating <= maximum));
      const matchesYear =
        yearFilter.value === "all" || card.dataset.year === yearFilter.value;
      card.hidden = true;
      if (matchesQuery && matchesRating && matchesRange && matchesYear) {
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
  yearFilter.addEventListener("change", () => applyState({ resetPage: true }));
  ratingMinInput.addEventListener("change", () => applyState({ resetPage: true }));
  ratingMaxInput.addEventListener("change", () => applyState({ resetPage: true }));
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
    yearFilter.value = "all";
    ratingMinInput.value = "";
    ratingMaxInput.value = "";
    sortOrder.value = "year-desc";
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
