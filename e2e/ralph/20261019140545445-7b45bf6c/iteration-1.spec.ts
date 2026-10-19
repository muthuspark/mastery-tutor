import { expect, test, type Locator, type Page } from "@playwright/test";
import { preparedMcqFixture } from "../fixtures";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function fitsViewport(page: Page, elements: Locator[]) {
  const viewport = page.viewportSize()!;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  for (const element of elements) {
    await expect(element).toBeVisible();
    const bounds = await element.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  }
}

for (const width of [375, 1440]) {
  test.describe(`completed chapter actions at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("distinguishes reading from retaking, preserves mastery on cancel/reload, and recovers from reset failure", async ({ page, request }, info) => {
      const fixture = preparedMcqFixture();
      const resetGate = gate();
      try {
        const coursePath = `/course/${fixture.courseId}`;
        const lessonPath = `${coursePath}/ch/0`;
        const courseApi = `/api/courses/${fixture.courseId}`;
        const chapterApi = `/api/chapters/${fixture.chapterId}`;
        const resetApi = `${chapterApi}/revisit`;
        const visible = await request.get(courseApi);
        expect(visible.status(), "Existing server must see the test-owned fixture; configure RALPH_TEST_DATABASE if necessary").toBe(200);
        expect((await visible.json()).chapters).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.chapterId })]));

        // Establish persisted mastery with real deterministic MCQ grading.
        // This single-chapter, all-correct fixture cannot unlock generation.
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

        let allowConfirmation = false;
        let resetRequests = 0;
        const unexpected: string[] = [];
        await page.route("**/api/**", async route => {
          const req = route.request();
          const pathname = new URL(req.url()).pathname;
          if (pathname === resetApi && req.method() === "POST" && allowConfirmation) {
            resetRequests += 1;
            // UI fault injection only: never invoke reset's paid generation.
            // No successful reset or reset persistence is claimed by this test.
            await resetGate.promise;
            await route.fulfill({ status: 503, json: { error: "Test-owned reset failure" } });
          } else if (req.method() !== "GET" || pathname.endsWith("/quiz")) {
            unexpected.push(`${req.method()} ${pathname}`);
            await route.abort("blockedbyclient");
          } else {
            await route.continue();
          }
        });

        await page.goto(coursePath);
        const main = page.getByRole("main");
        const title = "Prepared deterministic quiz";
        const retake = main.getByRole("link", { name: `${title} Mastered Retake mastery check →`, exact: true });
        const read = main.getByRole("link", { name: `Read lesson → ${title}`, exact: true });
        const progress = main.getByRole("progressbar", { name: "Course mastery", exact: true });
        await expect(progress).toHaveAttribute("aria-valuenow", "100");
        await expect(retake).toHaveAttribute("aria-haspopup", "dialog");
        await expect(read).toHaveAttribute("href", lessonPath);
        await fitsViewport(page, [retake, read]);
        await info.attach("completed-chapter-actions", { body: await page.screenshot(), contentType: "image/png" });

        const dialog = main.getByRole("dialog", { name: `Reset ${title}?`, exact: true });
        const cancel = dialog.getByRole("button", { name: "Keep mastered", exact: true });
        const confirm = dialog.getByRole("button", { name: "Reset and retake mastery check", exact: true });
        await retake.focus();
        await page.keyboard.press("Enter");
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAccessibleDescription("Your current mastery result and quiz questions will be cleared. We’ll generate a fresh set of questions so you can measure what you know again.");
        await expect(cancel).toBeFocused();
        await expect(confirm).toBeEnabled();
        await page.keyboard.press("Shift+Tab");
        await expect(confirm).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(cancel).toBeFocused();
        await fitsViewport(page, [dialog, cancel, confirm]);
        await info.attach("explicit-reset-confirmation", { body: await page.screenshot(), contentType: "image/png" });
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(retake).toBeFocused();
        await expect(page).toHaveURL(coursePath);
        await retake.press("Enter");
        await expect(cancel).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(dialog).toHaveCount(0);
        await expect(retake).toBeFocused();
        expect(resetRequests).toBe(0);
        expect(fixture.persisted()).toEqual(saved);

        // Read lesson must navigate directly, preserve saved evidence, and not
        // prefetch assessment generation, including after a full reload.
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
        await expect(retake).toBeVisible();
        expect(resetRequests).toBe(0);
        expect(unexpected).toEqual([]);
        expect(fixture.persisted()).toEqual(saved);

        // Confirmation dispatch, disabled pending actions, Escape protection,
        // and recovery are tested with an isolated failing response.
        allowConfirmation = true;
        await retake.focus();
        await page.keyboard.press("Enter");
        await expect(cancel).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(confirm).toBeFocused();
        await page.keyboard.press("Enter");
        const pending = dialog.getByRole("button", { name: "Resetting…", exact: true });
        await expect(pending).toBeDisabled();
        await expect(cancel).toBeDisabled();
        await expect.poll(() => resetRequests).toBe(1);
        await page.keyboard.press("Escape");
        await expect(dialog).toBeVisible();
        await expect(page).toHaveURL(coursePath);
        resetGate.release();
        await expect(dialog.getByRole("alert")).toHaveText("Could not reset this chapter. Please try again.");
        await expect(confirm).toBeEnabled();
        await expect(cancel).toBeEnabled();
        await fitsViewport(page, [dialog, cancel, confirm]);
        await info.attach("reset-failure-recovery", { body: await page.screenshot(), contentType: "image/png" });
        await cancel.click();
        await expect(dialog).toHaveCount(0);
        await expect(retake).toBeFocused();
        await retake.press("Enter");
        await expect(cancel).toBeFocused();
        await expect(dialog.getByRole("alert")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(retake).toBeFocused();
        await page.reload();
        await expect(progress).toHaveAttribute("aria-valuenow", "100");
        expect(resetRequests).toBe(1);
        expect(unexpected).toEqual([]);
        expect(fixture.persisted()).toEqual(saved);
      } finally {
        resetGate.release();
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
