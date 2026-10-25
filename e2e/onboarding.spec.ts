import { expect, test } from "@playwright/test";

test("shows the minimal onboarding flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Start something new" })).toBeVisible();
  await expect(page.getByLabel("What do you want to learn?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create study →" })).toBeVisible();
  await expect(page.getByText("Beginner")).toHaveCount(0);
});
