import { expect, test } from "@playwright/test";

test("profile settings saves learner context and keeps owner invitations usable", async ({ page }) => {
  let aboutMe = "I like practical examples.";
  await page.route("**/api/profile", async route => {
    if (route.request().method() === "PUT") aboutMe = route.request().postDataJSON().aboutMe;
    await route.fulfill({ json: { aboutMe } });
  });
  await page.route("**/api/invitations", route => route.fulfill({ json: { email: "learner@example.com", message: "Invitation sent." } }));
  await page.goto("/settings");
  await expect(page.getByLabel(/About me/)).toHaveValue(aboutMe);
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(255, 255, 255)");
    await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
    if (width !== 320) await page.screenshot({ path: `test-results/settings-${width}.png`, fullPage: true });
  }
  await page.getByLabel(/About me/).fill("I am learning statistics and prefer worked examples.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();
  await page.getByLabel("Learner’s email address").fill("learner@example.com");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invitation sent." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/About me/)).toHaveValue("I am learning statistics and prefer worked examples.");
});
