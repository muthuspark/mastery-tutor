import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

// Guard regressions before they can reset progress or start explicit generation.
// Prepared quiz GETs and real MCQ grading are left intact.
async function guardWrites(page: Page, allowedAttempt?: string) {
  const unexpected: string[] = [];
  let attemptAllowed = Boolean(allowedAttempt);
  await page.route("**/api/**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (attemptAllowed && pathname === allowedAttempt && request.method() === "POST") {
      attemptAllowed = false;
      await route.continue();
    } else if (request.method() !== "GET") {
      unexpected.push(`${request.method()} ${pathname}`);
      await route.abort("blockedbyclient");
    } else {
      await route.continue();
    }
  });
  return unexpected;
}

async function finish(page: Page, fixture: ReturnType<typeof preparedMcqFixture>) {
  try {
    await page.unrouteAll({ behavior: "wait" });
    await page.close();
  } finally {
    fixture.cleanup();
  }
}

async function readingGeometry(page: Page, width: number) {
  const main = page.getByRole("main");
  await expect(main).toBeVisible();
  const bounds = await main.boundingBox();
  expect(bounds).not.toBeNull();
  const expectedWidth = Math.min(width - (width < 768 ? 32 : 48), 768);
  expect(bounds!.width).toBeCloseTo(expectedWidth, 0);
  expect(bounds!.x).toBeCloseTo((width - expectedWidth) / 2, 0);
  const layout = await main.evaluate(element => ({
    paddingTop: getComputedStyle(element).paddingTop,
    paddingBottom: getComputedStyle(element).paddingBottom,
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(layout.paddingTop).toBe(width < 768 ? "40px" : "56px");
  expect(layout.paddingBottom).toBe(layout.paddingTop);
  expect(layout.scroll).toBeLessThanOrEqual(layout.client + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  return { x: bounds!.x, width: bounds!.width, paddingTop: layout.paddingTop };
}

async function capture(page: Page, info: TestInfo, state: string) {
  await info.attach(state, { body: await page.screenshot(), contentType: "image/png" });
}

for (const width of [375, 768, 1440]) {
  test.describe(`chapter recovery at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("announces loading, retries locally, and preserves a real completed assessment after reload", async ({ page, request }, info) => {
      const fixture = preparedMcqFixture();
      const courseGate = gate();
      const initialChapterGate = gate();
      const retryGate = gate();
      try {
        expect(isBalancedQuiz(fixture.questions), "Prepared base questions must pass the real delivery quality gate").toBe(true);
        const courseApi = `/api/courses/${fixture.courseId}`;
        const chapterApi = `/api/chapters/${fixture.chapterId}`;
        const coursePath = `/course/${fixture.courseId}`;
        const lessonPath = `${coursePath}/ch/0`;
        const attemptsApi = `${chapterApi}/attempts`;
        const unexpectedWrites = await guardWrites(page, attemptsApi);
        const visible = await request.get(courseApi);
        expect(visible.status(), "Existing server must see the test-owned fixture; set RALPH_TEST_DATABASE if needed").toBe(200);
        expect((await visible.json()).chapters).toEqual(expect.arrayContaining([expect.objectContaining({ id: fixture.chapterId })]));

        // Establish actual learning evidence through unmocked delivery and grading.
        const delivery = page.waitForResponse(response => new URL(response.url()).pathname === `${chapterApi}/quiz`);
        await page.goto(`${lessonPath}/quiz`);
        const deliveredResponse = await delivery;
        expect(deliveredResponse.status()).toBe(200);
        const delivered = (await deliveredResponse.json()).questions as { id: string; prompt: string; options: string[] }[];
        expect(delivered).toHaveLength(10);
        expect(delivered.map(question => question.id).sort()).toEqual(fixture.questions.map(question => question.id).sort());
        for (const [index, question] of delivered.entries()) {
          const prepared = fixture.questions.find(item => item.id === question.id)!;
          await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(question.prompt);
          const letter = String.fromCharCode(65 + question.options.indexOf(prepared.modelAnswer));
          await page.getByRole("radio", { name: `${letter}. ${prepared.modelAnswer}`, exact: true }).check();
          if (index < delivered.length - 1) await page.getByRole("button", { name: "Next question", exact: true }).click();
        }
        const submission = page.waitForResponse(response => new URL(response.url()).pathname === attemptsApi && response.request().method() === "POST");
        await page.getByRole("button", { name: "Submit answers", exact: true }).click();
        const graded = await submission;
        expect(graded.status()).toBe(200);
        expect(await graded.json()).toMatchObject({ score: 1, passed: true, complete: true });
        await expect(page.getByRole("main").getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
        const saved = fixture.persisted();
        expect(saved.attempts).toHaveLength(1);
        expect(saved.answers).toHaveLength(10);
        expect(saved.chapter?.status).toBe("passed");
        expect(saved.jobs).toEqual([]);

        // Exact-resource interception injects the fault only. Successful recovery
        // and reload continue to the server's saved lesson.
        await page.route(`**${courseApi}`, async route => {
          if (route.request().method() !== "GET") return route.fallback();
          await courseGate.promise;
          await route.continue();
        });
        let chapterReads = 0;
        await page.route(`**${chapterApi}`, async route => {
          if (route.request().method() !== "GET") return route.fallback();
          chapterReads += 1;
          if (chapterReads === 1) {
            await initialChapterGate.promise;
            await route.fulfill({ status: 503, json: { error: { retryable: false, message: "Test-owned temporary failure" } } });
          } else {
            await retryGate.promise;
            await route.continue();
          }
        });
        let documents = 0;
        page.on("request", request => {
          if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents += 1;
        });
        await page.goto(lessonPath, { waitUntil: "domcontentloaded" });
        const main = page.getByRole("main");
        await expect(main.getByRole("status")).toHaveText("Loading chapter…");
        const loadingGeometry = await readingGeometry(page, width);
        await capture(page, info, "course-lookup-loading");
        courseGate.release();
        await expect.poll(() => chapterReads).toBe(1);
        await expect(main.getByRole("status")).toHaveText("Loading chapter…");
        expect(await readingGeometry(page, width)).toEqual(loadingGeometry);
        initialChapterGate.release();

        await expect(main.getByRole("heading", { name: "Could not load chapter", exact: true })).toBeVisible();
        await expect(main.getByRole("alert")).toHaveText("Could not load this chapter. Try again, or return to the course.");
        const retry = main.getByRole("button", { name: "Try again", exact: true });
        const back = main.getByRole("link", { name: "Back to course", exact: true });
        await expect(back).toHaveAttribute("href", coursePath);
        await retry.focus();
        await expect(retry).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(back).toBeFocused();
        expect(await readingGeometry(page, width)).toEqual(loadingGeometry);
        await capture(page, info, "chapter-failure");

        const beforeRetryDocuments = documents;
        await retry.focus();
        await page.keyboard.press("Enter");
        await expect(main.getByRole("button", { name: "Trying again…", exact: true })).toBeDisabled();
        await expect(main.getByRole("status")).toHaveText("Trying again…");
        await expect(main.getByRole("heading", { name: "Loading chapter", exact: true })).toBeVisible();
        await expect(back).toBeVisible();
        await expect.poll(() => chapterReads).toBe(2);
        await capture(page, info, "retry-pending");
        retryGate.release();
        await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
        await expect(main.getByRole("alert")).toHaveCount(0);
        await expect(main.getByRole("link", { name: "Check your understanding →", exact: true })).toBeVisible();
        expect(documents, "Try again must recover without a document navigation").toBe(beforeRetryDocuments);
        expect(chapterReads).toBe(2);
        expect(await readingGeometry(page, width)).toEqual(loadingGeometry);
        expect(fixture.persisted()).toEqual(saved);
        await capture(page, info, "recovered-real-lesson");

        await page.reload();
        await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
        expect(fixture.persisted()).toEqual(saved);
        await main.getByRole("link", { name: "← Back to course", exact: true }).click();
        await expect(page).toHaveURL(coursePath);
        await page.reload();
        await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", "100");
        await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
        expect(fixture.persisted()).toEqual(saved);
        expect(unexpectedWrites).toEqual([]);
      } finally {
        courseGate.release();
        initialChapterGate.release();
        retryGate.release();
        await finish(page, fixture);
      }
    });

    test("keeps automatic generation-pending retries and restores the real prepared lesson", async ({ page, request }, info) => {
      const fixture = preparedMcqFixture();
      const preparationGate = gate();
      try {
        expect(isBalancedQuiz(fixture.questions)).toBe(true);
        const unexpectedWrites = await guardWrites(page);
        const coursePath = `/course/${fixture.courseId}`;
        expect((await request.get(`/api/courses/${fixture.courseId}`)).status(), "Server must see fixture database").toBe(200);
        const before = fixture.persisted();
        let reads = 0;
        await page.route(`**/api/chapters/${fixture.chapterId}`, async route => {
          if (route.request().method() !== "GET") return route.fallback();
          reads += 1;
          if (reads === 1) await route.fulfill({ status: 202, json: { status: "generating", retryable: true } });
          else {
            await preparationGate.promise;
            await route.continue();
          }
        });
        await page.goto(`${coursePath}/ch/0`, { waitUntil: "domcontentloaded" });
        const main = page.getByRole("main");
        await expect.poll(() => reads).toBe(2);
        await expect(main.getByRole("status")).toHaveText("Loading chapter…");
        await expect(main.getByRole("alert")).toHaveCount(0);
        await expect(main.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
        const loading = await readingGeometry(page, width);
        await capture(page, info, "automatic-preparation-retry");
        preparationGate.release();
        await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
        expect(await readingGeometry(page, width)).toEqual(loading);
        expect(reads).toBe(2);
        // The active lesson may intentionally prefetch its balanced cached quiz.
        // No generation jobs or learning-evidence mutations are expected.
        expect(fixture.persisted()).toEqual(before);
        expect(unexpectedWrites).toEqual([]);
      } finally {
        preparationGate.release();
        await finish(page, fixture);
      }
    });

    test("terminal failures provide usable course navigation without a retry", async ({ page, request }, info) => {
      const fixture = preparedMcqFixture();
      try {
        expect(isBalancedQuiz(fixture.questions)).toBe(true);
        const unexpectedWrites = await guardWrites(page);
        const coursePath = `/course/${fixture.courseId}`;
        expect((await request.get(`/api/courses/${fixture.courseId}`)).status(), "Server must see fixture database").toBe(200);
        const before = fixture.persisted();
        let terminalStatus = 403;
        let reads = 0;
        await page.route(`**/api/chapters/${fixture.chapterId}`, async route => {
          if (route.request().method() !== "GET") return route.fallback();
          reads += 1;
          await route.fulfill({ status: terminalStatus, json: { error: { retryable: false } } });
        });
        for (const status of [403, 404]) {
          terminalStatus = status;
          const beforeReads = reads;
          await page.goto(`${coursePath}/ch/0`);
          const main = page.getByRole("main");
          await expect(main.getByRole("heading", { name: "Chapter unavailable", exact: true })).toBeVisible();
          await expect(main.getByRole("alert")).toHaveText(status === 403
            ? "This chapter is locked. Complete the earlier chapters before reading it."
            : "This chapter is unavailable. Return to the course to choose a chapter.");
          await expect(main.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
          await readingGeometry(page, width);
          await capture(page, info, `terminal-${status}`);
          const back = main.getByRole("link", { name: "Back to course", exact: true });
          await expect(back).toHaveAttribute("href", coursePath);
          await back.focus();
          await page.keyboard.press("Enter");
          await expect(page).toHaveURL(coursePath);
          await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", "0");
          expect(reads).toBe(beforeReads + 1);
          expect(fixture.persisted()).toEqual(before);
        }
        expect(unexpectedWrites).toEqual([]);
      } finally {
        await finish(page, fixture);
      }
    });
  });
}
