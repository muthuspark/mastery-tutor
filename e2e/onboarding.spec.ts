import { expect, test } from "@playwright/test";

test("shows the minimal onboarding flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What do you want to understand?" })).toBeVisible();
  await expect(page.getByPlaceholder("the fundamentals of system design")).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin" })).toBeVisible();
  await expect(page.getByText("Beginner")).toHaveCount(0);
});
