# 数据编辑规范

`data/anime.jsonl` 是唯一的个人记录数据源。每行是一条完整 JSON 记录，构建时从中生成网页和 `dist/data/library.json`。`data/anime-index.jsonl` 是派生索引，用于网页列表和油猴端重复检测，不要手工编辑。

模板默认不包含任何番剧，两个 JSONL 文件都是空的。推荐用本地管理页维护：

```bash
npm run admin
```

打开 `http://127.0.0.1:4174/admin/` 后，可以直接搜索、编辑评分和评价、批量删除，并一键提交到本地 Git 再推送到 origin。

个人记录只应写入通过 `Use this template` 生成的个人仓库。上游模板必须始终保持两个 JSONL 和备份目录为空；GitHub 没有对 Fork 隐藏指定已跟踪数据的功能，Fork 还会复制完整提交历史。

## 新增记录

1. 启动管理页并确认当前仓库地址和分支。
2. 如果油猴脚本已配置个人仓库，先在网页中完成识别并保存评分或评价。
3. 也可以手动向 `data/anime.jsonl` 末尾追加一行完整 JSON 对象。
4. 运行 `npm run validate`，确认完整数据与索引一致。
5. 需要发布时运行 `npm run build`、提交并推送。

不要只修改索引。完整数据是源，索引必须由完整数据重建。构建器会逐字段比较当前索引和完整数据的确定性重建结果，不一致时直接失败。

## ID 与季度

`id` 创建后不要修改。推荐使用稳定的站点索引：

```text
bili-ss129142
bili-292073015
bgm-525565
manual-01jabcdef
```

不同季度必须使用不同 `id`。`season.number` 和 `season.label` 必须同时填写或同时为 `null`，并保留稳定的 `season.key`：

```json
{
  "season": {
    "key": "bili-ss129142",
    "number": 2,
    "label": "第2季",
    "year": 2026
  }
}
```

旧记录可以不包含 `season`，构建器会按“季度未知”处理。油猴脚本在确认匹配后可以补充季度字段；季度不同不应触发重复提醒。

## 需要人工维护的字段

- `title`：希望公开展示的名称
- `rating`：个人评分；无评分时必须是 `null`
- `review`：个人评价，可使用 Markdown
- `note`：个人备注，可使用 Markdown
- `coverUrl`：可选封面链接
- `season`：可选季度身份，包含稳定的 `key`、季度编号、显示标签和年份

## 由识别流程维护的字段

- `externalIds.bangumi`
- `externalIds.bilibiliMedia`
- `externalIds.bilibiliSeason`
- `externalIds.anilist`
- `externalIds.mal`
- `season.key`
- `season.number`
- `season.label`
- `season.year`
- `match.status`
- `match.method`
- `match.source`
- `match.confidence`
- `match.matchedTitle`
- `match.matchedAt`

`match` 和 `externalIds` 保持结构化，不要写进 `note`。这样油猴脚本可以直接根据站点 ID 查找记录，不需要重新解析文本。

## 匹配状态

| 值 | 含义 |
|---|---|
| `matched` | 已通过站点 ID、标题或 AI 完成匹配 |
| `manual` | 用户手动建立或手动选择 |
| `unmatched` | 尚无可靠索引 |

## 匹配方式

| 值 | 含义 |
|---|---|
| `site-id` | Bilibili、Bangumi 等站点 ID 精确命中 |
| `title-exact` | 标题或别名精确命中 |
| `title-fuzzy` | 模糊搜索后确认 |
| `ai` | AI 结合页面上下文推断后确认 |
| `manual` | 手动搜索或输入 |
| `import` | 从其他数据源批量导入 |

## 覆盖、索引与备份

管理页和油猴保存都使用覆盖式写入：

- 同一 `id` 只保留一条记录；油猴同步时较新的 `updatedAt` 胜出。
- 每次实际修改前生成一个备份快照。
- 快照同时保存 `animeText` 和 `indexText`，恢复时可以作为一个一致版本处理。
- 默认最多保留 5 个 `data/backups/library-*.json`。
- 完整文件和索引文件不使用追加写入，避免重复行越积越多。

## 软删除

暂时不想展示记录时，添加：

```json
{
  "deletedAt": "2026-10-25T12:00:00Z"
}
```

构建器会跳过该番剧的页面和公开接口条目。删除这个字段或改为 `null` 即可恢复。

本地管理页的“删除所选”会直接从完整 JSONL 中移除记录，并在覆盖前创建备份。需要可恢复的隐藏状态时，应手动使用 `deletedAt`。

## Markdown

`review` 和 `note` 支持常用 Markdown。构建时禁用原始 HTML，并自动为外部链接添加 `rel="noreferrer noopener"`。

如果需要展示代码，可以正常使用行内代码和代码块，但不要依赖内联 HTML 排版。
