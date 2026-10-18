import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const output = path.resolve(process.env.RALPH_BROWSER_OUTPUT ?? ".ralph/manual-browser");

export default defineConfig({
  testDir: "./e2e/ralph",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  outputDir: path.join(output, "artifacts"),
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(output, "results.json") }],
    ["html", { outputFolder: path.join(output, "html"), open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.RALPH_BASE_URL ?? "http://localhost:3000",
    headless: true,
    screenshot: "on",
    trace: "on",
    video: "retain-on-failure",
  },
  // Intentionally no webServer: use the user's existing app; never start/stop it.
});
