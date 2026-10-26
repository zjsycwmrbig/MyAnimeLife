import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsStore, sanitizeSettings } from "../src/core/settings.js";

test("clamps and persists the resizable panel dimensions", () => {
  const memory = new Map();
  globalThis.GM_getValue = (key, fallback) =>
    memory.has(key) ? memory.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => memory.set(key, value);

  const store = createSettingsStore();
  const resized = store.update({
    ui: {
      panelWidth: 760,
      panelHeight: 590,
    },
  });
  assert.equal(resized.ui.panelWidth, 760);
  assert.equal(resized.ui.panelHeight, 590);

  const clamped = sanitizeSettings({
    ui: {
      panelWidth: 100,
      panelHeight: 4000,
    },
  });
  assert.equal(clamped.ui.panelWidth, 340);
  assert.equal(clamped.ui.panelHeight, 1000);
});
