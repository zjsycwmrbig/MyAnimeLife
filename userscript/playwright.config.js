import { defineConfig } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT || 4175);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "line",
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
