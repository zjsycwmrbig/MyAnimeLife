import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const previewPort = process.env.PLAYWRIGHT_PORT || "4175";
const followPagePath = fileURLToPath(
  new URL("../demo/follow.html", import.meta.url),
);
const previewMockPath = fileURLToPath(
  new URL("../demo/preview-mock.js", import.meta.url),
);
const userscriptPath = fileURLToPath(
  new URL("../dist/anime-index.user.js", import.meta.url),
);

async function configureGithub(page, host, token = "preview-token") {
  await page.evaluate(() => window.BangumiScout.openSettings());
  const settings = host.locator('[data-view="settings"]');
  await settings.locator('input[name="github.enabled"]').check();
  await settings
    .locator('input[name="github.repositoryUrl"]')
    .fill("https://github.com/preview-user/anime-records");
  await settings.locator('input[name="github.branch"]').fill("main");
  await settings.locator('input[name="github.token"]').fill(token);
  await settings.getByRole("button", { name: "检查连接" }).click();
  await expect(
    settings
      .locator(".scout-note")
      .filter({ hasText: "preview-user/anime-records 可读写" }),
  ).toBeVisible();
  await settings.getByRole("button", { name: "保存", exact: true }).click();
  await expect(settings.locator(".scout-setup-summary")).toHaveText(
    "配置进度 3/4",
  );
  await host.getByRole("button", { name: "关闭设置" }).click();
}

async function recognizeCurrentPage(host) {
  await host.getByRole("button", { name: "识别当前页" }).click();
  await expect(host.locator(".scout-title")).toHaveText("相反的你和我");
}

async function routeBilibiliFollowPage(page) {
  await page.route(/^http:\/\/space\.bilibili\.com:\d+\//u, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/123/bangumi") {
      await route.fulfill({ path: followPagePath });
      return;
    }
    if (pathname === "/preview-mock.js") {
      await route.fulfill({ path: previewMockPath });
      return;
    }
    if (pathname === "/anime-index.user.js") {
      await route.fulfill({ path: userscriptPath });
      return;
    }
    await route.fulfill({ status: 404, body: "Not found" });
  });
}

test("recognizes only after a click and opens separate extension settings", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));

  const host = page.locator("#bangumi-scout-host");
  await expect(host.locator(".scout-panel")).toBeHidden();
  await expect(host.locator(".scout-launcher")).toBeVisible();
  await expect(host.locator(".scout-title")).toHaveText("尚未识别");
  await expect(host.locator('[data-view="settings"]')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        window.__previewRequests.filter(({ url }) =>
          ["api.bilibili.com", "api.deepseek.com"].includes(
            new URL(url).hostname,
          ),
        ).length,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () =>
        window.__previewRequests.filter(
          ({ url }) => new URL(url).hostname === "api.github.com",
        ).length,
    ),
  ).toBe(0);

  await host.locator(".scout-launcher").click();
  await expect(host.locator(".scout-panel")).toBeVisible();
  await expect(host.locator(".scout-title")).toHaveText("尚未识别");
  await recognizeCurrentPage(host);
  await expect(host.locator(".scout-confidence").first()).toHaveText(
    "精确匹配",
  );
  await expect(host.locator(".scout-evidence")).toContainText("简介已读取");
  await expect(host.locator(".scout-evidence")).toContainText("评论");
  await expect(host.locator(".scout-cover")).toBeVisible();
  await expect(host.locator(".scout-cover-image")).toHaveAttribute(
    "src",
    /^data:image\/svg\+xml/,
  );
  await expect(host.locator('[data-tab="settings"]')).toHaveCount(0);
  await expect(host.locator('[data-view="settings"]')).toBeHidden();
  await page.screenshot({
    path: "test-results/recognition-desktop.png",
  });

  await page.evaluate(() => window.BangumiScout.openSettings());
  await expect(host.locator('[data-view="settings"]')).toBeVisible();
  const settings = host.locator('[data-view="settings"]');
  await expect(host.locator('input[name="ai.apiKey"]')).toBeAttached();
  const generateLink = host.getByRole("link", { name: "用模板新建" });
  await expect(generateLink).toHaveAttribute(
    "href",
    "https://github.com/zjsycwmrbig/MyAnimeLife/generate",
  );
  await expect(
    host.getByRole("link", { name: "创建 Token" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/settings/personal-access-tokens/new",
  );
  await expect(
    settings.getByText("公开模板仓库", { exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText("你的个人数据仓库", { exact: true }),
  ).toBeVisible();
  await expect(settings.locator(".scout-setup-summary")).toHaveText(
    "配置进度 0/4",
  );

  await settings.locator('input[name="github.enabled"]').check();
  await settings
    .locator('input[name="github.repositoryUrl"]')
    .fill("https://github.com/preview-user/anime-records");
  await settings.locator('input[name="github.token"]').fill("");
  await settings.getByRole("button", { name: "检查连接" }).click();
  await expect(
    settings
      .locator(".scout-note")
      .filter({ hasText: "请先填写仅限个人数据仓库的细粒度 Token" }),
  ).toBeVisible();

  await settings
    .locator('input[name="github.repositoryUrl"]')
    .fill("https://github.com/zjsycwmrbig/MyAnimeLife");
  await settings.locator('input[name="github.token"]').fill("preview-token");
  await settings.getByRole("button", { name: "检查连接" }).click();
  await expect(
    settings
      .locator(".scout-note")
      .filter({ hasText: "当前填写的是公开模板仓库" }),
  ).toBeVisible();
  await expect(settings.locator(".scout-setup-summary")).toContainText(
    "同步地址不能是公开模板仓库",
  );
  expect(
    await page.evaluate(
      () =>
        window.__previewRequests.filter(
          ({ url }) => new URL(url).hostname === "api.github.com",
        ).length,
    ),
  ).toBe(0);
  await page.screenshot({
    path: "test-results/settings-desktop.png",
  });

  expect(errors).toEqual([]);
});

test("closes, drags and docks the recognition panel", async ({ page }) => {
  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));

  const host = page.locator("#bangumi-scout-host");
  const launcher = host.locator(".scout-launcher");
  const panel = host.locator(".scout-panel");
  const header = host.locator(".scout-panel-header");

  await launcher.click();
  await recognizeCurrentPage(host);

  await host.getByRole("button", { name: "关闭" }).click();
  await expect(panel).toBeHidden();
  await expect(launcher).toBeVisible();

  await launcher.click();
  await expect(panel).toBeVisible();
  await expect(host.locator(".scout-title")).toHaveText("相反的你和我");

  const before = await panel.boundingBox();
  const headerBox = await header.boundingBox();
  expect(before).not.toBeNull();
  expect(headerBox).not.toBeNull();
  await page.mouse.move(headerBox.x + 70, headerBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(
    headerBox.x + 70 - 110,
    headerBox.y + 20 + 32,
    { steps: 5 },
  );
  await page.mouse.up();

  await expect
    .poll(async () => (await panel.boundingBox())?.x ?? Infinity)
    .toBeLessThan(before.x - 80);

  await host.getByRole("button", { name: "隐藏到侧边栏" }).click();
  await expect(panel).toBeHidden();
  await expect(launcher).toBeVisible();
  await expect(launcher).toHaveClass(/is-side-docked/);
  await expect(launcher).toHaveClass(/is-docked-right/);
  const rightDockBox = await launcher.boundingBox();
  expect(rightDockBox).not.toBeNull();
  await page.mouse.move(
    rightDockBox.x + rightDockBox.width / 2,
    rightDockBox.y + rightDockBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(90, Math.max(50, rightDockBox.y - 70), { steps: 8 });
  await page.mouse.up();
  await expect(launcher).toHaveClass(/is-docked-left/);
  const leftDockBox = await launcher.boundingBox();
  expect(leftDockBox).not.toBeNull();
  expect(leftDockBox.x).toBeLessThan(rightDockBox.x - 100);
  await page.screenshot({
    path: "test-results/docked-desktop.png",
  });

  await launcher.click();
  await expect(panel).toBeVisible();
  await expect(launcher).toBeHidden();
  await expect(host.locator(".scout-title")).toHaveText("相反的你和我");
});

test("restores unsynced ratings and reviews until they are cleared", async ({
  page,
}) => {
  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));

  let host = page.locator("#bangumi-scout-host");
  await host.locator(".scout-launcher").click();
  await recognizeCurrentPage(host);
  await host
    .getByRole("radio", { name: "9 分", exact: true })
    .click();
  await host.locator(".scout-review").fill("尚未同步的本机短评");
  await page.waitForTimeout(400);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.BangumiScout));
  host = page.locator("#bangumi-scout-host");
  await host.locator(".scout-launcher").click();
  await expect(host.locator(".scout-title")).toHaveText("相反的你和我");
  await expect(host.locator(".scout-evidence")).toContainText("简介已读取");
  await expect(
    host.getByRole("radio", { name: "9 分", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(host.locator(".scout-review")).toHaveValue(
    "尚未同步的本机短评",
  );
  await expect(host.locator(".scout-record")).toContainText(
    "已恢复本机未同步草稿",
  );
  await expect(
    host.getByRole("button", { name: "重新识别" }),
  ).toBeVisible();

  await host.getByRole("button", { name: "重新识别" }).click();
  await expect(host.locator(".scout-panel")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await expect(host.locator(".scout-title")).toHaveText("相反的你和我");

  await host.getByRole("button", { name: "清除草稿" }).click();
  await expect(host.locator(".scout-review")).toHaveValue("");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.BangumiScout));
  host = page.locator("#bangumi-scout-host");
  await host.locator(".scout-launcher").click();
  await recognizeCurrentPage(host);
  await expect(host.locator(".scout-review")).toHaveValue("");
});

test("keeps plugin typing from triggering page keyboard shortcuts", async ({
  page,
}) => {
  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));
  await page.evaluate(() => {
    window.__pageShortcutKeys = [];
    for (const eventName of ["keydown", "keypress", "keyup"]) {
      document.addEventListener(eventName, (event) => {
        window.__pageShortcutKeys.push(`${eventName}:${event.key}`);
      });
    }
  });

  const host = page.locator("#bangumi-scout-host");
  await host.locator(".scout-launcher").click();
  await recognizeCurrentPage(host);
  const review = host.locator(".scout-review");
  await review.click();
  await page.keyboard.type("abc 123");

  await expect(review).toHaveValue(/abc 123/u);
  expect(await page.evaluate(() => window.__pageShortcutKeys)).toEqual([]);
});

test("renders a presentation card, opens cover preview, and resizes fluidly", async ({
  page,
}) => {
  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));

  const host = page.locator("#bangumi-scout-host");
  await host.locator(".scout-launcher").click();
  await recognizeCurrentPage(host);

  const review = host.locator(".scout-review");
  await review.fill("这是一段会变成展示样式的短评。");
  await host.getByRole("radio", { name: "8 分", exact: true }).click();
  const reviewDisplay = host.locator(".scout-review-display");
  await expect(reviewDisplay).toBeVisible();
  await expect(reviewDisplay).toContainText(
    "这是一段会变成展示样式的短评。",
  );
  await expect(review).toBeHidden();

  await reviewDisplay.click();
  await expect(review).toBeVisible();
  await host.locator(".scout-record-head").click();
  await expect(reviewDisplay).toBeVisible();

  const coverButton = host.locator(".scout-cover");
  await expect(coverButton).toBeVisible();
  await expect(host.locator(".scout-cover")).toHaveCount(1);
  await coverButton.click();
  const viewer = host.locator(".scout-cover-viewer");
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("img")).toHaveAttribute(
    "src",
    /^data:image\/svg\+xml/,
  );
  await host.getByRole("button", { name: "关闭封面大图" }).click();
  await expect(viewer).toBeHidden();

  const panel = host.locator(".scout-panel");
  const resizeHandle = host.getByRole("button", {
    name: "拖拽调整面板大小",
  });
  const before = await panel.boundingBox();
  const handleBox = await resizeHandle.boundingBox();
  expect(before).not.toBeNull();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox.x + 10, handleBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 130, handleBox.y - 70, { steps: 8 });
  await page.mouse.up();
  const after = await panel.boundingBox();
  expect(after.width).toBeGreaterThan(before.width + 80);
  expect(after.height).toBeLessThan(before.height - 40);
  await expect(host.locator(".scout-record")).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.BangumiScout));
  const restoredHost = page.locator("#bangumi-scout-host");
  await restoredHost.locator(".scout-launcher").click();
  const restored = await restoredHost.locator(".scout-panel").boundingBox();
  expect(restored.width).toBeGreaterThan(before.width + 80);
  expect(restored.height).toBeLessThan(before.height - 40);
});

test("does not initialize on an unrelated website", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.addScriptTag({ path: userscriptPath });
  await page.waitForTimeout(150);

  await expect(page.locator("#bangumi-scout-host")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => Boolean(window.BangumiScout)))
    .toBe(false);
});

test("loads every Bilibili follow page and batch imports selected anime once", async ({
  page,
}) => {
  await routeBilibiliFollowPage(page);
  await page.goto(
    `http://space.bilibili.com:${previewPort}/123/bangumi`,
    { waitUntil: "networkidle" },
  );
  await page.waitForFunction(() => Boolean(window.BangumiScout));

  const host = page.locator("#bangumi-scout-host");
  const launcher = host.locator(".scout-launcher");
  await expect(host.locator(".scout-panel")).toBeHidden();
  await expect(launcher).toHaveAttribute(
    "data-page-kind",
    "bilibili-follow",
  );
  await expect(launcher).toContainText("追番");
  await expect(launcher.locator('[data-icon="list"]')).toHaveCount(1);
  await expect
    .poll(() =>
      launcher.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      ),
    )
    .toBe("rgb(159, 47, 88)");
  expect(
    await page.evaluate(
      () =>
        window.__previewRequests.filter(({ url }) =>
          url.includes("/x/space/bangumi/follow/list"),
        ).length,
    ),
  ).toBe(0);

  await configureGithub(page, host);
  await page.evaluate(() => {
    window.__previewBilibiliDelay = 350;
  });
  await page.evaluate(() => window.BangumiScout.open());
  await expect(host.locator(".scout-panel")).toHaveAttribute(
    "data-page-kind",
    "bilibili-follow",
  );
  await expect(
    host.getByRole("heading", { name: "Bangumi Scout · 追番" }),
  ).toBeVisible();
  await host.getByRole("button", { name: "识别当前页" }).click();
  await expect(host.locator(".scout-batch-skeleton")).toBeVisible();
  await expect(host.locator(".scout-batch-progress")).toBeVisible();
  await expect(host.locator(".scout-batch-progress")).toContainText(
    "正在读取追番列表",
  );

  const batchRows = host.locator(".scout-batch-row");
  await expect(batchRows).toHaveCount(2);
  await expect(batchRows.nth(0)).toContainText("相反的你和我");
  await expect(batchRows.nth(1)).toContainText("葬送的芙莉莲");
  await expect(host.locator(".scout-batch-summary")).toHaveText(
    "已选 0 项 · 可导入 2",
  );

  const followRequests = await page.evaluate(() =>
    window.__previewRequests.filter(({ url }) =>
      url.includes("/x/space/bangumi/follow/list"),
    ),
  );
  expect(followRequests).toHaveLength(1);
  expect(followRequests[0].url).toContain("pn=1");
  expect(followRequests[0].url).toContain("ps=30");
  expect(followRequests[0].url).toContain("vmid=123");

  await host.getByRole("button", { name: "全选可导入" }).click();
  await expect(host.locator(".scout-batch-summary")).toHaveText(
    "已选 2 项 · 可导入 2",
  );
  await expect(host.locator(".scout-batch-skeleton")).toHaveCount(0);
  await expect(host.locator(".scout-batch-progress")).toBeHidden();
  await host.getByRole("button", { name: "导入并同步" }).click();
  await expect(host.locator(".scout-batch-status")).toHaveText(
    "已导入 1 条，跳过 1 条",
  );
  await expect(host.locator(".scout-batch-status")).toHaveAttribute(
    "data-tone",
    "success",
  );
  await expect(host.locator('.scout-toast[data-tone="success"]')).toContainText(
    "批量同步成功",
  );
  await page.screenshot({
    path: "test-results/batch-sync-success.png",
  });
  await expect(
    host.locator('[data-view="settings"] .scout-setup-summary'),
  ).toHaveText("配置进度 4/4");

  const gitWrites = await page.evaluate(() =>
    window.__previewRequests.filter(
      (request) =>
        ["POST", "PATCH"].includes(request.method) &&
        request.url.startsWith(
          "https://api.github.com/repos/preview-user/anime-records/git/",
        ),
    ),
  );
  expect(
    gitWrites.filter((request) =>
      request.url.endsWith("/git/blobs"),
    ),
  ).toHaveLength(3);
  expect(
    gitWrites.filter((request) =>
      request.url.endsWith("/git/trees"),
    ),
  ).toHaveLength(1);
  expect(
    gitWrites.filter((request) =>
      request.url.endsWith("/git/commits"),
    ),
  ).toHaveLength(1);
  expect(
    gitWrites.filter(
      (request) =>
        request.method === "PATCH" &&
        request.url.endsWith("/git/refs/heads/main"),
    ),
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () =>
        window.__previewRequests.filter(
          (request) =>
            request.method === "PUT" &&
            request.url.includes("/contents/"),
        ).length,
    ),
  ).toBe(0);

  const blobTexts = gitWrites
    .filter((request) => request.url.endsWith("/git/blobs"))
    .map((request) =>
      Buffer.from(
        JSON.parse(request.data).content,
        "base64",
      ).toString("utf8"),
    )
    .filter((text) => !text.includes('"anime-library-backup"'));
  const records = blobTexts
    .map((text) =>
      text
        .trim()
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    )
    .find(
      (entries) =>
        entries.length === 2 &&
        entries.every((entry) => entry?.id && "rating" in entry),
    );
  expect(records).toBeDefined();
  expect(records).toHaveLength(2);
  expect(
    records.find((record) => record.id === "bili-292073015"),
  ).toMatchObject({
    rating: 8,
    review: "这条评价来自预览 GitHub 仓库。",
  });
  expect(records.find((record) => record.id === "bili-ss209901")).toMatchObject({
    rating: null,
    review: "",
    title: "葬送的芙莉莲",
  });
});

test("shows an actionable error when Bilibili batch syncing fails", async ({
  page,
}) => {
  await routeBilibiliFollowPage(page);
  await page.goto(
    `http://space.bilibili.com:${previewPort}/123/bangumi`,
    { waitUntil: "networkidle" },
  );
  await page.waitForFunction(() => Boolean(window.BangumiScout));

  const host = page.locator("#bangumi-scout-host");
  await configureGithub(page, host, "write-fail-token");
  await page.evaluate(() => window.BangumiScout.open());
  await host.getByRole("button", { name: "识别当前页" }).click();
  await expect(host.locator(".scout-batch-row")).toHaveCount(2);

  await host.getByRole("button", { name: "全选可导入" }).click();
  await host.getByRole("button", { name: "导入并同步" }).click();

  const batchStatus = host.locator(".scout-batch-status");
  await expect(batchStatus).toContainText("批量同步失败");
  await expect(batchStatus).toHaveAttribute("data-tone", "error");
  const errorToast = host.locator('.scout-toast[data-tone="error"]');
  await expect(errorToast).toContainText("批量同步失败");
  await expect(errorToast).toContainText("本次没有在远端写入新增记录");
  await expect(errorToast).toContainText("Preview write failure");
  await page.screenshot({
    path: "test-results/batch-sync-error.png",
  });
  await expect(host.getByRole("button", { name: "导入并同步" })).toBeEnabled();
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
  const aiButton = host.getByRole("button", { name: "AI 辅助" });
  await expect(aiButton).toBeEnabled();
  await aiButton.click();
  await expect(host.locator(".scout-diagnostics")).toContainText(
    "页面标题和结构化数据均指向该作品",
  );

  const aiRequest = await page.evaluate(() =>
    window.__previewRequests.find(
      (request) =>
        request.url === "https://api.deepseek.com/chat/completions",
    ),
  );
  expect(aiRequest?.method).toBe("POST");
  const aiPayload = JSON.parse(aiRequest.data);
  const aiContext = aiPayload.messages[1].content;
  expect(aiContext).toContain('"synopsis"');
  expect(aiContext).toContain("人物描写很细");
  expect(aiContext).toContain("节奏很舒服");
});

test("selects a search candidate and saves a local rating draft", async ({
  page,
}) => {
  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));
  await page.evaluate(() => window.BangumiScout.open());

  const host = page.locator("#bangumi-scout-host");
  await host.getByRole("button", { name: "手动搜索" }).click();
  await host.locator(".scout-search input").fill("芙莉莲");

  const frierenRow = host
    .locator(".scout-manual-results .scout-list-row")
    .filter({ hasText: "葬送的芙莉莲" })
    .first();
  await expect(frierenRow).toBeVisible();
  await frierenRow.click();

  await expect(host.locator(".scout-title")).toHaveText("葬送的芙莉莲");
  await expect(host.locator(".scout-confidence").first()).toHaveText(
    "已选定候选",
  );
  await expect(frierenRow).toHaveClass(/is-selected/);
  await expect(host.locator(".scout-record-item")).toHaveText(
    "葬送的芙莉莲",
  );
  await expect(host.locator(".scout-manual-results")).toBeHidden();
  await expect(
    host.locator('[data-view="recognition"] > .scout-section:visible'),
  ).toHaveCount(1);
  await expect(host.locator(".scout-record")).toBeVisible();
  await expect(host.locator(".scout-record")).toBeFocused();

  await host.getByRole("button", { name: "重新选择" }).click();
  await expect(host.locator(".scout-manual-results")).toBeVisible();

  await host.getByRole("radio", { name: "9 分" }).click();
  await host
    .locator('textarea[name="personal.review"]')
    .fill("考试篇节奏和情绪都很好。");
  await host.getByRole("button", { name: "保存草稿" }).click();

  await expect(host.locator(".scout-record-value")).toHaveText("9 / 10");
  await expect(host.locator(".scout-record .scout-footer-status")).toContainText(
    "已保存",
  );
});

test("loads and saves a rating through the configured GitHub repository", async ({
  page,
}) => {
  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));

  const host = page.locator("#bangumi-scout-host");
  await configureGithub(page, host);
  await page.evaluate(() => window.BangumiScout.open());
  await recognizeCurrentPage(host);

  await expect(host.locator(".scout-title")).toHaveText("相反的你和我");
  const review = host.locator('textarea[name="personal.review"]');
  await expect(review).toHaveValue("这条评价来自预览 GitHub 仓库。");
  await expect(host.getByRole("radio", { name: "8 分" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await host.getByRole("radio", { name: "9 分" }).click();
  await host.locator(".scout-review-display").click();
  await review.fill("更新后的 GitHub 评价。");
  await expect(host.getByRole("radio", { name: "9 分" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await host.getByRole("button", { name: "同步到 GitHub" }).click();

  const duplicateWarning = host.locator(".scout-duplicate-warning");
  await expect(duplicateWarning).toBeVisible();
  await expect(duplicateWarning).toHaveAttribute("data-kind", "existing");
  await expect(duplicateWarning).toContainText("这部番剧已在个人仓库中");
  await expect(duplicateWarning).toContainText("个人仓库中已存在同一番剧");
  await expect(duplicateWarning).toContainText("新增一条独立记录");
  await expect(
    host.getByRole("button", { name: "仍然添加" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.__previewRequests.filter(
          (request) =>
            ["POST", "PATCH"].includes(request.method) &&
            request.url.startsWith(
              "https://api.github.com/repos/preview-user/anime-records/git/",
            ),
        ).length,
    ),
  ).toBe(0);
  await page.screenshot({
    path: "test-results/duplicate-record-confirmation.png",
  });
  await host.getByRole("button", { name: "仍然添加" }).click();

  await expect(host.locator(".scout-record .scout-footer-status")).toContainText(
    "已保存到 GitHub",
  );
  await expect(
    host.locator(".scout-record .scout-footer-status"),
  ).toHaveAttribute("data-tone", "success");
  await expect(host.locator('.scout-toast[data-tone="success"]')).toContainText(
    "同步成功",
  );
  await expect(host.getByRole("link", { name: "查看 GitHub 记录" })).toBeVisible();

  const gitWrites = await page.evaluate(() =>
    window.__previewRequests.filter(
      (request) =>
        ["POST", "PATCH"].includes(request.method) &&
        request.url.startsWith(
          "https://api.github.com/repos/preview-user/anime-records/git/",
        ),
    ),
  );
  expect(
    gitWrites.every(
      (request) =>
        request.headers.Authorization === "Bearer preview-token",
    ),
  ).toBe(true);
  expect(
    gitWrites.filter((request) =>
      request.url.endsWith("/git/blobs"),
    ),
  ).toHaveLength(3);
  expect(
    gitWrites.filter((request) =>
      request.url.endsWith("/git/trees"),
    ),
  ).toHaveLength(1);
  expect(
    gitWrites.filter((request) =>
      request.url.endsWith("/git/commits"),
    ),
  ).toHaveLength(1);
  expect(
    gitWrites.filter(
      (request) =>
        request.method === "PATCH" &&
        request.url.endsWith("/git/refs/heads/main"),
    ),
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () =>
        window.__previewRequests.filter(
          (request) =>
            request.method === "PUT" &&
            request.url.includes("/contents/"),
        ).length,
    ),
  ).toBe(0);

  const blobTextBySha = new Map(
    gitWrites
      .filter((request) => request.url.endsWith("/git/blobs"))
      .map((request) => {
        const body = JSON.parse(request.data);
        return [
          request.responseSha,
          Buffer.from(body.content, "base64").toString("utf8"),
        ];
      })
      .filter(([sha]) => sha),
  );
  const treeBody = JSON.parse(
    gitWrites.find((request) =>
      request.url.endsWith("/git/trees"),
    ).data,
  );
  const treeEntries = new Map(
    treeBody.tree.map((entry) => [entry.path, entry.sha]),
  );
  expect(treeEntries.has("data/anime.jsonl")).toBe(true);
  expect(treeEntries.has("data/anime-index.jsonl")).toBe(true);
  expect(
    [...treeEntries.keys()].some((path) =>
      path.startsWith("data/backups/library-"),
    ),
  ).toBe(true);
  const savedRecords = JSON.parse(
    `[${blobTextBySha
      .get(treeEntries.get("data/anime.jsonl"))
      .trim()
      .replace(/\r?\n/gu, ",")}]`,
  );
  const savedIndexes = JSON.parse(
    `[${blobTextBySha
      .get(treeEntries.get("data/anime-index.jsonl"))
      .trim()
      .replace(/\r?\n/gu, ",")}]`,
  );
  expect(savedRecords).toHaveLength(2);
  const originalRecord = savedRecords.find(
    (record) => record.id === "bili-292073015",
  );
  const savedRecord = savedRecords.find(
    (record) => record.id !== "bili-292073015",
  );
  expect(originalRecord.rating).toBe(8);
  expect(originalRecord.review).toBe("这条评价来自预览 GitHub 仓库。");
  expect(savedRecord.id).toMatch(/^bili-292073015-copy-/u);
  expect(savedRecord.rating).toBe(9);
  expect(savedRecord.review).toBe("更新后的 GitHub 评价。");
  expect(savedIndexes).toHaveLength(2);
  const savedIndex = savedIndexes.find(
    (record) => record.id === savedRecord.id,
  );
  expect(savedIndex.rating).toBe(9);
  expect(savedIndex.reviewExcerpt).toBe("更新后的 GitHub 评价。");
  await expect(
    host.getByRole("link", { name: "查看 GitHub 记录" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/preview-user/anime-records/blob/main/data/anime.jsonl",
  );
});

test("keeps the local draft when GitHub writing fails", async ({ page }) => {
  await page.goto("/demo/bangumi/media/md292073015.html", {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => Boolean(window.BangumiScout));

  const host = page.locator("#bangumi-scout-host");
  await configureGithub(page, host, "write-fail-token");
  await page.evaluate(() => window.BangumiScout.open());
  await recognizeCurrentPage(host);

  const review = host.locator('textarea[name="personal.review"]');
  await review.fill("即使远端失败，这段内容也要留在本地。");
  await host.getByRole("button", { name: "同步到 GitHub" }).click();
  await host.getByRole("button", { name: "仍然添加" }).click();
  await expect(host.locator(".scout-record .scout-footer-status")).toContainText(
    "本地草稿已保存 · GitHub 同步失败",
  );
  await expect(
    host.locator(".scout-record .scout-footer-status"),
  ).toHaveAttribute("data-tone", "error");
  await expect(host.locator('.scout-toast[data-tone="error"]')).toContainText(
    "GitHub 同步失败",
  );
  await expect(host.locator('.scout-toast[data-tone="error"]')).toContainText(
    "评分与短评仍保留在本机",
  );

  const localRecord = await page.evaluate(() => {
    const raw = window.GM_getValue(
      "bangumi-scout.personal-records.v1",
      "",
    );
    return Object.values(JSON.parse(raw)).find(
      (record) =>
        record.review === "即使远端失败，这段内容也要留在本地。",
    );
  });
  expect(localRecord).toBeTruthy();
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
  await recognizeCurrentPage(host);
  await page.screenshot({
    path: "test-results/recognition-mobile.png",
  });
});
