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
