import "server-only";

import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "./db";
import { chapters, courses, reviewItems } from "./db/schema";
import { agentForRequest, noAgentError, runAgentObject, type Agent } from "./agent";
import { CHAPTER_PROMPT } from "./prompts";
import { chapterSchema } from "./schemas";

export async function generateChapterContent(
  id: string,
  agent?: Agent,
  generationVersion?: number,
) {
  const chapter = db.select().from(chapters).where(eq(chapters.id, id)).get();
  if (!chapter) throw new Error("Chapter not found");
  if (chapter.status === "locked") throw new Error("This chapter is locked");

  const version = generationVersion ?? chapter.contentGenerationVersion;
  if (version !== chapter.contentGenerationVersion) throw new Error("Chapter generation is stale");
  const course = db.select().from(courses).where(eq(courses.id, chapter.courseId)).get();
  if (!course) throw new Error("Course not found");

  const previous = db
    .select({ idx: chapters.idx, title: chapters.title, summary: chapters.summary })
    .from(chapters)
    .where(and(eq(chapters.courseId, chapter.courseId), lt(chapters.idx, chapter.idx)))
    .orderBy(asc(chapters.idx))
    .all();
  const missed = db
    .select({ conceptTag: reviewItems.conceptTag, misses: reviewItems.misses })
    .from(reviewItems)
    .where(eq(reviewItems.courseId, chapter.courseId))
    .all();
  const prompt = [
    CHAPTER_PROMPT,
    `Course topic: ${course.topic}`,
    `Chapter: ${chapter.title}`,
    `Objectives: ${chapter.objectives.join("; ")}`,
    `Prerequisite chapter indexes: ${chapter.prerequisites.join(", ") || "none"}`,
    `Prior summaries: ${previous.map((item) => `${item.idx}: ${item.summary ?? "not generated"}`).join(" | ") || "none"}`,
    `Missed concepts to reinforce: ${missed.map((item) => `${item.conceptTag} (${item.misses})`).join(", ") || "none"}`,
    `Depth hint: ${chapter.depthHint ?? "foundational"}`,
  ].join("\n");
  const selectedAgent = agent ?? await agentForRequest(new Request("http://localhost"));
  if (!selectedAgent) throw noAgentError();
  const generated = await runAgentObject(selectedAgent, "chapter", prompt, chapterSchema);
  const now = new Date();
  const updated = db.transaction((tx) => {
    const result = tx
      .update(chapters)
      .set({
        content: generated.content,
        pretest: generated.pretest,
        summary: generated.summary,
        generatedAt: now,
        contentGenerationStatus: "ready",
        contentGenerationError: null,
        contentGenerationUpdatedAt: now,
      })
      .where(and(eq(chapters.id, id), eq(chapters.contentGenerationVersion, version)))
      .run();
    if (!result.changes) throw new Error("Chapter generation is stale");
    tx.update(courses).set({ startedAt: course.startedAt ?? now }).where(eq(courses.id, course.id)).run();
    return tx.select().from(chapters).where(eq(chapters.id, id)).get();
  });
  if (!updated) throw new Error("Chapter not found");
  return updated;
}
