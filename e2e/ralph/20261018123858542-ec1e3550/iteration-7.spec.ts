import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import path from "node:path";
import * as schema from "../../../lib/db/schema";
import { preparedMcqFixture } from "../fixtures";

test("keyboard rereading a completed lesson preserves completion and all learning evidence", async ({ page, request }, testInfo) => {
  const fixture = preparedMcqFixture();
  let sqlite: Database.Database | undefined;
  try {
    const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
    const databasePath = process.env.RALPH_TEST_DATABASE ?? path.join(process.cwd(), "data", configured ? path.basename(configured) : "tutor.db");
    sqlite = new Database(databasePath, { fileMustExist: true });
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
    const db = drizzle(sqlite, { schema });
    const coursePath = `/course/${fixture.courseId}`;
    const lessonPath = `${coursePath}/ch/0`;
    const visible = await request.get(`/api/courses/${fixture.courseId}`);
    expect(visible.status(), "The existing server must see the fixture database; set RALPH_TEST_DATABASE if needed").toBe(200);

    // Complete the real prepared quiz with two misses, so preservation checks
    // cover nonempty attempts, answers, questions, and scheduled review items.
    await page.goto(`${lessonPath}/quiz`);
    const delivered = [...fixture.questions].reverse();
    for (const [index, question] of delivered.entries()) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
      const selected = index < 2
        ? question.options.find(option => option !== question.modelAnswer)!
        : question.modelAnswer;
      const letter = String.fromCharCode(65 + question.options.indexOf(selected));
      await page.getByRole("radio", { name: `${letter}. ${selected}`, exact: true }).check();
      if (index < delivered.length - 1) {
        await page.getByRole("button", { name: "Next question", exact: true }).click();
      }
    }
    const attemptsPath = `/api/chapters/${fixture.chapterId}/attempts`;
    const [graded] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === attemptsPath && response.request().method() === "POST"),
      page.getByRole("button", { name: "Submit answers", exact: true }).click(),
    ]);
    expect(graded.status()).toBe(200);
    const result = await graded.json();
    expect(result).toMatchObject({ score: 0.8, passed: true, complete: true, nextChapterIdx: null });
    await expect(page.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
    await expect(page.getByText("80%", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View completed course", exact: true }).click();
    await expect(page).toHaveURL(coursePath);

    const snapshot = () => ({
      ...fixture.persisted(),
      course: db.select().from(schema.courses).where(eq(schema.courses.id, fixture.courseId)).get(),
      questions: db.select().from(schema.questions).where(eq(schema.questions.chapterId, fixture.chapterId)).orderBy(schema.questions.id).all(),
      reviews: db.select().from(schema.reviewItems).where(eq(schema.reviewItems.courseId, fixture.courseId)).orderBy(schema.reviewItems.id).all(),
    });
    const before = snapshot();
    expect(before.chapter?.status).toBe("passed");
    expect(before.course?.completedAt).toBeInstanceOf(Date);
    expect(before.attempts).toHaveLength(1);
    expect(before.attempts[0]).toMatchObject({ id: result.attemptId, score: 0.8, passed: true });
    expect(before.answers).toHaveLength(10);
    expect(before.questions).toHaveLength(10);
    expect(before.reviews).toHaveLength(2);
    expect(before.reviews.map(review => review.sourceQuestionId).sort()).toEqual(delivered.slice(0, 2).map(question => question.id).sort());

    const assertCompletedCourse = async () => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Ralph test-owned quiz ${fixture.courseId}`);
      const mastery = page.getByRole("progressbar", { name: "Course mastery", exact: true });
      await expect(mastery).toHaveAttribute("aria-valuenow", "100");
      await expect(mastery).toHaveAttribute("aria-valuetext", "1 of 1 chapters mastered");
      await expect(page.getByText("You completed this course.", { exact: true })).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: "Prepared deterministic quiz" })).toContainText("Mastered");
    };
    await assertCompletedCourse();
    const readLesson = page.getByRole("link", { name: "Read lesson → Prepared deterministic quiz", exact: true });
    await expect(readLesson).toBeVisible();
    await expect(readLesson).toHaveAttribute("href", lessonPath);
    // Use keyboard activation of the dedicated reading action, rather than
    // the chapter row's destructive Revisit dialog.
    await readLesson.focus();
    await expect(readLesson).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(lessonPath);
    await expect(page.getByRole("main")).toContainText("Test-owned prepared lesson");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(snapshot()).toEqual(before);
    await page.reload();
    await expect(page.getByRole("main")).toContainText("Test-owned prepared lesson");
    expect(snapshot()).toEqual(before);
    await testInfo.attach("completed-lesson-reread", { body: await page.screenshot(), contentType: "image/png" });

    await page.getByRole("link", { name: "← Back to course", exact: true }).click();
    await expect(page).toHaveURL(coursePath);
    await assertCompletedCourse();
    await page.reload();
    await assertCompletedCourse();
    await expect(readLesson).toBeVisible();
    expect(snapshot()).toEqual(before);
    const saved = await request.get(`/api/courses/${fixture.courseId}`);
    expect(saved.status()).toBe(200);
    const savedCourse = await saved.json();
    expect(savedCourse.course.completedAt).toBe(before.course!.completedAt!.toISOString());
    expect(savedCourse.progress).toEqual({ passed: 1, total: 1 });
    expect(savedCourse.chapters[0]).toMatchObject({ id: fixture.chapterId, status: "passed" });
    await testInfo.attach("completed-course-after-rereading", { body: await page.screenshot(), contentType: "image/png" });
  } finally {
    sqlite?.close();
    fixture.cleanup();
  }
});
