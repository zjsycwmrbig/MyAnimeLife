(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const FONT_STACK = "Arial, 'Noto Sans SC', 'Microsoft YaHei', sans-serif";
  const shareCache = new Map();

  function clean(value) {
    return String(value ?? "").replace(/\s+/gu, " ").trim();
  }

  function escapeXml(value) {
    return clean(value)
      .replace(/&/gu, "&amp;")
      .replace(/</gu, "&lt;")
      .replace(/>/gu, "&gt;")
      .replace(/"/gu, "&quot;")
      .replace(/'/gu, "&apos;");
  }

  function normalizeUrl(value) {
    const candidate = clean(value);
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

  function wrapText(value, maximum, limit = 4) {
    const text = clean(value);
    if (!text) {
      return [];
    }
    const characters = [...text];
    const lines = [];
    for (let index = 0; index < characters.length && lines.length < limit; ) {
      lines.push(characters.slice(index, index + maximum).join(""));
      index += maximum;
    }
    if (characters.length > maximum * limit) {
      lines[limit - 1] = `${lines[limit - 1].slice(0, -1)}…`;
    }
    return lines;
  }

  function textBlock(lines, x, y, lineHeight, attributes = {}) {
    const attrs = Object.entries(attributes)
      .map(([key, value]) => `${key}="${escapeXml(value)}"`)
      .join(" ");
    return `<text x="${x}" y="${y}" ${attrs}>${lines
      .map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`)
      .join("")}</text>`;
  }

  function fallbackCover(title, x, y, width, height, accent = "#d96c4f") {
    const lines = wrapText(title, 12, 4);
    return `<g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="#efe6dc" />
      <path d="M${x} ${y + height * 0.68}C${x + width * 0.25} ${y + height * 0.5} ${x + width * 0.58} ${y + height * 0.88} ${x + width} ${y + height * 0.58}V${y + height}H${x}Z" fill="${accent}" opacity=".82" />
      ${textBlock(lines, x + 28, y + height * 0.38, 32, {
        fill: "#26332f",
        "font-family": FONT_STACK,
        "font-size": 25,
        "font-weight": 700,
      })}
    </g>`;
  }

  async function imageDataUrl(url) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      return null;
    }
    if (normalized.startsWith("data:image/")) {
      return normalized;
    }
    if (shareCache.has(normalized)) {
      return shareCache.get(normalized);
    }
    const request = fetch(normalized, {
      credentials: "omit",
      mode: "cors",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`cover HTTP ${response.status}`);
        }
        return response.blob();
      })
      .then(
        (blob) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => resolve(String(reader.result)));
            reader.addEventListener("error", () => reject(reader.error));
            reader.readAsDataURL(blob);
          }),
      )
      .catch(() => null);
    shareCache.set(normalized, request);
    return request;
  }

  async function coverBlock(record, x, y, width, height) {
    const title = record.title || "未命名番剧";
    const dataUrl = await imageDataUrl(record.coverUrl);
    if (!dataUrl) {
      return fallbackCover(title, x, y, width, height);
    }
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="#e8e3dc" />
      <image href="${escapeXml(dataUrl)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cover-clip)" />`;
  }

  function svgDocument(width, height, body, definitions = "") {
    return `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <clipPath id="cover-clip"><rect x="0" y="0" width="${width}" height="${height}" rx="18" /></clipPath>
        ${definitions}
      </defs>
      ${body}
    </svg>`;
  }

  async function createRecordShareSvg(record = {}) {
    const width = 1200;
    const height = 1500;
    const title = clean(record.title) || "未命名番剧";
    const titleLines = wrapText(title, 17, 3);
    const reviewLines = wrapText(record.review || record.reviewExcerpt, 31, 5);
    const cover = await coverBlock(record, 72, 112, 420, 590);
    const rating = clean(record.ratingDisplay ?? record.rating);
    const season = clean(record.seasonLabel ?? record.season?.label);
    const year = clean(record.yearLabel ?? record.year ?? record.season?.year);
    const meta = [year, season, rating && rating !== "未评分" ? `${rating} / 10` : "未评分"]
      .filter(Boolean)
      .join("  ·  ");
    const body = `<rect width="1200" height="1500" fill="#f6f4ef" />
      <rect x="0" y="0" width="1200" height="18" fill="#d96c4f" />
      <text x="72" y="72" fill="#68736d" font-family="${FONT_STACK}" font-size="18" font-weight="700" letter-spacing="2">MYANIMELIFE / ANIME CARD</text>
      ${cover}
      <text x="552" y="158" fill="#68736d" font-family="${FONT_STACK}" font-size="20">我的番剧档案</text>
      ${textBlock(titleLines, 552, 220, 58, { fill: "#26332f", "font-family": FONT_STACK, "font-size": 48, "font-weight": 700 })}
      <text x="552" y="420" fill="#d96c4f" font-family="${FONT_STACK}" font-size="26" font-weight="700">${escapeXml(meta || "未填写评分")}</text>
      <line x1="552" y1="462" x2="1128" y2="462" stroke="#d9d5ca" />
      <text x="552" y="520" fill="#68736d" font-family="${FONT_STACK}" font-size="18" font-weight="700">短评</text>
      ${textBlock(reviewLines.length ? reviewLines : ["还没有写下评价。"], 552, 566, 34, { fill: "#26332f", "font-family": FONT_STACK, "font-size": 23 })}
      <rect x="72" y="790" width="1056" height="1" fill="#d9d5ca" />
      <text x="72" y="850" fill="#68736d" font-family="${FONT_STACK}" font-size="18" font-weight="700">记录信息</text>
      ${textBlock([
        year ? `年份：${year}` : "年份：未标注",
        season ? `季度：${season}` : "季度：未标注",
        record.updatedLabel ? `更新：${clean(record.updatedLabel)}` : "",
      ].filter(Boolean), 72, 900, 38, { fill: "#26332f", "font-family": FONT_STACK, "font-size": 23 })}
      <text x="72" y="1390" fill="#68736d" font-family="${FONT_STACK}" font-size="17">${escapeXml(clean(record.id))}</text>
      <text x="1128" y="1390" text-anchor="end" fill="#68736d" font-family="${FONT_STACK}" font-size="17">${escapeXml(clean(record.siteTitle) || "私人番剧档案")}</text>`;
    return svgDocument(width, height, body);
  }

  function chartBars(items, x, y, width, height, color) {
    const values = items.map((item) => Number(item.count) || 0);
    const max = Math.max(1, ...values);
    const gap = 10;
    const barWidth = (width - gap * Math.max(0, items.length - 1)) / Math.max(1, items.length);
    return items
      .map((item, index) => {
        const value = Number(item.count) || 0;
        const barHeight = (value / max) * height;
        const barX = x + index * (barWidth + gap);
        return `<rect x="${barX}" y="${y + height - barHeight}" width="${barWidth}" height="${Math.max(2, barHeight)}" rx="5" fill="${color}" opacity="${value ? 0.92 : 0.18}" />
          <text x="${barX + barWidth / 2}" y="${y + height + 28}" text-anchor="middle" fill="#68736d" font-family="${FONT_STACK}" font-size="15">${escapeXml(item.shortLabel || item.label || "")}</text>
          <text x="${barX + barWidth / 2}" y="${y + height - barHeight - 10}" text-anchor="middle" fill="#26332f" font-family="${FONT_STACK}" font-size="15" font-weight="700">${value}</text>`;
      })
      .join("");
  }

  async function createOverviewShareSvg(insights = {}, options = {}) {
    const width = 1600;
    const height = 1000;
    const summary = insights.summary ?? {};
    const windows = insights.windows ?? [];
    const ratings = insights.ratings ?? [];
    const decades = (insights.decades ?? []).slice(-8);
    const body = `<rect width="1600" height="1000" fill="#f6f4ef" />
      <rect x="0" y="0" width="1600" height="18" fill="#d96c4f" />
      <text x="72" y="76" fill="#68736d" font-family="${FONT_STACK}" font-size="19" font-weight="700" letter-spacing="2">MYANIMELIFE / ARCHIVE OVERVIEW</text>
      <text x="72" y="150" fill="#26332f" font-family="${FONT_STACK}" font-size="54" font-weight="700">${escapeXml(options.title || "我的番剧档案")}</text>
      <text x="72" y="190" fill="#68736d" font-family="${FONT_STACK}" font-size="20">一份持续更新的观看与评分记录</text>
      <g transform="translate(72 250)">
        <rect width="330" height="150" rx="16" fill="#ebe6dc" />
        <text x="28" y="48" fill="#68736d" font-family="${FONT_STACK}" font-size="18">作品总数</text>
        <text x="28" y="112" fill="#26332f" font-family="${FONT_STACK}" font-size="50" font-weight="700">${escapeXml(summary.total ?? 0)} <tspan font-size="22">部</tspan></text>
      </g>
      <g transform="translate(424 250)">
        <rect width="330" height="150" rx="16" fill="#ebe6dc" />
        <text x="28" y="48" fill="#68736d" font-family="${FONT_STACK}" font-size="18">平均评分</text>
        <text x="28" y="112" fill="#d96c4f" font-family="${FONT_STACK}" font-size="50" font-weight="700">${escapeXml(summary.averageRating ?? "—")} <tspan font-size="22">/ 10</tspan></text>
      </g>
      <g transform="translate(776 250)">
        <rect width="330" height="150" rx="16" fill="#ebe6dc" />
        <text x="28" y="48" fill="#68736d" font-family="${FONT_STACK}" font-size="18">已评分</text>
        <text x="28" y="112" fill="#26332f" font-family="${FONT_STACK}" font-size="50" font-weight="700">${escapeXml(summary.rated ?? 0)} <tspan font-size="22">部</tspan></text>
      </g>
      <g transform="translate(1128 250)">
        <rect width="400" height="150" rx="16" fill="#26332f" />
        <text x="28" y="48" fill="#bfc9bf" font-family="${FONT_STACK}" font-size="18">近一年新增</text>
        <text x="28" y="112" fill="#fff" font-family="${FONT_STACK}" font-size="50" font-weight="700">${escapeXml(windows.find((item) => item.days === 365)?.count ?? 0)} <tspan font-size="22">部</tspan></text>
      </g>
      <text x="72" y="510" fill="#26332f" font-family="${FONT_STACK}" font-size="24" font-weight="700">最近十二个月</text>
      <line x1="72" y1="730" x2="760" y2="730" stroke="#d9d5ca" />
      ${chartBars(insights.months ?? [], 72, 555, 688, 150, "#d96c4f")}
      <text x="840" y="510" fill="#26332f" font-family="${FONT_STACK}" font-size="24" font-weight="700">评分分布</text>
      ${ratings.slice(0, 6).map((item, index) => {
        const y = 558 + index * 48;
        const bar = Math.max(2, (Number(item.percent) || 0) * 4.7);
        return `<text x="840" y="${y + 18}" fill="#68736d" font-family="${FONT_STACK}" font-size="16">${escapeXml(item.label)}</text><rect x="970" y="${y + 3}" width="470" height="22" rx="11" fill="#e5e0d6" /><rect x="970" y="${y + 3}" width="${bar}" height="22" rx="11" fill="#d96c4f" /><text x="1470" y="${y + 20}" text-anchor="end" fill="#26332f" font-family="${FONT_STACK}" font-size="16" font-weight="700">${Number(item.count) || 0}</text>`;
      }).join("")}
      <text x="840" y="890" fill="#68736d" font-family="${FONT_STACK}" font-size="18">年代覆盖 ${escapeXml(summary.seasonPercent ?? 0)}% · 索引覆盖 ${escapeXml(summary.sourcePercent ?? 0)}%</text>
      <text x="72" y="930" fill="#68736d" font-family="${FONT_STACK}" font-size="17">${escapeXml(options.siteTitle || "MyAnimeLife")}</text>
      <text x="1528" y="930" text-anchor="end" fill="#68736d" font-family="${FONT_STACK}" font-size="17">数据洞察</text>`;
    return svgDocument(width, height, body);
  }

  function svgBlob(svg) {
    return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  }

  async function pngBlob(svg, width, height) {
    const url = URL.createObjectURL(svgBlob(svg));
    try {
      const image = await new Promise((resolve, reject) => {
        const candidate = new Image();
        candidate.decoding = "async";
        candidate.onload = () => resolve(candidate);
        candidate.onerror = () => reject(new Error("分享图像加载失败"));
        candidate.src = url;
      });
      if (typeof image.decode === "function") {
        await image.decode().catch(() => {});
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#f6f4ef";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG 生成失败"))), "image/png");
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function createImage(svg, width, height) {
    return {
      svg: svgBlob(svg),
      png: await pngBlob(svg, width, height),
    };
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyImage(blob) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("当前浏览器不支持复制图片");
    }
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
  }

  function showStatus(message, tone = "") {
    let status = document.querySelector(".share-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "share-status";
      status.setAttribute("role", "status");
      document.body.append(status);
    }
    status.textContent = message;
    status.dataset.tone = tone;
    clearTimeout(status.dismissTimer);
    status.dismissTimer = setTimeout(() => status.remove(), 2800);
  }

  function recordFromElement(element) {
    return {
      id: element.dataset.shareId,
      title: element.dataset.shareTitle,
      coverUrl: element.dataset.shareCover,
      ratingDisplay: element.dataset.shareRating,
      review: element.dataset.shareReview,
      seasonLabel: element.dataset.shareSeason,
      yearLabel: element.dataset.shareYear,
      updatedLabel: element.dataset.shareUpdated,
      siteTitle: document.title.split("|").pop()?.trim(),
    };
  }

  function readOverview(button) {
    const data = document.querySelector("#share-insights-data")?.textContent;
    try {
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  function closeMenu() {
    document.querySelector(".share-menu")?.remove();
  }

  function actionIcon(action) {
    const paths = {
      download:
        '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>',
      copy:
        '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path>',
      svg: '<path d="M4 4h16v16H4z"></path><path d="M8 16 12 8l4 8"></path><path d="M7 14h10"></path>',
    };
    return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[action] ?? paths.download}</svg>`;
  }

  function placeMenu(menu, trigger) {
    const rect = trigger.getBoundingClientRect();
    menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 12, rect.bottom + 8)}px`;
    menu.style.left = `${Math.max(12, Math.min(window.innerWidth - menu.offsetWidth - 12, rect.right - menu.offsetWidth))}px`;
  }

  function openMenu(trigger) {
    closeMenu();
    const menu = document.createElement("div");
    menu.className = "share-menu";
    menu.setAttribute("role", "menu");
    const actions = [
      ["下载 PNG", "download"],
      ["复制图片", "copy"],
      ["下载 SVG", "svg"],
    ];
    for (const [label, action] of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `${actionIcon(action)}<span>${label}</span>`;
      button.dataset.action = action;
      button.addEventListener("click", () => runAction(trigger, action, button));
      menu.append(button);
    }
    document.body.append(menu);
    placeMenu(menu, trigger);
  }

  async function runAction(trigger, action, actionButton) {
    actionButton.disabled = true;
    actionButton.innerHTML = '<span>正在生成…</span>';
    try {
      const isOverview = trigger.dataset.shareKind === "overview";
      const source = isOverview
        ? createOverviewShareSvg(readOverview(trigger), {
            title: document.title.replace(/^统计与对比\s*\|\s*/u, "") || "我的番剧档案",
          })
        : createRecordShareSvg(recordFromElement(trigger.closest("[data-share-record]")));
      const svg = await source;
      const image =
        action === "svg"
          ? { svg: svgBlob(svg) }
          : isOverview
            ? await createImage(svg, 1600, 1000)
            : await createImage(svg, 1200, 1500);
      const filename = isOverview ? "my-anime-life-overview" : `anime-${trigger.closest("[data-share-record]")?.dataset.shareId || "record"}`;
      if (action === "copy") {
        await copyImage(image.png);
        showStatus("图片已复制到剪贴板", "success");
      } else if (action === "svg") {
        download(image.svg, `${filename}.svg`);
        showStatus("SVG 图片已下载", "success");
      } else {
        download(image.png, `${filename}.png`);
        showStatus("PNG 图片已下载", "success");
      }
      closeMenu();
    } catch (error) {
      showStatus(error.message || "图片生成失败", "error");
      actionButton.disabled = false;
      const label = action === "copy" ? "复制图片" : action === "svg" ? "下载 SVG" : "下载 PNG";
      actionButton.innerHTML = `${actionIcon(action)}<span>${label}</span>`;
    }
  }

  function setup() {
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest?.("[data-share-trigger]");
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        openMenu(trigger);
        return;
      }
      if (!event.target.closest?.(".share-menu")) {
        closeMenu();
      }
    });
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, { passive: true });
  }

  window.MyAnimeLifeShare = {
    createRecordShareSvg,
    createOverviewShareSvg,
    createImage,
    copyImage,
    download,
    showStatus,
  };
  setup();
})();
