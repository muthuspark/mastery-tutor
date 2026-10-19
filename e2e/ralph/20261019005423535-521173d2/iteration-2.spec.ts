import { expect, test, type Locator } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import path from "node:path";
import { questions } from "../../../lib/db/schema";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

const longContent = [
  "Explain how repeated retrieval, spaced practice, and applying ideas in unfamiliar situations support durable understanding. ".repeat(4).trim(),
  `https://example.test/assessment/${"long-path-segment".repeat(20)}?context=practice`,
  "UninterruptedToken".repeat(22),
];

// Measure the actual text fragments as well as their element boxes. A narrow
// element alone would miss text spilling out of it or being clipped inside it.
async function expectContainedText(locator: Locator) {
  const geometry = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      width: rect.width,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      textOverflow: getComputedStyle(element).textOverflow,
      fragmentsFit: [...range.getClientRects()].every(fragment =>
        fragment.left >= rect.left - 1 && fragment.right <= rect.right + 1 &&
        fragment.top >= rect.top - 3 && fragment.bottom <= rect.bottom + 3),
    };
  });
  expect(geometry.width).toBeGreaterThan(0);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.textOverflow).not.toBe("ellipsis");
  expect(geometry.fragmentsFit, "Every rendered text fragment must fit without clipping").toBe(true);
}

for (const width of [375, 768, 1440]) {
  test(`assessment text stays readable and real answers persist at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = preparedMcqFixture();
    try {
      // The newest three questions exercise prose, URLs, and unbroken tokens.
      // Retain the fixture's 3/3/2/2 correct-position distribution.
      const cases = fixture.questions.map((question, index) => {
        if (index < 7) return question;
        const content = longContent[9 - index];
        const options = Array.from({ length: 4 }, (_, option) => `Choice ${option + 1}: ${content}`);
        return { ...question, prompt: `Question ${index + 1}: ${content}`, options, modelAnswer: options[index % 4] };
      });
      expect(isBalancedQuiz(cases), "Validate all ten cached questions before any browser navigation").toBe(true);
      const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
      const databasePath = process.env.RALPH_TEST_DATABASE ?? path.join(process.cwd(), "data", configured ? path.basename(configured) : "tutor.db");
      const sqlite = new Database(databasePath, { fileMustExist: true });
      try {
        sqlite.pragma("foreign_keys = ON");
        sqlite.pragma("busy_timeout = 5000");
        const db = drizzle(sqlite);
        db.transaction(tx => {
          for (const question of cases) {
            const updated = tx.update(questions).set({ prompt: question.prompt, options: question.options, modelAnswer: question.modelAnswer })
              .where(and(eq(questions.id, question.id), eq(questions.chapterId, fixture.chapterId))).run();
            expect(updated.changes).toBe(1);
          }
        });
        const stored = db.select().from(questions).where(eq(questions.chapterId, fixture.chapterId)).all();
        expect(stored).toHaveLength(10);
        expect(isBalancedQuiz(stored.map(question => ({ ...question, options: question.options ?? [] })))).toBe(true);
      } finally { sqlite.close(); }

      expect((await request.get(`/api/courses/${fixture.courseId}`)).status(),
        "Existing server must see the fixture; configure RALPH_TEST_DATABASE if necessary").toBe(200);
      // No API interception: balanced cached MCQs and a single chapter avoid
      // generation. All-correct grading also avoids failed-attempt regeneration.
      const delivered = [...cases].reverse();
      const delivery = page.waitForResponse(response =>
        new URL(response.url()).pathname === `/api/chapters/${fixture.chapterId}/quiz` && response.request().method() === "GET");
      await page.goto(`/course/${fixture.courseId}/ch/0/quiz`);
      const quizResponse = await delivery;
      expect(quizResponse.status()).toBe(200);
      expect(await quizResponse.json()).toEqual({
        questions: delivered.map(({ id, type, prompt, options, isReview }) => ({ id, type, prompt, options, isReview })),
      });
      const main = page.getByRole("main");
      const heading = main.getByRole("heading", { level: 1 });
      const next = main.getByRole("button", { name: "Next question", exact: true });
      const previous = main.getByRole("button", { name: "Previous question", exact: true });
      await expect(previous).toBeDisabled();

      for (const [index, question] of delivered.entries()) {
        await expect(heading).toHaveText(question.prompt);
        await expect(main.getByRole("radio")).toHaveCount(4);
        const correctPosition = question.options.indexOf(question.modelAnswer);
        const correct = main.getByRole("radio", {
          name: `${String.fromCharCode(65 + correctPosition)}. ${question.modelAnswer}`, exact: true,
        });
        if (index < 3) {
          await expectContainedText(heading);
          expect(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(width < 768 ? 36 : 48);
          for (const [position, option] of question.options.entries()) {
            const radio = main.getByRole("radio", { name: `${String.fromCharCode(65 + position)}. ${option}`, exact: true });
            await expect(radio).toBeVisible();
            await expect(radio).toBeEnabled();
            const label = radio.locator("..");
            await expect(label).toHaveText(`${String.fromCharCode(65 + position)}. ${option}`);
            await expectContainedText(label.locator("span"));
            const contained = await radio.evaluate(input => {
              const radioRect = input.getBoundingClientRect();
              const labelRect = input.closest("label")!.getBoundingClientRect();
              const shellRect = input.closest("main")!.getBoundingClientRect();
              return radioRect.width >= 12 && radioRect.height >= 12 &&
                radioRect.left >= labelRect.left && radioRect.right <= labelRect.right &&
                radioRect.top >= labelRect.top && radioRect.bottom <= labelRect.bottom &&
                labelRect.left >= shellRect.left - 1 && labelRect.right <= shellRect.right + 1;
            });
            expect(contained, "Radio and its full label must fit inside the reading container").toBe(true);
          }
          const overflow = await main.evaluate(element => ({
            document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            main: element.scrollWidth - element.clientWidth,
            centered: Math.abs(element.getBoundingClientRect().left - (innerWidth - element.getBoundingClientRect().right)),
          }));
          expect(overflow.document).toBeLessThanOrEqual(1);
          expect(overflow.main).toBeLessThanOrEqual(1);
          expect(overflow.centered).toBeLessThanOrEqual(1);

          // Exercise native keyboard selection and the complete wrapped label.
          const first = main.getByRole("radio", { name: `A. ${question.options[0]}`, exact: true });
          const second = main.getByRole("radio", { name: `B. ${question.options[1]}`, exact: true });
          await first.focus();
          await expect(first).toBeFocused();
          await first.press("Space");
          await expect(first).toBeChecked();
          await first.press("ArrowDown");
          await expect(second).toBeFocused();
          await expect(second).toBeChecked();
          await correct.locator("..").locator("span").click();
          await expect(correct).toBeChecked();
          await heading.scrollIntoViewIfNeeded();
          await testInfo.attach(`assessment-${width}-${["prose", "url", "token"][index]}`, {
            body: await page.screenshot({ fullPage: true }), contentType: "image/png",
          });
          await next.click();
          await expect(heading).toHaveText(delivered[index + 1].prompt);
          await previous.click();
          await expect(heading).toHaveText(question.prompt);
          await expect(correct).toBeChecked();
        } else {
          await correct.check();
          await expect(correct).toBeChecked();
        }
        if (index < delivered.length - 1) await next.click();
      }

      const submission = page.waitForResponse(response =>
        new URL(response.url()).pathname === `/api/chapters/${fixture.chapterId}/attempts` && response.request().method() === "POST");
      await main.getByRole("button", { name: "Submit answers", exact: true }).click();
      const graded = await submission;
      expect(graded.status()).toBe(200);
      expect(graded.request().postDataJSON()).toEqual({ answers: delivered.map(question => ({ questionId: question.id, response: question.modelAnswer })) });
      const result = await graded.json();
      expect(result).toMatchObject({ score: 1, passed: true, complete: true });
      expect(result.answers).toHaveLength(10);
      await expect(main.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
      await expect(main.getByText("100%", { exact: true })).toBeVisible();
      await expect(main.getByText("Correct.", { exact: true })).toHaveCount(10);
      await main.getByRole("link", { name: "View completed course", exact: true }).click();
      await expect(page).toHaveURL(`/course/${fixture.courseId}`);
      await page.reload();
      await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
      await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", "100");

      const persisted = fixture.persisted();
      expect(persisted.attempts).toHaveLength(1);
      expect(persisted.attempts[0]).toMatchObject({ id: result.attemptId, score: 1, passed: true });
      expect(persisted.answers).toHaveLength(10);
      for (const question of cases) {
        expect(persisted.answers.find(answer => answer.questionId === question.id)).toMatchObject({ response: question.modelAnswer, score: 1 });
      }
      expect(persisted.chapter?.status).toBe("passed");
      expect(persisted.jobs).toEqual([]);
    } finally {
      // Stop page requests before removing only this fixture's UUID-owned rows.
      try { await page.close(); }
      finally { fixture.cleanup(); }
    }
  });
}
