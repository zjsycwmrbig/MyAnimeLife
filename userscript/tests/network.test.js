import test from "node:test";
import assert from "node:assert/strict";
import { requestJson } from "../src/core/network.js";

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    responseHeaders: Object.entries(headers)
      .map(([name, value]) => `${name}: ${value}`)
      .join("\r\n"),
    text: async () => body,
  };
}

test("retries GET requests and honors Retry-After", async () => {
  const sleeps = [];
  const retries = [];
  let attempts = 0;
  const result = await requestJson("https://api.github.com/test", {
    fetchImpl: async () => {
      attempts += 1;
      return attempts === 1
        ? response(429, '{"message":"slow down"}', {
            "retry-after": "2",
          })
        : response(200, '{"ok":true}');
    },
    sleepImpl: async (delay) => {
      sleeps.push(delay);
    },
    onRetry: (retry) => {
      retries.push(retry);
    },
    retryBaseDelayMs: 500,
    retryMaxDelayMs: 4_000,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  assert.deepEqual(sleeps, [2_000]);
  assert.equal(retries.length, 1);
  assert.equal(retries[0].status, 429);
  assert.equal(retries[0].nextAttempt, 2);
});

test("uses exponential backoff for retryable GET failures", async () => {
  const sleeps = [];
  const retries = [];
  let attempts = 0;
  const result = await requestJson("https://api.github.com/test", {
    fetchImpl: async () => {
      attempts += 1;
      return attempts < 3
        ? response(503, '{"message":"temporarily unavailable"}')
        : response(200, '{"ok":true}');
    },
    sleepImpl: async (delay) => {
      sleeps.push(delay);
    },
    onRetry: (retry) => {
      retries.push(retry);
    },
    retryBaseDelayMs: 25,
    retryMaxDelayMs: 1_000,
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 3);
  assert.deepEqual(sleeps, [25, 50]);
  assert.deepEqual(
    retries.map((retry) => retry.nextAttempt),
    [2, 3],
  );
});

test("does not retry unsafe methods unless explicitly enabled", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    return response(500, '{"message":"write failed"}');
  };

  await assert.rejects(
    () =>
      requestJson("https://api.github.com/test", {
        method: "POST",
        body: "{}",
        fetchImpl,
        sleepImpl: async () => {},
      }),
    /HTTP 500/u,
  );
  assert.equal(attempts, 1);

  await assert.rejects(
    () =>
      requestJson("https://api.github.com/test", {
        method: "POST",
        body: "{}",
        fetchImpl,
        retryUnsafe: true,
        maxAttempts: 2,
        retryBaseDelayMs: 0,
        sleepImpl: async () => {},
      }),
    /HTTP 500/u,
  );
  assert.equal(attempts, 3);
});
