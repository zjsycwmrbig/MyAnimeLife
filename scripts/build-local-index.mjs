import fs from "node:fs/promises";
import path from "node:path";
import { buildSlimIndex } from "../src/index/build-index.js";

const sourceUrl =
  process.argv[2] ??
  "https://cdn.jsdelivr.net/npm/bangumi-data@0.3.234/dist/data.json";
const outputPath = path.resolve(
  process.argv[3] ?? "data/bangumi-data.slim.json",
);

let rawText;
let sourceVersion = "local";
if (/^https?:\/\//iu.test(sourceUrl)) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download index: ${response.status}`);
  }
  rawText = await response.text();
  sourceVersion =
    sourceUrl.match(/bangumi-data@([^/]+)/u)?.[1] ?? "remote";
} else {
  rawText = await fs.readFile(path.resolve(sourceUrl), "utf8");
}

let raw;
try {
  raw = JSON.parse(rawText);
} catch {
  throw new Error("Index source is not valid JSON");
}
const slim = buildSlimIndex(raw, {
  sourceName: "bangumi-data",
  sourceVersion,
  fetchedAt: new Date().toISOString(),
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(slim));

const size = (await fs.stat(outputPath)).size;
console.log(
  `Wrote ${slim.items.length} items (${(size / 1024 / 1024).toFixed(2)} MiB) to ${outputPath}`,
);
