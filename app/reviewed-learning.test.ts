import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});
vi.mock("@/lib/agent", async (original) => ({ ...await original<typeof import("@/lib/agent")>(), agentForRequest: vi.fn().mockResolvedValue("codex"), runAgentObject: vi.fn() }));
vi.mock("@/lib/wikipedia-images", () => ({ findWikipediaImages: vi.fn().mockResolvedValue([]) }));
import { db } from "@/lib/db";
import { chapters, courses, generationJobs, questions } from "@/lib/db/schema";
import { runAgentObject } from "@/lib/agent";
import { generateChapterContent } from "@/lib/chapter";
import { generateQuiz } from "@/lib/quiz";
import { GET as readChapter } from "@/app/api/chapters/[id]/route";
import { GET as readQuiz } from "@/app/api/chapters/[id]/quiz/route";
import { POST as retryQuiz } from "@/app/api/chapters/[id]/quiz/retry/route";
import { PATCH } from "@/app/api/courses/[id]/route";
import { samplePlan } from "../test/quality-fixtures";

const chapterId = "00000000-0000-4000-8000-000000000123";
const context = { params: Promise.resolve({ id: chapterId }) };
beforeEach(() => {
  vi.mocked(runAgentObject).mockReset();
  db.delete(generationJobs).run(); db.delete(questions).run(); db.delete(chapters).run(); db.delete(courses).run();
  db.insert(courses).values({ id: "course", topic: "OS", learningRequest: "Explain isolation mechanisms", brief: samplePlan().brief, qualityPolicyVersion: 1, generationAgent: "codex", createdAt: new Date() }).run();
  db.insert(chapters).values({ ...samplePlan().chapters[0], id: chapterId, courseId: "course", idx: 0, status: "open", createdAt: new Date() }).run();
});

it("reviews the normalized lesson and grounds quiz writing and review in the accepted lesson", async () => {
  vi.mocked(runAgentObject).mockResolvedValueOnce({ content: "Two processes map address 42 to different physical locations.", pretest: "Predict", summary: "Private address spaces" }).mockResolvedValueOnce({ issues: [] });
  await generateChapterContent(chapterId, "codex", 1);
  const lessonPrompt = vi.mocked(runAgentObject).mock.calls[0][2];
  expect(lessonPrompt).toContain("Explain isolation mechanisms");
  expect(lessonPrompt).toContain("Complete accepted outline");
  expect(lessonPrompt).toContain("Trace two processes reading the same address");
  vi.mocked(runAgentObject).mockReset().mockResolvedValueOnce({ questions: Array.from({ length: 10 }, (_, idx) => ({ type: "mcq", prompt: `Trace ${idx}`, options: ["Private", "Shared", "Unmapped", "Disk"], modelAnswer: "Private", rubric: "Correct mapping", conceptTag: "isolation" })) }).mockResolvedValueOnce({ issues: [] });
  await generateQuiz(chapterId, "codex", 1);
  for (const call of vi.mocked(runAgentObject).mock.calls) expect(call[2]).toContain("Two processes map address 42");
  expect(db.select().from(questions).all()).toHaveLength(10);
});

it("does not publish a lesson that repeatedly fails review", async () => {
  const draft = { content: "A lesson", pretest: "Think", summary: "Summary" };
  const review = { issues: [{ severity: "blocking", category: "alignment", location: "content", evidence: "Missing isolation", guidance: "Explain isolation" }] };
  vi.mocked(runAgentObject).mockResolvedValueOnce(draft).mockResolvedValueOnce(review).mockResolvedValueOnce(draft).mockResolvedValueOnce(review);
  await expect(generateChapterContent(chapterId, "codex", 1)).rejects.toThrow("quality review");
  expect(db.select().from(chapters).get()?.content).toBeNull();
});

it("returns pending/failure without publishing retained text or restarting failed jobs", async () => {
  db.update(chapters).set({ content: "Old lesson", contentGenerationVersion: 2, contentGenerationStatus: "failed", quizGenerationStatus: "failed" }).where(eq(chapters.id, chapterId)).run();
  const failed = await readChapter(new Request("http://localhost"), context);
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("Old lesson");
  expect((await readQuiz(new Request("http://localhost"), context)).status).toBe(503);
  expect(db.select().from(generationJobs).all()).toEqual([]);
  db.update(chapters).set({ contentGenerationStatus: "pending" }).where(eq(chapters.id, chapterId)).run();
  expect((await readChapter(new Request("http://localhost"), context)).status).toBe(202);
  expect(runAgentObject).not.toHaveBeenCalled();
});

it("coalesces explicit quiz retries and refuses a quiz without an accepted lesson", async () => {
  expect((await retryQuiz(new Request("http://localhost"), context)).status).toBe(409);
  db.update(chapters).set({ content: "Accepted", contentGenerationStatus: "ready", quizGenerationStatus: "failed" }).where(eq(chapters.id, chapterId)).run();
  expect((await retryQuiz(new Request("http://localhost"), context)).status).toBe(202);
  expect((await retryQuiz(new Request("http://localhost"), context)).status).toBe(202);
  expect(db.select().from(generationJobs).all()).toHaveLength(1);
});

const edit = (prerequisites: number[] = []) => PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ chapters: [{ id: chapterId, title: "Isolation mechanisms", objectives: ["Explain isolation"], prerequisites }] }) }), { params: Promise.resolve({ id: "course" }) });
it("checks the complete edited graph before review and invalidates pending warm-up after accepted edits", async () => {
  expect((await edit([0])).status).toBe(400);
  expect(runAgentObject).not.toHaveBeenCalled();
  vi.mocked(runAgentObject).mockResolvedValue({ issues: [] });
  expect((await edit()).status).toBe(200);
  expect(db.select().from(courses).get()?.preparationVersion).toBe(2);
  expect(db.select().from(chapters).get()?.contentGenerationVersion).toBe(2);
});
it("rejects edits if first-lesson publication starts study while review is running", async () => {
  vi.mocked(runAgentObject).mockImplementation(async () => {
    db.update(courses).set({ startedAt: new Date() }).where(eq(courses.id, "course")).run();
    return { issues: [] };
  });
  expect((await edit()).status).toBe(409);
  expect(db.select().from(chapters).get()?.title).toBe("Process isolation");
});
