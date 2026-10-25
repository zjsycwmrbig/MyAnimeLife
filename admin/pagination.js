function positiveInteger(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function getPaginationState(
  totalItems,
  pageSize,
  requestedPage = 1,
) {
  const total = Math.max(0, Math.trunc(Number(totalItems) || 0));
  const size = positiveInteger(pageSize, 30);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(
    pageCount,
    Math.max(1, positiveInteger(requestedPage, 1)),
  );
  const offset = (page - 1) * size;
  return {
    total,
    pageSize: size,
    page,
    pageCount,
    offset,
    end: Math.min(offset + size, total),
  };
}

export function getPageSequence(currentPage, pageCount) {
  const current = Math.min(
    Math.max(1, positiveInteger(currentPage, 1)),
    Math.max(1, positiveInteger(pageCount, 1)),
  );
  const total = Math.max(1, positiveInteger(pageCount, 1));
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set([
    1,
    total,
    current - 1,
    current,
    current + 1,
  ]);
  if (current <= 4) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
    pages.add(5);
  }
  if (current >= total - 3) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
    pages.add(total - 4);
  }

  const sorted = [...pages]
    .filter((page) => page >= 1 && page <= total)
    .sort((left, right) => left - right);
  const sequence = [];
  for (const page of sorted) {
    const previous = sequence.at(-1);
    if (typeof previous === "number" && page - previous > 1) {
      sequence.push(null);
    }
    sequence.push(page);
  }
  return sequence;
}

export function renderPagination(controls, options = {}) {
  const info = getPaginationState(
    options.totalItems,
    options.pageSize,
    options.page,
  );
  const disabled = Boolean(options.disabled);
  controls.nav.hidden = info.total === 0;
  controls.summary.textContent =
    info.total === 0
      ? "共 0 条"
      : `第 ${info.page} / ${info.pageCount} 页 · 共 ${info.total.toLocaleString("zh-CN")} 条`;

  const pageButtons = getPageSequence(info.page, info.pageCount).map((page) => {
    if (page === null) {
      const gap = document.createElement("span");
      gap.className = "pagination-ellipsis";
      gap.textContent = "…";
      gap.setAttribute("aria-hidden", "true");
      return gap;
    }
    const button = document.createElement("button");
    button.className = "pagination-page";
    button.type = "button";
    button.textContent = String(page);
    button.disabled = disabled;
    button.setAttribute("aria-label", `第 ${page} 页`);
    if (page === info.page) {
      button.classList.add("is-current");
      button.setAttribute("aria-current", "page");
    }
    button.addEventListener("click", () => options.onSelect?.(page));
    return button;
  });
  controls.pages.replaceChildren(...pageButtons);
  controls.previous.disabled = disabled || info.page <= 1;
  controls.next.disabled = disabled || info.page >= info.pageCount;
  controls.nav.setAttribute("aria-busy", String(Boolean(options.loading)));
  return info;
}
