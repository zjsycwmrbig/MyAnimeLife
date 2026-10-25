function gmRequest(details) {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      ...details,
      onload(response) {
        resolve(response);
      },
      onerror(error) {
        reject(new Error(error?.error ?? "Network request failed"));
      },
      ontimeout() {
        reject(new Error("Network request timed out"));
      },
    });
  });
}

function responseSnippet(text, maxLength = 280) {
  const normalized = String(text ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
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
  return error;
}

export async function requestText(url, options = {}) {
  const details = {
    method: options.method ?? "GET",
    url,
    headers: options.headers ?? {},
    timeout: options.timeout ?? 20000,
  };
  if (options.body !== undefined) {
    details.data = options.body;
  }

  if (typeof GM_xmlhttpRequest === "function") {
    const response = await gmRequest(details);
    if (response.status < 200 || response.status >= 300) {
      throw httpError(response, url, response.responseText);
    }
    return response.responseText;
  }

  const response = await fetch(url, {
    method: details.method,
    headers: details.headers,
    body: options.body,
  });
  if (!response.ok) {
    const body = await response.text();
    throw httpError(response, url, body);
  }
  return response.text();
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
