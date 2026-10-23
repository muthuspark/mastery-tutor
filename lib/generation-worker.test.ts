import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", async () => {
  const schema = await import("./db/schema");
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});
vi.mock("./agent", () => ({ agentForRequest: vi.fn() }));
vi.mock("./chapter", () => ({ generateChapterContent: vi.fn() }));
vi.mock("./quiz", () => ({ generateQuiz: vi.fn() }));
vi.mock("./course-planner", () => ({ prepareCourse: vi.fn() }));

import { db } from "./db";
import { chapters, courses, generationJobs } from "./db/schema";
import { agentForRequest } from "./agent";
import { generateChapterContent } from "./chapter";
import { claimGenerationJob, enqueueGenerationJob, getGenerationJob } from "./generation";
import { processGenerationJob } from "./generation-worker";
import { QualityError } from "./quality-contracts";
import { CodexError } from "./codex-errors";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
  vi.resetAllMocks();
  db.delete(generationJobs).run();
  db.delete(chapters).run();
  db.delete(courses).run();
  db.insert(courses).values({ id: "course", topic: "Probability", qualityPolicyVersion: 1, createdAt: new Date() }).run();
  db.insert(chapters).values({ id: "chapter", courseId: "course", idx: 0, title: "Independence", objectives: ["Explain independence"], prerequisites: [], status: "open", createdAt: new Date() }).run();
  vi.mocked(agentForRequest).mockResolvedValue("codex");
});

afterEach(() => vi.useRealTimers());

function claim(id: string) {
  const job = claimGenerationJob(id, "test-worker");
  if (!job) throw new Error("Expected a claimable generation job");
  return job;
}

it("automatically retries a rejected chapter and publishes only the accepted attempt", async () => {
  vi.mocked(generateChapterContent)
    .mockRejectedValueOnce(new QualityError("The example contains inconsistent probabilities."))
    .mockImplementationOnce(async () => db.update(chapters).set({ content: "Accepted lesson", contentGenerationStatus: "ready", contentGenerationError: null }).where(eq(chapters.id, "chapter")).returning().get()!);
  const job = enqueueGenerationJob("chapter", "chapter", 1);

  expect(await processGenerationJob(claim(job.id), "test-worker")).toBe("pending");
  expect(getGenerationJob(job.id)?.attempts).toBe(1);
  expect(db.select().from(chapters).get()).toMatchObject({ content: null, contentGenerationStatus: "pending", contentGenerationVersion: 1 });
  expect(db.select().from(generationJobs).all()).toHaveLength(1);
  expect(claimGenerationJob(job.id, "test-worker")).toBeUndefined();

  await vi.advanceTimersByTimeAsync(5_000);
  expect(await processGenerationJob(claim(job.id), "test-worker")).toBe("completed");
  expect(getGenerationJob(job.id)).toMatchObject({ attempts: 2, status: "completed" });
  expect(db.select().from(chapters).get()).toMatchObject({ content: "Accepted lesson", contentGenerationStatus: "ready", contentGenerationVersion: 1 });
  expect(db.select().from(generationJobs).all().filter(item => item.artifactType === "quiz")).toHaveLength(1);
});

it("stops after three rejected attempts without publishing or scheduling a quiz", async () => {
  vi.mocked(generateChapterContent).mockRejectedValue(new QualityError("The example is still incorrect."));
  const job = enqueueGenerationJob("chapter", "chapter", 1);

  expect(await processGenerationJob(claim(job.id), "test-worker")).toBe("pending");
  await vi.advanceTimersByTimeAsync(5_000);
  expect(await processGenerationJob(claim(job.id), "test-worker")).toBe("pending");
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await processGenerationJob(claim(job.id), "test-worker")).toBe("failed");

  expect(generateChapterContent).toHaveBeenCalledTimes(3);
  expect(getGenerationJob(job.id)).toMatchObject({ status: "failed", attempts: 3 });
  expect(db.select().from(chapters).get()).toMatchObject({ content: null, contentGenerationStatus: "failed", contentGenerationError: "The example is still incorrect." });
  expect(db.select().from(generationJobs).all()).toHaveLength(1);
  expect(claimGenerationJob(job.id, "test-worker")).toBeUndefined();
});

it("does not retry permanent provider failures", async () => {
  vi.mocked(agentForRequest).mockRejectedValue(new CodexError("failed", "Authentication failed", false));
  const job = enqueueGenerationJob("chapter", "chapter", 1);

  expect(await processGenerationJob(claim(job.id), "test-worker")).toBe("failed");
  expect(getGenerationJob(job.id)).toMatchObject({ status: "failed", attempts: 1 });
  expect(generateChapterContent).not.toHaveBeenCalled();
});
