import { defineConfig } from "@playwright/test";

const port = 3100;

// Default: `next dev`. Set E2E_SERVER=start to test a production build
// (`NEXT_PUBLIC_API_MOCKING=enabled npm run build` first), e.g. when another
// dev server already holds this project's dev lock.
const command =
  process.env.E2E_SERVER === "start"
    ? `npx next start --port ${port}`
    : `npx next dev --port ${port}`;

export default defineConfig({
  testDir: "./e2e",
  // Mock state lives in the single server process, so tests run serially.
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command,
    url: `http://localhost:${port}/login`,
    // Test-only values; none of these is a real secret or credential. The
    // mock backend and dev login exist only because of this flag.
    env: {
      NEXT_PUBLIC_API_MOCKING: "enabled",
      ALLOW_MOCK_BACKEND_IN_PRODUCTION: "true",
      APP_URL: `http://localhost:${port}`,
      AUTH_SECRET: "e2e-only-secret-e2e-only-secret-0123456789",
      AUTH_DEV_PASSWORD: "e2e-only-password",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
