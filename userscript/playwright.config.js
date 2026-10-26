import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4175);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 2 : 0,
  timeout: 45_000,
  expect: {
    timeout: 7_000,
  },
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1`,
    port,
    reuseExistingServer: true,
  },
});
