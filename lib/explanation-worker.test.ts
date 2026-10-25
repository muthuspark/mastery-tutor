import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", async () => {
  const schema = await import("./db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.run("INSERT OR IGNORE INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('test-user','','test@example.com',1,1,1)");
  return { db };
});
vi.mock("./agent", () => ({ agentForRequest: vi.fn(async () => "codex") }));
vi.mock("./chapter", () => ({ generateChapterContent: vi.fn() }));
vi.mock("./quiz", () => ({ generateQuiz: vi.fn() }));
vi.mock("./course-planner", () => ({ prepareCourse: vi.fn() }));
vi.mock("./explanation", () => ({ generateExplanation: vi.fn() }));

const { db } = await import("./db");
const { attempts, chapterExplanations, chapters, courses, generationJobs, questions, socraticSessions } = await import("./db/schema");
const { generateExplanation } = await import("./explanation");
const { enqueueGenerationJob, claimGenerationJob, getGenerationJob, recoverExpiredGenerationJobs } = await import("./generation");
const { processGenerationJob } = await import("./generation-worker");
const { QualityError } = await import("./quality-contracts");

const chapterId = "chapter-1";
const explanationId = "explanation-1";
let now: Date;

beforeEach(() => {
  vi.useFakeTimers();
  now = new Date("2026-10-22T12:00:00Z");
  vi.setSystemTime(now);
  vi.resetAllMocks();
  db.delete(generationJobs).run();
  db.delete(chapters).run();
  db.delete(courses).run();
  db.insert(courses).values({ userId: "test-user", id: "course-1", topic: "Probability", preparationVersion: 2, createdAt: now }).run();
  db.insert(chapters).values({
    id: chapterId, courseId: "course-1", idx: 0, title: "Conditional probability", objectives: ["Calculate a conditional probability"],
    prerequisites: [], content: "Canonical lesson", pretest: "Predict", summary: "Summary", status: "open",
    contentGenerationStatus: "ready", contentGenerationVersion: 1, quizGenerationStatus: "ready", quizGenerationVersion: 1,
    createdAt: now,
  }).run();
  db.insert(questions).values({ id: "question-1", chapterId, type: "mcq", prompt: "Question", options: ["A", "B"], rubric: "Rubric", modelAnswer: "A", conceptTag: "probability", generationVersion: 1, createdAt: now }).run();
  db.insert(attempts).values({ id: "attempt-1", chapterId, attemptNo: 1, score: 1, passed: true, createdAt: now }).run();
  db.insert(socraticSessions).values({ chapterId, id: "session-1", generationVersion: 1, revision: 2, state: { question: null, turns: [], summary: "Practice in progress" }, updatedAt: now }).run();
  db.insert(chapterExplanations).values({ id: "original", chapterId, ordinal: 1, kind: "original", sourceContentVersion: 1, sourcePreparationVersion: 2, level: 2, content: "Guided", status: "ready", jobVersion: 1, createdAt: now }).run();
  db.insert(chapterExplanations).values({
    id: explanationId, chapterId, ordinal: 2, kind: "alternative", sourceContentVersion: 1, sourcePreparationVersion: 2,
    parentExplanationId: "original", requestId: "11111111-1111-4111-8111-111111111111", direction: "deeper",
    level: 3, content: null, status: "pending", jobVersion: 1, createdAt: now,
  }).run();
});

afterEach(() => vi.useRealTimers());

function claim() {
  const job = db.select().from(generationJobs).where(eq(generationJobs.artifactType, "explanation")).get();
  if (!job) throw new Error("Expected explanation job");
  const claimed = claimGenerationJob(job.id, "explanation-worker", now);
  if (!claimed) throw new Error("Expected claimable explanation job");
  return claimed;
}

describe("explanation generation jobs", () => {
  it("publishes an explanation without changing chapter or scheduling a quiz", async () => {
    const before = db.select().from(chapters).get();
    const assessmentState = { questions: db.select().from(questions).all(), attempts: db.select().from(attempts).all(), sessions: db.select().from(socraticSessions).all() };
    vi.mocked(generateExplanation).mockImplementation(async () => db.update(chapterExplanations)
      .set({ status: "ready", content: "Applied alternative", generatedAt: now })
      .where(eq(chapterExplanations.id, explanationId)).returning().get()!);
    const job = enqueueGenerationJob("explanation", explanationId, 1, now);

    expect(await processGenerationJob(claim(), "explanation-worker")).toBe("completed");
    expect(getGenerationJob(job.id)).toMatchObject({ status: "completed", artifactType: "explanation" });
    expect(db.select().from(chapterExplanations).where(eq(chapterExplanations.id, explanationId)).get()).toMatchObject({ status: "ready", content: "Applied alternative" });
    expect(db.select().from(chapters).get()).toEqual(before);
    expect({ questions: db.select().from(questions).all(), attempts: db.select().from(attempts).all(), sessions: db.select().from(socraticSessions).all() }).toEqual(assessmentState);
    expect(db.select().from(generationJobs).all().filter((row) => row.artifactType === "quiz")).toEqual([]);
  });

  it("uses bounded worker retries and leaves the explanation pending after a retryable failure", async () => {
    const before = { chapter: db.select().from(chapters).get(), questions: db.select().from(questions).all(), attempts: db.select().from(attempts).all(), sessions: db.select().from(socraticSessions).all() };
    vi.mocked(generateExplanation).mockRejectedValueOnce(new QualityError("Review rejected the draft."));
    const job = enqueueGenerationJob("explanation", explanationId, 1, now);
    expect(await processGenerationJob(claim(), "explanation-worker")).toBe("pending");
    expect(getGenerationJob(job.id)).toMatchObject({ status: "pending", attempts: 1 });
    expect(db.select().from(chapterExplanations).where(eq(chapterExplanations.id, explanationId)).get()).toMatchObject({ status: "pending", error: "Review rejected the draft." });
    expect(db.select().from(chapters).get()).toMatchObject({ content: "Canonical lesson", contentGenerationVersion: 1, quizGenerationVersion: 1 });
    expect({ chapter: db.select().from(chapters).get(), questions: db.select().from(questions).all(), attempts: db.select().from(attempts).all(), sessions: db.select().from(socraticSessions).all() }).toEqual(before);
    expect(db.select().from(generationJobs).all().filter((row) => row.artifactType === "quiz")).toEqual([]);
  });

  it("marks a source-stale request failed instead of leaving it pending", async () => {
    const job = enqueueGenerationJob("explanation", explanationId, 1, now);
    db.update(courses).set({ preparationVersion: 3 }).where(eq(courses.id, "course-1")).run();
    expect(await processGenerationJob(claim(), "explanation-worker")).toBe("stale");
    expect(getGenerationJob(job.id)?.status).toBe("completed");
    expect(db.select().from(chapterExplanations).where(eq(chapterExplanations.id, explanationId)).get()).toMatchObject({ status: "failed", error: expect.stringContaining("source changed") });
    expect(generateExplanation).not.toHaveBeenCalled();
    expect(db.select().from(generationJobs).all().filter((row) => row.artifactType === "quiz")).toEqual([]);
  });

  it("recovers a published explanation job without duplicate completion or assessment changes", async () => {
    const job = enqueueGenerationJob("explanation", explanationId, 1, now);
    const claimed = claimGenerationJob(job.id, "crashed-worker", now)!;
    db.update(chapterExplanations).set({ status: "ready", content: "Published" }).where(eq(chapterExplanations.id, explanationId)).run();
    const stable = { chapter: db.select().from(chapters).get(), questions: db.select().from(questions).all(), attempts: db.select().from(attempts).all(), sessions: db.select().from(socraticSessions).all() };
    expect(recoverExpiredGenerationJobs(new Date(now.getTime() + 121_000))).toBe(1);
    expect(getGenerationJob(claimed.id)?.status).toBe("completed");
    expect(await processGenerationJob(claimed, "crashed-worker")).toBe("lost");
    expect({ chapter: db.select().from(chapters).get(), questions: db.select().from(questions).all(), attempts: db.select().from(attempts).all(), sessions: db.select().from(socraticSessions).all() }).toEqual(stable);
    expect(db.select().from(generationJobs).all().filter((row) => row.artifactType === "quiz")).toEqual([]);
  });
});
