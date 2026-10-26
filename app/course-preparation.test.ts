vi.mock("@/lib/access", () => ({ authorize: async () => ({ user: { id: "test-user" } }) }));
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  db.run("INSERT OR IGNORE INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('test-user','','test@example.com',1,1,1)");
  return { db };
});
// Retain the request schema without launching CLIs.
vi.mock("@/lib/agent", async (original) => ({ ...await original<typeof import("@/lib/agent")>(), agentForRequest: vi.fn().mockResolvedValue("claude"), runAgentObject: vi.fn() }));

import { db } from "@/lib/db";
import { chapters, courses, generationJobs } from "@/lib/db/schema";
import { runAgentObject } from "@/lib/agent";
import { POST } from "@/app/api/courses/route";
import { POST as retry } from "@/app/api/courses/[id]/retry/route";
import { claimGenerationJob } from "@/lib/generation";
import { processGenerationJob } from "@/lib/generation-worker";
import { samplePlan } from "../test/quality-fixtures";

beforeEach(() => { vi.clearAllMocks(); db.delete(generationJobs).run(); db.delete(chapters).run(); db.delete(courses).run(); });
afterEach(() => vi.useRealTimers());
async function pending() {
  const response = await POST(new Request("http://localhost/api/courses", { method: "POST", body: JSON.stringify({ topic: "Learn OS mechanisms" }) }));
  expect(response.status).toBe(202);
  const { courseId } = await response.json();
  const job = db.select().from(generationJobs).where(eq(generationJobs.targetId, courseId)).get()!;
  return { courseId, job };
}

it("persists intent and selected agent, then publishes only the accepted plan and queues chapter zero", async () => {
  const { courseId, job } = await pending();
  expect(runAgentObject).not.toHaveBeenCalled();
  expect(db.select().from(chapters).all()).toEqual([]);
  expect(db.select().from(courses).get()).toMatchObject({ learningRequest: "Learn OS mechanisms", generationAgent: "claude", preparationStatus: "pending" });
  vi.mocked(runAgentObject).mockResolvedValueOnce(samplePlan()).mockResolvedValueOnce({ issues: [] });
  const claimed = claimGenerationJob(job.id, "worker")!;
  expect(await processGenerationJob(claimed, "worker")).toBe("completed");
  expect(db.select().from(courses).get()).toMatchObject({ id: courseId, topic: "Operating Systems", preparationStatus: "ready", brief: samplePlan().brief });
  expect(db.select().from(chapters).all()).toHaveLength(1);
  expect(db.select().from(generationJobs).all().filter((item) => item.artifactType === "chapter")).toHaveLength(1);
  expect(runAgentObject).toHaveBeenCalledWith("claude", "review", expect.any(String), expect.anything());
});

it("keeps rejected plans unpublished and retries explicitly without duplicate jobs", async () => {
  vi.useFakeTimers();
  const { courseId, job } = await pending();
  vi.mocked(runAgentObject).mockResolvedValue({});
  expect(await processGenerationJob(claimGenerationJob(job.id, "worker")!, "worker")).toBe("pending");
  expect(db.select().from(chapters).all()).toEqual([]);
  expect(db.select().from(courses).get()?.preparationStatus).toBe("pending");
  await vi.advanceTimersByTimeAsync(5_000);
  expect(await processGenerationJob(claimGenerationJob(job.id, "worker")!, "worker")).toBe("pending");
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await processGenerationJob(claimGenerationJob(job.id, "worker")!, "worker")).toBe("failed");
  expect(db.select().from(chapters).all()).toEqual([]);
  expect(db.select().from(courses).get()?.preparationStatus).toBe("failed");
  const context = { params: Promise.resolve({ id: courseId }) };
  expect((await retry(new Request("http://localhost"), context)).status).toBe(202);
  expect((await retry(new Request("http://localhost"), context)).status).toBe(202);
  expect(db.select().from(generationJobs).all()).toHaveLength(1);
  expect(db.select().from(courses).get()?.preparationStatus).toBe("pending");
});

it("refuses to publish after another worker takes the lease", async () => {
  const { job } = await pending();
  vi.mocked(runAgentObject).mockResolvedValueOnce(samplePlan()).mockImplementationOnce(async () => {
    db.update(generationJobs).set({ leaseOwner: "other" }).where(eq(generationJobs.id, job.id)).run();
    return { issues: [] };
  });
  expect(await processGenerationJob(claimGenerationJob(job.id, "worker")!, "worker")).toBe("lost");
  expect(db.select().from(chapters).all()).toEqual([]);
  expect(db.select().from(courses).get()?.preparationStatus).toBe("generating");
});

it("renews the lease during a long review and safely completes after the original lease would expire", async () => {
  vi.useFakeTimers();
  const { job } = await pending();
  let finish!: (value: { issues: [] }) => void;
  vi.mocked(runAgentObject).mockResolvedValueOnce(samplePlan()).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const result = processGenerationJob(claimGenerationJob(job.id, "worker")!, "worker");
  await vi.advanceTimersByTimeAsync(150_000);
  expect(db.select().from(generationJobs).where(eq(generationJobs.id, job.id)).get()!.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  finish({ issues: [] });
  expect(await result).toBe("completed");
  expect(vi.getTimerCount()).toBe(0);
});
