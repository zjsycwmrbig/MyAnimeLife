(() => {
  const searchInput = document.querySelector("#record-search");
  const clearSearchButton = document.querySelector("#clear-search");
  const ratingFilter = document.querySelector("#rating-filter");
  const yearFilter = document.querySelector("#year-filter");
  const yearMaxInput = document.querySelector("#year-max");
  const ratingMinInput = document.querySelector("#rating-min");
  const ratingMaxInput = document.querySelector("#rating-max");
  const ratingMinValue = document.querySelector("#rating-min-value");
  const ratingMaxValue = document.querySelector("#rating-max-value");
  const yearMinValue = document.querySelector("#year-filter-min-value");
  const yearMaxValue = document.querySelector("#year-filter-max-value");
  const ratingRangeSummary = document.querySelector("#rating-range-summary");
  const yearRangeSummary = document.querySelector("#year-range-summary");
  const advancedFilterToggle = document.querySelector("#toggle-advanced-filters");
  const activeFilterCount = document.querySelector("#active-filter-count");
  const rangeSortButtons = [
    ...document.querySelectorAll(".range-sort-group [data-sort-order]"),
  ];
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
    !yearMaxInput ||
    !ratingMinInput ||
    !ratingMaxInput ||
    !ratingMinValue ||
    !ratingMaxValue ||
    !yearMinValue ||
    !yearMaxValue ||
    !ratingRangeSummary ||
    !yearRangeSummary ||
    !advancedFilterToggle ||
    !activeFilterCount ||
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

  const yearValues = [
    ...new Set(
      cards
        .map((card) => Number.parseInt(card.dataset.year ?? "", 10))
        .filter((year) => Number.isInteger(year)),
    ),
  ].sort((left, right) => left - right);
  const yearFloor = yearValues.at(0) ?? 1900;
  const yearCeiling = yearValues.at(-1) ?? 2200;
  const yearBucketCount = Math.min(10, Math.max(1, yearCeiling - yearFloor + 1));
  const yearBuckets = Array.from({ length: yearBucketCount }, (_, index) => {
    const start = yearFloor + Math.floor(((yearCeiling - yearFloor + 1) * index) / yearBucketCount);
    const end =
      yearFloor +
      Math.floor(((yearCeiling - yearFloor + 1) * (index + 1)) / yearBucketCount) -
      1;
    return { start, end: Math.max(start, end) };
  });
  const choiceOption = (value, label) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    return option;
  };
  const ratingChoices = Array.from({ length: 11 }, (_, value) =>
    choiceOption(value, `${value} 分`),
  );
  const yearChoices = yearBuckets.map((bucket, index) =>
    choiceOption(index, `${bucket.start}-${bucket.end} 年`),
  );
  for (const select of [ratingMinValue, ratingMaxValue]) {
    select.replaceChildren(...ratingChoices.map((option) => option.cloneNode(true)));
  }
  for (const select of [yearMinValue, yearMaxValue]) {
    select.replaceChildren(...yearChoices.map((option) => option.cloneNode(true)));
  }

  const initialState = {
    query: params.get("q") ?? "",
    filter: "all",
    sort: allowedSorts.has(params.get("sort"))
      ? params.get("sort")
      : sortAliases[params.get("sort")] ?? "created-desc",
    ratingMin: params.get("minRating") ?? "0",
    ratingMax: params.get("maxRating") ?? "10",
    yearMin: params.get("yearMin") ?? params.get("year") ?? String(yearFloor),
    yearMax: params.get("yearMax") ?? params.get("year") ?? String(yearCeiling),
  };

  searchInput.value = initialState.query;
  ratingFilter.value = initialState.filter;
  sortOrder.value = initialState.sort;
  yearFilter.min = "0";
  yearFilter.max = String(yearBucketCount - 1);
  yearMaxInput.min = "0";
  yearMaxInput.max = String(yearBucketCount - 1);
  ratingMinInput.value = initialState.ratingMin;
  ratingMaxInput.value = initialState.ratingMax;

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
    return Number.isFinite(parsed)
      ? Math.min(10, Math.max(0, Math.round(parsed)))
      : null;
  }

  function yearToBucketIndex(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    const index = yearBuckets.findIndex(
      (bucket) => parsed >= bucket.start && parsed <= bucket.end,
    );
    return index === -1 ? fallback : index;
  }

  function parseBucketIndex(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed)
      ? Math.min(yearBucketCount - 1, Math.max(0, parsed))
      : fallback;
  }

  function setRangeFill(control, minimum, maximum, floor, ceiling) {
    const span = Math.max(1, ceiling - floor);
    control?.style.setProperty(
      "--range-start",
      `${((minimum - floor) / span) * 100}%`,
    );
    control?.style.setProperty(
      "--range-end",
      `${((maximum - floor) / span) * 100}%`,
    );
  }

  function setRatingRange(minimum, maximum, changed = "") {
    let low = parseRating(minimum) ?? 0;
    let high = parseRating(maximum) ?? 10;
    if (changed === "min" && low > high) low = high;
    if (changed === "max" && high < low) high = low;
    if (changed !== "max" && low > high) high = low;
    if (changed !== "min" && high < low) low = high;
    ratingMinInput.value = String(low);
    ratingMaxInput.value = String(high);
    ratingMinValue.value = String(low);
    ratingMaxValue.value = String(high);
    ratingMinInput.style.zIndex = low >= high ? "4" : "3";
    ratingMaxInput.style.zIndex = low >= high ? "3" : "4";
    setRangeFill(ratingMinInput.closest("[data-range-control]"), low, high, 0, 10);
    const active = low > 0 || high < 10 || ratingFilter.value !== "all";
    ratingRangeSummary.textContent = active
      ? `${low} - ${high} 分`
      : "全部评分";
  }

  function setYearRange(minimum, maximum, changed = "") {
    let low = parseBucketIndex(minimum);
    let high = parseBucketIndex(maximum, yearBucketCount - 1);
    if (changed === "min" && low > high) low = high;
    if (changed === "max" && high < low) high = low;
    if (changed !== "max" && low > high) high = low;
    if (changed !== "min" && high < low) low = high;
    yearFilter.value = String(low);
    yearMaxInput.value = String(high);
    yearFilter.style.zIndex = low >= high ? "4" : "3";
    yearMaxInput.style.zIndex = low >= high ? "3" : "4";
    const minimumBucket = yearBuckets[low];
    const maximumBucket = yearBuckets[high];
    yearMinValue.value = String(low);
    yearMaxValue.value = String(high);
    setRangeFill(
      yearFilter.closest("[data-range-control]"),
      low,
      high,
      0,
      yearBucketCount - 1,
    );
    const active = low > 0 || high < yearBucketCount - 1;
    yearRangeSummary.textContent = active
      ? `${minimumBucket.start}-${maximumBucket.end} 年`
      : "全部年份";
  }

  function rangesAreFull() {
    return {
      rating: Number(ratingMinInput.value) <= 0 && Number(ratingMaxInput.value) >= 10,
      year:
        Number(yearFilter.value) <= 0 &&
        Number(yearMaxInput.value) >= yearBucketCount - 1,
    };
  }

  function syncSortButtons() {
    for (const button of rangeSortButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.sortOrder === sortOrder.value),
      );
    }
  }

  function syncAdvancedFilterState() {
    const fullRanges = rangesAreFull();
    const count =
      Number(ratingFilter.value !== "all") +
      Number(!fullRanges.rating) +
      Number(!fullRanges.year);
    activeFilterCount.textContent = String(count);
    activeFilterCount.hidden = count === 0;
    advancedFilterToggle.classList.toggle("has-active", count > 0);
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
    if (sortOrder.value !== "created-desc") {
      next.set("sort", sortOrder.value);
    }
    const minimum = parseRating(ratingMinInput.value);
    const maximum = parseRating(ratingMaxInput.value);
    if (minimum !== null && minimum > 0) next.set("minRating", String(minimum));
    if (maximum !== null && maximum < 10) next.set("maxRating", String(maximum));
    const yearMinimumBucket = yearBuckets[Number(yearFilter.value)];
    const yearMaximumBucket = yearBuckets[Number(yearMaxInput.value)];
    if (Number(yearFilter.value) > 0) {
      next.set("yearMin", String(yearMinimumBucket.start));
    }
    if (Number(yearMaxInput.value) < yearBucketCount - 1) {
      next.set("yearMax", String(yearMaximumBucket.end));
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
    const minimum = parseRating(ratingMinInput.value);
    const maximum = parseRating(ratingMaxInput.value);
    const yearMinimum = yearBuckets[Number(yearFilter.value)]?.start ?? yearFloor;
    const yearMaximum =
      yearBuckets[Number(yearMaxInput.value)]?.end ?? yearCeiling;
    const fullRanges = rangesAreFull();
    const filteredCards = [];

    for (const card of cards) {
      const matchesQuery =
        !query || normalize(card.dataset.search).includes(query);
      const hasRating = card.dataset.rating !== "";
      const matchesStatus =
        ratingFilter.value === "all" ||
        (ratingFilter.value === "rated" && hasRating) ||
        (ratingFilter.value === "unrated" && !hasRating);
      const cardRating = hasRating ? Number(card.dataset.rating) : null;
      const matchesRange =
        fullRanges.rating ||
        (cardRating !== null &&
          (minimum === null || cardRating >= minimum) &&
          (maximum === null || cardRating <= maximum));
      const matchesRating = matchesStatus && matchesRange;
      const cardYear = Number.parseInt(card.dataset.year ?? "", 10);
      const matchesYear =
        fullRanges.year ||
        (Number.isInteger(cardYear) &&
          cardYear >= yearMinimum &&
          cardYear <= yearMaximum);
      card.hidden = true;
      if (matchesQuery && matchesRating && matchesYear) {
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
    syncAdvancedFilterState();
    recoverMissingCovers();
  }

  setRatingRange(initialState.ratingMin, initialState.ratingMax);
  setYearRange(
    yearToBucketIndex(initialState.yearMin),
    yearToBucketIndex(initialState.yearMax, yearBucketCount - 1),
  );
  syncSortButtons();
  searchInput.addEventListener("input", () => applyState({ resetPage: true }));
  ratingFilter.addEventListener("change", () => {
    setRatingRange(ratingMinInput.value, ratingMaxInput.value);
    applyState({ resetPage: true });
  });
  for (const input of [ratingMinInput, ratingMaxInput]) {
    input.addEventListener("input", () => {
      setRatingRange(
        input === ratingMinInput ? input.value : ratingMinInput.value,
        input === ratingMaxInput ? input.value : ratingMaxInput.value,
        input === ratingMinInput ? "min" : "max",
      );
      applyState({ resetPage: true });
    });
  }
  for (const input of [yearFilter, yearMaxInput]) {
    input.addEventListener("input", () => {
      setYearRange(
        input === yearFilter ? input.value : yearFilter.value,
        input === yearMaxInput ? input.value : yearMaxInput.value,
        input === yearFilter ? "min" : "max",
      );
      applyState({ resetPage: true });
    });
  }
  for (const select of [ratingMinValue, ratingMaxValue]) {
    select.addEventListener("change", () => {
      setRatingRange(
        ratingMinValue.value,
        ratingMaxValue.value,
        select === ratingMinValue ? "min" : "max",
      );
      applyState({ resetPage: true });
    });
  }
  for (const select of [yearMinValue, yearMaxValue]) {
    select.addEventListener("change", () => {
      setYearRange(
        yearMinValue.value,
        yearMaxValue.value,
        select === yearMinValue ? "min" : "max",
      );
      applyState({ resetPage: true });
    });
  }
  const bindTrackSelection = (minimumInput, maximumInput, setRange) => {
    const track = minimumInput.closest(".dual-range-track");
    track?.addEventListener("click", (event) => {
      if (event.target instanceof HTMLInputElement) {
        return;
      }
      const bounds = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
      const floor = Number(minimumInput.min);
      const ceiling = Number(minimumInput.max);
      const value = Math.round(floor + ratio * (ceiling - floor));
      const distanceToMinimum = Math.abs(value - Number(minimumInput.value));
      const distanceToMaximum = Math.abs(value - Number(maximumInput.value));
      if (distanceToMinimum <= distanceToMaximum) {
        setRange(value, maximumInput.value, "min");
      } else {
        setRange(minimumInput.value, value, "max");
      }
      applyState({ resetPage: true });
    });
  };
  bindTrackSelection(ratingMinInput, ratingMaxInput, setRatingRange);
  bindTrackSelection(yearFilter, yearMaxInput, setYearRange);
  sortOrder.addEventListener("change", () => {
    syncSortButtons();
    applyState({ resetPage: true });
  });
  for (const button of rangeSortButtons) {
    button.addEventListener("click", () => {
      sortOrder.value = button.dataset.sortOrder;
      syncSortButtons();
      applyState({ resetPage: true });
    });
  }
  advancedFilterToggle.addEventListener("click", () => {
    const toolbar = advancedFilterToggle.closest(".filter-workbench");
    const expanded = advancedFilterToggle.getAttribute("aria-expanded") !== "true";
    advancedFilterToggle.setAttribute("aria-expanded", String(expanded));
    toolbar?.classList.toggle("is-collapsed", !expanded);
  });
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
    setRatingRange(0, 10);
    setYearRange(0, yearBucketCount - 1);
    sortOrder.value = "created-desc";
    syncSortButtons();
    advancedFilterToggle.setAttribute("aria-expanded", "false");
    advancedFilterToggle.closest(".filter-workbench")?.classList.add("is-collapsed");
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
