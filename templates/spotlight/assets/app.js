(() => {
  const searchInput = document.querySelector("#record-search");
  const clearSearchButton = document.querySelector("#clear-search");
  const ratingFilter = document.querySelector("#rating-filter");
  const sortOrder = document.querySelector("#sort-order");
  const recordsGrid = document.querySelector("#records-grid");
  const resultsSummary = document.querySelector("#results-summary");
  const emptyState = document.querySelector("#empty-state");
  const resetFiltersButton = document.querySelector("#reset-filters");

  if (
    !searchInput ||
    !clearSearchButton ||
    !ratingFilter ||
    !sortOrder ||
    !recordsGrid ||
    !resultsSummary ||
    !emptyState
  ) {
    return;
  }

  const cards = [...recordsGrid.querySelectorAll(".record-card")];
  const total = cards.length;
  const params = new URLSearchParams(window.location.search);

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

    const nextUrl = `${window.location.pathname}${
      next.size ? `?${next.toString()}` : ""
    }${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }

  function applyState() {
    const query = normalize(searchInput.value);
    let visibleCount = 0;

    for (const card of cards) {
      const matchesQuery =
        !query || normalize(card.dataset.search).includes(query);
      const hasRating = card.dataset.rating !== "";
      const matchesRating =
        ratingFilter.value === "all" ||
        (ratingFilter.value === "rated" && hasRating) ||
        (ratingFilter.value === "unrated" && !hasRating);
      const visible = matchesQuery && matchesRating;
      card.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    }

    [...cards].sort(compareCards).forEach((card) => recordsGrid.append(card));

    clearSearchButton.hidden = !searchInput.value;
    emptyState.hidden = visibleCount !== 0;
    recordsGrid.hidden = visibleCount === 0;
    resultsSummary.textContent =
      visibleCount === total
        ? `共 ${total} 部作品`
        : `显示 ${visibleCount} / ${total} 部作品`;
    syncUrl();
  }

  searchInput.addEventListener("input", applyState);
  ratingFilter.addEventListener("change", applyState);
  sortOrder.addEventListener("change", applyState);

  clearSearchButton.addEventListener("click", () => {
    searchInput.value = "";
    searchInput.focus();
    applyState();
  });

  resetFiltersButton?.addEventListener("click", () => {
    searchInput.value = "";
    ratingFilter.value = "all";
    sortOrder.value = "updated";
    applyState();
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
