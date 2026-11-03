import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const source = await fs.readFile(
  new URL("../scripts/share-card.js", import.meta.url),
  "utf8",
);

function createShareRuntime({ fetchImpl, clipboardWrite } = {}) {
  const objectUrls = new Map();
  let objectUrlIndex = 0;
  class FileReader {
    constructor() {
      this.listeners = new Map();
      this.result = null;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    readAsDataURL(blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.listeners.get("load")?.();
      });
    }
  }
  class Image {
    set src(value) {
      this.currentSrc = value;
      queueMicrotask(() => this.onload?.());
    }
  }
  class ClipboardItem {
    constructor(items) {
      this.items = items;
    }
  }
  class RuntimeURL extends URL {
    static createObjectURL(blob) {
      const url = `blob:test-${++objectUrlIndex}`;
      objectUrls.set(url, blob);
      return url;
    }

    static revokeObjectURL(url) {
      objectUrls.delete(url);
    }
  }
  const canvas = {
    getContext() {
      return {
        fillStyle: "",
        fillRect() {},
        drawImage() {},
      };
    },
    toBlob(callback) {
      callback(new Blob(["png-output"], { type: "image/png" }));
    },
  };
  const navigator = {
    clipboard: {
      write: clipboardWrite ?? (async () => {}),
    },
  };
  const context = vm.createContext({
    Blob,
    ClipboardItem,
    FileReader,
    Image,
    URL: RuntimeURL,
    AbortController,
    clearTimeout,
    console,
    document: {
      addEventListener() {},
      body: { append() {} },
      createElement(name) {
        return name === "canvas" ? canvas : {};
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    },
    fetch: fetchImpl ?? fetch,
    localStorage: {
      getItem() {
        return null;
      },
    },
    navigator,
    queueMicrotask,
    setTimeout,
    window: {
      addEventListener() {},
    },
  });
  vm.runInContext(source, context);
  return {
    ClipboardItem,
    api: context.window.MyAnimeLifeShare,
    objectUrls,
  };
}

test("inlines remote covers before rasterizing a share image", async () => {
  const remoteCover = "https://i0.hdslb.com/cover.png";
  const runtime = createShareRuntime({
    fetchImpl: async (url) => {
      assert.equal(url, remoteCover);
      return {
        ok: true,
        blob: async () => new Blob(["cover"], { type: "image/png" }),
      };
    },
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image href="${remoteCover}" xlink:href="${remoteCover}" width="10" height="10" /></svg>`;

  const image = await runtime.api.createImage(svg, 10, 10);
  const exportedSvg = await image.svg.text();

  assert.equal(image.png.type, "image/png");
  assert.doesNotMatch(exportedSvg, /i0\.hdslb\.com/u);
  assert.equal(
    exportedSvg.match(/data:image\/png;base64,Y292ZXI=/gu)?.length,
    2,
  );
});

test("normalizes clipboard images to PNG before writing", async () => {
  let written = null;
  const runtime = createShareRuntime({
    clipboardWrite: async (items) => {
      written = items;
    },
  });

  await runtime.api.copyImage(
    new Blob(["image"], { type: "application/octet-stream" }),
  );

  assert.equal(written.length, 1);
  assert.ok(written[0] instanceof runtime.ClipboardItem);
  assert.equal(written[0].items["image/png"].type, "image/png");
});

test("uses the CORS image proxy first for Bangumi covers", async () => {
  const remoteCover = "https://lain.bgm.tv/pic/cover/l/example.jpg";
  const requests = [];
  const runtime = createShareRuntime({
    fetchImpl: async (url) => {
      requests.push(url);
      return {
        ok: true,
        blob: async () => new Blob(["bgm-cover"], { type: "image/jpeg" }),
      };
    },
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image href="${remoteCover}" width="10" height="10" /></svg>`;

  await runtime.api.createImage(svg, 10, 10);

  assert.equal(requests.length, 1);
  assert.match(requests[0], /^https:\/\/images\.weserv\.nl\/\?url=/u);
  assert.match(
    decodeURIComponent(requests[0]),
    /lain\.bgm\.tv\/pic\/cover\/l\/example\.jpg/u,
  );
});

test("builds selectable comparison share images from structured results", () => {
  const runtime = createShareRuntime();
  const result = runtime.api.createComparisonShareImage(
    {
      overview: {
        currentTotal: 120,
        peerTotal: 96,
        sharedTotal: 48,
        currentOnlyTotal: 72,
        peerOnlyTotal: 48,
        overlapPercent: 28.6,
      },
      years: { current: [], peer: [], currentStats: {}, peerStats: {} },
      ratings: {
        averageGap: 1.2,
        currentHigher: 14,
        peerHigher: 9,
        tied: 4,
        items: [],
      },
      completeness: { current: {}, peer: {} },
      taste: { available: false, tags: [], deviations: [] },
    },
    {
      format: "long",
      currentRepository: "owner/main-anime",
      peerRepository: "friend/anime",
      modules: {
        summary: true,
        overlap: true,
        years: false,
        ratings: true,
        differences: false,
        taste: false,
        completeness: false,
      },
    },
  );

  assert.ok(result.width > 0);
  assert.ok(result.height > 0);
  assert.match(result.svg, /TASTE MATCH/u);
  assert.match(result.svg, /owner\/main-anime/u);
  assert.match(result.svg, /收藏重合/u);
  assert.doesNotMatch(result.svg, /共同评分差/u);
});
