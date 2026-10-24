import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", async () => {
  const schema = await import("./db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return { db };
});
vi.mock("./agent", () => ({ runAgentObject: vi.fn(), agentForRequest: vi.fn(), noAgentError: vi.fn() }));
vi.mock("./wikipedia-images", () => ({ findWikipediaImages: vi.fn(async () => []) }));

const { db } = await import("./db");
const { chapterExplanations, chapters, courses, generationJobs, questions } = await import("./db/schema");
const { runAgentObject } = await import("./agent");
const { explanationSchema } = await import("./schemas");
const { generateExplanation } = await import("./explanation");

const originalId = "original-1";
const alternativeId = "alternative-1";

beforeEach(() => {
  vi.resetAllMocks();
  db.delete(generationJobs).run();
  db.delete(chapters).run();
  db.delete(courses).run();
  const now = new Date("2026-01-01T00:00:00Z");
  db.insert(courses).values({ id: "course-1", topic: "Statistics", preparationVersion: 3, createdAt: now }).run();
  db.insert(chapters).values({
    id: "chapter-1", courseId: "course-1", idx: 2, title: "Conditional probability", objectives: ["Calculate a conditional probability"],
    prerequisites: [1], content: "Canonical chapter text", pretest: "Predict the denominator", summary: "A summary.",
    status: "passed", contentGenerationStatus: "ready", contentGenerationVersion: 1,
    quizGenerationVersion: 1, quizGenerationStatus: "ready", createdAt: now,
  }).run();
  db.insert(chapterExplanations).values({
    id: originalId, chapterId: "chapter-1", ordinal: 1, kind: "original", sourceContentVersion: 1,
    sourcePreparationVersion: 3, level: 2, content: "Guided explanation", status: "ready", jobVersion: 1, createdAt: now,
  }).run();
  db.insert(chapterExplanations).values({
    id: alternativeId, chapterId: "chapter-1", ordinal: 2, kind: "alternative", sourceContentVersion: 1,
    sourcePreparationVersion: 3, parentExplanationId: originalId, requestId: "11111111-1111-4111-8111-111111111111",
    direction: "deeper", level: 3, content: null, status: "pending", jobVersion: 1, createdAt: now,
  }).run();
});

describe("alternative explanation generation", () => {
  it("generates a content-only target-level alternative and changes no canonical or quiz state", async () => {
    vi.mocked(runAgentObject).mockResolvedValue({ content: "A careful applied explanation." });
    const before = db.select().from(chapters).get();
    const result = await generateExplanation(alternativeId, "codex");

    expect(result).toMatchObject({ status: "ready", level: 3, content: "A careful applied explanation." });
    const call = vi.mocked(runAgentObject).mock.calls[0];
    expect(call?.[1]).toBe("chapter");
    expect(call?.[2]).toContain("Target level 3 of 6");
    expect(call?.[2]).toContain("applied explanation");
    expect(call?.[2]).toContain("Canonical chapter text");
    expect(call?.[2]).toContain("Guided explanation");
    expect(call?.[3]).toBe(explanationSchema);
    expect(db.select().from(chapters).get()).toEqual(before);
    expect(db.select().from(questions).all()).toEqual([]);
    expect(db.select().from(generationJobs).all()).toEqual([]);
  });

  it("includes the target level in quality review context", async () => {
    db.update(courses).set({ qualityPolicyVersion: 1 }).where(eq(courses.id, "course-1")).run();
    vi.mocked(runAgentObject).mockResolvedValueOnce({ content: "A technical explanation." }).mockResolvedValueOnce({ issues: [] });
    await generateExplanation(alternativeId, "claude");

    expect(vi.mocked(runAgentObject).mock.calls.map((call) => call[1])).toEqual(["chapter", "review"]);
    expect(vi.mocked(runAgentObject).mock.calls[1][2]).toContain("Target level 3 of 6");
    expect(vi.mocked(runAgentObject).mock.calls[1][2]).toContain("A technical explanation.");
  });

  it("repairs malformed math before atomic publication", async () => {
    const invalid = "A rate measures change.\n\n$$\\frac{T(n+h)-T(n)}h\n=2an+ah+b,$$";
    const repaired = "A rate measures change.\n\n$$\n\\frac{T(n+h)-T(n)}{h}\n=2an+ah+b\n$$";
    vi.mocked(runAgentObject).mockResolvedValueOnce({ content: invalid }).mockResolvedValueOnce({ content: repaired });
    const result = await generateExplanation(alternativeId, "codex");
    expect(result.content).toBe(repaired);
    expect(vi.mocked(runAgentObject)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runAgentObject).mock.calls[1][2]).toContain("standalone $$ delimiter lines");
  });

  it("rejects a stale canonical source before calling a provider", async () => {
    db.update(chapters).set({ contentGenerationVersion: 2 }).where(eq(chapters.id, "chapter-1")).run();
    await expect(generateExplanation(alternativeId, "codex")).rejects.toThrow("stale");
    expect(runAgentObject).not.toHaveBeenCalled();
    expect(db.select().from(chapterExplanations).where(eq(chapterExplanations.id, alternativeId)).get()?.content).toBeNull();
  });
});
