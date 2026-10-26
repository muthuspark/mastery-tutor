vi.mock("@/lib/access", () => ({ authorize: async () => ({ user: { id: "test-user" } }) }));
import { beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/agent", async (original) => ({
  ...await original<typeof import("@/lib/agent")>(),
  agentForRequest: vi.fn().mockResolvedValue("codex"),
  runAgentObject: vi.fn(),
}));
vi.mock("@/lib/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("@/lib/db/schema");
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.run("INSERT OR IGNORE INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('test-user','','test@example.com',1,1,1)");
  return { db };
});

import { GET, POST } from "@/app/api/courses/route";
import { db } from "@/lib/db";
import { chapters, courses, generationJobs } from "@/lib/db/schema";
import { runAgentObject } from "@/lib/agent";
import { samplePlan } from "../test/quality-fixtures";
import { claimGenerationJob } from "@/lib/generation";
import { processGenerationJob } from "@/lib/generation-worker";

beforeEach(() => {
  db.delete(generationJobs).run();
  db.delete(chapters).run();
  db.delete(courses).run();
  vi.clearAllMocks();
});

it.each([
  ["i am having trouble understanding differential equations, help me master it", "Differential Equations"],
  ["Help me learn distributed systems for backend engineering interviews", "Distributed Systems for Backend Interviews"],
])("stores the generated title for learning request: %s", async (request, title) => {
  vi.mocked(runAgentObject).mockResolvedValueOnce({ ...samplePlan(), topic: title }).mockResolvedValueOnce({ issues: [] });
  const response = await POST(new Request("http://localhost/api/courses", { method: "POST", body: JSON.stringify({ topic: request }) }));
  expect(response.status).toBe(202);
  const { courseId } = await response.json();
  const job = db.select().from(generationJobs).where(eq(generationJobs.targetId, courseId)).get()!;
  expect(await processGenerationJob(claimGenerationJob(job.id, "test")!, "test")).toBe("completed");
  expect(runAgentObject).toHaveBeenCalledWith("codex", "syllabus", expect.stringContaining(request), expect.anything());
  expect(db.select().from(courses).where(eq(courses.id, courseId)).get()?.topic).toBe(title);
  const listed = await (await GET()).json();
  expect(listed.courses[0].topic).toBe(title);
  expect(listed.courses[0].progress.total).toBe(1);
});

it("returns current mastery counts for every course, including empty and reopened courses", async () => {
  expect(await (await GET()).json()).toEqual({ courses: [] });
  const now = new Date();
  db.insert(courses).values([
    { userId: "test-user", id: "empty", topic: "Empty", createdAt: now },
    { userId: "test-user", id: "partial", topic: "Partial", createdAt: new Date(now.getTime() + 1) },
    { userId: "test-user", id: "complete", topic: "Complete", completedAt: now, createdAt: new Date(now.getTime() + 2) },
  ]).run();
  for (const [courseId, statuses] of [
    ["partial", ["passed", "open", "locked"]],
    ["complete", ["passed", "passed"]],
  ] as const) {
    statuses.forEach((status, idx) => db.insert(chapters).values({
      id: `${courseId}-${idx}`, courseId, idx, title: `Chapter ${idx}`, objectives: ["Learn"], prerequisites: [], status, createdAt: now,
    }).run());
  }
  const body = await (await GET()).json();
  expect(body.courses.map((course: { id: string; progress: unknown }) => [course.id, course.progress])).toEqual([
    ["empty", { passed: 0, total: 0 }],
    ["partial", { passed: 1, total: 3 }],
    ["complete", { passed: 2, total: 2 }],
  ]);
  expect(body.courses[1].topic).toBe("Partial");
  db.update(chapters).set({ status: "open" }).where(eq(chapters.id, "complete-0")).run();
  const updated = await (await GET()).json();
  expect(updated.courses[2].progress).toEqual({ passed: 1, total: 2 });
});
