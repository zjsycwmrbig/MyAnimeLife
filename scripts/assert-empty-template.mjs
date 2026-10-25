import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const dataDirectory = path.join(root, "data", "anime");
const entries = await fs.readdir(dataDirectory, { withFileTypes: true });
const recordFiles = entries.filter(
  (entry) => entry.isFile() && entry.name.endsWith(".json"),
);

if (recordFiles.length > 0) {
  console.error(
    `模板上游必须保持空白，但 data/anime 中发现 ${recordFiles.length} 条记录。`,
  );
  process.exitCode = 1;
} else {
  console.log("模板上游检查通过：data/anime 不含任何记录。");
}
