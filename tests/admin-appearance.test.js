import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_ACCENTS,
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
