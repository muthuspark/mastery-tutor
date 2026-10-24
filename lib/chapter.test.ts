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
import { chapterExplanations, chapters, courses } from "./db/schema";
import { runAgentObject } from "./agent";
import { findWikipediaImages } from "./wikipedia-images";
import { generateChapterContent } from "./chapter";
import { chapterSchema } from "./schemas";
import { QualityError } from "./quality-contracts";

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
  expect(vi.mocked(runAgentObject).mock.calls[0][2]).toContain("Guided (2 of 6)");
  expect(chapter.content).toContain(candidate.imageUrl);
  expect(chapter.content).toContain(candidate.pageUrl);
  expect(chapter.content).not.toContain("fake.jpg");
  expect(chapter.contentGenerationStatus).toBe("ready");
  expect(chapter.status).toBe("open");
  expect(chapter.originalExplanationLevel).toBe(2);
  expect(db.select().from(chapterExplanations).all()).toMatchObject([
    { kind: "original", sourceContentVersion: 1, level: 2, content: chapter.content, status: "ready", importKey: "original:1" },
  ]);
});

it("saves a text-only lesson when no images are available", async () => {
  vi.mocked(findWikipediaImages).mockResolvedValue([]);
  vi.mocked(runAgentObject).mockResolvedValue({ content: "A neuron transmits signals.", pretest: "Think", summary: "Signals" });
  expect((await generateChapterContent("chapter", "codex", 1)).content).toBe("A neuron transmits signals.");
});

it("keeps accepted originals and appends a Guided snapshot after explicit regeneration", async () => {
  vi.mocked(runAgentObject)
    .mockResolvedValueOnce({ content: "First original", pretest: "Think", summary: "First" })
    .mockResolvedValueOnce({ content: "Regenerated original", pretest: "Think again", summary: "Second" });
  await generateChapterContent("chapter", "codex", 1);
  db.update(chapters).set({ contentGenerationVersion: 2, contentGenerationStatus: "pending" }).where(eq(chapters.id, "chapter")).run();
  await generateChapterContent("chapter", "codex", 2);

  expect(db.select().from(chapterExplanations).orderBy(chapterExplanations.ordinal).all()).toMatchObject([
    { kind: "original", sourceContentVersion: 1, level: 2, content: "First original", importKey: "original:1" },
    { kind: "original", sourceContentVersion: 2, level: 2, content: "Regenerated original", importKey: "original:2" },
  ]);
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

const malformedMathDraft = {
  content: "A rate measures change.\n\n$$\\frac{T(n+h)-T(n)}h\n=2an+ah+b,$$\n\n### Algebra\n\nContinue with $h\\ne0$.",
  pretest: "What does the rate measure?",
  summary: "Rates measure change.",
};
const repairedMathDraft = {
  ...malformedMathDraft,
  content: "A rate measures change.\n\n$$\n\\frac{T(n+h)-T(n)}{h}\n=2an+ah+b\n$$\n\n### Algebra\n\nContinue with $h\\ne0$.",
};

it.each([null, 1])("repairs invalid math before saving (quality policy %s)", async (qualityPolicyVersion) => {
  db.update(courses).set({ qualityPolicyVersion }).where(eq(courses.id, "course")).run();
  vi.mocked(runAgentObject)
    .mockResolvedValueOnce(malformedMathDraft)
    .mockResolvedValueOnce(repairedMathDraft)
    .mockResolvedValueOnce({ issues: [] });

  const chapter = await generateChapterContent("chapter", "codex", 1);

  expect(chapter.content).toBe(repairedMathDraft.content);
  expect(chapter.contentGenerationStatus).toBe("ready");
  expect(runAgentObject).toHaveBeenNthCalledWith(2, "codex", "chapter", expect.stringContaining("standalone $$ delimiter lines"), chapterSchema);
  expect(vi.mocked(runAgentObject).mock.calls[1][2]).toContain(JSON.stringify(malformedMathDraft.content));
  expect(vi.mocked(runAgentObject).mock.calls.map((call) => call[1])).toEqual(qualityPolicyVersion ? ["chapter", "chapter", "review"] : ["chapter", "chapter"]);
  if (qualityPolicyVersion) expect(vi.mocked(runAgentObject).mock.calls[2][2]).toContain(JSON.stringify(chapterSchema.parse(repairedMathDraft)));
});

it.each([null, 1])("does not publish math that fails both attempts (quality policy %s)", async (qualityPolicyVersion) => {
  db.update(courses).set({ qualityPolicyVersion }).where(eq(courses.id, "course")).run();
  vi.mocked(runAgentObject).mockResolvedValue(malformedMathDraft);

  await expect(generateChapterContent("chapter", "codex", 1)).rejects.toBeInstanceOf(QualityError);

  expect(runAgentObject).toHaveBeenCalledTimes(2);
  const chapter = db.select().from(chapters).get()!;
  expect(chapter.content).toBeNull();
  expect(chapter.contentGenerationStatus).not.toBe("ready");
});
