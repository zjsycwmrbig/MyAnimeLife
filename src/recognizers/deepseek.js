import { requestJson } from "../core/network.js";

function completionEndpoint(baseUrl) {
  const trimmed = String(baseUrl ?? "")
    .trim()
    .replace(/\/+$/u, "");
  if (/\/chat\/completions$/u.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function stripCodeFence(value) {
  return String(value ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function parseModelJson(content) {
  const text = stripCodeFence(content);
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("DeepSeek 未返回可解析的 JSON");
  }
}

export async function inferAnimeWithDeepSeek(settings, pageContext) {
  if (!settings.ai?.enabled) {
    throw new Error("AI 识别尚未启用");
  }
  if (!settings.ai.apiKey) {
    throw new Error("请先在设置中填写 DeepSeek API Key");
  }

  const maxChars = settings.ai.maxContextChars;
  const promptPayload = {
    url: pageContext.url,
    pageTitle: pageContext.documentTitle,
    openGraphTitle: pageContext.openGraphTitle,
    headings: pageContext.headings.slice(0, 4),
    structuredDataTitles: pageContext.jsonLdTitles.slice(0, 6),
    breadcrumb: pageContext.breadcrumb,
    synopsis: pageContext.summary,
    comments: pageContext.comments.slice(0, 24),
    regexMentions: pageContext.titleMentions.slice(0, 12),
    bilibiliMetadata: pageContext.bilibiliMetadata
      ? {
          title: pageContext.bilibiliMetadata.title,
          names: pageContext.bilibiliMetadata.names,
          synopsis: pageContext.bilibiliMetadata.summary,
          rating: pageContext.bilibiliMetadata.rating,
        }
      : null,
    pageExcerpt: pageContext.excerpt.slice(0, maxChars),
  };

  const response = await requestJson(completionEndpoint(settings.ai.baseUrl), {
    method: "POST",
    timeout: 30000,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.ai.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.ai.model,
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "你是番剧识别器。根据网页上下文判断页面正在介绍、播放或讨论的具体动画系列。页面标题、结构化数据、作品简介比评论更可靠；评论可用于补充别名和线索，但评论里也可能提到其他作品。不要把集数、播放平台、清晰度、文章标题或评论者的泛称误认为作品名。只输出 JSON。",
        },
        {
          role: "user",
          content: `${JSON.stringify(promptPayload)}\n\n输出格式：{"title":"作品主标题或null","alternateTitles":["别名"],"confidence":0到1,"reason":"简短依据"}。无法确定时 title 为 null。`,
        },
      ],
    }),
  });

  const content = response?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek 返回内容为空");
  }
  const parsed = parseModelJson(content);
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const alternateTitles = Array.isArray(parsed.alternateTitles)
    ? parsed.alternateTitles.filter((item) => typeof item === "string")
    : [];

  return {
    title: title || null,
    alternateTitles,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    reason: String(parsed.reason ?? ""),
  };
}
