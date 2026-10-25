# Bangumi Scout

一个以识别为第一阶段的番剧油猴脚本原型。当前版本不包含 GitHub 上传、个人评分或评价管理，只实现本地番剧索引和当前页面识别。

## 当前能力

- 第一次运行时下载 `bangumi-data`，转换为适合本地搜索的精简索引并写入 `IndexedDB`。
- 启动时先使用缓存，随后按设定频率检查 npm 包版本；版本没变就不重新下载索引。
- 从 URL 中提取 Bilibili `media_id`、`ep_id` 或 `season_id`，优先做精确匹配。
- 使用正则从标题、Open Graph、JSON-LD、`h1` 和面包屑中生成标题候选。
- 使用 Fuse.js 对正式名、中文名、英文名及其他别名做模糊搜索。
- Bilibili 播放页可以通过 PGC 接口补充当前季名称和别名。
- 配置 DeepSeek 后，可以在低置信度时自动调用，也可以手动点击“AI 辅助”。
- 支持扫描 Bilibili 追番/媒体页面中已经渲染出来的番剧链接。

## 识别顺序

```text
页面站点 ID
  -> 本地索引精确匹配
  -> 正则提取标题候选
  -> 本地别名精确/子串匹配
  -> Fuse.js 模糊搜索
  -> 候选打分与歧义判断
  -> DeepSeek 可选兜底
  -> 手动搜索
```

正则不负责直接判断“这是哪部番”，只负责从复杂的网页标题和 DOM 中提取候选。稳定站点 ID 和索引匹配负责最终判断。

## 安装与设置

1. 运行 `npm install && npm run build`。
2. 在 Tampermonkey 中安装 [`dist/anime-index.user.js`](dist/anime-index.user.js)。
3. 打开任意网页，右下角会出现识别入口。
4. 通过 Tampermonkey 的脚本菜单选择“Bangumi Scout 设置”，配置索引和 DeepSeek。

设置没有放进网页内的识别面板。当前项目是油猴脚本，不是传统 Chrome 扩展，因此没有浏览器层面的 `options_ui`；Tampermonkey 脚本菜单就是对应的扩展设置入口。

主要设置项：

- 番剧缓存索引开关
- `bangumi-data` 或自定义精简索引 URL
- 每次启动、每天、每周、仅手动检查更新
- 正则标题候选开关
- 模糊搜索阈值和 AI 自动兜底阈值
- DeepSeek API Key、API 地址、模型和页面上下文长度

DeepSeek Key 使用 `GM_setValue` 保存在本机 Tampermonkey 存储中，不写入仓库。关闭 AI 时不会请求 DeepSeek。

## 本地索引

浏览器缓存使用 `IndexedDB`，数据库名为 `bangumi-scout-index`。第一次使用官方源时会下载约 7.6 MiB 的原始 JSON，转换后约 4.8 MiB；实测包含 8,925 部作品，其中 3,207 部有 Bilibili 映射。

精简索引结构见 [`data/index-schema.example.json`](data/index-schema.example.json)。每条记录包含：

- `id`：跨站点稳定 ID
- `title`：主标题
- `names`：所有可搜索名称和别名
- `normalizedNames`：去空格、标点、大小写后的搜索键
- `sites`：Bilibili、Bangumi、MAL、AniList 等站点 ID
- `type`、`begin`、`year`

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
- [Bangumi API](https://github.com/bangumi/api)：后续可用于补充中文元数据。
- Bilibili PGC 接口属于站内接口，应继续封装在 adapter 中并做缓存、限流和失败降级。
- Bilibili 的 `media_id` 与 `season_id` 不是同一个值。媒体页通常是 `md{media_id}`，播放页查询通常使用 `season_id` 或 `ep_id`。
- `bangumi-data` 以日本动画为主，国产动画覆盖可能不完整；这类作品更适合依赖当前页面、自定义索引或 AI/手动搜索。
