import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./db", async () => {
  const schema = await import("./db/schema");
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});
vi.mock("./agent", () => ({ runAgentObject: vi.fn(), agentForRequest: vi.fn(), noAgentError: vi.fn() }));
vi.mock("./wikipedia-images", () => ({ findWikipediaImages: vi.fn() }));

import { db } from "./db";
import { chapters, courses } from "./db/schema";
import { runAgentObject } from "./agent";
import { findWikipediaImages } from "./wikipedia-images";
import { generateChapterContent } from "./chapter";
import { chapterSchema } from "./schemas";

const candidate = { title: "Neuron", imageUrl: "https://upload.wikimedia.org/neuron.svg", pageUrl: "https://en.wikipedia.org/wiki/Neuron", caption: "A nerve cell" };
beforeEach(() => {
  vi.resetAllMocks();
  db.delete(chapters).run();
  db.delete(courses).run();
  const createdAt = new Date();
  db.insert(courses).values({ id: "course", topic: "Biology", createdAt }).run();
  db.insert(chapters).values({ id: "chapter", courseId: "course", idx: 0, title: "Neurons", objectives: ["Explain nerve cells"], prerequisites: [], status: "open", createdAt }).run();
  vi.mocked(findWikipediaImages).mockResolvedValue([candidate]);
});

it.each(["codex", "claude"] as const)("supplies candidates to %s and persists verified images with attribution", async (agent) => {
  vi.mocked(runAgentObject).mockResolvedValue({ content: `A neuron transmits signals.\n\n![A nerve cell](${candidate.imageUrl})\n\n![Invented](https://example.com/fake.jpg)`, pretest: "What carries a signal?", summary: "Neurons carry signals." });
  const chapter = await generateChapterContent("chapter", agent, 1);
  expect(findWikipediaImages).toHaveBeenCalledWith("Neurons", ["Explain nerve cells"]);
  expect(runAgentObject).toHaveBeenCalledWith(agent, "chapter", expect.stringContaining(JSON.stringify([candidate])), chapterSchema);
  expect(chapter.content).toContain(candidate.imageUrl);
  expect(chapter.content).toContain(candidate.pageUrl);
  expect(chapter.content).not.toContain("fake.jpg");
  expect(chapter.contentGenerationStatus).toBe("ready");
  expect(chapter.status).toBe("open");
});

it("saves a text-only lesson when no images are available", async () => {
  vi.mocked(findWikipediaImages).mockResolvedValue([]);
  vi.mocked(runAgentObject).mockResolvedValue({ content: "A neuron transmits signals.", pretest: "Think", summary: "Signals" });
  expect((await generateChapterContent("chapter", "codex", 1)).content).toBe("A neuron transmits signals.");
});

it("falls back to text if adding missing image attribution would exceed 600 words", async () => {
  const lesson = Array.from({ length: 598 }, () => "Neuron").join(" ");
  vi.mocked(runAgentObject).mockResolvedValue({ content: `${lesson}\n\n![Neuron](${candidate.imageUrl})`, pretest: "Think", summary: "Signals" });
  const chapter = await generateChapterContent("chapter", "codex", 1);
  expect(chapter.content).toBe(lesson);
  expect(chapter.contentGenerationStatus).toBe("ready");
});

it("does not overwrite a newer chapter generation after image lookup and writing", async () => {
  vi.mocked(runAgentObject).mockImplementation(async () => {
    db.update(chapters).set({ contentGenerationVersion: 2, content: "Newer lesson" }).where(eq(chapters.id, "chapter")).run();
    return { content: "Old lesson", pretest: "Think", summary: "Summary" };
  });
  await expect(generateChapterContent("chapter", "codex", 1)).rejects.toThrow("stale");
  expect(db.select().from(chapters).get()?.content).toBe("Newer lesson");
});
