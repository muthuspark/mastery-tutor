import "server-only";

import { and, desc, eq, max } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { chapterExplanations, chapters, courses, generationJobs } from "./db/schema";
import {
  adjacentExplanationLevel,
  explanationLevelLabel,
  explanationNavigationBaseline,
  type ExplanationDirection,
  type ExplanationLevel,
} from "./explanation-levels";

export class ChapterExplanationError extends Error {
  constructor(readonly code: string, message: string, readonly status: number, readonly retryable = false) {
    super(message);
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const activeStatus = (status: string) => status === "pending" || status === "generating";

function currentChapter(tx: Tx, chapterId: string) {
  const chapter = tx.select().from(chapters).where(eq(chapters.id, chapterId)).get();
  if (!chapter) throw new ChapterExplanationError("not_found", "Chapter not found.", 404);
  if (chapter.status === "locked") throw new ChapterExplanationError("locked", "This chapter is locked.", 403);
  const course = tx.select().from(courses).where(eq(courses.id, chapter.courseId)).get();
  if (!course) throw new ChapterExplanationError("not_found", "Course not found.", 404);
  return { chapter, course };
}

function requireReadyChapter(chapter: ReturnType<typeof currentChapter>["chapter"]) {
  const legacyReady = chapter.contentGenerationStatus === "pending"
    && chapter.contentGenerationVersion === 1 && Boolean(chapter.generatedAt);
  if (!chapter.content || (chapter.contentGenerationStatus !== "ready" && !legacyReady)) {
    throw new ChapterExplanationError("generation_pending", "Wait for the chapter to finish before requesting an explanation.", 409, true);
  }
}

function readyTimeline(tx: Tx, chapterId: string, contentVersion: number) {
  return tx.select().from(chapterExplanations)
    .where(and(
      eq(chapterExplanations.chapterId, chapterId),
      eq(chapterExplanations.sourceContentVersion, contentVersion),
      eq(chapterExplanations.status, "ready"),
    ))
    .orderBy(desc(chapterExplanations.ordinal)).all();
}

function enqueueExplanationJob(tx: Tx, explanationId: string, jobVersion: number, at: Date) {
  tx.insert(generationJobs).values({
    id: randomUUID(), artifactType: "explanation", targetId: explanationId,
    generationVersion: jobVersion, status: "pending", attempts: 0,
    nextRunAt: at, leaseOwner: null, leaseExpiresAt: null, lastError: null,
    createdAt: at, updatedAt: at,
  }).onConflictDoNothing().run();
}

export type ExplanationRequestInput = {
  chapterId: string;
  direction: ExplanationDirection;
  requestId: string;
  expectedContentVersion: number;
  baselineExplanationId: string;
};

export function requestChapterExplanation(input: ExplanationRequestInput) {
  return db.transaction((tx) => {
    // Check exact transport replay before freshness so a lost response is safe to retry.
    const replay = tx.select().from(chapterExplanations).where(and(
      eq(chapterExplanations.chapterId, input.chapterId),
      eq(chapterExplanations.requestId, input.requestId),
    )).get();
    if (replay) {
      if (replay.direction !== input.direction || replay.sourceContentVersion !== input.expectedContentVersion
        || replay.parentExplanationId !== input.baselineExplanationId) {
        throw new ChapterExplanationError("request_conflict", "This request ID was already used for a different explanation request.", 409);
      }
      return { explanation: replay, replay: true };
    }

    const { chapter, course } = currentChapter(tx, input.chapterId);
    requireReadyChapter(chapter);
    if (chapter.contentGenerationVersion !== input.expectedContentVersion) {
      throw new ChapterExplanationError("stale_source", "The chapter changed. Reload before requesting another explanation.", 409, true);
    }
    const baseline = readyTimeline(tx, input.chapterId, chapter.contentGenerationVersion)[0];
    if (!baseline || baseline.id !== input.baselineExplanationId) {
      throw new ChapterExplanationError("stale_baseline", "The explanation changed. Reload before requesting another one.", 409, true);
    }
    const currentLevel = (baseline.level === null ? explanationNavigationBaseline(null) : baseline.level) as ExplanationLevel;
    const targetLevel = adjacentExplanationLevel(currentLevel, input.direction);
    if (targetLevel === null) {
      throw new ChapterExplanationError("depth_boundary", `This explanation is already at the ${explanationLevelLabel(currentLevel)} boundary.`, 400);
    }
    const active = tx.select().from(chapterExplanations).where(and(
      eq(chapterExplanations.chapterId, input.chapterId),
      eq(chapterExplanations.status, "pending"),
    )).get() ?? tx.select().from(chapterExplanations).where(and(
      eq(chapterExplanations.chapterId, input.chapterId),
      eq(chapterExplanations.status, "generating"),
    )).get();
    if (active) throw new ChapterExplanationError("generation_active", "An explanation is already being prepared.", 409, true);

    const at = new Date();
    const ordinal = (tx.select({ value: max(chapterExplanations.ordinal) }).from(chapterExplanations)
      .where(eq(chapterExplanations.chapterId, input.chapterId)).get()?.value ?? 0) + 1;
    const explanation = tx.insert(chapterExplanations).values({
      id: randomUUID(), chapterId: input.chapterId, ordinal, kind: "alternative",
      sourceContentVersion: chapter.contentGenerationVersion,
      sourcePreparationVersion: course.preparationVersion,
      parentExplanationId: baseline.id, requestId: input.requestId,
      direction: input.direction, level: targetLevel, content: null,
      status: "pending", error: null, jobVersion: 1,
      createdAt: at,
    }).returning().get();
    enqueueExplanationJob(tx, explanation.id, explanation.jobVersion, at);
    return { explanation, replay: false };
  });
}

export function readChapterExplanations(chapterId: string) {
  return db.transaction((tx) => {
    const { chapter } = currentChapter(tx, chapterId);
    const rows = tx.select().from(chapterExplanations).where(eq(chapterExplanations.chapterId, chapterId))
      .orderBy(chapterExplanations.ordinal).all();
    const accepted = rows.filter((row) => row.status === "ready");
    const currentAccepted = accepted.filter((row) => row.sourceContentVersion === chapter.contentGenerationVersion);
    const baseline = currentAccepted.at(-1);
    const activeRequest = rows.find((row) => activeStatus(row.status));
    const actionableFailure = [...rows].reverse().find((row) => row.status === "failed"
      && row.sourceContentVersion === chapter.contentGenerationVersion
      && row.parentExplanationId === baseline?.id);
    return {
      canonicalVersion: chapter.contentGenerationVersion,
      baselineExplanationId: baseline?.id ?? null,
      effectiveLevel: baseline?.level ?? 2,
      legacyBaseline: Boolean(baseline && baseline.level === null),
      sections: accepted.map((row) => ({
        id: row.id, ordinal: row.ordinal, kind: row.kind,
        sourceContentVersion: row.sourceContentVersion,
        level: row.level,
        label: row.level === null ? null : explanationLevelLabel(row.level as ExplanationLevel),
        content: row.content,
        generatedAt: row.generatedAt,
      })),
      activeRequest: activeRequest ? { id: activeRequest.id, status: activeRequest.status, level: activeRequest.level } : null,
      failedRequest: actionableFailure ? { id: actionableFailure.id, status: actionableFailure.status, level: actionableFailure.level, jobVersion: actionableFailure.jobVersion } : null,
    };
  });
}

/** Backfill a missing live baseline for pre-migration clients or imported fixtures. */
export function ensureExplanationBaseline(chapterId: string) {
  return db.transaction((tx) => {
    const { chapter, course } = currentChapter(tx, chapterId);
    requireReadyChapter(chapter);
    const existing = readyTimeline(tx, chapterId, chapter.contentGenerationVersion)[0];
    if (existing) return existing;
    const at = chapter.generatedAt ?? new Date();
    const ordinal = (tx.select({ value: max(chapterExplanations.ordinal) }).from(chapterExplanations)
      .where(eq(chapterExplanations.chapterId, chapterId)).get()?.value ?? 0) + 1;
    return tx.insert(chapterExplanations).values({
      id: randomUUID(), chapterId, ordinal, kind: "legacy",
      sourceContentVersion: chapter.contentGenerationVersion,
      sourcePreparationVersion: course.preparationVersion,
      level: null, content: chapter.content, status: "ready", jobVersion: 1,
      createdAt: at, generatedAt: chapter.generatedAt,
    }).returning().get();
  });
}

export function retryChapterExplanation(chapterId: string, explanationId: string, requestId: string, expectedJobVersion: number) {
  return db.transaction((tx) => {
    const { chapter } = currentChapter(tx, chapterId);
    const explanation = tx.select().from(chapterExplanations).where(and(
      eq(chapterExplanations.id, explanationId), eq(chapterExplanations.chapterId, chapterId),
    )).get();
    if (!explanation) throw new ChapterExplanationError("not_found", "Explanation request not found.", 404);
    if (explanation.lastRetryRequestId === requestId) return { explanation, replay: true };
    if (explanation.status !== "failed") throw new ChapterExplanationError("not_retryable", "Only a failed explanation can be retried.", 409);
    const baseline = readyTimeline(tx, chapterId, chapter.contentGenerationVersion)[0];
    if (explanation.sourceContentVersion !== chapter.contentGenerationVersion || baseline?.id !== explanation.parentExplanationId) {
      throw new ChapterExplanationError("stale_baseline", "This failed request is no longer based on the latest explanation.", 409);
    }
    if (explanation.jobVersion !== expectedJobVersion) throw new ChapterExplanationError("stale_retry", "The retry request is out of date.", 409);

    const at = new Date();
    const retried = tx.update(chapterExplanations).set({
      status: "pending", error: null, jobVersion: explanation.jobVersion + 1,
      lastRetryRequestId: requestId,
    }).where(and(eq(chapterExplanations.id, explanationId), eq(chapterExplanations.status, "failed")))
      .returning().get();
    if (!retried) throw new ChapterExplanationError("not_retryable", "This explanation is already being retried.", 409, true);
    enqueueExplanationJob(tx, retried.id, retried.jobVersion, at);
    return { explanation: retried, replay: false };
  });
}
