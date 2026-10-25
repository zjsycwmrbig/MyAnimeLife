import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSite,
  compileRecordValidator,
  loadEntries,
  loadTemplate,
} from "../scripts/build.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const validRecord = {
  $schema: "../../schemas/anime.schema.json",
  schemaVersion: 1,
  id: "manual-test",
  title: "测试番剧",
  rating: null,
  review: "",
  coverUrl: null,
  note: "",
  externalIds: {},
  match: {
    status: "manual",
    method: "manual",
    source: "manual",
    confidence: 1,
    matchedTitle: "测试番剧",
    matchedAt: "2026-10-25T12:00:00Z",
  },
  createdAt: "2026-10-25T12:00:00Z",
  updatedAt: "2026-10-25T12:00:00Z",
};

async function createBuildFixture(template) {
  const fixtureRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), `anime-records-${template}-`),
  );

  await Promise.all(
    ["config", "schemas", "templates"].map((directory) =>
      fs.cp(path.join(root, directory), path.join(fixtureRoot, directory), {
        recursive: true,
      }),
    ),
  );
  await fs.mkdir(path.join(fixtureRoot, "data", "anime"), {
    recursive: true,
  });

  const configPath = path.join(fixtureRoot, "config", "site.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  config.template = template;
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  return fixtureRoot;
}

test("handles an empty anime library", async () => {
  const fixtureRoot = await createBuildFixture("default");
  const entries = await loadEntries(fixtureRoot);
  assert.deepEqual(entries, []);
  await fs.rm(fixtureRoot, { recursive: true, force: true });
});

test("rejects a rating outside the defined range", async () => {
  const validate = await compileRecordValidator(root);
  assert.throws(
    () => validate({ ...validRecord, rating: 11 }),
    /rating must be <= 10/u,
  );
});

test("ships three independently buildable templates", async () => {
  const templateHeadings = {
    default: "全部记录",
    compact: "作品清单",
    spotlight: "作品墙",
  };

  for (const [template, heading] of Object.entries(templateHeadings)) {
    const loaded = await loadTemplate(root, template);
    assert.equal(loaded.manifest.id, template);

    const fixtureRoot = await createBuildFixture(template);
    await fs.writeFile(
      path.join(fixtureRoot, "data", "anime", `${validRecord.id}.json`),
      `${JSON.stringify(validRecord, null, 2)}\n`,
    );

    const result = await buildSite({
      root: fixtureRoot,
      now: new Date("2026-10-25T12:00:00Z"),
    });
    assert.equal(result.entryCount, 1);
    assert.equal(result.template, template);

    const indexHtml = await fs.readFile(
      path.join(fixtureRoot, "dist", "index.html"),
      "utf8",
    );
    assert.match(indexHtml, new RegExp(heading, "u"));
    assert.match(indexHtml, /测试番剧/u);

    const detailHtml = await fs.readFile(
      path.join(
        fixtureRoot,
        "dist",
        "anime",
        validRecord.id,
        "index.html",
      ),
      "utf8",
    );
    assert.match(detailHtml, /我的评价/u);

    const library = JSON.parse(
      await fs.readFile(
        path.join(fixtureRoot, "dist", "data", "library.json"),
        "utf8",
      ),
    );
    assert.equal(library.itemCount, 1);

    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});
