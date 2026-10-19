import { expect, test, type Locator, type Page } from "@playwright/test";
import { preparedMcqFixture } from "../fixtures";

const disclosure = "This chapter’s current mastery result and quiz questions will be cleared, along with saved answers and review items associated with those questions. We’ll generate a fresh set of questions so you can measure what you know again.";

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
  test.describe(`retake consequence disclosure at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("discloses quiz-specific losses and preserves saved mastery when cancelling or reading", async ({ page, request }, info) => {
      const fixture = preparedMcqFixture();
      try {
        const coursePath = `/course/${fixture.courseId}`;
        const lessonPath = `${coursePath}/ch/0`;
        const courseApi = `/api/courses/${fixture.courseId}`;
        const chapterApi = `/api/chapters/${fixture.chapterId}`;
        const visible = await request.get(courseApi);
        expect(visible.status(), "Existing app server must see the test-owned fixture (RALPH_TEST_DATABASE)").toBe(200);
        expect((await visible.json()).chapters).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.chapterId })]));

        // Real deterministic grading; one all-correct prepared chapter cannot
        // unlock another chapter or initiate paid generation.
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
        let resetRequests = 0;
        await page.route("**/api/**", async route => {
          const req = route.request();
          const pathname = new URL(req.url()).pathname;
          if (pathname === `${chapterApi}/revisit`) resetRequests += 1;
          if (req.method() === "GET" && (pathname === courseApi || pathname === chapterApi)) {
            await route.continue();
          } else {
            // Cancellation and reading must send no reset. Block unexpected
            // mutations/generation before they can change data or incur cost.
            unexpected.push(`${req.method()} ${pathname}`);
            await route.abort("blockedbyclient");
          }
        });

        await page.goto(coursePath);
        const main = page.getByRole("main");
        const title = "Prepared deterministic quiz";
        const read = main.getByRole("link", { name: `Read lesson → ${title}`, exact: true });
        const retake = main.getByRole("button", { name: `Retake mastery check → ${title}`, exact: true });
        const progress = main.getByRole("progressbar", { name: "Course mastery", exact: true });
        await expect(progress).toHaveAttribute("aria-valuenow", "100");
        await expect(read).toHaveAttribute("href", lessonPath);
        await expect(retake).toHaveAttribute("aria-haspopup", "dialog");
        await read.focus();
        await page.keyboard.press("Tab");
        await expect(retake).toBeFocused();
        await page.keyboard.press("Enter");

        const dialog = main.getByRole("dialog", { name: `Reset ${title}?`, exact: true });
        const description = dialog.getByText(disclosure, { exact: true });
        const cancel = dialog.getByRole("button", { name: "Keep mastered", exact: true });
        const confirm = dialog.getByRole("button", { name: "Reset and retake mastery check", exact: true });
        await expect(cancel).toBeFocused();
        await expect(dialog).toHaveAccessibleDescription(disclosure);
        for (const element of [dialog, description, cancel, confirm]) await readable(page, element);
        await info.attach("retake-consequences", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

        // Safe action starts focused; keyboard focus remains within the modal.
        await page.keyboard.press("Shift+Tab");
        await expect(confirm).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(cancel).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(retake).toBeFocused();
        await expect(page).toHaveURL(coursePath);
        expect(resetRequests).toBe(0);
        expect(fixture.persisted()).toEqual(saved);

        await page.keyboard.press("Enter");
        await expect(cancel).toBeFocused();
        await expect(description).toBeVisible();
        // Enlarged mobile/desktop text must retain the full disclosure and
        // reachable actions without clipping or horizontal page scrolling.
        await page.evaluate(() => { document.documentElement.style.fontSize = "24px"; });
        for (const element of [dialog, description, cancel, confirm]) await readable(page, element);
        await info.attach("retake-consequences-enlarged-text", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
        await expect(cancel).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(dialog).toHaveCount(0);
        await expect(retake).toBeFocused();
        expect(resetRequests).toBe(0);
        expect(fixture.persisted()).toEqual(saved);
        await page.reload();
        await expect(progress).toHaveAttribute("aria-valuenow", "100");
        await expect(main.getByText("Mastered", { exact: true })).toBeVisible();

        // Reading uses the real lesson API and must preserve persisted answers,
        // attempts and mastery, including across full page reloads.
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
        await expect(progress).toHaveAttribute("aria-valuenow", "100");
        await expect(read).toBeVisible();
        await expect(retake).toBeVisible();
        await expect(main.getByText("Mastered", { exact: true })).toBeVisible();
        expect(resetRequests).toBe(0);
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
