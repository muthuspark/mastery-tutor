import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`durable preparation survives reload and supports explicit retry at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let status = "pending";
    let stage = "planning";
    let reads = 0;
    let retries = 0;
    await page.route("**/api/courses/preparation-course", route => {
      reads++;
      return route.fulfill({ json: { course: { topic: "Operating Systems", qualityPolicyVersion: 1, preparationStatus: status, preparationStage: stage, preparationError: "Preparation did not pass review. Try again." }, chapters: status === "ready" ? [{ id: "chapter", idx: 0, title: "Process isolation", status: "open" }] : [], progress: { passed: 0, total: status === "ready" ? 1 : 0 } } });
    });
    await page.route("**/api/courses/preparation-course/retry", route => {
      retries++; status = "pending"; stage = "planning";
      return route.fulfill({ status: 202, json: { status } });
    });
    await page.goto("/course/preparation-course");
    await expect(page.getByRole("heading", { name: "Preparing your course" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Building a focused path");
    status = "generating"; stage = "reviewing";
    await expect(page.getByRole("status")).toContainText("Checking coverage", { timeout: 6_000 });
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Checking coverage");
    status = "failed";
    await expect(page.getByRole("heading", { name: "Could not prepare your course" })).toBeVisible({ timeout: 6_000 });
    const stopped = reads;
    await page.waitForTimeout(2_100);
    expect(reads).toBe(stopped);
    await page.screenshot({ path: testInfo.outputPath(`preparation-failure-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "Preparing your course" })).toBeVisible();
    expect(retries).toBe(1);
    status = "ready";
    await expect(page.getByRole("heading", { name: "Operating Systems" })).toBeVisible({ timeout: 6_000 });
    await expect(page.getByRole("link", { name: "Process isolation Continue →", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
