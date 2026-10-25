import {
  Bot,
  CloudDownload,
  Database,
  ExternalLink,
  KeyRound,
  List,
  RefreshCw,
  RotateCcw,
  Save,
  ScanSearch,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide";
import { createElement as createLucideElement } from "lucide";
import panelStyles from "./panel.css";
import {
  INDEX_SOURCES,
  UPDATE_FREQUENCIES,
} from "../core/settings.js";
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
    this.onRecognize = options.onRecognize;
    this.onSettingsSaved = options.onSettingsSaved;
    this.onUpdateIndex = options.onUpdateIndex;
    this.onClearIndex = options.onClearIndex;
    this.onScanCards = options.onScanCards;
    this.indexState = this.indexService.getState();
    this.currentResult = null;
    this.busy = false;
    this.searchTimer = null;
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
      [icon(ScanSearch), this.launcherDot],
    );

    this.panelStatus = element("p", {
      className: "scout-brand-state",
      text: "本地索引准备中",
    });
    this.recognitionView = this.buildRecognitionView();
    this.settingsView = this.buildSettingsView();
    this.panelBody = element("div", { className: "scout-body" }, [
      this.recognitionView,
    ]);

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
        element("header", { className: "scout-header" }, [
          element("div", { className: "scout-brand-mark" }, [icon(ScanSearch)]),
          element("div", { className: "scout-brand" }, [
            element("h1", {
              className: "scout-brand-title",
              text: "Bangumi Scout",
            }),
            this.panelStatus,
          ]),
          iconButton("关闭", X, () => this.close()),
        ]),
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
        element("div", { className: "scout-body" }, [this.settingsView]),
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
      text: "打开面板后读取当前页面。",
    });

    this.rescanIcon = icon(RefreshCw);
    this.rescanButton = button(
      "重新识别",
      null,
      () => this.onRecognize({ source: "manual" }),
      { variant: "primary" },
    );
    this.rescanButton.prepend(this.rescanIcon);
    this.aiButton = button(
      "AI 辅助",
      Sparkles,
      () => this.requestAi(),
    );
    this.resultActions = element("div", { className: "scout-actions" }, [
      this.rescanButton,
      this.aiButton,
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

    this.searchInput = element("input", {
      type: "search",
      placeholder: "手动搜索番剧名或别名",
      autocomplete: "off",
      attrs: { "aria-label": "手动搜索番剧" },
      on: { input: () => this.scheduleManualSearch() },
    });
    this.manualSearchResults = element("div", { className: "scout-list" });
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

    return element("div", {
      className: "scout-view",
      attrs: {
        "data-view": "recognition",
        role: "region",
        "aria-label": "番剧识别结果",
      },
    }, [
      element("div", { className: "scout-result-head" }, [
        element("div", { className: "scout-eyebrow" }, [
          this.resultBadge,
          element("span", { text: "当前页面" }),
        ]),
        this.resultTitle,
        this.resultSubtitle,
        this.resultActions,
      ]),
      this.manualSearchSection,
      this.batchSection,
      this.resultListSection,
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
    this.syncCustomUrlVisibility();
    this.syncSettingsDisabledState();
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

  saveSettings() {
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
    });
    this.populateSettings(settings);
    this.showToast("设置已保存");
    this.onSettingsSaved?.(settings, previous);
  }

  resetSettings() {
    const previous = this.settingsStore.get();
    const settings = this.settingsStore.reset();
    this.populateSettings(settings);
    this.showToast("设置已恢复默认值");
    this.onSettingsSaved?.(settings, previous);
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
    this.settingsFooterStatus.textContent =
      state.status === INDEX_STATES.READY
        ? "设置保存在油猴扩展中"
        : state.message;
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
    this.rescanIcon.classList.toggle("scout-spin", busy);
    if (busy) {
      this.resultBadge.textContent = message;
      this.resultBadge.dataset.tone = "none";
    }
  }

  setResult(result) {
    this.currentResult = result;
    this.renderRecognitionResult(result);
  }

  renderRecognitionResult(result) {
    const best = result.best;
    const item = best?.item ?? null;
    const aiTitle = result.aiResult?.title;
    const fallbackTitle = result.titleCandidates?.[0]?.title;
    const title = item?.title ?? aiTitle ?? fallbackTitle ?? "未识别到番剧";
    const confidence = best?.confidence ?? result.aiResult?.confidence ?? 0;
    const statusLabels = {
      matched: "精确匹配",
      ambiguous: "可能匹配",
      unmatched: "未找到可靠匹配",
    };

    this.resultTitle.textContent = title;
    this.resultBadge.textContent = statusLabels[result.status] ?? "识别完成";
    this.resultBadge.dataset.tone = confidenceTone(confidence);

    if (item) {
      const alternateNames = item.names
        .filter((name) => name !== item.title)
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

    this.renderResultRows(this.resultList, result.results, {
      emptyText: "本地索引没有返回候选，可尝试手动搜索或 AI 识别。",
    });
    this.renderDiagnostics(result.diagnostics);
    this.renderBatchCards();
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
      const methods = row.matchedBy?.join(" / ");
      container.append(
        element("div", { className: "scout-list-row" }, [
          element("div", {}, [
            element("div", {
              className: "scout-list-title",
              text: item.title,
            }),
            element("div", {
              className: "scout-list-meta",
              text: [
                item.year,
                TYPE_LABELS[item.type] ?? item.type,
                methods,
              ]
                .filter(Boolean)
                .join(" · "),
            }),
          ]),
          element("span", {
            className: "scout-score",
            text: formatConfidence(confidence),
          }),
        ]),
      );
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
    const cards = this.onScanCards?.() ?? [];
    this.batchSection.hidden = cards.length === 0;
    this.batchList.replaceChildren();
    if (!cards.length) {
      return;
    }

    const matched = cards.filter((card) => card.item).length;
    for (const card of cards.slice(0, 30)) {
      this.batchList.append(
        element("div", { className: "scout-list-row" }, [
          element("div", {}, [
            element("div", {
              className: "scout-list-title",
              text: card.item?.title ?? card.title,
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
          element("span", {
            className: "scout-score",
            text: card.item ? "已匹配" : "未命中",
          }),
        ]),
      );
    }
    this.batchTitle.textContent = `当前页面番剧 (${matched}/${cards.length})`;
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
      this.renderResultRows(this.manualSearchResults, results, {
        emptyText: "没有搜索到番剧。",
      });
    }, 180);
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

  open() {
    this.closeSettings();
    this.panel.hidden = false;
    this.launcher.setAttribute("aria-expanded", "true");
  }

  close() {
    this.panel.hidden = true;
    this.launcher.setAttribute("aria-expanded", "false");
  }

  openSettings() {
    this.close();
    this.settingsBackdrop.hidden = false;
    this.settingsWindow.hidden = false;
    this.launcher.setAttribute("aria-expanded", "true");
    this.indexEnabled.focus();
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
}
