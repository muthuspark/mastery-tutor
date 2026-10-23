import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});
vi.mock("@/lib/generation-worker", () => ({ processGenerationJob: vi.fn() }));
vi.mock("@/lib/markdown", () => ({ renderMarkdown: vi.fn(async (content: string) => `<p>${content}</p>`) }));

import { GET, POST } from "./api/chapters/[id]/route";
import { db } from "@/lib/db";
import { chapters, chapterVersions, courses, generationJobs } from "@/lib/db/schema";

const context = { params: Promise.resolve({ id: "chapter" }) };
const read = () => GET(new Request("http://localhost/api/chapters/chapter"), context);
const adjust = (difficulty: "easy" | "hard") => POST(new Request("http://localhost/api/chapters/chapter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ difficulty }) }), context);

beforeEach(() => {
  db.delete(generationJobs).run();
  db.delete(courses).run();
  db.insert(courses).values({ id: "course", topic: "Probability", qualityPolicyVersion: 1, createdAt: new Date() }).run();
  db.insert(chapters).values({ id: "chapter", courseId: "course", idx: 0, title: "Conditioning", objectives: ["Choose a denominator"], prerequisites: [], status: "passed", content: "Original lesson", contentGenerationStatus: "ready", generatedAt: new Date(), createdAt: new Date() }).run();
});

it.each([null, 1])("preserves all earlier explanations across adjustments and fresh reads (quality policy %s)", async qualityPolicyVersion => {
  db.update(courses).set({ qualityPolicyVersion }).where(eq(courses.id, "course")).run();
  expect((await adjust("easy")).status).toBe(200);
  expect(db.select().from(chapterVersions).all()).toMatchObject([{ generationVersion: 1, content: "Original lesson", depthHint: null }]);
  expect(db.select().from(chapters).get()).toMatchObject({ content: "Original lesson", status: "passed", depthHint: "easy", contentGenerationVersion: 2 });
  const pending = await read();
  expect(pending.status).toBe(200);
  expect(await pending.json()).toMatchObject({ chapter: { contentGenerationStatus: "pending" }, versions: [{ generationVersion: 1, html: "<p>Original lesson</p>" }] });

  // Simulate publication by the worker after review accepts the new explanation.
  db.update(chapters).set({ content: "Deeper lesson", contentGenerationStatus: "ready" }).where(eq(chapters.id, "chapter")).run();
  expect((await (await read()).json()).versions).toMatchObject([{ generationVersion: 1, html: "<p>Original lesson</p>" }, { generationVersion: 2, depthHint: "easy", html: "<p>Deeper lesson</p>" }]);

  expect((await adjust("hard")).status).toBe(200);
  db.update(chapters).set({ content: "Simpler lesson", contentGenerationStatus: "ready" }).where(eq(chapters.id, "chapter")).run();
  const reloaded = await (await read()).json();
  expect(reloaded.versions.map((v: { html: string }) => v.html)).toEqual(["<p>Original lesson</p>", "<p>Deeper lesson</p>", "<p>Simpler lesson</p>"]);
  expect(reloaded.chapter.content).toBe("Simpler lesson");
  expect(reloaded.chapter.status).toBe("passed");
});

it("rejects overlapping adjustments without losing or duplicating the saved explanation", async () => {
  await adjust("easy");
  expect((await adjust("hard")).status).toBe(409);
  expect(db.select().from(chapterVersions).all()).toHaveLength(1);
  expect(db.select().from(generationJobs).all()).toHaveLength(1);
  expect(db.select().from(chapters).get()).toMatchObject({ contentGenerationVersion: 2, depthHint: "easy", content: "Original lesson" });
});

it("keeps accepted text readable when the new explanation fails quality review", async () => {
  await adjust("hard");
  db.update(chapters).set({ contentGenerationStatus: "failed", contentGenerationError: "Repeated quality rejection" }).where(eq(chapters.id, "chapter")).run();
  const response = await read();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ chapter: { contentGenerationStatus: "failed" }, versions: [{ html: "<p>Original lesson</p>" }] });
});

it("refuses adjustments to locked chapters", async () => {
  db.update(chapters).set({ status: "locked" }).where(eq(chapters.id, "chapter")).run();
  expect((await adjust("hard")).status).toBe(403);
  expect(db.select().from(chapterVersions).all()).toHaveLength(0);
  expect(db.select().from(generationJobs).all()).toHaveLength(0);
});
