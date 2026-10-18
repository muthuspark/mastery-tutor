import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import path from "node:path";
import * as schema from "../../../lib/db/schema";
import { preparedMcqFixture } from "../fixtures";

const scenarios = [
  { name: "final chapter offers the completed course", kind: "final", action: "View completed course" },
  { name: "intermediate chapter continues to the server's next chapter", kind: "intermediate", action: "Continue" },
  { name: "passing without an available next chapter returns to the course", kind: "fallback", action: "Back to course" },
] as const;

for (const scenario of scenarios) {
  test(scenario.name, async ({ page, request }, testInfo) => {
    const fixture = preparedMcqFixture();
    let extraSqlite: Database.Database | undefined;
    let extraChapterId: string | undefined;
    try {
      if (scenario.kind !== "final") {
        // Extend only this fixture's course. Resolve the same database as the shared helper.
        const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
        const databasePath = process.env.RALPH_TEST_DATABASE ?? path.join(process.cwd(), "data", configured ? path.basename(configured) : "tutor.db");
        extraSqlite = new Database(databasePath, { fileMustExist: true });
        extraSqlite.pragma("foreign_keys = ON");
        extraSqlite.pragma("busy_timeout = 5000");
        const db = drizzle(extraSqlite, { schema });
        const chapter = fixture.persisted().chapter!;
        extraChapterId = randomUUID();
        const now = new Date();
        db.transaction(tx => {
          tx.insert(schema.chapters).values({
            ...chapter, id: extraChapterId!, idx: scenario.kind === "intermediate" ? 1 : 2,
            title: "Prepared next lesson", prerequisites: [0], status: "locked",
            content: "# Prepared next lesson\n\nTest-owned follow-up lesson.",
          }).run();
          tx.insert(schema.questions).values(fixture.questions.map(question => ({
            ...question, id: randomUUID(), chapterId: extraChapterId!,
          }))).run();
          // The artifact is already prepared. A completed job prevents the real
          // submission's enqueue from causing paid generation in the host worker.
          tx.insert(schema.generationJobs).values({
            id: randomUUID(), artifactType: "chapter", targetId: extraChapterId!,
            generationVersion: 1, status: "completed", nextRunAt: now, createdAt: now, updatedAt: now,
          }).run();
        });
      }

      const coursePath = `/course/${fixture.courseId}`;
      const visibleFixture = await request.get(`/api/courses/${fixture.courseId}`);
      expect(visibleFixture.status(), "Fixture must be visible to the existing server; set RALPH_TEST_DATABASE if needed").toBe(200);
      await page.goto(`${coursePath}/ch/0/quiz`);
      // Match the real quiz endpoint's newest-first ordering, as in iteration 4.
      const delivered = [...fixture.questions].reverse();
      for (const [index, question] of delivered.entries()) {
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
        const letter = String.fromCharCode(65 + question.options.indexOf(question.modelAnswer));
        await page.getByRole("radio", { name: `${letter}. ${question.modelAnswer}`, exact: true }).check();
        if (index < delivered.length - 1) {
          await page.getByRole("button", { name: "Next question", exact: true }).click();
        }
      }
      const attemptsPath = `/api/chapters/${fixture.chapterId}/attempts`;
      const [response] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === attemptsPath && response.request().method() === "POST"),
        page.getByRole("button", { name: "Submit answers", exact: true }).click(),
      ]);
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result).toMatchObject({
        score: 1, passed: true, complete: scenario.kind === "final",
        nextChapterIdx: scenario.kind === "intermediate" ? 1 : null,
      });
      expect(result.answers).toHaveLength(10);
      await expect(page.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
      await expect(page.getByText("100%", { exact: true })).toBeVisible();
      const action = page.getByRole("link", { name: scenario.action, exact: true });
      const destination = scenario.kind === "intermediate" ? `${coursePath}/ch/${result.nextChapterIdx}` : coursePath;
      await expect(action).toHaveAttribute("href", destination);
      if (scenario.kind !== "intermediate") {
        await expect(page.getByRole("link", { name: "Continue", exact: true })).toHaveCount(0);
      }
      await testInfo.attach("quiz-result-action", { body: await page.screenshot(), contentType: "image/png" });
      await action.click();
      await expect(page).toHaveURL(destination);

      if (scenario.kind === "intermediate") {
        await expect(page.getByRole("heading", { name: "Prepared next lesson", exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "Check your understanding →", exact: true })).toBeVisible();
        await page.reload();
        await expect(page.getByRole("heading", { name: "Prepared next lesson", exact: true })).toBeVisible();
        await page.getByRole("link", { name: "← Back to course", exact: true }).click();
        await expect(page).toHaveURL(coursePath);
      }
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Ralph test-owned quiz ${fixture.courseId}`);
      const mastery = page.getByRole("progressbar", { name: "Course mastery" });
      const total = scenario.kind === "final" ? 1 : 2;
      await expect(mastery).toHaveAttribute("aria-valuetext", `1 of ${total} chapters mastered`);
      await page.reload();
      await expect(mastery).toHaveAttribute("aria-valuenow", scenario.kind === "final" ? "100" : "50");
      await expect(mastery).toHaveAttribute("aria-valuetext", `1 of ${total} chapters mastered`);
      if (scenario.kind === "final") {
        await expect(page.getByText("You completed this course.", { exact: true })).toBeVisible();
      } else {
        await expect(page.getByText("You completed this course.", { exact: true })).toHaveCount(0);
        if (scenario.kind === "intermediate") {
          await expect(page.getByRole("link", { name: "Prepared next lesson Continue →", exact: true })).toBeVisible();
        } else {
          await expect(page.getByRole("listitem").filter({ hasText: "Prepared next lesson" })).toContainText("Locked");
        }
      }
      const persisted = fixture.persisted();
      expect(persisted.attempts).toHaveLength(1);
      expect(persisted.attempts[0]).toMatchObject({ id: result.attemptId, score: 1, passed: true });
      expect(persisted.answers).toHaveLength(10);
      expect(persisted.chapter?.status).toBe("passed");
      const savedCourse = await request.get(`/api/courses/${fixture.courseId}`);
      expect(savedCourse.status()).toBe(200);
      const saved = await savedCourse.json();
      expect(Boolean(saved.course.completedAt)).toBe(scenario.kind === "final");
      if (extraChapterId) {
        expect(saved.chapters.find((chapter: { id: string }) => chapter.id === extraChapterId).status)
          .toBe(scenario.kind === "intermediate" ? "open" : "locked");
      }
      await testInfo.attach("persisted-destination", { body: await page.screenshot(), contentType: "image/png" });
    } finally {
      // Extra generation jobs have no FK cascade; delete only our extra target.
      try {
        if (extraSqlite && extraChapterId) {
          drizzle(extraSqlite, { schema }).delete(schema.generationJobs).where(eq(schema.generationJobs.targetId, extraChapterId)).run();
        }
      } finally {
        extraSqlite?.close();
        fixture.cleanup();
      }
    }
  });
}
