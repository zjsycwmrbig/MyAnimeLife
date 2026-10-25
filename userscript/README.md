# Bangumi Scout

MyAnimeLife 仓库中的油猴脚本模块。个人评分和短评会先保存为本地草稿；配置自己的 GitHub 数据仓库后，也可以通过 Contents API 同步记录。

## 当前能力

- 第一次运行时下载 `bangumi-data`，转换为适合本地搜索的精简索引并写入 `IndexedDB`。
- 启动时先使用缓存，随后按设定频率检查 npm 包版本；版本没变就不重新下载索引。
- 索引缓存可以随脚本启动准备，但当前网页只在用户点击入口、重新识别或 AI 辅助时才进行识别，页面加载和切换不会自动匹配。
- 从 URL 中提取 Bilibili `media_id`、`ep_id` 或 `season_id`，优先做精确匹配。
- 使用正则从标题、Open Graph、JSON-LD、`h1`、面包屑、简介和评论中生成标题候选。
- 读取 Bilibili 页面简介、可见短评以及 PGC 短评接口，作为正则与 DeepSeek 的识别上下文。
- 使用 Fuse.js 对正式名、中文名、英文名及其他别名做模糊搜索。
- 搜索和识别结果优先显示简体/繁体中文标题，日文原名作为次级信息继续保留并可搜索。
- Bilibili 播放页可以通过 PGC 接口补充当前季名称和别名。
- 配置 DeepSeek 后，可以在低置信度时自动调用，也可以手动点击“AI 辅助”。
- 在 Bilibili 个人追番页点击识别后，自动分页请求追番接口并汇总全部条目；接口受限时降级为扫描当前页面已渲染的番剧卡片。
- 追番列表支持逐项多选、全选可导入项和一次批量同步；每条新记录默认未评分、无评价，已有记录会自动跳过并保留原评分与评价。
- 候选结果可以直接点选；选中后候选区会自动收起并进入评分/短评区，也可随时点“重新选择”展开。
- 可以填写 1-10 分个人评分和 20000 字短评，并优先保存在本机油猴存储中。
- 可以从模板生成的个人仓库按需读取完整 JSONL，并将修改覆盖写回 `data/anime.jsonl` 和 `data/anime-index.jsonl`。
- 封面优先使用 Bilibili PGC 元数据；没有时通过 Bangumi subject ID 查询并缓存。
- 识别面板可以手动关闭、拖动位置，或收起为贴附屏幕左/右侧的“番剧”标签。

## 识别顺序

```text
页面站点 ID
  -> 本地索引精确匹配
  -> 正则提取标题候选
  -> 简介/评论提及补充候选
  -> 本地别名精确/子串匹配
  -> Fuse.js 模糊搜索
  -> 候选打分与歧义判断
  -> DeepSeek 可选兜底
  -> 手动搜索
```

正则不负责直接判断“这是哪部番”，只负责从网页标题、简介、评论和 DOM 中提取候选。稳定站点 ID 和索引匹配负责最终判断；正则不确定时可以让 DeepSeek 结合页面上下文推断。

## 安装与设置

1. 运行 `npm install && npm run build`。
2. 在 Tampermonkey 中安装 [`dist/anime-index.user.js`](dist/anime-index.user.js)。
3. 打开任意网页，右下角会出现识别入口；首次点击才读取并识别当前页面。
4. 通过 Tampermonkey 的脚本菜单选择“Bangumi Scout 设置”，配置索引、DeepSeek 和 GitHub 仓库。

设置没有放进网页内的识别面板。当前项目是油猴脚本，不是传统 Chrome 扩展，因此没有浏览器层面的 `options_ui`；Tampermonkey 脚本菜单就是对应的扩展设置入口。

主要设置项：

- 番剧缓存索引开关
- `bangumi-data` 或自定义精简索引 URL
- 每次启动、每天、每周、仅手动检查更新
- 正则标题候选开关
- 模糊搜索阈值和 AI 自动兜底阈值
- DeepSeek API Key、API 地址、模型和页面上下文长度
- GitHub 番剧仓库地址、分支、细粒度 Token 和连接检查

DeepSeek Key 使用 `GM_setValue` 保存在本机 Tampermonkey 存储中，不写入仓库。关闭 AI 时不会请求 DeepSeek。

## GitHub 番剧仓库

新用户可以在设置的 GitHub 区域点击“用模板新建”，从公开模板仓库
[`zjsycwmrbig/MyAnimeLife`](https://github.com/zjsycwmrbig/MyAnimeLife/generate)
生成自己的个人数据仓库。不要填写或同步到模板仓库本身。完成以下步骤后，面板中的保存按钮会从“保存草稿”变为“保存到 GitHub”：

1. 在 Bangumi Scout 设置中点击“检查模板”，确认上游已公开并启用 `Template repository`。
2. 使用 GitHub 的“Use this template”创建个人数据仓库，例如 `my-anime-life`。生成仓库只包含默认分支当前文件，不继承上游提交历史，`data/anime.jsonl` 与 `data/anime-index.jsonl` 保持为空。
3. 在仓库 `Settings > Pages` 中将 Source 设置为 `GitHub Actions`，用于生成公开展示页。
4. 创建仅限该个人数据仓库的[细粒度 Token](https://github.com/settings/personal-access-tokens/new)。Repository permissions 中只授予 `Contents: Read and write`，`Metadata: Read-only` 会由 GitHub 自动附带。
5. 在 Bangumi Scout 设置中填写仓库地址、分支和 Token，保存后点击“检查连接”。

Token 不是 GitHub 账户密码，只保存在本机 Tampermonkey 存储中。模板仓库用于生成个人数据仓库，油猴脚本的同步仓库地址必须填写用户自己生成的个人数据仓库。

模板检查只在用户点击时请求公开的 GitHub API，不增加脚本启动开销。上游仓库必须先启用 `Template repository`，上述生成入口才会生效。若以后模板有多个分支，从模板创建仓库时应保持 `Include all branches` 未勾选，避免把上游其他分支带入个人仓库。

GitHub Fork 会复制完整提交历史，不能只排除 JSONL 数据文件或对其内容隐藏。即使最新提交已经清空记录，旧提交中的内容仍可能被恢复；`.gitignore` 只影响未跟踪文件，也无法解决这个问题。个人记录只应写入模板生成的个人仓库，不要提交回上游模板。

油猴脚本通过 `api.github.com` 的 Contents API 按需读取和写入：

```text
data/anime.jsonl
data/anime-index.jsonl
```

`anime.jsonl` 每行是一条完整记录，是唯一数据源；`anime-index.jsonl` 由完整记录确定性生成，只保留标题、别名、评分摘要、站点 ID 和季度等轻量字段。油猴端正常读取这两个文件只需两个 Contents API 请求，不再按番剧数量产生 N+1 请求。

记录遵循模板仓库的 `schemas/anime.schema.json`。ID 优先使用 Bilibili、Bangumi、AniList 或 MAL 的稳定站点 ID。重复检测直接扫描索引。同步时按 ID 合并完整记录，同一 ID 以较新的 `updatedAt` 为准，然后重建索引并覆盖两个文件；遇到 `409`/`422` 会重新读取并重试一次。覆盖前会创建同时包含完整数据和索引的备份快照，最多保留 5 份。

读取发生在用户选定番剧之后，不会在普通页面加载时请求 GitHub。保存时始终先写本地 `GM_setValue` 草稿，再尝试远端写入；Token 无效、网络失败或仓库不可写时，本地评分和评价仍然保留。

`github.token` 只保存在本机 Tampermonkey 存储中，不会写入页面、日志或仓库。脚本只申请访问 `api.github.com`，不会为了读取记录而放开所有 `github.io` 子域。

## Bilibili 追番导入

打开 `space.bilibili.com/<uid>/bangumi` 或 Bilibili 的“我的追番”页面后，入口会切换为追番专用图标和颜色。点击“识别当前页”才会读取追番数据；脚本通过 Bilibili 追番列表接口按 `pn` 自动翻页，单次最多读取 2000 部。只有用户点击识别时才请求该接口，普通网页加载不会触发。

翻页与本地索引匹配会分批进行并持续显示进度，匹配过程会主动让出主线程，避免长列表造成页面卡顿。接口受登录状态、风控或页面改版影响时，脚本会提示失败原因并降级扫描当前 DOM 中已加载的卡片。批量导入仍只覆盖一次 `data/anime.jsonl` 和一次 `data/anime-index.jsonl`，并在覆盖前创建备份；Bilibili `media_id`、`season_id` 或其他稳定站点 ID 已存在的记录不会被覆盖。

## 本地索引

浏览器缓存使用 `IndexedDB`，数据库名为 `bangumi-scout-index`。第一次使用官方源时会下载约 7.6 MiB 的原始 JSON，转换后约 4.8 MiB；实测包含 8,925 部作品，其中 3,207 部有 Bilibili 映射。

精简索引结构见 [`data/index-schema.example.json`](data/index-schema.example.json)。每条记录包含：

- `id`：跨站点稳定 ID
- `title`：主标题
- `displayTitle`：界面展示标题，优先取简体中文，其次繁体中文，最后回退到主标题
- `names`：所有可搜索名称和别名
- `normalizedNames`：去空格、标点、大小写后的搜索键
- `sites`：Bilibili、Bangumi、MAL、AniList 等站点 ID
- `type`、`begin`、`year`
- `coverUrl`：可选封面地址；自定义索引可以直接提供

从本地原始数据生成精简索引：

```bash
npm run build:index -- /path/to/bangumi-data.json
```

从固定版本 URL 生成：

```bash
npm run build:index -- \
  https://cdn.jsdelivr.net/npm/bangumi-data@0.3.234/dist/data.json
```

输出位置默认为 `data/bangumi-data.slim.json`，该文件不会提交到 Git。后续可以把同一格式的索引托管到自己的 GitHub，并在设置中选择“自定义精简索引 URL”。

## 更新策略

- `每次启动`：一个浏览器环境内最多每 15 分钟检查一次。
- `每天`、`每周`：达到时间间隔后才检查。
- `仅手动`：只通过设置里的“检查更新”或脚本菜单触发。
- 官方源先检查 npm 版本号，只有版本变化才下载数据。
- 自定义源用内容哈希判断是否变化。
- 更新失败时继续使用现有本地缓存。

## 开发

```bash
npm install
npm test
npm run build
npm run test:e2e
npm run check
```

- `src/core`：设置、网络、IndexedDB、标题规范化
- `src/index`：索引构建与更新服务
- `src/search`：本地精确、子串和 Fuse.js 模糊搜索
- `src/recognizers`：页面上下文、正则候选、Bilibili 和 DeepSeek
- `src/ui`：隐藏式识别面板与独立设置窗口
- `dist/anime-index.user.js`：最终可安装的油猴脚本
- `demo/`：不访问真实接口的浏览器预览

## 数据与接口说明

- [bangumi-data](https://github.com/bangumi-data/bangumi-data)：主索引，CC BY 4.0。
- [Bangumi API](https://github.com/bangumi/api)：用于按索引中的 `sites.bangumi` 查询封面。
- Bilibili PGC 接口属于站内接口，应继续封装在 adapter 中并做缓存、限流和失败降级。
- Bilibili 的 `media_id` 与 `season_id` 不是同一个值。媒体页通常是 `md{media_id}`，播放页查询通常使用 `season_id` 或 `ep_id`。
- `bangumi-data` 以日本动画为主，国产动画覆盖可能不完整；这类作品更适合依赖当前页面、自定义索引或 AI/手动搜索。
- `bangumi-data` 本身不提供封面字段。当前实现会尝试 Bilibili PGC `cover`，再使用 `sites.bangumi` 请求 Bangumi API；结果在 `GM_setValue` 中缓存 90 天，最多保留 600 条。
