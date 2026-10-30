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

test("settings page switches independent panels with a vertical tab list", async () => {
  const [html, styles, source] = await Promise.all([
    readAdminFile("index.html"),
    readAdminFile("styles.css"),
    readAdminFile("catalog.js"),
  ]);

  assert.match(html, />站点设置</u);
  assert.doesNotMatch(html, />站点样式</u);
  assert.match(html, /class="settings-nav"[\s\S]*?role="tablist"/u);
  assert.match(html, /role="tab"/u);
  assert.match(html, /role="tabpanel"/u);
  assert.match(html, /id="settingsTabTags"/u);
  for (const section of ["site", "display", "share", "tags", "local-cache"]) {
    assert.match(html, new RegExp(`data-settings-nav="${section}"`, "u"));
    assert.match(html, new RegExp(`data-settings-section="${section}"`, "u"));
  }
  assert.match(styles, /\.settings-nav \{[\s\S]*?position: sticky;/u);
  assert.match(styles, /\.settings-nav button/u);
  assert.match(styles, /\.settings-section\[hidden\]/u);
  assert.match(source, /function activateSettingsSection\(/u);
  assert.match(source, /panel\.dataset\.settingsSection !== sectionName/u);
  assert.doesNotMatch(source, /function scrollToSettingsSection\(/u);
  assert.doesNotMatch(source, /function updateSettingsNavigation\(/u);
});

test("tag preference editor separates selected tags from a heat-ranked pool", async () => {
  const [html, styles, source] = await Promise.all([
    readAdminFile("index.html"),
    readAdminFile("styles.css"),
    readAdminFile("catalog.js"),
  ]);

  assert.match(html, /id="tagManualEditor"/u);
  assert.match(html, /id="tagSelectedAxes"/u);
  assert.match(html, /class="tag-picker-group tag-picker-selected"/u);
  assert.match(html, /class="tag-picker-group tag-pool"/u);
  assert.match(html, /id="tagKnownSearch"/u);
  assert.match(html, /id="tagKnownCatalog"/u);
  assert.match(html, /id="tagPoolSummary"/u);
  assert.match(html, /id="tagCustomInput"/u);
  assert.match(html, /按公共番剧索引中的总热度排序/u);
  assert.match(source, /readKnownBangumiTags/u);
  assert.match(source, /function renderKnownTagCatalog\(/u);
  assert.match(source, /function resolveManualTagName\(/u);
  assert.match(source, /const existingIndex = axes\.findIndex/u);
  assert.match(source, /axes\[existingIndex\] = resolved\.name/u);
  assert.match(source, /data-tag-axis-action/u);
  assert.match(styles, /\.tag-picker-group/u);
  assert.match(styles, /\.tag-pool-meta/u);
  assert.match(styles, /\.known-tag-chip/u);
  assert.match(styles, /\.tag-selected-list/u);
});

test("recommendation covers keep a loading state and no-referrer policy", async () => {
  const source = await readAdminFile("../scripts/similar.js");

  assert.match(source, /function appendCoverImage\(cover, coverUrl, title\)/u);
  assert.match(source, /image\.referrerPolicy = "no-referrer"/u);
  assert.match(source, /const coverUrl = safeCoverUrl\(item\.coverUrl\)/u);
  assert.match(source, /hydrateCover\(item, cover\)/u);
});
