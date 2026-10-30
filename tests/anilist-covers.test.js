import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAniListCovers,
  collectAniListCoverIds,
  fetchAniListCoverMap,
  hydrateCatalogCoversFromCompact,
} from "../scripts/anilist-covers.mjs";

test("collects only missing AniList cover ids when requested", () => {
  const catalog = {
    items: [
      { sites: { anilist: "1" }, coverUrl: null },
      { sites: { anilist: "2" }, coverUrl: "https://cdn.example.test/2.jpg" },
      { sites: { anilist: "3" }, coverUrl: "" },
      { sites: { bangumi: "4" }, coverUrl: null },
      { sites: { anilist: "1" }, coverUrl: null },
    ],
  };

  assert.deepEqual(collectAniListCoverIds(catalog), ["1", "2", "3"]);
  assert.deepEqual(
    collectAniListCoverIds(catalog, { missingOnly: true }),
    ["1", "3"],
  );
});

test("fetches AniList covers in paged GraphQL requests", async () => {
  let requests = 0;
  const fetchImpl = async (_url, options) => {
    requests += 1;
    const body = JSON.parse(options.body);
    const data = {};
    for (const [pageKey, ids] of Object.entries(body.variables)) {
      data[pageKey] = {
        media: ids.map((id) => ({
          id,
          coverImage: {
            extraLarge: `https://cdn.example.test/${id}.jpg`,
          },
        })),
      };
    }
    return {
      ok: true,
      json: async () => ({ data }),
    };
  };

  const result = await fetchAniListCoverMap(
    Array.from({ length: 60 }, (_, index) => String(index + 1)),
    {
      fetchImpl,
      requestDelayMs: 0,
      retries: 0,
    },
  );

  assert.equal(requests, 1);
  assert.equal(result.requested, 60);
  assert.equal(result.matched, 60);
  assert.equal(result.covers.get("50"), "https://cdn.example.test/50.jpg");
  assert.equal(result.covers.get("51"), "https://cdn.example.test/51.jpg");
});

test("hydrates and applies covers without replacing existing ones", () => {
  const catalog = {
    items: [
      { sites: { bangumi: "10", anilist: "100" }, coverUrl: null },
      { sites: { bangumi: "11", anilist: "101" }, coverUrl: null },
      {
        sites: { bangumi: "12", anilist: "102" },
        coverUrl: "https://existing.example.test/12.jpg",
      },
    ],
  };
  const compactCatalog = {
    items: {
      10: ["", "", 2020, "TV", null, null, null, "https://bgm.example.test/10.jpg"],
    },
  };

  assert.equal(hydrateCatalogCoversFromCompact(catalog, compactCatalog), 1);
  assert.equal(
    applyAniListCovers(
      catalog,
      new Map([
        ["100", "https://anilist.example.test/100.jpg"],
        ["101", "https://anilist.example.test/101.jpg"],
        ["102", "https://anilist.example.test/102.jpg"],
      ]),
    ),
    1,
  );
  assert.equal(catalog.items[0].coverUrl, "https://bgm.example.test/10.jpg");
  assert.equal(
    catalog.items[1].coverUrl,
    "https://anilist.example.test/101.jpg",
  );
  assert.equal(
    catalog.items[2].coverUrl,
    "https://existing.example.test/12.jpg",
  );
});
