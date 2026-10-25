import { recordAuthEvent } from "@/lib/auth-events";
import { authorize } from "@/lib/access";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { chapterExplanations, chapters, courses } from "@/lib/db/schema";
import { classifyCodexFailure, CodexError } from "@/lib/codex-errors";
import { type Agent } from "@/lib/agent";
import { generateChapterContent } from "@/lib/chapter";
import { ActiveChapterExplanationError, claimGenerationJob, enqueueGenerationJob, invalidateChapterGeneration } from "@/lib/generation";
import { processGenerationJob } from "@/lib/generation-worker";
import { recordGenerationEvent } from "@/lib/generation-observability";
import { chapterResponse, savedChapterVersions } from "@/lib/chapter-response";
import { QualityError } from "@/lib/quality-contracts";
import { ensureExplanationBaseline, readChapterExplanations, requestChapterExplanation } from "@/lib/chapter-explanations";

type RouteContext = { params: Promise<{ id: string }> };
const feedbackSchema = z.object({ difficulty: z.enum(["easy", "hard"]), requestId: z.string().uuid().optional() });

async function getChapter(id: string) {
  return db.select().from(chapters).where(eq(chapters.id, id)).get();
}

export function codexErrorResponse(error: unknown) {
  if (error instanceof QualityError) {
    return NextResponse.json({ error: { code: "generation_failed", message: error.message, retryable: true } }, { status: 503 });
  }
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

async function generateChapter(id: string, force = false, agent?: Agent) {
  const chapter = await getChapter(id);
  if (!chapter) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
  if (chapter.status === "locked") {
    return NextResponse.json({ error: { code: "locked", message: "This chapter is locked." } }, { status: 403 });
  }
  // Difficulty adjustments keep accepted explanations readable while the new one is prepared.
  if (chapter.content && savedChapterVersions(id).length) return chapter;
  const reviewed = db.select().from(courses).where(eq(courses.id, chapter.courseId)).get()?.qualityPolicyVersion;
  if (reviewed) {
    if (chapter.contentGenerationStatus === "ready" && chapter.content) return chapter;
    if (chapter.contentGenerationStatus === "failed") return NextResponse.json({ error: { code: "generation_failed", message: chapter.contentGenerationError ?? "Could not prepare this chapter. Regenerate it to try again.", retryable: true } }, { status: 503 });
    enqueueGenerationJob("chapter", id, chapter.contentGenerationVersion);
    return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
  }
  const hasReadyContent = chapter.contentGenerationStatus === "ready"
    || (chapter.contentGenerationStatus === "pending" && chapter.contentGenerationVersion === 1 && chapter.generatedAt);
  if (chapter.content && !force && hasReadyContent) {
    recordGenerationEvent("artifact_cache_hit", { artifactType: "chapter", targetId: id, generationVersion: chapter.contentGenerationVersion });
    return chapter;
  }
  if (force) return generateChapterContent(id, agent, chapter.contentGenerationVersion);
  const job = enqueueGenerationJob("chapter", id, chapter.contentGenerationVersion);
  const claimed = claimGenerationJob(job.id, `request-${randomUUID()}`);
  if (!claimed) return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
  await processGenerationJob(claimed, claimed.leaseOwner ?? "");
  const ready = await getChapter(id);
  if (!ready?.content) return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
  return ready;
}

export function regenerateChapter(id: string, agent?: Agent) {
  return regenerateChapterNow(id, agent);
}

async function regenerateChapterNow(id: string, agent?: Agent) {
  const existing = await getChapter(id);
  if (!existing) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
  if (existing.status === "locked") return NextResponse.json({ error: { code: "locked", message: "This chapter is locked." } }, { status: 403 });
  if (db.select().from(chapterExplanations).where(and(
    eq(chapterExplanations.chapterId, id), inArray(chapterExplanations.status, ["pending", "generating"]),
  )).get()) return NextResponse.json({ error: { code: "explanation_active", message: "Wait for the current explanation to finish before regenerating this chapter.", retryable: true } }, { status: 409 });
  const reviewed = db.select().from(courses).where(eq(courses.id, existing.courseId)).get()?.qualityPolicyVersion;
  if (reviewed && (existing.contentGenerationStatus === "pending" || existing.contentGenerationStatus === "generating")) {
    enqueueGenerationJob("chapter", id, existing.contentGenerationVersion);
    return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
  }
  let invalidated;
  try {
    invalidated = invalidateChapterGeneration(id, undefined, new Date(), { rejectActiveExplanation: true });
  } catch (error) {
    if (error instanceof ActiveChapterExplanationError) return NextResponse.json({ error: { code: "explanation_active", message: error.message, retryable: true } }, { status: 409 });
    throw error;
  }
  if (!invalidated) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
  const job = enqueueGenerationJob("chapter", id, invalidated.contentGenerationVersion);
  if (reviewed) return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
  const claimed = claimGenerationJob(job.id, `request-${randomUUID()}`);
  if (!claimed) return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
  await processGenerationJob(claimed, claimed.leaseOwner ?? "", agent);
  const chapter = await getChapter(id);
  if (!chapter?.content) return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
  return chapter;
}

export async function GET(_request: Request, context: RouteContext) {
  const access = await authorize("chapter", await context.params);
  if (access instanceof Response) return access;
  const { id } = await context.params;
  try {
    const chapter = await generateChapter(id);
    if (chapter instanceof NextResponse) return chapter;
    recordAuthEvent("first_lesson", access.user.id);
    return NextResponse.json(await chapterResponse(chapter));
  } catch (error) {
    return codexErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const access = await authorize("chapter", await context.params);
  if (access instanceof Response) return access;
  const { id } = await context.params;
  const parsed = feedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_input", message: "Invalid chapter feedback." } }, { status: 400 });
  }
  try {
    const chapter = await getChapter(id);
    if (!chapter) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
    ensureExplanationBaseline(id);
    const timeline = readChapterExplanations(id);
    if (!timeline.baselineExplanationId) return NextResponse.json({ error: { code: "not_ready", message: "The chapter has no accepted explanation to adjust.", retryable: true } }, { status: 409 });
    const result = requestChapterExplanation({
      chapterId: id,
      direction: parsed.data.difficulty === "easy" ? "deeper" : "simpler",
      requestId: parsed.data.requestId ?? randomUUID(),
      expectedContentVersion: chapter.contentGenerationVersion,
      baselineExplanationId: timeline.baselineExplanationId,
    });
    return NextResponse.json({ saved: true, id: result.explanation.id, level: result.explanation.level, status: result.explanation.status }, { status: result.replay ? 200 : 202 });
  } catch (error) {
    if (error instanceof Error && "status" in error && typeof error.status === "number") {
      const apiError = error as Error & { code?: string; retryable?: boolean; status: number };
      return NextResponse.json({ error: { code: apiError.code ?? "generation_error", message: apiError.message, retryable: apiError.retryable ?? false } }, { status: apiError.status });
    }
    return NextResponse.json({ error: { code: "database_error", message: "Could not request another explanation.", retryable: true } }, { status: 500 });
  }
}
