import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));
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
import { generateQuiz } from "@/lib/quiz";

const createdCourses: string[] = [];

afterEach(() => {
  for (const id of createdCourses.splice(0)) db.delete(courses).where(eq(courses.id, id)).run();
  vi.clearAllMocks();
});

describe("quiz route cache validation", () => {
  it("replaces unattempted invalid cache rows while retaining attempted rows", async () => {
    const courseId = randomUUID();
    const chapterId = randomUUID();
    const attemptedId = randomUUID();
    const staleId = randomUUID();
    const attemptId = randomUUID();
    createdCourses.push(courseId);
    const now = new Date();
    db.insert(courses).values({ id: courseId, topic: "test topic", level: "foundational", createdAt: now }).run();
    db.insert(chapters).values({ id: chapterId, courseId, idx: 0, title: "Test", objectives: ["Test"], prerequisites: [], status: "open", createdAt: now }).run();
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
    expect(generateQuiz).toHaveBeenCalledWith(chapterId, "codex");
  });
});
