function gmRequest(details) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      ...details,
      onload(response) {
        resolve(response);
      },
      onerror(error) {
        const requestError = new Error(
          error?.error ?? "Network request failed",
        );
        requestError.status = 0;
        reject(requestError);
      },
      ontimeout() {
        const timeoutError = new Error("Network request timed out");
        timeoutError.status = 0;
        reject(timeoutError);
      },
    });
  });
}

const RETRYABLE_STATUS_CODES = new Set([
  408,
  425,
  429,
  500,
  502,
  503,
  504,
]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD"]);
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 600;
const DEFAULT_RETRY_MAX_DELAY_MS = 6_000;

function responseSnippet(text, maxLength = 280) {
  const normalized = String(text ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function parseResponseHeaders(value) {
  const headers = new Map();
  for (const line of String(value ?? "").split(/\r?\n/u)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    headers.set(
      line.slice(0, separator).trim().toLocaleLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }
  return headers;
}

function retryAfterMs(responseHeaders, maxDelayMs) {
  const raw =
    responseHeaders instanceof Headers
      ? responseHeaders.get("retry-after")
      : parseResponseHeaders(responseHeaders).get("retry-after");
  if (!raw) {
    return null;
  }
  const seconds = Number(raw);
  const delay = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(raw) - Date.now();
  return Number.isFinite(delay) && delay > 0
    ? Math.min(delay, maxDelayMs)
    : null;
}

function httpError(response, url, body) {
  const host = new URL(url).host;
  const detail = responseSnippet(body);
  const error = new Error(
    `HTTP ${response.status} while requesting ${host}${detail ? `: ${detail}` : ""}`,
  );
  error.name = "HttpError";
  error.status = response.status;
  error.body = String(body ?? "");
  error.url = url;
  error.responseHeaders = response.responseHeaders ?? "";
  error.retryAfterMs = retryAfterMs(
    response.headers ?? response.responseHeaders,
    DEFAULT_RETRY_MAX_DELAY_MS,
  );
  return error;
}

function isRetryableError(error) {
  if (!error) {
    return false;
  }
  if (error.status === 0 || RETRYABLE_STATUS_CODES.has(Number(error.status))) {
    return true;
  }
  return (
    Number(error.status) === 403 &&
    (Number(error.retryAfterMs) > 0 ||
      /rate limit|secondary rate|abuse detection/iu.test(
        String(error.body ?? error.message ?? ""),
      ))
  );
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

async function requestTextOnce(url, details, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (typeof GM_xmlhttpRequest === "function" && !options.fetchImpl) {
    const response = await gmRequest(details);
    if (response.status < 200 || response.status >= 300) {
      throw httpError(response, url, response.responseText);
    }
    return response.responseText;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), details.timeout);
  try {
    const response = await fetchImpl(url, {
      method: details.method,
      headers: details.headers,
      body: options.body,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw httpError(response, url, body);
    }
    return response.text();
  } catch (error) {
    if (
      error?.name === "AbortError" ||
      error?.name === "TimeoutError"
    ) {
      const timeoutError = new Error("Network request timed out");
      timeoutError.status = 0;
      throw timeoutError;
    }
    if (Number.isFinite(Number(error?.status))) {
      throw error;
    }
    const networkError = new Error(error?.message || "Network request failed");
    networkError.status = 0;
    throw networkError;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestText(url, options = {}) {
  const method = String(options.method ?? "GET").toUpperCase();
  const details = {
    method,
    url,
    headers: options.headers ?? {},
    timeout: options.timeout ?? 20000,
  };
  if (options.body !== undefined) {
    details.data = options.body;
  }
  const canRetry = IDEMPOTENT_METHODS.has(method) || options.retryUnsafe;
  const maxAttempts = canRetry
    ? positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS)
    : 1;
  const retryBaseDelayMs = nonNegativeNumber(
    options.retryBaseDelayMs,
    DEFAULT_RETRY_BASE_DELAY_MS,
  );
  const retryMaxDelayMs = nonNegativeNumber(
    options.retryMaxDelayMs,
    DEFAULT_RETRY_MAX_DELAY_MS,
  );
  const sleep =
    options.sleepImpl ??
    ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestTextOnce(url, details, options);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableError(error)) {
        break;
      }
      const exponentialDelay = Math.min(
        retryMaxDelayMs,
        retryBaseDelayMs * 2 ** (attempt - 1),
      );
      const delayMs =
        Number(error.retryAfterMs) > 0
          ? Math.min(Number(error.retryAfterMs), retryMaxDelayMs)
          : exponentialDelay;
      try {
        options.onRetry?.({
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts,
          delayMs,
          status: Number(error.status) || 0,
          method,
          url,
        });
      } catch {
        // Progress reporting must not interrupt the request.
      }
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export async function requestJson(url, options = {}) {
  const text = await requestText(url, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Response was not valid JSON");
  }
}

export function toErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error ?? "未知错误");
}
