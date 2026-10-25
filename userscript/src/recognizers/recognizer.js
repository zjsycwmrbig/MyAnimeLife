import {
  collectBilibiliCards,
  createPageContext,
  extractTitleCandidates,
  extractTitleMentions,
} from "./page-context.js";
import {
  fetchBilibiliSeasonMetadata,
  fetchBilibiliShortComments,
} from "./bilibili.js";
import { inferAnimeWithDeepSeek } from "./deepseek.js";

const MAX_REGEX_INDEX_QUERIES = 8;

function mergeResult(results, result, extra) {
  const existing = results.get(result.item.id);
  if (!existing) {
    results.set(result.item.id, {
      item: result.item,
      confidence: extra.confidence,
      searchConfidence: result.confidence,
      matchedBy: new Set([result.matchedBy]),
      candidates: [
        {
          title: extra.title,
          source: extra.source,
          confidence: extra.sourceConfidence,
        },
      ],
    });
    return;
  }

  existing.matchedBy.add(result.matchedBy);
  existing.candidates.push({
    title: extra.title,
    source: extra.source,
    confidence: extra.sourceConfidence,
  });
  if (extra.confidence > existing.confidence) {
    existing.confidence = extra.confidence;
    existing.searchConfidence = result.confidence;
  }
}

function finalizeResults(results) {
  return [...results.values()]
    .map((result) => ({
      ...result,
      matchedBy: [...result.matchedBy],
      candidates: result.candidates
        .sort((left, right) => right.confidence - left.confidence)
        .slice(0, 4),
    }))
    .sort((left, right) => right.confidence - left.confidence);
}

function statusForResults(results, context) {
  if (results.some((result) => result.matchedBy.includes("bilibili-id"))) {
    return "matched";
  }
  if (!results.length) {
    return "unmatched";
  }
  const best = results[0];
  const second = results[1];
  if (
    best.confidence >= 0.72 &&
    (!second || best.confidence - second.confidence >= 0.04)
  ) {
    return "matched";
  }
  if (best.confidence >= 0.48 || context.pageKind !== "generic") {
    return "ambiguous";
  }
  return "unmatched";
}

export class AnimeRecognizer {
  constructor({ settingsStore, indexService }) {
    this.settingsStore = settingsStore;
    this.indexService = indexService;
  }

  async recognize(options = {}) {
    const settings = this.settingsStore.get();
    let context = createPageContext({
      maxExcerptChars: settings.ai.maxContextChars,
    });
    const indexSearch = this.indexService.getSearch();
    const results = new Map();
    const diagnostics = [];

    const mediaId = context.bilibiliIds.mediaId;
    if (mediaId) {
      const exactItem = indexSearch.findBySiteId("bilibili", mediaId);
      if (exactItem) {
        results.set(exactItem.id, {
          item: exactItem,
          confidence: 1,
          searchConfidence: 1,
          matchedBy: new Set(["bilibili-id"]),
          candidates: [
            {
              title: exactItem.title,
              source: "bilibili:media-id",
              confidence: 1,
            },
          ],
        });
      }
    }

    let bilibiliMetadata = null;
    if (options.includeBilibiliApi !== false) {
      try {
        bilibiliMetadata = await fetchBilibiliSeasonMetadata(
          context.bilibiliIds,
        );
        if (bilibiliMetadata?.mediaId) {
          const exactItem = indexSearch.findBySiteId(
            "bilibili",
            bilibiliMetadata.mediaId,
          );
          if (exactItem) {
            mergeResult(
              results,
              {
                item: exactItem,
                confidence: 1,
                matchedBy: "bilibili-api-id",
              },
              {
                title: exactItem.title,
                source: "bilibili:pgc-api",
                sourceConfidence: 1,
                confidence: 1,
              },
            );
          }
        }
      } catch (error) {
        diagnostics.push(`Bilibili API：${error.message}`);
      }
    }

    if (options.includeBilibiliApi !== false) {
      const mediaId =
        context.bilibiliIds.mediaId ?? bilibiliMetadata?.mediaId ?? null;
      if (mediaId) {
        try {
          const apiComments = await fetchBilibiliShortComments(mediaId, {
            limit: 12,
          });
          const comments = [
            ...context.comments,
            ...apiComments.map((comment) => comment.text),
          ];
          const summary = [
            bilibiliMetadata?.summary,
            context.summary,
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 2400);
          const summaryMentions = extractTitleMentions([summary]);
          const commentMentions = extractTitleMentions(comments);
          context = {
            ...context,
            summary,
            comments,
            summaryMentions,
            commentMentions,
            titleMentions: [
              ...new Set([...summaryMentions, ...commentMentions]),
            ],
            bilibiliMetadata,
          };
          diagnostics.push(`Bilibili 评论：已读取 ${apiComments.length} 条`);
        } catch (error) {
          diagnostics.push(`Bilibili 评论：${error.message}`);
        }
      }
    }

    const titleCandidates = extractTitleCandidates(context);
    const hasExactSiteMatch = results.size > 0;
    if (settings.matching.useRegexCandidates && !hasExactSiteMatch) {
      for (const candidate of titleCandidates.slice(0, MAX_REGEX_INDEX_QUERIES)) {
        for (const result of indexSearch.search(candidate.title, { limit: 3 })) {
          const confidence =
            result.confidence * 0.82 + candidate.confidence * 0.18;
          mergeResult(
            results,
            result,
            {
              title: candidate.title,
              source: candidate.source,
              sourceConfidence: candidate.confidence,
              confidence,
            },
          );
        }
      }
    }

    if (bilibiliMetadata && !hasExactSiteMatch) {
      for (const title of bilibiliMetadata.titleVariants) {
        for (const result of indexSearch.search(title, { limit: 3 })) {
          mergeResult(results, result, {
            title,
            source: "bilibili:title",
            sourceConfidence: 0.98,
            confidence: result.confidence * 0.82 + 0.98 * 0.18,
          });
        }
      }
    }

    let currentResults = finalizeResults(results);
    const indexState = this.indexService.getState();
    const indexReadyForAutoAi =
      !settings.index.enabled || indexState.status === "ready";
    const shouldUseAi =
      options.ai === "force" ||
      (settings.ai.enabled &&
        settings.ai.autoFallback &&
        indexReadyForAutoAi &&
        (!currentResults.length ||
          currentResults[0].confidence < settings.matching.autoAiThreshold));

    let aiResult = null;
    if (shouldUseAi) {
      try {
        aiResult = await inferAnimeWithDeepSeek(settings, context);
        const aiTitles = [
          aiResult.title,
          ...aiResult.alternateTitles,
        ].filter(Boolean);
        for (const title of aiTitles) {
          for (const result of indexSearch.search(title, { limit: 4 })) {
            mergeResult(results, result, {
              title,
              source: "deepseek",
              sourceConfidence: aiResult.confidence,
              confidence:
                result.confidence * 0.72 + aiResult.confidence * 0.28,
            });
          }
        }
        diagnostics.push(`AI：${aiResult.reason || "已返回标题建议"}`);
      } catch (error) {
        diagnostics.push(`AI 识别失败：${error.message}`);
      }
      currentResults = finalizeResults(results);
    }

    const status = statusForResults(currentResults, context);
    return {
      status,
      context,
      titleCandidates,
      bilibiliMetadata,
      aiResult,
      diagnostics,
      results: currentResults.slice(0, 10),
      best: currentResults[0] ?? null,
      indexState: this.indexService.getState(),
    };
  }

  search(query, options = {}) {
    return this.indexService.getSearch().search(query, options);
  }

  scanBilibiliCards(limit = 100) {
    return collectBilibiliCards(limit).map((card) => {
      const item = this.indexService
        .getSearch()
        .findBySiteId("bilibili", card.mediaId);
      return {
        ...card,
        item,
        confidence: item ? 1 : 0,
      };
    });
  }
}
