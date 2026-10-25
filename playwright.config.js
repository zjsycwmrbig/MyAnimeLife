import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: "python3 -m http.server 4174 --bind 127.0.0.1",
    port: 4174,
    reuseExistingServer: true,
  },
});
