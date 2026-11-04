# 番剧推荐算法 v1.0.0

项目版本：`1.0.0`

状态：可用版本（production）

实现：`scripts/discovery-recommendations.mjs`

输出：`dist/data/recommendations.json`

## 目标

阅读页的“番剧推荐”从尚未收录的 Bangumi 条目中生成候选，综合个人评分、个人标签偏好、公共标签、Bangumi 评分与排名、年代/类型偏好进行排序。排序在构建期完成，浏览器只负责分页展示和惰性读取简介，避免访客下载并计算全量索引。

## 数据来源

- 个人记录：`data/anime-index.jsonl` 中的标题、评分、Bangumi ID、季度与年份。
- 个人 Bangumi 缓存：`data/bangumi-cache.jsonl` 中的标签、公共评分、排名、简介和封面。
- 公共快照：`admin/bangumi-public.json` 中的全量公共评分、评分人数、排名和标签。
- 公共目录：`admin/bangumi-public-catalog.json` 中的中文标题、原名、年份、类型、季度和封面。

个人与公共标签使用同一套归一化规则。通用标签、年份标签和别名重复项会被移除或合并。

## 候选过滤

- 排除当前档案已经收录的 Bangumi ID。
- 不同 Bangumi subject ID 始终视为不同作品，因此不同季度不会被合并。
- 候选必须有可用标题和至少一个有效标签。
- 无公共评分的条目仍可进入候选，但公共质量得分为零。

## 个人口味画像

个人平均分用于解释单个评分相对于日常评分习惯的偏差：

```text
relative = clamp((rating - personalAverage) / 2, -1, 1)
absolute = clamp((rating - 5.5) / 4.5, -1, 1)
ratingSignal = 0.7 × relative + 0.3 × absolute
```

标签偏好使用 IDF 抑制常见标签，并使用收缩系数避免少量作品造成过度拟合：

```text
tagAffinity =
  Σ(ratingSignal × IDF) / Σ(|ratingSignal| × IDF)
  × count / (count + 5)
```

- `tagAffinity > 0` 的标签进入正向偏好向量。
- `tagAffinity < 0` 的标签进入负向惩罚向量。
- 至少 5 条带标签的评分记录且存在 2 个正标签时，视为完整个性化模式。
- 少于 5 条时使用轻量个性化模式。
- 没有有效标签时使用公共口碑模式。

## 候选得分

公共评分使用贝叶斯平均，初始最低评分人数 `m = 100`：

```text
bayesScore =
  (ratingCount × publicScore + 100 × globalAverage)
  / (ratingCount + 100)
```

排名、年代和类型分别转换为 `0..1` 信号。年代偏好使用以高分作品年份为中心、标准差为 8 年的高斯权重。

完整个性化模式的初始权重：

```text
base =
  0.60 × tagMatch
  + 0.22 × qualityScore
  + 0.08 × rankScore
  + 0.10 × contextScore

recommendationScore = base - 0.25 × negativePenalty
```

轻量个性化模式降低标签权重并提高公共口碑权重。公共口碑模式直接使用公共质量、排名和年代/类型上下文，不伪造个人偏好。

## 多样性重排

先按 `recommendationScore` 取得前 320 个候选，再执行 MMR 重排：

```text
mmr = 0.82 × recommendationScore
      - 0.18 × maxSimilarityToSelected
```

最终默认输出 96 个推荐。MMR 用于避免同一标签、同一题材或同一系列连续占满首页。

## 推荐解释

每个候选保存最多 3 个主要匹配标签、推荐理由、公共评分、评分人数、排名、年代、类型和算法中间分。没有正标签匹配时，使用“Bangumi 高口碑作品”或“从公共索引中发现的新片”作为降级解释。

## 浏览器展示

- 推荐索引通过 `data/recommendations.json` 单文件读取。
- 默认每页展示 12 部，支持综合推荐、口碑优先和小众探索三种前端排序。
- 可见卡片使用 `IntersectionObserver` 惰性请求 Bangumi `/v0/subjects/{id}` 获取简介和缺失封面。
- 同时最多请求 2 个条目；成功详情缓存 7 天，失败缓存 1 小时。
- Bangumi API 失败时保留标题、公共评分、标签、年份与封面，不影响推荐列表使用。

## 当前限制

- 当前版本只使用明确评分与结构化标签，不对短评文本做情感分析。
- 协同过滤需要多用户行为数据，v1.0.0 不启用。
- 简介只在浏览器可见卡片中惰性读取，不写入仓库数据。

## 后续版本

推荐算法的功能增强会随整个项目升级次版本号，修复与参数调整会随整个项目升级补丁版本号。只有明确要求时才升级主版本。
