import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the static export (`npm run build` first),
// served the same way GitHub Pages serves it.
//   E2E_BASE_PATH=/lol-advisor  test a sub-path build
//   E2E_BASE_URL=https://…/     test an already deployed site instead of the local export
const basePath = process.env.E2E_BASE_PATH ?? "";
const port = Number(process.env.E2E_PORT ?? 4173);
const remote = process.env.E2E_BASE_URL;
const local = `http://localhost:${port}${basePath}/`;

export default defineConfig({
  testDir: "./__tests__/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: remote ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: remote ?? local,
    trace: "retain-on-failure",
    locale: "tr-TR",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: remote
    ? undefined
    : {
        command: `node scripts/serve.mjs out ${port} ${basePath}`,
        url: local,
        reuseExistingServer: false,
        timeout: 30_000,
      },
});
