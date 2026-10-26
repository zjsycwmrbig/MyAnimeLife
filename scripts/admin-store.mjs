import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  compileIndexValidator,
  compileRecordValidator,
  loadLibrary,
  loadSiteConfig,
} from "./build.mjs";
import {
  buildAnimeIndex,
  createBackupSnapshot,
  serializeJsonl,
} from "./library-data.mjs";
import { createRecordFromCatalog } from "./catalog-data.mjs";
import {
  appendCatalogRecords,
  removeLibraryRecords,
  updateLibraryRecord,
} from "./admin-data.mjs";
import {
  applySiteSettings,
  siteSettingsPayload,
} from "./site-settings.mjs";

const execFileAsync = promisify(execFile);

function cleanString(value) {
  return String(value ?? "").trim();
}

async function writeFileAtomic(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, text, "utf8");
  await fs.rename(temporaryPath, filePath);
}

async function runGit(root, args) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const message =
      cleanString(error.stderr) ||
      cleanString(error.stdout) ||
      cleanString(error.message);
    throw new Error(`Git 命令失败: ${message}`);
  }
}

export class LibraryAdminStore {
  constructor(root, options = {}) {
    this.root = path.resolve(root);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async context() {
    const config = await loadSiteConfig(this.root);
    return {
      config,
      configFile: path.join(this.root, "config", "site.json"),
      dataFile: path.join(this.root, config.dataFile),
      indexFile: path.join(this.root, config.indexFile),
      backupDirectory: path.join(this.root, config.backupDirectory),
    };
  }

  async siteSettings() {
    const context = await this.context();
    return siteSettingsPayload(context.config);
  }

  async saveSiteSettings(input) {
    const context = await this.context();
    const next = applySiteSettings(context.config, input);
    await writeFileAtomic(
      context.configFile,
      `${JSON.stringify(next, null, 2)}\n`,
    );
    return {
      settings: siteSettingsPayload(next),
      file: path.relative(this.root, context.configFile),
    };
  }

  async load() {
    const context = await this.context();
    const [validator, indexValidator] = await Promise.all([
      compileRecordValidator(this.root),
      compileIndexValidator(this.root),
    ]);
    const library = await loadLibrary(this.root, {
      config: context.config,
      validator,
      indexValidator,
    });
    return {
      ...context,
      ...library,
    };
  }

  async createBackup(library, context, createdAt) {
    if (!library.dataText && !library.indexText) {
      return null;
    }
    await fs.mkdir(context.backupDirectory, { recursive: true });
    const suffix = crypto
      .createHash("sha1")
      .update(`${library.dataText}\n${library.indexText}`)
      .digest("hex")
      .slice(0, 8);
    const safeTime = createdAt.replace(/[:.]/gu, "-");
    const backupName = `library-${safeTime}-${suffix}.json`;
    const backupPath = path.join(context.backupDirectory, backupName);
    const snapshot = createBackupSnapshot({
      animeText: library.dataText,
      indexText: library.indexText,
      createdAt,
    });
    if (!(await fs.stat(backupPath).catch(() => null))) {
      await writeFileAtomic(
        backupPath,
        `${JSON.stringify(snapshot, null, 2)}\n`,
      );
    }
    const entries = await fs.readdir(context.backupDirectory, {
      withFileTypes: true,
    });
    const backups = entries
      .filter(
        (entry) => entry.isFile() && /^library-.*\.json$/u.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, "en"));
    for (const stale of backups.slice(context.config.backupLimit)) {
      await fs.rm(path.join(context.backupDirectory, stale), { force: true });
    }
    return backupPath;
  }

  async writeLibrary(records, options = {}) {
    const context = await this.context();
    const validator = await compileRecordValidator(this.root);
    const indexValidator = await compileIndexValidator(this.root);
    for (const [position, record] of records.entries()) {
      validator(record, `第 ${position + 1} 条记录`);
    }
    const index = buildAnimeIndex(records);
    for (const [position, entry] of index.entries()) {
      indexValidator(entry, `第 ${position + 1} 条索引`);
    }
    const dataText = serializeJsonl(records);
    const indexText = serializeJsonl(index);
    const current = await this.load();
    const backupPath =
      options.skipBackup || (current.dataText === dataText && current.indexText === indexText)
        ? null
        : await this.createBackup(current, context, this.now());
    await writeFileAtomic(context.dataFile, dataText);
    await writeFileAtomic(context.indexFile, indexText);
    return {
      records,
      index,
      dataText,
      indexText,
      backupPath,
    };
  }

  async saveRecord(recordId, changes) {
    const library = await this.load();
    const updated = updateLibraryRecord(
      library.records,
      recordId,
      changes,
      this.now(),
    );
    const saved = await this.writeLibrary(updated.records);
    return {
      ...saved,
      record: updated.record,
    };
  }

  async addCatalogRecord(catalogItem, changes = {}) {
    const library = await this.load();
    const now = this.now();
    const record = createRecordFromCatalog(catalogItem, changes, now);
    if (library.records.some((entry) => entry.id === record.id)) {
      const error = new Error(`《${record.title}》已经在当前档案中`);
      error.status = 409;
      throw error;
    }

    const existingByExternalId = new Map();
    for (const entry of library.records) {
      for (const [source, id] of Object.entries(entry.externalIds ?? {})) {
        existingByExternalId.set(`${source}:${id}`, entry);
      }
    }
    for (const [source, id] of Object.entries(record.externalIds)) {
      const existing = existingByExternalId.get(`${source}:${id}`);
      if (existing) {
        const error = new Error(
          `该索引已存在于《${existing.title}》中，请勿重复添加`,
        );
        error.status = 409;
        throw error;
      }
    }

    const saved = await this.writeLibrary([...library.records, record]);
    return {
      ...saved,
      record,
    };
  }

  async addCatalogRecords(entries) {
    const library = await this.load();
    const result = appendCatalogRecords(
      library.records,
      entries,
      this.now(),
    );
    if (!result.addedRecords.length) {
      return {
        ...result,
        backupPath: null,
      };
    }

    const saved = await this.writeLibrary(result.records);
    return {
      ...saved,
      addedRecords: result.addedRecords,
      skipped: result.skipped,
    };
  }

  async deleteRecords(recordIds) {
    const library = await this.load();
    const result = removeLibraryRecords(library.records, recordIds);
    return this.writeLibrary(result.records);
  }

  async gitStatus() {
    const context = await this.context();
    const paths = [
      context.configFile,
      context.config.dataFile,
      context.config.indexFile,
      context.config.backupDirectory,
    ];
    const [branch, remote, status] = await Promise.all([
      runGit(this.root, ["branch", "--show-current"]),
      runGit(this.root, ["remote", "get-url", "origin"]).catch(() => ({
        stdout: "",
        stderr: "",
      })),
      runGit(this.root, ["status", "--short", "--", ...paths]),
    ]);
    return {
      branch: branch.stdout || "(detached)",
      remote: remote.stdout,
      dirty: Boolean(status.stdout),
      changes: status.stdout ? status.stdout.split("\n") : [],
    };
  }

  async sync(message = "") {
    const status = await this.gitStatus();
    if (!status.remote) {
      throw new Error("当前仓库没有配置 origin 远端");
    }
    const context = await this.context();
    const paths = [
      context.configFile,
      context.config.dataFile,
      context.config.indexFile,
      context.config.backupDirectory,
    ];
    await runGit(this.root, ["add", "--", ...paths]);
    const staged = await runGit(this.root, [
      "diff",
      "--cached",
      "--name-only",
      "--",
      ...paths,
    ]);
    const hasStagedChanges = Boolean(staged.stdout);
    let commit = "";
    if (hasStagedChanges) {
      const commitMessage =
        cleanString(message) ||
        `chore(data): sync anime library ${this.now().slice(0, 10)}`;
      await runGit(this.root, ["commit", "-m", commitMessage]);
      const head = await runGit(this.root, ["rev-parse", "--short", "HEAD"]);
      commit = head.stdout;
    }
    const push = await runGit(this.root, ["push"]);
    return {
      commit,
      pushed: true,
      output: [push.stdout, push.stderr].filter(Boolean).join("\n"),
      branch: status.branch,
    };
  }
}
