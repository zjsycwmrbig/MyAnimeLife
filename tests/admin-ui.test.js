import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const readAdminFile = (path) =>
  fs.readFile(new URL(`../admin/${path}`, import.meta.url), "utf8");

test("catalog batch submission uses its own pending draft refresh", async () => {
  const source = await readAdminFile("catalog.js");

  assert.match(source, /function refreshPendingCatalogDrafts\(\)/u);
  assert.match(source, /refreshPendingCatalogDrafts\(\);/u);
  assert.doesNotMatch(source, /\brefreshPendingDrafts\b/u);
});

test("catalog clear events cannot restore submitted selections", async () => {
  const source = await readAdminFile("catalog.js");
  const clearGuard = source.match(
    /if \(source === "clear" && pendingCount\(drafts\) === 0\) \{([\s\S]*?)\n  \}/u,
  );

  assert.ok(clearGuard);
  assert.match(clearGuard[1], /state\.selectedItems\.clear\(\)/u);
  assert.match(clearGuard[1], /state\.drafts\.clear\(\)/u);
  assert.match(clearGuard[1], /state\.dirty = false/u);
  assert.match(clearGuard[1], /renderBatchEditor\(\)/u);
});

test("catalog operation log panel is wired into the batch workflow", async () => {
  const [source, html, styles] = await Promise.all([
    readAdminFile("catalog.js"),
    readAdminFile("index.html"),
    readAdminFile("styles.css"),
  ]);

  assert.match(source, /function appendOperationLog\(/u);
  assert.match(source, /clearOperationLogs\(/u);
  assert.match(source, /提交失败：\$\{error\.message\}/u);
  assert.match(html, /id="catalogOperationLogPanel"/u);
  assert.match(html, /id="catalogOperationLogList"/u);
  assert.match(styles, /\.catalog-operation-log/u);
});
