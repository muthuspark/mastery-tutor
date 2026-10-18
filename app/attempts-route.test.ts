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
  it("persists correct and incorrect MCQ scores without discovery or execution when no agent is available", async () => {
    const secondId = randomUUID();
    const first = db.select().from(questions).where(eq(questions.id, questionId)).get()!;
    db.insert(questions).values({ ...first, id: secondId, prompt: "Another solution" }).run();
    const response = await submit([{ questionId, response: "0" }, { questionId: secondId, response: "y = x" }]);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ score: 0.5, passed: false, complete: false });
    expect(body.answers).toMatchObject([{ score: 1, feedback: "Correct.", missedConcept: null }, { score: 0, missedConcept: "y = Ce^x" }]);
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
    expect(await response.json()).toMatchObject({ error: { code: "not_found", message: expect.stringContaining("Install either the Codex or Claude CLI"), retryable: false } });
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
