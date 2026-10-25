# 数据编辑规范

`data/anime/` 是唯一的个人记录数据源。每部番剧一个 JSON 文件，构建时自动汇总为网页和 `dist/data/library.json`。

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

## 由识别流程维护的字段

- `externalIds.bangumi`
- `externalIds.bilibiliMedia`
- `externalIds.bilibiliSeason`
- `externalIds.anilist`
- `externalIds.mal`
- `match.status`
- `match.method`
- `match.source`
- `match.confidence`
- `match.matchedTitle`
- `match.matchedAt`

`match` 和 `externalIds` 保持结构化，不要写进 `note`。这样后续油猴脚本可以直接根据站点 ID 查找记录，不需要重新解析文本。

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
