import { defineConfig } from "@playwright/test";
import login from "./playwright.login.config";
export default defineConfig({
  ...login,
  testMatch: "*.spec.ts", testIgnore: "**/ralph/**",
  globalSetup: "./test/login-global-setup.ts",
  use: { ...login.use, storageState: "data/login-e2e-state.json" },
});
