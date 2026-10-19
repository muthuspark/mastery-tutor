import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import path from "node:path";
import { questions } from "../../../lib/db/schema";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

// Legacy indices and normalized submissions are covered by lib/quiz.test.ts.
// The browser submits literal option text through the unmocked grading API.
test("grades numeric option text and preserves the actual answers and course progress", async ({ page, request }, testInfo) => {
  const fixture = preparedMcqFixture();
  try {
    const course = await request.get(`/api/courses/${fixture.courseId}`);
    expect(course.status(), "Fixture must be visible to the existing server; set RALPH_TEST_DATABASE if needed").toBe(200);

    const numericOptions = ["2", "3", "0", "1"];
    const cases = fixture.questions.map((question, index) => {
      const options = index < 5 ? numericOptions
        : index < 9 ? [["2x + 1", "1/2", "0.5", "3 squared"][index - 5], "Alpha", "Beta", "Gamma"]
          : ["Ordinary text", "Another answer", "Other", "None"];
      const modelAnswer = index < 4 ? numericOptions[index] : options[0];
      // Selecting "0" is wrong when the answer is "2"; the old index parser
      // incorrectly awarded credit by interpreting "0" as options[0].
      const response = index === 4 ? "0" : modelAnswer;
      // Keep the numeric regression options unchanged. Place the remaining
      // answers at 1, 2, 3, 0, 1 so the real quiz quality gate accepts the fixture.
      if (index >= 5) {
        options.splice(0, 1);
        options.splice(index % 4, 0, modelAnswer);
      }
      return { ...question, options, modelAnswer, response, score: index === 4 ? 0 : 1 };
    });
    expect(isBalancedQuiz(cases), "Prepared questions must pass the real quiz quality gate").toBe(true);

    // Update only this fixture's UUID-scoped questions. Its finally cleanup
    // removes the course and all dependent rows, even after assertion failures.
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

    // Cached questions are delivered newest first, as in the existing specs.
    const delivered = [...cases].reverse();
    const delivery = page.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/chapters/${fixture.chapterId}/quiz` && response.request().method() === "GET");
    await page.goto(`/course/${fixture.courseId}/ch/0/quiz`);
    const quizResponse = await delivery;
    expect(quizResponse.status()).toBe(200);
    expect(await quizResponse.json()).toEqual({
      questions: delivered.map(({ id, type, prompt, options, isReview }) => ({ id, type, prompt, options, isReview })),
    });
    for (const [index, question] of delivered.entries()) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
      await expect(page.getByRole("radio")).toHaveCount(4);
      const selected = question.options.indexOf(question.response);
      const radio = page.getByRole("radio", {
        name: `${String.fromCharCode(65 + selected)}. ${question.response}`, exact: true,
      });
      await radio.check();
      await expect(radio).toBeChecked();
      if (index < delivered.length - 1) {
        await page.getByRole("button", { name: "Next question", exact: true }).click();
      }
    }

    const submission = page.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/chapters/${fixture.chapterId}/attempts` && response.request().method() === "POST");
    await page.getByRole("button", { name: "Submit answers", exact: true }).click();
    const response = await submission;
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ score: 0.9, passed: true, complete: true });
    expect(result.answers).toHaveLength(10);
    for (const question of cases) {
      expect(result.answers.find((answer: { questionId: string }) => answer.questionId === question.id))
        .toMatchObject({ response: question.response, modelAnswer: question.modelAnswer, score: question.score });
    }

    await expect(page.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
    await expect(page.getByText("90%", { exact: true })).toBeVisible();
    await expect(page.getByText("Correct.", { exact: true })).toHaveCount(9);
    await expect(page.getByText("The expected answer is: 2.", { exact: true })).toBeVisible();
    await testInfo.attach("numeric-option-graded-result", { body: await page.screenshot(), contentType: "image/png" });

    await page.getByRole("link", { name: "← Back to course", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuenow", "100");
    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuetext", "1 of 1 chapters mastered");
    await expect(page.getByText("You completed this course.", { exact: true })).toBeVisible();

    const persisted = fixture.persisted();
    expect(persisted.attempts).toHaveLength(1);
    expect(persisted.attempts[0]).toMatchObject({ id: result.attemptId, score: 0.9, passed: true });
    expect(persisted.answers).toHaveLength(10);
    for (const question of cases) {
      expect(persisted.answers.find(answer => answer.questionId === question.id))
        .toMatchObject({ response: question.response, score: question.score });
    }
    expect(persisted.chapter?.status).toBe("passed");
    expect(persisted.jobs).toEqual([]);
    await testInfo.attach("numeric-option-persisted-evidence", { body: JSON.stringify(persisted, null, 2), contentType: "application/json" });
  } finally { fixture.cleanup(); }
});
