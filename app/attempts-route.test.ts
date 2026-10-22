import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});
vi.mock("@/lib/agent", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/agent")>(),
  agentForRequest: vi.fn(),
  runAgentObject: vi.fn(),
}));
vi.mock("@/lib/generation", () => ({ enqueueGenerationJob: vi.fn() }));

import { POST } from "@/app/api/chapters/[id]/attempts/route";
import { db } from "@/lib/db";
import { answers, attempts, chapters, courses, questions, reviewItems } from "@/lib/db/schema";
import { agentForRequest, runAgentObject } from "@/lib/agent";

let courseId: string;
let chapterId: string;
let questionId: string;

beforeEach(() => {
  vi.resetAllMocks();
  // Only this test file's in-memory fixture data is removed.
  db.delete(courses).run();
  courseId = randomUUID();
  chapterId = randomUUID();
  questionId = randomUUID();
  const now = new Date();
  db.insert(courses).values({ id: courseId, topic: "Differential equations", createdAt: now }).run();
  db.insert(chapters).values({ id: chapterId, courseId, idx: 0, title: "Separation", objectives: [], prerequisites: [], status: "open", createdAt: now }).run();
  db.insert(questions).values({ id: questionId, chapterId, type: "mcq", prompt: "Solve y' = y", options: ["y = Ce^x", "y = x"], rubric: "Exponential solution", modelAnswer: "y = Ce^x", conceptTag: "separation", createdAt: now }).run();
});

function submit(responses: { questionId: string; response: string }[]) {
  return POST(new Request("http://localhost/api/chapters/test/attempts", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ answers: responses }),
  }), { params: Promise.resolve({ id: chapterId }) });
}

describe("attempt grading agent requirements", () => {
  it("returns and persists the worked explanation for a wrong answer without changing its score", async () => {
    const explanation = "Total return includes both the change in value and cash income.\n\nThe gain in value is 1,050 - 1,000 = 50. Add the distribution: 50 + 20 = 70. Divide by the starting value: 70 / 1,000 = 0.07, or 7%.\n\nThe 2% choice counts only the distribution and leaves out the price gain. Always include both sources of return.";
    db.update(questions).set({
      prompt: "A holding starts at 1,000, ends at 1,050, and distributes 20. What is the total return?",
      options: ["7%", "2%", "5%", "70%"], modelAnswer: "7%", rubric: explanation,
    }).where(eq(questions.id, questionId)).run();

    const response = await submit([{ questionId, response: "2%" }]);
    expect(response.status).toBe(200);
    const body = await response.json();
    const feedback = `The expected answer is: 7%.\n\n${explanation}`;
    expect(body).toMatchObject({ score: 0, passed: false, answers: [{ score: 0, response: "2%", modelAnswer: "7%", feedback }] });
    expect(db.select().from(answers).all()).toMatchObject([{ attemptId: body.attemptId, score: 0, feedback }]);
    expect(agentForRequest).not.toHaveBeenCalled();
    expect(runAgentObject).not.toHaveBeenCalled();
  });

  it.each([
    { response: "2", score: 1 },
    { response: "0", score: 0 },
  ])("persists numeric option text '$response' with score $score", async ({ response: selected, score }) => {
    db.update(questions).set({ options: ["2", "3", "0", "1"], modelAnswer: "2" }).where(eq(questions.id, questionId)).run();
    const response = await submit([{ questionId, response: selected }]);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ score, passed: score === 1 });
    expect(db.select().from(attempts).all()).toMatchObject([{ id: body.attemptId, score, passed: score === 1 }]);
    expect(db.select().from(answers).all()).toMatchObject([{ attemptId: body.attemptId, questionId, response: selected, score }]);
    expect(agentForRequest).not.toHaveBeenCalled();
    expect(runAgentObject).not.toHaveBeenCalled();
  });

  it("persists correct and incorrect MCQ scores without discovery or execution when no agent is available", async () => {
    const secondId = randomUUID();
    const first = db.select().from(questions).where(eq(questions.id, questionId)).get()!;
    db.insert(questions).values({ ...first, id: secondId, prompt: "Another solution" }).run();
    const response = await submit([{ questionId, response: "0" }, { questionId: secondId, response: "y = x" }]);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ score: 0.5, passed: false, complete: false });
    expect(body.answers).toMatchObject([{ score: 1, feedback: "Correct.", missedConcept: null }, { score: 0, missedConcept: "separation" }]);
    expect(agentForRequest).not.toHaveBeenCalled();
    expect(runAgentObject).not.toHaveBeenCalled();
    expect(db.select().from(attempts).all()).toMatchObject([{ id: body.attemptId, attemptNo: 1, score: 0.5, passed: false }]);
    expect(db.select().from(answers).all()).toHaveLength(2);
    expect(db.select().from(reviewItems).all()).toMatchObject([{ sourceQuestionId: secondId, misses: 1 }]);

    const retry = await submit([{ questionId, response: "  Y = Ce^x  " }]);
    expect(await retry.json()).toMatchObject({ score: 1, passed: true, complete: true });
    expect(db.select().from(attempts).all().map((item) => item.attemptNo)).toEqual([1, 2]);
    expect(db.select().from(chapters).where(eq(chapters.id, chapterId)).get()?.status).toBe("passed");
    expect(db.select().from(courses).where(eq(courses.id, courseId)).get()?.completedAt).toBeInstanceOf(Date);
    expect(agentForRequest).not.toHaveBeenCalled();
    expect(runAgentObject).not.toHaveBeenCalled();
  });

  it.each(["short", "explain"] as const)("returns the existing availability error for mixed MCQ and %s attempts without persisting", async (type) => {
    const freeResponseId = randomUUID();
    const first = db.select().from(questions).where(eq(questions.id, questionId)).get()!;
    db.insert(questions).values({ ...first, id: freeResponseId, type }).run();
    const response = await submit([{ questionId, response: "0" }, { questionId: freeResponseId, response: "An explanation" }]);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "not_found", message: expect.stringContaining("Install Codex or Claude CLI, or configure DEEPSEEK_API_KEY"), retryable: false } });
    expect(agentForRequest).toHaveBeenCalledTimes(1);
    expect(runAgentObject).not.toHaveBeenCalled();
    expect(db.select().from(attempts).all()).toEqual([]);
    expect(db.select().from(answers).all()).toEqual([]);
  });

  it("uses the selected agent only for free-response grading in a mixed attempt", async () => {
    const freeResponseId = randomUUID();
    const first = db.select().from(questions).where(eq(questions.id, questionId)).get()!;
    db.insert(questions).values({ ...first, id: freeResponseId, type: "explain" }).run();
    vi.mocked(agentForRequest).mockResolvedValue("claude");
    vi.mocked(runAgentObject).mockResolvedValue({ score: 1, feedback: "Valid explanation", missedConcept: null });
    const response = await submit([{ questionId, response: "0" }, { questionId: freeResponseId, response: "An explanation" }]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ score: 1, passed: true });
    expect(agentForRequest).toHaveBeenCalledTimes(1);
    expect(runAgentObject).toHaveBeenCalledTimes(1);
    expect(runAgentObject).toHaveBeenCalledWith("claude", "grading", expect.any(String), expect.anything());
    expect(db.select().from(answers).all()).toHaveLength(2);
  });

  it("rolls back the whole transaction when answer persistence fails", async () => {
    const response = await submit([{ questionId, response: "0" }, { questionId, response: "0" }]);
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "database_error" } });
    expect(db.select().from(attempts).all()).toEqual([]);
    expect(db.select().from(answers).all()).toEqual([]);
    expect(db.select().from(chapters).where(eq(chapters.id, chapterId)).get()?.status).toBe("open");
    expect(db.select().from(courses).where(eq(courses.id, courseId)).get()?.completedAt).toBeNull();
    expect(agentForRequest).not.toHaveBeenCalled();
    expect(runAgentObject).not.toHaveBeenCalled();
  });
});

describe("concept gaps across attempt outcomes", () => {
  function pendingReview() {
    const now = new Date();
    const priorChapterId = randomUUID();
    const reviewQuestionId = randomUUID();
    const reviewId = randomUUID();
    db.update(chapters).set({ idx: 1 }).where(eq(chapters.id, chapterId)).run();
    db.insert(chapters).values({ id: priorChapterId, courseId, idx: 0, title: "Earlier lesson", objectives: [], prerequisites: [], status: "passed", createdAt: now }).run();
    const currentQuestion = db.select().from(questions).where(eq(questions.id, questionId)).get()!;
    db.insert(questions).values({ ...currentQuestion, id: reviewQuestionId, chapterId: priorChapterId, prompt: "Review the earlier method", conceptTag: "earlier-concept" }).run();
    db.insert(reviewItems).values({ id: reviewId, courseId, conceptTag: "earlier-concept", sourceQuestionId: reviewQuestionId, misses: 1, dueAfterChapterIdx: 1, createdAt: now }).run();
    return { reviewId, reviewQuestionId };
  }

  it.each([true, false])("clears a correct review answer even when the overall attempt passes=%s", async (correctCurrent) => {
    const { reviewId, reviewQuestionId } = pendingReview();
    const result = await submit([{ questionId, response: correctCurrent ? "y = Ce^x" : "y = x" }, { questionId: reviewQuestionId, response: "y = Ce^x" }]);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ passed: correctCurrent });
    expect(db.select().from(reviewItems).where(eq(reviewItems.id, reviewId)).get()).toBeUndefined();
  });

  it("keeps an incorrect review scheduled for a later chapter", async () => {
    const { reviewId, reviewQuestionId } = pendingReview();
    const result = await submit([{ questionId, response: "y = Ce^x" }, { questionId: reviewQuestionId, response: "y = x" }]);
    expect(result.status).toBe(200);
    expect(db.select().from(reviewItems).where(eq(reviewItems.id, reviewId)).get()).toMatchObject({ misses: 2, dueAfterChapterIdx: 3, sourceQuestionId: reviewQuestionId });
  });

  it("retains a new miss on a concept even when its old review question is answered correctly", async () => {
    const { reviewQuestionId } = pendingReview();
    db.update(questions).set({ conceptTag: "earlier-concept" }).where(eq(questions.id, questionId)).run();
    const result = await submit([{ questionId, response: "y = x" }, { questionId: reviewQuestionId, response: "y = Ce^x" }]);
    expect(result.status).toBe(200);
    expect(db.select().from(reviewItems).all()).toMatchObject([{ conceptTag: "earlier-concept", sourceQuestionId: questionId, misses: 1 }]);
  });

  function tenQuestionQuiz() {
    const first = db.select().from(questions).where(eq(questions.id, questionId)).get()!;
    const quiz = Array.from({ length: 10 }, (_, index) => ({
      ...first,
      id: index === 0 ? questionId : randomUUID(),
      prompt: `Differential equations question ${index + 1}`,
      conceptTag: `concept-${index + 1}`,
    }));
    db.update(questions).set({ conceptTag: quiz[0].conceptTag }).where(eq(questions.id, questionId)).run();
    db.insert(questions).values(quiz.slice(1)).run();
    return quiz;
  }

  it.each([
    { incorrect: 2, score: 0.8, passed: true },
    { incorrect: 3, score: 0.7, passed: false },
  ])("records each concept gap with $incorrect misses and passed=$passed", async ({ incorrect, score, passed }) => {
    const quiz = tenQuestionQuiz();
    const response = await submit(quiz.map((question, index) => ({ questionId: question.id, response: index < incorrect ? "y = x" : question.modelAnswer })));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ score, passed, complete: passed });
    expect(db.select().from(attempts).all()).toMatchObject([{ id: body.attemptId, score, passed }]);
    expect(db.select().from(chapters).where(eq(chapters.id, chapterId)).get()?.status).toBe(passed ? "passed" : "open");
    const gaps = db.select().from(reviewItems).all();
    expect(gaps).toHaveLength(incorrect);
    expect(gaps).toEqual(expect.arrayContaining(quiz.slice(0, incorrect).map((question) => expect.objectContaining({
      courseId, conceptTag: question.conceptTag, sourceQuestionId: question.id, misses: 1, dueAfterChapterIdx: 1,
    }))));
    expect(body.answers.slice(0, incorrect).map((answer: { missedConcept: string }) => answer.missedConcept)).toEqual(quiz.slice(0, incorrect).map((question) => question.conceptTag));
  });

  it("updates the matching course/concept when a different question repeats a miss", async () => {
    const quiz = tenQuestionQuiz();
    db.update(questions).set({ conceptTag: quiz[0].conceptTag }).where(eq(questions.id, quiz[1].id)).run();
    const otherCourseId = randomUUID();
    db.insert(courses).values({ id: otherCourseId, topic: "Other test course", createdAt: new Date() }).run();
    const unrelatedId = randomUUID();
    db.insert(reviewItems).values({ id: unrelatedId, courseId: otherCourseId, conceptTag: quiz[0].conceptTag, sourceQuestionId: questionId, misses: 4, dueAfterChapterIdx: 9, createdAt: new Date() }).run();
    const unrelated = db.select().from(reviewItems).where(eq(reviewItems.id, unrelatedId)).get();

    const responses = (missIndex: number) => quiz.map((question, index) => ({ questionId: question.id, response: index === missIndex ? "y = x" : question.modelAnswer }));
    expect(await (await submit(responses(0))).json()).toMatchObject({ score: 0.9, passed: true });
    const initial = db.select().from(reviewItems).where(eq(reviewItems.courseId, courseId)).get()!;
    expect(await (await submit(responses(1))).json()).toMatchObject({ score: 0.9, passed: true });
    expect(db.select().from(reviewItems).where(eq(reviewItems.courseId, courseId)).all()).toEqual([
      { ...initial, sourceQuestionId: quiz[1].id, misses: 2, dueAfterChapterIdx: 2 },
    ]);
    expect(db.select().from(reviewItems).where(eq(reviewItems.id, unrelatedId)).get()).toEqual(unrelated);
  });

  it("creates no review items for an all-correct quiz and preserves previously recorded gaps", async () => {
    const quiz = tenQuestionQuiz();
    const correct = quiz.map((question) => ({ questionId: question.id, response: question.modelAnswer }));
    expect(await (await submit(correct)).json()).toMatchObject({ score: 1, passed: true });
    expect(db.select().from(reviewItems).all()).toEqual([]);
    await submit(correct.map((answer, index) => index === 0 ? { ...answer, response: "y = x" } : answer));
    const gaps = db.select().from(reviewItems).all();
    expect(gaps).toHaveLength(1);
    expect(await (await submit(correct)).json()).toMatchObject({ score: 1, passed: true });
    expect(db.select().from(reviewItems).all()).toEqual(gaps);
  });
});
