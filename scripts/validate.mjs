import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileRecordValidator,
  loadEntries,
  loadSiteConfig,
  loadTemplate,
} from "./build.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

try {
  const config = await loadSiteConfig(root);
  const validator = await compileRecordValidator(root);
  const entries = await loadEntries(root, { config, validator });
  await loadTemplate(root, config.template);
  const deletedCount = entries.filter((entry) => entry.deletedAt).length;
  console.log(
    `校验通过: ${entries.length} 条记录，${deletedCount} 条软删除，模板 ${config.template}`,
  );
} catch (error) {
  console.error(`校验失败: ${error.message}`);
  process.exitCode = 1;
}
