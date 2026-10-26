(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const FONT_STACK = "'Noto Sans SC', 'Microsoft YaHei', Arial, sans-serif";
  const DISPLAY_FONT = "'Noto Serif SC', 'Songti SC', Georgia, serif";
  const COVER_REQUEST_TIMEOUT = 1600;
  const shareCache = new Map();
  const PALETTES = {
    coral: {
      accent: "#cf6247",
      accentDark: "#8f3f2c",
      ink: "#22312c",
      muted: "#68756f",
      paper: "#f5f0e7",
      soft: "#e8ded1",
    },
    teal: {
      accent: "#2f756d",
      accentDark: "#1f504b",
      ink: "#17312e",
      muted: "#647a75",
      paper: "#edf4ef",
      soft: "#d9e7df",
    },
    blue: {
      accent: "#456f9d",
      accentDark: "#2e4d70",
      ink: "#1d2b39",
      muted: "#68798a",
      paper: "#f1f2ef",
      soft: "#dfe5e8",
    },
    amber: {
      accent: "#b4782f",
      accentDark: "#7e511e",
      ink: "#2e2b23",
      muted: "#78705f",
      paper: "#f6f1e5",
      soft: "#eadfca",
    },
  };
  const OVERVIEW_MODULE_IDS = [
    "summary",
    "windows",
    "months",
    "decades",
    "ratings",
    "sources",
    "comparison",
  ];
  const OVERVIEW_MODULE_LABELS = {
    summary: "档案摘要",
    windows: "收录概览",
    months: "最近十二个月",
    decades: "年代分布",
    ratings: "评分分布",
    sources: "索引覆盖",
    comparison: "仓库 PK",
  };

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

  function fetchWithTimeout(url, options = {}, timeout = COVER_REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    return fetch(url, { ...options, signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );
  }

  function readShareConfig() {
    let parsed = {};
    try {
      parsed = JSON.parse(
        document.querySelector("#share-config")?.textContent || "{}",
      );
    } catch {
      parsed = {};
    }
    let localAppearance = null;
    try {
      localAppearance = JSON.parse(
        localStorage.getItem("myanimelife.appearance.preferences") || "null",
      );
    } catch {
      localAppearance = null;
    }
    const localShare = localAppearance?.share ?? {};
    const localTemplate = clean(localShare.template);
    const requestedTemplate = clean(
      localTemplate && localTemplate !== "auto"
        ? localTemplate
        : parsed.resolvedTemplate || parsed.template,
    );
    const template = ["default", "compact", "spotlight"].includes(
      requestedTemplate,
    )
      ? requestedTemplate
      : "default";
    const requestedAccent = clean(localShare.accent || parsed.accent);
    const accent = Object.hasOwn(PALETTES, requestedAccent)
      ? requestedAccent
      : "coral";
    return { template, accent };
  }

  function normalizeOverviewModules(value) {
    const defaults = {
      summary: true,
      windows: true,
      months: true,
      decades: true,
      ratings: true,
      sources: true,
      comparison: false,
    };
    if (Array.isArray(value)) {
      return Object.fromEntries(
        OVERVIEW_MODULE_IDS.map((id) => [id, value.includes(id)]),
      );
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        OVERVIEW_MODULE_IDS.map((id) => [
          id,
          value[id] === undefined ? defaults[id] : Boolean(value[id]),
        ]),
      );
    }
    return defaults;
  }

  function wrapText(value, maximum, limit = 5) {
    const text = clean(value);
    if (!text) {
      return [];
    }
    const characters = [...text];
    const lines = [];
    for (let index = 0; index < characters.length && lines.length < limit; ) {
      let length = maximum;
      const remaining = characters.length - index;
      if (remaining <= maximum) {
        length = remaining;
      } else if (lines.length === limit - 1) {
        length = maximum - 1;
      }
      lines.push(characters.slice(index, index + length).join(""));
      index += length;
    }
    if (characters.length > maximum * limit) {
      lines[limit - 1] = `${lines[limit - 1]}…`;
    }
    return lines;
  }

  function textBlock(lines, x, y, lineHeight, attributes = {}) {
    const attrs = Object.entries(attributes)
      .map(([key, value]) => `${key}="${escapeXml(value)}"`)
      .join(" ");
    return `<text x="${x}" y="${y}" ${attrs}>${lines
      .map(
        (line, index) =>
          `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`,
      )
      .join("")}</text>`;
  }

  function fallbackCover(title, x, y, width, height, palette) {
    const lines = wrapText(title, 10, 5);
    return `<g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="22" fill="${palette.soft}" />
      <path d="M${x} ${y + height * 0.76}C${x + width * 0.2} ${y + height * 0.57} ${x + width * 0.5} ${y + height * 0.94} ${x + width} ${y + height * 0.64}V${y + height}H${x}Z" fill="${palette.accent}" opacity=".92" />
      <circle cx="${x + width - 54}" cy="${y + 54}" r="8" fill="${palette.accent}" />
      ${textBlock(lines, x + 32, y + height * 0.36, 34, {
        fill: palette.ink,
        "font-family": DISPLAY_FONT,
        "font-size": 28,
        "font-weight": 700,
      })}
      <text x="${x + 32}" y="${y + height - 34}" fill="#fff" font-family="${FONT_STACK}" font-size="16" font-weight="700" letter-spacing="2">ANIME ARCHIVE</text>
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
    const request = fetchWithTimeout(normalized, {
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

  function fetchBangumiCover(subjectId) {
    const id = clean(subjectId);
    if (!id) {
      return Promise.resolve(null);
    }
    const cacheKey = `bangumi-cover:${id}`;
    if (!shareCache.has(cacheKey)) {
      shareCache.set(
        cacheKey,
        fetchWithTimeout(
          `https://api.bgm.tv/v0/subjects/${encodeURIComponent(id)}`,
          {
            headers: { Accept: "application/json" },
            credentials: "omit",
          },
        )
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) =>
            normalizeUrl(
              payload?.images?.large ??
                payload?.images?.common ??
                payload?.images?.medium,
            ),
          )
          .catch(() => null),
      );
    }
    return shareCache.get(cacheKey);
  }

  async function coverBlock(record, x, y, width, height, palette, id) {
    const title = record.title || "未命名番剧";
    const sourceUrl =
      normalizeUrl(record.coverUrl) ||
      (record.bangumiId ? await fetchBangumiCover(record.bangumiId) : null);
    if (!sourceUrl) {
      return {
        markup: fallbackCover(title, x, y, width, height, palette),
        definition: "",
      };
    }
    const imageSource = escapeXml(sourceUrl);
    return {
      markup: `${fallbackCover(title, x, y, width, height, palette)}
        <image href="${imageSource}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" referrerpolicy="no-referrer" clip-path="url(#${id})" />`,
      definition: `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="22" /></clipPath>`,
    };
  }

  function svgDocument(width, height, body, definitions = "") {
    return `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>${definitions}</defs>
      ${body}
    </svg>`;
  }

  function ratingParts(record) {
    const value = clean(record.ratingDisplay ?? record.rating);
    if (!value || value === "未评分") {
      return { value: "—", caption: "未评分" };
    }
    return {
      value: value.replace(/\s*\/\s*10$/u, ""),
      caption: "评分 / 10",
    };
  }

  function metaText(record) {
    const release = clean(
      record.releaseLabel ||
        record.release ||
        [record.yearLabel ?? record.year, record.seasonLabel ?? record.season]
          .filter(Boolean)
          .join(" · "),
    );
    return release || "作品年代未标注";
  }

  function reviewLines(record, width, limit) {
    return wrapText(record.review || record.reviewExcerpt || "还没有写下评价。", width, limit);
  }

  function ratingVisual(record, x, y, width, height, palette, options = {}) {
    const rating = ratingParts(record);
    const score = Number.parseFloat(rating.value);
    const dark = Boolean(options.dark);
    const panel = dark ? "#ffffff18" : palette.soft;
    const label = dark ? "#d8e0db" : palette.accentDark;
    const text = dark ? "#fff" : palette.ink;
    const track = dark ? "#ffffff2b" : `${palette.ink}22`;
    const segmentGap = 5;
    const segmentWidth = Math.max(12, (width - 48 - segmentGap * 9) / 10);
    const segmentY = y + height - 27;
    const segmentX = x + 24;
    const segments = Array.from({ length: 10 }, (_, index) => {
      const remaining = Number.isFinite(score) ? score - index : 0;
      const opacity =
        remaining >= 1 ? 1 : remaining > 0 ? 0.35 + remaining * 0.65 : 0.16;
      return `<rect x="${segmentX + index * (segmentWidth + segmentGap)}" y="${segmentY}" width="${segmentWidth}" height="8" rx="4" fill="${Number.isFinite(score) && remaining > 0 ? palette.accent : track}" opacity="${opacity}" />`;
    }).join("");
    return `<g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${panel}" />
      <text x="${x + 24}" y="${y + 34}" fill="${label}" font-family="${FONT_STACK}" font-size="15" font-weight="800" letter-spacing="2">MY SCORE</text>
      <text x="${x + 24}" y="${y + height - 43}" fill="${text}" font-family="${DISPLAY_FONT}" font-size="${Math.min(52, height * 0.42)}" font-weight="700">${escapeXml(rating.value)}</text>
      <text x="${x + width - 24}" y="${y + height - 48}" text-anchor="end" fill="${label}" font-family="${FONT_STACK}" font-size="16" font-weight="700">${rating.caption === "未评分" ? "等待评分" : "/ 10"}</text>
      ${segments}
    </g>`;
  }

  function archiveCard(record, palette, cover) {
    const titleLines = wrapText(record.title || "未命名番剧", 22, 2);
    const review = reviewLines(record, 26, 5);
    const rating = ratingParts(record);
    const body = `<rect width="1200" height="1500" fill="${palette.paper}" />
      <rect x="0" y="0" width="1200" height="14" fill="${palette.accent}" />
      <text x="64" y="70" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="17" font-weight="700" letter-spacing="3">MYANIMELIFE / RECORD CARD</text>
      <text x="1136" y="70" text-anchor="end" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="16">ANIME ARCHIVE</text>
      ${cover.markup}
      <text x="64" y="892" fill="${palette.accent}" font-family="${FONT_STACK}" font-size="16" font-weight="800" letter-spacing="2">ANIME RECORD</text>
      ${textBlock(titleLines, 64, 948, 52, {
        fill: palette.ink,
        "font-family": DISPLAY_FONT,
        "font-size": 46,
        "font-weight": 700,
      })}
      <text x="64" y="1028" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="17" font-weight="700">作品年代 · ${escapeXml(metaText(record))}</text>
      ${ratingVisual(record, 64, 1060, 300, 138, palette)}
      <text x="408" y="1092" fill="${palette.accentDark}" font-family="${FONT_STACK}" font-size="16" font-weight="800" letter-spacing="2">SHORT REVIEW</text>
      <line x1="408" y1="1114" x2="1136" y2="1114" stroke="${palette.ink}" opacity=".14" />
      ${textBlock(review, 408, 1150, 30, {
        fill: palette.ink,
        "font-family": FONT_STACK,
        "font-size": 20,
      })}
      <rect x="64" y="1300" width="1072" height="1" fill="${palette.ink}" opacity=".13" />
      <text x="64" y="1408" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="16">${escapeXml(clean(record.siteTitle) || "私人番剧档案")}</text>
      <text x="1136" y="1408" text-anchor="end" fill="${palette.accentDark}" font-family="${FONT_STACK}" font-size="16" font-weight="700">MYANIMELIFE</text>`;
    return svgDocument(1200, 1500, body, cover.definition);
  }

  function compactCard(record, palette, cover) {
    const titleLines = wrapText(record.title || "未命名番剧", 13, 3);
    const review = reviewLines(record, 17, 7);
    const body = `<rect width="1200" height="1500" fill="${palette.paper}" />
      <rect x="0" y="0" width="1200" height="12" fill="${palette.accent}" />
      <text x="64" y="68" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="16" font-weight="800" letter-spacing="3">MYANIMELIFE / COMPACT</text>
      ${cover.markup}
      <text x="664" y="170" fill="${palette.accent}" font-family="${FONT_STACK}" font-size="15" font-weight="800" letter-spacing="2">COMPACT RECORD</text>
      ${textBlock(titleLines, 664, 250, 52, {
        fill: palette.ink,
        "font-family": DISPLAY_FONT,
        "font-size": 44,
        "font-weight": 700,
      })}
      <text x="664" y="430" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="17" font-weight="700">${escapeXml(metaText(record))}</text>
      ${ratingVisual(record, 664, 500, 472, 150, palette)}
      <text x="664" y="730" fill="${palette.accentDark}" font-family="${FONT_STACK}" font-size="15" font-weight="800" letter-spacing="2">SHORT REVIEW</text>
      <line x1="664" y1="752" x2="1136" y2="752" stroke="${palette.ink}" opacity=".14" />
      ${textBlock(review, 664, 794, 31, {
        fill: palette.ink,
        "font-family": FONT_STACK,
        "font-size": 20,
      })}
      <text x="664" y="1220" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="15" font-weight="700">作品年代</text>
      <text x="664" y="1260" fill="${palette.ink}" font-family="${DISPLAY_FONT}" font-size="28" font-weight="700">${escapeXml(metaText(record))}</text>
      <rect x="64" y="1300" width="1072" height="1" fill="${palette.ink}" opacity=".14" />
      <text x="64" y="1380" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="16">${escapeXml(clean(record.siteTitle) || "私人番剧档案")}</text>
      <text x="1136" y="1380" text-anchor="end" fill="${palette.accentDark}" font-family="${FONT_STACK}" font-size="16" font-weight="800">观看记录</text>`;
    return svgDocument(1200, 1500, body, cover.definition);
  }

  function spotlightCard(record, palette, cover) {
    const titleLines = wrapText(record.title || "未命名番剧", 11, 4);
    const review = reviewLines(record, 20, 8);
    const body = `<rect width="1200" height="1500" fill="#18211e" />
      ${cover.markup}
      <rect x="0" y="0" width="1200" height="1500" fill="#101714" opacity=".7" />
      <rect x="0" y="0" width="1200" height="1500" fill="url(#spotlight-shade)" />
      <rect x="0" y="0" width="12" height="1500" fill="${palette.accent}" />
      <text x="72" y="76" fill="#a8b5ae" font-family="${FONT_STACK}" font-size="16" font-weight="800" letter-spacing="3">MYANIMELIFE / SPOTLIGHT</text>
      ${textBlock(titleLines, 72, 190, 64, {
        fill: "#f7f2e9",
        "font-family": DISPLAY_FONT,
        "font-size": 52,
        "font-weight": 700,
      })}
      <text x="72" y="${190 + Math.max(1, titleLines.length) * 64 + 42}" fill="${palette.accent}" font-family="${FONT_STACK}" font-size="20" font-weight="700">${escapeXml(metaText(record))}</text>
      ${ratingVisual(record, 72, 548, 500, 154, palette, { dark: true })}
      <text x="72" y="782" fill="#a8b5ae" font-family="${FONT_STACK}" font-size="16" font-weight="800" letter-spacing="2">SHORT REVIEW</text>
      <line x1="72" y1="812" x2="572" y2="812" stroke="#fff" opacity=".18" />
      ${textBlock(review, 72, 870, 38, {
        fill: "#edf0ea",
        "font-family": FONT_STACK,
        "font-size": 23,
      })}
      <text x="72" y="1400" fill="#89968f" font-family="${FONT_STACK}" font-size="16">${escapeXml(clean(record.siteTitle) || "私人番剧档案")}</text>
      <text x="1128" y="1400" text-anchor="end" fill="#89968f" font-family="${FONT_STACK}" font-size="16">ANIME LEDGER</text>`;
    return svgDocument(
      1200,
      1500,
      body,
      `${cover.definition}<linearGradient id="spotlight-shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#101714" stop-opacity=".95" /><stop offset=".62" stop-color="#101714" stop-opacity=".72" /><stop offset="1" stop-color="#101714" stop-opacity=".28" /></linearGradient>`,
    );
  }

  async function createRecordShareSvg(record = {}, options = {}) {
    const config = {
      ...readShareConfig(),
      ...options,
    };
    const palette = PALETTES[config.accent] ?? PALETTES.coral;
    const template = ["default", "compact", "spotlight"].includes(
      config.template,
    )
      ? config.template
      : "default";
    if (template === "spotlight") {
      const cover = await coverBlock(
        record,
        0,
        0,
        1200,
        1500,
        palette,
        "spotlight-cover-clip",
      );
      return spotlightCard(record, palette, cover);
    }
    if (template === "compact") {
      const cover = await coverBlock(
        record,
        64,
        96,
        520,
        1120,
        palette,
        "compact-cover-clip",
      );
      return compactCard(record, palette, cover);
    }
    const cover = await coverBlock(
      record,
      64,
      112,
      1072,
      720,
      palette,
      "archive-cover-clip",
    );
    return archiveCard(record, palette, cover);
  }

  function chartBars(items, x, y, width, height, palette) {
    const visible = items.slice(-12);
    const values = visible.map((item) => Number(item.count) || 0);
    const max = Math.max(1, ...values);
    const gap = 10;
    const barWidth =
      (width - gap * Math.max(0, visible.length - 1)) /
      Math.max(1, visible.length);
    return visible
      .map((item, index) => {
        const value = Number(item.count) || 0;
        const barHeight = (value / max) * height;
        const barX = x + index * (barWidth + gap);
        return `<rect x="${barX}" y="${y + height - barHeight}" width="${barWidth}" height="${Math.max(2, barHeight)}" rx="5" fill="${palette.accent}" opacity="${value ? 0.92 : 0.18}" />
          <text x="${barX + barWidth / 2}" y="${y + height + 24}" text-anchor="middle" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="14">${escapeXml(item.shortLabel || item.label || "")}</text>
          <text x="${barX + barWidth / 2}" y="${y + height - barHeight - 8}" text-anchor="middle" fill="${palette.ink}" font-family="${FONT_STACK}" font-size="14" font-weight="700">${value}</text>`;
      })
      .join("");
  }

  function summaryTiles(summary, windows, x, y, width, height, palette) {
    const stats = [
      ["作品总数", `${Number(summary.total) || 0}`, "部"],
      ["平均评分", String(summary.averageRating ?? "—"), "/ 10"],
      ["评分覆盖", `${Number(summary.ratedPercent) || 0}%`, "已评分"],
      [
        "近一年新增",
        String(windows.find((item) => Number(item.days) === 365)?.count ?? 0),
        "部",
      ],
    ];
    const gap = 14;
    const tileWidth = (width - gap * (stats.length - 1)) / stats.length;
    return stats
      .map(([label, value, suffix], index) => {
        const tileX = x + index * (tileWidth + gap);
        const isDark = index === stats.length - 1;
        return `<g transform="translate(${tileX} ${y})">
          <rect width="${tileWidth}" height="${height}" rx="16" fill="${isDark ? palette.ink : palette.soft}" />
          <text x="26" y="42" fill="${isDark ? "#c7d0ca" : palette.muted}" font-family="${FONT_STACK}" font-size="16" font-weight="700">${escapeXml(label)}</text>
          <text x="26" y="${Math.min(height - 26, 105)}" fill="${isDark ? "#fff" : palette.ink}" font-family="${DISPLAY_FONT}" font-size="42" font-weight="700">${escapeXml(value)} <tspan fill="${isDark ? "#c7d0ca" : palette.muted}" font-family="${FONT_STACK}" font-size="17" font-weight="500">${escapeXml(suffix)}</tspan></text>
        </g>`;
      })
      .join("");
  }

  function distributionRows(items, x, y, width, height, palette, options = {}) {
    const visible = items.slice(0, Math.max(1, Math.floor((height - 8) / 42)));
    return visible
      .map((item, index) => {
        const rowY = y + index * 42;
        const labelWidth = options.labelWidth || 112;
        const valueWidth = options.valueWidth || 82;
        const trackX = x + labelWidth;
        const trackWidth = Math.max(40, width - labelWidth - valueWidth - 20);
        const barWidth =
          (Math.max(0, Math.min(100, Number(item.percent) || 0)) / 100) *
          trackWidth;
        const note = options.showAverage
          ? `均分 ${item.averageRating ?? "—"}`
          : `${Number(item.percent) || 0}%`;
        return `<text x="${x}" y="${rowY + 22}" fill="${palette.ink}" font-family="${FONT_STACK}" font-size="15" font-weight="650">${escapeXml(item.label || "—")}</text>
          <rect x="${trackX}" y="${rowY + 9}" width="${trackWidth}" height="18" rx="9" fill="${palette.soft}" />
          <rect x="${trackX}" y="${rowY + 9}" width="${Math.max(2, barWidth)}" height="18" rx="9" fill="${palette.accent}" />
          <text x="${x + width}" y="${rowY + 22}" text-anchor="end" fill="${palette.ink}" font-family="${FONT_STACK}" font-size="15" font-weight="800">${Number(item.count) || 0}</text>
          <text x="${x + width - valueWidth}" y="${rowY + 22}" text-anchor="end" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="13">${escapeXml(note)}</text>`;
      })
      .join("");
  }

  function overviewPanel(id, insights, index, x, y, width, height, palette) {
    const summary = insights.summary ?? {};
    const windows = insights.windows ?? [];
    const contentX = x + 28;
    const contentY = y + 68;
    const contentWidth = width - 56;
    const contentHeight = height - 88;
    let content = "";
    if (id === "summary") {
      content = summaryTiles(
        summary,
        windows,
        contentX,
        contentY,
        contentWidth,
        Math.max(100, contentHeight),
        palette,
      );
    } else if (id === "windows") {
      const items = [
        ...windows.slice(0, 3),
        {
          label: "季度信息覆盖",
          count: `${Number(summary.seasonPercent) || 0}%`,
          suffix: "有年代数据",
        },
      ];
      const cardHeight = Math.max(80, contentHeight);
      const gap = 12;
      const cardWidth = (contentWidth - gap * (items.length - 1)) / items.length;
      content = items
        .map((item, itemIndex) => {
          const cardX = contentX + itemIndex * (cardWidth + gap);
          const dark = itemIndex === items.length - 1;
          return `<g transform="translate(${cardX} ${contentY})">
            <rect width="${cardWidth}" height="${cardHeight}" rx="14" fill="${dark ? palette.ink : palette.soft}" />
            <text x="22" y="38" fill="${dark ? "#c7d0ca" : palette.muted}" font-family="${FONT_STACK}" font-size="15" font-weight="700">${escapeXml(item.label || "—")}</text>
            <text x="22" y="${Math.min(cardHeight - 44, 96)}" fill="${dark ? "#fff" : palette.ink}" font-family="${DISPLAY_FONT}" font-size="40" font-weight="700">${escapeXml(item.count ?? 0)}</text>
            <text x="22" y="${Math.min(cardHeight - 16, 132)}" fill="${dark ? "#c7d0ca" : palette.muted}" font-family="${FONT_STACK}" font-size="14">${escapeXml(item.suffix || "部新增")}</text>
          </g>`;
        })
        .join("");
    } else if (id === "months") {
      content = chartBars(
        insights.months ?? [],
        contentX,
        contentY + 8,
        contentWidth,
        Math.max(55, contentHeight - 48),
        palette,
      );
    } else if (id === "decades") {
      content = distributionRows(
        insights.decades ?? [],
        contentX,
        contentY,
        contentWidth,
        contentHeight,
        palette,
        { showAverage: true },
      );
    } else if (id === "ratings") {
      content = distributionRows(
        insights.ratings ?? [],
        contentX,
        contentY,
        contentWidth,
        contentHeight,
        palette,
        { labelWidth: 126, valueWidth: 90 },
      );
    } else if (id === "sources") {
      const sources = insights.sources ?? [];
      const best = insights.bestDecade
        ? `<text x="${contentX}" y="${contentY + contentHeight - 8}" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="14">平均评分最高年代：${escapeXml(insights.bestDecade.label)} · ${escapeXml(insights.bestDecade.averageRating)} / 10</text>`
        : "";
      content = sources.length
        ? distributionRows(
            sources,
            contentX,
            contentY,
            contentWidth,
            contentHeight - (best ? 32 : 0),
            palette,
            { labelWidth: 116, valueWidth: 74 },
          ) + best
        : `<text x="${contentX}" y="${contentY + 24}" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="16">还没有可统计的站点索引。</text>`;
    } else if (id === "comparison") {
      const comparison = insights.comparison;
      if (!comparison) {
        content = `<text x="${contentX}" y="${contentY + 28}" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="16">尚未完成仓库 PK。在洞察页选择对方仓库后即可加入此模块。</text>`;
      } else {
        const stats = [
          ["当前档案", comparison.currentTotal ?? summary.total ?? 0, "部"],
          ["对方档案", comparison.peerTotal ?? 0, "部"],
          ["共同收录", comparison.sharedTotal ?? 0, "部"],
          ["重合率", `${comparison.overlapPercent ?? 0}%`, ""],
        ];
        const gap = 10;
        const cardWidth =
          (contentWidth - gap * (stats.length - 1)) / stats.length;
        content = stats
          .map(
            ([label, value, suffix], itemIndex) =>
              `<g transform="translate(${contentX + itemIndex * (cardWidth + gap)} ${contentY})">
                <rect width="${cardWidth}" height="${Math.max(82, contentHeight)}" rx="14" fill="${itemIndex === 2 ? palette.ink : palette.soft}" />
                <text x="18" y="36" fill="${itemIndex === 2 ? "#c7d0ca" : palette.muted}" font-family="${FONT_STACK}" font-size="14" font-weight="700">${escapeXml(label)}</text>
                <text x="18" y="88" fill="${itemIndex === 2 ? "#fff" : palette.ink}" font-family="${DISPLAY_FONT}" font-size="34" font-weight="700">${escapeXml(value)} <tspan font-size="15">${escapeXml(suffix)}</tspan></text>
              </g>`,
          )
          .join("");
      }
    }
    return `<g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="${palette.soft}" opacity=".34" />
      <text x="${x + 28}" y="${y + 34}" fill="${palette.accentDark}" font-family="${FONT_STACK}" font-size="14" font-weight="800" letter-spacing="2">MODULE ${String(index + 1).padStart(2, "0")}</text>
      <text x="${x + 28}" y="${y + 56}" fill="${palette.ink}" font-family="${DISPLAY_FONT}" font-size="22" font-weight="700">${escapeXml(OVERVIEW_MODULE_LABELS[id])}</text>
      ${content}
    </g>`;
  }

  function overviewHeader(options, palette, compact) {
    return `<rect x="0" y="0" width="1600" height="16" fill="${palette.accent}" />
      <text x="72" y="70" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="17" font-weight="700" letter-spacing="2">MYANIMELIFE / ARCHIVE OVERVIEW</text>
      <text x="72" y="${compact ? 138 : 154}" fill="${palette.ink}" font-family="${DISPLAY_FONT}" font-size="${compact ? 44 : 54}" font-weight="700">${escapeXml(options.title || "我的番剧档案")}</text>
      <text x="72" y="${compact ? 178 : 198}" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="18">一份持续更新的观看与评分记录</text>`;
  }

  function overviewFooter(height, options, palette) {
    return `<text x="72" y="${height - 34}" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="16">${escapeXml(options.siteTitle || "MyAnimeLife")}</text>
      <text x="1528" y="${height - 34}" text-anchor="end" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="16">数据洞察</text>`;
  }

  function moduleHeight(id, insights) {
    const rowCount = (items, fallback = 4) =>
      Math.max(1, Math.min(items?.length || fallback, 8));
    if (id === "summary") return 236;
    if (id === "windows") return 220;
    if (id === "months") return 286;
    if (id === "decades") return 112 + rowCount(insights.decades) * 42;
    if (id === "ratings") return 112 + rowCount(insights.ratings) * 42;
    if (id === "sources") return 126 + rowCount(insights.sources) * 42;
    if (id === "comparison") return 230;
    return 220;
  }

  function longOverviewSvg(insights, options, palette, modules) {
    const width = 1600;
    const selected = OVERVIEW_MODULE_IDS.filter((id) => modules[id]);
    let y = 228;
    let body = overviewHeader(options, palette, false);
    selected.forEach((id, index) => {
      const height = moduleHeight(id, insights);
      body += overviewPanel(id, insights, index, 72, y, 1456, height, palette);
      y += height + 24;
    });
    if (!selected.length) {
      body += `<text x="72" y="290" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="20">请至少选择一个分享模块。</text>`;
    }
    const height = Math.max(520, y + 72);
    body = `<rect width="${width}" height="${height}" fill="${palette.paper}" />${body}${overviewFooter(height, options, palette)}`;
    return { svg: svgDocument(width, height, body), width, height };
  }

  function cardOverviewSvg(insights, options, palette, modules) {
    const width = 1600;
    const height = 1000;
    const summary = insights.summary ?? {};
    const windows = insights.windows ?? [];
    const selected = OVERVIEW_MODULE_IDS.filter(
      (id) => modules[id] && id !== "summary",
    );
    let body = `<rect width="${width}" height="${height}" fill="${palette.paper}" />${overviewHeader(options, palette, true)}`;
    let moduleTop = 210;
    if (modules.summary) {
      body += summaryTiles(summary, windows, 72, moduleTop, 1456, 104, palette);
      moduleTop += 124;
    }
    if (selected.length) {
      const gap = 20;
      const rows = Math.ceil(selected.length / 2);
      const availableHeight = height - moduleTop - 64;
      const panelHeight = Math.min(258, (availableHeight - gap * (rows - 1)) / rows);
      selected.forEach((id, index) => {
        const row = Math.floor(index / 2);
        const column = index % 2;
        const isLastOdd =
          selected.length % 2 === 1 && index === selected.length - 1;
        const panelWidth = isLastOdd ? 1456 : (1456 - gap) / 2;
        const x = 72 + column * ((1456 - gap) / 2 + gap);
        body += overviewPanel(
          id,
          insights,
          index + (modules.summary ? 1 : 0),
          x,
          moduleTop + row * (panelHeight + gap),
          panelWidth,
          Math.max(116, panelHeight),
          palette,
        );
      });
    } else if (!modules.summary) {
      body += `<text x="72" y="280" fill="${palette.muted}" font-family="${FONT_STACK}" font-size="20">请至少选择一个分享模块。</text>`;
    }
    body += overviewFooter(height, options, palette);
    return { svg: svgDocument(width, height, body), width, height };
  }

  async function createOverviewShareSvg(insights = {}, options = {}) {
    return createOverviewShareImage(insights, options).svg;
  }

  function createOverviewShareImage(insights = {}, options = {}) {
    const config = { ...readShareConfig(), ...options };
    const palette = PALETTES[config.accent] ?? PALETTES.coral;
    const modules = normalizeOverviewModules(config.modules);
    const format = config.format === "card" ? "card" : "long";
    return format === "card"
      ? cardOverviewSvg(insights, config, palette, modules)
      : longOverviewSvg(insights, config, palette, modules);
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
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#f5f0e7";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("PNG 生成失败"))),
          "image/png",
        );
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function inlineExternalImages(svg) {
    const matches = [
      ...svg.matchAll(/<image\b[^>]*\bhref="([^"]+)"/gu),
    ];
    let result = svg;
    let changed = false;
    for (const match of matches) {
      const source = match[1]
        .replace(/&amp;/gu, "&")
        .replace(/&quot;/gu, '"');
      if (source.startsWith("data:image/")) {
        continue;
      }
      const dataUrl = await imageDataUrl(source);
      if (!dataUrl) {
        continue;
      }
      result = result.replace(
        `href="${match[1]}"`,
        `href="${escapeXml(dataUrl)}"`,
      );
      changed = true;
    }
    return changed ? result : svg;
  }

  async function createImage(svg, width, height) {
    let png;
    try {
      png = await pngBlob(svg, width, height);
    } catch {
      const inlineSvg = await inlineExternalImages(svg);
      if (inlineSvg === svg) {
        throw new Error("封面服务器不允许跨域导出 PNG，请使用下载 SVG");
      }
      png = await pngBlob(inlineSvg, width, height);
    }
    return {
      svg: svgBlob(svg),
      png,
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
    const coverFrame = element.querySelector(
      ".record-cover[data-bangumi-id], .detail-cover[data-bangumi-id]",
    );
    const coverImage = coverFrame?.querySelector("img");
    return {
      id: element.dataset.shareId,
      title: element.dataset.shareTitle,
      coverUrl:
        element.dataset.shareCover ||
        coverImage?.currentSrc ||
        coverImage?.src ||
        "",
      bangumiId:
        element.dataset.shareBangumiId || coverFrame?.dataset.bangumiId || "",
      ratingDisplay: element.dataset.shareRating,
      review: element.dataset.shareReview,
      seasonLabel: element.dataset.shareSeason,
      yearLabel: element.dataset.shareYear,
      releaseLabel: element.dataset.shareRelease,
      siteTitle: document.title.split("|").pop()?.trim(),
    };
  }

  function readOverview() {
    const data = document.querySelector("#share-insights-data")?.textContent;
    try {
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  function readComparison() {
    const results = document.querySelector("#compareResults");
    if (!results || results.hidden) {
      return null;
    }
    const numberFrom = (selector) => {
      const text = document.querySelector(selector)?.textContent || "";
      return Number(text.replace(/[^\d.-]/gu, "")) || 0;
    };
    return {
      currentTotal: numberFrom("#currentTotal"),
      peerTotal: numberFrom("#peerTotal"),
      sharedTotal: numberFrom("#sharedTotal"),
      overlapPercent: numberFrom("#overlapPercent"),
    };
  }

  function actionIcon(action) {
    const paths = {
      download:
        '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>',
      copy: '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"></path>',
      svg: '<path d="M4 4h16v16H4z"></path><path d="M8 16 12 8l4 8"></path><path d="M7 14h10"></path>',
      close: '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
      image:
        '<rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8" cy="10" r="1.5"></circle><path d="m21 15-5-5L5 19"></path>',
    };
    return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[action] ?? paths.download}</svg>`;
  }

  let shareDialogState = null;

  function ensureShareDialog() {
    let dialog = document.querySelector(".share-dialog");
    if (dialog) {
      return dialog;
    }

    dialog = document.createElement("dialog");
    dialog.className = "share-dialog";
    dialog.setAttribute("aria-labelledby", "share-dialog-title");
    dialog.innerHTML = `<div class="share-dialog-card">
      <header class="share-dialog-header">
        <div>
          <p>SHARE STUDIO</p>
          <h2 id="share-dialog-title">分享番剧卡片</h2>
        </div>
        <button class="share-dialog-close" type="button" data-share-close aria-label="关闭分享预览" title="关闭">
          ${actionIcon("close")}
        </button>
      </header>
      <div class="share-dialog-layout">
        <form class="share-dialog-options" aria-label="分享图片设置">
          <fieldset>
            <legend>包含模块</legend>
            <div class="share-dialog-modules"></div>
          </fieldset>
          <fieldset>
            <legend>图片版式</legend>
            <div class="share-dialog-formats">
              <label>
                <input type="radio" name="share-format" value="long" checked />
                <span><strong>长图</strong><small>完整呈现所选模块</small></span>
              </label>
              <label>
                <input type="radio" name="share-format" value="card" />
                <span><strong>卡片</strong><small>适合社交平台单图</small></span>
              </label>
            </div>
          </fieldset>
        </form>
        <section class="share-dialog-preview" aria-label="分享图片预览">
          <div class="share-dialog-loading" role="status">
            <span class="share-dialog-spinner" aria-hidden="true"></span>
            <p>正在生成预览</p>
          </div>
          <img class="share-dialog-image" alt="分享图片预览" hidden />
          <p class="share-dialog-preview-error" hidden>预览生成失败，请重试。</p>
        </section>
      </div>
      <footer class="share-dialog-footer">
        <p class="share-dialog-status" role="status" aria-live="polite">图片在本地生成，不会上传数据。</p>
        <div class="share-dialog-actions">
          <button type="button" data-share-action="copy">${actionIcon("copy")}<span>复制图片</span></button>
          <button type="button" data-share-action="download">${actionIcon("download")}<span>下载 PNG</span></button>
          <button type="button" data-share-action="svg">${actionIcon("svg")}<span>下载 SVG</span></button>
        </div>
      </footer>
    </div>`;
    document.body.append(dialog);

    const moduleContainer = dialog.querySelector(".share-dialog-modules");
    for (const id of OVERVIEW_MODULE_IDS) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "share-module";
      input.value = id;
      input.checked = id !== "comparison";
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = OVERVIEW_MODULE_LABELS[id];
      const note = document.createElement("small");
      note.textContent =
        id === "comparison" ? "完成 PK 后可选" : "加入分享图片";
      copy.append(title, note);
      label.append(input, copy);
      moduleContainer.append(label);
    }

    dialog.querySelector("[data-share-close]").addEventListener("click", () => {
      dialog.close();
    });
    dialog.querySelector(".share-dialog-options").addEventListener(
      "change",
      refreshShareDialog,
    );
    dialog.querySelectorAll("[data-share-action]").forEach((button) => {
      button.addEventListener("click", () =>
        runDialogAction(button.dataset.shareAction, button),
      );
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        dialog.close();
      }
    });
    dialog.addEventListener("close", () => {
      if (shareDialogState?.previewUrl) {
        URL.revokeObjectURL(shareDialogState.previewUrl);
      }
      shareDialogState = null;
      const image = dialog.querySelector(".share-dialog-image");
      image.removeAttribute("src");
      image.hidden = true;
      dialog.querySelector(".share-dialog-loading").hidden = false;
    });
    return dialog;
  }

  function setDialogStatus(message, tone = "") {
    const status = document.querySelector(".share-dialog-status");
    if (!status) {
      return;
    }
    status.textContent = message;
    if (tone) {
      status.dataset.tone = tone;
    } else {
      delete status.dataset.tone;
    }
  }

  function setDialogActionsDisabled(disabled) {
    document.querySelectorAll("[data-share-action]").forEach((button) => {
      button.disabled = disabled;
    });
  }

  function setDialogPreviewState(state) {
    const dialog = document.querySelector(".share-dialog");
    if (!dialog) {
      return;
    }
    const loading = dialog.querySelector(".share-dialog-loading");
    const image = dialog.querySelector(".share-dialog-image");
    const error = dialog.querySelector(".share-dialog-preview-error");
    loading.hidden = state !== "loading";
    image.hidden = state !== "ready";
    error.hidden = state !== "error";
    dialog.classList.toggle("is-loading", state === "loading");
  }

  function selectedDialogModules(dialog) {
    return Object.fromEntries(
      [...dialog.querySelectorAll('input[name="share-module"]')].map(
        (input) => [input.value, input.checked],
      ),
    );
  }

  function shareSiteTitle() {
    return (
      document.querySelector(".brand-copy span")?.textContent?.trim() ||
      document.title.split("|").pop()?.trim() ||
      "MyAnimeLife"
    );
  }

  async function refreshShareDialog() {
    const dialog = document.querySelector(".share-dialog");
    const state = shareDialogState;
    if (!dialog || !state) {
      return;
    }
    const token = ++state.generation;
    state.svg = null;
    state.image = null;
    setDialogActionsDisabled(true);
    setDialogPreviewState("loading");
    setDialogStatus("正在生成最新预览…");

    try {
      let result;
      if (state.kind === "overview") {
        result = createOverviewShareImage(
          { ...readOverview(), comparison: readComparison() },
          {
          title:
            document.querySelector(".insights-heading h1")?.textContent?.trim() ||
            "我的番剧档案",
          siteTitle: shareSiteTitle(),
          format:
            dialog.querySelector('input[name="share-format"]:checked')?.value ||
            "long",
          modules: selectedDialogModules(dialog),
          },
        );
      } else {
        const svg = await createRecordShareSvg(state.record);
        result = { svg, width: 1200, height: 1500 };
      }
      if (token !== state.generation || shareDialogState !== state) {
        return;
      }
      const previewUrl = URL.createObjectURL(svgBlob(result.svg));
      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
      }
      state.previewUrl = previewUrl;
      state.svg = result.svg;
      state.width = result.width;
      state.height = result.height;
      const image = dialog.querySelector(".share-dialog-image");
      image.alt = state.kind === "overview" ? "档案分享图片预览" : "番剧分享卡片预览";
      image.src = previewUrl;
      setDialogPreviewState("ready");
      setDialogStatus(
        result.width === 1600
          ? `预览已更新 · ${result.width} × ${result.height}`
          : "预览已更新 · 1200 × 1500",
      );
      setDialogActionsDisabled(false);
    } catch (error) {
      if (token !== state.generation || shareDialogState !== state) {
        return;
      }
      setDialogPreviewState("error");
      setDialogStatus(error.message || "分享图片生成失败", "error");
    }
  }

  function openShareDialog(trigger) {
    const dialog = ensureShareDialog();
    const kind = trigger.dataset.shareKind === "overview" ? "overview" : "record";
    let record = null;
    if (kind === "record") {
      const recordElement = trigger.closest("[data-share-record]");
      if (!recordElement) {
        showStatus("没有找到可分享的番剧记录", "error");
        return;
      }
      record = recordFromElement(recordElement);
    }
    if (dialog.open) {
      dialog.close();
    }

    const comparison = readComparison();
    const comparisonInput = dialog.querySelector(
      'input[name="share-module"][value="comparison"]',
    );
    comparisonInput.disabled = !comparison;
    comparisonInput.checked = false;
    dialog.querySelectorAll('input[name="share-module"]').forEach((input) => {
      if (input !== comparisonInput) {
        input.checked = true;
      }
    });
    dialog.querySelector(
      'input[name="share-format"][value="long"]',
    ).checked = true;
    const options = dialog.querySelector(".share-dialog-options");
    options.hidden = kind !== "overview";
    dialog.classList.toggle("is-record", kind === "record");
    dialog.querySelector("#share-dialog-title").textContent =
      kind === "overview" ? "分享档案洞察" : "分享番剧卡片";
    setDialogStatus(
      kind === "overview"
        ? "勾选模块或切换版式，预览会立即更新。"
        : "图片在本地生成，不会上传数据。",
    );
    shareDialogState = {
      kind,
      trigger,
      record,
      svg: null,
      image: null,
      width: 0,
      height: 0,
      previewUrl: null,
      generation: 0,
      filename:
        kind === "overview"
          ? "my-anime-life-insights"
          : `anime-${clean(record.id).replace(/[^\w.-]+/gu, "-") || "record"}`,
    };
    dialog.showModal();
    refreshShareDialog();
  }

  async function runDialogAction(action, button) {
    const state = shareDialogState;
    if (!state?.svg) {
      setDialogStatus("请等待预览生成完成", "error");
      return;
    }
    const label = button.querySelector("span");
    const originalLabel = label.textContent;
    setDialogActionsDisabled(true);
    button.innerHTML = `${actionIcon(action)}<span>正在生成…</span>`;
    setDialogStatus("正在准备分享图片…");
    try {
      let image;
      if (action === "svg") {
        image = { svg: svgBlob(state.svg) };
      } else {
        if (!state.image) {
          state.image = await createImage(state.svg, state.width, state.height);
        }
        image = state.image;
      }
      if (action === "copy") {
        await copyImage(image.png);
        setDialogStatus("图片已复制到剪贴板", "success");
      } else if (action === "svg") {
        download(image.svg, `${state.filename}.svg`);
        setDialogStatus("SVG 图片已下载", "success");
      } else {
        download(image.png, `${state.filename}.png`);
        setDialogStatus("PNG 图片已下载", "success");
      }
    } catch (error) {
      setDialogStatus(error.message || "图片导出失败", "error");
    } finally {
      if (shareDialogState === state) {
        button.innerHTML = `${actionIcon(action)}<span>${originalLabel}</span>`;
        setDialogActionsDisabled(false);
      }
    }
  }

  function setup() {
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest?.("[data-share-trigger]");
      if (!trigger) {
        return;
      }
      event.preventDefault();
      openShareDialog(trigger);
    });
  }

  window.MyAnimeLifeShare = {
    createRecordShareSvg,
    createOverviewShareSvg,
    createOverviewShareImage,
    createImage,
    copyImage,
    download,
    showStatus,
    readShareConfig,
    openShareDialog,
  };
  setup();
})();
