const REQUEST_TIMEOUT_MS = 8000;
const inFlight = new Map();

function clean(value) {
  return String(value ?? "").trim();
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestSubject(subjectId, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.bgm.tv/v0/subjects/${encodeURIComponent(subjectId)}`,
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const error = new Error(`Bangumi 请求失败 (HTTP ${response.status})`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    const shouldRetry =
      attempt === 0 &&
      (!error.status || error.status === 429 || error.status >= 500);
    if (!shouldRetry) {
      throw error;
    }
    await wait(450 + Math.random() * 350);
    return requestSubject(subjectId, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

export function bangumiSubjectId(itemOrId) {
  if (typeof itemOrId === "string" || typeof itemOrId === "number") {
    return clean(itemOrId);
  }
  return clean(itemOrId?.sites?.bangumi);
}

export function fetchBangumiSubject(itemOrId) {
  const subjectId = bangumiSubjectId(itemOrId);
  if (!subjectId) {
    return Promise.reject(new Error("缺少 Bangumi 条目 ID"));
  }
  if (!inFlight.has(subjectId)) {
    inFlight.set(
      subjectId,
      requestSubject(subjectId).finally(() => inFlight.delete(subjectId)),
    );
  }
  return inFlight.get(subjectId);
}
