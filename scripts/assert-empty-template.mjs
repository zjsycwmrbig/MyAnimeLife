import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANIME_INDEX_JSONL_PATH,
  ANIME_JSONL_PATH,
  BACKUP_DIRECTORY,
  parseJsonl,
} from "./library-data.mjs";
import {
  BANGUMI_CACHE_JSONL_PATH,
  parseBangumiCacheJsonl,
} from "./bangumi-cache-data.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const records = parseJsonl(
  await fs.readFile(path.join(root, ANIME_JSONL_PATH), "utf8"),
  ANIME_JSONL_PATH,
);
const index = parseJsonl(
  await fs.readFile(path.join(root, ANIME_INDEX_JSONL_PATH), "utf8"),
  ANIME_INDEX_JSONL_PATH,
);
const bangumiCache = parseBangumiCacheJsonl(
  await fs.readFile(path.join(root, BANGUMI_CACHE_JSONL_PATH), "utf8"),
  BANGUMI_CACHE_JSONL_PATH,
);
const backupEntries = await fs.readdir(path.join(root, BACKUP_DIRECTORY), {
  withFileTypes: true,
});
const backups = backupEntries.filter(
  (entry) => entry.isFile() && entry.name.endsWith(".json"),
);

if (
  records.length > 0 ||
  index.length > 0 ||
  bangumiCache.length > 0 ||
  backups.length > 0
) {
  console.error(
    `模板上游必须保持空白，但发现 ${records.length} 条记录、${index.length} 条索引、${bangumiCache.length} 条 Bangumi 缓存和 ${backups.length} 个备份。`,
  );
  process.exitCode = 1;
} else {
  console.log("模板上游检查通过：JSONL 数据、Bangumi 缓存和备份均为空。");
}
