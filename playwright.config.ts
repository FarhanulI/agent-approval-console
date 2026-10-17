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
  use: {
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command,
    url: `http://localhost:${port}/approvals`,
    // MSW serves /api/actions in the browser; the flag is not a secret.
    env: { NEXT_PUBLIC_API_MOCKING: "enabled" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
