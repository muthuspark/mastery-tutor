import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  execFile: vi.fn((_cmd, _args, callback) => callback(new Error("absent"), "", "")),
}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});
import { db } from "@/lib/db";
import { chapters, courses, generationJobs, learnerProfile } from "@/lib/db/schema";
import { POST } from "./api/courses/route";
import { claimGenerationJob } from "@/lib/generation";
import { processGenerationJob } from "@/lib/generation-worker";
import { saveProfile } from "@/lib/profile";
import { samplePlan } from "../test/quality-fixtures";
const mockFetch = vi.fn<typeof fetch>();
const complete = (data: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(data) } }] });
const request = () => new Request("http://localhost/api/courses", { method: "POST", body: JSON.stringify({ topic: "Learn OS mechanisms", agent: "deepseek" }) });
beforeEach(() => {
  db.delete(learnerProfile).run();
  db.delete(generationJobs).run(); db.delete(chapters).run(); db.delete(courses).run();
  vi.stubEnv("DEEPSEEK_API_KEY", "sentinel-secret"); vi.stubGlobal("fetch", mockFetch); mockFetch.mockReset();
  saveProfile("", "deepseek");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("stores the chosen provider and resumes reviewed generation with no CLI or secret persistence", async () => {
  const response = await POST(request());
  expect(response.status).toBe(202);
  expect(JSON.stringify(await response.json())).not.toContain("sentinel-secret");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(db.select().from(courses).get()?.generationAgent).toBe("deepseek");
  mockFetch.mockResolvedValueOnce(complete(samplePlan())).mockResolvedValueOnce(complete({ issues: [] }));
  const job = db.select().from(generationJobs).get()!;
  expect(await processGenerationJob(claimGenerationJob(job.id, "resumed")!, "resumed")).toBe("completed");
  expect(db.select().from(courses).get()).toMatchObject({ generationAgent: "deepseek", preparationStatus: "ready" });
  expect(db.select().from(chapters).all()).toHaveLength(1);
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(db.select().from(courses).all())).not.toContain("sentinel-secret");
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("sentinel-secret");
});

it("repairs invalid output through the existing quality layer before saving", async () => {
  await POST(request());
  mockFetch.mockResolvedValueOnce(complete({})).mockResolvedValueOnce(complete(samplePlan())).mockResolvedValueOnce(complete({ issues: [] }));
  const job = db.select().from(generationJobs).get()!;
  expect(await processGenerationJob(claimGenerationJob(job.id, "worker")!, "worker")).toBe("completed");
  expect(mockFetch).toHaveBeenCalledTimes(3);
  expect(db.select().from(chapters).all()).toHaveLength(1);
});

it.each([0, 401, 402, 429])("retains provider on configuration/upstream failure %i", async (status) => {
  await POST(request());
  if (status === 0) vi.stubEnv("DEEPSEEK_API_KEY", "");
  else mockFetch.mockResolvedValue(new Response("sentinel-secret", { status }));
  const job = db.select().from(generationJobs).get()!;
  expect(await processGenerationJob(claimGenerationJob(job.id, "worker")!, "worker")).toBe(status === 429 ? "pending" : "failed");
  expect(db.select().from(chapters).all()).toEqual([]);
  expect(db.select().from(courses).get()?.generationAgent).toBe("deepseek");
  expect(mockFetch).toHaveBeenCalledTimes(status === 0 ? 0 : 1);
  expect(JSON.stringify(db.select().from(generationJobs).all())).not.toContain("sentinel-secret");
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("sentinel-secret");
});

it("rejects an unavailable explicit provider before writing a course or job", async () => {
  vi.stubEnv("DEEPSEEK_API_KEY", "");
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "not_found", retryable: false } });
  expect(db.select().from(courses).all()).toEqual([]);
  expect(db.select().from(generationJobs).all()).toEqual([]);
});

it("uses the latest profile agent for future work in an existing course", async () => {
  await POST(request());
  saveProfile("", "claude");
  // No Claude executable is configured. It must fail instead of using the course's DeepSeek tag.
  const job = db.select().from(generationJobs).get()!;
  expect(await processGenerationJob(claimGenerationJob(job.id, "worker")!, "worker")).toBe("failed");
  expect(mockFetch).not.toHaveBeenCalled();
  expect(db.select().from(courses).get()?.generationAgent).toBe("deepseek");
});

it("uses the profile even when a course records a different original generation agent", async () => {
  await POST(request());
  db.update(courses).set({ generationAgent: "codex" }).run();
  mockFetch.mockResolvedValueOnce(complete(samplePlan())).mockResolvedValueOnce(complete({ issues: [] }));
  const job = db.select().from(generationJobs).get()!;
  expect(await processGenerationJob(claimGenerationJob(job.id, "worker")!, "worker")).toBe("completed");
  expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(db.select().from(courses).get()?.generationAgent).toBe("codex");
});
