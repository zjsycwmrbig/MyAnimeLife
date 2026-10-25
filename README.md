# Anime Records Template

一个可以直接 fork 的番剧档案源仓库。每部番剧保存为一个 JSON 文件，GitHub Actions 在部署时校验数据、套用模板并生成 GitHub Pages 静态网站。

仓库中的数据和模板彼此独立：

```text
data/anime/*.json + templates/<current>/ = dist/*
```

因此替换模板不需要迁移个人记录，修改个人记录也不会触碰页面代码。

## 页面能力

- 首页展示全部番剧、封面、评分、评价摘要和匹配状态
- 支持标题、评价、备注和跨站索引 ID 搜索
- 支持已评分/未评分筛选，以及更新时间、评分、标题排序
- 每部番剧有独立详情页
- 显示 Bangumi、Bilibili、AniList、MyAnimeList 的关联 ID 和链接
- 构建时自动生成供油猴脚本读取的 `dist/data/library.json`
- 提供可替换的模板契约和两份不同职责的说明文档

当前仓库是只读展示网站。数据修改通过 GitHub 网页编辑、后续油猴脚本或 GitHub Contents API 完成。

## Fork 后使用

1. 在 GitHub 创建自己的仓库或直接 Fork 本仓库。
2. 修改 [`config/site.json`](config/site.json) 中的站点名称和描述。
3. 将 `data/anime/` 中的示例记录替换为自己的记录。
4. 进入仓库 `Settings > Pages`，把 Source 设置为 `GitHub Actions`。
5. 推送到 `main` 分支，等待 `Deploy GitHub Pages` 工作流完成。

构建器会自动从 GitHub Actions 环境读取仓库地址，因此详情页能够生成正确的“在 GitHub 编辑数据”链接，不需要在配置中写死用户名。

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

常用命令：

```bash
npm run validate  # 只校验配置、Schema、模板和索引
npm run build     # 生成 dist/
npm test          # 运行构建和 Schema 测试
npm run check     # 测试后重新构建
```

## 仓库结构

```text
.
├─ .github/workflows/pages.yml
├─ config/site.json
├─ data/anime/*.json
├─ schemas/anime.schema.json
├─ scripts/
│  ├─ build.mjs
│  ├─ validate.mjs
│  └─ serve.mjs
├─ templates/
│  └─ default/
│     ├─ template.json
│     ├─ base.njk
│     ├─ index.njk
│     ├─ detail.njk
│     ├─ 404.njk
│     └─ assets/
└─ tests/
```

`dist/` 是构建产物，不提交到 Git。GitHub Actions 会把整个目录上传为 Pages artifact。

## 数据标准

每部番剧对应一个文件：

```text
data/anime/{id}.json
```

`id` 创建后不要修改，文件名必须与它完全一致。推荐使用稳定来源：

```text
bili-292073015
bgm-420628
manual-01jabcdef
```

最小示例：

```json
{
  "$schema": "../../schemas/anime.schema.json",
  "schemaVersion": 1,
  "id": "bili-292073015",
  "title": "相反的你和我",
  "rating": 9.2,
  "review": "我的评价。",
  "coverUrl": "https://example.com/cover.jpg",
  "note": "我的备注。",
  "externalIds": {
    "bangumi": "525565",
    "bilibiliMedia": "292073015",
    "anilist": "184951",
    "mal": "60371"
  },
  "match": {
    "status": "matched",
    "method": "site-id",
    "source": "bangumi-data",
    "confidence": 1,
    "matchedTitle": "正反対な君と僕",
    "matchedAt": "2026-10-25T08:30:00Z"
  },
  "createdAt": "2026-10-25T08:30:00Z",
  "updatedAt": "2026-10-25T08:30:00Z"
}
```

字段规则：

| 字段 | 规则 |
|---|---|
| `id` | 不可变，文件名必须为 `{id}.json` |
| `title` | 页面展示名称，可以来自匹配或手动输入 |
| `rating` | `null` 表示未评分，否则为 `0` 到 `10` 的数字 |
| `review` | 我的评价，支持 Markdown，原始 HTML 会被禁用 |
| `coverUrl` | 封面 URL；没有时为 `null` |
| `note` | 给人看的补充备注，支持 Markdown |
| `externalIds` | 跨站索引，全部使用字符串 |
| `match` | 匹配状态、来源、方式、置信度和原始标题 |
| `createdAt` | 创建时间，ISO 8601 时间字符串 |
| `updatedAt` | 最后更新时间，ISO 8601 时间字符串 |
| `deletedAt` | 可选；非空时默认页面会隐藏该记录 |

完整约束见 [`schemas/anime.schema.json`](schemas/anime.schema.json)，详细编辑说明见 [`data/README.md`](data/README.md)。

构建器还会额外检查：

- 文件名是否与 `id` 一致
- 是否存在重复 `id`
- 同一个 Bilibili、Bangumi、AniList 或 MAL ID 是否被多条记录占用
- JSON 是否符合 Schema
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
  "itemCount": 6,
  "items": []
}
```

油猴脚本应读取这个地址，而不是直接遍历 GitHub 仓库。更新源 JSON 后，GitHub Actions 会重新生成它。

## 更换模板

在 `config/site.json` 中切换模板：

```json
{
  "template": "default"
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

示例记录使用 [`bangumi-data`](https://github.com/bangumi-data/bangumi-data) 风格的中日文标题与跨站 ID。封面链接直接指向 AniList 图片 CDN，不包含在仓库中。

后续如果接入 Bilibili PGC 或 Bangumi API，应将这些访问封装在独立 adapter 中，并进行缓存、限流和失败回退。Bilibili 的 `media_id` 与 `season_id` 必须分别保存。

## License

仓库代码使用 MIT License。示例番剧名称、封面和元数据归各自权利方所有，仅用于展示数据组织方式。
