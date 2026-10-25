import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
export default defineConfig({
  testDir: "./e2e", testMatch: "login.spec.ts", workers: 1,
  use: { baseURL: "http://localhost:3102", ...devices["Desktop Chrome"] },
  webServer: {
    command: "node test/prepare-login-e2e.mjs && npm run dev -- --port 3102",
    url: "http://localhost:3102/login", reuseExistingServer: false, timeout: 120_000,
    env: {
      DATABASE_URL: "file:./data/login-e2e.db", OWNER_EMAIL: "owner@example.com",
      INVITED_EMAILS: "second@example.com,delivery-failure@example.com,mobile@example.com,switch@example.com",
      BETTER_AUTH_SECRET: "controlled-e2e-secret-at-least-thirty-two-characters",
      BETTER_AUTH_URL: "http://localhost:3102", AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "test-only",
      MAILTRAP_API_KEY: "test-only", FROM_EMAIL: "tutor@example.com",
      LOGIN_TEST_OUTBOX: path.resolve("data/login-e2e-outbox.jsonl"),
      NODE_OPTIONS: `--import=${path.resolve("test/mailtrap-transport.mjs")}`,
    },
  },
});
