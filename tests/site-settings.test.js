import test from "node:test";
import assert from "node:assert/strict";
import {
  applySiteSettings,
  normalizeShareConfig,
  siteSettingsPayload,
} from "../scripts/site-settings.mjs";

const config = {
  site: {
    title: "我的番剧档案",
    brand: "ANIME LEDGER",
    description: "私人记录",
    language: "zh-CN",
    footer: "MyAnimeLife",
  },
  repository: { slug: "example/anime", branch: "main" },
  template: "default",
  share: { template: "default", accent: "coral" },
  dataFile: "data/anime.jsonl",
  indexFile: "data/anime-index.jsonl",
  backupDirectory: "data/backups",
  backupLimit: 5,
  outputDirectory: "dist",
};

test("normalizes share styles to an explicit template", () => {
  assert.deepEqual(normalizeShareConfig({ template: "auto", accent: "teal" }, "spotlight"), {
    template: "default",
    resolvedTemplate: "default",
    accent: "teal",
  });
  assert.equal(
    normalizeShareConfig({ template: "compact", accent: "blue" }, "default")
      .resolvedTemplate,
    "compact",
  );
});

test("updates presentation settings without touching repository or data paths", () => {
  const next = applySiteSettings(config, {
    site: {
      title: "动画日记",
      brand: "A LOG",
      description: "按季度整理的观看记录",
      footer: "由 MyAnimeLife 构建",
    },
    template: "spotlight",
    share: { template: "compact", accent: "amber" },
  });

  assert.equal(next.template, "spotlight");
  assert.deepEqual(next.share, { template: "compact", accent: "amber" });
  assert.equal(next.site.title, "动画日记");
  assert.equal(next.site.language, "zh-CN");
  assert.deepEqual(next.repository, config.repository);
  assert.equal(next.dataFile, config.dataFile);
  assert.deepEqual(siteSettingsPayload(next), {
    site: {
      title: "动画日记",
      brand: "A LOG",
      description: "按季度整理的观看记录",
      footer: "由 MyAnimeLife 构建",
    },
    template: "spotlight",
    share: {
      template: "compact",
      resolvedTemplate: "compact",
      accent: "amber",
    },
  });
});

test("rejects unsupported templates and accents", () => {
  assert.throws(
    () => applySiteSettings(config, { template: "unknown" }),
    /展示模板不在支持范围内/u,
  );
  assert.throws(
    () =>
      applySiteSettings(config, {
        share: { template: "default", accent: "pink" },
      }),
    /分享配色不在支持范围内/u,
  );
});
