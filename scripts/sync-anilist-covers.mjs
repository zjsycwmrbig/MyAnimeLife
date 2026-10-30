import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogStore } from "./catalog-store.mjs";
import {
  enrichCatalogWithAniListCovers,
  hydrateCatalogCoversFromCompact,
} from "./anilist-covers.mjs";
import { compactPublicCatalogMetadata } from "./recommendations.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDirectory, "..");

function parseArguments(argv) {
  const options = {
    root: defaultRoot,
    output: "admin/bangumi-public-catalog.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      options.root = path.resolve(argv[++index]);
    } else if (argument === "--output") {
      options.output = argv[++index];
    } else {
      throw new Error(`未知参数：${argument}`);
    }
  }
  return options;
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(payload)}\n`);
  await fs.rename(temporaryPath, filePath);
}

function coverCount(catalog) {
  return (catalog?.items ?? []).filter((item) => item?.coverUrl).length;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = path.resolve(options.root);
  const outputPath = path.resolve(root, options.output);
  const store = new CatalogStore(root);
  const catalog = await store.load({ refresh: false });
  if (!Array.isArray(catalog?.items) || !catalog.items.length) {
    throw new Error("全量索引中没有可处理的番剧");
  }

  const previousCatalog = await readOptionalJson(outputPath);
  const hydrated = hydrateCatalogCoversFromCompact(catalog, previousCatalog);
  console.log(
    `Reused ${hydrated} catalog covers; ${catalog.items.length - coverCount(catalog)} still need covers.`,
  );

  let lastLoggedPercent = -10;
  const result = await enrichCatalogWithAniListCovers(catalog, {
    onProgress(progress) {
      const percent = progress.total
        ? Math.floor((progress.completed / progress.total) * 100)
        : 100;
      if (percent >= lastLoggedPercent + 10 || progress.completed === progress.total) {
        lastLoggedPercent = percent;
        console.log(
          `AniList covers ${percent}% (${progress.covers}/${progress.total} matched, ${progress.failures} request failures)`,
        );
      }
    },
  });

  const generatedAt = new Date().toISOString();
  const compactCatalog = compactPublicCatalogMetadata(catalog, generatedAt);
  compactCatalog.source.coverSource = catalog.source?.coverSource ?? null;
  await writeJsonAtomic(outputPath, compactCatalog);
  await store.writeCache(catalog);

  console.log(
    `Wrote ${path.relative(root, outputPath)} with ${coverCount(catalog)} covers ` +
      `(${result.applied} new, ${result.matched}/${result.requested} AniList matches).`,
  );
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
