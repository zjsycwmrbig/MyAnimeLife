import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CatalogStore } from "../scripts/catalog-store.mjs";

const rawCatalog = {
  items: [
    {
      title: "テスト",
      titleTranslate: {
        "zh-Hans": ["测试番剧"],
      },
      type: "tv",
      begin: "2024-01-01T00:00:00.000Z",
      sites: [{ site: "bangumi", id: "100" }],
    },
  ],
};

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => payload,
  };
}

async function createFixture() {
  return fs.mkdtemp(path.join(os.tmpdir(), "anime-catalog-"));
}

test("reuses a fresh cache without checking the network", async () => {
  const root = await createFixture();
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    if (url.includes("data.jsdelivr.com")) {
      return jsonResponse({ tags: { latest: "1.0.0" } });
    }
    return jsonResponse(rawCatalog);
  };
  try {
    const store = new CatalogStore(root, {
      fetchImpl,
      now: () => "2026-10-25T00:00:00.000Z",
    });
    const first = await store.load();
    assert.equal(first.itemCount, 1);
    assert.equal(requests.length, 2);

    const requestsAfterFirstLoad = requests.length;
    const cachedStore = new CatalogStore(root, {
      fetchImpl,
      now: () => "2026-10-25T12:00:00.000Z",
      maxAgeMs: 24 * 60 * 60 * 1000,
    });
    const cached = await cachedStore.load();
    assert.equal(cached.source.version, "1.0.0");
    assert.equal(requests.length, requestsAfterFirstLoad);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rechecks the version after the cache expires", async () => {
  const root = await createFixture();
  let version = "1.0.0";
  let checks = 0;
  const fetchImpl = async (url) => {
    if (url.includes("data.jsdelivr.com")) {
      checks += 1;
      return jsonResponse({ tags: { latest: version } });
    }
    return jsonResponse(rawCatalog);
  };
  try {
    await new CatalogStore(root, {
      fetchImpl,
      now: () => "2026-10-25T00:00:00.000Z",
    }).load();

    version = "1.1.0";
    const refreshed = await new CatalogStore(root, {
      fetchImpl,
      now: () => "2026-10-26T01:00:00.000Z",
      maxAgeMs: 24 * 60 * 60 * 1000,
    }).load();
    assert.equal(checks, 2);
    assert.equal(refreshed.source.version, "1.1.0");
    assert.equal(refreshed.source.checkedAt, "2026-10-26T01:00:00.000Z");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("falls back to unpkg and keeps the old cache after network failures", async () => {
  const root = await createFixture();
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (url.includes("data.jsdelivr.com")) {
      return jsonResponse({ tags: { latest: "2.0.0" } });
    }
    if (url.includes("cdn.jsdelivr.net") && url.includes("dist/data.json")) {
      throw new Error("CDN unavailable");
    }
    if (url.includes("unpkg.com")) {
      return jsonResponse(rawCatalog);
    }
    throw new Error("unexpected request");
  };
  try {
    const store = new CatalogStore(root, {
      fetchImpl,
      now: () => "2026-10-25T00:00:00.000Z",
    });
    const catalog = await store.load();
    assert.equal(catalog.itemCount, 1);
    assert.ok(requested.some((url) => url.includes("unpkg.com")));

    const offline = new CatalogStore(root, {
      fetchImpl: async () => {
        throw new Error("offline");
      },
      now: () => "2026-10-27T00:00:00.000Z",
      maxAgeMs: 24 * 60 * 60 * 1000,
    });
    const fallback = await offline.load();
    assert.equal(fallback.itemCount, 1);
    assert.equal(fallback.source.version, "2.0.0");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("loads multiple catalog items without rescanning the cache per item", async () => {
  const root = await createFixture();
  const fetchImpl = async (url) => {
    if (url.includes("data.jsdelivr.com")) {
      return jsonResponse({ tags: { latest: "1.0.0" } });
    }
    return jsonResponse(rawCatalog);
  };
  try {
    const store = new CatalogStore(root, {
      fetchImpl,
      now: () => "2026-10-25T00:00:00.000Z",
    });
    const items = await store.getItems(["bangumi:100", "missing:item"]);

    assert.deepEqual(
      items.map((item) => item.id),
      ["bangumi:100"],
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
