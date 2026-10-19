import { expect, test, type Locator, type Page } from "@playwright/test";
import { preparedMcqFixture } from "../fixtures";

async function readable(page: Page, element: Locator) {
  await expect(element).toBeVisible();
  await element.scrollIntoViewIfNeeded();
  const bounds = await element.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await element.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [320, 1440]) {
  test.describe(`compact mastered outline at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const allMastered of [false, true]) {
      test(`${allMastered ? "entirely mastered" : "mixed"} outline retains ordered, readable actions`, async ({ page }, info) => {
        const courseId = `ralph-compact-outline-${allMastered ? "complete" : "mixed"}`;
        const coursePath = `/course/${courseId}`;
        const titles = [
          "Foundations",
          "LongUnbrokenChapterTitle".repeat(8),
          "Connecting foundational concepts with practical applications and interconnected systems",
          "Current applications",
          "Future applications",
        ];
        const chapters = titles.map((title, idx) => ({
          id: `compact-${idx}`, idx, title, prerequisites: [],
          status: allMastered || idx < 3 ? "passed" : idx === 3 ? "open" : "locked",
        }));
        const unexpected: string[] = [];
        // Presentation fixtures only; no claim of grading or persistence here.
        await page.route("**/api/**", async route => {
          const req = route.request();
          const pathname = new URL(req.url()).pathname;
          if (req.method() === "GET" && pathname === `/api/courses/${courseId}`) {
            await route.fulfill({ json: {
              course: { topic: "Compact chapter outline" }, chapters,
              progress: { passed: allMastered ? 5 : 3, total: 5 },
            } });
          } else {
            unexpected.push(`${req.method()} ${pathname}`);
            await route.abort("blockedbyclient");
          }
        });
        await page.goto(coursePath);
        const main = page.getByRole("main");
        const rows = main.locator("ol > li");

        async function assertOutline() {
          await expect(main.getByRole("heading", { name: "Compact chapter outline", exact: true })).toBeVisible();
          await expect(rows).toHaveCount(5);
          await expect(rows.locator(".chapter-title")).toHaveText(titles);
          await expect(main.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuenow", allMastered ? "100" : "60");
          await expect(main.getByText("You completed this course.", { exact: true })).toHaveCount(allMastered ? 1 : 0);
          for (const chapter of chapters.filter(chapter => chapter.status === "passed")) {
            const row = rows.nth(chapter.idx);
            const title = row.getByText(chapter.title, { exact: true });
            const status = row.getByText("Mastered", { exact: true });
            const read = row.getByRole("link", { name: `Read lesson → ${chapter.title}`, exact: true });
            const retake = row.getByRole("button", { name: `Retake mastery check → ${chapter.title}`, exact: true });
            await expect(row.getByRole("link")).toHaveCount(1);
            await expect(row.getByRole("button")).toHaveCount(1);
            await expect(read).toHaveAttribute("href", `${coursePath}/ch/${chapter.idx}`);
            await expect(retake).toHaveAttribute("aria-haspopup", "dialog");
            for (const element of [title, status, read, retake]) await readable(page, element);
            // Reading has stronger typography; the reset is a secondary action.
            const readWeight = await read.evaluate(node => Number(getComputedStyle(node).fontWeight));
            const retakeWeight = await retake.evaluate(node => Number(getComputedStyle(node).fontWeight));
            expect(readWeight).toBeGreaterThan(retakeWeight);
            // Short desktop rows keep title, status and both actions on one line.
            if (width === 1440 && chapter.idx === 0) {
              const boxes = await Promise.all([title, status, read, retake].map(element => element.boundingBox()));
              const centers = boxes.map(box => box!.y + box!.height / 2);
              expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
            }
          }
          if (allMastered) {
            await expect(main.getByRole("link", { name: /^Continue:/ })).toHaveCount(0);
          } else {
            await expect(main.getByRole("link", { name: "Continue: Current applications →", exact: true })).toHaveAttribute("href", `${coursePath}/ch/3`);
            await expect(rows.nth(3).getByRole("link")).toHaveAttribute("aria-current", "step");
            await expect(rows.nth(3).getByRole("link")).toHaveAttribute("href", `${coursePath}/ch/3`);
            await expect(rows.nth(3)).toContainText("Continue →");
            await readable(page, rows.nth(3).getByRole("link"));
            const locked = rows.nth(4);
            await expect(locked.getByText("Locked", { exact: true })).toBeVisible();
            await readable(page, locked.getByText("Unlocks when you pass the mastery check for “Current applications”.", { exact: true }));
            await expect(locked.getByRole("link")).toHaveCount(0);
            await expect(locked.getByRole("button")).toHaveCount(0);
          }
        }

        await assertOutline();
        // Every completed row remains reachable in document order by keyboard.
        for (const chapter of chapters.filter(chapter => chapter.status === "passed")) {
          const row = rows.nth(chapter.idx);
          const read = row.getByRole("link", { name: `Read lesson → ${chapter.title}`, exact: true });
          const retake = row.getByRole("button", { name: `Retake mastery check → ${chapter.title}`, exact: true });
          await read.focus();
          await page.keyboard.press("Tab");
          await expect(retake).toBeFocused();
          await page.keyboard.press("Enter");
          const dialog = main.getByRole("dialog", { name: `Reset ${chapter.title}?`, exact: true });
          await expect(dialog).toBeVisible();
          await expect(dialog.getByRole("button", { name: "Keep mastered", exact: true })).toBeFocused();
          await expect(dialog.getByRole("button", { name: "Reset and retake mastery check", exact: true })).toBeEnabled();
          await page.keyboard.press("Escape");
          await expect(dialog).toHaveCount(0);
          await expect(retake).toBeFocused();
          await page.keyboard.press("Shift+Tab");
          await expect(read).toBeFocused();
        }
        await page.reload();
        await assertOutline();
        await info.attach("compact-outline", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
        // Enlarged text may wrap rows, but must keep the full labels accessible.
        await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
        for (const element of await rows.locator(".chapter-title, a, button").all()) await readable(page, element);
        expect(unexpected).toEqual([]);
        await info.attach("compact-outline-enlarged-text", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
      });
    }
  });
}

for (const width of [375, 1440]) {
  test.describe(`mastered row reading and cancellation at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test("reading and safe cancellation preserve real saved mastery after reload", async ({ page, request }) => {
      const fixture = preparedMcqFixture();
      try {
        const coursePath = `/course/${fixture.courseId}`;
        const lessonPath = `${coursePath}/ch/0`;
        const courseApi = `/api/courses/${fixture.courseId}`;
        const chapterApi = `/api/chapters/${fixture.chapterId}`;
        const visible = await request.get(courseApi);
        expect(visible.status(), "Existing app server must see the test-owned fixture (RALPH_TEST_DATABASE)").toBe(200);
        expect((await visible.json()).chapters).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.chapterId })]));
        // Real deterministic grading on a single prepared chapter cannot unlock
        // another chapter or trigger paid generation. No API is mocked here.
        const graded = await request.post(`${chapterApi}/attempts`, {
          data: { answers: fixture.questions.map(question => ({ questionId: question.id, response: question.modelAnswer })) },
        });
        expect(graded.status()).toBe(200);
        expect(await graded.json()).toMatchObject({ score: 1, passed: true, complete: true });
        const saved = fixture.persisted();
        expect(saved.chapter?.status).toBe("passed");
        expect(saved.attempts).toHaveLength(1);
        expect(saved.answers).toHaveLength(10);
        expect(saved.jobs).toEqual([]);
        const unexpected: string[] = [];
        await page.route("**/api/**", async route => {
          const req = route.request();
          const pathname = new URL(req.url()).pathname;
          if (req.method() === "GET" && (pathname === courseApi || pathname === chapterApi)) {
            await route.continue();
          } else {
            // An accidental reset or quiz generation is a test failure, blocked
            // before it can alter the fixture or start a paid job.
            unexpected.push(`${req.method()} ${pathname}`);
            await route.abort("blockedbyclient");
          }
        });
        await page.goto(coursePath);
        const main = page.getByRole("main");
        const title = "Prepared deterministic quiz";
        const read = main.getByRole("link", { name: `Read lesson → ${title}`, exact: true });
        const retake = main.getByRole("button", { name: `Retake mastery check → ${title}`, exact: true });
        await expect(read).toBeVisible();
        await read.focus();
        await page.keyboard.press("Tab");
        await expect(retake).toBeFocused();
        await page.keyboard.press("Enter");
        const dialog = main.getByRole("dialog", { name: `Reset ${title}?`, exact: true });
        const cancel = dialog.getByRole("button", { name: "Keep mastered", exact: true });
        const confirm = dialog.getByRole("button", { name: "Reset and retake mastery check", exact: true });
        await expect(cancel).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(confirm).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(cancel).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(dialog).toHaveCount(0);
        await expect(retake).toBeFocused();
        expect(fixture.persisted()).toEqual(saved);
        await read.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(lessonPath);
        await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
        await expect(main.getByRole("dialog")).toHaveCount(0);
        await page.reload();
        await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
        expect(fixture.persisted()).toEqual(saved);
        await main.getByRole("link", { name: "← Back to course", exact: true }).click();
        await expect(page).toHaveURL(coursePath);
        await page.reload();
        await expect(main.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuenow", "100");
        await expect(main.getByText("Mastered", { exact: true })).toBeVisible();
        await expect(read).toBeVisible();
        await expect(retake).toBeVisible();
        expect(unexpected).toEqual([]);
        expect(fixture.persisted()).toEqual(saved);
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
