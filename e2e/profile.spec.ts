import { expect, test } from "@playwright/test";

test("saves, reloads, edits, and clears a learner profile", async ({ page, request }) => {
  const original = await (await request.get("/api/profile")).json();
  try {
    await page.goto("/");
    await page.getByRole("link", { name: "Profile settings" }).click();
    const field = page.getByLabel(/About me/);
    await expect(field).toBeEnabled();
    await field.fill("I am an experienced engineer learning biology.");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    await page.reload();
    await expect(field).toHaveValue("I am an experienced engineer learning biology.");
    await field.fill("Use practical examples.");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    await page.reload();
    await expect(field).toHaveValue("Use practical examples.");
    await field.fill("");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    await page.reload();
    await expect(field).toHaveValue("");
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("button", { name: "Save profile" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Back to learning" }).click();
    await expect(page.getByRole("button", { name: "Begin" })).toBeVisible();
  } finally {
    await request.put("/api/profile", { data: original });
  }
});
