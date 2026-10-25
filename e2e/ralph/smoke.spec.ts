import { expect, test } from "@playwright/test";

test("opens the existing app and navigates to settings without changing learner data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Mastery Tutor", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Profile settings" }).click();
  await expect(page.getByLabel(/About me/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/About me/)).toBeVisible();
  await page.getByRole("link", { name: "Back to learning" }).click();
  await expect(page.getByRole("button", { name: "Create study →" })).toBeVisible();
});
