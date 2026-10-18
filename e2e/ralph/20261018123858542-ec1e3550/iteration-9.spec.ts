import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import path from "node:path";
import * as schema from "../../../lib/db/schema";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

for (const incorrect of [1, 4]) {
  const passed = incorrect === 1;
  test(passed ? "passing with a concept gap explains the limits of mastery" : "failing with repeated concept tags shows unique gaps and remediation", async ({ page, request }, testInfo) => {
    const fixture = preparedMcqFixture();
    let sqlite: Database.Database | undefined;
    try {
      const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
      const databasePath = process.env.RALPH_TEST_DATABASE ?? path.join(process.cwd(), "data", configured ? path.basename(configured) : "tutor.db");
      sqlite = new Database(databasePath, { fileMustExist: true });
      sqlite.pragma("foreign_keys = ON");
      sqlite.pragma("busy_timeout = 5000");
      const db = drizzle(sqlite, { schema });
      // Change only test-owned concept tags; retain the balanced prepared keys.
      const delivered = [...fixture.questions].reverse().map((question, index) => ({
        ...question,
        conceptTag: index < 2 ? "Separation of variables" : index < 4 ? "Initial conditions" : question.conceptTag,
      }));
      expect(isBalancedQuiz(delivered), "Prepared questions must pass the real quiz quality gate").toBe(true);
      db.transaction(tx => {
        for (const question of delivered) {
          const updated = tx.update(schema.questions).set({ conceptTag: question.conceptTag })
            .where(and(eq(schema.questions.id, question.id), eq(schema.questions.chapterId, fixture.chapterId))).run();
          expect(updated.changes).toBe(1);
        }
      });
      const coursePath = `/course/${fixture.courseId}`;
      const lessonPath = `${coursePath}/ch/0`;
      const visible = await request.get(`/api/courses/${fixture.courseId}`);
      expect(visible.status(), "The existing server must see the fixture database; set RALPH_TEST_DATABASE if needed").toBe(200);
      const delivery = page.waitForResponse(response => new URL(response.url()).pathname === `/api/chapters/${fixture.chapterId}/quiz` && response.request().method() === "GET");
      await page.goto(`${lessonPath}/quiz`);
      const quiz = await delivery;
      expect(quiz.status()).toBe(200);
      expect((await quiz.json()).questions.map((question: { id: string }) => question.id)).toEqual(delivered.map(question => question.id));
      for (const [index, question] of delivered.entries()) {
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
        const selected = index < incorrect ? question.options.find(option => option !== question.modelAnswer)! : question.modelAnswer;
        const letter = String.fromCharCode(65 + question.options.indexOf(selected));
        await page.getByRole("radio", { name: `${letter}. ${selected}`, exact: true }).check();
        if (index < delivered.length - 1) await page.getByRole("button", { name: "Next question", exact: true }).click();
      }
      const [graded] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === `/api/chapters/${fixture.chapterId}/attempts` && response.request().method() === "POST"),
        page.getByRole("button", { name: "Submit answers", exact: true }).click(),
      ]);
      expect(graded.status()).toBe(200);
      const result = await graded.json();
      const score = (10 - incorrect) / 10;
      expect(result).toMatchObject({ score, passed });
      expect(result.answers).toHaveLength(10);
      expect(result.answers.filter((answer: { missedConcept: string | null }) => answer.missedConcept)
        .map((answer: { missedConcept: string }) => answer.missedConcept)).toEqual(delivered.slice(0, incorrect).map(question => question.conceptTag));
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { name: passed ? "Chapter complete" : "Keep going", exact: true })).toBeVisible();
      await expect(main.getByText(`${score * 100}%`, { exact: true })).toBeVisible();
      const concepts = main.getByRole("region", { name: "Concepts to revisit", exact: true });
      await expect(concepts).toBeVisible();
      await expect(concepts.getByRole("listitem")).toHaveText(passed ? ["Separation of variables"] : ["Separation of variables", "Initial conditions"]);
      if (passed) {
        await expect(main.getByText("You passed this assessment. Durable mastery needs evidence from later recall and unfamiliar problems.", { exact: true })).toBeVisible();
        await expect(concepts).toContainText("Your score passes, but this attempt still shows gaps. Review these concepts in the chapter:");
        await expect(main.getByRole("region", { name: "Before trying again", exact: true })).toHaveCount(0);
        expect(result.remediation).toBeNull();
      } else {
        await expect(concepts).toContainText("This attempt shows gaps in these concepts:");
        const remediation = "Review these concepts before trying again: Separation of variables, Initial conditions.";
        expect(result.remediation).toBe(remediation);
        await expect(main.getByRole("region", { name: "Before trying again", exact: true }).getByText(remediation, { exact: true })).toBeVisible();
        await expect(main.getByRole("link", { name: "Try again", exact: true })).toHaveAttribute("href", `${lessonPath}/quiz`);
      }
      const review = main.getByRole("link", { name: "Review chapter", exact: true });
      await expect(review).toBeVisible();
      await expect(review).toHaveAttribute("href", lessonPath);
      await testInfo.attach("concept-guidance-result", { body: await page.screenshot(), contentType: "image/png" });

      const snapshot = () => ({
        ...fixture.persisted(),
        reviews: db.select().from(schema.reviewItems).where(eq(schema.reviewItems.courseId, fixture.courseId)).orderBy(schema.reviewItems.id).all(),
      });
      const saved = snapshot();
      expect(saved.attempts).toHaveLength(1);
      expect(saved.attempts[0]).toMatchObject({ id: result.attemptId, score, passed });
      expect(saved.answers).toHaveLength(10);
      expect(saved.answers.filter(answer => answer.score === 0).map(answer => answer.questionId).sort()).toEqual(delivered.slice(0, incorrect).map(question => question.id).sort());
      expect(saved.reviews.map(item => item.conceptTag).sort()).toEqual(passed ? ["Separation of variables"] : ["Initial conditions", "Separation of variables"]);
      expect(saved.reviews.find(item => item.conceptTag === "Separation of variables")?.misses).toBe(passed ? 1 : 2);
      expect(saved.chapter?.status).toBe(passed ? "passed" : "open");
      // The real quiz delivery and submission above must remain unmocked.
      // An open lesson prefetches a fresh quiz after a failed attempt, including
      // on reload. Keep that background generation outside this persistence
      // check so it cannot start an agent job or outlive fixture cleanup.
      if (!passed) {
        await page.route(`**/api/chapters/${fixture.chapterId}/quiz`, async route => {
          expect(route.request().method()).toBe("GET");
          await route.fulfill({ status: 202, json: { status: "generating", retryable: true } });
        });
      }
      // Results are local component state, so verify persisted evidence by
      // reopening and reloading the review lesson.
      await review.click();
      await expect(page).toHaveURL(lessonPath);
      await expect(page.getByRole("main")).toContainText("Test-owned prepared lesson");
      await page.reload();
      await expect(page.getByRole("main")).toContainText("Test-owned prepared lesson");
      expect(snapshot()).toEqual(saved);
    } finally {
      sqlite?.close();
      fixture.cleanup();
    }
  });
}
