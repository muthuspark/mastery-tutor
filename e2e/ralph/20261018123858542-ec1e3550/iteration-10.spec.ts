import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import path from "node:path";
import { questions } from "../../../lib/db/schema";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

test("shows literal submitted answers beside real quiz feedback at desktop and mobile widths", async ({ page, request }, testInfo) => {
  const fixture = preparedMcqFixture();
  try {
    const longAnswer = "Separate the variables before integrating both sides. ".repeat(12) + "x".repeat(180);
    const markupAnswer = '<strong>Separate variables</strong> <img src=x onerror="alert(1)"> <script>alert(1)</script> **answer**';
    const cases = fixture.questions.map((question, index) => {
      const options = [...question.options];
      const modelAnswer = index === 0 ? "2" : index === 1 ? longAnswer : index === 2 ? markupAnswer : question.modelAnswer;
      options[index % 4] = modelAnswer;
      // One wrong numeric response keeps this a passing quiz, avoiding fresh
      // generation while still showing the learner's choice versus the key.
      if (index === 0) options[1] = "0";
      return { ...question, options, modelAnswer, response: index === 0 ? "0" : modelAnswer, score: index === 0 ? 0 : 1 };
    });
    expect(isBalancedQuiz(cases), "Fixture must satisfy the real delivery quality gate").toBe(true);
    const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
    const databasePath = process.env.RALPH_TEST_DATABASE ?? path.join(process.cwd(), "data", configured ? path.basename(configured) : "tutor.db");
    const sqlite = new Database(databasePath, { fileMustExist: true });
    try {
      sqlite.pragma("foreign_keys = ON");
      sqlite.pragma("busy_timeout = 5000");
      const db = drizzle(sqlite);
      db.transaction(tx => {
        for (const question of cases) {
          const updated = tx.update(questions).set({ options: question.options, modelAnswer: question.modelAnswer })
            .where(and(eq(questions.id, question.id), eq(questions.chapterId, fixture.chapterId))).run();
          expect(updated.changes).toBe(1);
        }
      });
    } finally { sqlite.close(); }

    const visible = await request.get(`/api/courses/${fixture.courseId}`);
    expect(visible.status(), "Existing server must see the fixture; set RALPH_TEST_DATABASE if needed").toBe(200);
    const coursePath = `/course/${fixture.courseId}`;
    const delivered = [...cases].reverse();
    const delivery = page.waitForResponse(response => new URL(response.url()).pathname === `/api/chapters/${fixture.chapterId}/quiz` && response.request().method() === "GET");
    await page.goto(`${coursePath}/ch/0/quiz`);
    const quiz = await delivery;
    expect(quiz.status()).toBe(200);
    expect((await quiz.json()).questions.map((question: { id: string }) => question.id)).toEqual(delivered.map(question => question.id));
    for (const [index, question] of delivered.entries()) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
      const letter = String.fromCharCode(65 + question.options.indexOf(question.response));
      const option = page.getByRole("radio", { name: `${letter}. ${question.response}`, exact: true });
      await option.check();
      await expect(option).toBeChecked();
      if (index < delivered.length - 1) await page.getByRole("button", { name: "Next question", exact: true }).click();
    }
    // Neither quiz delivery nor grading is mocked.
    const submission = page.waitForResponse(response => new URL(response.url()).pathname === `/api/chapters/${fixture.chapterId}/attempts` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Submit answers", exact: true }).click();
    const graded = await submission;
    expect(graded.status()).toBe(200);
    const result = await graded.json();
    expect(result).toMatchObject({ score: 0.9, passed: true, complete: true });
    expect(result.answers).toHaveLength(10);
    await expect(page.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.getByText("Your answer:", { exact: true })).toHaveCount(10);

    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [index, question] of delivered.entries()) {
        const feedback = question.score === 1 ? "Correct." : "The expected answer is: 2.";
        expect(result.answers.find((answer: { questionId: string }) => answer.questionId === question.id))
          .toMatchObject({ response: question.response, modelAnswer: question.modelAnswer, score: question.score, feedback });
        // Scope by the rendered question paragraph so another answer's text
        // cannot accidentally satisfy the submitted-answer assertion.
        const row = main.getByText(`${index + 1}. ${question.prompt}`, { exact: true }).locator("..");
        const submitted = row.locator("p").filter({ has: page.getByText("Your answer:", { exact: true }) });
        await submitted.scrollIntoViewIfNeeded();
        await expect(submitted).toBeVisible();
        expect(await submitted.textContent()).toBe(`Your answer: ${question.response}`);
        await expect(row.getByText(feedback, { exact: true })).toBeVisible();
        const model = row.getByText(`Model answer: ${question.modelAnswer}`, { exact: true });
        await expect(model).toBeVisible();
        // Markup must stay literal in submitted answers, keys, and feedback.
        await expect(row.locator("img, script, strong")).toHaveCount(0);
        for (const paragraph of [submitted, model]) {
          const bounds = await paragraph.evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, client: element.clientWidth, scroll: element.scrollWidth, height: rect.height, line: parseFloat(getComputedStyle(element).lineHeight) };
          });
          expect(bounds.left).toBeGreaterThanOrEqual(0);
          expect(bounds.right).toBeLessThanOrEqual(width);
          expect(bounds.scroll).toBeLessThanOrEqual(bounds.client + 1);
          if (question.response === longAnswer) expect(bounds.height).toBeGreaterThan(bounds.line * 2);
        }
      }
      const longRow = main.getByText(`${delivered.findIndex(question => question.response === longAnswer) + 1}. ${cases[1].prompt}`, { exact: true }).locator("..");
      await longRow.scrollIntoViewIfNeeded();
      await testInfo.attach(`submitted-answer-feedback-${width}`, { body: await longRow.screenshot(), contentType: "image/png" });
    }

    const saved = fixture.persisted();
    expect(saved.attempts).toHaveLength(1);
    expect(saved.attempts[0]).toMatchObject({ id: result.attemptId, score: 0.9, passed: true });
    expect(saved.answers).toHaveLength(10);
    for (const question of cases) {
      expect(saved.answers.find(answer => answer.questionId === question.id)).toMatchObject({ response: question.response, score: question.score });
    }
    expect(saved.chapter?.status).toBe("passed");
    expect(saved.jobs).toEqual([]);
    // Feedback is component state; reopen the completed course to verify
    // stored answers and progress survive reload without resubmitting.
    await main.getByRole("link", { name: "← Back to course", exact: true }).click();
    await expect(page).toHaveURL(coursePath);
    await page.reload();
    await expect(page.getByText("You completed this course.", { exact: true })).toBeVisible();
    expect(fixture.persisted()).toEqual(saved);
  } finally { fixture.cleanup(); }
});
