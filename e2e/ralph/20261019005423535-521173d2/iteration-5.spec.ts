import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

// These are the documented public geometry contracts, independent of CSS tokens.
async function expectBounds(locator: Locator, viewport: number, maximum: number) {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  const expectedWidth = Math.min(viewport - 2 * (viewport < 768 ? 16 : 24), maximum);
  expect(bounds!.width).toBeCloseTo(expectedWidth, 0);
  expect(bounds!.x).toBeCloseTo((viewport - expectedWidth) / 2, 0);
  return { x: bounds!.x, width: bounds!.width };
}

async function pageGeometry(page: Page, width: number, variant: "wide" | "reading" | "home") {
  const header = page.locator("body > .site-header");
  const wide = await expectBounds(header, width, 1216);
  await expect(header.getByRole("link", { name: "Newton", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Profile settings", exact: true })).toBeVisible();
  const main = page.getByRole("main");
  const bounds = await expectBounds(main, width, variant === "reading" ? 768 : 1216);
  if (variant !== "reading") expect(bounds).toEqual(wide);
  const padding = await main.evaluate(element => ({
    top: getComputedStyle(element).paddingTop, bottom: getComputedStyle(element).paddingBottom,
  }));
  const space = width < 768 ? "40px" : "56px";
  expect(padding).toEqual({ top: variant === "home" ? "0px" : space, bottom: variant === "home" ? "0px" : space });
  if (variant === "home") {
    expect(await main.locator(":scope > div").evaluate(element => ({
      top: getComputedStyle(element).paddingTop, bottom: getComputedStyle(element).paddingBottom,
    }))).toEqual({ top: space, bottom: space });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  return bounds;
}

async function capture(page: Page, info: TestInfo, label: string) {
  await info.attach(label, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

for (const width of [375, 768, 1440]) {
  test(`wide and reading layouts stay consistent through real study and grading at ${width}px`, async ({ page, request }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = preparedMcqFixture();
    try {
      expect(isBalancedQuiz(fixture.questions), "Validate all ten cached questions before navigation").toBe(true);
      const coursePath = `/course/${fixture.courseId}`;
      const chapterApi = `/api/chapters/${fixture.chapterId}`;
      const visible = await request.get(`/api/courses/${fixture.courseId}`);
      expect(visible.status(), "Running server must see fixture; configure RALPH_TEST_DATABASE if needed").toBe(200);
      const course = await visible.json();
      const unexpectedWrites: string[] = [];
      let allowAttempt = true;
      await page.route("**/api/**", async route => {
        const req = route.request();
        const pathname = new URL(req.url()).pathname;
        if (req.method() === "POST" && pathname === `${chapterApi}/attempts` && allowAttempt) {
          allowAttempt = false;
          await route.continue();
        } else if (req.method() !== "GET") {
          unexpectedWrites.push(`${req.method()} ${pathname}`);
          await route.abort("blockedbyclient");
        } else await route.continue();
      });

      await page.goto("/");
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { name: "What do you want to learn?", exact: true })).toBeVisible();
      await pageGeometry(page, width, "home");
      await capture(page, info, "home-wide");

      await page.goto("/settings");
      await expect(main.getByRole("heading", { name: "Profile settings", exact: true })).toBeVisible();
      await expect(main.getByRole("textbox", { name: "About me (optional)", exact: true })).toBeVisible();
      const reading = await pageGeometry(page, width, "reading");
      await capture(page, info, "settings-reading");

      await page.goto(coursePath);
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(course.course.topic);
      await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", "0");
      await pageGeometry(page, width, "wide");
      await capture(page, info, "course-wide");
      await main.getByRole("link", { name: /Prepared deterministic quiz.*Continue →/ }).click();
      await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
      expect(await pageGeometry(page, width, "reading")).toEqual(reading);
      await capture(page, info, "chapter-reading");

      // Chapter prefetch intentionally reads this balanced, ready quiz. Delivery
      // and grading remain real; a single chapter and all-correct answers avoid
      // both next-chapter generation and failed-attempt quiz regeneration.
      await main.getByRole("link", { name: "Check your understanding →", exact: true }).click();
      const delivered = [...fixture.questions].reverse();
      for (const [index, question] of delivered.entries()) {
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
        await expect(main.getByRole("radio")).toHaveCount(4);
        expect(await pageGeometry(page, width, "reading")).toEqual(reading);
        const letter = String.fromCharCode(65 + question.options.indexOf(question.modelAnswer));
        await main.getByRole("radio", { name: `${letter}. ${question.modelAnswer}`, exact: true }).check();
        if (index === 0) await capture(page, info, "quiz-reading");
        if (index < 9) await main.getByRole("button", { name: "Next question", exact: true }).click();
      }
      const submission = page.waitForResponse(response => new URL(response.url()).pathname === `${chapterApi}/attempts` && response.request().method() === "POST");
      await main.getByRole("button", { name: "Submit answers", exact: true }).click();
      const graded = await submission;
      expect(graded.status()).toBe(200);
      const result = await graded.json();
      expect(result).toMatchObject({ score: 1, passed: true, complete: true });
      await expect(main.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
      await expect(main.getByText("100%", { exact: true })).toBeVisible();
      await expect(main.getByText("Correct.", { exact: true })).toHaveCount(10);
      expect(await pageGeometry(page, width, "reading")).toEqual(reading);
      await capture(page, info, "results-reading");
      await main.getByRole("link", { name: "View completed course", exact: true }).click();
      await expect(page).toHaveURL(coursePath);
      await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
      await page.reload();
      await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
      await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", "100");
      await pageGeometry(page, width, "wide");
      const saved = fixture.persisted();
      expect(saved.attempts).toHaveLength(1);
      expect(saved.attempts[0]).toMatchObject({ id: result.attemptId, score: 1, passed: true });
      expect(saved.answers).toHaveLength(10);
      for (const question of delivered) expect(saved.answers.find(answer => answer.questionId === question.id)).toMatchObject({ response: question.modelAnswer, score: 1 });
      expect(saved.chapter?.status).toBe("passed");
      expect(saved.jobs).toEqual([]);

      // Exercise the documented confirmation-dialog exception without resetting.
      await main.getByRole("link", { name: /Prepared deterministic quiz.*Mastered.*Revisit →/ }).click();
      const dialog = page.getByRole("dialog", { name: "Reset Prepared deterministic quiz?", exact: true });
      await expect(dialog).toBeVisible();
      const box = (await dialog.boundingBox())!;
      expect(box.width).toBeCloseTo(width <= 480 ? width : Math.min(width - 48, 496), 0);
      expect(box.x).toBeCloseTo((width - box.width) / 2, 0);
      expect(box.height).toBeLessThanOrEqual(width <= 480 ? 900 : 852);
      if (width <= 480) expect(box.y + box.height).toBeCloseTo(900, 0);
      await expect(dialog.getByRole("button", { name: "Keep mastered", exact: true })).toBeFocused();
      await capture(page, info, "revisit-dialog-exception");
      await dialog.getByRole("button", { name: "Keep mastered", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      expect(fixture.persisted()).toEqual(saved);
      expect(unexpectedWrites).toEqual([]);
    } finally {
      try { await page.close(); } finally { fixture.cleanup(); }
    }
  });

  test(`generation overlay shares wide bounds without starting generation at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let creates = 0;
    // Only presentation is under test here. No course is created and no global
    // agent selection is saved. Real assessment APIs above are never mocked.
    await page.route("**/api/agents", route => route.fulfill({ json: { available: ["codex"], selected: "codex" } }));
    await page.route("**/api/courses", async route => {
      if (route.request().method() === "POST") {
        creates += 1;
        await held;
        await route.fulfill({ status: 503, json: { error: { message: "Test-owned generation stopped before dispatch." } } });
      } else await route.fulfill({ json: { courses: [] } });
    });
    try {
      await page.goto("/");
      await page.getByRole("textbox", { name: "I want to learn", exact: true }).fill("Test-owned layout preview");
      await page.getByRole("button", { name: "Begin", exact: true }).click();
      const overlay = page.getByRole("dialog", { name: "Building your learning path", exact: true });
      await expect(overlay).toBeVisible();
      await expect(overlay.getByRole("heading", { name: "Building your learning path", exact: true })).toBeVisible();
      const header = await expectBounds(overlay.locator(".site-header"), width, 1216);
      expect(await expectBounds(overlay.locator(".generation-overlay__inner"), width, 1216)).toEqual(header);
      await expect(overlay.getByRole("list", { name: "Course creation progress", exact: true })).toBeVisible();
      expect(await overlay.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await capture(page, info, "generation-overlay-wide");
      release();
      await expect(overlay).toHaveCount(0);
      await expect(page.getByRole("main").getByRole("alert").filter({ hasText: "Test-owned generation stopped before dispatch." })).toBeVisible();
      await expect(page.getByRole("button", { name: "Begin", exact: true })).toBeEnabled();
      expect(creates).toBe(1);
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
      await page.close();
    }
  });
}
