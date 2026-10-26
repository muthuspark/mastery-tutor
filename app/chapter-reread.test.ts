vi.mock("@/lib/access", () => ({ authorize: async () => ({ user: { id: "test-user" } }) }));
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  db.run("INSERT OR IGNORE INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('test-user','','test@example.com',1,1,1)");
  return { db };
});
vi.mock("@/lib/agent", () => ({ agentForRequest: vi.fn() }));
vi.mock("@/lib/generation-worker", () => ({ processGenerationJob: vi.fn() }));
vi.mock("@/lib/chapter", () => ({ generateChapterContent: vi.fn() }));
// Markdown rendering has separate coverage; this test checks storage invariants.
vi.mock("@/lib/markdown", () => ({ renderMarkdown: vi.fn(async (content: string) => `<article>${content}</article>`) }));

import { GET as readChapter } from "@/app/api/chapters/[id]/route";
import { GET as readCourse } from "@/app/api/courses/[id]/route";
import { agentForRequest } from "@/lib/agent";
import { processGenerationJob } from "@/lib/generation-worker";
import { generateChapterContent } from "@/lib/chapter";
import { db } from "@/lib/db";
import { answers, attempts, chapters, courses, generationJobs, questions, reviewItems } from "@/lib/db/schema";

it("rereads a completed lesson and returns to the course without changing persisted evidence", async () => {
  vi.mocked(agentForRequest).mockRejectedValue(new Error("Saved agent unavailable"));
  // All records are in this test's isolated, migrated in-memory database.
  const now = new Date();
  db.insert(courses).values({ userId: "test-user", id: "course", topic: "Differential equations", completedAt: now, createdAt: now }).run();
  db.insert(chapters).values({ id: "chapter", courseId: "course", idx: 0, title: "Separation", objectives: [], prerequisites: [],
    status: "passed", content: "# Separation\n\nThe saved lesson.", contentGenerationStatus: "ready", generatedAt: now, createdAt: now }).run();
  // A legacy short-answer question proves reading does not require rebuilding
  // an assessment to match the current MCQ-only delivery policy.
  db.insert(questions).values({ id: "question", chapterId: "chapter", type: "short", prompt: "Solve y' = y",
    rubric: "Exponential", modelAnswer: "y = Ce^x", conceptTag: "separation", createdAt: now }).run();
  db.insert(attempts).values({ id: "attempt", chapterId: "chapter", attemptNo: 1, score: 0.8, passed: true, createdAt: now }).run();
  db.insert(answers).values({ id: "answer", attemptId: "attempt", questionId: "question", response: "Ce^x",
    score: 0.8, feedback: "Include the dependent variable", createdAt: now }).run();
  db.insert(reviewItems).values({ id: "review", courseId: "course", conceptTag: "separation", sourceQuestionId: "question",
    misses: 1, dueAfterChapterIdx: 1, createdAt: now }).run();
  const snapshot = () => ({
    courses: db.select().from(courses).all(), chapters: db.select().from(chapters).all(),
    attempts: db.select().from(attempts).all(), answers: db.select().from(answers).all(),
    questions: db.select().from(questions).all(), reviews: db.select().from(reviewItems).all(),
    jobs: db.select().from(generationJobs).all(),
  });
  const before = snapshot();
  for (let visit = 0; visit < 2; visit++) {
    const lesson = await readChapter(new Request("http://localhost/api/chapters/chapter"), { params: Promise.resolve({ id: "chapter" }) });
    expect(lesson.status).toBe(200);
    expect(await lesson.json()).toMatchObject({ chapter: { status: "passed", content: before.chapters[0].content }, html: expect.stringContaining("The saved lesson.") });
    const course = await readCourse(new Request("http://localhost/api/courses/course"), { params: Promise.resolve({ id: "course" }) });
    expect(course.status).toBe(200);
    expect(await course.json()).toMatchObject({ progress: { passed: 1, total: 1 } });
    expect(snapshot()).toEqual(before);
  }
  expect(agentForRequest).not.toHaveBeenCalled();
  expect(processGenerationJob).not.toHaveBeenCalled();
  expect(generateChapterContent).not.toHaveBeenCalled();
});
