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
import { seasonLabelFromItem } from "../core/season.js";
import {
  DuplicateRecordError,
  FINE_GRAINED_TOKEN_URL,
  GITHUB_PAGES_DOCS_URL,
  TEMPLATE_REPOSITORY,
  TEMPLATE_GENERATE_URL,
  parseGithubRepository,
} from "../core/github-records.js";
import { toErrorMessage } from "../core/network.js";
import { INDEX_STATES } from "../index/index-service.js";
import { detectPageKind } from "../recognizers/page-context.js";

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
    this.recognitionCache = options.recognitionCache;
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
    this.pendingGithubSave = null;
    this.draftSaveTimer = null;
    this.recordLoadRequestId = 0;
    this.recordSaving = false;
    this.githubConnectionChecking = false;
    this.githubTemplateChecking = false;
    this.githubConnectionChecked = false;
    this.githubLastSyncedAt = "";
    this.manualSearchRows = [];
    this.candidateCollapsed = false;
    this.batchCards = [];
    this.batchRenderTimer = null;
    this.batchProgressRenderTimer = null;
    this.batchScanRequestId = 0;
    this.batchSelectedIds = new Set();
    this.batchVisibleLimit = 50;
    this.batchLoading = false;
    this.batchImporting = false;
    this.batchMessage = "";
    this.batchDiagnostics = [];
    this.batchTotal = 0;
    this.batchProgress = null;
    this.pageKind = "generic";
    this.presentationPageKind = null;
    this.coverRequestId = 0;
    this.busy = false;
    this.searchTimer = null;
    this.dragState = null;
    this.resizeState = null;
    this.launcherDragState = null;
    this.suppressLauncherClick = false;
    this.dockedSide = null;
    this.panelHasCustomPosition = false;
    const initialUi = this.settingsStore.get().ui;
    this.panelWidth = initialUi.panelWidth;
    this.panelHeight = initialUi.panelHeight;
    this.currentCoverUrl = null;
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
    this.launcherIconNode = icon(ScanSearch);
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
        on: {
          click: () => {
            if (this.suppressLauncherClick) {
              this.suppressLauncherClick = false;
              return;
            }
            this.toggle();
          },
          pointerdown: (event) => this.startLauncherDrag(event),
          pointermove: (event) => this.moveLauncher(event),
          pointerup: (event) => this.finishLauncherDrag(event),
          pointercancel: (event) => this.finishLauncherDrag(event),
        },
      },
      [this.launcherIconNode, this.launcherLabel, this.launcherDot],
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

    this.brandIconNode = icon(ScanSearch);
    this.panelBrandMark = element(
      "div",
      { className: "scout-brand-mark" },
      [this.brandIconNode],
    );
    this.brandTitle = element("h1", {
      className: "scout-brand-title",
      text: "Bangumi Scout",
    });
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
        this.panelBrandMark,
        element("div", { className: "scout-brand" }, [
          this.brandTitle,
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
        element("button", {
          className: "scout-resize-handle",
          attrs: {
            type: "button",
            title: "拖拽调整面板大小",
            "aria-label": "拖拽调整面板大小",
          },
          on: {
            pointerdown: (event) => this.startPanelResize(event),
            pointermove: (event) => this.movePanelResize(event),
            pointerup: (event) => this.finishPanelResize(event),
            pointercancel: (event) => this.finishPanelResize(event),
          },
        }),
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

    this.coverViewerImage = element("img", {
      className: "scout-cover-viewer-image",
      attrs: { alt: "番剧封面大图" },
    });
    this.coverViewerTitle = element("p", {
      className: "scout-cover-viewer-title",
    });
    this.coverViewer = element(
      "div",
      {
        className: "scout-cover-viewer",
        attrs: {
          hidden: "",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "番剧封面大图",
        },
        on: {
          click: (event) => {
            if (event.target === this.coverViewer) {
              this.closeCoverViewer();
            }
          },
        },
      },
      [
        iconButton("关闭封面大图", X, () => this.closeCoverViewer(), "scout-cover-viewer-close"),
        this.coverViewerImage,
        this.coverViewerTitle,
      ],
    );

    this.root = element("div", { className: "scout-root" }, [
      this.settingsBackdrop,
      this.settingsWindow,
      this.coverViewer,
      this.panel,
      this.launcher,
    ]);
    this.shadow.append(this.root);
    document.documentElement.append(this.host);
    for (const eventName of ["keydown", "keypress", "keyup"]) {
      this.host.addEventListener(
        eventName,
        (event) => {
          event.stopPropagation();
        },
        true,
      );
    }
    this.updatePagePresentation();
    this.applyPanelSize(this.panelWidth, this.panelHeight);

    this.shadow.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!this.coverViewer.hidden) {
          this.closeCoverViewer();
        } else if (!this.settingsWindow.hidden) {
          this.closeSettings();
        } else if (!this.panel.hidden) {
          this.close();
        }
      }
    });
    this.setIndexState(this.indexState);
    window.addEventListener("resize", () => this.handleViewportResize());
  }

  updatePagePresentation() {
    let pageKind = "generic";
    try {
      pageKind = detectPageKind(new URL(location.href));
    } catch {
      // Keep the generic presentation when the page URL is unavailable.
    }
    this.pageKind = pageKind;
    if (pageKind === this.presentationPageKind) {
      return;
    }
    this.presentationPageKind = pageKind;
    const followPage = pageKind === "bilibili-follow";
    const nextIcon = followPage ? List : ScanSearch;
    const refreshIconNode = (node) => {
      const replacement = icon(nextIcon);
      replacement.dataset.icon = followPage ? "list" : "scan-search";
      node.replaceWith(replacement);
      return replacement;
    };
    this.launcherIconNode = refreshIconNode(this.launcherIconNode);
    this.brandIconNode = refreshIconNode(this.brandIconNode);
    this.root.dataset.pageKind = pageKind;
    this.panel.dataset.pageKind = pageKind;
    this.launcher.dataset.pageKind = pageKind;
    this.launcherLabel.textContent = followPage ? "追番" : "番剧";
    this.launcher.title = followPage
      ? "打开 B 站追番批量导入"
      : "打开 Bangumi Scout";
    this.launcher.setAttribute(
      "aria-label",
      followPage ? "打开 B 站追番批量导入" : "打开 Bangumi Scout",
    );
    this.brandTitle.textContent = followPage
      ? "Bangumi Scout · 追番"
      : "Bangumi Scout";
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
      "button",
      {
        className: "scout-cover",
        attrs: {
          type: "button",
          hidden: "",
          title: "查看封面大图",
          "aria-label": "查看封面大图",
        },
        on: { click: () => this.openCoverViewer() },
      },
      [this.coverImage],
    );

    this.rescanIcon = icon(RefreshCw);
    this.rescanButton = button(
      "识别当前页",
      null,
      () =>
        this.onRecognize({
          source: "manual",
          ignoreRecognitionCache: true,
        }),
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

    this.batchList = element("div", {
      className: "scout-list scout-batch-list",
    });
    this.batchTitle = element("span", { text: "追番列表" });
    this.batchSelectionSummary = element("span", {
      className: "scout-batch-summary",
      text: "已选 0 项",
    });
    this.batchStatus = element("p", {
      className: "scout-batch-status",
      attrs: { role: "status", "aria-live": "polite" },
    });
    this.batchProgressLabel = element("span", {
      className: "scout-batch-progress-label",
      text: "正在准备追番列表",
    });
    this.batchProgressValue = element("span", {
      className: "scout-batch-progress-value",
      text: "0%",
    });
    this.batchProgressFill = element("span", {
      className: "scout-batch-progress-fill",
    });
    this.batchProgressBar = element(
      "div",
      {
        className: "scout-batch-progress-bar",
        dataset: { mode: "indeterminate" },
      },
      [this.batchProgressFill],
    );
    this.batchProgressPanel = element(
      "div",
      {
        className: "scout-batch-progress",
        attrs: {
          role: "progressbar",
          "aria-label": "B 站追番导入进度",
          hidden: "",
        },
      },
      [
        element("div", { className: "scout-batch-progress-copy" }, [
          this.batchProgressLabel,
          this.batchProgressValue,
        ]),
        this.batchProgressBar,
      ],
    );
    this.batchActionNote = element("p", {
      className: "scout-batch-note",
      text: "新记录默认未评分、无评价；已存在的番剧会自动跳过。",
    });
    this.batchSelectAllButton = button(
      "全选可导入",
      Check,
      () => this.toggleAllBatchCards(),
    );
    this.batchImportButton = button(
      "导入并同步",
      CloudDownload,
      () => this.syncSelectedBatchCards(),
      { variant: "primary", disabled: true },
    );
    this.batchImportButtonTextNode = this.batchImportButton.lastChild;
    this.batchSection = element("section", { className: "scout-section" }, [
      element("div", { className: "scout-batch-heading" }, [
        element("h3", { className: "scout-section-title" }, [
          icon(ScanSearch),
          this.batchTitle,
        ]),
        this.batchSelectionSummary,
      ]),
      this.batchProgressPanel,
      this.batchList,
      this.batchStatus,
      this.batchActionNote,
      element("div", { className: "scout-batch-toolbar" }, [
        this.batchSelectAllButton,
        this.batchImportButton,
      ]),
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
        focus: () => this.enterRecordReviewEdit(),
        blur: () => setTimeout(() => this.renderRecordReview(), 80),
        input: () => {
          this.enterRecordFocusMode();
          this.recordDirty = true;
          this.recordStatus.textContent = "正在缓存本机草稿";
          this.clearDuplicateWarning();
          this.scheduleRecognitionDraftSave();
        },
      },
    });
    this.reviewDisplayText = element("span", {
      className: "scout-review-display-text",
    });
    this.reviewDisplay = element(
      "blockquote",
      {
        className: "scout-review-display",
        attrs: {
          hidden: "",
          tabindex: "0",
          role: "button",
          "aria-label": "编辑短评",
        },
        on: {
          click: () => this.enterRecordReviewEdit(),
          keydown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              this.enterRecordReviewEdit();
            }
          },
        },
      },
      [
        element("span", {
          className: "scout-review-display-mark",
          text: "“",
          attrs: { "aria-hidden": "true" },
        }),
        this.reviewDisplayText,
      ],
    );
    this.recordStatus = element("span", {
      className: "scout-footer-status",
      text: "尚未填写",
    });
    this.saveRecordButton = button(
      "同步到 GitHub",
      Save,
      () => this.savePersonalRecord(),
      { variant: "primary" },
    );
    this.saveRecordButtonTextNode = this.saveRecordButton.lastChild;
    this.clearRecordButton = button(
      "清除草稿",
      Trash2,
      () => this.clearPersonalRecordDraft(),
    );
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
    this.duplicateWarningSummary = element("p", {
      className: "scout-duplicate-summary",
      text: "仓库中已有相似记录。季度不同或只是同一作品的另一版本时，请取消同步。",
    });
    this.duplicateWarningList = element("div", {
      className: "scout-duplicate-list",
    });
    this.cancelDuplicateButton = button(
      "取消同步",
      X,
      () => this.cancelDuplicateSync(),
    );
    this.confirmDuplicateButton = button(
      "仍然同步",
      CloudDownload,
      () => this.confirmDuplicateSync(),
      { variant: "primary" },
    );
    this.duplicateWarning = element(
      "div",
      {
        className: "scout-duplicate-warning",
        attrs: { hidden: "", role: "alert" },
      },
      [
        element("div", { className: "scout-duplicate-heading" }, [
          icon(CircleHelp),
          element("strong", { text: "发现疑似重复番剧" }),
        ]),
        this.duplicateWarningSummary,
        this.duplicateWarningList,
        element("div", { className: "scout-duplicate-actions" }, [
          this.cancelDuplicateButton,
          this.confirmDuplicateButton,
        ]),
      ],
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
          element("span", { className: "scout-range-label", text: "我的评分" }),
          this.recordRatingValue,
        ]),
        ratingOptions,
        this.reviewInput,
        this.reviewDisplay,
        element("div", { className: "scout-record-footer" }, [
          this.recordStatus,
          element("div", { className: "scout-record-actions" }, [
            this.clearRecordButton,
            this.saveRecordButton,
          ]),
        ]),
        this.recordNote,
        this.recordRemoteLink,
        this.duplicateWarning,
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
      placeholder: "https://github.com/你的用户名/my-anime-life",
      on: {
        input: () => {
          this.githubConnectionChecked = false;
          this.syncGithubRepositoryLinks();
          this.updateGithubSetupChecklist();
        },
        change: () => {
          this.githubConnectionChecked = false;
          this.syncGithubRepositoryLinks();
          this.updateGithubSetupChecklist();
        },
      },
    });
    this.githubBranch = element("input", {
      type: "text",
      name: "github.branch",
      autocomplete: "off",
      placeholder: "main",
      on: {
        input: () => {
          this.githubConnectionChecked = false;
          this.updateGithubSetupChecklist();
        },
      },
    });
    this.githubToken = element("input", {
      type: "password",
      name: "github.token",
      autocomplete: "off",
      placeholder: "github_pat_...",
      on: {
        input: () => {
          this.githubConnectionChecked = false;
          this.updateGithubSetupChecklist();
        },
      },
    });
    this.githubConnectionStatus = element("p", {
      className: "scout-note",
      text: "尚未检查仓库连接。",
    });
    this.githubTemplateStatus = element("p", {
      className: "scout-note",
      attrs: {
        "aria-live": "polite",
      },
      text: "模板状态尚未检查。创建个人仓库前建议先确认。",
    });
    this.githubTemplateCheckButton = button(
      "检查模板",
      RefreshCw,
      () => this.runGithubTemplateCheck(),
    );
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
    const setupStep = (label) => {
      const status = element("span", {
        className: "scout-setup-state",
        text: "待完成",
      });
      return {
        row: element("div", { className: "scout-setup-step" }, [
          icon(Check),
          element("span", { text: label }),
          status,
        ]),
        status,
      };
    };
    this.githubRepositoryStep = setupStep("填写个人数据仓库");
    this.githubTokenStep = setupStep("填写仓库专用 Token");
    this.githubConnectionStep = setupStep("检查仓库连接");
    this.githubSyncStep = setupStep("完成首次同步");
    this.githubSetupSummary = element("p", {
      className: "scout-setup-summary",
      text: "配置进度 0/4",
    });
    this.githubSetupChecklist = element("div", {
      className: "scout-setup-checklist",
      attrs: { "aria-label": "GitHub 配置进度" },
    }, [
      this.githubRepositoryStep.row,
      this.githubTokenStep.row,
      this.githubConnectionStep.row,
      this.githubSyncStep.row,
      this.githubSetupSummary,
    ]);

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
            element("h4", { text: "先区分两个仓库" }),
            element("div", { className: "scout-repo-roles" }, [
              element("div", { className: "scout-repo-role" }, [
                element("span", {
                  className: "scout-repo-role-label",
                  text: "公开模板仓库",
                }),
                element("strong", { text: TEMPLATE_REPOSITORY }),
                element("small", {
                  text: "只提供代码、页面和脚本，不要填写到同步地址。",
                }),
              ]),
              element("div", {
                className: "scout-repo-role scout-repo-role-own",
              }, [
                element("span", {
                  className: "scout-repo-role-label",
                  text: "你的个人数据仓库",
                }),
                element("strong", { text: "owner/my-anime-life" }),
                element("small", {
                  text: "评分、评价和 JSONL 记录都保存到这里。",
                }),
              ]),
            ]),
            element("h4", { text: "四步完成配置" }),
            element("ol", {}, [
              element("li", {
                text: "点击“用模板新建”，创建自己的个人数据仓库。推荐命名为 my-anime-life；不要直接 Fork 模板。",
              }),
              element("li", {
                text: "创建 Fine-grained Token，只授权这个个人数据仓库，权限设为 Contents: Read and write；Token 不是账户密码。",
              }),
              element("li", {
                text: "填写个人数据仓库地址、分支和 Token。Token 只保存在本机 Tampermonkey 存储中。",
              }),
              element("li", {
                text: "点击“检查连接”，成功后保存。如果希望发布展示页，再把仓库 Pages 来源设为 GitHub Actions。",
              }),
            ]),
            element("div", { className: "scout-onboarding-actions" }, [
              this.githubTemplateCheckButton,
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
            this.githubTemplateStatus,
            this.githubSetupChecklist,
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
            text: "同步地址必须填写你从模板生成的个人数据仓库，不能填写公开模板仓库。Fork 会复制公开分支和旧提交，无法只排除数据文件，因此不推荐。",
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

  populateSettings(settings, options = {}) {
    const preserveGithubConnection =
      options.preserveGithubConnection === true &&
      this.githubConnectionChecked;
    this.githubConnectionChecked = preserveGithubConnection;
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
    if (!preserveGithubConnection) {
      this.githubConnectionStatus.textContent = this.githubLastSyncedAt
        ? `上次 GitHub 保存：${formatRecordTime(this.githubLastSyncedAt)}`
        : "尚未检查仓库连接。";
      delete this.githubConnectionStatus.dataset.tone;
    }
    this.githubTemplateStatus.textContent =
      "模板状态尚未检查。创建个人仓库前建议先确认。";
    delete this.githubTemplateStatus.dataset.tone;
    this.syncCustomUrlVisibility();
    this.syncSettingsDisabledState();
    this.syncGithubRepositoryLinks();
    this.syncGithubDisabledState();
    this.updateGithubSetupChecklist();
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

  setGithubSetupStep(step, state, text) {
    step.row.dataset.state = state;
    step.status.textContent = text;
  }

  updateGithubSetupChecklist() {
    if (!this.githubSetupChecklist) {
      return;
    }

    let repository = null;
    let repositoryState = "pending";
    let repositoryText = "待填写";
    try {
      repository = parseGithubRepository(this.githubRepositoryUrl.value);
      if (
        repository.fullName.toLocaleLowerCase() ===
        TEMPLATE_REPOSITORY.toLocaleLowerCase()
      ) {
        repositoryState = "bad";
        repositoryText = "不能使用模板仓库";
      } else {
        repositoryState = "ready";
        repositoryText = repository.fullName;
      }
    } catch {
      repositoryText = this.githubRepositoryUrl.value.trim()
        ? "地址格式有误"
        : "待填写";
    }

    const tokenReady = Boolean(this.githubToken.value.trim());
    const connectionReady =
      this.githubConnectionChecked &&
      repositoryState === "ready" &&
      tokenReady;
    const syncReady = Boolean(this.githubLastSyncedAt);
    this.setGithubSetupStep(
      this.githubRepositoryStep,
      repositoryState,
      repositoryText,
    );
    this.setGithubSetupStep(
      this.githubTokenStep,
      tokenReady ? "ready" : "pending",
      tokenReady ? "已填写" : "待填写",
    );
    this.setGithubSetupStep(
      this.githubConnectionStep,
      connectionReady ? "ready" : "pending",
      connectionReady ? "连接正常" : "待检查",
    );
    this.setGithubSetupStep(
      this.githubSyncStep,
      syncReady ? "ready" : "pending",
      syncReady ? formatRecordTime(this.githubLastSyncedAt) : "待完成",
    );

    const completed = [
      repositoryState === "ready",
      tokenReady,
      connectionReady,
      syncReady,
    ].filter(Boolean).length;
    this.githubSetupSummary.textContent = `配置进度 ${completed}/4`;
    if (repositoryState === "bad") {
      this.githubSetupSummary.textContent += " · 同步地址不能是公开模板仓库";
    }
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
    this.populateSettings(settings, {
      preserveGithubConnection: true,
    });
    if (options.quiet !== true) {
      this.showToast("设置已保存");
    }
    if (options.notify !== false) {
      this.onSettingsSaved?.(settings, previous);
    }
    if (
      this.currentResult?.context?.pageKind === "bilibili-follow" &&
      this.batchSection
    ) {
      this.renderBatchCards();
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
    if (
      this.currentResult?.context?.pageKind === "bilibili-follow" &&
      this.batchSection
    ) {
      this.renderBatchCards();
    }
  }

  async runGithubTemplateCheck() {
    if (!this.githubRecords || this.githubTemplateChecking) {
      return;
    }
    this.githubTemplateChecking = true;
    this.githubTemplateCheckButton.classList.add("is-loading");
    this.githubTemplateCheckButton.disabled = true;
    this.githubTemplateStatus.textContent = "正在检查公开模板仓库…";
    delete this.githubTemplateStatus.dataset.tone;
    try {
      const result = await this.githubRecords.checkTemplateRepository();
      if (result.ready && result.defaultBranch === "main") {
        this.githubTemplateStatus.textContent =
          `${result.fullName} 已公开并启用 Template · 默认分支 main`;
        this.githubTemplateStatus.dataset.tone = "good";
      } else {
        const issues = [];
        if (result.private) {
          issues.push("仓库不是公开状态");
        }
        if (!result.isTemplate) {
          issues.push("尚未启用 Template repository");
        }
        if (result.defaultBranch !== "main") {
          issues.push(`默认分支为 ${result.defaultBranch}`);
        }
        this.githubTemplateStatus.textContent =
          `模板尚未就绪：${issues.join("；")}`;
        this.githubTemplateStatus.dataset.tone = "bad";
      }
    } catch (error) {
      this.githubTemplateStatus.textContent =
        `模板检查失败：${toErrorMessage(error)}`;
      this.githubTemplateStatus.dataset.tone = "bad";
    } finally {
      this.githubTemplateChecking = false;
      this.githubTemplateCheckButton.classList.remove("is-loading");
      this.githubTemplateCheckButton.disabled = false;
    }
  }

  async runGithubConnectionCheck() {
    if (!this.githubRecords || this.githubConnectionChecking) {
      return;
    }
    const token = this.githubToken.value.trim();
    if (!token) {
      this.githubConnectionChecked = false;
      this.githubConnectionStatus.textContent =
        "请先填写仅限个人数据仓库的细粒度 Token。未认证的 GitHub API 很容易触发限流。";
      this.githubConnectionStatus.dataset.tone = "bad";
      this.githubToken.focus();
      this.updateGithubSetupChecklist();
      return;
    }
    try {
      const repository = parseGithubRepository(
        this.githubRepositoryUrl.value,
      );
      if (
        repository.fullName.toLocaleLowerCase() ===
        TEMPLATE_REPOSITORY.toLocaleLowerCase()
      ) {
        this.githubConnectionChecked = false;
        this.githubConnectionStatus.textContent =
          "当前填写的是公开模板仓库。请先用“用模板新建”创建个人数据仓库，再填写新仓库地址。";
        this.githubConnectionStatus.dataset.tone = "bad";
        this.updateGithubSetupChecklist();
        return;
      }
    } catch (error) {
      this.githubConnectionChecked = false;
      this.githubConnectionStatus.textContent = toErrorMessage(error);
      this.githubConnectionStatus.dataset.tone = "bad";
      this.updateGithubSetupChecklist();
      return;
    }

    this.githubConnectionChecking = true;
    this.githubCheckButton.classList.add("is-loading");
    this.githubConnectionStatus.textContent = "正在检查 GitHub 仓库…";
    delete this.githubConnectionStatus.dataset.tone;
    this.syncGithubDisabledState();
    try {
      const result = await this.githubRecords.checkConnection({
        enabled: this.githubEnabled.checked,
        repositoryUrl: this.githubRepositoryUrl.value,
        branch: this.githubBranch.value,
        token,
      });
      if (result.canWrite === false) {
        this.githubConnectionChecked = false;
        this.githubConnectionStatus.textContent =
          "仓库可访问，但 Token 没有 Contents 写权限。请编辑 Token，将 Contents 设为 Read and write。";
        this.githubConnectionStatus.dataset.tone = "bad";
        return;
      }
      this.githubConnectionChecked = true;
      const visibility = result.private ? "私有仓库" : "公开仓库";
      const accessLabel =
        result.canWrite === true
          ? "可读写"
          : "可访问 · 写权限待实际同步确认";
      this.githubConnectionStatus.textContent =
        `${result.fullName} ${accessLabel} · ${visibility} · 默认分支 ${result.defaultBranch}`;
      this.githubConnectionStatus.dataset.tone = "good";
    } catch (error) {
      this.githubConnectionChecked = false;
      this.githubConnectionStatus.textContent =
        `连接失败：${toErrorMessage(error)}`;
      this.githubConnectionStatus.dataset.tone = "bad";
    } finally {
      this.githubConnectionChecking = false;
      this.githubCheckButton.classList.remove("is-loading");
      this.syncGithubDisabledState();
      this.updateGithubSetupChecklist();
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

  setResult(result, options = {}) {
    this.currentResult = result;
    const cachedDraft = options.ignoreCachedSelection
      ? null
      : this.recognitionCache?.get(location.href) ?? null;
    const cachedSelection = cachedDraft?.selectedResult?.item?.id
      ? cachedDraft.selectedResult
      : cachedDraft?.item?.id
        ? {
            item: cachedDraft.item,
            confidence: 0,
            matchedBy: ["local-cache"],
          }
        : null;
    this.selectedResult = cachedSelection
      ? {
          ...cachedSelection,
          bilibiliMetadata:
            result.bilibiliMetadata ??
            cachedSelection.bilibiliMetadata ??
            null,
          manualSelection: true,
          selectionSource: "local-cache",
        }
      : result.best
      ? {
          ...result.best,
          bilibiliMetadata: result.bilibiliMetadata ?? null,
          selectionSource: "automatic",
        }
      : null;
    this.recordDirty = false;
    this.candidateCollapsed = false;
    this.batchCards = [];
    this.batchSelectedIds.clear();
    this.batchVisibleLimit = 50;
    this.batchLoading = false;
    this.batchImporting = false;
    this.batchMessage = "";
    this.batchDiagnostics = [];
    this.batchTotal = 0;
    this.batchProgress = null;
    clearTimeout(this.batchProgressRenderTimer);
    this.batchProgressRenderTimer = null;
    this.batchScanRequestId += 1;
    this.renderRecognitionResult(result);
    if (this.recordItem?.id) {
      this.persistRecognitionDraft({ silent: true });
    }
    if (cachedSelection) {
      this.showToast("已恢复本机尚未同步的识别草稿");
    }
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
        seasonLabelFromItem(item),
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
    this.currentCoverUrl = safeUrl;
    this.coverFrame.disabled = !safeUrl;
    this.coverFrame.classList.toggle("has-cover", Boolean(safeUrl));
    this.coverFrame.hidden = !safeUrl;
    this.resultHead.classList.toggle("has-cover", Boolean(safeUrl));
    if (safeUrl) {
      this.coverImage.src = safeUrl;
      this.coverImage.alt = this.recordItem
        ? `${itemDisplayTitle(this.recordItem)} 封面`
        : "番剧封面";
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
    const directUrl = normalizeCoverUrl(item?.coverUrl || pageCoverUrl);
    if (item && directUrl && !item.coverUrl) {
      item.coverUrl = directUrl;
    }
    this.setSelectedCover(directUrl);
    if (!item || item?.coverUrl || pageCoverUrl || !this.coverResolver) {
      return;
    }

    Promise.resolve(this.coverResolver(item))
      .then((url) => {
        if (requestId === this.coverRequestId && url) {
          item.coverUrl = normalizeCoverUrl(url);
          this.setSelectedCover(item.coverUrl);
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
    const usesCurrentBilibiliItem =
      row.item.id === this.currentResult?.best?.item?.id;
    this.selectedResult = {
      ...row,
      bilibiliMetadata: usesCurrentBilibiliItem
        ? this.currentResult?.bilibiliMetadata ?? null
        : null,
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

  scheduleRecognitionDraftSave(delay = 300) {
    clearTimeout(this.draftSaveTimer);
    if (!this.recordItem?.id) {
      return;
    }
    this.draftSaveTimer = setTimeout(() => {
      this.draftSaveTimer = null;
      this.persistRecognitionDraft();
    }, delay);
  }

  persistRecognitionDraft(options = {}) {
    const item = this.recordItem;
    if (!item?.id) {
      return null;
    }
    const record = {
      rating: this.recordRating,
      review: this.reviewInput.value,
    };
    const saved = this.personalRecordStore?.save(item.id, record);
    const draft = this.recognitionCache?.save(location.href, {
      item,
      selectedResult:
        this.selectedResult?.item?.id === item.id
          ? this.selectedResult
          : null,
      recognitionResult: this.currentResult,
      ...record,
    });
    this.recordDirty = false;
    if (!options.silent) {
      const savedAt = formatRecordTime(saved?.updatedAt || draft?.updatedAt);
      this.recordStatus.textContent = savedAt
        ? `已缓存本机 · ${savedAt}`
        : "已缓存本机草稿";
    }
    return draft;
  }

  clearPersonalRecordDraft() {
    const item = this.recordItem;
    if (!item?.id) {
      return;
    }
    clearTimeout(this.draftSaveTimer);
    this.draftSaveTimer = null;
    this.personalRecordStore?.remove(item.id);
    this.recognitionCache?.clear(location.href);
    this.recordRating = null;
    this.reviewInput.value = "";
    this.renderRecordReview();
    this.recordDirty = false;
    this.clearDuplicateWarning();
    this.syncRecordRating();
    this.recordStatus.textContent = "本机草稿已清除";
    this.showToast("已清除当前番剧的本机草稿");
  }

  selectRating(rating) {
    if (!this.recordItem || this.busy) {
      return;
    }
    this.recordRating = this.recordRating === rating ? null : rating;
    this.enterRecordFocusMode();
    this.recordDirty = true;
    this.clearDuplicateWarning();
    this.recordStatus.textContent = "正在缓存本机草稿";
    this.syncRecordRating();
    this.scheduleRecognitionDraftSave();
  }

  enterRecordFocusMode() {
    if (this.candidateCollapsed || !this.recordItem?.id) {
      return;
    }
    this.candidateCollapsed = true;
    this.resultListSection.hidden = true;
    this.titleCandidateSection.hidden = true;
    this.manualSearchSection.hidden = true;
    this.batchSection.hidden = true;
    this.recordSection.hidden = false;
  }

  enterRecordReviewEdit() {
    if (this.reviewInput.disabled || !this.recordItem) {
      return;
    }
    this.reviewDisplay.hidden = true;
    this.reviewInput.hidden = false;
    this.reviewInput.focus();
    const end = this.reviewInput.value.length;
    this.reviewInput.setSelectionRange?.(end, end);
  }

  renderRecordReview() {
    const text = this.reviewInput.value.trim();
    if (!text) {
      this.reviewDisplay.hidden = true;
      this.reviewInput.hidden = false;
      return;
    }
    this.reviewDisplayText.textContent = text;
    this.reviewInput.hidden = true;
    this.reviewDisplay.hidden = false;
  }

  openCoverViewer() {
    if (!this.currentCoverUrl) {
      return;
    }
    this.coverViewerImage.src = this.currentCoverUrl;
    this.coverViewerTitle.textContent = this.recordItem
      ? itemDisplayTitle(this.recordItem)
      : "";
    this.coverViewer.hidden = false;
    this.coverViewer.querySelector("button")?.focus({ preventScroll: true });
  }

  closeCoverViewer() {
    this.coverViewer.hidden = true;
    this.coverViewerImage.removeAttribute("src");
    this.coverFrame.focus({ preventScroll: true });
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
      if (this.recordDirty) {
        this.persistRecognitionDraft({ silent: true });
      }
      clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = null;
      this.recordLoadRequestId += 1;
      this.clearDuplicateWarning();
      this.recordItem = item ?? null;
      this.recordRemoteRecord = null;
      this.setRecordRemoteLink(null);
      const cachedDraft = item?.id
        ? this.recognitionCache?.get(location.href)
        : null;
      const matchingDraft =
        cachedDraft?.item?.id === item?.id ? cachedDraft : null;
      const record =
        matchingDraft ??
        (item?.id ? this.personalRecordStore?.get(item.id) : null);
      this.recordRating = record?.rating ?? null;
      this.recordDirty = false;
      this.reviewInput.value = record?.review ?? "";
      this.renderRecordReview();
      this.recordStatus.textContent =
        matchingDraft
          ? "已恢复本机未同步草稿"
          : record?.rating || record?.review
          ? "已载入本地草稿"
          : "尚未填写";
      if (item?.id && !matchingDraft) {
        this.recognitionCache?.save(location.href, {
          item,
          selectedResult:
            this.selectedResult?.item?.id === item.id
              ? this.selectedResult
              : null,
          recognitionResult: this.currentResult,
          rating: record?.rating ?? null,
          review: record?.review ?? "",
        });
      }
    }

    const enabled = Boolean(item?.id && recordStoreReady);
    const displayTitle = itemDisplayTitle(item);
    this.recordSection.hidden = !enabled;
    this.recordItemLabel.textContent = displayTitle || "先选定一个候选";
    this.recordItemLabel.title = displayTitle;
    if (this.currentCoverUrl) {
      this.coverImage.alt = displayTitle ? `${displayTitle} 封面` : "番剧封面";
      this.coverFrame.setAttribute(
        "aria-label",
        `${displayTitle || "番剧"}封面大图`,
      );
    }
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
        href = `${repository.webUrl}/blob/${branch}/data/anime.jsonl`;
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
      ? "同步到 GitHub"
      : "保存草稿";
    this.reviewInput.disabled = !enabled || this.recordSaving;
    this.saveRecordButton.disabled = !enabled || this.recordSaving;
    if (this.clearRecordButton) {
      this.clearRecordButton.disabled = !enabled || this.recordSaving;
    }
    for (const ratingButton of this.ratingButtons) {
      ratingButton.disabled = !enabled || this.recordSaving;
    }
    if (this.cancelDuplicateButton) {
      this.cancelDuplicateButton.disabled = this.recordSaving;
    }
    if (this.confirmDuplicateButton) {
      this.confirmDuplicateButton.disabled = this.recordSaving;
    }
    if (writable) {
      this.recordNote.textContent =
        "评分和短评会自动缓存到本机；点击同步后才会写入 GitHub，失败时缓存保留。";
    } else if (configured) {
      this.recordNote.textContent =
        "评分和短评会自动缓存到本机。仓库已配置但缺少 Token，请在扩展设置中补充。";
    } else {
      this.recordNote.textContent =
        "评分和短评会自动缓存到本机；在扩展设置中连接 GitHub 后可同步。";
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
    this.renderRecordReview();
    this.recordDirty = false;
    clearTimeout(this.draftSaveTimer);
    this.draftSaveTimer = null;
    this.recognitionCache?.clear(location.href);
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
    clearTimeout(this.draftSaveTimer);
    this.draftSaveTimer = null;
    const item = this.recordItem;
    const selectedResult =
      this.selectedResult?.item?.id === item.id ? this.selectedResult : null;
    const rating = this.recordRating;
    const review = this.reviewInput.value;
    await this.resolveItemCover(item);
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
    this.recognitionCache?.save(location.href, {
      item,
      selectedResult,
      recognitionResult: this.currentResult,
      rating,
      review,
      updatedAt: saved.updatedAt,
    });
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

    const saveRequest = {
      item,
      selectedResult,
      aiResult: this.currentResult?.aiResult ?? null,
      rating,
      review,
    };
    this.pendingGithubSave = saveRequest;
    await this.syncGithubRecord(saveRequest);
  }

  async syncGithubRecord(saveRequest, options = {}) {
    if (!saveRequest || !this.githubRecords) {
      return;
    }
    this.recordSaving = true;
    this.syncRecordGithubState();
    this.recordStatus.textContent = options.allowDuplicates
      ? "本地草稿已保存 · 已确认重复，正在同步"
      : "本地草稿已保存 · 正在同步到 GitHub";
    try {
      const remote = await this.githubRecords.saveRecord({
        ...saveRequest,
        allowDuplicates: Boolean(options.allowDuplicates),
      });
      this.recordRemoteRecord = remote;
      this.setRecordRemoteLink(remote);
      this.pendingGithubSave = null;
      this.clearDuplicateWarning();
      clearTimeout(this.draftSaveTimer);
      this.draftSaveTimer = null;
      this.recognitionCache?.clear(location.href);
      if (saveRequest.item?.id) {
        this.personalRecordStore?.remove(saveRequest.item.id);
      }
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
      if (error instanceof DuplicateRecordError) {
        this.pendingGithubSave = saveRequest;
        this.renderDuplicateWarning(error);
        this.recordStatus.textContent =
          "本地草稿已保存 · 等待确认疑似重复";
        this.showToast(error.message);
        return;
      }
      this.pendingGithubSave = null;
      this.clearDuplicateWarning();
      this.recordStatus.textContent =
        "本地草稿已保存 · GitHub 同步失败";
      this.showToast(`GitHub 保存失败：${toErrorMessage(error)}`);
    } finally {
      this.recordSaving = false;
      this.syncRecordGithubState();
    }
  }

  renderDuplicateWarning(error) {
    this.duplicateWarningSummary.textContent =
      `扫描 ${error.scannedCount} 条记录后发现 ${error.duplicates.length} 条可能重复。` +
      "不同季度属于不同番剧，请确认后再同步。";
    this.duplicateWarningList.replaceChildren();
    for (const duplicate of error.duplicates) {
      const season = duplicate.season?.label
        ? ` · ${duplicate.season.label}`
        : "";
      this.duplicateWarningList.append(
        element("div", { className: "scout-duplicate-row" }, [
          element("div", { className: "scout-duplicate-copy" }, [
            element("strong", {
              text: `${duplicate.title || duplicate.id}${season}`,
            }),
            element("span", {
              text: `${duplicate.reason} · ${formatConfidence(
                duplicate.score,
              )}`,
            }),
          ]),
          element("code", { text: duplicate.id }),
        ]),
      );
    }
    this.duplicateWarning.hidden = false;
    this.cancelDuplicateButton.disabled = this.recordSaving;
    this.confirmDuplicateButton.disabled = this.recordSaving;
  }

  clearDuplicateWarning() {
    if (!this.duplicateWarning) {
      return;
    }
    this.pendingGithubSave = null;
    this.duplicateWarning.hidden = true;
    this.duplicateWarningList.replaceChildren();
  }

  cancelDuplicateSync() {
    this.pendingGithubSave = null;
    this.clearDuplicateWarning();
    this.recordStatus.textContent = "本地草稿已保留 · 已取消 GitHub 同步";
    this.showToast("已取消同步，本地草稿仍然保留");
  }

  confirmDuplicateSync() {
    const pending = this.pendingGithubSave;
    if (!pending || this.recordSaving) {
      return;
    }
    this.syncGithubRecord(pending, { allowDuplicates: true });
  }

  renderDiagnostics(diagnostics) {
    this.diagnosticsList.replaceChildren();
    const entries = (diagnostics ?? []).filter(Boolean);
    this.diagnostics.hidden = entries.length === 0;
    for (const entry of entries) {
      this.diagnosticsList.append(element("li", { text: entry }));
    }
  }

  batchGithubWritable() {
    const settings = this.settingsStore.get();
    return Boolean(
      this.githubRecords &&
        this.githubRecordConfig(settings) &&
        String(settings.github?.token ?? "").trim(),
    );
  }

  batchImportableCards() {
    return this.batchCards.filter((card) => card.selectedResult?.item?.id);
  }

  renderBatchProgress() {
    const progress = this.batchProgress;
    const visible = Boolean(
      (this.batchLoading || this.batchImporting) &&
        (progress || this.batchImporting),
    );
    if (!this.batchProgressPanel) {
      return;
    }
    this.batchProgressPanel.hidden = !visible;
    if (!visible) {
      return;
    }

    let label = "正在同步到 GitHub";
    let value = "请稍候";
    let percent = null;
    if (!this.batchImporting && progress?.phase === "fetch") {
      const fetched = Number(progress.itemCount) || 0;
      const total = Number(progress.total) || 0;
      label = `正在读取追番列表 · 已读取 ${Number(progress.fetchedPages) || 0} 页`;
      value = total > 0 ? `${fetched}/${total}` : `${fetched} 部`;
    } else if (!this.batchImporting && progress?.phase === "matching") {
      const processed = Number(progress.processed) || 0;
      const totalItems = Number(progress.totalItems) || 0;
      const matched = Number(progress.matched) || 0;
      label = `正在匹配本地索引 · 已命中 ${matched}`;
      value = totalItems > 0 ? `${processed}/${totalItems}` : "准备中";
      percent =
        totalItems > 0 ? Math.round((processed / totalItems) * 100) : null;
    }

    this.batchProgressPanel.setAttribute("aria-label", label);
    this.batchProgressLabel.textContent = label;
    this.batchProgressValue.textContent =
      percent === null ? value : `${value} · ${percent}%`;
    this.batchProgressBar.dataset.mode =
      percent === null ? "indeterminate" : "determinate";
    this.batchProgressFill.style.width =
      percent === null ? "" : `${Math.max(0, Math.min(100, percent))}%`;
    if (percent === null) {
      this.batchProgressPanel.removeAttribute("aria-valuemin");
      this.batchProgressPanel.removeAttribute("aria-valuemax");
      this.batchProgressPanel.removeAttribute("aria-valuenow");
    } else {
      this.batchProgressPanel.setAttribute("aria-valuemin", "0");
      this.batchProgressPanel.setAttribute("aria-valuemax", "100");
      this.batchProgressPanel.setAttribute("aria-valuenow", String(percent));
    }
  }

  toggleBatchCard(mediaId, checked) {
    if (checked) {
      this.batchSelectedIds.add(String(mediaId));
    } else {
      this.batchSelectedIds.delete(String(mediaId));
    }
    this.batchMessage = "";
    this.renderBatchCards();
  }

  toggleAllBatchCards() {
    const importableIds = this.batchImportableCards().map((card) =>
      String(card.mediaId),
    );
    const allSelected =
      importableIds.length > 0 &&
      importableIds.every((id) => this.batchSelectedIds.has(id));
    this.batchSelectedIds = allSelected
      ? new Set()
      : new Set(importableIds);
    this.batchMessage = "";
    this.renderBatchCards();
  }

  renderBatchCards() {
    if (this.currentResult?.context?.pageKind !== "bilibili-follow") {
      this.batchSection.hidden = true;
      return;
    }

    const cards = this.batchCards;
    const importable = this.batchImportableCards();
    const importableIds = new Set(importable.map((card) => String(card.mediaId)));
    for (const mediaId of [...this.batchSelectedIds]) {
      if (!importableIds.has(mediaId)) {
        this.batchSelectedIds.delete(mediaId);
      }
    }

    this.batchSection.hidden = false;
    this.batchList.replaceChildren();
    this.renderBatchProgress();
    const matched = importable.length;
    const totalSuffix =
      this.batchTotal > cards.length
        ? ` · 接口共 ${this.batchTotal} 部`
        : "";
    this.batchTitle.textContent = this.batchLoading
      ? cards.length > 0
        ? `正在读取追番列表 (${cards.length}${this.batchTotal > cards.length ? `/${this.batchTotal}` : ""})`
        : "正在读取追番列表"
      : `追番列表 (${matched}/${cards.length})${totalSuffix}`;
    this.batchSelectionSummary.textContent =
      `已选 ${this.batchSelectedIds.size} 项 · 可导入 ${matched}`;

    if (this.batchLoading && cards.length === 0) {
      this.batchList.append(
        element(
          "div",
          {
            className: "scout-batch-skeleton",
            attrs: { "aria-hidden": "true" },
          },
          Array.from({ length: 4 }, () =>
            element("div", { className: "scout-batch-skeleton-row" }, [
              element("span", { className: "scout-batch-skeleton-check" }),
              element("span", { className: "scout-batch-skeleton-copy" }, [
                element("span", { className: "scout-batch-skeleton-title" }),
                element("span", { className: "scout-batch-skeleton-meta" }),
              ]),
              element("span", { className: "scout-batch-skeleton-tail" }),
            ]),
          ),
        ),
      );
      this.batchList.append(
        element("p", {
          className: "scout-batch-message",
          text: "正在分批读取并匹配，列表会随进度更新。",
        }),
      );
    } else if (!cards.length) {
      this.batchList.append(
        element("p", {
          className: "scout-batch-message",
          text: "没有读取到可导入的追番。",
        }),
      );
    } else {
      for (const card of cards.slice(0, this.batchVisibleLimit)) {
        const mediaId = String(card.mediaId);
        const selectable = Boolean(card.selectedResult?.item?.id);
        const selected = selectable && this.batchSelectedIds.has(mediaId);
        const displayTitle = card.item
          ? itemDisplayTitle(card.item)
          : card.title;
        const meta = card.item
          ? [
              card.item.year,
              seasonLabelFromItem(card.item),
              card.item.names?.find(
                (name) => name !== itemDisplayTitle(card.item),
              ),
            ]
              .filter(Boolean)
              .join(" · ")
          : `Bilibili md${card.mediaId} · 索引未命中`;
        const checkbox = element("input", {
          className: "scout-batch-checkbox",
          type: "checkbox",
          checked: selected,
          disabled:
            !selectable || this.batchLoading || this.batchImporting,
          attrs: {
            "aria-label": selectable
              ? `选择 ${displayTitle}`
              : `${displayTitle} 未命中本地索引`,
          },
          on: {
            change: (event) =>
              this.toggleBatchCard(mediaId, event.currentTarget.checked),
          },
        });
        this.batchList.append(
          element(
            "label",
            {
              className:
                `scout-batch-row${selected ? " is-selected" : ""}` +
                `${selectable ? "" : " is-unmatched"}`,
              dataset: {
                itemId: card.item?.id ?? card.mediaId,
                mediaId,
              },
            },
            [
              checkbox,
              element("div", { className: "scout-list-copy" }, [
                element("div", {
                  className: "scout-list-title",
                  text: displayTitle,
                }),
                element("div", {
                  className: "scout-list-meta",
                  text: meta,
                }),
              ]),
              element("span", {
                className: "scout-score",
                text: selectable ? "可导入" : "未命中",
              }),
            ],
          ),
        );
      }

      if (this.batchLoading) {
        this.batchList.append(
          element("p", {
            className: "scout-batch-message",
            text: "已显示部分结果，其余追番仍在分批匹配。",
          }),
        );
      }

      if (cards.length > this.batchVisibleLimit) {
        const remaining = cards.length - this.batchVisibleLimit;
        this.batchList.append(
          element(
            "button",
            {
              className: "scout-batch-load-more",
              attrs: { type: "button" },
              on: {
                click: () => {
                  this.batchVisibleLimit += 50;
                  this.renderBatchCards();
                },
              },
            },
            [`再显示 ${Math.min(50, remaining)} 项`],
          ),
        );
      }
    }

    this.batchStatus.textContent = this.batchMessage;
    this.batchStatus.hidden = !this.batchMessage;
    const writable = this.batchGithubWritable();
    this.batchActionNote.textContent = writable
      ? "新记录默认未评分、无评价；已存在的番剧会自动跳过，并一次写入当前选择。"
      : "批量同步需要先在设置中连接 GitHub 仓库和 Token。";
    this.batchActionNote.dataset.tone = writable ? "" : "warn";
    const allSelected =
      importable.length > 0 &&
      importable.every((card) =>
        this.batchSelectedIds.has(String(card.mediaId)),
      );
    this.batchSelectAllButton.disabled =
      this.batchLoading || this.batchImporting || importable.length === 0;
    this.batchSelectAllButton.lastChild.textContent = allSelected
      ? "取消全选"
      : "全选可导入";
    this.batchImportButton.disabled =
      this.batchLoading ||
      this.batchImporting ||
      !writable ||
      this.batchSelectedIds.size === 0;
    this.batchImportButtonTextNode.textContent = this.batchImporting
      ? "正在同步"
      : "导入并同步";
  }

  async syncSelectedBatchCards() {
    if (this.batchImporting || !this.githubRecords) {
      return;
    }
    if (!this.batchGithubWritable()) {
      this.showToast("请先在设置中连接 GitHub 仓库并填写 Token");
      return;
    }

    const selectedCards = this.batchImportableCards().filter((card) =>
      this.batchSelectedIds.has(String(card.mediaId)),
    );
    if (!selectedCards.length) {
      this.showToast("请先选择要导入的追番");
      return;
    }

    this.batchImporting = true;
    this.batchMessage = `正在获取封面并写入 ${selectedCards.length} 项`;
    this.renderBatchCards();
    try {
      await this.resolveBatchCovers(
        selectedCards.map((card) => card.selectedResult.item),
      );
      const result = await this.githubRecords.saveRecordsBatch({
        entries: selectedCards.map((card) => ({
          item: card.selectedResult.item,
          selectedResult: card.selectedResult,
        })),
      });
      const syncedAt = new Date().toISOString();
      const settings = this.settingsStore.get();
      const updatedSettings = this.settingsStore.update({
        github: {
          ...settings.github,
          lastSyncedAt: syncedAt,
        },
      });
      this.githubLastSyncedAt = updatedSettings.github.lastSyncedAt;
      this.batchSelectedIds.clear();
      this.batchMessage =
        result.imported.length > 0
          ? `已导入 ${result.imported.length} 条，跳过 ${result.skippedCount} 条`
          : `选中的 ${result.skippedCount} 条均已存在，没有重复写入`;
      this.showToast(this.batchMessage);
      this.updateGithubSetupChecklist();
    } catch (error) {
      this.batchMessage = `批量同步失败：${toErrorMessage(error)}`;
      this.showToast(this.batchMessage);
    } finally {
      this.batchImporting = false;
      this.renderBatchCards();
    }
  }

  async resolveItemCover(item) {
    if (!item || item.coverUrl || !this.coverResolver) {
      return item?.coverUrl ?? null;
    }
    try {
      const url = await this.coverResolver(item);
      if (url) {
        item.coverUrl = normalizeCoverUrl(url);
      }
    } catch {
      // Cover lookup is optional and must not block saving the record.
    }
    return item.coverUrl ?? null;
  }

  async resolveBatchCovers(items) {
    const pending = [...new Set(items ?? [])].filter(
      (item) => item && !item.coverUrl,
    );
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor];
        cursor += 1;
        await this.resolveItemCover(item);
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(4, pending.length) },
        () => worker(),
      ),
    );
  }

  scheduleBatchCards() {
    clearTimeout(this.batchRenderTimer);
    this.batchRenderTimer = null;
    clearTimeout(this.batchProgressRenderTimer);
    this.batchProgressRenderTimer = null;
    const requestId = ++this.batchScanRequestId;
    this.batchCards = [];
    this.batchSelectedIds.clear();
    this.batchVisibleLimit = 50;
    this.batchLoading = false;
    this.batchImporting = false;
    this.batchMessage = "";
    this.batchDiagnostics = [];
    this.batchTotal = 0;
    this.batchProgress = null;
    this.batchSection.hidden = true;
    this.batchList.replaceChildren();
    if (this.currentResult?.context?.pageKind !== "bilibili-follow") {
      return;
    }

    const result = this.currentResult;
    this.batchLoading = true;
    this.batchProgress = {
      phase: "fetch",
      fetchedPages: 0,
      itemCount: 0,
      total: 0,
    };
    this.renderBatchCards();
    const scan = async () => {
      this.batchRenderTimer = null;
      if (
        requestId !== this.batchScanRequestId ||
        this.currentResult !== result
      ) {
        return;
      }
      try {
        const scanned = await this.onScanCards?.({
          onProgress: (progress) => {
            if (
              requestId !== this.batchScanRequestId ||
              this.currentResult !== result
            ) {
              return;
            }
            this.batchProgress = progress;
            if (Array.isArray(progress?.cards)) {
              this.batchCards = progress.cards;
            }
            if (Number(progress?.total) > this.batchTotal) {
              this.batchTotal = Number(progress.total);
            }
            clearTimeout(this.batchProgressRenderTimer);
            this.batchProgressRenderTimer = setTimeout(() => {
              if (
                requestId !== this.batchScanRequestId ||
                this.currentResult !== result
              ) {
                return;
              }
              this.renderBatchCards();
            }, 80);
          },
        });
        if (
          requestId !== this.batchScanRequestId ||
          this.currentResult !== result
        ) {
          return;
        }
        const payload = Array.isArray(scanned)
          ? { cards: scanned, diagnostics: [], total: scanned.length }
          : scanned ?? {};
        this.batchCards = Array.isArray(payload.cards) ? payload.cards : [];
        this.batchTotal = Number(payload.total) || this.batchCards.length;
        this.batchDiagnostics = (payload.diagnostics ?? []).filter(Boolean);
        this.batchMessage = this.batchDiagnostics.join("；");
        this.batchProgress = null;
      } catch (error) {
        if (requestId !== this.batchScanRequestId) {
          return;
        }
        this.batchCards = [];
        this.batchMessage = `追番列表读取失败：${toErrorMessage(error)}`;
      } finally {
        if (
          requestId === this.batchScanRequestId &&
          this.currentResult === result
        ) {
          this.batchProgress = null;
          this.batchLoading = false;
          clearTimeout(this.batchProgressRenderTimer);
          this.batchProgressRenderTimer = null;
          this.renderBatchCards();
        }
      }
    };

    this.batchRenderTimer = window.setTimeout(scan, 0);
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

  restoreCachedRecognition() {
    const draft = this.recognitionCache?.get(location.href);
    const item = draft?.selectedResult?.item ?? draft?.item;
    if (!draft || !item?.id) {
      return false;
    }
    const cachedResult = draft.recognitionResult ?? {};
    const selectedResult = draft.selectedResult ?? {
      item,
      confidence: 0,
      matchedBy: ["local-cache"],
    };
    this.setResult({
      ...cachedResult,
      status: cachedResult.status ?? "matched",
      best: selectedResult,
      results:
        Array.isArray(cachedResult.results) && cachedResult.results.length
          ? cachedResult.results
          : [{ ...selectedResult, confidence: selectedResult.confidence ?? 0 }],
      titleCandidates: cachedResult.titleCandidates ?? [],
      context: cachedResult.context ?? {},
      aiResult: cachedResult.aiResult ?? null,
      bilibiliMetadata:
        cachedResult.bilibiliMetadata ??
        selectedResult.bilibiliMetadata ??
        null,
      diagnostics: cachedResult.diagnostics ?? [],
    });
    this.candidateCollapsed = true;
    this.resultListSection.hidden = true;
    this.titleCandidateSection.hidden = true;
    this.manualSearchSection.hidden = true;
    this.batchSection.hidden = true;
    this.recordSection.hidden = false;
    if (this.rescanButtonTextNode) {
      this.rescanButtonTextNode.textContent = "重新识别";
    }
    return true;
  }

  requestAi() {
    if (!this.settingsStore.get().ai.enabled) {
      this.openSettings();
      this.showToast("请先启用并配置 DeepSeek");
      this.aiEnabled.focus();
      return;
    }
    this.onRecognize({
      source: "manual",
      ai: "force",
      ignoreRecognitionCache: true,
    });
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
    this.updatePagePresentation();
    this.closeSettings();
    if (!this.currentResult && options.recognize !== true) {
      this.restoreCachedRecognition();
    }
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
    this.updatePagePresentation();
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

  startLauncherDrag(event) {
    if (event.button !== 0) {
      return;
    }
    const rect = this.launcher.getBoundingClientRect();
    this.launcherDragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      top: rect.top,
      height: rect.height,
      moved: false,
    };
    this.suppressLauncherClick = false;
    this.launcher.setPointerCapture?.(event.pointerId);
  }

  moveLauncher(event) {
    const drag = this.launcherDragState;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) {
      return;
    }
    drag.moved = true;
    this.suppressLauncherClick = true;
    this.launcher.classList.add("is-dragging");
    const side =
      event.clientX < window.innerWidth / 2 ? "left" : "right";
    this.dockedSide = side;
    this.applyLauncherDock(side, drag.top + deltaY, drag.height);
    event.preventDefault();
  }

  finishLauncherDrag(event) {
    const drag = this.launcherDragState;
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    this.launcherDragState = null;
    this.launcher.classList.remove("is-dragging");
    if (this.launcher.hasPointerCapture?.(event.pointerId)) {
      this.launcher.releasePointerCapture(event.pointerId);
    }
    if (drag.moved && this.dockedSide) {
      this.suppressLauncherClick = true;
      this.applyLauncherDock(
        this.dockedSide,
        this.launcher.getBoundingClientRect().top,
        this.launcher.getBoundingClientRect().height,
      );
    }
  }

  applyPanelSize(width, height) {
    if (window.matchMedia("(max-width: 520px)").matches) {
      this.panel.style.removeProperty("width");
      this.panel.style.removeProperty("height");
      return;
    }
    const maximumWidth = Math.max(340, window.innerWidth - 24);
    const maximumHeight = Math.max(420, window.innerHeight - 96);
    this.panelWidth = Math.round(
      clampNumber(width, Math.min(340, maximumWidth), Math.min(1100, maximumWidth)),
    );
    this.panelHeight = Math.round(
      clampNumber(height, Math.min(420, maximumHeight), Math.min(900, maximumHeight)),
    );
    this.panel.style.width = `${this.panelWidth}px`;
    this.panel.style.height = `${this.panelHeight}px`;
  }

  startPanelResize(event) {
    if (
      event.button !== 0 ||
      window.matchMedia("(max-width: 520px)").matches
    ) {
      return;
    }
    const rect = this.panel.getBoundingClientRect();
    this.resizeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    this.panel.classList.add("is-resizing");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  movePanelResize(event) {
    if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) {
      return;
    }
    this.applyPanelSize(
      this.resizeState.startWidth + event.clientX - this.resizeState.startX,
      this.resizeState.startHeight + event.clientY - this.resizeState.startY,
    );
    event.preventDefault();
    event.stopPropagation();
  }

  finishPanelResize(event) {
    if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) {
      return;
    }
    const handle = event.currentTarget;
    this.resizeState = null;
    this.panel.classList.remove("is-resizing");
    if (handle.hasPointerCapture?.(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    const settings = this.settingsStore.get();
    this.settingsStore.update({
      ui: {
        ...settings.ui,
        panelWidth: this.panelWidth,
        panelHeight: this.panelHeight,
      },
    });
    this.clampPanelToViewport();
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

  applyLauncherDock(side, top, height = 92) {
    this.launcher.classList.remove("is-docked-left", "is-docked-right");
    this.launcher.classList.add("is-side-docked", `is-docked-${side}`);
    this.launcher.dataset.docked = side;
    this.launcher.style.top = `${Math.round(
      clampNumber(top, 8, Math.max(8, window.innerHeight - height - 8)),
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
      this.applyPanelSize(this.panelWidth, this.panelHeight);
      return;
    }
    this.applyPanelSize(this.panelWidth, this.panelHeight);
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
