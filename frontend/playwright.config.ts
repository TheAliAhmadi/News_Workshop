import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.WORKBENCH_URL || "http://127.0.0.1:8765",
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: process.env.WORKBENCH_CHROME
      ? { executablePath: process.env.WORKBENCH_CHROME }
      : {},
  },
  reporter: [["list"]],
});
