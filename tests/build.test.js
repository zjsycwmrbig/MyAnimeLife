import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSite,
  compileRecordValidator,
  createRepositoryContext,
  loadEntries,
  loadLibrary,
  loadTemplate,
} from "../scripts/build.mjs";
import {
  buildAnimeIndex,
  serializeJsonl,
} from "../scripts/library-data.mjs";

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
    ["admin", "config", "schemas", "scripts", "templates"].map((directory) =>
      fs.cp(path.join(root, directory), path.join(fixtureRoot, directory), {
        recursive: true,
      }),
    ),
  );
  await fs.mkdir(path.join(fixtureRoot, "data", "backups"), {
    recursive: true,
  });
  await fs.writeFile(path.join(fixtureRoot, "data", "anime.jsonl"), "");
  await fs.writeFile(
    path.join(fixtureRoot, "data", "anime-index.jsonl"),
    "",
  );

  const configPath = path.join(fixtureRoot, "config", "site.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  config.template = template;
  config.repository.slug = "example/anime-records";
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

  return fixtureRoot;
}

async function writeLibrary(fixtureRoot, records) {
  await fs.writeFile(
    path.join(fixtureRoot, "data", "anime.jsonl"),
    serializeJsonl(records),
  );
  await fs.writeFile(
    path.join(fixtureRoot, "data", "anime-index.jsonl"),
    serializeJsonl(buildAnimeIndex(records)),
  );
}

test("handles an empty anime library", async () => {
  const fixtureRoot = await createBuildFixture("default");
  const entries = await loadEntries(fixtureRoot);
  assert.deepEqual(entries, []);
  await fs.rm(fixtureRoot, { recursive: true, force: true });
});

test("upgrades legacy cover URLs and marks Bangumi cover fallbacks", async () => {
  const fixtureRoot = await createBuildFixture("default");
  await writeLibrary(fixtureRoot, [
    {
      ...validRecord,
      coverUrl: "http://images.example.test/cover.jpg",
      externalIds: { bangumi: "400602" },
    },
  ]);

  await buildSite({
    root: fixtureRoot,
    now: new Date("2026-10-25T12:00:00Z"),
  });
  const indexHtml = await fs.readFile(
    path.join(fixtureRoot, "dist", "index.html"),
    "utf8",
  );
  const libraryJson = await fs.readFile(
    path.join(fixtureRoot, "dist", "data", "library.json"),
    "utf8",
  );
  assert.match(indexHtml, /src="https:\/\/images\.example\.test\/cover\.jpg"/u);
  assert.match(indexHtml, /data-bangumi-id="400602"/u);
  assert.match(libraryJson, /https:\/\/images\.example\.test\/cover\.jpg/u);
  await fs.rm(fixtureRoot, { recursive: true, force: true });
});

test("rejects a rating outside the defined range", async () => {
  const validate = await compileRecordValidator(root);
  assert.throws(
    () => validate({ ...validRecord, rating: 11 }),
    /rating must be <= 10/u,
  );
});

test("accepts optional season metadata and rejects inconsistent values", async () => {
  const validate = await compileRecordValidator(root);
  assert.doesNotThrow(() => validate(validRecord));
  assert.doesNotThrow(() =>
    validate({
      ...validRecord,
      season: {
        key: "bgm:400602",
        number: 2,
        label: "第2季",
        year: 2026,
      },
    }),
  );
  assert.throws(
    () =>
      validate({
        ...validRecord,
        season: {
          key: "bgm:400602",
          number: 0,
          label: "第0季",
          year: 2026,
        },
      }),
    /season\/number/u,
  );

  const fixtureRoot = await createBuildFixture("default");
  await writeLibrary(fixtureRoot, [
    {
      ...validRecord,
      season: {
        key: "bgm:400602",
        number: 2,
        label: null,
        year: 2026,
      },
    },
  ]);
  await assert.rejects(
    () => loadEntries(fixtureRoot),
    /season\.number 与 season\.label/u,
  );
  await fs.rm(fixtureRoot, { recursive: true, force: true });
});

test("uses the current GitHub branch for record edit links", () => {
  const context = createRepositoryContext(
    { repository: { slug: "", branch: "main" } },
    {
      GITHUB_REPOSITORY: "example/anime-records",
      GITHUB_REF_NAME: "records",
    },
  );
  assert.deepEqual(context, {
    slug: "example/anime-records",
    branch: "records",
    url: "https://github.com/example/anime-records",
  });
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
    await writeLibrary(fixtureRoot, [validRecord]);

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
    assert.match(indexHtml, /insights\//u);
    assert.match(indexHtml, /data-page-size="25"/u);
    assert.match(indexHtml, /id="records-pagination"/u);
    assert.match(indexHtml, /aria-label="记录分页"/u);
    assert.match(indexHtml, /id="pagination-size"/u);
    assert.match(indexHtml, /id="pagination-size-custom"/u);
    assert.match(indexHtml, /id="year-filter"/u);
    assert.match(indexHtml, /id="rating-min"/u);
    assert.match(indexHtml, /value="created-desc"/u);
    assert.match(indexHtml, /<option value="10">10<\/option>/u);
    assert.match(indexHtml, /<option value="100">100<\/option>/u);
    assert.match(indexHtml, /styles\.css\?v=20261025T120000000Z/u);
    assert.match(indexHtml, /share\.js\?v=20261025T120000000Z/u);
    assert.match(indexHtml, /app\.js\?v=20261025T120000000Z/u);
    assert.match(indexHtml, /class="header-icon-link header-admin-link"/u);
    assert.match(indexHtml, /aria-haspopup="dialog"/u);

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
    assert.match(detailHtml, /aria-haspopup="dialog"/u);

    const insightsHtml = await fs.readFile(
      path.join(fixtureRoot, "dist", "insights", "index.html"),
      "utf8",
    );
    assert.match(insightsHtml, /数据洞察/u);
    assert.match(insightsHtml, /近 7 天/u);
    assert.match(insightsHtml, /逐年分布/u);
    assert.match(insightsHtml, /精确到 0.1 分/u);
    assert.match(insightsHtml, /id="insights-year-sort"/u);
    assert.match(
      insightsHtml,
      /data-own-repository="example\/anime-records"/u,
    );
    assert.match(insightsHtml, /data-own-branch="main"/u);
    assert.match(insightsHtml, /分享洞察图/u);
    assert.match(insightsHtml, /aria-haspopup="dialog"/u);
    assert.match(
      insightsHtml,
      /share\.js\?v=20261025T120000000Z/u,
    );

    const shareScript = await fs.readFile(
      path.join(fixtureRoot, "dist", "assets", "share.js"),
      "utf8",
    );
    assert.match(shareScript, /share-dialog/u);
    assert.match(shareScript, /share-module/u);
    assert.match(shareScript, /longOverviewSvg/u);
    assert.match(shareScript, /cardOverviewSvg/u);
    const shareStyles = await fs.readFile(
      path.join(fixtureRoot, "dist", "assets", "styles.css"),
      "utf8",
    );
    assert.match(shareStyles, /\.share-dialog/u);
    assert.match(shareStyles, /\.share-dialog-actions/u);
    assert.match(shareStyles, /\.header-admin-link/u);

    const adminConfig = await fs.readFile(
      path.join(fixtureRoot, "dist", "admin", "config.js"),
      "utf8",
    );
    assert.match(adminConfig, /"mode": "github"/u);
    assert.match(adminConfig, /"repository": "example\/anime-records"/u);
    assert.match(adminConfig, /"branch": "main"/u);
    for (const file of [
      "admin/index.html",
      "admin/app.js",
      "admin/draft-store.js",
      "admin/runtime.js",
      "admin/github-client.js",
      "scripts/library-data.mjs",
      "scripts/catalog-data.mjs",
      "scripts/duplicate-data.mjs",
      "scripts/admin-data.mjs",
      "assets/share.js",
    ]) {
      await fs.access(path.join(fixtureRoot, "dist", file));
    }
    const adminHtml = await fs.readFile(
      path.join(fixtureRoot, "dist", "admin", "index.html"),
      "utf8",
    );
    assert.match(adminHtml, /id="pendingPanel"/u);
    assert.match(adminHtml, /加入待提交/u);

    const modules = [];
    for (const directory of ["admin", "scripts"]) {
      const folder = path.join(fixtureRoot, "dist", directory);
      for (const name of await fs.readdir(folder)) {
        if (/\.(?:js|mjs)$/u.test(name)) {
          modules.push(path.join(folder, name));
        }
      }
    }
    for (const modulePath of modules) {
      const source = await fs.readFile(modulePath, "utf8");
      const references = [
        ...source.matchAll(
          /(?:\bfrom\s+|\bimport\s*\()\s*["'](\.{1,2}\/[^"']+)["']/gu,
        ),
        ...source.matchAll(
          /new URL\(\s*["'](\.{1,2}\/[^"']+)["']\s*,\s*import\.meta\.url/gu,
        ),
      ].map((match) => match[1]);
      for (const reference of references) {
        await fs.access(path.resolve(path.dirname(modulePath), reference));
      }
    }

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

test("shows the season label on every detail template", async () => {
  const seasonRecord = {
    ...validRecord,
    season: {
      key: "bgm:400602",
      number: 2,
      label: "第2季",
      year: 2026,
    },
  };

  for (const template of ["default", "compact", "spotlight"]) {
    const fixtureRoot = await createBuildFixture(template);
    await writeLibrary(fixtureRoot, [seasonRecord]);
    await buildSite({
      root: fixtureRoot,
      now: new Date("2026-10-25T12:00:00Z"),
    });
    const detailHtml = await fs.readFile(
      path.join(
        fixtureRoot,
        "dist",
        "anime",
        seasonRecord.id,
        "index.html",
      ),
      "utf8",
    );
    assert.match(detailHtml, /第2季/u);
    assert.match(detailHtml, /2026/u);

    const indexHtml = await fs.readFile(
      path.join(fixtureRoot, "dist", "index.html"),
      "utf8",
    );
    assert.match(indexHtml, /id="share-config"/u);
    assert.match(indexHtml, /data-share-release="2026 · 第2季"/u);
    assert.match(indexHtml, /data-year="2026"/u);
    assert.doesNotMatch(indexHtml, /data-share-updated/u);
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});
