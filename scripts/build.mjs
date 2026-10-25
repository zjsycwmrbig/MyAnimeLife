import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import MarkdownIt from "markdown-it";
import nunjucks from "nunjucks";
import {
  ANIME_INDEX_JSONL_PATH,
  ANIME_JSONL_PATH,
  buildAnimeIndex,
  parseJsonl,
  sortRecordsById,
} from "./library-data.mjs";
import { calculateInsights } from "./insights-data.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, "..");

const MATCH_METHOD_LABELS = {
  "site-id": "站点 ID 精确匹配",
  "title-exact": "标题精确匹配",
  "title-fuzzy": "标题模糊匹配",
  ai: "AI 辅助识别",
  manual: "手动录入",
  import: "批量导入",
};

const MATCH_STATUS_LABELS = {
  matched: "已匹配",
  manual: "手动记录",
  unmatched: "未匹配",
};

const SOURCE_LINK_BUILDERS = {
  bangumi: {
    label: "Bangumi",
    url: (id) => `https://bgm.tv/subject/${id}`,
  },
  bilibiliMedia: {
    label: "Bilibili",
    url: (id) => `https://www.bilibili.com/bangumi/media/md${id}`,
  },
  bilibiliSeason: {
    label: "Bilibili 剧集",
    url: (id) => `https://www.bilibili.com/bangumi/play/ss${id}`,
  },
  anilist: {
    label: "AniList",
    url: (id) => `https://anilist.co/anime/${id}`,
  },
  mal: {
    label: "MyAnimeList",
    url: (id) => `https://myanimelist.net/anime/${id}`,
  },
};

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

const defaultLinkRenderer =
  markdown.renderer.rules.link_open ??
  ((tokens, index, options, env, renderer) =>
    renderer.renderToken(tokens, index, options));

markdown.renderer.rules.link_open = (
  tokens,
  index,
  options,
  env,
  renderer,
) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "noreferrer noopener");
  return defaultLinkRenderer(tokens, index, options, env, renderer);
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

async function readJson(filePath) {
  let text;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`无法读取 ${filePath}: ${error.message}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${filePath} 不是有效的 JSON: ${error.message}`);
  }
}

function resolveInside(root, ...segments) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, ...segments);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`路径超出仓库范围: ${segments.join("/")}`);
  }
  return target;
}

function assertRelativeDirectory(value, fieldName) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/u).includes("..")
  ) {
    throw new Error(`${fieldName} 必须是仓库内的相对路径`);
  }
}

function formatAjvErrors(errors) {
  return (errors ?? [])
    .map((error) => {
      const location = error.instancePath || "/";
      return `${location} ${error.message}`;
    })
    .join("; ");
}

export async function compileRecordValidator(root = defaultRoot) {
  const schemaPath = resolveInside(root, "schemas/anime.schema.json");
  const schema = await readJson(schemaPath);
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    messages: true,
  });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  return (record, label = "番剧记录") => {
    if (!validate(record)) {
      throw new Error(`${label} 未通过 Schema 校验: ${formatAjvErrors(validate.errors)}`);
    }
    return record;
  };
}

export async function compileIndexValidator(root = defaultRoot) {
  const schemaPath = resolveInside(root, "schemas/anime-index.schema.json");
  const schema = await readJson(schemaPath);
  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    messages: true,
  });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  return (record, label = "番剧索引") => {
    if (!validate(record)) {
      throw new Error(`${label} 未通过 Schema 校验: ${formatAjvErrors(validate.errors)}`);
    }
    return record;
  };
}

export async function loadSiteConfig(root = defaultRoot) {
  const config = await readJson(resolveInside(root, "config/site.json"));
  if (!config || typeof config !== "object") {
    throw new Error("config/site.json 必须是 JSON 对象");
  }
  if (!config.site?.title || !config.site?.description || !config.site?.language) {
    throw new Error("config/site.json 缺少 site.title、site.description 或 site.language");
  }
  if (
    typeof config.template !== "string" ||
    !/^[a-z0-9][a-z0-9-]*$/u.test(config.template)
  ) {
    throw new Error("config/site.json 的 template 名称不合法");
  }
  assertRelativeDirectory(
    config.dataFile ?? ANIME_JSONL_PATH,
    "dataFile",
  );
  assertRelativeDirectory(
    config.indexFile ?? ANIME_INDEX_JSONL_PATH,
    "indexFile",
  );
  assertRelativeDirectory(config.backupDirectory, "backupDirectory");
  assertRelativeDirectory(config.outputDirectory, "outputDirectory");
  if (
    !Number.isInteger(config.backupLimit) ||
    config.backupLimit < 1 ||
    config.backupLimit > 20
  ) {
    throw new Error("config/site.json 的 backupLimit 必须是 1 到 20 的整数");
  }

  return config;
}

export async function loadTemplate(root, templateName) {
  const templateDirectory = resolveInside(root, "templates", templateName);
  const manifest = await readJson(path.join(templateDirectory, "template.json"));

  if (manifest.id !== templateName) {
    throw new Error(`模板声明 id ${manifest.id} 与目录名 ${templateName} 不一致`);
  }
  if (manifest.contractVersion !== 1) {
    throw new Error(
      `模板 ${templateName} 使用 contractVersion ${manifest.contractVersion}，当前仅支持 1`,
    );
  }

  for (const entrypoint of ["index", "detail", "insights", "notFound"]) {
    const value = manifest.entrypoints?.[entrypoint];
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`模板 ${templateName} 缺少 entrypoints.${entrypoint}`);
    }
    await fs.access(path.join(templateDirectory, value));
  }

  assertRelativeDirectory(manifest.assets, `模板 ${templateName} 的 assets`);
  await fs.access(path.join(templateDirectory, manifest.assets));

  return {
    directory: templateDirectory,
    manifest,
  };
}

function validateRecordCollection(entries, label) {
  const seenIds = new Set();
  const seenExternalIds = new Map();

  for (const [position, record] of entries.entries()) {
    const recordLabel = `${label} 第 ${position + 1} 条`;
    if (record.title !== record.title.trim()) {
      throw new Error(`${recordLabel} 的 title 首尾不能包含空白字符`);
    }
    if (new Date(record.updatedAt).getTime() < new Date(record.createdAt).getTime()) {
      throw new Error(`${recordLabel} 的 updatedAt 不能早于 createdAt`);
    }
    if (record.season) {
      const hasSeasonNumber = record.season.number !== null;
      const hasSeasonLabel = Boolean(record.season.label);
      if (hasSeasonNumber !== hasSeasonLabel) {
        throw new Error(
          `${recordLabel} 的 season.number 与 season.label 必须同时填写或同时为 null`,
        );
      }
    }
    if (seenIds.has(record.id)) {
      throw new Error(`发现重复的番剧 id: ${record.id}`);
    }
    seenIds.add(record.id);

    for (const [source, id] of Object.entries(record.externalIds ?? {})) {
      const externalKey = `${source}:${id}`;
      const existing = seenExternalIds.get(externalKey);
      if (existing) {
        throw new Error(
          `跨站索引重复: ${externalKey} 同时出现在 ${existing} 和 ${record.id}`,
        );
      }
      seenExternalIds.set(externalKey, record.id);
    }
  }
}

function assertIndexMatchesRecords(records, index) {
  const expected = buildAnimeIndex(records);
  const actual = sortRecordsById(index);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      "anime-index.jsonl 与 anime.jsonl 不一致，请运行本地管理页或重新生成索引",
    );
  }
}

export async function loadLibrary(root = defaultRoot, options = {}) {
  const config = options.config ?? (await loadSiteConfig(root));
  const validateRecord =
    options.validator ?? (await compileRecordValidator(root));
  const validateIndex =
    options.indexValidator ?? (await compileIndexValidator(root));
  const dataFile = resolveInside(
    root,
    config.dataFile ?? ANIME_JSONL_PATH,
  );
  const indexFile = resolveInside(
    root,
    config.indexFile ?? ANIME_INDEX_JSONL_PATH,
  );
  let dataText;
  let indexText;
  try {
    [dataText, indexText] = await Promise.all([
      fs.readFile(dataFile, "utf8"),
      fs.readFile(indexFile, "utf8"),
    ]);
  } catch (error) {
    throw new Error(`无法读取番剧 JSONL 数据: ${error.message}`);
  }

  const records = parseJsonl(dataText, config.dataFile);
  const index = parseJsonl(indexText, config.indexFile);
  for (const [position, record] of records.entries()) {
    validateRecord(record, `${config.dataFile} 第 ${position + 1} 条`);
  }
  for (const [position, entry] of index.entries()) {
    validateIndex(entry, `${config.indexFile} 第 ${position + 1} 条`);
  }
  validateRecordCollection(records, config.dataFile);
  assertIndexMatchesRecords(records, index);

  return {
    records,
    index,
    dataText,
    indexText,
  };
}

export async function loadEntries(root = defaultRoot, options = {}) {
  const library = await loadLibrary(root, options);
  return library.records;
}

function collectMarkdownText(tokens) {
  const parts = [];
  for (const token of tokens ?? []) {
    if (token.type === "text" || token.type === "code_inline") {
      parts.push(token.content);
    } else if (token.children?.length) {
      parts.push(collectMarkdownText(token.children));
    }
  }
  return parts.join(" ");
}

function markdownToText(value) {
  if (!value) {
    return "";
  }
  const tokens = markdown.parseInline(value, {});
  return collectMarkdownText(tokens).replace(/\s+/gu, " ").trim();
}

function truncateText(value, maximumLength) {
  const characters = [...value];
  if (characters.length <= maximumLength) {
    return value;
  }
  return `${characters.slice(0, maximumLength).join("")}…`;
}

function formatDate(value) {
  return dateFormatter.format(new Date(value));
}

function formatDateTime(value) {
  return dateTimeFormatter.format(new Date(value));
}

function formatRating(value) {
  return value === null ? "未评分" : Number(value).toFixed(1);
}

function formatSeasonLabel(record) {
  const label = String(record.season?.label ?? "").trim();
  if (label) {
    return label;
  }
  const number = Number(record.season?.number);
  return Number.isInteger(number) && number > 0 ? `第${number}季` : "";
}

function createSourceLinks(externalIds = {}) {
  return Object.entries(externalIds)
    .map(([source, id]) => {
      const builder = SOURCE_LINK_BUILDERS[source];
      if (!builder) {
        return null;
      }
      return {
        source,
        id,
        label: builder.label,
        url: builder.url(id),
      };
    })
    .filter(Boolean);
}

function createRecordViewModel(record) {
  const sourceLinks = createSourceLinks(record.externalIds);
  const reviewText = markdownToText(record.review);
  const seasonLabel = formatSeasonLabel(record);

  return {
    ...record,
    seasonLabel,
    detailPath: `anime/${record.id}/`,
    ratingDisplay: formatRating(record.rating),
    ratingValue: record.rating === null ? "" : String(record.rating),
    hasRating: record.rating !== null,
    reviewHtml: record.review ? markdown.render(record.review) : "",
    noteHtml: record.note ? markdown.render(record.note) : "",
    reviewExcerpt: reviewText
      ? truncateText(reviewText, 92)
      : "还没有写下评价。",
    updatedLabel: formatDate(record.updatedAt),
    createdAtLabel: formatDateTime(record.createdAt),
    matchedAtLabel: record.match.matchedAt
      ? formatDateTime(record.match.matchedAt)
      : "无",
    matchStatusLabel:
      MATCH_STATUS_LABELS[record.match.status] ?? record.match.status,
    matchMethodLabel:
      MATCH_METHOD_LABELS[record.match.method] ?? record.match.method,
    matchConfidenceLabel: `${Math.round(record.match.confidence * 100)}%`,
    sourceLinks,
    sourceCount: sourceLinks.length,
    searchText: [
      record.title,
      seasonLabel,
      record.match.matchedTitle ?? "",
      record.review,
      record.note,
      ...sourceLinks.map((link) => `${link.label} ${link.id}`),
    ]
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim(),
  };
}

export function createRepositoryContext(config, environment = process.env) {
  const slug = String(
    environment.GITHUB_REPOSITORY || config.repository?.slug || "",
  ).trim();
  const branch = String(
    environment.GITHUB_REF_NAME || config.repository?.branch || "main",
  ).trim();

  if (slug && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(slug)) {
    throw new Error(`GitHub repository slug 不合法: ${slug}`);
  }

  return {
    slug,
    branch,
    url: slug ? `https://github.com/${slug}` : "",
  };
}

function createNunjucksEnvironment(templateDirectory) {
  const environment = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(templateDirectory, {
      noCache: true,
      watch: false,
    }),
    {
      autoescape: true,
      throwOnUndefined: false,
    },
  );

  environment.addFilter("formatDate", (value) =>
    value ? formatDate(value) : "",
  );
  environment.addFilter("formatDateTime", (value) =>
    value ? formatDateTime(value) : "",
  );
  environment.addFilter(
    "markdown",
    (value) =>
      new nunjucks.runtime.SafeString(value ? markdown.render(value) : ""),
  );
  environment.addFilter(
    "json",
    (value) => new nunjucks.runtime.SafeString(JSON.stringify(value)),
  );

  return environment;
}

async function writeFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

export async function buildSite(options = {}) {
  const root = path.resolve(options.root ?? defaultRoot);
  const now = options.now ?? new Date();
  const config = await loadSiteConfig(root);
  const validator = await compileRecordValidator(root);
  const indexValidator = await compileIndexValidator(root);
  const libraryData = await loadLibrary(root, {
    config,
    validator,
    indexValidator,
  });
  const allEntries = libraryData.records;
  const publicEntries = allEntries.filter((record) => !record.deletedAt);

  const template = await loadTemplate(root, config.template);
  const repository = createRepositoryContext(config);
  const records = publicEntries
    .map(createRecordViewModel)
    .sort((left, right) => {
      const byUpdatedAt =
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime();
      return byUpdatedAt || left.title.localeCompare(right.title, "zh-CN");
    });
  const insights = calculateInsights(records, now);
  const stats = insights.summary;
  const outputDirectory = resolveInside(root, config.outputDirectory);
  const environment = createNunjucksEnvironment(template.directory);
  const generatedAt = now.toISOString();
  const generatedAtLabel = formatDateTime(generatedAt);

  await fs.rm(outputDirectory, { recursive: true, force: true });
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.cp(
    path.join(template.directory, template.manifest.assets),
    path.join(outputDirectory, "assets"),
    { recursive: true },
  );

  const common = {
    site: config.site,
    repository,
    generatedAt,
    generatedAtLabel,
    dataEndpoint: "data/library.json",
  };

  const indexContext = {
    ...common,
    pageTitle: config.site.title,
    pageDescription: config.site.description,
    homeUrl: "./",
    assetRoot: "./assets/",
    records,
    stats,
  };
  const indexHtml = environment.render(
    template.manifest.entrypoints.index,
    indexContext,
  );
  await writeFile(path.join(outputDirectory, "index.html"), indexHtml);

  const insightsContext = {
    ...common,
    pageTitle: `统计与对比 | ${config.site.title}`,
    pageDescription: `${config.site.title}的收录趋势、年代分布与仓库对比。`,
    homeUrl: "../",
    assetRoot: "../assets/",
    insights,
    currentDataUrl: "../data/library.json",
  };
  const insightsHtml = environment.render(
    template.manifest.entrypoints.insights,
    insightsContext,
  );
  await writeFile(
    path.join(outputDirectory, "insights", "index.html"),
    insightsHtml,
  );

  for (const record of records) {
    const detailContext = {
      ...common,
      pageTitle: `${record.title} | ${config.site.title}`,
      pageDescription:
        markdownToText(record.review) || `${record.title} 的私人番剧档案`,
      homeUrl: "../../",
      assetRoot: "../../assets/",
      record,
      repositoryEditUrl: repository.url
        ? `${repository.url}/edit/${repository.branch}/${config.dataFile}`
        : "",
    };
    const detailHtml = environment.render(
      template.manifest.entrypoints.detail,
      detailContext,
    );
    await writeFile(
      path.join(outputDirectory, "anime", record.id, "index.html"),
      detailHtml,
    );
  }

  const notFoundHtml = environment.render(
    template.manifest.entrypoints.notFound,
    {
      ...common,
      pageTitle: `页面不存在 | ${config.site.title}`,
      pageDescription: "没有找到这个番剧档案页面。",
      homeUrl: "./",
      assetRoot: "./assets/",
    },
  );
  await writeFile(path.join(outputDirectory, "404.html"), notFoundHtml);

  const library = {
    schemaVersion: 1,
    generatedAt,
    site: {
      title: config.site.title,
      description: config.site.description,
      language: config.site.language,
    },
    itemCount: records.length,
    items: libraryData.index
      .filter((entry) => !entry.deletedAt)
      .map((entry) => ({
        ...entry,
        detailPath: `anime/${entry.id}/`,
        sourceLinks: createSourceLinks(entry.externalIds),
      })),
  };
  await writeFile(
    path.join(outputDirectory, "data/library.json"),
    `${JSON.stringify(library, null, 2)}\n`,
  );
  await writeFile(path.join(outputDirectory, ".nojekyll"), "");
  await fs.cp(
    path.join(root, "admin"),
    path.join(outputDirectory, "admin"),
    { recursive: true },
  );
  const browserScripts = [
    "library-data.mjs",
    "catalog-data.mjs",
    "duplicate-data.mjs",
    "admin-data.mjs",
  ];
  await fs.mkdir(path.join(outputDirectory, "scripts"), { recursive: true });
  await Promise.all(
    browserScripts.map((file) =>
      fs.copyFile(
        path.join(root, "scripts", file),
        path.join(outputDirectory, "scripts", file),
      ),
    ),
  );
  await writeFile(
    path.join(outputDirectory, "admin", "config.js"),
    `window.ANIME_ADMIN_CONFIG = ${JSON.stringify(
      {
        mode: "github",
        repository: repository.slug,
        branch: repository.branch,
      },
      null,
      2,
    )};\n`,
  );

  return {
    outputDirectory,
    entryCount: records.length,
    generatedAt,
    template: config.template,
  };
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const result = await buildSite();
    console.log(
      `已构建 ${result.entryCount} 条记录，模板 ${result.template}，输出 ${result.outputDirectory}`,
    );
  } catch (error) {
    console.error(`构建失败: ${error.message}`);
    process.exitCode = 1;
  }
}
