import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import path from "node:path";
import * as schema from "../../../lib/db/schema";
import { preparedMcqFixture } from "../fixtures";

for (const incorrect of [2, 3, 0]) {
  test(`${10 - incorrect}/10 retains the result and records only missed concepts for later review`, async ({ page, request }, testInfo) => {
    const fixture = preparedMcqFixture();
    let sqlite: Database.Database | undefined;
    const nextId = randomUUID();
    try {
      const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
      const databasePath = process.env.RALPH_TEST_DATABASE ?? path.join(process.cwd(), "data", configured ? path.basename(configured) : "tutor.db");
      sqlite = new Database(databasePath, { fileMustExist: true });
      sqlite.pragma("foreign_keys = ON");
      sqlite.pragma("busy_timeout = 5000");
      const db = drizzle(sqlite, { schema });
      const now = new Date();
      // Prepare a later quiz in this course, including its lesson and generation
      // job. No generated content or paid agent execution is needed. It starts
      // open so the failed-attempt scenario can also inspect its due reviews.
      db.transaction(tx => {
        tx.insert(schema.chapters).values({
          ...fixture.persisted().chapter!, id: nextId, idx: 1, title: "Prepared review lesson",
          status: "open", prerequisites: [], content: "Test-owned prepared review lesson",
        }).run();
        tx.insert(schema.questions).values(fixture.questions.map(question => ({
          ...question, id: randomUUID(), chapterId: nextId,
          prompt: `Later ${question.prompt}`, conceptTag: `later-${question.conceptTag}`,
        }))).run();
        tx.insert(schema.generationJobs).values({
          id: randomUUID(), artifactType: "chapter", targetId: nextId,
          generationVersion: 1, status: "completed", nextRunAt: now, createdAt: now, updatedAt: now,
        }).run();
      });
      const coursePath = `/course/${fixture.courseId}`;
      const visible = await request.get(`/api/courses/${fixture.courseId}`);
      expect(visible.status(), "The existing server must see the fixture database; set RALPH_TEST_DATABASE if needed").toBe(200);
      const delivered = [...fixture.questions].reverse();
      const missed = delivered.slice(0, incorrect);
      const responses = delivered.map((question, index) => ({
        questionId: question.id,
        response: index < incorrect ? question.options.find(option => option !== question.modelAnswer)! : question.modelAnswer,
      }));
      await page.goto(`${coursePath}/ch/0/quiz`);
      for (const [index, question] of delivered.entries()) {
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
        const selected = responses[index].response;
        const letter = String.fromCharCode(65 + question.options.indexOf(selected));
        await page.getByRole("radio", { name: `${letter}. ${selected}`, exact: true }).check();
        if (index < delivered.length - 1) await page.getByRole("button", { name: "Next question", exact: true }).click();
      }
      const attemptsPath = `/api/chapters/${fixture.chapterId}/attempts`;
      const [response] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === attemptsPath && response.request().method() === "POST"),
        page.getByRole("button", { name: "Submit answers", exact: true }).click(),
      ]);
      expect(response.status()).toBe(200);
      const result = await response.json();
      const passed = incorrect <= 2;
      const score = (10 - incorrect) / 10;
      expect(result).toMatchObject({ score, passed });
      expect(result.answers).toHaveLength(10);
      expect(result.answers.filter((answer: { missedConcept: string | null }) => answer.missedConcept)
        .map((answer: { missedConcept: string }) => answer.missedConcept).sort()).toEqual(missed.map(question => question.conceptTag).sort());
      await expect(page.getByRole("heading", { name: passed ? "Chapter complete" : "Keep going", exact: true })).toBeVisible();
      await expect(page.getByText(`${Math.round(score * 100)}%`, { exact: true })).toBeVisible();
      for (const question of missed) {
        await expect(page.getByText(`The expected answer is: ${question.modelAnswer}.`, { exact: true })).toBeVisible();
      }
      await testInfo.attach("graded-quiz", { body: await page.screenshot(), contentType: "image/png" });
      const gaps = () => db.select().from(schema.reviewItems).where(eq(schema.reviewItems.courseId, fixture.courseId)).all();
      const initialGaps = gaps();
      expect(initialGaps).toHaveLength(incorrect);
      expect(initialGaps).toEqual(expect.arrayContaining(missed.map(question => expect.objectContaining({
        courseId: fixture.courseId, conceptTag: question.conceptTag,
        sourceQuestionId: question.id, misses: 1, dueAfterChapterIdx: 1,
      }))));
      const saved = fixture.persisted();
      expect(saved.attempts).toHaveLength(1);
      expect(saved.attempts[0]).toMatchObject({ id: result.attemptId, score, passed });
      expect(saved.answers).toHaveLength(10);
      expect(saved.chapter?.status).toBe(passed ? "passed" : "open");

      await page.goto(coursePath);
      await page.reload();
      await expect(page.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuetext", `${passed ? 1 : 0} of 2 chapters mastered`);
      const reviewPath = `/api/chapters/${nextId}/quiz`;
      const laterResponse = await request.get(reviewPath);
      expect(laterResponse.status()).toBe(200);
      const later = await laterResponse.json();
      const reviews = later.questions.filter((question: { isReview: boolean }) => question.isReview) as { id: string; prompt: string }[];
      // Delivery intentionally caps due reviews at two, even when three were saved.
      expect(reviews).toHaveLength(Math.min(incorrect, 2));
      expect(reviews.every(question => missed.some(miss => miss.id === question.id))).toBe(true);
      await page.goto(`${coursePath}/ch/1/quiz`);
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Later ${delivered[0].prompt}`);
      await expect(page.getByText(`1 / ${10 + reviews.length}`, { exact: true })).toBeVisible();
      if (reviews.length) {
        // Reach the actual persisted review prompts through the learner UI.
        for (let index = 0; index < 10; index++) await page.getByRole("button", { name: "Next question", exact: true }).click();
        const seen: string[] = [];
        for (let index = 0; index < reviews.length; index++) {
          const prompt = await page.getByRole("heading", { level: 1 }).innerText();
          expect(reviews.map(question => question.prompt)).toContain(prompt);
          seen.push(prompt);
          if (index < reviews.length - 1) await page.getByRole("button", { name: "Next question", exact: true }).click();
        }
        expect(new Set(seen).size).toBe(reviews.length);
        await testInfo.attach("persisted-review-question", { body: await page.screenshot(), contentType: "image/png" });
      }
      expect(gaps()).toEqual(initialGaps);

      if (incorrect === 2) {
        // Reuse the real grading endpoint without reloading a failed quiz (which
        // would request paid generation). Repeated concept misses update rows.
        const repeat = await request.post(attemptsPath, { data: { answers: responses } });
        expect(repeat.status()).toBe(200);
        expect(await repeat.json()).toMatchObject({ score: 0.8, passed: true });
        expect(gaps()).toEqual(initialGaps.map(gap => ({ ...gap, misses: 2, dueAfterChapterIdx: 2 })));
        const repeatedGaps = gaps();
        const correct = await request.post(attemptsPath, { data: { answers: delivered.map(question => ({ questionId: question.id, response: question.modelAnswer })) } });
        expect(correct.status()).toBe(200);
        expect(await correct.json()).toMatchObject({ score: 1, passed: true });
        expect(gaps()).toEqual(repeatedGaps);
        expect(fixture.persisted().attempts).toHaveLength(3);
      }
    } finally {
      try {
        if (sqlite) drizzle(sqlite, { schema }).delete(schema.generationJobs).where(eq(schema.generationJobs.targetId, nextId)).run();
      } finally {
        sqlite?.close();
        fixture.cleanup();
      }
    }
  });
}
