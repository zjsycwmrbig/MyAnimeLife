import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { CatalogStore } from "./catalog-store.mjs";
import { compactPublicCatalogMetadata } from "./recommendations.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, "..");
const LATEST_URL =
  "https://raw.githubusercontent.com/bangumi/Archive/master/aux/latest.json";
const MAX_TAGS = 16;

function clean(value) {
  return String(value ?? "").trim();
}

function parseArguments(argv) {
  const options = {
    root: defaultRoot,
    output: "admin/bangumi-public.json",
    catalogOutput: "admin/bangumi-public-catalog.json",
    archive: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      options.root = path.resolve(argv[++index]);
    } else if (argument === "--output") {
      options.output = argv[++index];
    } else if (argument === "--catalog-output") {
      options.catalogOutput = argv[++index];
    } else if (argument === "--archive") {
      options.archive = path.resolve(argv[++index]);
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  return options;
}

async function requestJson(url, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "myanimelife-bangumi-snapshot",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function downloadArchive(downloadUrl, destination) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15 * 60 * 1000);
  try {
    const response = await fetch(downloadUrl, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "myanimelife-bangumi-snapshot",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Bangumi Archive 下载失败 (HTTP ${response.status})`);
    }
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(destination),
    );
  } finally {
    clearTimeout(timer);
  }
}

function normalizeTags(values) {
  const tags = new Map();
  for (const value of Array.isArray(values) ? values : []) {
    const name = clean(value?.name);
    const key = name.normalize("NFKC").toLocaleLowerCase("zh-CN");
    if (!name || !key) {
      continue;
    }
    const count = Math.max(0, Math.trunc(Number(value?.count) || 0));
    const previous = tags.get(key);
    if (!previous || count > previous.count) {
      tags.set(key, { name, count });
    }
  }
  return [...tags.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.name.localeCompare(right.name, "zh-CN"),
    )
    .slice(0, MAX_TAGS);
}

function compactSubject(subject) {
  const score = Number(subject?.score);
  const rank = Math.max(0, Math.trunc(Number(subject?.rank) || 0));
  const ratingCount = Object.values(subject?.score_details ?? {}).reduce(
    (total, value) => total + Math.max(0, Math.trunc(Number(value) || 0)),
    0,
  );
  const tags = normalizeTags(subject?.tags);
  if (!tags.length) {
    tags.push(
      ...normalizeTags(
        (subject?.meta_tags ?? []).map((name) => ({ name, count: 0 })),
      ),
    );
  }
  return [
    Number.isFinite(score) && score > 0 && score <= 10
      ? Math.round(score * 10) / 10
      : null,
    ratingCount,
    rank || null,
    tags.map((tag) => [tag.name, tag.count]),
  ];
}

function parseJsonLine(stream) {
  return readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
}

async function extractSubjects(archivePath, requestedIds, archiveFetchedAt) {
  const unzip = spawn("unzip", ["-p", archivePath, "subject.jsonlines"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const errors = [];
  unzip.stderr.setEncoding("utf8");
  unzip.stderr.on("data", (chunk) => errors.push(chunk));
  const subjects = {};
  for await (const line of parseJsonLine(unzip.stdout)) {
    if (!line.trim()) {
      continue;
    }
    let subject;
    try {
      subject = JSON.parse(line);
    } catch {
      continue;
    }
    const subjectId = clean(subject?.id);
    if (!requestedIds.has(subjectId)) {
      continue;
    }
    subjects[subjectId] = compactSubject(subject);
  }
  const exitCode = await new Promise((resolve, reject) => {
    unzip.once("error", reject);
    unzip.once("close", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(
      `无法解压 Bangumi Archive：${errors.join("").trim() || `退出码 ${exitCode}`}`,
    );
  }
  return subjects;
}

async function writeJsonAtomic(filePath, payload) {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsPromises.writeFile(temporaryPath, `${JSON.stringify(payload)}\n`);
  await fsPromises.rename(temporaryPath, filePath);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = path.resolve(options.root);
  const outputPath = path.resolve(root, options.output);
  const catalogOutputPath = path.resolve(root, options.catalogOutput);
  const catalog = await new CatalogStore(root).load();
  const requestedIds = new Set(
    catalog.items
      .map((item) => clean(item.sites?.bangumi))
      .filter(Boolean),
  );
  if (!requestedIds.size) {
    throw new Error("bangumi-data 中没有可用的 Bangumi ID");
  }

  let archivePath = options.archive;
  let temporaryDirectory = "";
  let archiveInfo;
  try {
    if (!archivePath) {
      archiveInfo = await requestJson(LATEST_URL);
      if (!archiveInfo?.browser_download_url || !archiveInfo?.name) {
        throw new Error("Bangumi Archive latest.json 缺少下载信息");
      }
      temporaryDirectory = await fsPromises.mkdtemp(
        path.join(os.tmpdir(), "myanimelife-bangumi-"),
      );
      archivePath = path.join(temporaryDirectory, archiveInfo.name);
      console.log(`Downloading ${archiveInfo.name}...`);
      await downloadArchive(archiveInfo.browser_download_url, archivePath);
    } else {
      const stat = await fsPromises.stat(archivePath);
      archiveInfo = {
        name: path.basename(archivePath),
        size: stat.size,
        updated_at: stat.mtime.toISOString(),
      };
    }

    const archiveFetchedAt = clean(archiveInfo.updated_at);
    if (!archiveFetchedAt) {
      throw new Error("无法确定 Bangumi Archive 的更新时间");
    }
    console.log(`Reading ${requestedIds.size} Bangumi subjects...`);
    const subjects = await extractSubjects(
      archivePath,
      requestedIds,
      archiveFetchedAt,
    );
    const generatedAt = new Date().toISOString();
    const payload = {
      schemaVersion: 1,
      generatedAt,
      source: {
        name: "Bangumi Archive",
        url: "https://github.com/bangumi/Archive",
        archiveName: archiveInfo.name,
        archiveUpdatedAt: archiveFetchedAt,
        catalogVersion: catalog.source.version,
        catalogItemCount: catalog.itemCount,
        requestedSubjectCount: requestedIds.size,
        matchedSubjectCount: Object.keys(subjects).length,
      },
      subjects,
    };
    await writeJsonAtomic(outputPath, payload);
    await writeJsonAtomic(
      catalogOutputPath,
      compactPublicCatalogMetadata(catalog, generatedAt),
    );
    const outputStat = await fsPromises.stat(outputPath);
    const catalogOutputStat = await fsPromises.stat(catalogOutputPath);
    console.log(
      `Wrote ${path.relative(root, outputPath)}: ${Object.keys(subjects).length} subjects, ${outputStat.size} bytes`,
    );
    console.log(
      `Wrote ${path.relative(root, catalogOutputPath)}: ${catalogOutputStat.size} bytes`,
    );
  } finally {
    if (temporaryDirectory) {
      await fsPromises.rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
