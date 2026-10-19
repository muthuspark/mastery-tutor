import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

const actions = [
  { name: "Too easy", value: "easy", success: "Feedback saved: too easy. Chapter update requested." },
  { name: "Too hard", value: "hard", success: "Feedback saved: too hard. Chapter update requested." },
  { name: "Regenerate chapter", value: "regenerate", success: "Chapter regenerated." },
] as const;

async function keyboardActivate(page: Page, button: Locator) {
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
}

async function geometry(page: Page, width: number) {
  const main = page.getByRole("main");
  const box = await main.boundingBox();
  expect(box).not.toBeNull();
  const expected = Math.min(width - 2 * (width < 768 ? 16 : 24), 768);
  expect(box!.width).toBeCloseTo(expected, 0);
  expect(box!.x).toBeCloseTo((width - expected) / 2, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

for (const width of [375, 768, 1440]) {
  test(`chapter adjustments preserve real learning evidence and announce recoverable outcomes at ${width}px`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = preparedMcqFixture();
    let release: (() => void) | undefined;
    try {
      expect(isBalancedQuiz(fixture.questions), "All ten cached questions must be balanced before any navigation").toBe(true);
      const chapterApi = `/api/chapters/${fixture.chapterId}`;
      const chapterPath = `/course/${fixture.courseId}/ch/0`;
      const visible = await request.get(`/api/courses/${fixture.courseId}`);
      expect(visible.status(), "Existing server must see test-owned fixture; configure RALPH_TEST_DATABASE if needed").toBe(200);
      const course = await visible.json();
      expect(course.chapters).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.chapterId })]));

      let mode: "http" | "network" | "success" | "accepted" = "http";
      let gate = Promise.resolve();
      let chapterReads = 0;
      let allowAttempt = true;
      const adjustments: { path: string; body: unknown }[] = [];
      const unexpectedWrites: string[] = [];
      // Never dispatch adjustments: both endpoints invalidate generation caches
      // and can enqueue paid jobs. All lesson/quiz reads and grading remain real.
      await page.route("**/api/**", async route => {
        const req = route.request();
        const path = new URL(req.url()).pathname;
        if (req.method() === "POST" && (path === chapterApi || path === `${chapterApi}/regenerate`)) {
          adjustments.push({ path, body: req.postData() ? req.postDataJSON() : null });
          const responseMode = mode;
          await gate;
          if (responseMode === "network") await route.abort("failed");
          else await route.fulfill({
            status: responseMode === "http" ? 503 : responseMode === "accepted" ? 202 : 200,
            json: responseMode === "http" ? { error: { message: "Controlled adjustment failure" } } : { saved: true },
          });
        } else if (req.method() === "POST" && path === `${chapterApi}/attempts` && allowAttempt) {
          allowAttempt = false;
          await route.continue();
        } else if (req.method() !== "GET") {
          // Also block out-of-scope quiz regeneration, even if navigation regresses.
          unexpectedWrites.push(`${req.method()} ${path}`);
          await route.abort("blockedbyclient");
        } else {
          if (path === chapterApi) chapterReads += 1;
          await route.continue();
        }
      });

      const main = page.getByRole("main");
      await page.goto(chapterPath);
      await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
      await main.getByRole("link", { name: "Check your understanding →", exact: true }).click();
      const delivered = [...fixture.questions].reverse();
      for (const [index, question] of delivered.entries()) {
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
        await expect(main.getByRole("radio")).toHaveCount(4);
        const letter = String.fromCharCode(65 + question.options.indexOf(question.modelAnswer));
        await main.getByRole("radio", { name: `${letter}. ${question.modelAnswer}`, exact: true }).check();
        if (index < 9) await main.getByRole("button", { name: "Next question", exact: true }).click();
      }
      const submission = page.waitForResponse(response => new URL(response.url()).pathname === `${chapterApi}/attempts` && response.request().method() === "POST");
      await main.getByRole("button", { name: "Submit answers", exact: true }).click();
      const graded = await submission;
      expect(graded.status()).toBe(200);
      const result = await graded.json();
      expect(result).toMatchObject({ score: 1, passed: true, complete: true });
      await expect(main.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
      await expect(main.getByText("Correct.", { exact: true })).toHaveCount(10);
      await main.getByRole("link", { name: "Review chapter", exact: true }).click();
      await expect(page).toHaveURL(chapterPath);
      await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
      // Reload observes persisted mastery, rather than the quiz page's cached course.
      await page.reload();
      await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
      const saved = fixture.persisted();
      expect(saved.attempts).toHaveLength(1);
      expect(saved.attempts[0]).toMatchObject({ id: result.attemptId, score: 1, passed: true });
      expect(saved.answers).toHaveLength(10);
      for (const question of delivered) expect(saved.answers.find(answer => answer.questionId === question.id)).toMatchObject({ response: question.modelAnswer, score: 1 });
      expect(saved.chapter?.status).toBe("passed");
      expect(saved.jobs).toEqual([]);
      const controls = main.getByRole("region", { name: "Chapter adjustments", exact: true });
      await controls.scrollIntoViewIfNeeded();
      await geometry(page, width);

      for (const action of actions) {
        const button = controls.getByRole("button", { name: action.name, exact: true });
        const progress = action.value === "regenerate" ? "Regenerating chapter…" : "Saving difficulty feedback and updating chapter…";
        const failure = action.value === "regenerate"
          ? "Could not regenerate this chapter. Select Regenerate chapter to try again."
          : `Could not save difficulty feedback. Select Too ${action.value} to try again.`;
        for (const failureMode of ["http", "network"] as const) {
          mode = failureMode;
          gate = new Promise<void>(resolve => { release = resolve; });
          const beforePosts = adjustments.length;
          const beforeReads = chapterReads;
          await keyboardActivate(page, button);
          await expect(controls.getByRole("status")).toHaveText(progress);
          await expect(controls.getByRole("alert")).toHaveCount(0);
          await expect(controls.getByRole("button")).toHaveCount(3);
          for (const control of await controls.getByRole("button").all()) await expect(control).toBeDisabled();
          if (action.value === "regenerate") await expect(controls.getByRole("button", { name: "Regenerating…", exact: true })).toBeDisabled();
          await page.keyboard.press("Enter");
          await expect.poll(() => adjustments.length).toBe(beforePosts + 1);
          expect(adjustments.at(-1)).toEqual({ path: `${chapterApi}${action.value === "regenerate" ? "/regenerate" : ""}`, body: action.value === "regenerate" ? null : { difficulty: action.value } });
          await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
          expect(chapterReads).toBe(beforeReads);
          await geometry(page, width);
          if (failureMode === "http") await capture(page, info, `${action.value}-pending`);
          release!();
          await expect(controls.getByRole("alert")).toHaveText(failure);
          await expect(controls.getByRole("status")).toBeEmpty();
          for (const control of await controls.getByRole("button").all()) await expect(control).toBeEnabled();
          await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
          await expect(main.getByRole("link", { name: "Check your understanding →", exact: true })).toHaveAttribute("href", `${chapterPath}/quiz`);
          await geometry(page, width);
          await capture(page, info, `${action.value}-${failureMode}-recovery`);
          expect(chapterReads, "Failures must not invalidate the chapter query").toBe(beforeReads);
          expect(adjustments).toHaveLength(beforePosts + 1);
          expect(fixture.persisted()).toEqual(saved);
        }
        // Recovery is an explicit new keyboard action. Accepted regeneration must
        // acknowledge a request, without claiming the chapter has finished.
        for (const successMode of action.value === "regenerate" ? ["accepted", "success"] as const : ["success"] as const) {
          mode = successMode;
          gate = Promise.resolve();
          const beforeReads = chapterReads;
          const beforePosts = adjustments.length;
          await keyboardActivate(page, button);
          await expect(controls.getByRole("status")).toHaveText(successMode === "accepted" ? "Chapter regeneration requested. The chapter is being prepared." : action.success);
          await expect(controls.getByRole("alert")).toHaveCount(0);
          await expect.poll(() => chapterReads).toBe(beforeReads + 1);
          expect(adjustments).toHaveLength(beforePosts + 1);
          for (const control of await controls.getByRole("button").all()) await expect(control).toBeEnabled();
          await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
          await geometry(page, width);
          await capture(page, info, `${action.value}-${successMode}`);
          expect(fixture.persisted()).toEqual(saved);
        }
      }
      await page.reload();
      await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
      await expect(controls.getByRole("status")).toBeEmpty();
      await expect(controls.getByRole("alert")).toHaveCount(0);
      expect(fixture.persisted()).toEqual(saved);
      expect(unexpectedWrites).toEqual([]);
      // Adjustment responses are controlled UI evidence, not proof of backend
      // adaptation persistence. Persisted real grading/evidence is checked above.
    } finally {
      release?.();
      try { await page.close(); } finally { fixture.cleanup(); }
    }
  });
}
