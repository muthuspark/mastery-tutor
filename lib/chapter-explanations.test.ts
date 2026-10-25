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
  db.run("INSERT OR IGNORE INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('test-user','','test@example.com',1,1,1)");
  return { db };
});

const { db } = await import("./db");
const { chapterExplanations, chapters, courses, generationJobs } = await import("./db/schema");
const { ChapterExplanationError, readChapterExplanations, requestChapterExplanation, retryChapterExplanation } = await import("./chapter-explanations");

const chapterId = "chapter-1";
const originalId = "original-1";
const requestId = "11111111-1111-4111-8111-111111111111";
const retryId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  db.delete(generationJobs).run();
  db.delete(chapterExplanations).run();
  db.delete(chapters).run();
  db.delete(courses).run();
  const now = new Date("2026-01-01T00:00:00Z");
  db.insert(courses).values({ userId: "test-user", id: "course-1", topic: "Topic", preparationVersion: 4, createdAt: now }).run();
  db.insert(chapters).values({
    id: chapterId, courseId: "course-1", idx: 1, title: "Chapter", objectives: ["Learn"], prerequisites: [],
    content: "Canonical lesson", contentGenerationStatus: "ready", contentGenerationVersion: 1,
    status: "passed", createdAt: now,
  }).run();
  db.insert(chapterExplanations).values({
    id: originalId, chapterId, ordinal: 1, kind: "original", sourceContentVersion: 1,
    sourcePreparationVersion: 4, level: 2, content: "Guided lesson", status: "ready", jobVersion: 1, createdAt: now,
  }).run();
});

describe("chapter explanation requests", () => {
  it("creates one adjacent request, queues it transactionally, and replays by request ID", () => {
    const input = { chapterId, direction: "simpler" as const, requestId, expectedContentVersion: 1, baselineExplanationId: originalId };
    const first = requestChapterExplanation(input);
    expect(first.explanation.level).toBe(1);
    expect(first.explanation.status).toBe("pending");
    expect(first.replay).toBe(false);
    expect(db.select().from(generationJobs).all()).toHaveLength(1);
    expect(db.select().from(generationJobs).get()?.artifactType).toBe("explanation");

    const replay = requestChapterExplanation(input);
    expect(replay.explanation.id).toBe(first.explanation.id);
    expect(replay.replay).toBe(true);
    expect(() => requestChapterExplanation({ ...input, direction: "deeper" }))
      .toThrow(expect.objectContaining({ code: "request_conflict" }));
  });

  it("rejects active duplicates, stale baselines, source versions and boundaries", () => {
    const input = { chapterId, direction: "deeper" as const, requestId, expectedContentVersion: 1, baselineExplanationId: originalId };
    expect(requestChapterExplanation(input).explanation.level).toBe(3);
    expect(() => requestChapterExplanation({ ...input, requestId: "33333333-3333-4333-8333-333333333333" }))
      .toThrow(expect.objectContaining({ code: "generation_active" }));
    expect(() => requestChapterExplanation({ ...input, requestId: "44444444-4444-4444-8444-444444444444", baselineExplanationId: "other" }))
      .toThrow(expect.objectContaining({ code: "stale_baseline" }));
    expect(() => requestChapterExplanation({ ...input, requestId: "55555555-5555-4555-8555-555555555555", expectedContentVersion: 2 }))
      .toThrow(expect.objectContaining({ code: "stale_source" }));

    db.update(chapterExplanations).set({ level: 1 }).where(eq(chapterExplanations.id, originalId)).run();
    db.update(chapterExplanations).set({ status: "failed" }).where(eq(chapterExplanations.id, db.select({ id: chapterExplanations.id }).from(chapterExplanations).where(eq(chapterExplanations.requestId, requestId)).get()!.id)).run();
    expect(() => requestChapterExplanation({ ...input, requestId: "66666666-6666-4666-8666-666666666666", direction: "simpler" }))
      .toThrow(expect.objectContaining({ code: "depth_boundary" }));
  });

  it("retries a current failed request once at its saved target and rejects stale retry versions", () => {
    const result = requestChapterExplanation({ chapterId, direction: "simpler", requestId, expectedContentVersion: 1, baselineExplanationId: originalId });
    db.update(chapterExplanations).set({ status: "failed", error: "provider failure" }).where(eq(chapterExplanations.id, result.explanation.id)).run();
    expect(() => retryChapterExplanation(chapterId, result.explanation.id, "77777777-7777-4777-8777-777777777777", 2))
      .toThrow(expect.objectContaining({ code: "stale_retry" }));
    const retried = retryChapterExplanation(chapterId, result.explanation.id, retryId, 1);
    expect(retried.explanation.status).toBe("pending");
    expect(retried.explanation.jobVersion).toBe(2);
    expect(retried.explanation.level).toBe(1);
    expect(retried.replay).toBe(false);
    expect(retryChapterExplanation(chapterId, result.explanation.id, retryId, 1).replay).toBe(true);
  });

  it("reads unknown legacy levels honestly while exposing a Guided navigation baseline", () => {
    db.update(chapterExplanations).set({ kind: "legacy", level: null }).where(eq(chapterExplanations.id, originalId)).run();
    const result = readChapterExplanations(chapterId);
    expect(result.effectiveLevel).toBe(2);
    expect(result.legacyBaseline).toBe(true);
    expect(result.sections[0]).toMatchObject({ label: null, level: null });
  });

  it("allows passed chapters and rejects locked chapters", () => {
    expect(readChapterExplanations(chapterId).sections).toHaveLength(1);
    db.update(chapters).set({ status: "locked" }).where(eq(chapters.id, chapterId)).run();
    expect(() => readChapterExplanations(chapterId)).toThrow(ChapterExplanationError);
  });

  it("keeps accepted sections readable while canonical content is being regenerated", () => {
    db.update(chapters).set({ contentGenerationStatus: "generating", contentGenerationVersion: 2 }).where(eq(chapters.id, chapterId)).run();
    const result = readChapterExplanations(chapterId);
    expect(result.sections).toHaveLength(1);
    expect(result.baselineExplanationId).toBeNull();
  });
});
