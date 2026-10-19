import { expect, test, type Locator, type Page } from "@playwright/test";
import { preparedMcqFixture } from "../fixtures";

type Status = "passed" | "open" | "locked";
const longTitle = "Understanding how differential equations describe interconnected systems and their behavior over time LongUnbrokenChapterTitle".repeat(3);

async function fitsViewport(page: Page, element: Locator) {
  await expect(element).toBeVisible();
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const bounds = await element.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
}

for (const width of [375, 1440]) {
  test.describe(`course continuation at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const statuses of [
      ["passed", "passed", "open", "locked"],
      ["passed", "open", "passed", "open", "locked"],
    ] satisfies Status[][]) {
      test(`names the first open chapter and preserves order: ${statuses.join(", ")}`, async ({ page }, info) => {
        // Read-only presentation fixtures exercise states without touching learner data.
        // Real lesson navigation is covered separately below.
        const firstOpen = statuses.indexOf("open");
        const chapters = statuses.map((status, idx) => ({
          id: `continuation-${idx}`, idx, status,
          title: idx === firstOpen ? longTitle : `Outline lesson ${idx + 1}`,
        }));
        const passed = statuses.filter(status => status === "passed").length;
        await page.route("**/api/courses/ralph-continuation-outline", route => route.fulfill({ json: {
          course: { topic: "Continuation outline fixture" }, chapters,
          progress: { passed, total: chapters.length },
        } }));
        await page.goto("/course/ralph-continuation-outline");
        const main = page.getByRole("main");
        const continuation = main.getByRole("link", { name: `Continue: ${longTitle} →`, exact: true });
        await expect(main.getByRole("link", { name: /^Continue:/ })).toHaveCount(1);
        await expect(continuation).toHaveAttribute("href", `/course/ralph-continuation-outline/ch/${firstOpen}`);
        await expect(continuation).not.toHaveAttribute("aria-haspopup");
        await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true }))
          .toHaveAttribute("aria-valuenow", String(Math.round(passed / chapters.length * 100)));
        await expect(continuation.locator("..").getByText(`${passed} of ${chapters.length} chapters mastered`, { exact: true })).toBeVisible();

        const rows = main.locator("ol > li");
        await expect(rows).toHaveCount(chapters.length);
        await expect(rows.locator(".chapter-title")).toHaveText(chapters.map(chapter => chapter.title));
        await expect(main.locator("ol > a")).toHaveCount(0);
        expect(await continuation.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector("main ol")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
        for (const chapter of chapters) {
          const row = rows.nth(chapter.idx);
          if (chapter.status === "open") {
            await expect(row.getByRole("link")).toHaveAttribute("href", `/course/ralph-continuation-outline/ch/${chapter.idx}`);
            await expect(row.getByText("Continue →", { exact: true })).toBeVisible();
          } else if (chapter.status === "locked") {
            await expect(row.getByText("Locked", { exact: true })).toBeVisible();
            await expect(row.getByRole("link")).toHaveCount(0);
          } else {
            await expect(row.getByRole("link", { name: `Read lesson → ${chapter.title}`, exact: true })).toBeVisible();
          }
        }
        await fitsViewport(page, continuation);
        await continuation.focus();
        await expect(continuation).toBeFocused();
        // Enlarged text must also wrap without clipping the named action.
        await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
        await fitsViewport(page, continuation);
        await info.attach("named-continue-long-title", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      });
    }

    test("keyboard Continue opens the prepared real lesson and preserves course state across reload", async ({ page, request }, info) => {
      const fixture = preparedMcqFixture();
      try {
        const coursePath = `/course/${fixture.courseId}`;
        const courseApi = `/api/courses/${fixture.courseId}`;
        const visible = await request.get(courseApi);
        expect(visible.status(), "Existing server must see the test-owned fixture; configure RALPH_TEST_DATABASE if necessary").toBe(200);
        expect((await visible.json()).chapters).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.chapterId })]));
        const saved = fixture.persisted();
        const unexpected: string[] = [];
        // Leave real reads intact, including the open lesson's intentional quiz
        // prefetch. The fixture has ready content and ten prepared questions.
        // Block mutation endpoints; no reset or regeneration is exercised.
        await page.route("**/api/**", async route => {
          const req = route.request();
          if (req.method() !== "GET") {
            unexpected.push(`${req.method()} ${new URL(req.url()).pathname}`);
            await route.abort("blockedbyclient");
          } else {
            await route.continue();
          }
        });
        await page.goto(coursePath);
        const main = page.getByRole("main");
        const continuation = main.getByRole("link", { name: "Continue: Prepared deterministic quiz →", exact: true });
        await fitsViewport(page, continuation);
        await expect(continuation).toHaveAttribute("href", `${coursePath}/ch/0`);
        // Tab from the summary action reaches Export notes before the outline.
        await continuation.focus();
        await expect(continuation).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(main.getByRole("link", { name: "Export notes", exact: true })).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(continuation).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(`${coursePath}/ch/0`);
        await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
        await expect(main.getByRole("dialog")).toHaveCount(0);
        await page.reload();
        await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
        await main.getByRole("link", { name: "← Back to course", exact: true }).click();
        await expect(page).toHaveURL(coursePath);
        await page.reload();
        await expect(continuation).toBeVisible();
        await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", "0");
        expect(fixture.persisted()).toEqual(saved);
        expect(unexpected).toEqual([]);
        await info.attach("real-course-continue-after-reload", { body: await page.screenshot(), contentType: "image/png" });
      } finally {
        try {
          await page.unrouteAll({ behavior: "wait" });
          await page.close();
        } finally {
          fixture.cleanup();
        }
      }
    });
  });
}

for (const statuses of [[], ["passed", "passed"], ["locked", "locked"], ["passed", "locked"]] satisfies Status[][]) {
  test(`omits misleading Continue when no chapter is open: ${statuses.join(", ") || "empty"}`, async ({ page }) => {
    await page.route("**/api/courses/ralph-no-open-chapter", route => route.fulfill({ json: {
      course: { topic: "No open chapter fixture" },
      chapters: statuses.map((status, idx) => ({ id: `no-open-${idx}`, idx, title: `Lesson ${idx + 1}`, status })),
      progress: { passed: statuses.filter(status => status === "passed").length, total: statuses.length },
    } }));
    await page.goto("/course/ralph-no-open-chapter");
    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { name: "No open chapter fixture", exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: /Continue/ })).toHaveCount(0);
    await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toBeVisible();
    if (statuses.length === 0) {
      await expect(main.getByRole("heading", { name: "No chapters available", exact: true })).toBeVisible();
    } else {
      await expect(main.locator("ol > li")).toHaveCount(statuses.length);
    }
    await expect(main.getByText("You completed this course.", { exact: true })).toHaveCount(statuses.length > 0 && statuses.every(status => status === "passed") ? 1 : 0);
  });
}
