import { defineConfig } from "@playwright/test";
const localURL = `http://127.0.0.1:5173/${process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split("/")[1] + "/" : ""}`;
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [["list"], ["json", { outputFile: "test-results/results.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? localURL,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    colorScheme: "light",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: localURL,
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
});
