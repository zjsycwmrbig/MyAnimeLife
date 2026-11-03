(() => {
  const tabs = [...document.querySelectorAll("[data-insights-tab]")];
  const panels = [...document.querySelectorAll("[data-insights-panel]")];
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const target = tab.dataset.insightsTab;
      for (const candidate of tabs) {
        const active = candidate === tab;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-selected", String(active));
      }
      for (const panel of panels) {
        const active = panel.dataset.insightsPanel === target;
        panel.classList.toggle("is-active", active);
        panel.hidden = !active;
      }
    });
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const current = tabs.indexOf(tab);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next]?.focus();
      tabs[next]?.click();
    });
  }

  for (const carousel of document.querySelectorAll("[data-carousel]")) {
    const slides = [...carousel.querySelectorAll("[data-carousel-slide]")];
    if (!slides.length) {
      continue;
    }
    const status = carousel.querySelector("[data-carousel-status]");
    const previous = carousel.querySelector("[data-carousel-prev]");
    const next = carousel.querySelector("[data-carousel-next]");
    const subtabs = document.createElement("div");
    subtabs.className = "insight-subtabs";
    subtabs.setAttribute("role", "tablist");
    subtabs.setAttribute("aria-label", "当前模块快捷视图");
    const subtabsByIndex = [];
    slides.forEach((slide, slideIndex) => {
      const label = slide.getAttribute("aria-label") || `视图 ${slideIndex + 1}`;
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "insight-subtab";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", "false");
      tab.textContent = label;
      tab.addEventListener("click", () => showSlide(slideIndex));
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          return;
        }
        event.preventDefault();
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? slides.length - 1
              : (slideIndex +
                  (event.key === "ArrowRight" ? 1 : -1) +
                  slides.length) %
                slides.length;
        subtabsByIndex[nextIndex]?.focus();
        showSlide(nextIndex);
      });
      subtabs.append(tab);
      subtabsByIndex.push(tab);
    });
    carousel.querySelector(".carousel-toolbar")?.after(subtabs);
    let activeIndex = 0;
    const showSlide = (index) => {
      activeIndex = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === activeIndex;
        slide.classList.toggle("is-active", active);
        slide.hidden = !active;
      });
      subtabsByIndex.forEach((tab, tabIndex) => {
        const active = tabIndex === activeIndex;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      if (status) status.textContent = `${activeIndex + 1} / ${slides.length}`;
    };
    previous?.addEventListener("click", () => showSlide(activeIndex - 1));
    next?.addEventListener("click", () => showSlide(activeIndex + 1));
    showSlide(0);
  }

  for (const figure of document.querySelectorAll("[data-interactive-pie]")) {
    const pie = figure.querySelector(".year-pie");
    const tooltip = figure.querySelector(".pie-tooltip");
    const legend = figure.parentElement?.querySelector(".pie-legend");
    const segments = [...(legend?.querySelectorAll("[data-pie-segment]") ?? [])];
    if (!pie || !tooltip || !segments.length) {
      continue;
    }

    const clearActive = () => {
      tooltip.hidden = true;
      for (const segment of segments) {
        segment.classList.remove("is-active");
      }
    };

    const showSegment = (segment, left, top) => {
      for (const candidate of segments) {
        candidate.classList.toggle("is-active", candidate === segment);
      }
      tooltip.textContent =
        `${segment.dataset.label} · ${segment.dataset.count} 部 · ${segment.dataset.percent}%`;
      tooltip.hidden = false;
      const maximumLeft = Math.max(12, figure.clientWidth - tooltip.offsetWidth - 12);
      const maximumTop = Math.max(12, figure.clientHeight - tooltip.offsetHeight - 12);
      tooltip.style.left = `${Math.max(12, Math.min(maximumLeft, left))}px`;
      tooltip.style.top = `${Math.max(12, Math.min(maximumTop, top))}px`;
    };

    pie.addEventListener("pointermove", (event) => {
      const bounds = figure.getBoundingClientRect();
      const x = event.clientX - bounds.left - bounds.width / 2;
      const y = event.clientY - bounds.top - bounds.height / 2;
      if (Math.hypot(x, y) < bounds.width * 0.28) {
        clearActive();
        return;
      }
      const degrees = (Math.atan2(y, x) * 180) / Math.PI;
      const percent = ((degrees + 450) % 360) / 3.6;
      const segment =
        segments.find(
          (candidate) =>
            percent >= Number(candidate.dataset.start) &&
            percent < Number(candidate.dataset.end),
        ) ?? segments.at(-1);
      showSegment(
        segment,
        event.clientX - bounds.left + 12,
        event.clientY - bounds.top + 12,
      );
    });
    pie.addEventListener("pointerdown", (event) => {
      pie.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: event.clientX,
          clientY: event.clientY,
          bubbles: true,
        }),
      );
    });
    pie.addEventListener("pointerleave", clearActive);
    for (const segment of segments) {
      segment.addEventListener("focus", () => {
        showSegment(segment, figure.clientWidth / 2 - 70, 20);
      });
      segment.addEventListener("blur", clearActive);
    }
  }

  const SVG_NS = "http://www.w3.org/2000/svg";
  const createSvgElement = (name, attributes = {}) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }
    return node;
  };

  for (const figure of document.querySelectorAll("[data-tag-radar]")) {
    const host = figure.querySelector("[data-tag-radar-svg]");
    const tooltip = figure.querySelector("[data-tag-radar-tooltip]");
    const layout = figure.closest(".tag-radar-layout");
    const legendRows = [
      ...(layout?.querySelectorAll("[data-tag-radar-legend]") ?? []),
    ];
    if (!host || !tooltip || legendRows.length < 3) {
      continue;
    }

    const axes = legendRows
      .map((row, rowIndex) => ({
        index: Math.max(0, Number(row.dataset.tagIndex) || rowIndex),
        label:
          row.dataset.tagLabel ||
          row.textContent.trim() ||
          `标签 ${rowIndex + 1}`,
        count: Math.max(0, Number(row.dataset.tagCount) || 0),
        percent: Math.max(
          0,
          Math.min(100, Number(row.dataset.tagPercent) || 0),
        ),
        row,
      }))
      .sort((left, right) => left.index - right.index)
      .map((axis, index) => ({
        ...axis,
        index,
      }));
    const width = 560;
    const height = 430;
    const centerX = width / 2;
    const centerY = height / 2 + 4;
    const radius = 142;
    const labelRadius = 177;
    const step = (Math.PI * 2) / axes.length;
    const pointAt = (index, ratio) => {
      const angle = -Math.PI / 2 + index * step;
      return {
        x: centerX + Math.cos(angle) * radius * ratio,
        y: centerY + Math.sin(angle) * radius * ratio,
      };
    };
    const polygonPoints = (ratioForAxis) =>
      axes
        .map((axis) => {
          const point = pointAt(axis.index, ratioForAxis(axis));
          return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
        })
        .join(" ");

    const svg = createSvgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "group",
      "aria-label": "番剧标签偏好多边形图",
    });
    const title = createSvgElement("title");
    title.textContent = `标签偏好多边形图，共 ${axes.length} 个标签`;
    svg.append(title);

    for (let level = 1; level <= 4; level += 1) {
      svg.append(
        createSvgElement("polygon", {
          class: `tag-radar-ring${level === 4 ? " is-outer" : ""}`,
          points: polygonPoints(() => level / 4),
        }),
      );
    }

    const spokes = [];
    const labels = [];
    for (const axis of axes) {
      const edge = pointAt(axis.index, 1);
      const angle = -Math.PI / 2 + axis.index * step;
      const labelPoint = {
        x: centerX + Math.cos(angle) * labelRadius,
        y: centerY + Math.sin(angle) * labelRadius,
      };
      const spoke = createSvgElement("line", {
        class: "tag-radar-spoke",
        x1: centerX,
        y1: centerY,
        x2: edge.x,
        y2: edge.y,
      });
      const label = createSvgElement("text", {
        class: "tag-radar-axis-label",
        x: labelPoint.x,
        y: labelPoint.y,
        "text-anchor":
          labelPoint.x < centerX - 8
            ? "end"
            : labelPoint.x > centerX + 8
              ? "start"
              : "middle",
        "dominant-baseline":
          labelPoint.y < centerY - 8
            ? "auto"
            : labelPoint.y > centerY + 8
              ? "hanging"
              : "middle",
      });
      const visibleLabel =
        [...axis.label].length > 12
          ? `${[...axis.label].slice(0, 11).join("")}…`
          : axis.label;
      label.textContent = visibleLabel;
      svg.append(spoke, label);
      spokes.push(spoke);
      labels.push(label);
    }

    const radarShape = createSvgElement("polygon", {
      class: "tag-radar-shape",
      points: polygonPoints((axis) => axis.percent / 100),
    });
    svg.append(radarShape);

    const points = axes.map((axis) => {
      const point = pointAt(axis.index, axis.percent / 100);
      const group = createSvgElement("g", {
        class: "tag-radar-point-target",
        tabindex: "0",
        role: "img",
        "aria-label": `${axis.label}，${axis.count} 部作品`,
      });
      const hitArea = createSvgElement("circle", {
        class: "tag-radar-point-hit",
        cx: point.x,
        cy: point.y,
        r: 15,
      });
      const dot = createSvgElement("circle", {
        class: "tag-radar-point",
        cx: point.x,
        cy: point.y,
        r: 5,
      });
      group.append(hitArea, dot);
      svg.append(group);
      return group;
    });

    host.replaceChildren(svg);
    let activeIndex = null;

    const setActive = (index) => {
      activeIndex = index;
      spokes.forEach((spoke, spokeIndex) =>
        spoke.classList.toggle("is-active", spokeIndex === index),
      );
      labels.forEach((label, labelIndex) =>
        label.classList.toggle("is-active", labelIndex === index),
      );
      points.forEach((point, pointIndex) =>
        point.classList.toggle("is-active", pointIndex === index),
      );
      axes.forEach((axis, axisIndex) =>
        axis.row.classList.toggle("is-active", axisIndex === index),
      );
    };

    const hideTooltip = () => {
      tooltip.hidden = true;
      setActive(null);
    };

    const showTooltip = (axis, clientX, clientY) => {
      setActive(axis.index);
      tooltip.textContent = `${axis.label} · ${axis.count} 部 · ${axis.percent}%`;
      tooltip.hidden = false;
      const bounds = figure.getBoundingClientRect();
      const preferredLeft =
        Number.isFinite(clientX) ? clientX - bounds.left + 14 : bounds.width / 2;
      const preferredTop =
        Number.isFinite(clientY) ? clientY - bounds.top + 14 : 24;
      const maximumLeft = Math.max(
        10,
        bounds.width - tooltip.offsetWidth - 10,
      );
      const maximumTop = Math.max(
        10,
        bounds.height - tooltip.offsetHeight - 10,
      );
      tooltip.style.left = `${Math.max(10, Math.min(maximumLeft, preferredLeft))}px`;
      tooltip.style.top = `${Math.max(10, Math.min(maximumTop, preferredTop))}px`;
    };

    const showFromElement = (axis, element) => {
      const bounds = element.getBoundingClientRect();
      showTooltip(axis, bounds.left + bounds.width / 2, bounds.top + 8);
    };

    axes.forEach((axis) => {
      const point = points[axis.index];
      point.addEventListener("pointerenter", (event) =>
        showTooltip(axis, event.clientX, event.clientY),
      );
      point.addEventListener("pointermove", (event) =>
        showTooltip(axis, event.clientX, event.clientY),
      );
      point.addEventListener("pointerleave", hideTooltip);
      point.addEventListener("focus", () => showFromElement(axis, point));
      point.addEventListener("blur", hideTooltip);
      axis.row.addEventListener("pointerenter", () =>
        showFromElement(axis, axis.row),
      );
      axis.row.addEventListener("focus", () =>
        showFromElement(axis, axis.row),
      );
      axis.row.addEventListener("pointerleave", hideTooltip);
      axis.row.addEventListener("blur", hideTooltip);
    });

    figure.addEventListener("pointerleave", () => {
      if (activeIndex !== null) {
        hideTooltip();
      }
    });
  }

  const tagRatingDistribution = document.querySelector(".rating-breakdown-tags");
  const tagRatingSort = document.querySelector("#insights-tag-rating-sort");
  if (tagRatingDistribution && tagRatingSort) {
    const tagRows = [
      ...tagRatingDistribution.querySelectorAll(".rating-breakdown-row"),
    ];
    const numberValue = (value) => {
      const number = Number.parseFloat(String(value ?? ""));
      return Number.isFinite(number) ? number : null;
    };

    const applyTagRatingSort = () => {
      tagRows.sort((left, right) => {
        const leftAverage = numberValue(left.dataset.tagAverage) ?? -1;
        const rightAverage = numberValue(right.dataset.tagAverage) ?? -1;
        const leftCount = numberValue(left.dataset.tagCount) ?? 0;
        const rightCount = numberValue(right.dataset.tagCount) ?? 0;
        const leftRated = numberValue(left.dataset.tagRated) ?? 0;
        const rightRated = numberValue(right.dataset.tagRated) ?? 0;

        if (tagRatingSort.value === "average-asc") {
          return leftAverage - rightAverage || rightRated - leftRated || rightCount - leftCount;
        }
        if (tagRatingSort.value === "count-desc") {
          return rightCount - leftCount || rightAverage - leftAverage || rightRated - leftRated;
        }
        if (tagRatingSort.value === "count-asc") {
          return leftCount - rightCount || rightAverage - leftAverage || rightRated - leftRated;
        }
        if (tagRatingSort.value === "rated-desc") {
          return rightRated - leftRated || rightAverage - leftAverage || rightCount - leftCount;
        }
        if (tagRatingSort.value === "rated-asc") {
          return leftRated - rightRated || rightAverage - leftAverage || rightCount - leftCount;
        }
        return rightAverage - leftAverage || rightRated - leftRated || rightCount - leftCount;
      });

      tagRatingDistribution.append(...tagRows);
    };

    tagRatingSort.addEventListener("change", applyTagRatingSort);
    applyTagRatingSort();
  }

  const tagDeviationList = document.querySelector(".tag-rating-deviation-list");
  const tagDeviationPagination = document.querySelector(
    ".tag-rating-deviation-pagination",
  );
  if (tagDeviationList && tagDeviationPagination) {
    const tagDeviationRows = [
      ...tagDeviationList.querySelectorAll(".tag-rating-deviation-row"),
    ];
    const previousButton = tagDeviationPagination.querySelector(
      "[data-tag-deviation-prev]",
    );
    const nextButton = tagDeviationPagination.querySelector(
      "[data-tag-deviation-next]",
    );
    const status = tagDeviationPagination.querySelector(
      "[data-tag-deviation-status]",
    );
    const pageSize = 10;
    let page = 0;

    tagDeviationRows.sort((left, right) => {
      const leftCount = Number.parseInt(left.dataset.tagCount ?? "", 10) || 0;
      const rightCount = Number.parseInt(right.dataset.tagCount ?? "", 10) || 0;
      return rightCount - leftCount;
    });
    tagDeviationList.append(...tagDeviationRows);

    const renderTagDeviationPage = () => {
      const pageCount = Math.max(1, Math.ceil(tagDeviationRows.length / pageSize));
      page = Math.min(page, pageCount - 1);
      const start = page * pageSize;
      tagDeviationRows.forEach((row, rowIndex) => {
        row.hidden = rowIndex < start || rowIndex >= start + pageSize;
      });
      tagDeviationPagination.hidden = pageCount <= 1;
      if (status) {
        status.textContent = `第 ${page + 1} / ${pageCount} 页 · 共 ${tagDeviationRows.length} 个标签`;
      }
      if (previousButton) previousButton.disabled = page === 0;
      if (nextButton) nextButton.disabled = page >= pageCount - 1;
    };

    previousButton?.addEventListener("click", () => {
      page -= 1;
      renderTagDeviationPage();
    });
    nextButton?.addEventListener("click", () => {
      page += 1;
      renderTagDeviationPage();
    });
    renderTagDeviationPage();
  }

  const yearDistribution = document.querySelector("#year-distribution");
  const yearMinInput = document.querySelector("#insights-year-min");
  const yearMaxInput = document.querySelector("#insights-year-max");
  const yearSort = document.querySelector("#insights-year-sort");
  const ratingFilter = document.querySelector("#insights-rating-filter");
  const filterSummary = document.querySelector("#insights-filter-summary");
  if (!yearDistribution || !yearMinInput || !yearMaxInput || !yearSort || !ratingFilter) return;
  const yearRows = [...yearDistribution.querySelectorAll(".distribution-row")];
  const fineRatings = [...document.querySelectorAll(".rating-fine-item")];
  const numberValue = (value) => {
    const number = Number.parseFloat(String(value ?? ""));
    return Number.isFinite(number) ? number : null;
  };
  const applyInsightFilters = () => {
    const minimum = numberValue(yearMinInput.value);
    const maximum = numberValue(yearMaxInput.value);
    const visibleYears = yearRows.filter((row) => {
      const year = numberValue(row.dataset.year);
      const visible = year === null || ((minimum === null || year >= minimum) && (maximum === null || year <= maximum));
      row.hidden = !visible;
      return visible;
    });
    visibleYears.sort((left, right) => {
      const leftYear = numberValue(left.dataset.year) ?? -1;
      const rightYear = numberValue(right.dataset.year) ?? -1;
      const leftCount = numberValue(left.dataset.count) ?? 0;
      const rightCount = numberValue(right.dataset.count) ?? 0;
      const leftAverage = numberValue(left.dataset.average) ?? -1;
      const rightAverage = numberValue(right.dataset.average) ?? -1;
      if (yearSort.value === "count-desc") return rightCount - leftCount || rightYear - leftYear;
      if (yearSort.value === "average-desc") return rightAverage - leftAverage || rightYear - leftYear;
      return yearSort.value === "year-asc" ? leftYear - rightYear : rightYear - leftYear;
    });
    yearDistribution.append(...visibleYears);
    let visibleRatings = 0;
    for (const item of fineRatings) {
      const rating = numberValue(item.dataset.rating);
      const visible = ratingFilter.value === "all" || (ratingFilter.value === "high" && rating >= 8) || (ratingFilter.value === "mid" && rating >= 6 && rating < 8) || (ratingFilter.value === "low" && rating < 6);
      item.hidden = !visible;
      if (visible) visibleRatings += 1;
    }
    if (filterSummary) filterSummary.textContent = `显示 ${visibleYears.length} 个年份分组 · ${visibleRatings} 个评分档位`;
  };
  [yearMinInput, yearMaxInput].forEach((input) => input.addEventListener("change", applyInsightFilters));
  yearSort.addEventListener("change", applyInsightFilters);
  ratingFilter.addEventListener("change", applyInsightFilters);
  applyInsightFilters();
})();

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
  const currentCoverage = document.querySelector("#currentCoverage");
  const peerTotal = document.querySelector("#peerTotal");
  const peerAverage = document.querySelector("#peerAverage");
  const peerCoverage = document.querySelector("#peerCoverage");
  const sharedTotal = document.querySelector("#sharedTotal");
  const overlapPercent = document.querySelector("#overlapPercent");
  const overlapBar = document.querySelector("#overlapBar");
  const compareOverviewOverlapChart = document.querySelector("#compareOverviewOverlapChart");
  const compareOverviewRatingChart = document.querySelector("#compareOverviewRatingChart");
  const compareOverviewRatingMeta = document.querySelector("#compareOverviewRatingMeta");
  const compareOverviewYearChart = document.querySelector("#compareOverviewYearChart");
  const compareOverviewYearMeta = document.querySelector("#compareOverviewYearMeta");
  const compareOverviewTagChart = document.querySelector("#compareOverviewTagChart");
  const compareOverviewTagMeta = document.querySelector("#compareOverviewTagMeta");
  const compareOverviewCoverageChart = document.querySelector("#compareOverviewCoverageChart");
  const discoverySearch = document.querySelector("#discoverySearch");
  const discoveryRatingFilter = document.querySelector("#discoveryRatingFilter");
  const discoverySort = document.querySelector("#discoverySort");
  const discoveryResultSummary = document.querySelector("#discoveryResultSummary");
  const discoveryCollection = document.querySelector("#discoveryCollection");
  const overlapTabs = document.querySelector("[data-overlap-tabs]");
  const overlapSearch = document.querySelector("#overlapSearch");
  const overlapRatingFilter = document.querySelector("#overlapRatingFilter");
  const overlapSort = document.querySelector("#overlapSort");
  const overlapResultSummary = document.querySelector("#overlapResultSummary");
  const overlapCollection = document.querySelector("#overlapCollection");
  const ratingDifferenceList = document.querySelector("#ratingDifferenceList");
  const ratingDifferenceTabCount = document.querySelector("#ratingDifferenceTabCount");
  const ratingDifferenceSearch = document.querySelector("#ratingDifferenceSearch");
  const ratingDifferenceFilter = document.querySelector("#ratingDifferenceFilter");
  const ratingDifferenceSort = document.querySelector("#ratingDifferenceSort");
  const compareDecades = document.querySelector("#compareDecades");
  const compareRatings = document.querySelector("#compareRatings");
  const compareRatingBalance = document.querySelector("#compareRatingBalance");
  const currentPreferredDecade = document.querySelector("#currentPreferredDecade");
  const currentPreferredDecadeMeta = document.querySelector("#currentPreferredDecadeMeta");
  const peerPreferredDecade = document.querySelector("#peerPreferredDecade");
  const peerPreferredDecadeMeta = document.querySelector("#peerPreferredDecadeMeta");
  const decadePreferenceGap = document.querySelector("#decadePreferenceGap");
  const decadePreferenceGapMeta = document.querySelector("#decadePreferenceGapMeta");
  const ratingCurrentAverage = document.querySelector("#ratingCurrentAverage");
  const ratingPeerAverage = document.querySelector("#ratingPeerAverage");
  const currentHigherCount = document.querySelector("#currentHigherCount");
  const peerHigherCount = document.querySelector("#peerHigherCount");
  const tiedRatingCount = document.querySelector("#tiedRatingCount");
  const ratingDifferenceSummary = document.querySelector("#ratingDifferenceSummary");
  const maxRatingDifference = document.querySelector("#maxRatingDifference");
  const maxRatingDifferenceTitle = document.querySelector("#maxRatingDifferenceTitle");
  const maxRatingDifferenceCopy = document.querySelector("#maxRatingDifferenceCopy");
  const compareCompleteness = document.querySelector("#compareCompleteness");
  const compareTasteStatus = document.querySelector("#compareTasteStatus");
  const compareTagRadar = document.querySelector("#compareTagRadar");
  const compareTagDeviations = document.querySelector("#compareTagDeviations");
  const shareComparisonData = document.querySelector("#share-comparison-data");
  const ownRepository = section.dataset.ownRepository.trim();
  const ownBranch = section.dataset.ownBranch.trim() || "main";
  const currentDataUrl = section.dataset.currentDataUrl;
  const storageKey = "anime-records:repository-peers";
  const tabStorageKey = "anime-records:comparison-tab";
  const maximumPayloadLength = 8 * 1024 * 1024;
  const maximumCachePayloadLength = 24 * 1024 * 1024;
  const listLimit = 12;
  const ratingDifferenceLimit = 10;
  let comparisonModel = null;
  let discoveryView = "card";
  let overlapView = "card";
  let overlapScope = "shared";
  let ratingDifferenceView = "list";
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

  function rawCacheUrl(repository, branch) {
    const [owner, repo] = repository.split("/").map(encodeURIComponent);
    const branchPath = branch.split("/").map(encodeURIComponent).join("/");
    return `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${branchPath}/data/bangumi-cache.jsonl`;
  }

  async function fetchText(url, label, maximumLength = maximumPayloadLength) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json, text/plain;q=0.9" },
    });
    if (!response.ok) {
      throw new Error(`${label}读取失败（HTTP ${response.status}）`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (declaredLength > maximumLength) {
      throw new Error(`${label}超过 ${Math.round(maximumLength / 1024 / 1024)} MiB，已停止读取`);
    }
    const text = await response.text();
    if (text.length > maximumLength) {
      throw new Error(`${label}超过 ${Math.round(maximumLength / 1024 / 1024)} MiB，已停止读取`);
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

  async function loadBangumiCache(repository, branch, label) {
    if (!repository) {
      return {
        available: false,
        entries: new Map(),
        error: `${label}没有可读取的公开仓库地址`,
      };
    }
    try {
      const text = await fetchText(
        rawCacheUrl(repository, branch),
        `${label} Bangumi 缓存`,
        maximumCachePayloadLength,
      );
      const entries = new Map();
      for (const line of text.split(/\r?\n/u)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let entry;
        try {
          entry = JSON.parse(trimmed);
        } catch {
          continue;
        }
        const subjectId = String(entry?.subjectId ?? "").trim();
        if (!subjectId) continue;
        const tags = (Array.isArray(entry.tags) ? entry.tags : [])
          .map((tag) => String(tag?.name ?? tag?.[0] ?? "").trim())
          .filter(Boolean);
        entries.set(subjectId, { tags });
      }
      return { available: entries.size > 0, entries, error: entries.size ? "" : `${label} Bangumi 缓存为空` };
    } catch (error) {
      return {
        available: false,
        entries: new Map(),
        error: error.message || `${label} Bangumi 缓存读取失败`,
      };
    }
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
      reviewExcerpt: String(item.reviewExcerpt ?? "").trim(),
      coverUrl: String(item.coverUrl ?? "").trim(),
      rating:
        item.rating === null || item.rating === undefined
          ? null
          : Number(item.rating),
      season: item.season ?? null,
      externalIds: item.externalIds ?? {},
      match: item.match ?? null,
      createdAt: item.createdAt ?? null,
      updatedAt: item.updatedAt ?? null,
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

  function distribution(items, keyFor, labelFor) {
    const groups = new Map();
    for (const item of items) {
      const key = keyFor(item);
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => {
        if (left === null) return 1;
        if (right === null) return -1;
        return Number(right) - Number(left);
      })
      .map(([key, count]) => ({ key, label: labelFor(key), count }));
  }

  function standardDeviation(values) {
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return null;
    const mean = finite.reduce((total, value) => total + value, 0) / finite.length;
    const variance =
      finite.reduce((total, value) => total + (value - mean) ** 2, 0) /
      finite.length;
    return Math.round(Math.sqrt(variance) * 10) / 10;
  }

  function timestamp(value) {
    const parsed = new Date(value ?? "").getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function percent(count, total) {
    return total ? Math.round((count / total) * 1000) / 10 : 0;
  }

  function profile(items) {
    const rated = items.filter((item) => Number.isFinite(item.rating)).length;
    const ratedValues = items.map((item) => item.rating).filter(Number.isFinite);
    const yearDistribution = distribution(
      items,
      (item) => {
        const year = Number(item.season?.year);
        return Number.isInteger(year) && year >= 1900 ? year : null;
      },
      (key) => key === null ? "年份未知" : String(key),
    );
    const ratingDistribution = distribution(
      items,
      (item) => {
        if (!Number.isFinite(item.rating)) return "unrated";
        if (item.rating < 6) return "0-5.9";
        if (item.rating < 7) return "6-6.9";
        if (item.rating < 8) return "7-7.9";
        if (item.rating < 9) return "8-8.9";
        return "9-10";
      },
      (key) => ({"0-5.9": "0 - 5.9", "6-6.9": "6 - 6.9", "7-7.9": "7 - 7.9", "8-8.9": "8 - 8.9", "9-10": "9 - 10", unrated: "未评分"}[key] || key),
    );
    const decadeDistribution = distribution(
      items,
      (item) => {
        const year = Number(item.season?.year);
        return Number.isInteger(year) && year >= 1900
          ? Math.floor(year / 10) * 10
          : null;
      },
      (key) => (key === null ? "年代未知" : `${key}s`),
    );
    const now = Date.now();
    const createdValues = items
      .map((item) => timestamp(item.createdAt))
      .filter((value) => value !== null);
    const recent = (days) =>
      createdValues.filter((value) => now - value <= days * 86400000).length;
    const reviewCount = items.filter((item) => item.reviewExcerpt).length;
    const coverCount = items.filter((item) => item.coverUrl).length;
    const seasonCount = items.filter((item) => Number.isInteger(Number(item.season?.year))).length;
    const seasonNumberCount = items.filter((item) => Number.isInteger(Number(item.season?.number))).length;
    const externalIdCount = items.filter((item) => Object.values(item.externalIds ?? {}).some(Boolean)).length;
    const bangumiIdCount = items.filter((item) => item.externalIds?.bangumi).length;
    return {
      total: items.length,
      rated,
      ratedPercent: percent(rated, items.length),
      averageRating: average(items),
      ratingDeviation: standardDeviation(ratedValues),
      years: yearDistribution,
      decades: decadeDistribution,
      ratings: ratingDistribution,
      recent30: recent(30),
      recent365: recent(365),
      coverage: {
        review: percent(reviewCount, items.length),
        cover: percent(coverCount, items.length),
        year: percent(seasonCount, items.length),
        season: percent(seasonNumberCount, items.length),
        externalId: percent(externalIdCount, items.length),
        bangumiId: percent(bangumiIdCount, items.length),
        createdAt: percent(createdValues.length, items.length),
      },
    };
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
    const currentProfile = profile(current);
    const peerProfile = profile(peer);
    const higher = ratingDifferences.filter((item) => item.ratingDifference > 0).length;
    const lower = ratingDifferences.filter((item) => item.ratingDifference < 0).length;
    const tied = ratingDifferences.filter((item) => item.ratingDifference === 0).length;
    const averageGap = ratingDifferences.length
      ? Math.round(
          (ratingDifferences.reduce(
            (total, item) => total + Math.abs(item.ratingDifference),
            0,
          ) /
            ratingDifferences.length) *
            10,
        ) / 10
      : null;

    return {
      current,
      peer,
      currentProfile,
      peerProfile,
      shared,
      currentOnly,
      peerOnly,
      ratingDifferences,
      ratingComparison: {
        higher,
        lower,
        tied,
        averageGap,
        maximumDifference: ratingDifferences[0] ?? null,
      },
      overlapPercent: unionSize
        ? Math.round((shared.length / unionSize) * 1000) / 10
        : 0,
    };
  }

  const ignoredTagKeys = new Set([
    "tv",
    "web",
    "ova",
    "剧场版",
    "动画",
    "日本",
    "日本动画",
    "tv动画",
  ]);

  function tagKey(value) {
    return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
  }

  function tagsForItem(item, cache) {
    const subjectId = String(item.externalIds?.bangumi ?? "").trim();
    const tags = subjectId ? cache.entries.get(subjectId)?.tags ?? [] : [];
    const unique = new Map();
    for (const rawTag of tags) {
      const name = String(rawTag ?? "").trim();
      const key = tagKey(name);
      if (
        !key ||
        ignoredTagKeys.has(key) ||
        /^(?:19|20)\d{2}(?:年|\/|-|$)/u.test(key)
      ) {
        continue;
      }
      if (!unique.has(key)) unique.set(key, name);
    }
    return [...unique.values()];
  }

  function compareTags(current, peer, currentCache, peerCache) {
    if (!currentCache.available || !peerCache.available) {
      const missing = [
        !currentCache.available ? `当前档案：${currentCache.error || "缓存不可用"}` : "",
        !peerCache.available ? `对方档案：${peerCache.error || "缓存不可用"}` : "",
      ].filter(Boolean);
      return {
        available: false,
        status: `标签数据不足。${missing.join("；")}`,
        topTags: [],
        deviations: [],
        similarity: null,
        currentTagged: 0,
        peerTagged: 0,
        currentUniqueTags: 0,
        peerUniqueTags: 0,
        sharedTagCount: 0,
      };
    }

    const groups = new Map();
    let currentTagged = 0;
    let peerTagged = 0;
    function addItems(items, side, cache) {
      for (const item of items) {
        const tags = tagsForItem(item, cache);
        if (tags.length) {
          if (side === "current") currentTagged += 1;
          else peerTagged += 1;
        }
        for (const name of tags) {
          const key = tagKey(name);
          const group = groups.get(key) ?? {
            key,
            name,
            currentCount: 0,
            peerCount: 0,
            currentRatings: [],
            peerRatings: [],
          };
          if (side === "current") {
            group.currentCount += 1;
            if (Number.isFinite(item.rating)) group.currentRatings.push(item.rating);
          } else {
            group.peerCount += 1;
            if (Number.isFinite(item.rating)) group.peerRatings.push(item.rating);
          }
          groups.set(key, group);
        }
      }
    }
    addItems(current, "current", currentCache);
    addItems(peer, "peer", peerCache);

    const allGroups = [...groups.values()].map((group) => ({
      ...group,
      currentAverage: group.currentRatings.length ? average(group.currentRatings.map((rating) => ({ rating }))) : null,
      peerAverage: group.peerRatings.length ? average(group.peerRatings.map((rating) => ({ rating }))) : null,
    }));
    const currentUniqueTags = allGroups.filter((group) => group.currentCount > 0).length;
    const peerUniqueTags = allGroups.filter((group) => group.peerCount > 0).length;
    const sharedTagCount = allGroups.filter(
      (group) => group.currentCount > 0 && group.peerCount > 0,
    ).length;
    const topTags = [...allGroups]
      .sort(
        (left, right) =>
          right.currentCount + right.peerCount - left.currentCount - left.peerCount ||
          left.name.localeCompare(right.name, "zh-CN"),
      )
      .slice(0, 8);
    const deviations = allGroups
      .filter(
        (group) =>
          group.currentAverage !== null &&
          group.peerAverage !== null &&
          group.currentRatings.length > 0 &&
          group.peerRatings.length > 0,
      )
      .map((group) => ({
        ...group,
        difference: Math.round((group.currentAverage - group.peerAverage) * 10) / 10,
      }))
      .sort(
        (left, right) =>
          Math.abs(right.difference) - Math.abs(left.difference) ||
          right.currentCount + right.peerCount - left.currentCount - left.peerCount,
      );
    const dot = topTags.reduce(
      (total, tag) => total + tag.currentCount * tag.peerCount,
      0,
    );
    const currentMagnitude = Math.sqrt(
      topTags.reduce((total, tag) => total + tag.currentCount ** 2, 0),
    );
    const peerMagnitude = Math.sqrt(
      topTags.reduce((total, tag) => total + tag.peerCount ** 2, 0),
    );
    return {
      available: topTags.length > 0,
      status: topTags.length
        ? `已从公开缓存读取标签：当前 ${currentTagged} 部，对方 ${peerTagged} 部。`
        : "双方公开缓存中还没有可用于对比的共同标签。",
      topTags,
      deviations,
      similarity:
        currentMagnitude && peerMagnitude
          ? Math.round((dot / (currentMagnitude * peerMagnitude)) * 1000) / 10
          : null,
      currentTagged,
      peerTagged,
      currentUniqueTags,
      peerUniqueTags,
      sharedTagCount,
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

  function createPageButton(label, disabled, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "compare-page-button";
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  function renderPaginatedCollection(container, items, options) {
    if (!container) return;
    const pageSize = options.pageSize || listLimit;
    let page = 0;

    function draw() {
      container.replaceChildren();
      const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
      page = Math.min(Math.max(page, 0), totalPages - 1);
      const start = page * pageSize;
      const visible = items.slice(start, start + pageSize);
      const body = document.createElement("div");
      body.className = options.bodyClass || "compare-page-list";
      if (!visible.length) {
        body.append(
          createTextElement("p", "compare-empty", options.emptyText),
        );
      } else {
        visible.forEach((item, index) => {
          body.append(options.renderItem(item, start + index));
        });
      }
      container.append(body);

      if (items.length <= pageSize) return;
      const pagination = document.createElement("nav");
      pagination.className = "compare-pagination";
      pagination.setAttribute("aria-label", options.ariaLabel || "分页查看全部");
      pagination.append(
        createTextElement(
          "span",
          "compare-pagination-summary",
          `第 ${page + 1} / ${totalPages} 页 · 共 ${items.length} ${options.unit || "项"}`,
        ),
      );
      const actions = document.createElement("div");
      actions.className = "compare-pagination-actions";
      actions.append(
        createPageButton("首页", page === 0, () => {
          page = 0;
          draw();
        }),
        createPageButton("上一页", page === 0, () => {
          page -= 1;
          draw();
        }),
        createPageButton("下一页", page >= totalPages - 1, () => {
          page += 1;
          draw();
        }),
        createPageButton("末页", page >= totalPages - 1, () => {
          page = totalPages - 1;
          draw();
        }),
      );
      pagination.append(actions);
      container.append(pagination);
    }

    draw();
  }

  function itemYear(item) {
    const value = Number(item.season?.year);
    return Number.isInteger(value) && value >= 1900 ? value : null;
  }

  function itemRating(item, side = "current") {
    if (side === "peer") {
      return Number.isFinite(item.peerRating) ? item.peerRating : item.rating;
    }
    return Number.isFinite(item.rating) ? item.rating : null;
  }

  function normalizeCollectionText(value) {
    return String(value ?? "").normalize("NFKC").toLocaleLowerCase("zh-CN");
  }

  function filterAndSortCollection(items, options) {
    const needle = normalizeCollectionText(options.search).trim();
    const filtered = items.filter((item) => {
      const rating = itemRating(item, options.ratingSide);
      if (options.ratingFilter === "rated" && !Number.isFinite(rating)) return false;
      if (options.ratingFilter === "high" && (!Number.isFinite(rating) || rating < 8)) return false;
      if (options.ratingFilter === "unrated" && Number.isFinite(rating)) return false;
      if (!needle) return true;
      return normalizeCollectionText([
        item.title,
        item.peerTitle,
        seasonLabel(item.season),
        itemYear(item),
      ].filter(Boolean).join(" ")).includes(needle);
    });
    const sorted = [...filtered];
    const ratingValue = (item) => {
      const rating = itemRating(item, options.ratingSide);
      return Number.isFinite(rating) ? rating : null;
    };
    sorted.sort((left, right) => {
      const leftRating = ratingValue(left);
      const rightRating = ratingValue(right);
      const leftYear = itemYear(left);
      const rightYear = itemYear(right);
      if (options.sort === "rating-desc") {
        return (rightRating ?? -Infinity) - (leftRating ?? -Infinity) ||
          left.title.localeCompare(right.title, "zh-CN");
      }
      if (options.sort === "rating-asc") {
        return (leftRating ?? Infinity) - (rightRating ?? Infinity) ||
          left.title.localeCompare(right.title, "zh-CN");
      }
      if (options.sort === "year-desc") {
        return (rightYear ?? -Infinity) - (leftYear ?? -Infinity) ||
          left.title.localeCompare(right.title, "zh-CN");
      }
      if (options.sort === "year-asc") {
        return (leftYear ?? Infinity) - (rightYear ?? Infinity) ||
          left.title.localeCompare(right.title, "zh-CN");
      }
      return left.title.localeCompare(right.title, "zh-CN");
    });
    return sorted;
  }

  function coverUrl(value) {
    const candidate = String(value ?? "").trim();
    if (candidate.startsWith("//")) return `https:${candidate}`;
    if (/^http:\/\//iu.test(candidate)) return candidate.replace(/^http:\/\//iu, "https://");
    return /^https:\/\//iu.test(candidate) ? candidate : "";
  }

  function createCompareCover(item) {
    const frame = document.createElement("div");
    frame.className = "compare-anime-cover";
    const source = coverUrl(item.coverUrl);
    if (!source) {
      frame.classList.add("is-missing");
      frame.append(createTextElement("span", "", "NO COVER"));
      return frame;
    }
    const image = document.createElement("img");
    image.src = source;
    image.alt = `${item.title}封面`;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      image.remove();
      frame.classList.add("is-missing");
      frame.append(createTextElement("span", "", "NO COVER"));
    }, { once: true });
    frame.append(image);
    return frame;
  }

  function createRatingBlock(item, side, label) {
    const rating = itemRating(item, side);
    const block = document.createElement("span");
    block.className = `compare-anime-rating is-${side}`;
    block.append(
      createTextElement("small", "", label),
      createTextElement("strong", "", ratingLabel(rating)),
    );
    return block;
  }

  function ratingBlocks(item, side) {
    const host = document.createElement("div");
    host.className = "compare-anime-rating-row";
    if (side === "both") {
      host.append(
        createRatingBlock(item, "current", "你"),
        createRatingBlock(item, "peer", "对方"),
      );
    } else {
      host.append(createRatingBlock(item, side, side === "peer" ? "对方" : "评分"));
    }
    return host;
  }

  function createAnimeCard(item, side) {
    const card = document.createElement("article");
    card.className = "compare-anime-card";
    const body = document.createElement("div");
    body.className = "compare-anime-card-body";
    body.append(
      createTextElement("span", "compare-anime-year", itemYear(item) ? `${itemYear(item)} · ${seasonLabel(item.season)}` : seasonLabel(item.season) || "年代未标注"),
      createTextElement("h4", "", item.title),
      ratingBlocks(item, side),
    );
    card.append(createCompareCover(item), body);
    return card;
  }

  function createAnimeRow(item, side) {
    const row = document.createElement("article");
    row.className = "compare-anime-row";
    const copy = document.createElement("div");
    copy.className = "compare-anime-row-copy";
    copy.append(
      createTextElement("strong", "", item.title),
      createTextElement("span", "", [itemYear(item), seasonLabel(item.season)].filter(Boolean).join(" · ") || "年代未标注"),
    );
    row.append(copy, ratingBlocks(item, side));
    return row;
  }

  function renderLibraryCollection(container, items, view, side, options = {}) {
    const cardView = view === "card";
    renderPaginatedCollection(container, items, {
      pageSize: cardView ? 12 : listLimit,
      unit: "部",
      ariaLabel: options.ariaLabel,
      bodyClass: cardView ? "compare-anime-card-grid" : "compare-anime-list",
      emptyText: options.emptyText || "没有符合条件的作品",
      renderItem: (item) => cardView ? createAnimeCard(item, side) : createAnimeRow(item, side),
    });
  }

  function bindViewControl(name, onChange) {
    const control = section.querySelector(`[data-view-control="${name}"]`);
    if (!control) return;
    const buttons = [...control.querySelectorAll("[data-view-mode]")];
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        for (const candidate of buttons) {
          const active = candidate === button;
          candidate.classList.toggle("is-active", active);
          candidate.setAttribute("aria-pressed", String(active));
        }
        onChange(button.dataset.viewMode);
      });
    });
  }

  function renderDiscoveryCollection() {
    if (!comparisonModel) return;
    const items = filterAndSortCollection(comparisonModel.peerOnly, {
      search: discoverySearch.value,
      ratingFilter: discoveryRatingFilter.value,
      sort: discoverySort.value,
      ratingSide: "peer",
    });
    discoveryResultSummary.textContent = `共 ${items.length} 部符合条件 · ${discoveryView === "card" ? "卡片视图" : "列表视图"}`;
    renderLibraryCollection(discoveryCollection, items, discoveryView, "peer", {
      ariaLabel: "分页查看片单灵感",
      emptyText: "没有符合条件的对方独有收藏",
    });
  }

  function renderOverlapCollection() {
    if (!comparisonModel) return;
    const sources = {
      shared: { items: comparisonModel.shared, side: "both", label: "共同收藏" },
      currentOnly: { items: comparisonModel.currentOnly, side: "current", label: "仅当前档案" },
      peerOnly: { items: comparisonModel.peerOnly, side: "peer", label: "仅对方档案" },
    };
    const source = sources[overlapScope] || sources.shared;
    const items = filterAndSortCollection(source.items, {
      search: overlapSearch.value,
      ratingFilter: overlapRatingFilter.value,
      sort: overlapSort.value,
      ratingSide: source.side === "peer" ? "peer" : "current",
    });
    overlapResultSummary.textContent = `${source.label} · 共 ${items.length} 部符合条件 · ${overlapView === "card" ? "卡片视图" : "列表视图"}`;
    renderLibraryCollection(overlapCollection, items, overlapView, source.side, {
      ariaLabel: `分页查看${source.label}`,
      emptyText: `${source.label}中没有符合条件的作品`,
    });
  }

  function renderComparisonBars(container, currentItems, peerItems) {
    if (!container) return;
    container.replaceChildren();
    const keys = new Map();
    [...currentItems, ...peerItems].forEach((item) => keys.set(item.label, item));
    const maximum = Math.max(1, ...[...keys.keys()].map((label) => {
      const current = currentItems.find((item) => item.label === label)?.count || 0;
      const peer = peerItems.find((item) => item.label === label)?.count || 0;
      return Math.max(current, peer);
    }));
    for (const label of keys.keys()) {
      const current = currentItems.find((item) => item.label === label)?.count || 0;
      const peer = peerItems.find((item) => item.label === label)?.count || 0;
      const row = document.createElement("div");
      row.className = "compare-bar-row";
      row.append(createTextElement("strong", "compare-bar-label", label));
      for (const [name, value, className] of [["当前", current, "is-current"], ["对方", peer, "is-peer"]]) {
        const line = document.createElement("div");
        line.className = "compare-bar-line";
        const track = document.createElement("span");
        track.className = `compare-bar-track ${className}`;
        const fill = document.createElement("span");
        fill.style.width = `${(value / maximum) * 100}%`;
        track.append(fill);
        line.append(createTextElement("span", "compare-bar-name", name), track, createTextElement("strong", "compare-bar-value", String(value)));
        row.append(line);
      }
      container.append(row);
    }
  }

  function formatDifference(value, suffix = "") {
    if (!Number.isFinite(value)) return "—";
    return `${value > 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
  }

  function appendChartLegend(container, entries) {
    const legend = document.createElement("div");
    legend.className = "compare-chart-legend";
    for (const [label, value, className] of entries) {
      const item = document.createElement("div");
      item.className = `compare-chart-legend-item ${className}`;
      item.append(
        createTextElement("i", "", ""),
        createTextElement("span", "", label),
        createTextElement("strong", "", String(value)),
      );
      legend.append(item);
    }
    container.append(legend);
  }

  function renderOverviewOverlap(comparison) {
    compareOverviewOverlapChart.replaceChildren();
    const currentOnly = comparison.currentOnly.length;
    const peerOnly = comparison.peerOnly.length;
    const shared = comparison.shared.length;
    const total = currentOnly + peerOnly + shared;
    const currentPercent = percent(currentOnly, total);
    const sharedPercent = percent(shared, total);
    const peerEnd = Math.min(100, currentPercent + sharedPercent);
    const layout = document.createElement("div");
    layout.className = "compare-overlap-visual";
    const donut = document.createElement("div");
    donut.className = "compare-overlap-donut";
    donut.style.background = `conic-gradient(var(--teal) 0 ${currentPercent}%, var(--dark) ${currentPercent}% ${peerEnd}%, var(--accent) ${peerEnd}% 100%)`;
    const center = document.createElement("div");
    center.className = "compare-overlap-center";
    center.append(
      createTextElement("strong", "", `${comparison.overlapPercent}%`),
      createTextElement("span", "", "重合率"),
    );
    donut.append(center);
    layout.append(donut);
    appendChartLegend(layout, [
      ["仅当前档案", `${currentOnly} 部`, "is-current"],
      ["共同收藏", `${shared} 部`, "is-shared"],
      ["仅对方档案", `${peerOnly} 部`, "is-peer"],
    ]);
    compareOverviewOverlapChart.append(layout);
  }

  function renderOverviewCharts(comparison) {
    renderOverviewOverlap(comparison);
    compareOverviewRatingMeta.textContent = `均分 ${ratingLabel(comparison.currentProfile.averageRating)} / ${ratingLabel(comparison.peerProfile.averageRating)}`;
    renderComparisonBars(
      compareOverviewRatingChart,
      comparison.currentProfile.ratings,
      comparison.peerProfile.ratings,
    );
    const preferences = decadePreferences(comparison);
    const overviewDecades = [...preferences.rows]
      .sort(
        (left, right) =>
          right.currentCount + right.peerCount - left.currentCount - left.peerCount,
      )
      .slice(0, 6);
    compareOverviewYearMeta.textContent = `${preferences.currentPreferred?.label ?? "—"} / ${preferences.peerPreferred?.label ?? "—"}`;
    renderComparisonBars(
      compareOverviewYearChart,
      overviewDecades.map((item) => ({ label: item.label, count: item.currentCount })),
      overviewDecades.map((item) => ({ label: item.label, count: item.peerCount })),
    );
    renderOverviewTags(comparison);
    renderOverviewCoverage(comparison);
  }

  function renderOverviewTags(comparison) {
    compareOverviewTagChart.replaceChildren();
    const tags = comparison.tagComparison;
    if (!tags.available) {
      compareOverviewTagMeta.textContent = "公开标签缓存不足";
      compareOverviewTagChart.append(
        createTextElement("p", "compare-empty", tags.status),
      );
      return;
    }
    const currentCoverage = percent(tags.currentTagged, comparison.currentProfile.total);
    const peerCoverage = percent(tags.peerTagged, comparison.peerProfile.total);
    compareOverviewTagMeta.textContent = `共同标签 ${tags.sharedTagCount} 个`;
    const stats = document.createElement("div");
    stats.className = "compare-tag-overview-stats";
    for (const [label, current, peer] of [
      ["标签种类", tags.currentUniqueTags, tags.peerUniqueTags],
      ["标签覆盖", `${currentCoverage}%`, `${peerCoverage}%`],
      ["已标注作品", `${tags.currentTagged} 部`, `${tags.peerTagged} 部`],
    ]) {
      const card = document.createElement("div");
      card.append(
        createTextElement("span", "", label),
        createTextElement("strong", "is-current", String(current)),
        createTextElement("strong", "is-peer", String(peer)),
      );
      stats.append(card);
    }
    const cloud = document.createElement("div");
    cloud.className = "compare-tag-cloud";
    for (const tag of tags.topTags) {
      cloud.append(
        createTextElement(
          "span",
          "",
          `${tag.name} ${tag.currentCount} / ${tag.peerCount}`,
        ),
      );
    }
    compareOverviewTagChart.append(stats, cloud);
  }

  function renderOverviewCoverage(comparison) {
    compareOverviewCoverageChart.replaceChildren();
    const metrics = [
      ["评分", comparison.currentProfile.ratedPercent, comparison.peerProfile.ratedPercent],
      ["短评", comparison.currentProfile.coverage.review, comparison.peerProfile.coverage.review],
      ["封面", comparison.currentProfile.coverage.cover, comparison.peerProfile.coverage.cover],
      ["年代", comparison.currentProfile.coverage.year, comparison.peerProfile.coverage.year],
      ["季度", comparison.currentProfile.coverage.season, comparison.peerProfile.coverage.season],
      ["外部 ID", comparison.currentProfile.coverage.externalId, comparison.peerProfile.coverage.externalId],
      ["Bangumi ID", comparison.currentProfile.coverage.bangumiId, comparison.peerProfile.coverage.bangumiId],
    ];
    const list = document.createElement("div");
    list.className = "compare-coverage-chart";
    for (const [label, current, peer] of metrics) {
      const row = document.createElement("div");
      row.className = "compare-coverage-row";
      row.append(createTextElement("strong", "", label));
      for (const [side, value] of [["current", current], ["peer", peer]]) {
        const metric = document.createElement("div");
        metric.className = `compare-coverage-line is-${side}`;
        const track = document.createElement("span");
        const fill = document.createElement("i");
        fill.style.width = `${value}%`;
        track.append(fill);
        metric.append(
          track,
          createTextElement("b", "", `${value}%`),
        );
        row.append(metric);
      }
      list.append(row);
    }
    compareOverviewCoverageChart.append(list);
  }

  function renderRatingBalance(rating) {
    compareRatingBalance.replaceChildren();
    const total = rating.higher + rating.lower + rating.tied;
    if (!total) {
      compareRatingBalance.append(
        createTextElement("p", "compare-empty", "还没有双方都已评分的共同作品。"),
      );
      return;
    }
    const higher = percent(rating.higher, total);
    const tied = percent(rating.tied, total);
    const peerEnd = Math.min(100, higher + tied);
    const track = document.createElement("div");
    track.className = "compare-balance-track";
    track.style.background = `linear-gradient(90deg, var(--teal) 0 ${higher}%, var(--line-strong) ${higher}% ${peerEnd}%, var(--accent) ${peerEnd}% 100%)`;
    const labels = document.createElement("div");
    labels.className = "compare-balance-labels";
    labels.append(
      createTextElement("span", "is-current", `你更高 ${rating.higher}`),
      createTextElement("span", "is-tied", `同分 ${rating.tied}`),
      createTextElement("span", "is-peer", `对方更高 ${rating.lower}`),
    );
    compareRatingBalance.append(track, labels);
  }

  function ratingDifferenceBadge(item, compact = false) {
    const difference = item.ratingDifference;
    const direction = difference > 0 ? "current" : difference < 0 ? "peer" : "tied";
    const label = difference > 0 ? "你更高" : difference < 0 ? "对方更高" : "同分";
    const badge = document.createElement("div");
    badge.className = `compare-rating-difference is-${direction}${compact ? " is-compact" : ""}`;
    badge.append(
      createTextElement(
        "strong",
        "",
        difference === 0 ? "0.0" : `${difference > 0 ? "+" : ""}${difference.toFixed(1)}`,
      ),
      createTextElement("span", "", label),
    );
    return badge;
  }

  function createRatingDifferenceCard(item) {
    const card = document.createElement("article");
    card.className = "compare-rating-diff-card";
    const body = document.createElement("div");
    body.className = "compare-rating-diff-body";
    body.append(
      createTextElement("span", "compare-anime-year", [itemYear(item), seasonLabel(item.season)].filter(Boolean).join(" · ") || "年代未标注"),
      createTextElement("h4", "", item.title),
      ratingBlocks(item, "both"),
      ratingDifferenceBadge(item),
    );
    card.append(createCompareCover(item), body);
    return card;
  }

  function createRatingDifferenceRow(item) {
    const row = document.createElement("article");
    row.className = "compare-rating-diff-row";
    const copy = document.createElement("div");
    copy.className = "compare-rating-diff-copy";
    copy.append(
      createTextElement("strong", "", item.title),
      createTextElement("span", "", [itemYear(item), seasonLabel(item.season)].filter(Boolean).join(" · ") || "年代未标注"),
    );
    const scores = document.createElement("div");
    scores.className = "compare-rating-diff-scores";
    scores.append(
      createRatingBlock(item, "current", "你"),
      ratingDifferenceBadge(item, true),
      createRatingBlock(item, "peer", "对方"),
    );
    row.append(copy, scores);
    return row;
  }

  function filterRatingDifferences(items) {
    const needle = normalizeCollectionText(ratingDifferenceSearch.value).trim();
    const minimum = ratingDifferenceFilter.value;
    const filtered = items.filter((item) => {
      if (minimum === "0" && item.ratingDifference !== 0) return false;
      if (minimum !== "all" && minimum !== "0" && Math.abs(item.ratingDifference) < Number(minimum)) return false;
      if (!needle) return true;
      return normalizeCollectionText([
        item.title,
        itemYear(item),
        seasonLabel(item.season),
      ].filter(Boolean).join(" ")).includes(needle);
    });
    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (ratingDifferenceSort.value === "current-higher") {
        return (right.ratingDifference > 0) - (left.ratingDifference > 0) ||
          Math.abs(right.ratingDifference) - Math.abs(left.ratingDifference);
      }
      if (ratingDifferenceSort.value === "peer-higher") {
        return Number(right.ratingDifference < 0) - Number(left.ratingDifference < 0) ||
          Math.abs(right.ratingDifference) - Math.abs(left.ratingDifference);
      }
      if (ratingDifferenceSort.value === "title") {
        return left.title.localeCompare(right.title, "zh-CN");
      }
      return Math.abs(right.ratingDifference) - Math.abs(left.ratingDifference);
    });
    return sorted;
  }

  function renderRatingDifferences(items) {
    const filtered = filterRatingDifferences(items);
    const averageGap = comparisonModel?.ratingComparison.averageGap;
    ratingDifferenceSummary.textContent = [
      `共 ${filtered.length} 部符合条件`,
      Number.isFinite(averageGap) ? `平均绝对分差 ${averageGap.toFixed(1)}` : "",
      ratingDifferenceView === "card" ? "卡片视图" : "列表视图",
    ].filter(Boolean).join(" · ");
    renderPaginatedCollection(ratingDifferenceList, filtered, {
      pageSize: ratingDifferenceView === "card" ? 8 : ratingDifferenceLimit,
      unit: "部",
      ariaLabel: "分页查看共同作品评分差",
      bodyClass: ratingDifferenceView === "card" ? "compare-rating-diff-grid" : "compare-rating-diff-list",
      emptyText: "没有符合条件的共同评分作品",
      renderItem: (item) => ratingDifferenceView === "card"
        ? createRatingDifferenceCard(item)
        : createRatingDifferenceRow(item),
    });
  }

  function decadePreferences(comparison) {
    const current = comparison.currentProfile.decades.filter(
      (item) => item.key !== null,
    );
    const peer = comparison.peerProfile.decades.filter(
      (item) => item.key !== null,
    );
    const currentTotal = current.reduce((total, item) => total + item.count, 0);
    const peerTotal = peer.reduce((total, item) => total + item.count, 0);
    const currentByLabel = new Map(current.map((item) => [item.label, item]));
    const peerByLabel = new Map(peer.map((item) => [item.label, item]));
    const labels = [...new Set([
      ...current.map((item) => item.label),
      ...peer.map((item) => item.label),
    ])];
    const rows = labels.map((label) => {
      const currentCount = currentByLabel.get(label)?.count || 0;
      const peerCount = peerByLabel.get(label)?.count || 0;
      const currentPercent = percent(currentCount, currentTotal);
      const peerPercent = percent(peerCount, peerTotal);
      return {
        label,
        currentCount,
        peerCount,
        currentPercent,
        peerPercent,
        difference: Math.round((currentPercent - peerPercent) * 10) / 10,
      };
    }).sort(
      (left, right) =>
        Math.abs(right.difference) - Math.abs(left.difference) ||
        right.currentCount + right.peerCount - left.currentCount - left.peerCount ||
        Number.parseInt(right.label, 10) - Number.parseInt(left.label, 10),
    );
    const preferred = (items, total) => [...items]
      .sort(
        (left, right) =>
          right.count - left.count ||
          Number.parseInt(right.label, 10) - Number.parseInt(left.label, 10),
      )
      .map((item) => ({
        ...item,
        share: percent(item.count, total),
      }))[0] ?? null;
    return {
      rows,
      currentPreferred: preferred(current, currentTotal),
      peerPreferred: preferred(peer, peerTotal),
      currentTotal,
      peerTotal,
    };
  }

  function renderDecadePreferences(preferences) {
    compareDecades.replaceChildren();
    if (!preferences.rows.length) {
      compareDecades.append(
        createTextElement(
          "p",
          "compare-empty",
          "双方索引中还没有可用于比较的作品年代。",
        ),
      );
      return;
    }
    for (const item of preferences.rows) {
      const row = document.createElement("article");
      row.className = "compare-preference-row";
      const heading = document.createElement("header");
      heading.append(createTextElement("strong", "", item.label));
      heading.append(
        createTextElement(
          "span",
          item.difference > 0
            ? "is-current"
            : item.difference < 0
              ? "is-peer"
              : "is-tied",
          item.difference === 0
            ? "占比相同"
            : `${item.difference > 0 ? "你高" : "对方高"} ${Math.abs(item.difference).toFixed(1)}pp`,
        ),
      );
      row.append(heading);
      for (const [side, label, value, count] of [
        ["current", "你", item.currentPercent, item.currentCount],
        ["peer", "对方", item.peerPercent, item.peerCount],
      ]) {
        const line = document.createElement("div");
        line.className = `compare-preference-line is-${side}`;
        const track = document.createElement("span");
        const fill = document.createElement("i");
        fill.style.width = `${value}%`;
        track.append(fill);
        line.append(
          createTextElement("em", "", label),
          track,
          createTextElement("b", "", `${value.toFixed(1)}%`),
          createTextElement("small", "", `${count} 部`),
        );
        row.append(line);
      }
      compareDecades.append(row);
    }
  }

  function renderYearComparison(comparison) {
    const preferences = decadePreferences(comparison);
    currentPreferredDecade.textContent = preferences.currentPreferred?.label ?? "—";
    currentPreferredDecadeMeta.textContent = preferences.currentPreferred
      ? `占 ${preferences.currentPreferred.share.toFixed(1)}% · ${preferences.currentPreferred.count} 部`
      : "暂无可统计年代";
    peerPreferredDecade.textContent = preferences.peerPreferred?.label ?? "—";
    peerPreferredDecadeMeta.textContent = preferences.peerPreferred
      ? `占 ${preferences.peerPreferred.share.toFixed(1)}% · ${preferences.peerPreferred.count} 部`
      : "暂无可统计年代";
    const maximumGap = preferences.rows[0] ?? null;
    decadePreferenceGap.textContent = maximumGap
      ? `${maximumGap.difference > 0 ? "+" : ""}${maximumGap.difference.toFixed(1)}pp`
      : "—";
    decadePreferenceGapMeta.textContent = maximumGap
      ? `${maximumGap.label} · 当前 ${maximumGap.currentPercent.toFixed(1)}% / 对方 ${maximumGap.peerPercent.toFixed(1)}%`
      : "比较双方年代占比";
    renderDecadePreferences(preferences);
  }

  function renderRatingComparison(comparison) {
    const rating = comparison.ratingComparison;
    ratingCurrentAverage.textContent = ratingLabel(comparison.currentProfile.averageRating);
    ratingPeerAverage.textContent = ratingLabel(comparison.peerProfile.averageRating);
    currentHigherCount.textContent = String(rating.higher);
    peerHigherCount.textContent = String(rating.lower);
    tiedRatingCount.textContent = String(rating.tied);
    ratingDifferenceTabCount.textContent = String(comparison.ratingDifferences.length);
    const maximum = rating.maximumDifference;
    if (maximum) {
      maxRatingDifference.textContent = Math.abs(maximum.ratingDifference).toFixed(1);
      maxRatingDifferenceTitle.textContent = maximum.title;
      maxRatingDifferenceCopy.textContent = `当前 ${ratingLabel(maximum.rating)} · 对方 ${ratingLabel(maximum.peerRating)} · ${
        maximum.ratingDifference > 0 ? "你更偏爱" : maximum.ratingDifference < 0 ? "对方更偏爱" : "评分相同"
      }`;
    } else {
      maxRatingDifference.textContent = "—";
      maxRatingDifferenceTitle.textContent = "还没有可比较的共同评分";
      maxRatingDifferenceCopy.textContent = "双方都评分后，这里会显示分歧最大的共同作品。";
    }
    renderRatingBalance(rating);
    renderRatingDifferences(comparison.ratingDifferences);
    renderComparisonBars(
      compareRatings,
      comparison.currentProfile.ratings,
      comparison.peerProfile.ratings,
    );
  }

  function renderCompleteness(comparison) {
    compareCompleteness.replaceChildren();
    const metrics = [
      ["评分覆盖", "ratedPercent"],
      ["短评摘要", "review"],
      ["封面地址", "cover"],
      ["作品年代", "year"],
      ["季度编号", "season"],
      ["外部站点 ID", "externalId"],
      ["Bangumi ID", "bangumiId"],
      ["收录时间", "createdAt"],
    ];
    for (const [label, key] of metrics) {
      const current =
        key === "ratedPercent"
          ? comparison.currentProfile.ratedPercent
          : comparison.currentProfile.coverage[key];
      const peer =
        key === "ratedPercent"
          ? comparison.peerProfile.ratedPercent
          : comparison.peerProfile.coverage[key];
      const row = document.createElement("div");
      row.className = "compare-completeness-row";
      row.append(createTextElement("strong", "compare-completeness-name", label));
      for (const [side, value] of [["current", current], ["peer", peer]]) {
        const metric = document.createElement("div");
        metric.className = `compare-completeness-metric is-${side}`;
        const track = document.createElement("span");
        const fill = document.createElement("i");
        fill.style.width = `${value}%`;
        track.append(fill);
        metric.append(track, createTextElement("b", "", `${value}%`));
        row.append(metric);
      }
      compareCompleteness.append(row);
    }
  }

  function svgElement(tag, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, String(value));
    }
    return element;
  }

  function radarPoints(tags, side, centerX, centerY, radius, maximum) {
    return tags.map((tag, index) => {
      const angle = -Math.PI / 2 + (index / tags.length) * Math.PI * 2;
      const count = side === "current" ? tag.currentCount : tag.peerCount;
      const ratio = maximum ? count / maximum : 0;
      return `${centerX + Math.cos(angle) * radius * ratio},${centerY + Math.sin(angle) * radius * ratio}`;
    }).join(" ");
  }

  function renderTagRadar(tagComparison) {
    compareTagRadar.replaceChildren();
    if (!tagComparison.available) {
      compareTagRadar.append(
        createTextElement("p", "compare-empty", tagComparison.status),
      );
      return;
    }
    const tags = tagComparison.topTags;
    const width = 620;
    const height = 440;
    const centerX = width / 2;
    const centerY = height / 2 + 4;
    const radius = 142;
    const maximum = Math.max(1, ...tags.flatMap((tag) => [tag.currentCount, tag.peerCount]));
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      class: "compare-radar-svg",
      role: "img",
      "aria-label": "双方标签偏好雷达图",
    });
    for (const level of [0.25, 0.5, 0.75, 1]) {
      svg.append(
        svgElement("polygon", {
          points: tags.map((_, index) => {
            const angle = -Math.PI / 2 + (index / tags.length) * Math.PI * 2;
            return `${centerX + Math.cos(angle) * radius * level},${centerY + Math.sin(angle) * radius * level}`;
          }).join(" "),
          class: "compare-radar-grid",
        }),
      );
    }
    tags.forEach((tag, index) => {
      const angle = -Math.PI / 2 + (index / tags.length) * Math.PI * 2;
      svg.append(svgElement("line", {
        x1: centerX,
        y1: centerY,
        x2: centerX + Math.cos(angle) * radius,
        y2: centerY + Math.sin(angle) * radius,
        class: "compare-radar-axis",
      }));
      const labelX = centerX + Math.cos(angle) * (radius + 42);
      const labelY = centerY + Math.sin(angle) * (radius + 35);
      const label = svgElement("text", {
        x: labelX,
        y: labelY,
        class: "compare-radar-label",
        "text-anchor": Math.cos(angle) > 0.35 ? "start" : Math.cos(angle) < -0.35 ? "end" : "middle",
        "dominant-baseline": "middle",
      });
      label.textContent = tag.name.length > 9 ? `${tag.name.slice(0, 8)}…` : tag.name;
      svg.append(label);
    });
    svg.append(svgElement("polygon", {
      points: radarPoints(tags, "current", centerX, centerY, radius, maximum),
      class: "compare-radar-area is-current",
    }));
    svg.append(svgElement("polygon", {
      points: radarPoints(tags, "peer", centerX, centerY, radius, maximum),
      class: "compare-radar-area is-peer",
    }));
    compareTagRadar.append(svg);
  }

  function renderTagComparison(tagComparison) {
    compareTasteStatus.textContent = tagComparison.available
      ? `${tagComparison.status}${tagComparison.similarity !== null ? `标签偏好相似度 ${tagComparison.similarity}%` : ""}`
      : tagComparison.status;
    renderTagRadar(tagComparison);
    renderPaginatedCollection(compareTagDeviations, tagComparison.deviations, {
      pageSize: 8,
      unit: "个标签",
      ariaLabel: "分页查看同标签评分差",
      bodyClass: "compare-page-list",
      emptyText: "没有同时包含双方评分作品的标签。",
      renderItem(tag, index) {
        const row = document.createElement("div");
        row.className = `compare-tag-deviation-row${index === 0 ? " is-max" : ""}`;
        const copy = document.createElement("div");
        copy.append(createTextElement("strong", "", tag.name));
        copy.append(
          createTextElement(
            "span",
            "",
            `当前 ${tag.currentAverage.toFixed(1)}（${tag.currentRatings.length}） · 对方 ${tag.peerAverage.toFixed(1)}（${tag.peerRatings.length}）`,
          ),
        );
        row.append(
          copy,
          createTextElement(
            "b",
            tag.difference > 0 ? "is-current" : tag.difference < 0 ? "is-peer" : "",
            formatDifference(tag.difference),
          ),
        );
        return row;
      },
    });
  }

  function activateCompareTab(tabId, persist = true) {
    const buttons = [...section.querySelectorAll("[data-compare-tab]")];
    const valid = buttons.some((button) => button.dataset.compareTab === tabId)
      ? tabId
      : "overview";
    for (const button of buttons) {
      const active = button.dataset.compareTab === valid;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    for (const panel of section.querySelectorAll("[data-compare-panel]")) {
      const active = panel.dataset.comparePanel === valid;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    }
    if (persist) {
      try {
        window.localStorage.setItem(tabStorageKey, valid);
      } catch {
        // The comparison remains usable when storage is blocked.
      }
    }
  }

  function activateOverlapScope(scope) {
    overlapScope = ["shared", "currentOnly", "peerOnly"].includes(scope)
      ? scope
      : "shared";
    for (const button of overlapTabs.querySelectorAll("[data-overlap-scope]")) {
      const active = button.dataset.overlapScope === overlapScope;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
    renderOverlapCollection();
  }

  function activateRatingPanel(view) {
    const valid = view === "differences" ? "differences" : "overview";
    for (const button of section.querySelectorAll("[data-rating-view]")) {
      const active = button.dataset.ratingView === valid;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
    for (const panel of section.querySelectorAll("[data-rating-panel]")) {
      panel.hidden = panel.dataset.ratingPanel !== valid;
    }
  }

  function createComparisonShareData(comparison, peer) {
    const decades = decadePreferences(comparison);
    return {
      schemaVersion: 1,
      currentRepository: ownRepository || "当前档案",
      peerRepository: peer.repository,
      branch: peer.branch,
      generatedAt: new Date().toISOString(),
      overview: {
        currentTotal: comparison.currentProfile.total,
        peerTotal: comparison.peerProfile.total,
        sharedTotal: comparison.shared.length,
        currentOnlyTotal: comparison.currentOnly.length,
        peerOnlyTotal: comparison.peerOnly.length,
        overlapPercent: comparison.overlapPercent,
        currentAverage: comparison.currentProfile.averageRating,
        peerAverage: comparison.peerProfile.averageRating,
        currentRatedPercent: comparison.currentProfile.ratedPercent,
        peerRatedPercent: comparison.peerProfile.ratedPercent,
      },
      ratings: {
        averageGap: comparison.ratingComparison.averageGap,
        currentHigher: comparison.ratingComparison.higher,
        peerHigher: comparison.ratingComparison.lower,
        tied: comparison.ratingComparison.tied,
        maximum: comparison.ratingComparison.maximumDifference
          ? {
              title: comparison.ratingComparison.maximumDifference.title,
              currentRating: comparison.ratingComparison.maximumDifference.rating,
              peerRating: comparison.ratingComparison.maximumDifference.peerRating,
              difference: comparison.ratingComparison.maximumDifference.ratingDifference,
            }
          : null,
        current: comparison.currentProfile.ratings,
        peer: comparison.peerProfile.ratings,
        items: comparison.ratingDifferences.slice(0, 8).map((item) => ({
          title: item.title,
          currentRating: item.rating,
          peerRating: item.peerRating,
          difference: item.ratingDifference,
        })),
      },
      years: {
        rows: decades.rows,
        currentPreferred: decades.currentPreferred,
        peerPreferred: decades.peerPreferred,
        currentDated: decades.currentTotal,
        peerDated: decades.peerTotal,
      },
      completeness: {
        current: comparison.currentProfile.coverage,
        peer: comparison.peerProfile.coverage,
        currentRatedPercent: comparison.currentProfile.ratedPercent,
        peerRatedPercent: comparison.peerProfile.ratedPercent,
        currentRecent30: comparison.currentProfile.recent30,
        peerRecent30: comparison.peerProfile.recent30,
      },
      taste: {
        available: comparison.tagComparison.available,
        status: comparison.tagComparison.status,
        similarity: comparison.tagComparison.similarity,
        currentTagged: comparison.tagComparison.currentTagged,
        peerTagged: comparison.tagComparison.peerTagged,
        tags: comparison.tagComparison.topTags.map((tag) => ({
          name: tag.name,
          currentCount: tag.currentCount,
          peerCount: tag.peerCount,
        })),
        deviations: comparison.tagComparison.deviations.slice(0, 8).map((tag) => ({
          name: tag.name,
          currentAverage: tag.currentAverage,
          peerAverage: tag.peerAverage,
          currentCount: tag.currentRatings.length,
          peerCount: tag.peerRatings.length,
          difference: tag.difference,
        })),
      },
    };
  }

  function renderComparison(comparison, peer) {
    comparisonModel = comparison;
    currentTotal.textContent = comparison.currentProfile.total.toLocaleString("zh-CN");
    peerTotal.textContent = comparison.peerProfile.total.toLocaleString("zh-CN");
    sharedTotal.textContent = comparison.shared.length.toLocaleString("zh-CN");
    currentAverage.textContent = `均分 ${
      comparison.currentProfile.averageRating?.toFixed(1) ?? "—"
    }`;
    peerAverage.textContent = `均分 ${
      comparison.peerProfile.averageRating?.toFixed(1) ?? "—"
    }`;
    currentCoverage.textContent = `评分覆盖 ${comparison.currentProfile.ratedPercent}%`;
    peerCoverage.textContent = `评分覆盖 ${comparison.peerProfile.ratedPercent}%`;
    overlapPercent.textContent = `重合率 ${comparison.overlapPercent}%`;
    overlapBar.style.width = `${comparison.overlapPercent}%`;
    for (const item of section.querySelectorAll("[data-overlap-count]")) {
      item.textContent = String(comparison[item.dataset.overlapCount]?.length ?? 0);
    }
    renderOverviewCharts(comparison);
    renderDiscoveryCollection();
    renderOverlapCollection();
    renderYearComparison(comparison);
    renderRatingComparison(comparison);
    renderCompleteness(comparison);
    renderTagComparison(comparison.tagComparison);
    const shareData = JSON.stringify(createComparisonShareData(comparison, peer))
      .replace(/</gu, "\\u003c")
      .replace(/>/gu, "\\u003e")
      .replace(/&/gu, "\\u0026");
    shareComparisonData.textContent = shareData;
    results.hidden = false;
    shareButton.disabled = false;
    let rememberedTab = "overview";
    try {
      rememberedTab = window.localStorage.getItem(tabStorageKey) || "overview";
    } catch {
      rememberedTab = "overview";
    }
    activateCompareTab(rememberedTab, false);
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
    submitButton.textContent = value ? "正在比对" : "开始对比";
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
    setStatus(`正在读取 ${repository} 的公开索引与标签缓存…`, "loading");

    try {
      const [currentItems, peerItems, currentCache, peerCache] = await Promise.all([
        loadCurrentItems(),
        loadPeerItems(repository, branch),
        loadBangumiCache(ownRepository, ownBranch, "当前档案"),
        loadBangumiCache(repository, branch, "对方档案"),
      ]);
      const comparison = compareItems(currentItems, peerItems);
      comparison.tagComparison = compareTags(
        comparison.current,
        comparison.peer,
        currentCache,
        peerCache,
      );
      renderComparison(comparison, { repository, branch });
      rememberPeer(repository, branch);
      syncUrl(repository, branch);
      setStatus(
        `已读取 ${repository}@${branch}，匹配 ${comparison.shared.length} 部共同作品。${comparison.tagComparison.available ? "标签偏好也已纳入对比。" : "公开标签缓存不足，标签模块已跳过。"}`,
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

  const tabButtons = [...section.querySelectorAll("[data-compare-tab]")];
  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      activateCompareTab(button.dataset.compareTab);
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const nextIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabButtons.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabButtons.length) %
              tabButtons.length;
      const next = tabButtons[nextIndex];
      activateCompareTab(next.dataset.compareTab);
      next.focus();
    });
  });
  discoverySearch.addEventListener("input", renderDiscoveryCollection);
  discoveryRatingFilter.addEventListener("change", renderDiscoveryCollection);
  discoverySort.addEventListener("change", renderDiscoveryCollection);
  bindViewControl("discovery", (view) => {
    discoveryView = view;
    renderDiscoveryCollection();
  });
  overlapTabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-overlap-scope]");
    if (button) activateOverlapScope(button.dataset.overlapScope);
  });
  overlapSearch.addEventListener("input", renderOverlapCollection);
  overlapRatingFilter.addEventListener("change", renderOverlapCollection);
  overlapSort.addEventListener("change", renderOverlapCollection);
  bindViewControl("overlap", (view) => {
    overlapView = view;
    renderOverlapCollection();
  });
  section.querySelector("[data-rating-tabs]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-rating-view]");
    if (button) activateRatingPanel(button.dataset.ratingView);
  });
  ratingDifferenceSearch.addEventListener("input", () => {
    if (comparisonModel) renderRatingDifferences(comparisonModel.ratingDifferences);
  });
  ratingDifferenceFilter.addEventListener("change", () => {
    if (comparisonModel) renderRatingDifferences(comparisonModel.ratingDifferences);
  });
  ratingDifferenceSort.addEventListener("change", () => {
    if (comparisonModel) renderRatingDifferences(comparisonModel.ratingDifferences);
  });
  bindViewControl("rating-difference", (view) => {
    ratingDifferenceView = view;
    if (comparisonModel) renderRatingDifferences(comparisonModel.ratingDifferences);
  });
  activateRatingPanel("overview");
  form.addEventListener("submit", compare);
  activateCompareTab("overview", false);

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
