import { expect, test, type Locator } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import path from "node:path";
import { chapters, questions } from "../../../lib/db/schema";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

const longUrl = `https://example.test/lesson/${"unbroken-path-segment".repeat(24)}`;
const longToken = "UninterruptedLessonToken".repeat(24);
const codeLine = `const preserved = "${"code-token-".repeat(50)}END_OF_CODE";`;
const wideTex = `${Array.from({ length: 30 }, (_, index) => `x_{${index + 1}}`).join(" + ")} = z`;
const mediumTex = String.raw`\text{MMMMMMMMMMMMMMMMMMMMMMMMMMMMMM}`;
const lesson = [
  "# Reading containment fixture",
  "Read the full explanation, equation, and example before checking your understanding.",
  `[${longUrl}](${longUrl})`,
  longToken,
  `$$\n${wideTex}\n$$`,
  "$$\nx = 1\n$$",
  `$$\n${mediumTex}\n$$`,
  `\`\`\`js\n${codeLine}\n\`\`\``,
  "```mermaid\ngraph LR\n  A[Read lesson] --> B[Practice recall]\n```",
  "Lesson content ends here, with every symbol and example preserved.",
].join("\n\n");

// Test text fragments, not just element widths: an element can fit while its
// text spills outside it. The introductory paragraph absorbs the drop cap.
async function expectWrappedText(locator: Locator, expected: string) {
  await expect(locator).toHaveText(expected);
  const geometry = await locator.evaluate(element => {
    const paragraph = element.closest("p")!;
    const bounds = paragraph.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const fragments = [...range.getClientRects()];
    return {
      fragments: fragments.length,
      fits: fragments.every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 &&
        rect.top >= bounds.top - 3 && rect.bottom <= bounds.bottom + 3),
      overflow: paragraph.scrollWidth - paragraph.clientWidth,
      truncation: getComputedStyle(paragraph).textOverflow,
    };
  });
  expect(geometry.fragments, "Long content should occupy multiple rendered lines").toBeGreaterThan(1);
  expect(geometry.fits, "Full text must wrap inside its paragraph without clipping").toBe(true);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.truncation).not.toBe("ellipsis");
}

async function expectNoPageOverflow(main: Locator) {
  const geometry = await main.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const prose = element.querySelector(".prose-editorial")!;
    const proseBounds = prose.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mainOverflow: element.scrollWidth - element.clientWidth,
      proseOverflow: prose.scrollWidth - prose.clientWidth,
      proseFits: proseBounds.left >= bounds.left - 1 && proseBounds.right <= bounds.right + 1,
    };
  });
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.mainOverflow).toBeLessThanOrEqual(1);
  expect(geometry.proseOverflow).toBeLessThanOrEqual(1);
  expect(geometry.proseFits).toBe(true);
}

for (const width of [375, 768, 1440]) {
  test(`complete lesson text and keyboard-scrollable mathematics at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = preparedMcqFixture();
    try {
      // Change only this fixture's lesson. Validate the untouched ten-question
      // cache before navigation: the lesson intentionally prefetches this quiz.
      expect(isBalancedQuiz(fixture.questions)).toBe(true);
      const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
      const databasePath = process.env.RALPH_TEST_DATABASE ?? path.join(process.cwd(), "data", configured ? path.basename(configured) : "tutor.db");
      const sqlite = new Database(databasePath, { fileMustExist: true });
      try {
        sqlite.pragma("foreign_keys = ON");
        sqlite.pragma("busy_timeout = 5000");
        const db = drizzle(sqlite);
        const updated = db.update(chapters).set({ content: lesson })
          .where(and(eq(chapters.id, fixture.chapterId), eq(chapters.courseId, fixture.courseId))).run();
        expect(updated.changes).toBe(1);
        const stored = db.select().from(questions).where(eq(questions.chapterId, fixture.chapterId)).all();
        expect(stored).toHaveLength(10);
        expect(isBalancedQuiz(stored.map(question => ({ ...question, options: question.options ?? [] })))).toBe(true);
      } finally { sqlite.close(); }

      expect((await request.get(`/api/courses/${fixture.courseId}`)).status(),
        "The existing server must see the fixture; configure RALPH_TEST_DATABASE if necessary").toBe(200);
      const lessonPath = `/course/${fixture.courseId}/ch/0`;
      const chapterPath = `/api/chapters/${fixture.chapterId}`;
      const before = fixture.persisted();
      const delivery = page.waitForResponse(response =>
        new URL(response.url()).pathname === chapterPath && response.request().method() === "GET");
      // Real markdown rendering, cached quiz delivery, and grading remain
      // unmocked. One chapter and all-correct answers avoid unrelated generation.
      await page.goto(lessonPath);
      const response = await delivery;
      expect(response.status()).toBe(200);
      expect((await response.json()).chapter.content).toBe(lesson);
      const main = page.getByRole("main");
      const prose = main.locator(".prose-editorial");
      const link = prose.getByRole("link", { name: longUrl, exact: true });
      const token = prose.locator("p").filter({ hasText: longToken });
      const displays = prose.locator(".katex-display");
      const wide = displays.nth(0);
      const short = displays.nth(1);
      const medium = displays.nth(2);
      const assertLesson = async () => {
        await expect(main.getByRole("heading", { name: "Reading containment fixture", exact: true })).toBeVisible();
        await expectWrappedText(link, longUrl);
        await expect(link).toHaveAttribute("href", longUrl);
        await expectWrappedText(token, longToken);
        await expect(displays).toHaveCount(3);
        await expect(wide).toHaveAttribute("role", "region");
        await expect(wide).toHaveAccessibleName("Equation (scroll horizontally)");
        await expect(wide).toHaveAttribute("tabindex", "0");
        expect(await wide.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(100);
        await expect(short).not.toHaveAttribute("tabindex");
        await expect(short).not.toHaveAttribute("role");
        // KaTeX's accessible MathML and original complete source must survive.
        for (const [index, tex] of [wideTex, "x = 1", mediumTex].entries()) {
          await expect(displays.nth(index).locator(".katex-mathml math")).toHaveCount(1);
          await expect(displays.nth(index).locator('annotation[encoding="application/x-tex"]')).toHaveText(tex);
          await expect(displays.nth(index).locator(".katex-html")).toHaveAttribute("aria-hidden", "true");
        }
        const code = prose.locator("pre");
        await expect(code.locator("code")).toHaveText(codeLine);
        expect(await code.evaluate(element => ({
          overflow: element.scrollWidth - element.clientWidth,
          scrollable: ["auto", "scroll"].includes(getComputedStyle(element).overflowX),
          noWrap: getComputedStyle(element).whiteSpace === "pre",
        }))).toMatchObject({ scrollable: true, noWrap: true });
        expect(await code.evaluate(element => element.scrollWidth - element.clientWidth)).toBeGreaterThan(100);
        await expect(prose.getByRole("img", { name: "Learning diagram", exact: true })).toBeVisible();
        await expect(prose.locator(".mermaid svg")).toContainText("Read lesson");
        await expect(prose.locator(".mermaid svg")).toContainText("Practice recall");
        await expect(prose.getByText("Lesson content ends here, with every symbol and example preserved.", { exact: true })).toBeVisible();
        await expectNoPageOverflow(main);
      };
      await assertLesson();

      // The preceding URL is the last interactive element before the wide
      // equation. Tab must discover the region without programmatic focus.
      await link.focus();
      await link.press("Tab");
      await expect(wide).toBeFocused();
      const outline = await wide.evaluate(element => ({
        style: getComputedStyle(element).outlineStyle,
        width: parseFloat(getComputedStyle(element).outlineWidth),
      }));
      expect(outline.style).not.toBe("none");
      expect(outline.width).toBeGreaterThanOrEqual(2);
      for (let index = 0; index < 4; index++) await wide.press("ArrowRight");
      await expect.poll(() => wide.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
      await expectNoPageOverflow(main);
      await testInfo.attach(`lesson-${width}-keyboard-equation`, {
        body: await page.screenshot({ fullPage: true }), contentType: "image/png",
      });
      // Reach the far edge of the native local scrollbar and verify that the
      // final visible symbol is reachable, rather than merely present offscreen.
      await wide.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      expect(await wide.evaluate(element => {
        const region = element.getBoundingClientRect();
        const symbols = element.querySelectorAll(".katex-html .mord");
        const last = symbols[symbols.length - 1];
        const end = last.getBoundingClientRect();
        return last.textContent === "z" && end.left >= region.left - 1 && end.right <= region.right + 1;
      })).toBe(true);
      const code = prose.locator("pre");
      await code.evaluate(element => { element.scrollLeft = element.scrollWidth; });
      expect(await code.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);

      // An equation that only overflows on mobile must gain and lose its tab
      // stop after resizing, without requiring a new lesson response.
      for (const responsiveWidth of [375, 1440, width]) {
        await page.setViewportSize({ width: responsiveWidth, height: 900 });
        if (responsiveWidth === 375) {
          await expect(medium).toHaveAttribute("tabindex", "0");
          await expect(medium).toHaveAccessibleName("Equation (scroll horizontally)");
        } else {
          await expect(medium).not.toHaveAttribute("tabindex");
          await expect(medium).not.toHaveAttribute("role");
        }
        await expectNoPageOverflow(main);
      }
      await page.reload();
      await assertLesson();
      expect(fixture.persisted()).toEqual(before);
      await main.getByRole("link", { name: "← Back to course", exact: true }).click();
      await expect(page).toHaveURL(`/course/${fixture.courseId}`);
      await page.goto(lessonPath);
      await assertLesson();

      // Exercise the real lesson-to-assessment action and ten-answer grading.
      // No failed attempt is created, so a background prefetch cannot request
      // fresh quiz generation on a review link.
      await main.getByRole("link", { name: "Check your understanding →", exact: true }).click();
      await expect(page).toHaveURL(`${lessonPath}/quiz`);
      const delivered = [...fixture.questions].reverse();
      for (const [index, question] of delivered.entries()) {
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
        const letter = String.fromCharCode(65 + question.options.indexOf(question.modelAnswer));
        await main.getByRole("radio", { name: `${letter}. ${question.modelAnswer}`, exact: true }).check();
        if (index < delivered.length - 1) await main.getByRole("button", { name: "Next question", exact: true }).click();
      }
      const grading = page.waitForResponse(response =>
        new URL(response.url()).pathname === `${chapterPath}/attempts` && response.request().method() === "POST");
      await main.getByRole("button", { name: "Submit answers", exact: true }).click();
      const graded = await grading;
      expect(graded.status()).toBe(200);
      const result = await graded.json();
      expect(result).toMatchObject({ score: 1, passed: true, complete: true });
      await expect(main.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
      await expect(main.getByText("100%", { exact: true })).toBeVisible();
      await main.getByRole("link", { name: "View completed course", exact: true }).click();
      // Next.js client navigation can finish after click resolves. Confirm the
      // destination before reloading so we test persisted course completion.
      await expect(page).toHaveURL(`/course/${fixture.courseId}`);
      await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
      await page.reload();
      await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
      const saved = fixture.persisted();
      expect(saved.attempts).toHaveLength(1);
      expect(saved.attempts[0]).toMatchObject({ id: result.attemptId, score: 1, passed: true });
      expect(saved.answers).toHaveLength(10);
      expect(saved.chapter).toMatchObject({ content: lesson, status: "passed" });
      expect(saved.jobs).toEqual([]);
    } finally {
      try { await page.close(); }
      finally { fixture.cleanup(); }
    }
  });
}
