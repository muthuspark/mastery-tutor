import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { chapters, courses, generationJobs } from "./db/schema";
import {
  GENERATION_MAX_ATTEMPTS,
  claimGenerationJob,
  completeGenerationJob,
  enqueueGenerationJob,
  failGenerationJob,
  recoverExpiredGenerationJobs,
} from "./generation";
import { startGenerationWorker } from "./generation-worker";
import { recordGenerationEvent } from "./generation-observability";

vi.mock("server-only", () => ({}));
// Keep coordinator transactions and worker polling isolated from parallel suites.
vi.mock("./db", async () => {
  const schema = await import("./db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});

const cleanup: Array<{ courseId: string; chapterId: string }> = [];

afterEach(() => {
  for (const item of cleanup.splice(0)) {
    db.delete(generationJobs).where(eq(generationJobs.targetId, item.chapterId)).run();
    db.delete(chapters).where(eq(chapters.id, item.chapterId)).run();
    db.delete(courses).where(eq(courses.id, item.courseId)).run();
  }
});

function fixture() {
  const courseId = randomUUID();
  const chapterId = randomUUID();
  const now = new Date();
  db.insert(courses).values({ id: courseId, topic: "Coordinator test", level: "foundational", createdAt: now }).run();
  db.insert(chapters).values({
    id: chapterId,
    courseId,
    idx: 0,
    title: "Coordinator chapter",
    objectives: ["Test coordination"],
    prerequisites: [],
    status: "open",
    createdAt: now,
  }).run();
  cleanup.push({ courseId, chapterId });
  return { courseId, chapterId, now };
}

describe("generation coordinator", () => {
  it("coalesces duplicate jobs and completes an owned lease", () => {
    const { chapterId, now } = fixture();
    const first = enqueueGenerationJob("chapter", chapterId, 1, now);
    const duplicate = enqueueGenerationJob("chapter", chapterId, 1, now);
    expect(duplicate.id).toBe(first.id);

    const claimed = claimGenerationJob(first.id, "test-worker", now);
    expect(claimed?.status).toBe("running");
    expect(completeGenerationJob(first.id, "test-worker", new Date(now.getTime() + 1_000))).toBe(true);
    expect(db.select().from(generationJobs).where(eq(generationJobs.id, first.id)).get()?.status).toBe("completed");
  });

  it("retries retryable failures and recovers expired leases", () => {
    const { chapterId, now } = fixture();
    const job = enqueueGenerationJob("chapter", chapterId, 1, now);
    const claimed = claimGenerationJob(job.id, "test-worker", now);
    expect(claimed).toBeDefined();
    expect(failGenerationJob(job.id, "test-worker", "temporary", true, now)).toBe("pending");

    const retryAt = new Date(now.getTime() + 6_000);
    const retried = claimGenerationJob(job.id, "test-worker-2", retryAt);
    expect(retried?.attempts).toBe(2);
    expect(failGenerationJob(job.id, "test-worker-2", "temporary", true, retryAt)).toBe("pending");

    const thirdAt = new Date(retryAt.getTime() + 11_000);
    const third = claimGenerationJob(job.id, "test-worker-3", thirdAt);
    expect(third?.attempts).toBe(3);
    expect(failGenerationJob(job.id, "test-worker-3", "permanent", true, thirdAt)).toBe("failed");
    expect(GENERATION_MAX_ATTEMPTS).toBe(3);
  });

  it("reclaims an expired running job", () => {
    const { chapterId, now } = fixture();
    const job = enqueueGenerationJob("chapter", chapterId, 1, now);
    const claimed = claimGenerationJob(job.id, "test-worker", now);
    expect(claimed).toBeDefined();
    const recovered = recoverExpiredGenerationJobs(new Date(now.getTime() + 121_000));
    expect(recovered).toBe(1);
    expect(claimGenerationJob(job.id, "test-worker-2", new Date(now.getTime() + 121_000))).toBeDefined();
  });

  it("starts and stops the polling worker cleanly", async () => {
    const stop = startGenerationWorker({ pollIntervalMs: 10, workerId: "lifecycle-test-worker" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(() => stop()).not.toThrow();
  });

  it("records only redacted observability fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    recordGenerationEvent("job_completed", { targetId: "chapter-1", generationVersion: 1, durationMs: 20 });
    const payload = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(payload.targetId).toBe("chapter-1");
    expect(payload.prompt).toBeUndefined();
    expect(payload.answer).toBeUndefined();
    expect(payload.content).toBeUndefined();
    info.mockRestore();
  });
});
