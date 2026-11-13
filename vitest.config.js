import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  cacheDir: ".vite/vitest",
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    testTimeout: 30000,
    environment: "jsdom",
    setupFiles: ["./test/setup.js"],
    include: ["test/**/*.spec.{js,jsx}"],
    exclude: ["**/._*"],
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{js,jsx,mjs}"],
      exclude: ["**/._*"],
      reporter: ["text", "json", "json-summary", "html"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
