import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { questions, reviewItems } from "../../../lib/db/schema";
import { preparedMcqFixture } from "../fixtures";

test("withholds current and review answer keys while preserving real grading and progress", async ({ page, request }, testInfo) => {
  const fixture = preparedMcqFixture();
  try {
    const course = await request.get(`/api/courses/${fixture.courseId}`);
    expect(course.status(), "Fixture must be visible to the existing server; set RALPH_TEST_DATABASE if needed").toBe(200);

    // Add a due review source owned by this fixture. An older generation keeps
    // it outside the ten current questions, exercising the review append path.
    // The prepared fixture's course cascade also cleans up these rows.
    const review = {
      ...fixture.questions[0], id: randomUUID(), generationVersion: 0,
      prompt: "Ralph test-owned delayed review", conceptTag: randomUUID(),
      options: ["Review correct", "Review distractor", "Review alternative", "Review other"],
      modelAnswer: "Review correct", rubric: "Private review grading rule",
    };
    const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
    const databasePath = process.env.RALPH_TEST_DATABASE ?? path.join(process.cwd(), "data", configured ? path.basename(configured) : "tutor.db");
    const sqlite = new Database(databasePath, { fileMustExist: true });
    try {
      sqlite.pragma("foreign_keys = ON");
      sqlite.pragma("busy_timeout = 5000");
      const db = drizzle(sqlite);
      db.transaction(tx => {
        tx.insert(questions).values(review).run();
        tx.insert(reviewItems).values({
          id: randomUUID(), courseId: fixture.courseId, conceptTag: review.conceptTag,
          sourceQuestionId: review.id, dueAfterChapterIdx: 0, misses: 1, createdAt: new Date(),
        }).run();
      });
    } finally { sqlite.close(); }

    const expected = [
      ...[...fixture.questions].reverse(),
      { ...review, isReview: true },
    ];
    const quizPath = `/api/chapters/${fixture.chapterId}/quiz`;
    const isQuizResponse = (response: import("@playwright/test").Response) =>
      new URL(response.url()).pathname === quizPath && response.request().method() === "GET";
    const assertDelivery = async (response: import("@playwright/test").Response) => {
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.questions).toHaveLength(11);
      expect(body.questions).toEqual(expected.map(({ id, type, prompt, options, isReview }) => ({ id, type, prompt, options, isReview })));
      for (const delivered of body.questions) {
        expect(Object.keys(delivered).sort()).toEqual(["id", "isReview", "options", "prompt", "type"]);
        expect(delivered).not.toHaveProperty("modelAnswer");
        expect(delivered).not.toHaveProperty("rubric");
      }
      return body;
    };
    const initialDelivery = page.waitForResponse(isQuizResponse);
    await page.goto(`/course/${fixture.courseId}/ch/0/quiz`);
    const delivered = await assertDelivery(await initialDelivery);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(expected[0].prompt);
    await testInfo.attach("unanswered-quiz-delivery", { body: JSON.stringify(delivered, null, 2), contentType: "application/json" });

    const reloadedDelivery = page.waitForResponse(isQuizResponse);
    await page.reload();
    await assertDelivery(await reloadedDelivery);
    for (const [index, question] of expected.entries()) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
      await expect(page.getByRole("radio")).toHaveCount(4);
      await expect(page.getByText(/^Model answer:/)).toHaveCount(0);
      const correct = question.options.indexOf(question.modelAnswer);
      // Deliberately miss the review question to verify corrective feedback
      // still uses the stored key after its removal from the delivery response.
      const selected = question.isReview ? (correct + 1) % 4 : correct;
      await page.getByRole("radio", { name: `${String.fromCharCode(65 + selected)}. ${question.options[selected]}`, exact: true }).check();
      if (index < expected.length - 1) {
        await page.getByRole("button", { name: "Next question", exact: true }).click();
      } else {
        const submission = page.waitForResponse(response =>
          new URL(response.url()).pathname === `/api/chapters/${fixture.chapterId}/attempts` && response.request().method() === "POST");
        await page.getByRole("button", { name: "Submit answers", exact: true }).click();
        const response = await submission;
        expect(response.status()).toBe(200);
        const result = await response.json();
        expect(result).toMatchObject({ passed: true, complete: true, score: 10 / 11 });
        expect(result.answers).toHaveLength(11);
        for (const stored of expected) {
          expect(result.answers.find((answer: { questionId: string }) => answer.questionId === stored.id))
            .toMatchObject({ modelAnswer: stored.modelAnswer, score: stored.isReview ? 0 : 1 });
        }
      }
    }

    await expect(page.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
    await expect(page.getByText("91%", { exact: true })).toBeVisible();
    await expect(page.getByText("Correct.", { exact: true })).toHaveCount(10);
    await expect(page.getByText(`The expected answer is: ${review.modelAnswer}.`, { exact: true })).toBeVisible();
    for (const question of expected) {
      await expect(page.getByText(`Model answer: ${question.modelAnswer}`, { exact: true })).toBeVisible();
    }
    await testInfo.attach("graded-current-and-review-quiz", { body: await page.screenshot(), contentType: "image/png" });

    await page.getByRole("link", { name: "← Back to course", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuenow", "100");
    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuetext", "1 of 1 chapters mastered");
    await expect(page.getByText("You completed this course.", { exact: true })).toBeVisible();
    const persisted = fixture.persisted();
    expect(persisted.attempts).toMatchObject([{ score: 10 / 11, passed: true }]);
    expect(persisted.answers).toHaveLength(11);
    for (const question of expected) {
      const selected = question.isReview ? review.options[1] : question.modelAnswer;
      expect(persisted.answers.find(answer => answer.questionId === question.id))
        .toMatchObject({ response: selected, score: question.isReview ? 0 : 1 });
    }
    expect(persisted.chapter?.status).toBe("passed");
    expect(persisted.jobs).toEqual([]);
  } finally { fixture.cleanup(); }
});
