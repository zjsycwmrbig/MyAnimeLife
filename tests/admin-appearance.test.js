import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  ADMIN_ACCENTS,
  SITE_THEME_COLORS,
  SITE_TEMPLATES,
  resolveAdminAppearance,
} from "../admin/appearance.js";

test("applies the configured display template and share accent to the admin", () => {
  const appearance = resolveAdminAppearance({
    site: {
      title: "我的番剧档案",
      brand: "MyAnimeLife",
    },
    template: "spotlight",
    share: { accent: "teal" },
  });

  assert.equal(appearance.template, "spotlight");
  assert.equal(appearance.accent, "teal");
  assert.deepEqual(appearance.palette, ADMIN_ACCENTS.teal);
  assert.equal(appearance.siteTitle, "我的番剧档案");
  assert.equal(appearance.siteBrand, "MyAnimeLife");
  assert.deepEqual(SITE_TEMPLATES, ["default", "compact", "spotlight"]);
  assert.equal(SITE_THEME_COLORS.spotlight, "#10171b");
});

test("uses local share color overrides and safe fallbacks", () => {
  const local = resolveAdminAppearance(
    {
      template: "compact",
      share: { accent: "coral" },
    },
    { share: { accent: "blue" } },
  );
  assert.equal(local.template, "compact");
  assert.equal(local.accent, "blue");

  const fallback = resolveAdminAppearance({
    template: "unknown",
    share: { accent: "unknown" },
  });
  assert.equal(fallback.template, "default");
  assert.equal(fallback.accent, "coral");
});

test("keeps the share accent separate from the shared site template", async () => {
  const source = await fs.readFile(
    new URL("../admin/appearance.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /--share-accent/u);
  assert.doesNotMatch(source, /setProperty\("--accent"/u);
});

test("defines coordinated admin surfaces for every display template", async () => {
  const [css, ...templateStyles] = await Promise.all([
    fs.readFile(new URL("../admin/styles.css", import.meta.url), "utf8"),
    ...SITE_TEMPLATES.map((template) =>
      fs.readFile(
        new URL(`../templates/${template}/assets/styles.css`, import.meta.url),
        "utf8",
      ),
    ),
  ]);

  for (const [index, template] of SITE_TEMPLATES.entries()) {
    assert.match(
      css,
      new RegExp(
        `html\\[data-site-template="${template}"\\][\\s\\S]*?--canvas:`,
        "u",
      ),
    );
    assert.match(
      css,
      new RegExp(
        `html\\[data-site-template="${template}"\\][\\s\\S]*?--canvas:\\s*${SITE_THEME_COLORS[template]};`,
        "u",
      ),
    );
    assert.match(
      templateStyles[index],
      new RegExp(`--paper:\\s*${SITE_THEME_COLORS[template]};`, "u"),
    );
  }
  assert.match(css, /html\[data-site-template="spotlight"\][\s\S]*?--topbar-bg:/u);
  assert.match(css, /--font-sans:[\s\S]*?font-family:\s*var\(--font-sans\)/u);
  assert.match(css, /\.settings-section-intro\s*\{/u);
  assert.match(
    css,
    /\.settings-workspace\s*\{[^}]*min-height:\s*calc\(100vh - var\(--topbar-height\)\)/u,
  );
  assert.match(
    css,
    /\.about-workspace\s*\{[^}]*min-height:\s*calc\(100vh - var\(--topbar-height\)\)/u,
  );
  assert.match(css, /\.topbar \.button-primary:hover\s*\{/u);
});

test("places the reading link first and hides connection details from the topbar", async () => {
  const html = await fs.readFile(
    new URL("../admin/index.html", import.meta.url),
    "utf8",
  );
  assert.ok(html.indexOf('class="topbar-leading"') < html.indexOf('class="brand-block"'));
  assert.ok(html.indexOf('class="button button-quiet reading-link"') < html.indexOf('class="brand-block"'));
  assert.match(html, /id="repoStatus" hidden/u);
  assert.match(html, /id="runtimeBadge" class="runtime-badge" hidden/u);
  assert.match(html, /id="templateUpdateButton"[^>]*hidden/u);
});

test("keeps year and tag filters in the document flow", async () => {
  const [html, css] = await Promise.all([
    fs.readFile(new URL("../admin/index.html", import.meta.url), "utf8"),
    fs.readFile(new URL("../admin/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(
    html,
    /id="catalogYearFilter"[\s\S]*?aria-controls="catalogYearPanel"/u,
  );
  assert.match(
    html,
    /id="catalogYearPanel"[\s\S]*?class="catalog-multi-filter-panel"[\s\S]*?hidden/u,
  );
  assert.match(
    html,
    /id="catalogTagFilter"[\s\S]*?aria-controls="catalogTagPanel"/u,
  );
  assert.match(
    html,
    /id="catalogTagPanel"[\s\S]*?class="catalog-multi-filter-panel catalog-tag-panel"[\s\S]*?hidden/u,
  );

  const panelRule = css.match(
    /\.catalog-multi-filter-panel\s*\{([^}]*)\}/u,
  )?.[1];
  assert.ok(panelRule);
  assert.doesNotMatch(panelRule, /position:\s*fixed/u);
  assert.match(panelRule, /height:\s*clamp\(/u);
});
