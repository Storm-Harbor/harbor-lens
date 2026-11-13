import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  testIgnore: "**/._*",
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: "list",
  use: {
    baseURL: process.env.LENS_TEST_ORIGIN || "http://127.0.0.1:4179/",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: process.env.LENS_TEST_ORIGIN
    ? undefined
    : {
        command: "node tools/serve.mjs",
        url: "http://127.0.0.1:4179/",
        reuseExistingServer: false,
      },
});
