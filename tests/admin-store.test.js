import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { LibraryAdminStore } from "../scripts/admin-store.mjs";
import {
  buildAnimeIndex,
  parseJsonl,
  serializeJsonl,
} from "../scripts/library-data.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const baseRecord = {
  $schema: "../../schemas/anime.schema.json",
  schemaVersion: 1,
  id: "manual-admin-test",
  title: "管理页测试番剧",
  rating: 7.5,
  review: "旧评价",
  coverUrl: null,
  note: "旧备注",
  externalIds: {},
  season: {
    key: "manual-admin-test",
    number: 1,
    label: "第1季",
    year: 2026,
  },
  match: {
    status: "manual",
    method: "manual",
    source: "manual",
    confidence: 1,
    matchedTitle: "管理页测试番剧",
    matchedAt: "2026-10-25T12:00:00Z",
  },
  createdAt: "2026-10-25T12:00:00Z",
  updatedAt: "2026-10-25T12:00:00Z",
};

async function createFixture() {
  const fixtureRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "anime-admin-"),
  );
  await Promise.all(
    ["config", "schemas"].map((directory) =>
      fs.cp(path.join(root, directory), path.join(fixtureRoot, directory), {
        recursive: true,
      }),
    ),
  );
  await fs.mkdir(path.join(fixtureRoot, "data", "backups"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(fixtureRoot, "data", "anime.jsonl"),
    "",
    "utf8",
  );
  await fs.writeFile(
    path.join(fixtureRoot, "data", "anime-index.jsonl"),
    "",
    "utf8",
  );
  await fs.writeFile(
    path.join(fixtureRoot, "data", "bangumi-cache.jsonl"),
    "",
    "utf8",
  );
  return fixtureRoot;
}

async function writeLibrary(fixtureRoot, records) {
  await fs.writeFile(
    path.join(fixtureRoot, "data", "anime.jsonl"),
    serializeJsonl(records),
    "utf8",
  );
  await fs.writeFile(
    path.join(fixtureRoot, "data", "anime-index.jsonl"),
    serializeJsonl(buildAnimeIndex(records)),
    "utf8",
  );
}

async function cleanup(fixtureRoot) {
  await fs.rm(fixtureRoot, { recursive: true, force: true });
}

test("keeps legacy site configs working with the default Bangumi cache path", async () => {
  const fixtureRoot = await createFixture();
  try {
    const configFile = path.join(fixtureRoot, "config", "site.json");
    const config = JSON.parse(await fs.readFile(configFile, "utf8"));
    delete config.bangumiCacheFile;
    await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const store = new LibraryAdminStore(fixtureRoot);
    const cache = await store.loadBangumiCache();

    assert.equal(cache.file, "data/bangumi-cache.jsonl");
    assert.equal(cache.count, 0);
  } finally {
    await cleanup(fixtureRoot);
  }
});

test("saves edits and rebuilds the lightweight JSONL index", async () => {
  const fixtureRoot = await createFixture();
  try {
    await writeLibrary(fixtureRoot, [baseRecord]);
    const store = new LibraryAdminStore(fixtureRoot, {
      now: () => "2026-10-25T13:00:00.000Z",
    });

    const result = await store.saveRecord(baseRecord.id, {
      title: "修改后的中文标题",
      rating: "9.26",
      review: "**更新后的评价**",
      note: "新备注",
    });

    assert.equal(result.record.rating, 9.3);
    assert.equal(result.record.updatedAt, "2026-10-25T13:00:00.000Z");
    const library = await store.load();
    assert.equal(library.records[0].title, "修改后的中文标题");
    assert.equal(library.records[0].review, "**更新后的评价**");
    assert.equal(library.index[0].reviewExcerpt, "更新后的评价");
    assert.equal(library.index[0].rating, 9.3);
    assert.ok(result.backupPath);
  } finally {
    await cleanup(fixtureRoot);
  }
});

test("saves display and share preferences to the site config", async () => {
  const fixtureRoot = await createFixture();
  try {
    const store = new LibraryAdminStore(fixtureRoot);
    const initial = await store.siteSettings();
    assert.ok(["default", "compact", "spotlight"].includes(initial.template));
    assert.ok(["default", "compact", "spotlight"].includes(initial.share.template));

    const saved = await store.saveSiteSettings({
      site: {
        title: "季度动画日记",
        brand: "ANIME LOG",
        description: "按季度整理的私人番剧档案。",
        footer: "由 MyAnimeLife 构建",
      },
      template: "spotlight",
      share: { template: "compact", accent: "blue" },
    });

    assert.equal(saved.settings.template, "spotlight");
    assert.equal(saved.settings.share.resolvedTemplate, "compact");
    const config = JSON.parse(
      await fs.readFile(
        path.join(fixtureRoot, "config", "site.json"),
        "utf8",
      ),
    );
    assert.equal(config.site.title, "季度动画日记");
    assert.equal(config.template, "spotlight");
    assert.deepEqual(config.share, {
      template: "compact",
      accent: "blue",
    });
    assert.equal(config.dataFile, "data/anime.jsonl");
  } finally {
    await cleanup(fixtureRoot);
  }
});

test("keeps Bangumi cache as personal data beside the anime library", async () => {
  const fixtureRoot = await createFixture();
  try {
    await writeLibrary(fixtureRoot, [baseRecord]);
    const store = new LibraryAdminStore(fixtureRoot);
    const initial = await store.loadBangumiCache();
    assert.equal(initial.count, 0);

    const saved = await store.saveBangumiCache({
      mode: "merge",
      entries: [
        {
          subjectId: "101",
          score: 8.1,
          ratingCount: 120,
          tags: [{ name: "科幻", count: 80 }],
          coverUrl: "https://images.example.test/101.jpg",
          fetchedAt: "2026-10-27T08:00:00Z",
          source: "bangumi-archive",
        },
        {
          subjectId: "102",
          score: 7.6,
          tags: [{ name: "日常", count: 50 }],
          fetchedAt: "2026-10-27T09:00:00Z",
          source: "bangumi-api",
        },
      ],
    });

    assert.equal(saved.changed, true);
    assert.equal(saved.count, 2);
    const personalFile = path.join(
      fixtureRoot,
      "data",
      "bangumi-cache.jsonl",
    );
    assert.match(await fs.readFile(personalFile, "utf8"), /"subjectId":"101"/u);
    assert.equal((await store.load()).records.length, 1);
    assert.deepEqual(
      await fs.readdir(path.join(fixtureRoot, "data", "backups")),
      [],
    );

    const merged = await store.saveBangumiCache({
      mode: "merge",
      entries: [
        {
          subjectId: "101",
          score: 9.2,
          fetchedAt: "2026-10-27T10:00:00Z",
          source: "bangumi-api",
        },
      ],
    });
    assert.equal(
      merged.entries.find((entry) => entry.subjectId === "101")?.score,
      9.2,
    );

    const removed = await store.saveBangumiCache({
      mode: "remove",
      subjectIds: ["102"],
    });
    assert.deepEqual(
      removed.entries.map((entry) => entry.subjectId),
      ["101"],
    );
    assert.equal((await store.loadBangumiCache()).count, 1);
  } finally {
    await cleanup(fixtureRoot);
  }
});

test("keeps a saved edit loadable when the stored timestamp is ahead", async () => {
  const fixtureRoot = await createFixture();
  try {
    await writeLibrary(fixtureRoot, [baseRecord]);
    const store = new LibraryAdminStore(fixtureRoot, {
      now: () => "2026-10-25T11:00:00.000Z",
    });

    const result = await store.saveRecord(baseRecord.id, {
      rating: 8.8,
      review: "本机时钟较早时的评价",
    });
    const reloaded = await store.load();

    assert.equal(result.record.updatedAt, "2026-10-25T12:00:00.001Z");
    assert.equal(reloaded.records[0].rating, 8.8);
    assert.equal(reloaded.records[0].review, "本机时钟较早时的评价");
  } finally {
    await cleanup(fixtureRoot);
  }
});

test("deletes selected records and keeps at most five backup snapshots", async () => {
  const fixtureRoot = await createFixture();
  try {
    const secondRecord = {
      ...baseRecord,
      id: "manual-admin-second",
      title: "第二部测试番剧",
      externalIds: {},
    };
    delete secondRecord.season;
    await writeLibrary(fixtureRoot, [baseRecord, secondRecord]);
    let timestamp = 0;
    const store = new LibraryAdminStore(fixtureRoot, {
      now: () => {
        timestamp += 1;
        return `2026-10-25T13:00:${String(timestamp).padStart(2, "0")}.000Z`;
      },
    });

    for (let index = 0; index < 6; index += 1) {
      await store.saveRecord(baseRecord.id, {
        rating: 6 + index / 10,
      });
    }
    const afterRotation = await store.load();
    const backupNames = (
      await fs.readdir(path.join(fixtureRoot, "data", "backups"))
    )
      .filter((name) => /^library-.*\.json$/u.test(name))
      .sort();
    assert.equal(backupNames.length, 5);
    for (const name of backupNames) {
      const snapshot = JSON.parse(
        await fs.readFile(
          path.join(fixtureRoot, "data", "backups", name),
          "utf8",
        ),
      );
      assert.equal(snapshot.kind, "anime-library-backup");
      assert.ok(Array.isArray(parseJsonl(snapshot.animeText)));
      assert.ok(Array.isArray(parseJsonl(snapshot.indexText)));
    }

    const deleted = await store.deleteRecords([baseRecord.id]);
    assert.deepEqual(
      deleted.records.map((record) => record.id),
      [secondRecord.id],
    );
    assert.equal(afterRotation.records.length, 2);
    const finalLibrary = await store.load();
    assert.equal(finalLibrary.records.length, 1);
    assert.equal(finalLibrary.index.length, 1);
  } finally {
    await cleanup(fixtureRoot);
  }
});

test("adds a catalog candidate and rejects duplicate external ids", async () => {
  const fixtureRoot = await createFixture();
  try {
    await writeLibrary(fixtureRoot, []);
    const store = new LibraryAdminStore(fixtureRoot, {
      now: () => "2026-10-25T13:00:00.000Z",
    });
    const catalogItem = {
      id: "bangumi:400602",
      title: "葬送のフリーレン",
      displayTitle: "葬送的芙莉莲",
      names: ["葬送のフリーレン", "葬送的芙莉莲"],
      type: "tv",
      begin: "2023-09-29T15:00:00.000Z",
      year: 2023,
      sites: {
        bangumi: "400602",
        bilibiliMedia: "292073015",
      },
      season: {
        key: "bangumi:400602",
        number: 1,
        label: "第1季",
        year: 2023,
      },
      coverUrl: null,
    };

    const added = await store.addCatalogRecord(catalogItem, {
      rating: 9.4,
      review: "很喜欢",
    });
    assert.equal(added.record.id, "bgm-400602");
    assert.equal(added.record.title, "葬送的芙莉莲");
    assert.equal(added.record.rating, 9.4);
    assert.equal((await store.load()).records.length, 1);

    await assert.rejects(
      () =>
        store.addCatalogRecord({
          ...catalogItem,
          id: "bangumi:alternate",
          title: "重复条目",
          displayTitle: "重复条目",
          sites: { bilibiliMedia: "292073015" },
        }),
      (error) =>
        error.status === 409 && /请勿重复添加/u.test(error.message),
    );
    assert.equal((await store.load()).records.length, 1);
  } finally {
    await cleanup(fixtureRoot);
  }
});

test("batch adds catalog candidates with one write and skips duplicate identities", async () => {
  const fixtureRoot = await createFixture();
  try {
    await writeLibrary(fixtureRoot, [
      {
        ...baseRecord,
        id: "manual-existing",
        title: "已有作品",
        externalIds: { mal: "99" },
      },
    ]);
    const store = new LibraryAdminStore(fixtureRoot, {
      now: () => "2026-10-25T13:00:00.000Z",
    });
    const firstItem = {
      id: "bangumi:400602",
      title: "葬送のフリーレン",
      displayTitle: "葬送的芙莉莲",
      names: ["葬送のフリーレン", "葬送的芙莉莲"],
      type: "tv",
      begin: "2023-09-29T15:00:00.000Z",
      year: 2023,
      sites: {
        bangumi: "400602",
        bilibiliMedia: "292073015",
      },
      season: {
        key: "bangumi:400602",
        number: 1,
        label: "第1季",
        year: 2023,
      },
      coverUrl: null,
    };
    const secondItem = {
      ...firstItem,
      id: "bangumi:500000",
      title: "第二部作品",
      displayTitle: "第二部作品",
      sites: { bilibiliMedia: "300", mal: "2" },
      season: {
        key: "bangumi:500000",
        number: 2,
        label: "第2季",
        year: 2024,
      },
    };

    const result = await store.addCatalogRecords([
      { item: firstItem, rating: 9.2, review: "批量评价" },
      { item: secondItem, rating: "", review: "" },
      { item: firstItem, rating: 1, review: "批次重复" },
      {
        item: {
          ...firstItem,
          id: "bangumi:alternate",
          sites: { bilibiliMedia: "301", mal: "2" },
        },
      },
      {
        item: {
          ...firstItem,
          id: "bangumi:existing",
          sites: { bangumi: "999", mal: "99" },
        },
      },
    ]);

    assert.equal(result.addedRecords.length, 2);
    assert.equal(result.skipped.length, 3);
    assert.deepEqual(
      result.skipped.map((entry) => entry.reason),
      ["batch-duplicate", "batch-external-id", "existing-external-id"],
    );
    assert.equal(result.addedRecords[0].rating, 9.2);
    assert.equal(result.addedRecords[0].review, "批量评价");
    assert.equal(result.addedRecords[1].rating, null);
    assert.equal(result.addedRecords[1].review, "");
    assert.equal((await store.load()).records.length, 3);
    const backupNames = (
      await fs.readdir(path.join(fixtureRoot, "data", "backups"))
    ).filter((name) => /^library-.*\.json$/u.test(name));
    assert.equal(backupNames.length, 1);
  } finally {
    await cleanup(fixtureRoot);
  }
});

test("commits queued edits and additions together with one backup", async () => {
  const fixtureRoot = await createFixture();
  try {
    await writeLibrary(fixtureRoot, [baseRecord]);
    const store = new LibraryAdminStore(fixtureRoot, {
      now: () => "2026-10-25T14:00:00.000Z",
    });
    const result = await store.batchUpdate(
      [
        {
          id: baseRecord.id,
          changes: { rating: 9.6, review: "队列中的修改", note: "同步备注" },
        },
      ],
      [
        {
          item: {
            id: "bangumi:400602",
            title: "葬送のフリーレン",
            displayTitle: "葬送的芙莉莲",
            names: ["葬送のフリーレン", "葬送的芙莉莲"],
            type: "tv",
            begin: "2023-09-29T15:00:00.000Z",
            year: 2023,
            sites: { bangumi: "400602" },
            season: {
              key: "bangumi:400602",
              number: 1,
              label: "第1季",
              year: 2023,
            },
            coverUrl: "https://images.example.test/frieren.jpg",
          },
          rating: 8.8,
          review: "队列中的新增",
        },
      ],
    );

    assert.equal(result.changed, true);
    assert.equal(result.updatedRecords.length, 1);
    assert.equal(result.addedRecords.length, 1);
    assert.equal(result.records.length, 2);
    assert.equal(result.index.length, 2);
    const editedRecord = result.records.find(
      (record) => record.id === baseRecord.id,
    );
    const addedRecord = result.records.find(
      (record) => record.id === "bgm-400602",
    );
    assert.equal(editedRecord.rating, 9.6);
    assert.equal(
      addedRecord.coverUrl,
      "https://images.example.test/frieren.jpg",
    );
    const library = await store.load();
    assert.equal(library.records.length, 2);
    assert.equal(library.index.length, 2);
    const backupNames = (
      await fs.readdir(path.join(fixtureRoot, "data", "backups"))
    ).filter((name) => /^library-.*\.json$/u.test(name));
    assert.equal(backupNames.length, 1);

    const unchanged = await store.batchUpdate([], []);
    assert.equal(unchanged.changed, false);
    assert.equal(unchanged.backupPath, null);
  } finally {
    await cleanup(fixtureRoot);
  }
});

test("commits data changes and pushes them to origin", async () => {
  const fixtureRoot = await createFixture();
  const remoteRoot = `${fixtureRoot}-remote.git`;
  try {
    await writeLibrary(fixtureRoot, [baseRecord]);
    await execFileAsync("git", ["init", "--initial-branch=main"], {
      cwd: fixtureRoot,
    });
    await execFileAsync("git", ["config", "user.name", "Admin Test"], {
      cwd: fixtureRoot,
    });
    await execFileAsync(
      "git",
      ["config", "user.email", "admin@example.invalid"],
      { cwd: fixtureRoot },
    );
    await execFileAsync("git", ["add", "."], { cwd: fixtureRoot });
    await execFileAsync("git", ["commit", "-m", "test: initial library"], {
      cwd: fixtureRoot,
    });
    await execFileAsync("git", ["init", "--bare", remoteRoot]);
    await execFileAsync("git", ["remote", "add", "origin", remoteRoot], {
      cwd: fixtureRoot,
    });
    await execFileAsync(
      "git",
      ["push", "--set-upstream", "origin", "main"],
      { cwd: fixtureRoot },
    );

    const store = new LibraryAdminStore(fixtureRoot, {
      now: () => "2026-10-25T13:00:00.000Z",
    });
    await store.saveRecord(baseRecord.id, {
      rating: 9.8,
      review: "准备同步到远端",
    });
    const sync = await store.sync("chore(data): test admin sync");
    assert.equal(sync.pushed, true);
    assert.ok(sync.commit);
    const { stdout: remoteLog } = await execFileAsync(
      "git",
      ["--git-dir", remoteRoot, "log", "-1", "--pretty=%s", "main"],
    );
    assert.equal(remoteLog.trim(), "chore(data): test admin sync");
    const status = await store.gitStatus();
    assert.equal(status.dirty, false);
  } finally {
    await cleanup(fixtureRoot);
    await cleanup(remoteRoot);
  }
});
