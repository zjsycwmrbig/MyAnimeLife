import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECT_VERSION } from "../scripts/project-version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("keeps the project version consistent across release metadata", async () => {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8"),
  );
  const versionFile = (
    await fs.readFile(path.join(root, "VERSION"), "utf8")
  ).trim();
  const algorithmDoc = await fs.readFile(
    path.join(root, "docs", "recommendation-algorithm.md"),
    "utf8",
  );

  assert.equal(PROJECT_VERSION, "1.1.4");
  assert.equal(packageJson.version, PROJECT_VERSION);
  assert.equal(versionFile, PROJECT_VERSION);
  assert.match(algorithmDoc, /状态：可用版本（production）/u);
  assert.match(algorithmDoc, /项目版本：`1\.1\.4`/u);
});
