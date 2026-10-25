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

export async function requestText(url, options = {}) {
  const details = {
    method: options.method ?? "GET",
    url,
    headers: options.headers ?? {},
    timeout: options.timeout ?? 20000,
  };

  if (typeof GM_xmlhttpRequest === "function") {
    const response = await gmRequest(details);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `HTTP ${response.status} while requesting ${new URL(url).host}`,
      );
    }
    return response.responseText;
  }

  const response = await fetch(url, {
    method: details.method,
    headers: details.headers,
  });
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} while requesting ${new URL(url).host}`,
    );
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
