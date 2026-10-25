import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);

const userscriptHeader = `// ==UserScript==
// @name         Bangumi Scout - 番剧识别助手
// @name:zh-CN   Bangumi Scout - 番剧识别助手
// @namespace    local.anime-index-userscript
// @version      ${packageJson.version}
// @description  使用本地番剧索引、正则候选、模糊搜索与 DeepSeek 辅助识别当前番剧
// @author       local
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      data.jsdelivr.com
// @connect      cdn.jsdelivr.net
// @connect      unpkg.com
// @connect      raw.githubusercontent.com
// @connect      gist.githubusercontent.com
// @connect      api.bilibili.com
// @connect      api.deepseek.com
// @run-at       document-idle
// ==/UserScript==

`;

await fs.mkdir(path.join(root, "dist"), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "src/main.js")],
  outfile: path.join(root, "dist/anime-index.user.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome110", "firefox110"],
  charset: "utf8",
  legalComments: "none",
  sourcemap: false,
  banner: { js: userscriptHeader },
  loader: {
    ".css": "text",
  },
});

console.log("Built dist/anime-index.user.js");
