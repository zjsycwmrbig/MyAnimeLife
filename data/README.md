# 数据编辑规范

`data/anime/` 是唯一的个人记录数据源。每部番剧一个 JSON 文件，构建时自动汇总为网页和 `dist/data/library.json`。

模板默认不包含任何番剧。油猴脚本第一次保存评分或短评时会创建记录；也可以通过下面的流程手动新增。

个人记录只应写入通过 `Use this template` 生成的个人仓库。上游模板的 `main` 分支需要始终保持该目录为空；GitHub 没有对 Fork 隐藏指定已跟踪目录的功能，Fork 还会复制完整提交历史。

## 新增记录

1. 选择一个稳定 ID，例如 `bili-292073015`。
2. 创建 `data/anime/bili-292073015.json`。
3. 在文件开头添加 `"$schema": "../../schemas/anime.schema.json"`，让编辑器提供补全和校验。
4. 填写必要字段。
5. 运行 `npm run validate`。

不要使用番剧标题作为 ID，也不要在匹配信息变化时重命名文件。标题可以随时修改，ID 用于建立长期关联。

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

`match` 和 `externalIds` 保持结构化，不要写进 `note`。这样后续油猴脚本可以直接根据站点 ID 查找记录，不需要重新解析文本。

## 季度身份

不同季度是不同番剧记录，`season.number` 和 `season.label` 必须同时填写或同时为 `null`。推荐保留稳定的 `season.key`，通常可以使用记录的 `id` 或稳定站点索引：

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

旧记录可以不包含 `season`。构建器会继续接受这类记录，并按“季度未知”处理；油猴脚本在确认匹配后可以补充季度字段。

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

## 软删除

暂时不想展示记录时，添加：

```json
{
  "deletedAt": "2026-10-25T12:00:00Z"
}
```

构建器会跳过该记录。删除这个字段或改为 `null` 即可恢复。

不要通过修改 `id` 或移动文件来实现软删除。

## Markdown

`review` 和 `note` 支持常用 Markdown。构建时禁用原始 HTML，并自动为外部链接添加 `rel="noreferrer noopener"`。

如果需要展示代码，可以正常使用行内代码和代码块，但不要依赖内联 HTML 排版。
