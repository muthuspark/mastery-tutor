import { expect, test } from "@playwright/test";

const chapters = [
  { id: "passed", idx: 0, title: "Foundations", status: "passed" },
  { id: "open", idx: 1, title: "Current chapter", status: "open" },
  { id: "locked", idx: 2, title: "Future chapter", status: "locked" },
];
const course = { course: { topic: "Operating Systems" }, chapters, progress: { passed: 1, total: 3 } };

test("course index presents progress and all chapter states on desktop and mobile", async ({ page }) => {
  const titles = ["What an Operating System Does", "Computer Hardware as Resources", "Programs and Execution", "Processes", "CPU Scheduling", "Memory Management", "Persistent Storage and Files", "Input and Output Abstractions", "System Calls and Privilege", "Concurrency and Synchronization", "Protection and Security", "Operating System Design Tradeoffs"];
  await page.route("**/api/courses/course-index", route => route.fulfill({ json: {
    course: { topic: "Operating Systems" },
    chapters: titles.map((title, idx) => ({ id: `index-${idx}`, idx, title, status: idx < 4 ? "passed" : idx === 4 ? "open" : "locked", prerequisites: idx > 4 ? [0] : [] })),
    progress: { passed: 4, total: 12 },
  } }));
  await page.goto("/course/course-index");
  await expect(page.getByText("4 of 12 chapters mastered")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".course-index img")).toHaveCount(0);
  await expect(page.getByText(/unlocks|prerequisites/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Export notes" })).toHaveAttribute("href", "/api/courses/course-index/export");
  await expect(page.locator(".chapter-link[aria-current='step']")).toHaveAttribute("href", "/course/course-index/ch/4");
  await expect(page.locator(".chapter-console-continue")).toHaveCount(1);
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0);
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".chapter-list > li")).toHaveCount(12);
    const header = (await page.locator("body > .site-header").boundingBox())!;
    const main = (await page.getByRole("main").boundingBox())!;
    expect(Math.abs(header.x - main.x)).toBeLessThan(1);
    expect(Math.abs(header.width - main.width)).toBeLessThan(1);
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(title.y - header.y - header.height).toBeLessThan(100);
    expect(await page.locator(".chapter-row").first().evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(width >= 640 ? 4 : 3);
    const currentRow = (await page.locator(".chapter-link[aria-current='step']").boundingBox())!;
    const continueBox = (await page.locator(".chapter-console-continue").boundingBox())!;
    const retakeBox = (await page.locator(".chapter-retake").first().boundingBox())!;
    expect(Math.abs(continueBox.x + continueBox.width - retakeBox.x - retakeBox.width)).toBeLessThan(2);
    expect(Math.abs(continueBox.y + continueBox.height / 2 - currentRow.y - currentRow.height / 2)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/course-index-${width}.png`, fullPage: true });
  }
});

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
