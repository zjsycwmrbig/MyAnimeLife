export const DISPLAY_TEMPLATE_IDS = ["default", "compact", "spotlight"];
export const SHARE_TEMPLATE_IDS = DISPLAY_TEMPLATE_IDS;
export const SHARE_ACCENT_IDS = ["coral", "teal", "blue", "amber"];
export const TAG_RADAR_MODES = ["auto", "manual"];

export const SHARE_ACCENTS = {
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

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeNameList(value, maximumItems = 48, maximumLength = 40) {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,，、]+/u)
      : [];
  const seen = new Set();
  const result = [];
  for (const candidate of candidates) {
    const name = cleanString(candidate)
      .replace(/\s+/gu, " ")
      .slice(0, maximumLength);
    const key = name.toLocaleLowerCase("zh-CN");
    if (!name || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(name);
    if (result.length >= maximumItems) {
      break;
    }
  }
  return result;
}

function normalizeAliasGroups(value) {
  const groups = Array.isArray(value) ? value : [];
  return groups
    .map((group) => {
      const names = normalizeNameList(
        Array.isArray(group)
          ? group
          : cleanString(group).split(/[=＝/]+/u),
        12,
        30,
      );
      return names.length >= 2 ? names : null;
    })
    .filter(Boolean)
    .slice(0, 20);
}

function requireChoice(value, choices, label) {
  const candidate = cleanString(value);
  if (!choices.includes(candidate)) {
    throw new Error(`${label}不在支持范围内`);
  }
  return candidate;
}

function requireText(value, label, maximumLength, fallback = "") {
  const candidate = cleanString(value ?? fallback);
  if (!candidate) {
    throw new Error(`${label}不能为空`);
  }
  if ([...candidate].length > maximumLength) {
    throw new Error(`${label}不能超过 ${maximumLength} 个字符`);
  }
  return candidate;
}

export function normalizeShareConfig(value, displayTemplate = "default") {
  const share = value && typeof value === "object" ? value : {};
  const requestedTemplate = cleanString(share.template);
  const template = SHARE_TEMPLATE_IDS.includes(requestedTemplate)
    ? requestedTemplate
    : "default";
  const accent = SHARE_ACCENT_IDS.includes(cleanString(share.accent))
    ? cleanString(share.accent)
    : "coral";
  return {
    template,
    resolvedTemplate: template,
    accent,
  };
}

export function normalizeTagRadarConfig(value) {
  const radar = value && typeof value === "object" ? value : {};
  const requestedMaxAxes = Number(radar.maxAxes);
  return {
    enabled: radar.enabled === undefined ? true : Boolean(radar.enabled),
    mode: TAG_RADAR_MODES.includes(cleanString(radar.mode))
      ? cleanString(radar.mode)
      : "auto",
    maxAxes:
      Number.isInteger(requestedMaxAxes) &&
      requestedMaxAxes >= 3 &&
      requestedMaxAxes <= 12
        ? requestedMaxAxes
        : 8,
    axes: normalizeNameList(radar.axes, 12, 40),
    excludedTags: normalizeNameList(radar.excludedTags, 60, 40),
    aliasGroups: normalizeAliasGroups(radar.aliasGroups),
  };
}

export function siteSettingsPayload(config) {
  return {
    site: {
      title: config.site.title,
      brand: config.site.brand ?? "",
      description: config.site.description,
      footer: config.site.footer ?? "",
    },
    template: config.template,
    share: normalizeShareConfig(config.share, config.template),
    insights: {
      tagRadar: normalizeTagRadarConfig(config.insights?.tagRadar),
    },
  };
}

export function applySiteSettings(config, input) {
  if (!config || typeof config !== "object") {
    throw new Error("当前站点配置无效");
  }
  if (!input || typeof input !== "object") {
    throw new Error("站点设置内容无效");
  }
  const siteInput = input.site && typeof input.site === "object" ? input.site : {};
  const currentSite = config.site ?? {};
  const template = requireChoice(
    input.template ?? config.template,
    DISPLAY_TEMPLATE_IDS,
    "展示模板",
  );
  const shareInput =
    input.share && typeof input.share === "object" ? input.share : config.share ?? {};
  const share = {
    template: requireChoice(
      shareInput.template === "auto"
        ? "default"
        : shareInput.template ?? "default",
      SHARE_TEMPLATE_IDS,
      "分享模板",
    ),
    accent: requireChoice(
      shareInput.accent ?? "coral",
      SHARE_ACCENT_IDS,
      "分享配色",
    ),
  };
  const insightsInput =
    input.insights && typeof input.insights === "object"
      ? input.insights
      : {};
  const tagRadar = normalizeTagRadarConfig(
    insightsInput.tagRadar ?? config.insights?.tagRadar,
  );

  const next = {
    ...config,
    site: {
      ...currentSite,
      title: requireText(
        siteInput.title,
        "站点标题",
        80,
        currentSite.title,
      ),
      brand: requireText(
        siteInput.brand,
        "站点标识",
        40,
        currentSite.brand ?? "ANIME LEDGER",
      ),
      description: requireText(
        siteInput.description,
        "站点简介",
        240,
        currentSite.description,
      ),
      footer: cleanString(siteInput.footer ?? currentSite.footer),
    },
    template,
    share,
    insights: {
      ...(config.insights ?? {}),
      tagRadar,
    },
  };
  return next;
}
