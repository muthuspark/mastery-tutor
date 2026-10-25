vi.mock("@/lib/access", () => ({ authorize: async () => ({ user: { id: "test-user" } }) }));
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));
// Never share fixture writes or generation-job leases with the running app.
vi.mock("@/lib/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.run("INSERT OR IGNORE INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('test-user','','test@example.com',1,1,1)");
  return { db };
});
vi.mock("@/lib/agent", () => ({ agentForRequest: vi.fn().mockResolvedValue("codex"), noAgentError: vi.fn() }));
vi.mock("@/lib/quiz", () => ({
  dueReviewQuestions: vi.fn().mockReturnValue([]),
  latestAttempt: vi.fn().mockReturnValue(undefined),
  latestAttemptQuestionIds: vi.fn().mockReturnValue(new Set()),
  generateQuiz: vi.fn(),
}));

import { GET } from "@/app/api/chapters/[id]/quiz/route";
import { db } from "@/lib/db";
import { answers, attempts, chapters, courses, questions } from "@/lib/db/schema";
import { dueReviewQuestions, generateQuiz } from "@/lib/quiz";

const createdCourses: string[] = [];

afterEach(() => {
  for (const id of createdCourses.splice(0)) db.delete(courses).where(eq(courses.id, id)).run();
  vi.clearAllMocks();
  vi.mocked(dueReviewQuestions).mockReturnValue([]);
});

describe("quiz route cache validation", () => {
  it.each(["cached", "generated"])("delivers only rendering fields for %s current and review questions", async (source) => {
    const courseId = randomUUID();
    const chapterId = randomUUID();
    const now = new Date();
    createdCourses.push(courseId);
    db.insert(courses).values({ userId: "test-user", id: courseId, topic: "Differential equations", createdAt: now }).run();
    db.insert(chapters).values({ id: chapterId, courseId, idx: 1, title: "Separation", objectives: [], prerequisites: [], content: "Ready chapter", contentGenerationStatus: "ready", status: "open", createdAt: now }).run();
    const current = Array.from({ length: 10 }, (_, index) => ({
      id: randomUUID(), chapterId, type: "mcq" as const, prompt: `Solve equation ${index}`,
      options: ["Solution A", "Solution B", "Solution C", "Solution D"],
      modelAnswer: ["Solution A", "Solution B", "Solution C", "Solution D"][index % 4],
      rubric: "Private grading rule", conceptTag: "separation", isReview: false,
      generationVersion: 1, createdAt: now,
    }));
    const review = { ...current[0], id: randomUUID(), isReview: true, prompt: "Review equation" };
    vi.mocked(dueReviewQuestions).mockReturnValue([review]);
    if (source === "cached") db.insert(questions).values(current).run();
    else vi.mocked(generateQuiz).mockImplementationOnce(async () => {
      db.insert(questions).values(current).run();
      return current;
    });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: chapterId }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.questions).toHaveLength(11);
    for (const delivered of body.questions) {
      const stored = [...current, review].find((question) => question.id === delivered.id)!;
      expect(delivered).toEqual({ id: stored.id, type: stored.type, prompt: stored.prompt, options: stored.options, isReview: stored.isReview });
      expect(delivered).not.toHaveProperty("modelAnswer");
      expect(delivered).not.toHaveProperty("rubric");
    }
    expect(body.questions.filter((question: { isReview: boolean }) => question.isReview)).toEqual([
      { id: review.id, type: review.type, prompt: review.prompt, options: review.options, isReview: true },
    ]);
    expect(db.select().from(questions).where(eq(questions.id, current[0].id)).get()).toMatchObject({ modelAnswer: current[0].modelAnswer, rubric: current[0].rubric });
    expect(generateQuiz).toHaveBeenCalledTimes(source === "generated" ? 1 : 0);
  });

  it("replaces unattempted invalid cache rows while retaining attempted rows", async () => {
    const courseId = randomUUID();
    const chapterId = randomUUID();
    const attemptedId = randomUUID();
    const staleId = randomUUID();
    const attemptId = randomUUID();
    createdCourses.push(courseId);
    const now = new Date();
    db.insert(courses).values({ userId: "test-user", id: courseId, topic: "test topic", level: "foundational", createdAt: now }).run();
    db.insert(chapters).values({ id: chapterId, courseId, idx: 0, title: "Test", objectives: ["Test"], prerequisites: [], content: "Ready chapter", summary: "Summary", status: "open", generatedAt: now, createdAt: now }).run();
    const invalid = { chapterId, type: "mcq" as const, prompt: "Invalid", options: ["Correct", "Wrong"], rubric: "Rule", modelAnswer: "Correct", conceptTag: "test", isReview: false, createdAt: now };
    db.insert(questions).values([{ ...invalid, id: attemptedId }, { ...invalid, id: staleId }]).run();
    db.insert(attempts).values({ id: attemptId, chapterId, attemptNo: 1, score: 0, passed: false, createdAt: now }).run();
    db.insert(answers).values({ id: randomUUID(), attemptId, questionId: attemptedId, response: "Wrong", score: 0, feedback: "No", createdAt: now }).run();

    vi.mocked(generateQuiz).mockResolvedValue(Array.from({ length: 10 }, (_, index) => ({
      ...invalid,
      id: randomUUID(),
      prompt: `Fresh ${index}`,
      options: ["Correct", "One", "Two", "Three"],
    })) as never);

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: chapterId }) });

    expect(response.status).toBe(200);
    expect(db.select().from(questions).where(eq(questions.id, staleId)).get()).toBeUndefined();
    expect(db.select().from(questions).where(eq(questions.id, attemptedId)).get()).toBeDefined();
    expect(generateQuiz).toHaveBeenCalledWith(chapterId, "codex", 1, expect.any(Function));
  });
});
