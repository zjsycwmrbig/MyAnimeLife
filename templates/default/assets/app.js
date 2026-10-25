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
    !paginationPages
  ) {
    return;
  }

  const cards = [...recordsGrid.querySelectorAll(".record-card")];
  const total = cards.length;
  const pageSize = Math.max(
    1,
    Number.parseInt(recordsGrid.dataset.pageSize ?? "24", 10) || 24,
  );
  const params = new URLSearchParams(window.location.search);
  const requestedPage = Number.parseInt(params.get("page") ?? "1", 10);
  let currentPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  let currentResultCount = 0;

  const allowedFilters = new Set(["all", "rated", "unrated"]);
  const allowedSorts = new Set(["updated", "rating", "title"]);

  const initialState = {
    query: params.get("q") ?? "",
    filter: allowedFilters.has(params.get("status"))
      ? params.get("status")
      : "all",
    sort: allowedSorts.has(params.get("sort"))
      ? params.get("sort")
      : "updated",
  };

  searchInput.value = initialState.query;
  ratingFilter.value = initialState.filter;
  sortOrder.value = initialState.sort;

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

    return (
      new Date(right.dataset.updated).getTime() -
        new Date(left.dataset.updated).getTime() ||
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
    if (sortOrder.value !== "updated") {
      next.set("sort", sortOrder.value);
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
    paginationNav.hidden = count === 0 || pageCount <= 1;
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
  }

  searchInput.addEventListener("input", () => applyState({ resetPage: true }));
  ratingFilter.addEventListener("change", () =>
    applyState({ resetPage: true }),
  );
  sortOrder.addEventListener("change", () => applyState({ resetPage: true }));
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
    sortOrder.value = "updated";
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

  const coverCacheKey = "myanimelife.display-covers.v1";
  const coverRequests = new Map();

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
      const value = JSON.parse(localStorage.getItem(coverCacheKey) ?? "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  function writeCoverCache(cache) {
    try {
      localStorage.setItem(coverCacheKey, JSON.stringify(cache));
    } catch {
      // Private browsing and full storage should not break the archive page.
    }
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
    const cache = readCoverCache();
    const frames = [...
      document.querySelectorAll(
        ".record-cover[data-bangumi-id], .detail-cover[data-bangumi-id]",
      ),
    ].filter((frame) => frame.dataset.bangumiId && !frame.querySelector("img"));

    const recover = (frame) => {
      const subjectId = frame.dataset.bangumiId;
      const cached = normalizeCoverUrl(cache[subjectId]);
      if (cached) {
        appendCoverImage(frame, cached);
        return;
      }
      fetchBangumiCover(subjectId).then((url) => {
        if (!url) {
          return;
        }
        cache[subjectId] = url;
        writeCoverCache(cache);
        appendCoverImage(frame, url);
      });
    };

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }
            observer.unobserve(entry.target);
            recover(entry.target);
          }
        },
        { rootMargin: "500px 0px" },
      );
      frames.forEach((frame) => observer.observe(frame));
      return;
    }
    frames.forEach(recover);
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

  recoverMissingCovers();

  applyState();
})();
