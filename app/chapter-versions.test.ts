vi.mock("@/lib/access", () => ({ authorize: async () => ({ user: { id: "test-user" } }) }));
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
  db.run("INSERT OR IGNORE INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('test-user','','test@example.com',1,1,1)");
  return { db };
});

import { GET as getExplanations } from "./api/chapters/[id]/explanations/route";
import { POST as adjust, regenerateChapter } from "./api/chapters/[id]/route";
import { db } from "@/lib/db";
import { chapterExplanations, chapters, courses, generationJobs } from "@/lib/db/schema";

const context = { params: Promise.resolve({ id: "chapter" }) };
const read = () => getExplanations(new Request("http://localhost/api/chapters/chapter/explanations"), context);
const update = (difficulty: "easy" | "hard") => adjust(new Request("http://localhost/api/chapters/chapter", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ difficulty }),
}), context);

beforeEach(() => {
  db.delete(generationJobs).run();
  db.delete(courses).run();
  db.insert(courses).values({ userId: "test-user", id: "course", topic: "Probability", qualityPolicyVersion: 1, createdAt: new Date() }).run();
  db.insert(chapters).values({
    id: "chapter", courseId: "course", idx: 0, title: "Conditioning", objectives: ["Choose a denominator"],
    prerequisites: [], status: "passed", content: "Original lesson", contentGenerationStatus: "ready",
    generatedAt: new Date(), createdAt: new Date(),
  }).run();
});

it.each([null, 1])("maps legacy difficulty feedback to one adjacent explanation request (quality policy %s)", async qualityPolicyVersion => {
  db.update(courses).set({ qualityPolicyVersion }).where(eq(courses.id, "course")).run();
  expect((await update("easy")).status).toBe(202);
  const chapter = db.select().from(chapters).get();
  expect(chapter).toMatchObject({ content: "Original lesson", contentGenerationVersion: 1, contentGenerationStatus: "ready", depthHint: null });
  expect(db.select().from(generationJobs).all()).toMatchObject([{ artifactType: "explanation", generationVersion: 1 }]);
  const rows = db.select().from(chapterExplanations).orderBy(chapterExplanations.ordinal).all();
  expect(rows).toMatchObject([
    { kind: "legacy", level: null, content: "Original lesson", status: "ready" },
    { kind: "alternative", level: 3, direction: "deeper", status: "pending" },
  ]);
  expect((await update("hard")).status).toBe(409);
  expect(db.select().from(chapterExplanations).all()).toHaveLength(2);

  const pendingRead = await read();
  expect(pendingRead.status).toBe(200);
  expect(await pendingRead.json()).toMatchObject({
    canonicalVersion: 1,
    effectiveLevel: 2,
    legacyBaseline: true,
    sections: [{ content: "Original lesson", level: null, label: null }],
    activeRequest: { status: "pending", level: 3 },
  });
});

it("retains accepted text and exposes a failed request without advancing the level", async () => {
  await update("hard");
  const alternative = db.select().from(chapterExplanations).where(eq(chapterExplanations.kind, "alternative")).get()!;
  db.update(chapterExplanations).set({ status: "failed", error: "Repeated quality rejection" }).where(eq(chapterExplanations.id, alternative.id)).run();
  const response = await read();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    effectiveLevel: 2,
    sections: [{ content: "Original lesson" }],
    activeRequest: null,
    failedRequest: { id: alternative.id, status: "failed", level: 1, jobVersion: 1 },
  });
});

it("blocks explicit canonical regeneration while an alternative request is active", async () => {
  await update("easy");
  const response = await regenerateChapter("chapter");
  expect(response).toBeInstanceOf(Response);
  expect((response as Response).status).toBe(409);
  expect(db.select().from(chapters).get()).toMatchObject({ contentGenerationVersion: 1, content: "Original lesson" });
  expect(db.select().from(generationJobs).all()).toMatchObject([{ artifactType: "explanation" }]);
});

it("refuses adjustments to locked chapters without creating explanations or jobs", async () => {
  db.update(chapters).set({ status: "locked" }).where(eq(chapters.id, "chapter")).run();
  expect((await update("hard")).status).toBe(403);
  expect(db.select().from(chapterExplanations).all()).toHaveLength(0);
  expect(db.select().from(generationJobs).all()).toHaveLength(0);
});
