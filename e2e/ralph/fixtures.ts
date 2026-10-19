import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import path from "node:path";
import * as schema from "../../lib/db/schema";

// Matches the app's database path resolution. Override when the existing server
// uses a different environment; the browser spec verifies fixture visibility.
export function preparedMcqFixture() {
  const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
  const databasePath = process.env.RALPH_TEST_DATABASE ?? path.join(process.cwd(), "data", configured ? path.basename(configured) : "tutor.db");
  const sqlite = new Database(databasePath, { fileMustExist: true });
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  const courseId = randomUUID(), chapterId = randomUUID();
  const now = new Date();
  const questions = Array.from({ length: 10 }, (_, index) => {
    const options = Array.from({ length: 4 }, (_, option) => `Fixture ${index + 1} option ${option + 1}`);
    return {
      id: randomUUID(), chapterId, type: "mcq" as const, prompt: `Ralph MCQ fixture ${index + 1}`,
      options, rubric: "Select the fixture's correct answer", modelAnswer: options[index % 4],
      conceptTag: `ralph-fixture-${index + 1}`, generationVersion: 1, isReview: false,
      createdAt: new Date(now.getTime() + index),
    };
  });
  try {
    db.transaction(tx => {
      tx.insert(schema.courses).values({ id: courseId, topic: `Ralph test-owned quiz ${courseId}`, startedAt: now, createdAt: now }).run();
      tx.insert(schema.chapters).values({
        id: chapterId, courseId, idx: 0, title: "Prepared deterministic quiz", objectives: ["Verify MCQ submission"],
        prerequisites: [], content: "Test-owned prepared lesson", summary: "Fixture", status: "open",
        contentGenerationStatus: "ready", contentGenerationVersion: 1,
        quizGenerationStatus: "ready", quizGenerationVersion: 1, generatedAt: now, createdAt: now,
      }).run();
      tx.insert(schema.questions).values(questions).run();
    });
  } catch (error) { sqlite.close(); throw error; }
  return {
    courseId, chapterId, questions,
    persisted() {
      const attempts = db.select().from(schema.attempts).where(eq(schema.attempts.chapterId, chapterId)).all();
      return {
        attempts,
        answers: attempts.length ? db.select().from(schema.answers).where(inArray(schema.answers.attemptId, attempts.map(attempt => attempt.id))).all() : [],
        chapter: db.select().from(schema.chapters).where(and(eq(schema.chapters.id, chapterId), eq(schema.chapters.courseId, courseId))).get(),
        jobs: db.select().from(schema.generationJobs).where(eq(schema.generationJobs.targetId, chapterId)).all(),
      };
    },
    cleanup() {
      try {
        db.transaction(tx => {
          tx.delete(schema.generationJobs).where(eq(schema.generationJobs.targetId, chapterId)).run();
          tx.delete(schema.courses).where(eq(schema.courses.id, courseId)).run();
        });
      } finally { sqlite.close(); }
    },
  };
}
