import { defineConfig } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command: `npx next dev --port ${port}`,
    url: `http://localhost:${port}/approvals`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
