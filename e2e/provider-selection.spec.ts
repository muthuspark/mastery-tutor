import { expect, test } from "@playwright/test";

test("saves a profile agent, restores it, and shows the same agent across pages", async ({ page }) => {
  let profile = { aboutMe: "Engineer", learningAgent: "claude" };
  await page.route("**/api/agents", route => route.fulfill({ json: { available: ["claude", "deepseek"], selected: profile.learningAgent } }));
  await page.route("**/api/profile", async (route) => {
    if (route.request().method() === "PUT") profile = route.request().postDataJSON();
    await route.fulfill({ json: profile });
  });
  let submission: unknown;
  await page.route("**/api/courses", async (route) => {
    if (route.request().method() === "POST") {
      submission = route.request().postDataJSON();
      await route.fulfill({ status: 503, json: { error: { message: "Mock course received" } } });
    } else await route.fulfill({ json: { courses: [] } });
  });
  await page.goto("/");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText(/Using Claude CLI/)).toBeVisible();
  await page.getByRole("link", { name: "Change in profile settings" }).click();
  const selector = page.getByRole("combobox", { name: "Learning agent" });
  await expect(selector).toHaveValue("claude");
  await expect(selector.locator("option")).toHaveText(["Claude CLI", "DeepSeek API"]);
  await selector.selectOption("deepseek");
  const header = page.locator("body > .site-header");
  await expect(header.getByText("Claude CLI", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(header.getByText("DeepSeek API", { exact: true })).toBeVisible();
  expect(profile.aboutMe).toBe("Engineer");
  await page.reload();
  await expect(selector).toHaveValue("deepseek");
  await expect(page.getByText("Current agent: DeepSeek API.")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(selector).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/profile-agent-settings.png", fullPage: true });
  await page.getByRole("link", { name: "Back to learning" }).click();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText(/Using DeepSeek API/)).toBeVisible();
  await page.getByLabel("I want to learn").fill("Linear algebra");
  await page.getByRole("button", { name: "Begin" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Mock course received" })).toHaveText("Mock course received");
  expect(submission).toEqual({ topic: "Linear algebra" });
});
