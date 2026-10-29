import { expect, test } from "@playwright/test";

for (const width of [1440, 390, 320]) {
  test(`offers inline guidance and keyboard access at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/courses", route => route.fulfill({ json: { courses: [] } }));
    await page.goto("/");
    const creation = page.getByRole("region", { name: "Start something new" });
    await expect(creation.getByText("Pick something you want to learn. We’ll turn it into a chapter-by-chapter learning path.")).toBeVisible();
    const profile = creation.getByRole("link", { name: "Profile settings" });
    await expect(profile).toHaveAttribute("href", "/settings");
    const topic = creation.getByLabel("What do you want to learn?");
    await expect(topic).toHaveAttribute("placeholder", "e.g. Learn Python from scratch");
    await expect(topic).toHaveAccessibleDescription(/chapter-by-chapter learning path/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await profile.focus();
    await page.keyboard.press("Tab");
    await expect(topic).toBeFocused();
    await page.keyboard.type("Learn Python from scratch");
    await page.keyboard.press("Tab");
    await expect(creation.getByRole("button", { name: "Start a study →" })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/inline-onboarding-${width}.png`, fullPage: true });
    await profile.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
  });
}
