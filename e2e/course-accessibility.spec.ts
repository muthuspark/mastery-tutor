import { expect, test } from "@playwright/test";

const chapters = [
  { id: "passed", idx: 0, title: "Foundations", status: "passed" },
  { id: "open", idx: 1, title: "Current chapter", status: "open" },
  { id: "locked", idx: 2, title: "Future chapter", status: "locked" },
];
const course = { course: { topic: "Operating Systems" }, chapters, progress: { passed: 1, total: 3 } };

test("preserves list semantics and contains dialog focus, then restores it", async ({ page }) => {
  await page.route("**/api/courses/audit", route => route.fulfill({ json: course }));
  await page.goto("/course/audit");
  await expect(page.locator("main ol > li")).toHaveCount(3);
  await expect(page.locator("main ol > a")).toHaveCount(0);
  await expect(page.getByText("1 of 3 chapters mastered")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Retake mastery check → Foundations" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const cancel = dialog.getByRole("button", { name: "Keep mastered" });
  const confirm = dialog.getByRole("button", { name: "Reset and retake mastery check" });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await page.locator("body > .site-header a").first().evaluate((element: HTMLElement) => element.focus());
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await cancel.click();
  await expect(trigger).toBeFocused();
});

test("wraps long titles and supports enlarged text without horizontal scrolling", async ({ page }) => {
  await page.route("**/api/courses/audit", route => route.fulfill({ json: {
    ...course,
    course: { topic: "DifferentialEquations".repeat(5) },
    chapters: chapters.map(chapter => ({ ...chapter, title: "LongUnbrokenChapterTitle".repeat(8) })),
  } }));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/course/audit");
    await expect(page.locator("main ol > li")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("handles empty and locked-only courses without announcing completion", async ({ page }) => {
  let empty = true;
  await page.route("**/api/courses/audit", route => route.fulfill({ json: {
    course: { topic: "Course awaiting chapters" }, chapters: empty ? [] : [chapters[2]], progress: { passed: 0, total: empty ? 0 : 1 },
  } }));
  await page.goto("/course/audit");
  await expect(page.getByText("This course has no chapters yet.")).toBeVisible();
  await expect(page.getByText("0 of 0 chapters mastered")).toBeVisible();
  await expect(page.getByText("You completed this course.")).toHaveCount(0);
  await expect(page.getByText("NaN%")).toHaveCount(0);
  empty = false;
  await page.reload();
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();
  await expect(page.getByText("You completed this course.")).toHaveCount(0);
});

test("allows retry after failed course loading", async ({ page }) => {
  let fail = true;
  await page.route("**/api/courses/audit", route => fail ? route.fulfill({ status: 500, json: { error: "Unavailable" } }) : route.fulfill({ json: course }));
  await page.goto("/course/audit");
  await expect(page.locator("main").getByRole("alert")).toHaveText("Could not load this course.", { timeout: 15000 });
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Operating Systems" })).toBeVisible();
});

test("keeps reset modal open during submission and allows recovery after failure", async ({ page }) => {
  await page.route("**/api/courses/audit", route => route.fulfill({ json: course }));
  let finishReset: (() => Promise<void>) | undefined;
  await page.route("**/api/chapters/passed/revisit", route => new Promise<void>(resolve => {
    finishReset = async () => { await route.fulfill({ status: 500, json: { error: "Unavailable" } }); resolve(); };
  }));
  await page.goto("/course/audit");
  const trigger = page.getByRole("button", { name: "Retake mastery check → Foundations" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Reset and retake mastery check" }).click();
  await expect(dialog.getByRole("button", { name: "Resetting…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect.poll(() => Boolean(finishReset)).toBe(true);
  await finishReset!();
  await expect(dialog.getByRole("alert")).toHaveText("Could not reset this chapter. Please try again.");
  await dialog.getByRole("button", { name: "Keep mastered" }).click();
  await expect(trigger).toBeFocused();
});
