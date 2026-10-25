# Anime Records Template

一个可以通过 GitHub Template 生成个人副本的番剧档案源仓库。完整记录集中保存在 `data/anime.jsonl`，轻量索引保存在 `data/anime-index.jsonl`；GitHub Actions 在部署时校验数据、套用模板并生成 GitHub Pages 静态网站。

仓库中的数据和模板彼此独立：

```text
data/anime.jsonl + data/anime-index.jsonl + templates/<current>/ = dist/*
```

因此替换模板不需要迁移个人记录，修改个人记录也不会触碰页面代码。

## 页面能力

- 首页展示全部番剧、封面、评分、评价摘要和匹配状态；没有记录时显示空白引导
- 支持标题、评价、备注和跨站索引 ID 搜索
- 支持已评分/未评分筛选，以及更新时间、评分、标题排序
- 每部番剧有独立详情页
- 显示 Bangumi、Bilibili、AniList、MyAnimeList 的关联 ID 和链接
- 构建时自动生成供油猴脚本读取的 `dist/data/library.json`
- 提供只在本地运行的批量管理页，可搜索、编辑评分和评价、批量删除、一键提交并推送
- 内置三套可切换模板和两份不同职责的说明文档

GitHub Pages 只发布只读展示网站。管理页不会部署到 Pages，只在本地克隆中通过 `npm run admin` 启动。

## 创建个人仓库

推荐使用 GitHub 的 `Use this template`，不要直接 Fork。模板生成的仓库与上游提交历史无关联，只包含默认分支当前文件，因此不会继承上游历史中的番剧记录。

1. 仓库所有者在上游 `Settings` 中启用 `Template repository`。
2. 打开仓库页面，点击 `Use this template > Create a new repository`。
3. 修改新仓库 [`config/site.json`](config/site.json) 中的站点名称和描述。
4. 新仓库的 `data/anime.jsonl` 与 `data/anime-index.jsonl` 为空。通过油猴脚本保存第一条记录，或按 [`data/README.md`](data/README.md) 手动新增。
5. 进入新仓库 `Settings > Pages`，把 Source 设置为 `GitHub Actions`。
6. 推送到 `main` 分支，等待 `Deploy GitHub Pages` 工作流完成。

构建器会自动从 GitHub Actions 环境读取仓库地址，因此详情页能够生成正确的“在 GitHub 编辑数据”链接，不需要在配置中写死用户名。

## 模板、Fork 与分支隔离

GitHub 不支持只 Fork 某一个分支。Fork 会复制仓库当时可见的全部分支和提交历史；GitHub 也没有“只对 Fork 隐藏 JSONL 记录”的能力。`.gitignore` 不能让已经提交的记录从 Fork 中消失，`.gitattributes export-ignore` 也只会影响源码归档。

因此本项目把 `Use this template` 作为推荐路径：

- `zjsycwmrbig/anime-records-template` 的 `main` 分支始终保持两个 JSONL 文件为空。
- 新用户通过 `Use this template` 生成一个提交历史无关联的个人仓库。生成结果只包含模板默认分支的当前文件，不继承其他分支，也不继承上游旧提交中的记录。
- 第一条评分或评价只会写进用户自己的个人仓库。
- 上游部署前会运行空白检查；如果模板仓库误提交了个人记录，发布流程会直接失败。
- 个人记录不要提交到上游模板，也不需要向上游发 Pull Request。
- 如果要让同一套模板生成自己的站点，请在自己的个人仓库中录入和维护记录。

当前上游历史曾包含示例记录。最新提交删除这些文件并不会把它们从 Git 历史中移除，所以直接 Fork 仍可能从旧提交恢复它们。若历史中的记录也不应继续公开，需要重建或重写上游仓库历史；已有 Fork 不会因为上游随后删除文件而自动清除旧数据。

如果希望把模板和个人数据放在不同分支，可以采用 `main + records` 组织方式：

1. 先通过 `Use this template` 创建个人仓库，此时默认 `main` 继承空模板。
2. 从 `main` 新建 `records` 分支，只在 `records` 分支提交 `data/anime.jsonl` 与 `data/anime-index.jsonl`。
3. 在仓库 `Settings > General` 中把默认分支切换为 `records`。
4. 油猴脚本的 GitHub 分支设置填写 `records`。
5. 保持 `main` 为空，不把个人记录合并回去。

Pages 工作流只在当前默认分支执行，因此把 `records` 设为默认分支后，它才会发布个人站点。分支方案便于保持 `main` 干净，但**不是隐私边界**：公开仓库的所有分支都可被访问，也都会被 Fork 复制。需要真正私密的数据时，必须使用私有仓库，或把数据拆到独立的私有仓库。

如果未来需要让代码公开、记录完全私有，应再拆成“模板仓库 + 独立数据仓库”的双仓库模式。当前版本仍采用单仓库，以换取更简单的模板生成、Token 和 Pages 部署流程。

## 本地运行

```bash
npm install
npm run validate
npm test
npm run dev
```

本地预览默认运行在：

```text
http://127.0.0.1:4173
```

本地管理页使用另一个命令启动：

```bash
npm run admin
```

默认地址为 `http://127.0.0.1:4174/admin/`。服务只监听本机回环地址，不会部署到 GitHub Pages。

常用命令：

```bash
npm run validate  # 只校验配置、Schema、模板和索引
npm run build     # 生成 dist/
npm test          # 运行构建和 Schema 测试
npm run check     # 测试后重新构建
npm run admin     # 启动本地数据管理页
```

## 本地管理页

管理页面向已经克隆到本机的个人仓库，可以：

- 按标题、评价、备注和站点 ID 搜索
- 按已评分或未评分筛选
- 多选并批量删除番剧
- 编辑标题、评分、评价和备注
- 查看当前分支、origin 和未提交状态
- 一键提交 `data/anime.jsonl`、`data/anime-index.jsonl` 与备份，并推送到 origin

保存时页面会读取当前 JSONL，原子写入完整数据和重建后的索引，再从本地 Git 仓库提交。若本地已有其他未跟踪文件，它们不会进入这次数据提交。

每次内容实际发生变化时，覆盖前都会生成一个同时包含完整 JSONL 和索引 JSONL 的快照：

```text
data/backups/library-<timestamp>-<hash>.json
```

配置中的 `backupLimit` 默认为 `5`。超过上限时，按备份文件名从旧到新删除；JSONL 文件以当前写出的完整内容为准，不做追加。

## 仓库结构

```text
.
├─ .github/workflows/pages.yml
├─ admin/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
├─ config/site.json
├─ data/
│  ├─ anime.jsonl
│  ├─ anime-index.jsonl
│  └─ backups/
├─ schemas/
│  ├─ anime.schema.json
│  └─ anime-index.schema.json
├─ scripts/
│  ├─ admin.mjs
│  ├─ admin-store.mjs
│  ├─ build.mjs
│  ├─ library-data.mjs
│  ├─ validate.mjs
│  └─ serve.mjs
├─ templates/
│  ├─ default/
│  ├─ compact/
│  └─ spotlight/
└─ tests/
```

`dist/` 是构建产物，不提交到 Git。GitHub Actions 会把整个目录上传为 Pages artifact。

## 数据标准

`data/anime.jsonl` 是唯一数据源。每行保存一条完整的 JSON 对象，文件末尾保留换行；空库就是一个 0 字节文件。

```text
data/anime.jsonl
```

`data/anime-index.jsonl` 是从完整数据确定性生成的轻量索引，用于重复检测和公开页面接口。不要手工维护它；运行管理页、构建或校验流程会比对两份数据是否一致。

`id` 创建后不要修改。推荐使用稳定来源：

```text
bili-292073015
bgm-420628
manual-01jabcdef
```

`data/anime.jsonl` 中一行的最小示例：

```json
{"schemaVersion":1,"id":"bili-292073015","title":"相反的你和我","rating":9.2,"review":"我的评价。","coverUrl":"https://example.com/cover.jpg","note":"我的备注。","externalIds":{"bangumi":"525565","bilibiliMedia":"292073015","bilibiliSeason":"129142","anilist":"184951","mal":"60371"},"season":{"key":"bgm:525565","number":1,"label":"第1季","year":2023},"match":{"status":"matched","method":"site-id","source":"bangumi-data","confidence":1,"matchedTitle":"正反対な君と僕","matchedAt":"2026-10-25T08:30:00Z"},"createdAt":"2026-10-25T08:30:00Z","updatedAt":"2026-10-25T08:30:00Z"}
```

字段规则：

| 字段 | 规则 |
|---|---|
| `id` | 在完整文件中不可重复，创建后不要修改 |
| `title` | 页面展示名称，可以来自匹配或手动输入 |
| `rating` | `null` 表示未评分，否则为 `0` 到 `10` 的数字 |
| `review` | 我的评价，支持 Markdown，原始 HTML 会被禁用 |
| `coverUrl` | 封面 URL；没有时为 `null` |
| `note` | 给人看的补充备注，支持 Markdown |
| `externalIds` | 跨站索引，全部使用字符串 |
| `season` | 可选季度身份；`number` 与 `label` 必须同时填写或同时为 `null` |
| `match` | 匹配状态、来源、方式、置信度和原始标题 |
| `createdAt` | 创建时间，ISO 8601 时间字符串 |
| `updatedAt` | 最后更新时间，ISO 8601 时间字符串 |
| `deletedAt` | 可选；非空时默认页面会隐藏该记录 |

完整约束见 [`schemas/anime.schema.json`](schemas/anime.schema.json)，详细编辑说明见 [`data/README.md`](data/README.md)。

构建器还会额外检查：

- 是否存在重复 `id`
- 同一个 Bilibili、Bangumi、AniList 或 MAL ID 是否被多条记录占用
- 季度编号与季度标签是否成对出现
- JSON 是否符合 Schema
- `anime-index.jsonl` 是否与 `anime.jsonl` 确定性重建的结果完全一致
- 模板声明和入口文件是否完整

## 公开数据接口

构建结果包含：

```text
/data/library.json
```

该文件是生成产物，不需要手动维护。结构如下：

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-25T12:00:00.000Z",
  "itemCount": 0,
  "items": []
}
```

油猴脚本应读取这个地址，而不是直接遍历 GitHub 仓库。更新 JSONL 数据后，GitHub Actions 会重新生成它。

## 更换模板

内置模板：

| 模板 | 布局特点 | 适合场景 |
|---|---|---|
| `default` | 封面卡片与编号档案风 | 通用展示，兼顾封面和评价摘要 |
| `compact` | 单列高密度清单，缩小封面和工具栏 | 记录很多、频繁搜索和快速扫描 |
| `spotlight` | 深色海报墙，放大封面和标题 | 以视觉浏览和作品回顾为主 |

在 `config/site.json` 中切换模板，不需要迁移 `data/anime.jsonl` 或 `data/anime-index.jsonl`：

```json
{
  "template": "compact"
}
```

模板目录必须包含自己的 `template.json`：

```json
{
  "id": "default",
  "name": "Archive",
  "contractVersion": 1,
  "entrypoints": {
    "index": "index.njk",
    "detail": "detail.njk",
    "notFound": "404.njk"
  },
  "assets": "assets"
}
```

模板契约版本当前为 `1`。构建器向模板提供：

- `site`：站点配置
- `repository`：当前 GitHub 仓库信息
- `records`：首页记录集合
- `record`：详情页当前记录
- `stats`：收录数、已评分数量和平均分
- `homeUrl`：适合当前页面层级的首页地址
- `assetRoot`：适合当前页面层级的静态资源地址
- `generatedAt`：本次构建时间

默认模板还使用 `Nunjucks` 的 `markdown`、`formatDate`、`formatDateTime` 和 `json` 过滤器。其他模板可以完全重写 HTML、CSS 和浏览器脚本，但不能修改数据字段。

## 数据源说明

仓库初始为空，不附带演示番剧或第三方站点数据。油猴脚本完成识别后，会把稳定站点 ID、标题、评分和评价写入 `data/anime.jsonl`，并同步重建 `data/anime-index.jsonl`。

后续如果接入 Bilibili PGC 或 Bangumi API，应将这些访问封装在独立 adapter 中，并进行缓存、限流和失败回退。Bilibili 的 `media_id` 与 `season_id` 必须分别保存。

## License

仓库代码使用 MIT License。用户自行写入的番剧名称、封面和元数据归各自权利方所有。
