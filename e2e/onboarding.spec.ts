import { expect, test } from "@playwright/test";

test("shows the minimal onboarding flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What do you want to learn?" })).toBeVisible();
  await expect(page.getByPlaceholder("I want to master the fundamentals of system design")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start learning" })).toBeVisible();
  await expect(page.getByText("Beginner")).toHaveCount(0);
});
