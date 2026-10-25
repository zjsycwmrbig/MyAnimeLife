import { test, expect } from "@playwright/test";

test("recognizes the preview page and opens separate extension settings", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));
  await page.evaluate(() => window.BangumiScout.open());

  const host = page.locator("#bangumi-scout-host");
  await expect(host.locator(".scout-title")).toHaveText("正反対な君と僕");
  await expect(host.locator(".scout-confidence").first()).toHaveText(
    "精确匹配",
  );
  await expect(host.locator('[data-tab="settings"]')).toHaveCount(0);
  await expect(host.locator('[data-view="settings"]')).toBeHidden();
  await page.screenshot({
    path: "test-results/recognition-desktop.png",
  });

  await page.evaluate(() => window.BangumiScout.openSettings());
  await expect(host.locator('[data-view="settings"]')).toBeVisible();
  await expect(host.locator('input[name="ai.apiKey"]')).toBeAttached();
  await page.screenshot({
    path: "test-results/settings-desktop.png",
  });

  expect(errors).toEqual([]);
});

test("saves DeepSeek settings and performs a manual AI identification", async ({
  page,
}) => {
  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));
  await page.evaluate(() => window.BangumiScout.openSettings());

  const host = page.locator("#bangumi-scout-host");
  const settings = host.locator('[data-view="settings"]');
  await settings.locator('input[name="ai.enabled"]').check();
  await settings.locator('input[name="ai.apiKey"]').fill("preview-key");
  await settings.getByRole("button", { name: "保存" }).click();
  await host.getByRole("button", { name: "关闭设置" }).click();

  await page.evaluate(() => window.BangumiScout.open());
  await host.getByRole("button", { name: "AI 辅助" }).click();
  await expect(host.locator(".scout-diagnostics")).toContainText(
    "页面标题和结构化数据均指向该作品",
  );
});

test("panel remains usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));
  await page.evaluate(() => window.BangumiScout.open());

  const host = page.locator("#bangumi-scout-host");
  await expect(host.locator(".scout-panel")).toBeVisible();
  await expect(host.locator(".scout-title")).toHaveText("正反対な君と僕");
  await page.screenshot({
    path: "test-results/recognition-mobile.png",
  });
});
