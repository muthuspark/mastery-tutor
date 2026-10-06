import { and, asc, eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { chapters, courses, reviewItems } from "@/lib/db/schema";
import { classifyCodexFailure, CodexError } from "@/lib/codex-errors";
import { modelFor, runCodexObject } from "@/lib/codex";
import { CHAPTER_PROMPT } from "@/lib/prompts";
import { chapterSchema } from "@/lib/schemas";
import { renderMarkdown } from "@/lib/markdown";

type RouteContext = { params: Promise<{ id: string }> };
const feedbackSchema = z.object({ difficulty: z.enum(["easy", "hard"]) });

async function getChapter(id: string) {
  return db.select().from(chapters).where(eq(chapters.id, id)).get();
}

export function codexErrorResponse(error: unknown) {
  if (!(error instanceof CodexError)) {
    return NextResponse.json(
      { error: { code: "database_error", message: "Could not save the chapter.", retryable: true } },
      { status: 500 },
    );
  }
  const classified = classifyCodexFailure(error);
  const status = classified.code === "not_found" ? 503 : classified.code === "timeout" ? 504 : 502;
  return NextResponse.json(
    { error: { code: classified.code, message: classified.message, retryable: classified.retryable } },
    { status },
  );
}

async function generateChapter(id: string, force = false) {
  const chapter = await getChapter(id);
  if (!chapter) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
  if (chapter.status === "locked") {
    return NextResponse.json({ error: { code: "locked", message: "This chapter is locked." } }, { status: 403 });
  }
  if (chapter.content && !force) return chapter;

  const course = db.select().from(courses).where(eq(courses.id, chapter.courseId)).get();
  if (!course) return NextResponse.json({ error: { code: "not_found", message: "Course not found." } }, { status: 404 });

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
  const generated = await runCodexObject(prompt, chapterSchema, { model: modelFor("chapter") });
  const now = new Date();
  db.transaction((tx) => {
    tx.update(chapters)
      .set({ content: generated.content, pretest: generated.pretest, summary: generated.summary, generatedAt: now })
      .where(eq(chapters.id, id))
      .run();
    tx.update(courses).set({ startedAt: course.startedAt ?? now }).where(eq(courses.id, course.id)).run();
  });
  return { ...chapter, ...generated, generatedAt: now };
}

export function regenerateChapter(id: string) {
  return generateChapter(id, true);
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const chapter = await generateChapter(id);
    if (chapter instanceof NextResponse) return chapter;
    return NextResponse.json({
      chapter,
      html: await renderMarkdown(chapter.content ?? ""),
    });
  } catch (error) {
    return codexErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_input", message: "Invalid chapter feedback." } }, { status: 400 });
  }
  const chapter = await getChapter(id);
  if (!chapter) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
  if (chapter.status === "locked") return NextResponse.json({ error: { code: "locked", message: "This chapter is locked." } }, { status: 403 });
  db.update(chapters).set({ depthHint: parsed.data.difficulty }).where(eq(chapters.id, id)).run();
  return NextResponse.json({ saved: true, depthHint: parsed.data.difficulty });
}
