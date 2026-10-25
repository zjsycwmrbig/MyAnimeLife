import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTemplateTree,
  getTemplateStatus,
} from "../admin/template-updater.js";

test("template tree keeps every target data file and replaces non-data files", () => {
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
          author: { login: "maintainer" },
          commit: {
            message: "feat: improve archive\n\nDetails",
            author: {
              name: "Template Maintainer",
              date: "2026-10-25T12:00:00Z",
            },
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
