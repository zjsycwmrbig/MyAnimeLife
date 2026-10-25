import {
  Bot,
  Check,
  CircleHelp,
  CloudDownload,
  Database,
  ExternalLink,
  Github,
  GitBranch,
  GitFork,
  GripHorizontal,
  KeyRound,
  List,
  MessageSquareText,
  PanelRightClose,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide";
import { createElement as createLucideElement } from "lucide";
import panelStyles from "./panel.css";
import {
  INDEX_SOURCES,
  UPDATE_FREQUENCIES,
} from "../core/settings.js";
import { normalizeCoverUrl } from "../core/cover-url.js";
import {
  FINE_GRAINED_TOKEN_URL,
  GITHUB_PAGES_DOCS_URL,
  TEMPLATE_GENERATE_URL,
  parseGithubRepository,
} from "../core/github-records.js";
import { toErrorMessage } from "../core/network.js";
import { INDEX_STATES } from "../index/index-service.js";

const TYPE_LABELS = {
  tv: "TV",
  web: "WEB",
  movie: "剧场版",
  ova: "OVA",
  oad: "OAD",
  music: "音乐",
  unknown: "番剧",
};

const SOURCE_LABELS = {
  "regex:json-ld": "结构化数据",
  "regex:site-title": "站点标题",
  "regex:open-graph": "Open Graph",
  "regex:heading": "页面标题",
  "regex:document-title": "网页标题",
  "regex:summary-mention": "简介提及",
  "regex:comment-mention": "评论提及",
  "regex:page-mention": "页面提及",
  "regex:breadcrumb": "面包屑",
  "regex:fallback": "备用标题",
  "bilibili:media-id": "B站 ID",
  "bilibili:pgc-api": "B站接口",
  "bilibili:title": "B站标题",
  deepseek: "DeepSeek",
};

function sourceLabel(source) {
  return SOURCE_LABELS[source] ?? String(source ?? "页面线索");
}

function itemDisplayTitle(item) {
  const chineseName = item?.names?.find((name) =>
    /[\u3400-\u9fff]/u.test(String(name ?? "")),
  );
  return item?.displayTitle || chineseName || item?.title || "";
}

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = String(options.text);
  }
  for (const [key, value] of Object.entries(options.attrs ?? {})) {
    if (value !== undefined && value !== null) {
      node.setAttribute(key, String(value));
    }
  }
  for (const [key, value] of Object.entries(options.dataset ?? {})) {
    node.dataset[key] = String(value);
  }
  for (const property of [
    "type",
    "name",
    "value",
    "placeholder",
    "checked",
    "disabled",
    "autocomplete",
    "min",
    "max",
    "step",
    "rows",
    "maxLength",
  ]) {
    if (options[property] !== undefined) {
      node[property] = options[property];
    }
  }
  for (const [event, handler] of Object.entries(options.on ?? {})) {
    node.addEventListener(event, handler);
  }
  for (const child of children) {
    if (child === null || child === undefined) {
      continue;
    }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function icon(iconNode, className = "") {
  const node = createLucideElement(iconNode);
  node.classList.add("lucide");
  if (className) {
    node.classList.add(className);
  }
  node.setAttribute("aria-hidden", "true");
  return node;
}

function iconButton(label, iconNode, handler, className = "scout-icon-button") {
  return element(
    "button",
    {
      className,
      attrs: {
        type: "button",
        title: label,
        "aria-label": label,
      },
      on: { click: handler },
    },
    [icon(iconNode)],
  );
}

function button(label, iconNode, handler, options = {}) {
  const node = element(
    "button",
    {
      className: "scout-button",
      dataset: options.variant ? { variant: options.variant } : {},
      attrs: { type: options.type ?? "button" },
      disabled: options.disabled,
      on: { click: handler },
    },
    [iconNode ? icon(iconNode) : null, label],
  );
  if (options.iconRef) {
    options.iconRef.current = node.querySelector(".lucide");
  }
  return node;
}

function formatConfidence(value) {
  return `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function recordTimestamp(record) {
  const timestamp = Date.parse(String(record?.updatedAt ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function hasRecordContent(record) {
  const rating = record?.rating;
  return (
    (rating !== null &&
      rating !== "" &&
      Number.isFinite(Number(rating)) &&
      Number(rating) >= 0) ||
    Boolean(String(record?.review ?? "").trim())
  );
}

function formatRecordTime(value) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function confidenceTone(value) {
  if (value >= 0.72) {
    return "good";
  }
  if (value >= 0.45) {
    return "warn";
  }
  return "bad";
}

function stateTone(status) {
  if (
    status === INDEX_STATES.READY ||
    status === INDEX_STATES.LOADING ||
    status === INDEX_STATES.CHECKING ||
    status === INDEX_STATES.UPDATING
  ) {
    if (status === INDEX_STATES.READY) {
      return "good";
    }
    return "warn";
  }
  if (status === INDEX_STATES.ERROR) {
    return "bad";
  }
  return "none";
}

function option(value, label, selected) {
  return element("option", { value, text: label, checked: selected });
}

export class ScoutPanel {
  constructor(options) {
    this.settingsStore = options.settingsStore;
    this.indexService = options.indexService;
    this.recognizer = options.recognizer;
    this.personalRecordStore = options.personalRecordStore;
    this.coverResolver = options.coverResolver;
    this.githubRecords = options.githubRecords;
    this.onRecognize = options.onRecognize;
    this.onSettingsSaved = options.onSettingsSaved;
    this.onUpdateIndex = options.onUpdateIndex;
    this.onClearIndex = options.onClearIndex;
    this.onScanCards = options.onScanCards;
    this.indexState = this.indexService.getState();
    this.currentResult = null;
    this.selectedResult = null;
    this.recordItem = null;
    this.recordRating = null;
    this.recordDirty = false;
    this.recordRemoteRecord = null;
    this.recordLoadRequestId = 0;
    this.recordSaving = false;
    this.githubConnectionChecking = false;
    this.githubLastSyncedAt = "";
    this.manualSearchRows = [];
    this.candidateCollapsed = false;
    this.batchCards = [];
    this.batchRenderTimer = null;
    this.coverRequestId = 0;
    this.busy = false;
    this.searchTimer = null;
    this.dragState = null;
    this.dockedSide = null;
    this.panelHasCustomPosition = false;
  }

  mount() {
    const existing = document.getElementById("bangumi-scout-host");
    if (existing) {
      this.host = existing;
      this.shadow = existing.shadowRoot;
      return;
    }

    this.host = element("div", { attrs: { id: "bangumi-scout-host" } });
    this.shadow = this.host.attachShadow({ mode: "open" });
    this.shadow.append(element("style", { text: panelStyles }));

    this.launcherDot = element("span", {
      className: "scout-launcher-dot",
      dataset: { tone: "none" },
    });
    this.launcherLabel = element("span", {
      className: "scout-launcher-label",
      text: "番剧",
    });
    this.launcher = element(
      "button",
      {
        className: "scout-launcher",
        attrs: {
          type: "button",
          title: "Bangumi Scout",
          "aria-label": "打开 Bangumi Scout",
          "aria-expanded": "false",
        },
        on: { click: () => this.toggle() },
      },
      [icon(ScanSearch), this.launcherLabel, this.launcherDot],
    );

    this.panelStatus = element("p", {
      className: "scout-brand-state",
      text: "本地索引准备中",
    });
    this.recognitionView = this.buildRecognitionView();
    this.panelBody = element("div", { className: "scout-body" }, [
      this.recognitionView,
    ]);
    this.settingsView = null;
    this.settingsBody = element("div", { className: "scout-body" });

    this.panelHeader = element(
      "header",
      {
        className: "scout-header scout-panel-header",
        attrs: { title: "拖动面板" },
        on: {
          pointerdown: (event) => this.startPanelDrag(event),
          pointermove: (event) => this.movePanel(event),
          pointerup: (event) => this.finishPanelDrag(event),
          pointercancel: (event) => this.finishPanelDrag(event),
        },
      },
      [
        element("div", { className: "scout-brand-mark" }, [icon(ScanSearch)]),
        element("div", { className: "scout-brand" }, [
          element("h1", {
            className: "scout-brand-title",
            text: "Bangumi Scout",
          }),
          this.panelStatus,
        ]),
        element(
          "span",
          {
            className: "scout-drag-indicator",
            attrs: { "aria-hidden": "true" },
          },
          [icon(GripHorizontal)],
        ),
        iconButton(
          "隐藏到侧边栏",
          PanelRightClose,
          () => this.hideToSide(),
          "scout-icon-button scout-dock-button",
        ),
        iconButton("关闭", X, () => this.close()),
      ],
    );

    this.panel = element(
      "section",
      {
        className: "scout-panel",
        attrs: {
          hidden: "",
          "aria-label": "Bangumi Scout 番剧识别",
        },
      },
      [
        this.panelHeader,
        this.panelBody,
      ],
    );

    this.settingsWindowStatus = element("p", {
      className: "scout-brand-state",
      text: "脚本设置",
    });
    this.settingsWindow = element(
      "section",
      {
        className: "scout-settings-window",
        attrs: {
          hidden: "",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "Bangumi Scout 设置",
        },
      },
      [
        element("header", { className: "scout-header" }, [
          element("div", { className: "scout-brand-mark" }, [icon(Settings2)]),
          element("div", { className: "scout-brand" }, [
            element("h2", {
              className: "scout-brand-title",
              text: "Bangumi Scout 设置",
            }),
            this.settingsWindowStatus,
          ]),
          iconButton("关闭设置", X, () => this.closeSettings()),
        ]),
        this.settingsBody,
      ],
    );
    this.settingsBackdrop = element("div", {
      className: "scout-settings-backdrop",
      attrs: { hidden: "" },
      on: { click: () => this.closeSettings() },
    });

    this.root = element("div", { className: "scout-root" }, [
      this.settingsBackdrop,
      this.settingsWindow,
      this.panel,
      this.launcher,
    ]);
    this.shadow.append(this.root);
    document.documentElement.append(this.host);

    this.shadow.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!this.settingsWindow.hidden) {
          this.closeSettings();
        } else if (!this.panel.hidden) {
          this.close();
        }
      }
    });
    this.setIndexState(this.indexState);
    window.addEventListener("resize", () => this.handleViewportResize());
  }

  buildRecognitionView() {
    this.resultBadge = element("span", {
      className: "scout-confidence",
      text: "等待识别",
      dataset: { tone: "none" },
    });
    this.resultTitle = element("h2", {
      className: "scout-title",
      text: "尚未识别",
    });
    this.resultSubtitle = element("p", {
      className: "scout-subtitle",
      text: "点击入口或“重新识别”读取当前页面。",
    });
    this.evidenceStrip = element("div", { className: "scout-evidence" });
    this.coverImage = element("img", {
      className: "scout-cover-image",
      attrs: {
        alt: "番剧封面",
        loading: "eager",
        decoding: "async",
        referrerpolicy: "no-referrer",
      },
      on: {
        error: () => {
          if (this.coverImage.getAttribute("src")) {
            this.setSelectedCover(null);
          }
        },
      },
    });
    this.coverFrame = element(
      "div",
      { className: "scout-cover", attrs: { hidden: "" } },
      [this.coverImage],
    );

    this.rescanIcon = icon(RefreshCw);
    this.rescanButton = button(
      "识别当前页",
      null,
      () => this.onRecognize({ source: "manual" }),
      { variant: "primary" },
    );
    this.rescanButtonTextNode = this.rescanButton.lastChild;
    this.rescanButton.prepend(this.rescanIcon);
    this.aiButton = button(
      "AI 辅助",
      Sparkles,
      () => this.requestAi(),
    );
    this.manualSearchButton = button(
      "手动搜索",
      Search,
      () => this.showManualSearch(),
    );
    this.resultActions = element("div", { className: "scout-actions" }, [
      this.rescanButton,
      this.aiButton,
      this.manualSearchButton,
    ]);

    this.siteLink = element("a", {
      className: "scout-button",
      attrs: { target: "_blank", rel: "noreferrer" },
    }, [icon(ExternalLink), "打开 B 站"]);
    this.siteLink.hidden = true;
    this.resultActions.append(this.siteLink);

    this.resultList = element("div", { className: "scout-list" });
    this.resultListSection = element("section", { className: "scout-section" }, [
      element("h3", { className: "scout-section-title" }, [
        icon(List),
        "候选结果",
      ]),
      this.resultList,
    ]);

    this.titleCandidateList = element("div", {
      className: "scout-suggestions",
    });
    this.titleCandidateSection = element(
      "section",
      { className: "scout-section" },
      [
        element("h3", { className: "scout-section-title" }, [
          icon(Sparkles),
          "识别线索",
        ]),
        this.titleCandidateList,
      ],
    );
    this.titleCandidateSection.hidden = true;

    this.searchInput = element("input", {
      type: "search",
      placeholder: "手动搜索番剧名或别名",
      autocomplete: "off",
      attrs: { "aria-label": "手动搜索番剧" },
      on: { input: () => this.scheduleManualSearch() },
    });
    this.manualSearchResults = element("div", {
      className: "scout-list scout-manual-results",
    });
    this.manualSearchSection = element(
      "section",
      { className: "scout-section" },
      [
        element("h3", { className: "scout-section-title" }, [
          icon(Search),
          "索引搜索",
        ]),
        element("div", { className: "scout-search" }, [
          icon(Search),
          this.searchInput,
        ]),
        this.manualSearchResults,
      ],
    );
    this.manualSearchSection.hidden = true;

    this.batchList = element("div", { className: "scout-list" });
    this.batchTitle = element("span", { text: "当前页面番剧" });
    this.batchSection = element("section", { className: "scout-section" }, [
      element("h3", { className: "scout-section-title" }, [
        icon(ScanSearch),
        this.batchTitle,
      ]),
      this.batchList,
    ]);
    this.batchSection.hidden = true;

    this.recordItemLabel = element("span", {
      className: "scout-record-item",
      text: "先选定一个候选",
    });
    this.reselectButton = element(
      "button",
      {
        className: "scout-reselect",
        attrs: {
          type: "button",
          title: "展开候选并重新选择",
        },
        on: { click: () => this.showCandidateSelection() },
      },
      [icon(Search), "重新选择"],
    );
    this.recordRatingValue = element("span", {
      className: "scout-record-value",
      text: "未评分",
    });
    this.ratingButtons = [];
    const ratingOptions = element(
      "div",
      {
        className: "scout-rating-options",
        attrs: {
          role: "radiogroup",
          "aria-label": "个人评分，1 到 10 分",
        },
      },
      Array.from({ length: 10 }, (_, index) => {
        const rating = index + 1;
        const ratingButton = element(
          "button",
          {
            className: "scout-rating-option",
            dataset: { rating },
            attrs: {
              type: "button",
              role: "radio",
              "aria-checked": "false",
              "aria-label": `${rating} 分`,
            },
            on: { click: () => this.selectRating(rating) },
          },
          [String(rating)],
        );
        this.ratingButtons.push(ratingButton);
        return ratingButton;
      }),
    );
    this.reviewInput = element("textarea", {
      className: "scout-review",
      name: "personal.review",
      rows: 3,
      maxLength: 20000,
      placeholder: "写下你的评价或备注",
      attrs: { "aria-label": "个人评价" },
      on: {
        input: () => {
          this.recordDirty = true;
          this.recordStatus.textContent = "有尚未保存的修改";
        },
      },
    });
    this.recordStatus = element("span", {
      className: "scout-footer-status",
      text: "尚未填写",
    });
    this.saveRecordButton = button(
      "保存草稿",
      Save,
      () => this.savePersonalRecord(),
      { variant: "primary" },
    );
    this.saveRecordButtonTextNode = this.saveRecordButton.lastChild;
    this.recordNote = element("p", {
      className: "scout-note",
      text: "当前保存为本机草稿；在扩展设置中连接 GitHub 后可写入自己的番剧仓库。",
    });
    this.recordRemoteLink = element(
      "a",
      {
        className: "scout-record-remote-link",
        attrs: {
          href: "#",
          target: "_blank",
          rel: "noreferrer",
          hidden: "",
        },
      },
      [icon(ExternalLink), "查看 GitHub 记录"],
    );
    this.recordSection = element(
      "section",
      {
        className: "scout-section scout-record",
        attrs: { tabindex: "-1" },
      },
      [
        element("div", { className: "scout-record-head" }, [
          element("h3", { className: "scout-section-title" }, [
            icon(Star),
            "我的评分与短评",
          ]),
          element("div", { className: "scout-record-context" }, [
            this.recordItemLabel,
            this.reselectButton,
          ]),
        ]),
        element("div", { className: "scout-record-rating-head" }, [
          element("span", { className: "scout-range-label", text: "评分" }),
          this.recordRatingValue,
        ]),
        ratingOptions,
        this.reviewInput,
        element("div", { className: "scout-record-footer" }, [
          this.recordStatus,
          this.saveRecordButton,
        ]),
        this.recordNote,
        this.recordRemoteLink,
      ],
    );
    this.recordSection.hidden = true;

    this.diagnosticsList = element("ul");
    this.diagnostics = element(
      "details",
      { className: "scout-diagnostics" },
      [
        element("summary", { text: "识别详情" }),
        this.diagnosticsList,
      ],
    );
    this.diagnostics.hidden = true;

    this.resultHead = element("div", { className: "scout-result-head" }, [
      this.coverFrame,
      element("div", { className: "scout-result-copy" }, [
        element("div", { className: "scout-eyebrow" }, [
          this.resultBadge,
          element("span", { text: "当前页面" }),
        ]),
        this.resultTitle,
        this.resultSubtitle,
        this.evidenceStrip,
        this.resultActions,
      ]),
    ]);

    return element("div", {
      className: "scout-view",
      attrs: {
        "data-view": "recognition",
        role: "region",
        "aria-label": "番剧识别结果",
      },
    }, [
      this.resultHead,
      this.manualSearchSection,
      this.batchSection,
      this.resultListSection,
      this.titleCandidateSection,
      this.recordSection,
      this.diagnostics,
    ]);
  }

  buildSettingsView() {
    const settings = this.settingsStore.get();

    this.indexEnabled = element("input", {
      type: "checkbox",
      name: "index.enabled",
      checked: settings.index.enabled,
      on: { change: () => this.syncSettingsDisabledState() },
    });
    this.indexSource = element("select", {
      name: "index.source",
      on: {
        change: () => {
          this.syncCustomUrlVisibility();
          this.syncSettingsDisabledState();
        },
      },
    }, [
      option(INDEX_SOURCES.BANGUMI_DATA, "bangumi-data（自动更新）"),
      option(INDEX_SOURCES.CUSTOM, "自定义精简索引 URL"),
    ]);
    this.customIndexUrl = element("input", {
      type: "url",
      name: "index.customIndexUrl",
      placeholder: "https://raw.githubusercontent.com/...",
      autocomplete: "off",
    });
    this.customUrlField = element("label", { className: "scout-field" }, [
      element("span", { text: "自定义索引 URL" }),
      this.customIndexUrl,
    ]);
    this.updateFrequency = element("select", {
      name: "index.updateFrequency",
    }, [
      option(UPDATE_FREQUENCIES.STARTUP, "每次启动（最多每 15 分钟一次）"),
      option(UPDATE_FREQUENCIES.DAILY, "每天"),
      option(UPDATE_FREQUENCIES.WEEKLY, "每周"),
      option(UPDATE_FREQUENCIES.MANUAL, "仅手动"),
    ]);
    this.indexStatusLine = element("p", {
      className: "scout-note",
      text: "尚未读取索引状态。",
    });
    this.updateIndexButton = button(
      "检查更新",
      CloudDownload,
      () => this.runIndexUpdate(),
    );
    this.clearIndexButton = button(
      "清除缓存",
      Trash2,
      () => this.runClearIndex(),
    );

    this.regexCandidates = element("input", {
      type: "checkbox",
      name: "matching.useRegexCandidates",
      checked: settings.matching.useRegexCandidates,
    });
    this.fuzzyThreshold = element("input", {
      className: "scout-range",
      type: "range",
      name: "matching.fuzzyThreshold",
      min: "0.15",
      max: "0.8",
      step: "0.01",
      value: settings.matching.fuzzyThreshold,
    });
    this.fuzzyOutput = element("output", {
      text: settings.matching.fuzzyThreshold.toFixed(2),
    });
    this.fuzzyThreshold.addEventListener("input", () => {
      this.fuzzyOutput.value = Number(this.fuzzyThreshold.value).toFixed(2);
    });
    this.autoAiThreshold = element("input", {
      className: "scout-range",
      type: "range",
      name: "matching.autoAiThreshold",
      min: "0.3",
      max: "0.95",
      step: "0.01",
      value: settings.matching.autoAiThreshold,
    });
    this.autoAiOutput = element("output", {
      text: settings.matching.autoAiThreshold.toFixed(2),
    });
    this.autoAiThreshold.addEventListener("input", () => {
      this.autoAiOutput.value = Number(this.autoAiThreshold.value).toFixed(2);
    });

    this.aiEnabled = element("input", {
      type: "checkbox",
      name: "ai.enabled",
      checked: settings.ai.enabled,
      on: { change: () => this.syncSettingsDisabledState() },
    });
    this.aiAutoFallback = element("input", {
      type: "checkbox",
      name: "ai.autoFallback",
      checked: settings.ai.autoFallback,
    });
    this.apiKey = element("input", {
      type: "password",
      name: "ai.apiKey",
      autocomplete: "off",
      placeholder: "sk-...",
    });
    this.aiBaseUrl = element("input", {
      type: "url",
      name: "ai.baseUrl",
      autocomplete: "off",
    });
    this.aiModel = element("input", {
      type: "text",
      name: "ai.model",
      autocomplete: "off",
    });
    this.maxContextChars = element("input", {
      type: "number",
      name: "ai.maxContextChars",
      min: "1000",
      max: "16000",
      step: "500",
    });

    this.githubEnabled = element("input", {
      type: "checkbox",
      name: "github.enabled",
      checked: settings.github.enabled,
      on: { change: () => this.syncGithubDisabledState() },
    });
    this.githubRepositoryUrl = element("input", {
      type: "text",
      name: "github.repositoryUrl",
      autocomplete: "off",
      placeholder: "https://github.com/你的用户名/anime-records",
      on: {
        input: () => this.syncGithubRepositoryLinks(),
        change: () => this.syncGithubRepositoryLinks(),
      },
    });
    this.githubBranch = element("input", {
      type: "text",
      name: "github.branch",
      autocomplete: "off",
      placeholder: "main",
    });
    this.githubToken = element("input", {
      type: "password",
      name: "github.token",
      autocomplete: "off",
      placeholder: "github_pat_...",
    });
    this.githubConnectionStatus = element("p", {
      className: "scout-note",
      text: "尚未检查仓库连接。",
    });
    this.githubCheckButton = button(
      "检查连接",
      RefreshCw,
      () => this.runGithubConnectionCheck(),
    );
    this.githubOpenRepoLink = element(
      "a",
      {
        className: "scout-button",
        attrs: {
          href: "#",
          target: "_blank",
          rel: "noreferrer",
          hidden: "",
        },
      },
      [icon(Github), "打开仓库"],
    );
    this.githubPagesLink = element(
      "a",
      {
        className: "scout-button",
        attrs: {
          href: GITHUB_PAGES_DOCS_URL,
          target: "_blank",
          rel: "noreferrer",
        },
      },
      [icon(GitBranch), "Pages 设置说明"],
    );

    this.settingsFooterStatus = element("span", {
      className: "scout-footer-status",
      text: "设置保存在油猴扩展中",
    });
    this.saveButton = button(
      "保存",
      Save,
      () => this.saveSettings(),
      { variant: "primary", type: "button" },
    );
    this.resetButton = button(
      "重置",
      RotateCcw,
      () => this.resetSettings(),
    );

    this.settingsView = element(
      "form",
      {
        className: "scout-view",
        attrs: {
          "data-view": "settings",
        },
        on: {
          submit: (event) => {
            event.preventDefault();
            this.saveSettings();
          },
        },
      },
      [
        element("section", { className: "scout-section" }, [
          element("h3", { className: "scout-section-title" }, [
            icon(Database),
            "本地索引",
          ]),
          this.switchRow("启用番剧缓存索引", this.indexEnabled),
          this.field("索引来源", this.indexSource),
          this.customUrlField,
          this.field("更新频率", this.updateFrequency),
          element("div", { className: "scout-actions" }, [
            this.updateIndexButton,
            this.clearIndexButton,
          ]),
          this.indexStatusLine,
        ]),
        element("section", { className: "scout-section" }, [
          element("h3", { className: "scout-section-title" }, [
            icon(SlidersHorizontal),
            "匹配",
          ]),
          this.switchRow("启用正则标题候选", this.regexCandidates),
          element("div", { className: "scout-range-head" }, [
            element("span", { className: "scout-range-label", text: "模糊搜索阈值" }),
            this.fuzzyOutput,
          ]),
          this.fuzzyThreshold,
          element("p", {
            className: "scout-note",
            text: "数值越低越严格，建议保持 0.35 至 0.5。",
          }),
          element("div", { className: "scout-range-head" }, [
            element("span", {
              className: "scout-range-label",
              text: "AI 自动兜底阈值",
            }),
            this.autoAiOutput,
          ]),
          this.autoAiThreshold,
        ]),
        element("section", { className: "scout-section" }, [
          element("h3", { className: "scout-section-title" }, [
            icon(KeyRound),
            "DeepSeek",
          ]),
          this.switchRow("启用 AI 识别", this.aiEnabled),
          this.switchRow("低置信度时自动调用", this.aiAutoFallback),
          this.field("API Key", this.apiKey),
          element("div", { className: "scout-field-grid" }, [
            this.field("API 地址", this.aiBaseUrl),
            this.field("模型", this.aiModel),
          ]),
          this.field("页面上下文上限（字符）", this.maxContextChars),
          element("p", {
            className: "scout-note",
            text: "密钥仅保存在本机 Tampermonkey 存储中，不会写入当前 Git 仓库。",
          }),
        ]),
        element("section", { className: "scout-section" }, [
          element("h3", { className: "scout-section-title" }, [
            icon(Github),
            "GitHub 番剧仓库",
          ]),
          element("div", { className: "scout-onboarding" }, [
            element("h4", { text: "第一次使用" }),
            element("ol", {}, [
              element("li", {
                text: "使用模板创建个人仓库。新仓库不继承上游提交历史，data/anime 保持为空。",
              }),
              element("li", {
                text: "在仓库 Settings > Pages 中把 Source 设为 GitHub Actions。",
              }),
              element("li", {
                text: "创建仅限该仓库、Contents 为 Read and write 的细粒度 Token。",
              }),
              element("li", {
                text: "返回这里填写仓库地址和 Token，保存后点击检查连接。",
              }),
            ]),
            element("div", { className: "scout-onboarding-actions" }, [
              element(
                "a",
                {
                  className: "scout-button",
                  attrs: {
                    href: TEMPLATE_GENERATE_URL,
                    target: "_blank",
                    rel: "noreferrer",
                  },
                },
                [icon(GitFork), "用模板新建"],
              ),
              element(
                "a",
                {
                  className: "scout-button",
                  attrs: {
                    href: FINE_GRAINED_TOKEN_URL,
                    target: "_blank",
                    rel: "noreferrer",
                  },
                },
                [icon(ShieldCheck), "创建 Token"],
              ),
              element(
                "a",
                {
                  className: "scout-button",
                  attrs: {
                    href: GITHUB_PAGES_DOCS_URL,
                    target: "_blank",
                    rel: "noreferrer",
                  },
                },
                [icon(CircleHelp), "Pages 帮助"],
              ),
            ]),
          ]),
          this.switchRow("启用 GitHub 同步", this.githubEnabled),
          this.field("仓库地址", this.githubRepositoryUrl),
          element("div", { className: "scout-field-grid" }, [
            this.field("分支", this.githubBranch),
            this.field("细粒度 Token", this.githubToken),
          ]),
          element("div", { className: "scout-actions" }, [
            this.githubCheckButton,
            this.githubOpenRepoLink,
            this.githubPagesLink,
          ]),
          this.githubConnectionStatus,
          element("p", {
            className: "scout-note",
            text: "推荐用模板新建仓库；Fork 会连同上游旧提交一起复制。Token 只保存在本机，请勿把模板仓库地址当作自己的数据仓库。",
          }),
        ]),
        element("footer", { className: "scout-footer" }, [
          this.settingsFooterStatus,
          element("div", { className: "scout-footer-actions" }, [
            this.resetButton,
            this.saveButton,
          ]),
        ]),
      ],
    );

    this.populateSettings(settings);
    return this.settingsView;
  }

  field(label, control) {
    return element("label", { className: "scout-field" }, [
      element("span", { text: label }),
      control,
    ]);
  }

  switchRow(label, control) {
    return element("label", { className: "scout-switch" }, [
      element("span", { text: label }),
      control,
    ]);
  }

  populateSettings(settings) {
    this.indexEnabled.checked = settings.index.enabled;
    this.indexSource.value = settings.index.source;
    this.customIndexUrl.value = settings.index.customIndexUrl;
    this.updateFrequency.value = settings.index.updateFrequency;
    this.regexCandidates.checked = settings.matching.useRegexCandidates;
    this.fuzzyThreshold.value = settings.matching.fuzzyThreshold;
    this.fuzzyOutput.value = Number(settings.matching.fuzzyThreshold).toFixed(2);
    this.autoAiThreshold.value = settings.matching.autoAiThreshold;
    this.autoAiOutput.value = Number(settings.matching.autoAiThreshold).toFixed(2);
    this.aiEnabled.checked = settings.ai.enabled;
    this.aiAutoFallback.checked = settings.ai.autoFallback;
    this.apiKey.value = settings.ai.apiKey;
    this.aiBaseUrl.value = settings.ai.baseUrl;
    this.aiModel.value = settings.ai.model;
    this.maxContextChars.value = settings.ai.maxContextChars;
    this.githubEnabled.checked = settings.github.enabled;
    this.githubRepositoryUrl.value = settings.github.repositoryUrl;
    this.githubBranch.value = settings.github.branch;
    this.githubToken.value = settings.github.token;
    this.githubLastSyncedAt = settings.github.lastSyncedAt;
    this.githubConnectionStatus.textContent = this.githubLastSyncedAt
      ? `上次 GitHub 保存：${formatRecordTime(this.githubLastSyncedAt)}`
      : "尚未检查仓库连接。";
    this.syncCustomUrlVisibility();
    this.syncSettingsDisabledState();
    this.syncGithubRepositoryLinks();
    this.syncGithubDisabledState();
  }

  syncCustomUrlVisibility() {
    this.customUrlField.hidden =
      this.indexSource.value !== INDEX_SOURCES.CUSTOM;
  }

  syncSettingsDisabledState() {
    const indexControlsDisabled = !this.indexEnabled.checked;
    this.indexSource.disabled = indexControlsDisabled;
    this.updateFrequency.disabled = indexControlsDisabled;
    this.clearIndexButton.disabled = indexControlsDisabled;
    this.customIndexUrl.disabled =
      indexControlsDisabled ||
      this.indexSource.value !== INDEX_SOURCES.CUSTOM;

    const aiDisabled = !this.aiEnabled.checked;
    this.aiAutoFallback.disabled = aiDisabled;
    this.apiKey.disabled = aiDisabled;
    this.aiBaseUrl.disabled = aiDisabled;
    this.aiModel.disabled = aiDisabled;
    this.maxContextChars.disabled = aiDisabled;
    this.aiButton.disabled = this.busy;
  }

  syncGithubRepositoryLinks() {
    let repository = null;
    try {
      repository = parseGithubRepository(this.githubRepositoryUrl.value);
    } catch {
      this.githubOpenRepoLink.hidden = true;
      this.githubOpenRepoLink.setAttribute("href", "#");
      this.githubPagesLink.href = GITHUB_PAGES_DOCS_URL;
      this.githubPagesLink.lastChild.textContent = "Pages 设置说明";
      return;
    }

    this.githubOpenRepoLink.hidden = false;
    this.githubOpenRepoLink.href = repository.webUrl;
    this.githubPagesLink.href = `${repository.webUrl}/settings/pages`;
    this.githubPagesLink.lastChild.textContent = "Pages 设置";
  }

  syncGithubDisabledState() {
    const githubDisabled = !this.githubEnabled.checked;
    this.githubRepositoryUrl.disabled = githubDisabled;
    this.githubBranch.disabled = githubDisabled;
    this.githubToken.disabled = githubDisabled;
    this.githubCheckButton.disabled =
      githubDisabled || this.githubConnectionChecking;
  }

  collectGithubSettings() {
    return {
      enabled: this.githubEnabled.checked,
      repositoryUrl: this.githubRepositoryUrl.value.trim(),
      branch: this.githubBranch.value.trim() || "main",
      token: this.githubToken.value.trim(),
      lastSyncedAt: this.githubLastSyncedAt,
    };
  }

  githubRecordConfig(settings = this.settingsStore.get()) {
    const github = settings?.github ?? {};
    if (!github.enabled || !String(github.repositoryUrl ?? "").trim()) {
      return null;
    }
    try {
      parseGithubRepository(github.repositoryUrl);
      return github;
    } catch {
      return null;
    }
  }

  saveSettings(options = {}) {
    const previous = this.settingsStore.get();
    const settings = this.settingsStore.update({
      index: {
        enabled: this.indexEnabled.checked,
        source: this.indexSource.value,
        customIndexUrl: this.customIndexUrl.value,
        updateFrequency: this.updateFrequency.value,
      },
      matching: {
        useRegexCandidates: this.regexCandidates.checked,
        fuzzyThreshold: Number(this.fuzzyThreshold.value),
        autoAiThreshold: Number(this.autoAiThreshold.value),
      },
      ai: {
        enabled: this.aiEnabled.checked,
        autoFallback: this.aiAutoFallback.checked,
        apiKey: this.apiKey.value,
        baseUrl: this.aiBaseUrl.value,
        model: this.aiModel.value,
        maxContextChars: Number(this.maxContextChars.value),
      },
      github: this.collectGithubSettings(),
    });
    this.populateSettings(settings);
    if (options.quiet !== true) {
      this.showToast("设置已保存");
    }
    if (options.notify !== false) {
      this.onSettingsSaved?.(settings, previous);
    }
    if (
      options.reloadGithub !== false &&
      this.recordItem?.id &&
      this.githubRecordConfig(settings)
    ) {
      this.loadRemoteRecordForCurrentItem();
    }
    return settings;
  }

  resetSettings() {
    const previous = this.settingsStore.get();
    const settings = this.settingsStore.reset();
    this.populateSettings(settings);
    this.showToast("设置已恢复默认值");
    this.onSettingsSaved?.(settings, previous);
    this.recordLoadRequestId += 1;
    this.recordRemoteRecord = null;
    this.setRecordRemoteLink(null);
    this.syncRecordGithubState();
  }

  async runGithubConnectionCheck() {
    if (!this.githubRecords || this.githubConnectionChecking) {
      return;
    }
    this.githubConnectionChecking = true;
    this.githubCheckButton.classList.add("is-loading");
    this.githubConnectionStatus.textContent = "正在检查 GitHub 仓库…";
    this.syncGithubDisabledState();
    try {
      const result = await this.githubRecords.checkConnection({
        enabled: this.githubEnabled.checked,
        repositoryUrl: this.githubRepositoryUrl.value,
        branch: this.githubBranch.value,
        token: this.githubToken.value,
      });
      const visibility = result.private ? "私有仓库" : "公开仓库";
      this.githubConnectionStatus.textContent =
        `${result.fullName} 可访问 · ${visibility} · 默认分支 ${result.defaultBranch}`;
    } catch (error) {
      this.githubConnectionStatus.textContent =
        `连接失败：${toErrorMessage(error)}`;
    } finally {
      this.githubConnectionChecking = false;
      this.githubCheckButton.classList.remove("is-loading");
      this.syncGithubDisabledState();
    }
  }

  async runIndexUpdate() {
    this.updateIndexButton.disabled = true;
    try {
      await this.onUpdateIndex?.();
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.updateIndexButton.disabled = !this.indexEnabled.checked;
    }
  }

  async runClearIndex() {
    this.clearIndexButton.disabled = true;
    try {
      await this.onClearIndex?.();
      this.showToast("本地索引缓存已清除");
    } catch (error) {
      this.showToast(error.message);
    } finally {
      this.clearIndexButton.disabled = !this.indexEnabled.checked;
    }
  }

  setIndexState(state) {
    this.indexState = state;
    const version = state.sourceVersion ? ` · ${state.sourceVersion}` : "";
    const count = state.itemCount
      ? ` · ${state.itemCount.toLocaleString("zh-CN")} 条`
      : "";
    this.panelStatus.textContent = `${state.message}${count}${version}`;
    this.launcherDot.dataset.tone = stateTone(state.status);
    if (this.indexStatusLine) {
      this.indexStatusLine.textContent = `${state.message}${count}${version}`;
    }
    if (this.settingsFooterStatus) {
      this.settingsFooterStatus.textContent =
        state.status === INDEX_STATES.READY
          ? "设置保存在油猴扩展中"
          : state.message;
    }
    this.settingsWindowStatus.textContent = state.message;
    if (this.updateIndexButton) {
      this.updateIndexButton.disabled =
        !this.settingsStore.get().index.enabled ||
        state.status === INDEX_STATES.UPDATING ||
        state.status === INDEX_STATES.CHECKING;
    }
  }

  setBusy(busy, message = "正在识别") {
    this.busy = busy;
    this.rescanButton.disabled = busy;
    this.aiButton.disabled = busy;
    this.panel.setAttribute("aria-busy", busy ? "true" : "false");
    this.rescanIcon.classList.toggle("scout-spin", busy);
    if (this.rescanButtonTextNode) {
      this.rescanButtonTextNode.textContent = busy
        ? "正在识别"
        : this.currentResult
          ? "重新识别"
          : "识别当前页";
    }
    if (busy) {
      this.resultBadge.textContent = message;
      this.resultBadge.dataset.tone = "none";
    }
  }

  setResult(result) {
    this.currentResult = result;
    this.selectedResult = result.best
      ? { ...result.best, selectionSource: "automatic" }
      : null;
    this.recordDirty = false;
    this.candidateCollapsed = false;
    this.batchCards = [];
    this.renderRecognitionResult(result);
    if (this.rescanButtonTextNode) {
      this.rescanButtonTextNode.textContent = "重新识别";
    }
  }

  renderRecognitionResult(result) {
    this.resultListSection.hidden = false;
    this.renderSelectedResult();
    this.renderTitleCandidates(result.titleCandidates);
    this.renderEvidence(result);
    this.renderDiagnostics(result.diagnostics);
    this.scheduleBatchCards();
  }

  renderSelectedResult() {
    const result = this.currentResult ?? {
      aiResult: null,
      results: [],
      status: "unmatched",
      titleCandidates: [],
    };
    const selected = this.selectedResult;
    const item = selected?.item ?? null;
    const aiTitle = result.aiResult?.title;
    const fallbackTitle = result.titleCandidates?.[0]?.title;
    const title =
      itemDisplayTitle(item) ||
      aiTitle ||
      fallbackTitle ||
      "未识别到番剧";
    const confidence =
      selected?.confidence ?? result.aiResult?.confidence ?? 0;
    const statusLabels = {
      matched: "精确匹配",
      ambiguous: "可能匹配",
      unmatched: "未找到可靠匹配",
    };

    this.resultTitle.textContent = title;
    this.resultBadge.textContent = selected?.manualSelection
      ? "已选定候选"
      : statusLabels[result.status] ?? "识别完成";
    this.resultBadge.dataset.tone = confidenceTone(confidence);

    if (item) {
      const displayTitle = itemDisplayTitle(item);
      const alternateNames = item.names
        .filter((name) => name !== displayTitle)
        .slice(0, 3);
      const metadata = [
        item.year,
        TYPE_LABELS[item.type] ?? item.type,
        alternateNames.join(" / "),
      ].filter(Boolean);
      this.resultSubtitle.textContent =
        metadata.join(" · ") || "已命中本地番剧索引";
    } else if (result.aiResult?.reason) {
      this.resultSubtitle.textContent = result.aiResult.reason;
    } else if (fallbackTitle) {
      this.resultSubtitle.textContent = `页面标题候选：${fallbackTitle}`;
    } else {
      this.resultSubtitle.textContent = "当前页面没有足够的番剧信息。";
    }

    const bilibiliId = item?.sites?.bilibili;
    this.siteLink.hidden = !bilibiliId;
    if (bilibiliId) {
      this.siteLink.href = `https://www.bilibili.com/bangumi/media/md${bilibiliId}`;
    }

    this.renderSelectedCover(item);
    this.renderResultRows(this.resultList, result.results, {
      emptyText: "本地索引没有返回候选，可尝试手动搜索或 AI 识别。",
      selectedId: item?.id ?? null,
      onSelect: (row) => this.selectResultRow(row, "候选结果"),
    });
    this.renderPersonalRecord(item);
  }

  setSelectedCover(url) {
    const safeUrl = normalizeCoverUrl(url);
    this.coverFrame.hidden = !safeUrl;
    this.resultHead.classList.toggle("has-cover", Boolean(safeUrl));
    if (safeUrl) {
      this.coverImage.src = safeUrl;
    } else {
      this.coverImage.removeAttribute("src");
    }
  }

  renderSelectedCover(item) {
    const requestId = ++this.coverRequestId;
    const isCurrentPageItem =
      Boolean(item?.id) && this.currentResult?.best?.item?.id === item.id;
    const pageCoverUrl = isCurrentPageItem
      ? this.currentResult?.bilibiliMetadata?.coverUrl
      : null;
    this.setSelectedCover(item?.coverUrl || pageCoverUrl || null);
    if (!item || item?.coverUrl || pageCoverUrl || !this.coverResolver) {
      return;
    }

    Promise.resolve(this.coverResolver(item))
      .then((url) => {
        if (requestId === this.coverRequestId && url) {
          this.setSelectedCover(url);
        }
      })
      .catch(() => {
        // Cover lookup is optional and must not block recognition.
      });
  }

  renderResultRows(container, rows, options = {}) {
    container.replaceChildren();
    if (!rows?.length) {
      container.append(
        element("div", {
          className: "scout-empty",
          text: options.emptyText ?? "没有结果",
        }),
      );
      return;
    }

    for (const row of rows.slice(0, 10)) {
      const item = row.item ?? row;
      const confidence = row.confidence ?? 0;
      const methods = Array.isArray(row.matchedBy)
        ? row.matchedBy.join(" / ")
        : row.matchedBy;
      const selected = options.selectedId === item.id;
      const selectable = typeof options.onSelect === "function";
      const displayTitle = itemDisplayTitle(item);
      const originalTitle =
        item.title && item.title !== displayTitle ? item.title : null;
      const content = [
        element("div", { className: "scout-list-copy" }, [
          element("div", {}, [
            element("div", {
              className: "scout-list-title",
              text: displayTitle,
            }),
            element("div", {
              className: "scout-list-meta",
              text: [
                item.year,
                TYPE_LABELS[item.type] ?? item.type,
                originalTitle,
                methods,
              ]
                .filter(Boolean)
                .join(" · "),
            }),
          ]),
        ]),
        element("span", { className: "scout-row-tail" }, [
          element("span", {
            className: "scout-score",
            text: options.showConfidence === false
              ? String(confidence)
              : formatConfidence(confidence),
          }),
          selectable
            ? element("span", {
                className: "scout-row-check",
                attrs: { "aria-hidden": "true" },
              }, [icon(Check)])
            : null,
        ]),
      ];
      const rowNode = element(selectable ? "button" : "div", {
        className: `scout-list-row${selected ? " is-selected" : ""}`,
        dataset: { itemId: item.id },
        attrs: selectable
          ? {
              type: "button",
              "aria-pressed": selected ? "true" : "false",
            }
          : {},
        on: selectable
          ? { click: () => options.onSelect(row) }
          : {},
      }, content);
      container.append(rowNode);
    }
  }

  renderTitleCandidates(candidates) {
    const rows = (candidates ?? []).slice(0, 8);
    this.titleCandidateSection.hidden = rows.length === 0;
    this.titleCandidateList.replaceChildren();
    for (const candidate of rows) {
      this.titleCandidateList.append(
        element(
          "button",
          {
            className: "scout-suggestion",
            dataset: { source: candidate.source },
            attrs: {
              type: "button",
              title: `${candidate.title} · ${sourceLabel(candidate.source)}`,
            },
            on: { click: () => this.useTitleCandidate(candidate) },
          },
          [
            element("span", {
              className: "scout-suggestion-title",
              text: candidate.title,
            }),
            element("span", {
              className: "scout-suggestion-source",
              text: sourceLabel(candidate.source),
            }),
          ],
        ),
      );
    }
  }

  renderEvidence(result) {
    const context = result.context ?? {};
    const evidence = [];
    if (context.summary) {
      evidence.push({ icon: List, label: "简介已读取" });
    }
    if (context.comments?.length) {
      evidence.push({
        icon: MessageSquareText,
        label: `评论 ${context.comments.length} 条`,
      });
    }
    if (context.titleMentions?.length) {
      evidence.push({
        icon: Sparkles,
        label: `标题线索 ${context.titleMentions.length} 条`,
      });
    }
    if (result.aiResult) {
      evidence.push({ icon: Bot, label: "AI 已参与" });
    }
    this.evidenceStrip.replaceChildren();
    this.evidenceStrip.hidden = evidence.length === 0;
    for (const entry of evidence) {
      this.evidenceStrip.append(
        element("span", { className: "scout-evidence-item" }, [
          icon(entry.icon),
          entry.label,
        ]),
      );
    }
  }

  selectResultRow(row, selectionSource = "候选结果") {
    if (!row?.item?.id) {
      return;
    }
    this.selectedResult = {
      ...row,
      manualSelection: true,
      selectionSource,
    };
    this.recordDirty = false;
    this.renderSelectedResult();
    this.renderBatchCards();
    this.renderManualSearchRows(this.manualSearchRows);
    this.collapseCandidatesForRecord();
    this.showToast(`已选择：${itemDisplayTitle(row.item)}`);
  }

  collapseCandidatesForRecord() {
    this.candidateCollapsed = true;
    this.manualSearchSection.hidden = true;
    this.batchSection.hidden = true;
    this.resultListSection.hidden = true;
    this.titleCandidateSection.hidden = true;
    this.recordSection.hidden = false;
    requestAnimationFrame(() => {
      this.recordSection.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      this.recordSection.focus({ preventScroll: true });
    });
  }

  showCandidateSelection() {
    this.candidateCollapsed = false;
    this.resultListSection.hidden = false;
    this.titleCandidateSection.hidden =
      this.titleCandidateList.childElementCount === 0;
    this.batchSection.hidden = this.batchList.childElementCount === 0;
    const hasManualQuery = Boolean(this.searchInput.value.trim());
    this.manualSearchSection.hidden = !hasManualQuery;
    const target = hasManualQuery
      ? this.manualSearchSection
      : this.resultListSection;
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (hasManualQuery) {
      this.searchInput.focus({ preventScroll: true });
    }
  }

  useTitleCandidate(candidate) {
    const rows = this.recognizer.search(candidate.title, { limit: 10 });
    this.searchInput.value = candidate.title;
    this.manualSearchSection.hidden = false;
    this.renderManualSearchRows(rows);
    if (!rows.length) {
      this.showToast(`索引中没有找到“${candidate.title}”`);
      return;
    }
    this.selectResultRow(rows[0], "识别线索");
  }

  renderManualSearchRows(rows = this.manualSearchRows) {
    this.manualSearchRows = rows;
    this.renderResultRows(this.manualSearchResults, rows, {
      emptyText: "没有搜索到番剧。",
      selectedId: this.selectedResult?.item?.id ?? null,
      onSelect: (row) => this.selectResultRow(row, "索引搜索"),
    });
  }

  selectRating(rating) {
    if (!this.recordItem || this.busy) {
      return;
    }
    this.recordRating = this.recordRating === rating ? null : rating;
    this.recordDirty = true;
    this.recordStatus.textContent = "有尚未保存的修改";
    this.syncRecordRating();
  }

  syncRecordRating() {
    for (const ratingButton of this.ratingButtons) {
      const selected =
        Number(ratingButton.dataset.rating) === this.recordRating;
      ratingButton.classList.toggle("is-selected", selected);
      ratingButton.setAttribute("aria-checked", selected ? "true" : "false");
    }
    this.recordRatingValue.textContent = this.recordRating
      ? `${this.recordRating} / 10`
      : "未评分";
  }

  renderPersonalRecord(item) {
    const recordStoreReady = Boolean(this.personalRecordStore);
    const itemChanged = this.recordItem?.id !== item?.id;
    if (itemChanged) {
      this.recordLoadRequestId += 1;
      this.recordItem = item ?? null;
      this.recordRemoteRecord = null;
      this.setRecordRemoteLink(null);
      const record = item?.id ? this.personalRecordStore?.get(item.id) : null;
      this.recordRating = record?.rating ?? null;
      this.recordDirty = false;
      this.reviewInput.value = record?.review ?? "";
      this.recordStatus.textContent =
        record?.rating || record?.review
          ? "已载入本地草稿"
          : "尚未填写";
    }

    const enabled = Boolean(item?.id && recordStoreReady);
    const displayTitle = itemDisplayTitle(item);
    this.recordSection.hidden = !enabled;
    this.recordItemLabel.textContent = displayTitle || "先选定一个候选";
    this.recordItemLabel.title = displayTitle;
    this.syncRecordRating();
    this.syncRecordGithubState();
    if (
      itemChanged &&
      enabled &&
      this.githubRecordConfig(this.settingsStore.get())
    ) {
      this.loadRemoteRecordForCurrentItem();
    }
  }

  setRecordRemoteLink(remoteRecord) {
    if (!this.recordRemoteLink) {
      return;
    }
    let href = String(remoteRecord?.htmlUrl ?? "");
    if (!href && remoteRecord?.id) {
      try {
        const repository = parseGithubRepository(
          this.settingsStore.get().github.repositoryUrl,
        );
        const branch = (
          this.settingsStore.get().github.branch || "main"
        )
          .split("/")
          .map(encodeURIComponent)
          .join("/");
        href = `${repository.webUrl}/blob/${branch}/data/anime/${encodeURIComponent(
          remoteRecord.id,
        )}.json`;
      } catch {
        href = "";
      }
    }
    this.recordRemoteLink.hidden = !href;
    if (href) {
      this.recordRemoteLink.href = href;
      this.recordRemoteLink.title = remoteRecord?.path
        ? `${remoteRecord.path} · ${remoteRecord.sha ?? ""}`.trim()
        : "查看 GitHub 记录";
    } else {
      this.recordRemoteLink.setAttribute("href", "#");
      this.recordRemoteLink.removeAttribute("title");
    }
  }

  syncRecordGithubState() {
    if (!this.saveRecordButtonTextNode) {
      return;
    }
    const settings = this.settingsStore.get();
    const configured = Boolean(this.githubRecordConfig(settings));
    const writable =
      configured && Boolean(String(settings.github.token ?? "").trim());
    const enabled = Boolean(this.recordItem?.id && this.personalRecordStore);
    this.saveRecordButtonTextNode.textContent = writable
      ? "保存到 GitHub"
      : "保存草稿";
    this.reviewInput.disabled = !enabled || this.recordSaving;
    this.saveRecordButton.disabled = !enabled || this.recordSaving;
    for (const ratingButton of this.ratingButtons) {
      ratingButton.disabled = !enabled || this.recordSaving;
    }
    if (writable) {
      this.recordNote.textContent =
        "保存时先写本地草稿，再同步到 GitHub；远端失败不会删除本地内容。";
    } else if (configured) {
      this.recordNote.textContent =
        "仓库已配置但缺少 Token，当前只保存本地草稿。请在扩展设置中补充。";
    } else {
      this.recordNote.textContent =
        "当前保存为本机草稿；在扩展设置中连接 GitHub 后可写入自己的番剧仓库。";
    }
  }

  applyRemoteRecord(record) {
    const rating = Number(record?.rating);
    this.recordRating =
      record?.rating !== null &&
      record?.rating !== "" &&
      Number.isFinite(rating) &&
      rating >= 0 &&
      rating <= 10
        ? Math.round(rating * 10) / 10
        : null;
    this.reviewInput.value = String(record?.review ?? "");
    this.recordDirty = false;
    this.syncRecordRating();
    this.personalRecordStore?.save(
      this.recordItem.id,
      {
        rating: this.recordRating,
        review: this.reviewInput.value,
        updatedAt: record?.updatedAt,
      },
      { preserveUpdatedAt: true },
    );
  }

  async loadRemoteRecordForCurrentItem() {
    const item = this.recordItem;
    const settings = this.settingsStore.get();
    if (
      !item?.id ||
      !this.githubRecords ||
      !this.githubRecordConfig(settings)
    ) {
      this.recordRemoteRecord = null;
      this.setRecordRemoteLink(null);
      this.syncRecordGithubState();
      return;
    }

    const requestId = ++this.recordLoadRequestId;
    const selectedResult =
      this.selectedResult?.item?.id === item.id ? this.selectedResult : null;
    this.recordStatus.textContent = "本地草稿已载入 · 正在读取 GitHub";
    try {
      const remote = await this.githubRecords.loadForItem(
        item,
        selectedResult,
      );
      if (requestId !== this.recordLoadRequestId || this.recordItem?.id !== item.id) {
        return;
      }
      this.recordRemoteRecord = remote;
      this.setRecordRemoteLink(remote);
      if (!remote) {
        this.recordStatus.textContent = hasRecordContent(
          this.personalRecordStore?.get(item.id),
        )
          ? "已载入本地草稿 · GitHub 尚无记录"
          : "尚未填写 · GitHub 尚无记录";
        return;
      }

      const local = this.personalRecordStore?.get(item.id);
      if (this.recordDirty) {
        this.recordStatus.textContent =
          "GitHub 记录已载入，当前编辑尚未覆盖";
        return;
      }
      if (
        !hasRecordContent(local) ||
        recordTimestamp(remote.record) >= recordTimestamp(local)
      ) {
        this.applyRemoteRecord(remote.record);
        const updatedAt = formatRecordTime(remote.record?.updatedAt);
        this.recordStatus.textContent = updatedAt
          ? `已从 GitHub 载入 · ${updatedAt}`
          : "已从 GitHub 载入";
      } else {
        this.recordStatus.textContent =
          "本地草稿较新 · 保存时将同步到 GitHub";
      }
    } catch (error) {
      if (requestId !== this.recordLoadRequestId || this.recordItem?.id !== item.id) {
        return;
      }
      const local = this.personalRecordStore?.get(item.id);
      this.recordStatus.textContent = hasRecordContent(local)
        ? "本地草稿可用 · GitHub 读取失败"
        : "尚未填写 · GitHub 读取失败";
      this.showToast(`GitHub 读取失败：${toErrorMessage(error)}`);
    } finally {
      this.syncRecordGithubState();
    }
  }

  async savePersonalRecord() {
    if (!this.recordItem?.id || !this.personalRecordStore) {
      return;
    }
    const item = this.recordItem;
    const selectedResult =
      this.selectedResult?.item?.id === item.id ? this.selectedResult : null;
    const rating = this.recordRating;
    const review = this.reviewInput.value;
    this.recordLoadRequestId += 1;
    const saved = this.personalRecordStore.save(item.id, {
      rating: this.recordRating,
      review: this.reviewInput.value,
    });
    if (!saved) {
      this.showToast("草稿保存失败");
      return;
    }
    this.recordDirty = false;
    const savedAt = new Date(
      saved.updatedAt,
    ).toLocaleString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    this.recordStatus.textContent = `本地草稿已保存 · ${savedAt}`;
    this.saveRecordButton.classList.add("is-confirmed");
    setTimeout(
      () => this.saveRecordButton.classList.remove("is-confirmed"),
      500,
    );

    const settings = this.settingsStore.get();
    const writable =
      this.githubRecordConfig(settings) &&
      Boolean(String(settings.github.token ?? "").trim());
    if (!writable || !this.githubRecords) {
      this.syncRecordGithubState();
      this.showToast("本地评分与短评草稿已保存");
      return;
    }

    this.recordSaving = true;
    this.syncRecordGithubState();
    this.recordStatus.textContent = "本地草稿已保存 · 正在同步到 GitHub";
    try {
      const remote = await this.githubRecords.saveRecord({
        item,
        selectedResult,
        aiResult: this.currentResult?.aiResult ?? null,
        rating,
        review,
      });
      this.recordRemoteRecord = remote;
      this.setRecordRemoteLink(remote);
      const syncedAt =
        remote.record?.updatedAt || this.settingsStore.get().github.lastSyncedAt;
      const updatedSettings = this.settingsStore.update({
        github: {
          ...this.settingsStore.get().github,
          lastSyncedAt: syncedAt || new Date().toISOString(),
        },
      });
      this.githubLastSyncedAt = updatedSettings.github.lastSyncedAt;
      this.recordStatus.textContent = `已保存到 GitHub · ${formatRecordTime(
        this.githubLastSyncedAt,
      )}`;
      this.showToast("评分与短评已保存到 GitHub");
    } catch (error) {
      this.recordStatus.textContent =
        "本地草稿已保存 · GitHub 同步失败";
      this.showToast(`GitHub 保存失败：${toErrorMessage(error)}`);
    } finally {
      this.recordSaving = false;
      this.syncRecordGithubState();
    }
  }

  renderDiagnostics(diagnostics) {
    this.diagnosticsList.replaceChildren();
    const entries = (diagnostics ?? []).filter(Boolean);
    this.diagnostics.hidden = entries.length === 0;
    for (const entry of entries) {
      this.diagnosticsList.append(element("li", { text: entry }));
    }
  }

  renderBatchCards() {
    const cards = this.batchCards;
    this.batchSection.hidden = cards.length === 0;
    this.batchList.replaceChildren();
    if (!cards.length) {
      return;
    }

    const matched = cards.filter((card) => card.item).length;
    for (const card of cards.slice(0, 30)) {
      const selected =
        Boolean(card.item?.id) && this.selectedResult?.item?.id === card.item.id;
      const selectable = Boolean(card.item?.id);
      const displayTitle = card.item
        ? itemDisplayTitle(card.item)
        : card.title;
      this.batchList.append(
        element(selectable ? "button" : "div", {
          className: `scout-list-row${selected ? " is-selected" : ""}`,
          dataset: { itemId: card.item?.id ?? card.mediaId },
          attrs: selectable
            ? {
                type: "button",
                "aria-pressed": selected ? "true" : "false",
              }
            : {},
          on: selectable
            ? {
                click: () =>
                  this.selectResultRow(
                    {
                      item: card.item,
                      confidence: 1,
                      matchedBy: ["bilibili-card"],
                    },
                    "追番列表",
                  ),
              }
            : {},
        }, [
          element("div", { className: "scout-list-copy" }, [
            element("div", {
              className: "scout-list-title",
              text: displayTitle,
            }),
            element("div", {
              className: "scout-list-meta",
              text: card.item
                ? [card.item.year, card.item.names.slice(1, 2).join("")]
                    .filter(Boolean)
                    .join(" · ")
                : `Bilibili md${card.mediaId}`,
            }),
          ]),
          element("span", { className: "scout-row-tail" }, [
            element("span", {
              className: "scout-score",
              text: card.item ? "已匹配" : "未命中",
            }),
            selectable
              ? element("span", {
                  className: "scout-row-check",
                  attrs: { "aria-hidden": "true" },
                }, [icon(Check)])
              : null,
          ]),
        ]),
      );
    }
    this.batchTitle.textContent = `当前页面番剧 (${matched}/${cards.length})`;
  }

  scheduleBatchCards() {
    clearTimeout(this.batchRenderTimer);
    this.batchRenderTimer = null;
    this.batchCards = [];
    this.batchSection.hidden = true;
    this.batchList.replaceChildren();
    if (this.currentResult?.context?.pageKind !== "bilibili-follow") {
      return;
    }

    const result = this.currentResult;
    const scan = () => {
      this.batchRenderTimer = null;
      if (this.currentResult !== result) {
        return;
      }
      this.batchCards = this.onScanCards?.() ?? [];
      this.renderBatchCards();
    };

    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(scan, { timeout: 600 });
    } else {
      this.batchRenderTimer = window.setTimeout(scan, 0);
    }
  }

  scheduleManualSearch() {
    clearTimeout(this.searchTimer);
    const query = this.searchInput.value.trim();
    if (!query) {
      this.manualSearchSection.hidden = true;
      return;
    }
    this.manualSearchSection.hidden = false;
    this.searchTimer = setTimeout(() => {
      const results = this.recognizer.search(query, { limit: 10 });
      this.renderManualSearchRows(results);
    }, 180);
  }

  showManualSearch() {
    this.candidateCollapsed = false;
    this.resultListSection.hidden = false;
    if (this.titleCandidateList.childElementCount > 0) {
      this.titleCandidateSection.hidden = false;
    }
    if (this.batchList.childElementCount > 0) {
      this.batchSection.hidden = false;
    }
    this.manualSearchSection.hidden = false;
    this.searchInput.focus();
  }

  requestAi() {
    if (!this.settingsStore.get().ai.enabled) {
      this.openSettings();
      this.showToast("请先启用并配置 DeepSeek");
      this.aiEnabled.focus();
      return;
    }
    this.onRecognize({ source: "manual", ai: "force" });
  }

  showToast(message) {
    this.shadow.querySelector(".scout-toast")?.remove();
    const toast = element("div", {
      className: "scout-toast",
      text: message,
    });
    const container = this.settingsWindow.hidden
      ? this.panel
      : this.settingsWindow;
    container.append(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  open(options = {}) {
    this.closeSettings();
    this.panel.hidden = false;
    this.launcher.hidden = true;
    this.launcher.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => this.positionPanelForOpen());

    if (
      options.recognize === true &&
      !this.busy &&
      typeof this.onRecognize === "function"
    ) {
      Promise.resolve(this.onRecognize({ source: "panel-open" })).catch(
        () => {},
      );
    }
  }

  close() {
    this.panel.hidden = true;
    this.launcher.hidden = false;
    this.launcher.setAttribute("aria-expanded", "false");
  }

  openSettings() {
    this.close();
    this.settingsBackdrop.hidden = false;
    this.settingsWindow.hidden = false;
    this.launcher.setAttribute("aria-expanded", "true");
    if (this.settingsView) {
      this.indexEnabled.focus({ preventScroll: true });
      return;
    }

    this.settingsWindowStatus.textContent = "正在打开设置";
    requestAnimationFrame(() => {
      this.settingsView = this.buildSettingsView();
      this.settingsBody.append(this.settingsView);
      this.settingsWindowStatus.textContent = this.indexState.message;
      this.indexEnabled.focus({ preventScroll: true });
    });
  }

  closeSettings() {
    this.settingsBackdrop.hidden = true;
    this.settingsWindow.hidden = true;
    this.launcher.setAttribute("aria-expanded", "false");
  }

  toggle() {
    if (this.panel.hidden) {
      this.open();
    } else {
      this.close();
    }
  }

  startPanelDrag(event) {
    if (
      event.button !== 0 ||
      event.target?.closest?.("button") ||
      window.matchMedia("(max-width: 520px)").matches
    ) {
      return;
    }

    const rect = this.panel.getBoundingClientRect();
    this.dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      width: rect.width,
      height: rect.height,
    };
    this.panel.classList.add("is-dragging");
    this.panelHeader.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  movePanel(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    const left = clampNumber(
      this.dragState.startLeft + event.clientX - this.dragState.startX,
      8,
      Math.max(8, window.innerWidth - this.dragState.width - 8),
    );
    const top = clampNumber(
      this.dragState.startTop + event.clientY - this.dragState.startY,
      8,
      Math.max(8, window.innerHeight - this.dragState.height - 8),
    );
    this.setPanelPosition(left, top);
    event.preventDefault();
  }

  finishPanelDrag(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }
    this.panelHasCustomPosition = true;
    this.dragState = null;
    this.panel.classList.remove("is-dragging");
    if (this.panelHeader.hasPointerCapture?.(event.pointerId)) {
      this.panelHeader.releasePointerCapture(event.pointerId);
    }
  }

  setPanelPosition(left, top) {
    this.panel.style.left = `${Math.round(left)}px`;
    this.panel.style.top = `${Math.round(top)}px`;
    this.panel.style.right = "auto";
    this.panel.style.bottom = "auto";
  }

  clearPanelPosition() {
    this.panel.style.removeProperty("left");
    this.panel.style.removeProperty("top");
    this.panel.style.removeProperty("right");
    this.panel.style.removeProperty("bottom");
  }

  positionPanelForOpen() {
    if (this.panel.hidden) {
      return;
    }
    if (window.matchMedia("(max-width: 520px)").matches) {
      this.clearPanelPosition();
      return;
    }
    if (this.panelHasCustomPosition) {
      this.clampPanelToViewport();
      return;
    }
    if (this.dockedSide) {
      this.positionPanelNextToDock();
    }
  }

  clampPanelToViewport() {
    const rect = this.panel.getBoundingClientRect();
    const left = clampNumber(
      rect.left,
      8,
      Math.max(8, window.innerWidth - rect.width - 8),
    );
    const top = clampNumber(
      rect.top,
      8,
      Math.max(8, window.innerHeight - rect.height - 8),
    );
    this.setPanelPosition(left, top);
  }

  hideToSide() {
    const rect = this.panel.getBoundingClientRect();
    const side =
      rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
    const top = rect.top;
    this.dockedSide = side;
    this.panelHasCustomPosition = false;
    this.close();
    this.applyLauncherDock(side, top);
  }

  applyLauncherDock(side, top) {
    this.launcher.classList.remove("is-docked-left", "is-docked-right");
    this.launcher.classList.add("is-side-docked", `is-docked-${side}`);
    this.launcher.dataset.docked = side;
    this.launcher.style.top = `${Math.round(
      clampNumber(top, 8, Math.max(8, window.innerHeight - 80)),
    )}px`;
    this.launcher.style.bottom = "auto";
    if (side === "left") {
      this.launcher.style.left = "0";
      this.launcher.style.right = "auto";
    } else {
      this.launcher.style.left = "auto";
      this.launcher.style.right = "0";
    }
  }

  positionPanelNextToDock() {
    const launcherRect = this.launcher.getBoundingClientRect();
    const panelRect = this.panel.getBoundingClientRect();
    const left =
      this.dockedSide === "left"
        ? launcherRect.width + 8
        : window.innerWidth - launcherRect.width - panelRect.width - 8;
    const top = clampNumber(
      launcherRect.top - 8,
      8,
      Math.max(8, window.innerHeight - panelRect.height - 8),
    );
    this.setPanelPosition(
      clampNumber(
        left,
        8,
        Math.max(8, window.innerWidth - panelRect.width - 8),
      ),
      top,
    );
  }

  handleViewportResize() {
    if (window.matchMedia("(max-width: 520px)").matches) {
      this.clearPanelPosition();
      return;
    }
    if (!this.panel.hidden) {
      if (this.panelHasCustomPosition) {
        this.clampPanelToViewport();
      } else if (this.dockedSide) {
        this.positionPanelNextToDock();
      }
    }
    if (this.dockedSide && !this.launcher.hidden) {
      this.applyLauncherDock(
        this.dockedSide,
        this.launcher.getBoundingClientRect().top,
      );
    }
  }
}
