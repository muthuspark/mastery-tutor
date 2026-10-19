import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function overviewGeometry(page: Page, width: number) {
  const main = page.getByRole("main");
  await expect(main).toBeVisible();
  const bounds = await main.boundingBox();
  expect(bounds).not.toBeNull();
  const expectedWidth = Math.min(width - (width < 768 ? 32 : 48), 1216);
  expect(bounds!.width).toBeCloseTo(expectedWidth, 0);
  expect(bounds!.x).toBeCloseTo((width - expectedWidth) / 2, 0);
  const header = await page.locator("body > .site-header").boundingBox();
  expect(header).not.toBeNull();
  expect(bounds!.x).toBeCloseTo(header!.x, 0);
  expect(bounds!.width).toBeCloseTo(header!.width, 0);
  const layout = await main.evaluate(element => ({
    paddingTop: getComputedStyle(element).paddingTop,
    paddingBottom: getComputedStyle(element).paddingBottom,
    overflow: element.scrollWidth - element.clientWidth,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(layout.paddingTop).toBe(width < 768 ? "40px" : "56px");
  expect(layout.paddingBottom).toBe(layout.paddingTop);
  expect(layout.overflow).toBeLessThanOrEqual(1);
  expect(layout.pageOverflow).toBeLessThanOrEqual(1);
  return { x: bounds!.x, width: bounds!.width, paddingTop: layout.paddingTop };
}

async function capture(page: Page, info: TestInfo, state: string) {
  await info.attach(state, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

for (const width of [375, 768, 1440]) {
  test(`course overview states share geometry and preserve mastery at ${width}px`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = preparedMcqFixture();
    const initial = gate();
    const retry = gate();
    try {
      expect(isBalancedQuiz(fixture.questions), "Prepared questions must satisfy the real quiz delivery quality gate").toBe(true);
      const coursePath = `/course/${fixture.courseId}`;
      const courseApi = `/api/courses/${fixture.courseId}`;
      const chapterApi = `/api/chapters/${fixture.chapterId}`;
      const attemptsApi = `${chapterApi}/attempts`;
      const visible = await request.get(courseApi);
      expect(visible.status(), "The running server must see the fixture; set RALPH_TEST_DATABASE if its database differs").toBe(200);
      const originalCourse = await visible.json();
      expect(originalCourse.chapters).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.chapterId })]));

      // Allow only one real grading write. Block regressions that could reset
      // learner evidence or explicitly start paid generation before they run.
      const unexpectedWrites: string[] = [];
      let allowAttempt = true;
      await page.route("**/api/**", async route => {
        const req = route.request();
        const pathname = new URL(req.url()).pathname;
        if (allowAttempt && pathname === attemptsApi && req.method() === "POST") {
          allowAttempt = false;
          await route.continue();
        } else if (req.method() !== "GET") {
          unexpectedWrites.push(`${req.method()} ${pathname}`);
          await route.abort("blockedbyclient");
        } else {
          await route.continue();
        }
      });

      // Establish nonzero progress with actual delivery and grading, rather than
      // mocking mastery or asserting that an untouched empty history survives.
      const delivery = page.waitForResponse(response => new URL(response.url()).pathname === `${chapterApi}/quiz`);
      await page.goto(`${coursePath}/ch/0/quiz`);
      const deliveredResponse = await delivery;
      expect(deliveredResponse.status()).toBe(200);
      const delivered = (await deliveredResponse.json()).questions as { id: string; prompt: string; options: string[] }[];
      expect(delivered).toHaveLength(10);
      expect(delivered.map(question => question.id).sort()).toEqual(fixture.questions.map(question => question.id).sort());
      const main = page.getByRole("main");
      for (const [index, question] of delivered.entries()) {
        const prepared = fixture.questions.find(item => item.id === question.id)!;
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
        const letter = String.fromCharCode(65 + question.options.indexOf(prepared.modelAnswer));
        await main.getByRole("radio", { name: `${letter}. ${prepared.modelAnswer}`, exact: true }).check();
        if (index < delivered.length - 1) await main.getByRole("button", { name: "Next question", exact: true }).click();
      }
      const submission = page.waitForResponse(response => new URL(response.url()).pathname === attemptsApi && response.request().method() === "POST");
      await main.getByRole("button", { name: "Submit answers", exact: true }).click();
      const graded = await submission;
      expect(graded.status()).toBe(200);
      const result = await graded.json();
      expect(result).toMatchObject({ score: 1, passed: true, complete: true });
      await expect(main.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
      const saved = fixture.persisted();
      expect(saved.attempts).toHaveLength(1);
      expect(saved.attempts[0]).toMatchObject({ id: result.attemptId, score: 1, passed: true });
      expect(saved.answers).toHaveLength(10);
      expect(saved.chapter?.status).toBe("passed");
      expect(saved.jobs).toEqual([]);

      await main.getByRole("link", { name: "View completed course", exact: true }).click();
      await expect(page).toHaveURL(coursePath);
      const assertPopulated = async () => {
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(originalCourse.course.topic);
        await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", "100");
        await expect(main.getByText("1 of 1 chapters mastered", { exact: true })).toBeVisible();
        await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
        await expect(main.getByRole("link", { name: /Prepared deterministic quiz.*Mastered.*Revisit/ })).toBeVisible();
      };
      await assertPopulated();
      const populated = await overviewGeometry(page, width);
      await capture(page, info, "populated-overview");

      // Only degraded overview reads are injected. Successful retry and reload
      // reach the real API and its saved evidence. Default query retries remain.
      let mode: "failure" | "retry" | "real" | "empty" = "failure";
      let retryReads = 0;
      await page.route(`**${courseApi}`, async route => {
        if (route.request().method() !== "GET") return route.fallback();
        if (mode === "failure") {
          await initial.promise;
          await route.fulfill({ status: 503, json: { error: "Test-owned overview outage" } });
        } else if (mode === "retry") {
          retryReads += 1;
          await retry.promise;
          await route.continue();
        } else if (mode === "empty") {
          await route.fulfill({ json: { course: originalCourse.course, chapters: [], progress: { passed: 0, total: 0 } } });
        } else {
          await route.continue();
        }
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(main.getByRole("status")).toHaveText("Loading course…");
      expect(await overviewGeometry(page, width)).toEqual(populated);
      await capture(page, info, "loading-overview");
      initial.release();
      // The app intentionally uses React Query's default automatic retries
      // (1s + 2s + 4s), as in the existing course accessibility test.
      await expect(main.getByRole("alert")).toHaveText("Could not load this course.", { timeout: 15000 });
      await expect(main.getByRole("heading", { name: "Course unavailable", exact: true })).toBeVisible();
      const retryButton = main.getByRole("button", { name: "Try again", exact: true });
      const back = main.getByRole("link", { name: "Back to learning", exact: true });
      await expect(retryButton).toBeEnabled();
      await expect(back).toHaveAttribute("href", "/");
      await retryButton.focus();
      await page.keyboard.press("Tab");
      await expect(back).toBeFocused();
      expect(await overviewGeometry(page, width)).toEqual(populated);
      await capture(page, info, "failed-overview");

      let documents = 0;
      page.on("request", req => {
        if (req.isNavigationRequest() && req.frame() === page.mainFrame()) documents += 1;
      });
      mode = "retry";
      await retryButton.focus();
      await page.keyboard.press("Enter");
      await expect(main.getByRole("button", { name: "Trying again…", exact: true })).toBeDisabled();
      await expect(main.getByRole("status")).toHaveText("Loading course…");
      await expect(main.getByRole("heading", { name: "Course unavailable", exact: true })).toBeVisible();
      await expect(back).toBeVisible();
      await expect.poll(() => retryReads).toBe(1);
      expect(await overviewGeometry(page, width)).toEqual(populated);
      await capture(page, info, "retry-pending-overview");
      retry.release();
      await assertPopulated();
      await expect(main.getByRole("alert")).toHaveCount(0);
      expect(documents, "Retry must recover through a read without document navigation").toBe(0);
      expect(retryReads).toBe(1);
      expect(await overviewGeometry(page, width)).toEqual(populated);
      expect(fixture.persisted()).toEqual(saved);
      await capture(page, info, "recovered-overview");
      mode = "real";
      await page.reload();
      await assertPopulated();
      expect(fixture.persisted()).toEqual(saved);

      // Render an empty response without deleting the fixture's chapter or
      // learning evidence. This is state presentation coverage, not an empty-DB test.
      mode = "empty";
      await page.reload();
      await expect(main.getByRole("heading", { name: "No chapters available", exact: true })).toBeVisible();
      await expect(main.getByText("This course has no chapters yet.", { exact: true })).toBeVisible();
      await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", "0");
      await expect(main.getByText("You completed this course.", { exact: true })).toHaveCount(0);
      await expect(main.getByText("NaN%", { exact: true })).toHaveCount(0);
      expect(await overviewGeometry(page, width)).toEqual(populated);
      await expect(back).toHaveAttribute("href", "/");
      await back.focus();
      await expect(back).toBeFocused();
      await capture(page, info, "empty-overview");
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL("/");
      await expect(main.getByRole("heading", { name: "What do you want to learn?", exact: true })).toBeVisible();
      mode = "real";
      await page.goto(coursePath);
      await assertPopulated();
      await page.reload();
      await assertPopulated();
      expect(await overviewGeometry(page, width)).toEqual(populated);
      expect(fixture.persisted()).toEqual(saved);
      expect(unexpectedWrites).toEqual([]);
    } finally {
      initial.release();
      retry.release();
      try {
        await page.unrouteAll({ behavior: "wait" });
        await page.close();
      } finally {
        fixture.cleanup();
      }
    }
  });
}
