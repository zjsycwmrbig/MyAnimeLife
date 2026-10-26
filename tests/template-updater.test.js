import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplateTree,
  compareTemplateTrees,
  getTemplateStatus,
  getTemplateUpdateStatus,
} from "../admin/template-updater.js";

test("template tree keeps target data and personal site settings", () => {
  const next = buildTemplateTree(
    {
      tree: [
        { path: "admin/index.html", type: "blob", mode: "100644", sha: "template-admin" },
        { path: "data/anime.jsonl", type: "blob", mode: "100644", sha: "template-empty" },
        { path: "data/README.md", type: "blob", mode: "100644", sha: "template-data-readme" },
      ],
    },
    {
      tree: [
        { path: "admin/index.html", type: "blob", mode: "100644", sha: "old-admin" },
        { path: "config/site.json", type: "blob", mode: "100644", sha: "personal-config" },
        { path: "data/anime.jsonl", type: "blob", mode: "100644", sha: "personal-records" },
        { path: "data/backups/library-old.json", type: "blob", mode: "100644", sha: "personal-backup" },
      ],
    },
  );

  assert.deepEqual(next, [
    { path: "admin/index.html", mode: "100644", type: "blob", sha: "template-admin" },
    { path: "config/site.json", mode: "100644", type: "blob", sha: "personal-config" },
    { path: "data/anime.jsonl", mode: "100644", type: "blob", sha: "personal-records" },
    { path: "data/backups/library-old.json", mode: "100644", type: "blob", sha: "personal-backup" },
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
  }, { repository: "example/template", branch: "main" });

  assert.equal(status.updateAvailable, true);
  assert.equal(status.changedFileCount, 1);
  assert.equal(status.targetCommitShort, "bbbbbbb");
  assert.equal(status.lastTemplateUpdate.commitShort, "ccccccc");
});
