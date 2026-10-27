import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplateTree,
  compareTemplateTrees,
  getTemplateStatus,
  getTemplateUpdateStatus,
  updateFromTemplate,
} from "../admin/template-updater.js";

test("template tree keeps target data and personal site settings", () => {
  const next = buildTemplateTree(
    {
      tree: [
        { path: "admin/index.html", type: "blob", mode: "100644", sha: "template-admin" },
        { path: "data/anime.jsonl", type: "blob", mode: "100644", sha: "template-empty" },
        { path: "data/bangumi-cache.jsonl", type: "blob", mode: "100644", sha: "template-cache" },
        { path: "data/README.md", type: "blob", mode: "100644", sha: "template-data-readme" },
      ],
    },
    {
      tree: [
        { path: "admin/index.html", type: "blob", mode: "100644", sha: "old-admin" },
        { path: "config/site.json", type: "blob", mode: "100644", sha: "personal-config" },
        { path: "data/anime.jsonl", type: "blob", mode: "100644", sha: "personal-records" },
        { path: "data/bangumi-cache.jsonl", type: "blob", mode: "100644", sha: "personal-cache" },
        { path: "data/backups/library-old.json", type: "blob", mode: "100644", sha: "personal-backup" },
      ],
    },
  );

  assert.deepEqual(next, [
    { path: "admin/index.html", mode: "100644", type: "blob", sha: "template-admin" },
    { path: "config/site.json", mode: "100644", type: "blob", sha: "personal-config" },
    { path: "data/anime.jsonl", mode: "100644", type: "blob", sha: "personal-records" },
    { path: "data/backups/library-old.json", mode: "100644", type: "blob", sha: "personal-backup" },
    { path: "data/bangumi-cache.jsonl", mode: "100644", type: "blob", sha: "personal-cache" },
    { path: "data/README.md", mode: "100644", type: "blob", sha: "template-data-readme" },
  ]);
});

test("reads the latest template commit details", async () => {
  const status = await getTemplateStatus(
    {
      async getRefFor() {
        return { object: { sha: "a".repeat(40) } };
      },
      async getCommitFor() {
        return {
          html_url: "https://github.com/example/template/commit/abc",
          message: "feat: improve archive\n\nDetails",
          author: {
            name: "Template Maintainer",
            date: "2026-10-25T12:00:00Z",
          },
        };
      },
    },
    { repository: "example/template", branch: "main" },
  );

  assert.deepEqual(status, {
    repository: "example/template",
    branch: "main",
    commit: "a".repeat(40),
    commitShort: "aaaaaaa",
    commitMessage: "feat: improve archive",
    commitAuthor: "Template Maintainer",
    commitDate: "2026-10-25T12:00:00Z",
    commitUrl: "https://github.com/example/template/commit/abc",
  });
});

test("detects updates by comparing non-data template files", () => {
  const result = compareTemplateTrees(
    {
      tree: [
        { path: "admin/app.js", type: "blob", mode: "100644", sha: "new-app" },
        { path: "data/anime.jsonl", type: "blob", mode: "100644", sha: "template-empty" },
      ],
    },
    {
      tree: [
        { path: "admin/app.js", type: "blob", mode: "100644", sha: "old-app" },
        { path: "data/anime.jsonl", type: "blob", mode: "100644", sha: "personal" },
        { path: "custom/page.html", type: "blob", mode: "100644", sha: "custom" },
      ],
    },
  );
  assert.equal(result.updateAvailable, true);
  assert.equal(result.changedFileCount, 2);
  assert.deepEqual(result.changedPaths, ["admin/app.js", "custom/page.html"]);
});

test("reports update availability and the last template update commit", async () => {
  const templateSha = "a".repeat(40);
  const targetSha = "b".repeat(40);
  const progress = [];
  const status = await getTemplateUpdateStatus({
    repository: "example/anime-records",
    branch: "main",
    async getRefFor() {
      return { object: { sha: templateSha } };
    },
    async getRef() {
      return { object: { sha: targetSha } };
    },
    async getCommitFor(repository, sha) {
      if (repository === "example/template") {
        return {
          tree: { sha: "template-tree" },
          message: "feat: latest",
          author: { name: "Maintainer", date: "2026-10-26T10:00:00Z" },
        };
      }
      return {
        tree: { sha: "target-tree" },
        message: "chore(data): update anime library",
        author: { name: "Owner", date: "2026-10-26T11:00:00Z" },
      };
    },
    async getTreeFor(repository) {
      return repository === "example/template"
        ? {
            tree: [
              { path: "admin/app.js", type: "blob", sha: "new" },
              { path: "data/anime.jsonl", type: "blob", sha: "template-data" },
            ],
          }
        : {
            tree: [
              { path: "admin/app.js", type: "blob", sha: "old" },
              { path: "data/anime.jsonl", type: "blob", sha: "personal-data" },
            ],
          };
    },
    async request() {
      return [
        {
          sha: "c".repeat(40),
          html_url: "https://github.com/example/anime-records/commit/ccccccc",
          commit: {
            message: "chore(admin): update from MyAnimeLife template",
            author: { name: "Owner", date: "2026-10-25T09:00:00Z" },
          },
        },
      ];
    },
  }, {
    repository: "example/template",
    branch: "main",
    onProgress(entry) {
      progress.push(entry);
    },
  });

  assert.equal(status.updateAvailable, true);
  assert.equal(status.changedFileCount, 1);
  assert.equal(status.targetCommitShort, "bbbbbbb");
  assert.equal(status.lastTemplateUpdate.commitShort, "ccccccc");
  assert.deepEqual(
    progress.map((entry) => entry.stage),
    ["check:start", "check:compare"],
  );
  assert.match(progress[1].message, /1 个待同步文件/u);
});

test("copies only template files that differ from the target", async () => {
  const rawRequests = [];
  const blobRequests = [];
  const writeRequests = [];
  const progress = [];
  const client = {
    token: "github_pat_test",
    repository: "example/personal",
    branch: "main",
    retryCount: 0,
    async getRef() {
      return { object: { sha: "target-head" } };
    },
    async getRefFor(repository) {
      assert.equal(repository, "example/template");
      return { object: { sha: "template-head" } };
    },
    async getCommitFor(repository) {
      if (repository === "example/template") {
        return {
          message: "feat: latest template",
          author: { name: "Maintainer", date: "2026-10-27T10:00:00Z" },
        };
      }
      return { tree: { sha: "target-tree" } };
    },
    async getTreeFor(repository) {
      return repository === "example/template"
        ? {
            tree: [
              {
                path: "admin/app.js",
                type: "blob",
                mode: "100644",
                sha: "template-changed",
              },
              {
                path: "admin/shared.css",
                type: "blob",
                mode: "100644",
                sha: "shared-blob",
              },
              {
                path: "data/anime.jsonl",
                type: "blob",
                mode: "100644",
                sha: "template-data",
              },
            ],
          }
        : {
            tree: [
              {
                path: "admin/app.js",
                type: "blob",
                mode: "100644",
                sha: "target-old",
              },
              {
                path: "admin/shared.css",
                type: "blob",
                mode: "100644",
                sha: "shared-blob",
              },
              {
                path: "data/anime.jsonl",
                type: "blob",
                mode: "100644",
                sha: "personal-data",
              },
              {
                path: "config/site.json",
                type: "blob",
                mode: "100644",
                sha: "personal-config",
              },
            ],
          };
    },
    async getRawBase64For(repository, path, ref) {
      assert.equal(repository, "example/template");
      assert.equal(ref, "main");
      rawRequests.push(path);
      return Buffer.from(`content:${path}`).toString("base64");
    },
    async createBlobBase64(content) {
      const text = Buffer.from(content, "base64").toString("utf8");
      blobRequests.push(text);
      return `copied-${text.replace("content:", "")}`;
    },
    async request(path, options = {}) {
      writeRequests.push({ path, options });
      if (path === "/git/trees") {
        return { sha: "next-tree" };
      }
      if (path === "/git/commits") {
        return { sha: "next-commit" };
      }
      if (path === "/git/refs/heads/main") {
        return { object: { sha: "next-commit" } };
      }
      throw new Error(`Unexpected request: ${path}`);
    },
  };

  const result = await updateFromTemplate(client, {
    repository: "example/template",
    branch: "main",
    onProgress(entry) {
      progress.push(entry);
    },
  });

  assert.deepEqual(rawRequests, ["admin/app.js"]);
  assert.deepEqual(blobRequests, ["content:admin/app.js"]);
  assert.equal(result.updatedFiles, 1);

  const treeRequest = writeRequests.find(({ path }) => path === "/git/trees");
  const entries = new Map(
    treeRequest.options.body.tree.map((entry) => [entry.path, entry.sha]),
  );
  assert.equal(entries.get("admin/app.js"), "copied-admin/app.js");
  assert.equal(entries.get("admin/shared.css"), "shared-blob");
  assert.equal(entries.get("data/anime.jsonl"), "personal-data");
  assert.equal(entries.get("config/site.json"), "personal-config");
  assert.deepEqual(
    progress.map((entry) => entry.stage),
    [
      "update:start",
      "update:versions",
      "update:compare",
      "update:files",
      "update:tree",
      "update:commit",
      "update:publish",
      "update:complete",
    ],
  );
  assert.match(progress[3].message, /admin\/app\.js/u);
});
