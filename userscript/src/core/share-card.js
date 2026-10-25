const FONT_STACK = "Arial, 'Noto Sans SC', 'Microsoft YaHei', sans-serif";
const coverCache = new Map();

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
  if (!candidate) return null;
  if (candidate.startsWith("//")) return `https:${candidate}`;
  if (/^http:\/\//iu.test(candidate)) {
    return candidate.replace(/^http:\/\//iu, "https://");
  }
  return /^(?:https:\/\/|data:image\/)/iu.test(candidate)
    ? candidate
    : null;
}

function wrapText(value, maximum, limit = 4) {
  const characters = [...clean(value)];
  const lines = [];
  for (let index = 0; index < characters.length && lines.length < limit; ) {
    lines.push(characters.slice(index, index + maximum).join(""));
    index += maximum;
  }
  if (characters.length > maximum * limit && lines.length) {
    lines.at(-1) = `${lines.at(-1).slice(0, -1)}…`;
  }
  return lines;
}

function textBlock(lines, x, y, lineHeight, attributes) {
  const attrs = Object.entries(attributes)
    .map(([key, value]) => `${key}="${escapeXml(value)}"`)
    .join(" ");
  return `<text x="${x}" y="${y}" ${attrs}>${lines
    .map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`)
    .join("")}</text>`;
}

async function imageDataUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  if (normalized.startsWith("data:image/")) return normalized;
  if (!coverCache.has(normalized)) {
    coverCache.set(
      normalized,
      fetch(normalized, { credentials: "omit", mode: "cors" })
        .then((response) => {
          if (!response.ok) throw new Error(`cover HTTP ${response.status}`);
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
        .catch(() => null),
    );
  }
  return coverCache.get(normalized);
}

function fallbackCover(title, x, y, width, height) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="#efe6dc" />
    <text x="${x + 24}" y="${y + 160}" fill="#26332f" font-family="${FONT_STACK}" font-size="26" font-weight="700">${wrapText(title, 12, 4).map(escapeXml).join("<tspan x=\"${x + 24}\" dy=\"34\">")}</text>`;
}

async function coverBlock(record, x, y, width, height) {
  const dataUrl = await imageDataUrl(record.coverUrl);
  if (!dataUrl) return fallbackCover(record.title || "未命名番剧", x, y, width, height);
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="#e8e3dc" />
    <image href="${escapeXml(dataUrl)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />`;
}

function svgDocument(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><style>text{font-family:${FONT_STACK};}</style></defs>${body}</svg>`;
}

export async function createRecordShareSvg(record = {}) {
  const width = 1200;
  const height = 1500;
  const cover = await coverBlock(record, 72, 112, 420, 590);
  const title = wrapText(record.title || "未命名番剧", 17, 3);
  const review = wrapText(record.review || "还没有写下评价。", 31, 5);
  const rating = record.rating === null || record.rating === undefined
    ? "未评分"
    : `${record.rating} / 10`;
  const season = clean(record.season?.label);
  const meta = [season, rating].filter(Boolean).join("  ·  ");
  return svgDocument(width, height, `<rect width="1200" height="1500" fill="#f6f4ef" /><rect width="1200" height="18" fill="#d96c4f" />
    <text x="72" y="72" fill="#68736d" font-size="18" font-weight="700" letter-spacing="2">MYANIMELIFE / ANIME CARD</text>
    ${cover}
    <text x="552" y="158" fill="#68736d" font-size="20">我的番剧档案</text>
    ${textBlock(title, 552, 220, 58, { fill: "#26332f", "font-size": 48, "font-weight": 700 })}
    <text x="552" y="420" fill="#d96c4f" font-size="26" font-weight="700">${escapeXml(meta)}</text>
    <line x1="552" y1="462" x2="1128" y2="462" stroke="#d9d5ca" />
    <text x="552" y="520" fill="#68736d" font-size="18" font-weight="700">短评</text>
    ${textBlock(review, 552, 566, 34, { fill: "#26332f", "font-size": 23 })}
    <rect x="72" y="790" width="1056" height="1" fill="#d9d5ca" />
    <text x="72" y="850" fill="#68736d" font-size="18" font-weight="700">记录信息</text>
    ${textBlock([season ? `季度：${season}` : "季度：未标注"], 72, 900, 38, { fill: "#26332f", "font-size": 23 })}
    <text x="72" y="1390" fill="#68736d" font-size="17">${escapeXml(record.id)}</text>`);
}

function monthSeries(records, now = new Date()) {
  const counts = new Map();
  for (const record of records) {
    const date = new Date(record.createdAt);
    if (!Number.isNaN(date.getTime())) {
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const months = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    months.push({ key, shortLabel: `${date.getUTCMonth() + 1}月`, count: counts.get(key) ?? 0 });
  }
  const maximum = Math.max(1, ...months.map((month) => month.count));
  return months.map((month) => ({ ...month, percent: Math.round((month.count / maximum) * 100) }));
}

export function buildShareInsights(records = [], now = new Date()) {
  const ratings = records.map((record) => Number(record.rating)).filter(Number.isFinite);
  const total = records.length;
  const buckets = [
    ["0-5.9", "0 - 5.9", (rating) => rating < 6],
    ["6-6.9", "6 - 6.9", (rating) => rating >= 6 && rating < 7],
    ["7-7.9", "7 - 7.9", (rating) => rating >= 7 && rating < 8],
    ["8-8.9", "8 - 8.9", (rating) => rating >= 8 && rating < 9],
    ["9-10", "9 - 10", (rating) => rating >= 9],
  ].map(([key, label, test]) => ({ key, label, count: ratings.filter(test).length }));
  buckets.push({ key: "unrated", label: "未评分", count: total - ratings.length });
  const days = (amount) => records.filter((record) => {
    const created = new Date(record.createdAt).getTime();
    return Number.isFinite(created) && now.getTime() - created <= amount * 86400000;
  }).length;
  return {
    summary: {
      total,
      rated: ratings.length,
      averageRating: ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1) : "—",
      seasonPercent: total ? Math.round((records.filter((record) => Number.isInteger(record.season?.year)).length / total) * 100) : 0,
      sourcePercent: total ? Math.round((records.filter((record) => Object.keys(record.externalIds ?? {}).length).length / total) * 100) : 0,
    },
    windows: [{ days: 7, count: days(7) }, { days: 30, count: days(30) }, { days: 365, count: days(365) }],
    months: monthSeries(records, now),
    ratings: buckets.map((bucket) => ({ ...bucket, percent: total ? Math.round((bucket.count / total) * 100) : 0 })),
  };
}

export async function createOverviewShareSvg(insights = {}, title = "我的番剧档案") {
  const summary = insights.summary ?? {};
  const ratings = insights.ratings ?? [];
  const monthBars = (insights.months ?? []).map((month, index) => {
    const x = 72 + index * 55;
    const height = Math.max(2, (Number(month.percent) || 0) * 1.5);
    return `<rect x="${x}" y="690" width="38" height="${height}" rx="5" fill="#d96c4f" opacity="${month.count ? 0.92 : 0.18}" /><text x="${x + 19}" y="720" text-anchor="middle" fill="#68736d" font-size="13">${escapeXml(month.shortLabel)}</text>`;
  }).join("");
  const ratingRows = ratings.slice(0, 6).map((item, index) => {
    const y = 558 + index * 48;
    return `<text x="840" y="${y + 18}" fill="#68736d" font-size="16">${escapeXml(item.label)}</text><rect x="970" y="${y + 3}" width="470" height="22" rx="11" fill="#e5e0d6" /><rect x="970" y="${y + 3}" width="${Math.max(2, (Number(item.percent) || 0) * 4.7)}" height="22" rx="11" fill="#d96c4f" /><text x="1470" y="${y + 20}" text-anchor="end" fill="#26332f" font-size="16" font-weight="700">${Number(item.count) || 0}</text>`;
  }).join("");
  return svgDocument(1600, 1000, `<rect width="1600" height="1000" fill="#f6f4ef" /><rect width="1600" height="18" fill="#d96c4f" />
    <text x="72" y="76" fill="#68736d" font-size="19" font-weight="700" letter-spacing="2">MYANIMELIFE / ARCHIVE OVERVIEW</text>
    <text x="72" y="150" fill="#26332f" font-size="54" font-weight="700">${escapeXml(title)}</text>
    <g transform="translate(72 250)"><rect width="330" height="150" rx="16" fill="#ebe6dc" /><text x="28" y="48" fill="#68736d" font-size="18">作品总数</text><text x="28" y="112" fill="#26332f" font-size="50" font-weight="700">${summary.total ?? 0} <tspan font-size="22">部</tspan></text></g>
    <g transform="translate(424 250)"><rect width="330" height="150" rx="16" fill="#ebe6dc" /><text x="28" y="48" fill="#68736d" font-size="18">平均评分</text><text x="28" y="112" fill="#d96c4f" font-size="50" font-weight="700">${escapeXml(summary.averageRating ?? "—")} <tspan font-size="22">/ 10</tspan></text></g>
    <g transform="translate(776 250)"><rect width="330" height="150" rx="16" fill="#ebe6dc" /><text x="28" y="48" fill="#68736d" font-size="18">已评分</text><text x="28" y="112" fill="#26332f" font-size="50" font-weight="700">${summary.rated ?? 0} <tspan font-size="22">部</tspan></text></g>
    <g transform="translate(1128 250)"><rect width="400" height="150" rx="16" fill="#26332f" /><text x="28" y="48" fill="#bfc9bf" font-size="18">近一年新增</text><text x="28" y="112" fill="#fff" font-size="50" font-weight="700">${insights.windows?.find((item) => item.days === 365)?.count ?? 0} <tspan font-size="22">部</tspan></text></g>
    <text x="72" y="510" fill="#26332f" font-size="24" font-weight="700">最近十二个月</text>${monthBars}
    <text x="840" y="510" fill="#26332f" font-size="24" font-weight="700">评分分布</text>${ratingRows}
    <text x="840" y="890" fill="#68736d" font-size="18">年代覆盖 ${summary.seasonPercent ?? 0}% · 索引覆盖 ${summary.sourcePercent ?? 0}%</text>`);
}

export async function createShareImage(svg, width, height) {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    const png = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG 生成失败"))), "image/png");
    });
    return { svg: svgBlob, png };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function downloadShareImage(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyShareImage(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("当前浏览器不支持复制图片，请使用下载功能");
  }
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
