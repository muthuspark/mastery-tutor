import { expect, test } from "@playwright/test";
test("learners can personalize their background without provider configuration", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByLabel(/About me/)).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText(/DEEPSEEK_API_KEY|Install Codex|Current agent/)).toHaveCount(0);
  await page.getByRole("link", { name: "Newton", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start a study →" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Change learning agent/ })).toHaveCount(0);
});
