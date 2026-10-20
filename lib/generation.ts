import "server-only";

import { and, asc, eq, gte, lte, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { chapters, courses, generationJobs } from "./db/schema";
import { recordGenerationEvent } from "./generation-observability";

export type GenerationArtifact = "course" | "chapter" | "quiz";
export type GenerationJobStatus = "pending" | "running" | "completed" | "failed";
export type GenerationJob = typeof generationJobs.$inferSelect;

export const GENERATION_LEASE_MS = 120_000;
export const GENERATION_MAX_ATTEMPTS = 3;
export const GENERATION_RETRY_BASE_MS = 5_000;

function retryDelayMs(attempts: number) {
  return GENERATION_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1);
}

export function getGenerationJob(id: string) {
  return db.select().from(generationJobs).where(eq(generationJobs.id, id)).get();
}

export function getGenerationJobForTarget(
  artifactType: GenerationArtifact,
  targetId: string,
  generationVersion: number,
) {
  return db
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.artifactType, artifactType),
        eq(generationJobs.targetId, targetId),
        eq(generationJobs.generationVersion, generationVersion),
      ),
    )
    .get();
}

export function enqueueGenerationJob(
  artifactType: GenerationArtifact,
  targetId: string,
  generationVersion: number,
  at = new Date(),
) {
  const existing = getGenerationJobForTarget(artifactType, targetId, generationVersion);
  if (existing) {
    if (existing.status === "completed" || existing.status === "failed") {
      const requeued = db
        .update(generationJobs)
        .set({
          status: "pending",
          attempts: 0,
          nextRunAt: at,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          updatedAt: at,
        })
        .where(eq(generationJobs.id, existing.id))
        .returning()
        .get();
      recordGenerationEvent("job_enqueued", { artifactType, targetId, generationVersion, status: requeued?.status ?? "pending" });
      return requeued ?? existing;
    }
    recordGenerationEvent("job_duplicate", { artifactType, targetId, generationVersion, status: existing.status });
    return existing;
  }

  const job = {
    id: randomUUID(),
    artifactType,
    targetId,
    generationVersion,
    status: "pending" as const,
    attempts: 0,
    nextRunAt: at,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastError: null,
    createdAt: at,
    updatedAt: at,
  };

  db.insert(generationJobs).values(job).onConflictDoNothing().run();
  const persisted = getGenerationJobForTarget(artifactType, targetId, generationVersion) ?? job;
  recordGenerationEvent("job_enqueued", { artifactType, targetId, generationVersion });
  return persisted;
}

export function claimNextGenerationJob(workerId: string, at = new Date()): GenerationJob | undefined {
  return db.transaction((tx) => {
    const candidate = tx
      .select()
      .from(generationJobs)
      .where(
        or(
          and(eq(generationJobs.status, "pending"), lte(generationJobs.nextRunAt, at)),
          and(eq(generationJobs.status, "running"), lte(generationJobs.leaseExpiresAt, at)),
        ),
      )
      .orderBy(asc(generationJobs.nextRunAt))
      .limit(1)
      .get();
    if (!candidate) return undefined;

    const leaseExpiresAt = new Date(at.getTime() + GENERATION_LEASE_MS);
    const claimed = tx
      .update(generationJobs)
      .set({
        status: "running",
        attempts: candidate.attempts + 1,
        leaseOwner: workerId,
        leaseExpiresAt,
        updatedAt: at,
      })
      .where(
        and(
          eq(generationJobs.id, candidate.id),
          or(
            and(eq(generationJobs.status, "pending"), lte(generationJobs.nextRunAt, at)),
            and(eq(generationJobs.status, "running"), lte(generationJobs.leaseExpiresAt, at)),
          ),
        ),
      )
      .returning()
      .get();
    if (claimed) recordGenerationEvent("job_claimed", { jobId: claimed.id, artifactType: claimed.artifactType, targetId: claimed.targetId, generationVersion: claimed.generationVersion, attempts: claimed.attempts });
    return claimed;
  });
}

export function claimGenerationJob(jobId: string, workerId: string, at = new Date()): GenerationJob | undefined {
  return db.transaction((tx) => {
    const candidate = tx.select().from(generationJobs).where(eq(generationJobs.id, jobId)).get();
    if (!candidate) return undefined;
    const claimed = tx
      .update(generationJobs)
      .set({
        status: "running",
        attempts: candidate.attempts + 1,
        leaseOwner: workerId,
        leaseExpiresAt: new Date(at.getTime() + GENERATION_LEASE_MS),
        updatedAt: at,
      })
      .where(
        and(
          eq(generationJobs.id, jobId),
          or(
            and(eq(generationJobs.status, "pending"), lte(generationJobs.nextRunAt, at)),
            and(eq(generationJobs.status, "running"), lte(generationJobs.leaseExpiresAt, at)),
          ),
        ),
      )
      .returning()
      .get();
    if (claimed) recordGenerationEvent("job_claimed", { jobId: claimed.id, artifactType: claimed.artifactType, targetId: claimed.targetId, generationVersion: claimed.generationVersion, attempts: claimed.attempts });
    return claimed;
  });
}

export function ownedJob(jobId: string, workerId: string, at = new Date()) {
  return db
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.id, jobId),
        eq(generationJobs.status, "running"),
        eq(generationJobs.leaseOwner, workerId),
        gte(generationJobs.leaseExpiresAt, at),
      ),
    )
    .get();
}

export function renewGenerationLease(jobId: string, workerId: string, at = new Date()) {
  return db.update(generationJobs)
    .set({ leaseExpiresAt: new Date(at.getTime() + GENERATION_LEASE_MS), updatedAt: at })
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.status, "running"), eq(generationJobs.leaseOwner, workerId), gte(generationJobs.leaseExpiresAt, at)))
    .run().changes > 0;
}

export function completeGenerationJob(jobId: string, workerId: string, at = new Date()) {
  if (!ownedJob(jobId, workerId, at)) return false;
  const completed = db
    .update(generationJobs)
    .set({ status: "completed", leaseOwner: null, leaseExpiresAt: null, updatedAt: at })
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.leaseOwner, workerId)))
    .run().changes > 0;
  return completed;
}

export function failGenerationJob(
  jobId: string,
  workerId: string,
  error: string,
  retryable: boolean,
  at = new Date(),
) {
  const job = ownedJob(jobId, workerId, at);
  if (!job) return undefined;
  const shouldRetry = retryable && job.attempts < GENERATION_MAX_ATTEMPTS;
  const status = shouldRetry ? "pending" : "failed";
  const nextRunAt = shouldRetry ? new Date(at.getTime() + retryDelayMs(job.attempts)) : at;
  db.update(generationJobs)
    .set({
      status,
      nextRunAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: error,
      updatedAt: at,
    })
    .where(and(eq(generationJobs.id, jobId), eq(generationJobs.leaseOwner, workerId)))
    .run();
  return status;
}

export function recoverExpiredGenerationJobs(at = new Date()) {
  const recovered = db.transaction((tx) => {
    const expired = tx.select().from(generationJobs).where(and(eq(generationJobs.status, "running"), lte(generationJobs.leaseExpiresAt, at))).all();
    for (const job of expired) {
      const artifact = generationStatusFor(job.artifactType, job.targetId);
      if (artifact?.status === "ready" && artifact.version === job.generationVersion) {
        tx.update(generationJobs).set({ status: "completed", leaseOwner: null, leaseExpiresAt: null, updatedAt: at }).where(eq(generationJobs.id, job.id)).run();
        if (job.artifactType === "chapter" && !getGenerationJobForTarget("quiz", job.targetId, job.generationVersion)) enqueueGenerationJob("quiz", job.targetId, job.generationVersion, at);
        continue;
      }
      const status = job.attempts >= GENERATION_MAX_ATTEMPTS ? "failed" : "pending";
      const error = status === "failed" ? "Preparation was interrupted too many times. Try again." : null;
      tx.update(generationJobs).set({ status, lastError: error, nextRunAt: at, leaseOwner: null, leaseExpiresAt: null, updatedAt: at }).where(eq(generationJobs.id, job.id)).run();
      if (isCurrentGeneration(job)) markGenerationOutcome(job, status, error ?? "Preparation interrupted; retrying.", at);
    }
    return expired.length;
  });
  if (recovered) recordGenerationEvent("job_recovered", { count: recovered });
  return recovered;
}

export function isCurrentGeneration(job: Pick<GenerationJob, "artifactType" | "targetId" | "generationVersion">) {
  if (job.artifactType === "course") {
    return db.select().from(courses).where(and(eq(courses.id, job.targetId), eq(courses.preparationVersion, job.generationVersion))).get() !== undefined;
  }
  const chapter = db.select().from(chapters).where(eq(chapters.id, job.targetId)).get();
  if (!chapter) return false;
  const current = job.artifactType === "chapter"
    ? chapter.contentGenerationVersion === job.generationVersion
    : chapter.contentGenerationVersion === job.generationVersion;
  if (!current) recordGenerationEvent("artifact_stale", { artifactType: job.artifactType, targetId: job.targetId, generationVersion: job.generationVersion });
  return current;
}

export function generationStatusFor(
  artifactType: GenerationArtifact,
  chapterId: string,
) {
  if (artifactType === "course") {
    const course = db.select().from(courses).where(eq(courses.id, chapterId)).get();
    return course ? { status: course.preparationStatus, version: course.preparationVersion, error: course.preparationError, updatedAt: course.preparationUpdatedAt } : undefined;
  }
  const chapter = db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
  if (!chapter) return undefined;
  return artifactType === "chapter"
    ? {
        status: chapter.contentGenerationStatus,
        version: chapter.contentGenerationVersion,
        error: chapter.contentGenerationError,
        updatedAt: chapter.contentGenerationUpdatedAt,
      }
    : {
        status: chapter.quizGenerationStatus,
        version: chapter.quizGenerationVersion,
        error: chapter.quizGenerationError,
        updatedAt: chapter.quizGenerationUpdatedAt,
      };
}

export function markGenerationStarted(
  job: Pick<GenerationJob, "artifactType" | "targetId" | "generationVersion">,
  at = new Date(),
) {
  if (job.artifactType === "course") {
    return db.update(courses).set({ preparationStatus: "generating", preparationStage: "planning", preparationError: null, preparationUpdatedAt: at })
      .where(and(eq(courses.id, job.targetId), eq(courses.preparationVersion, job.generationVersion), or(eq(courses.preparationStatus, "pending"), eq(courses.preparationStatus, "generating"))))
      .run().changes > 0;
  }
  if (job.artifactType === "chapter") {
    return db.update(chapters)
      .set({ contentGenerationStatus: "generating", contentGenerationError: null, contentGenerationUpdatedAt: at })
      .where(and(eq(chapters.id, job.targetId), eq(chapters.contentGenerationVersion, job.generationVersion)))
      .run().changes > 0;
  }
  return db.update(chapters)
    .set({ quizGenerationStatus: "generating", quizGenerationError: null, quizGenerationUpdatedAt: at })
    .where(and(eq(chapters.id, job.targetId), eq(chapters.contentGenerationVersion, job.generationVersion)))
    .run().changes > 0;
}

export function markGenerationOutcome(
  job: Pick<GenerationJob, "artifactType" | "targetId" | "generationVersion">,
  status: "pending" | "failed",
  error: string,
  at = new Date(),
) {
  if (job.artifactType === "course") {
    return db.update(courses).set({ preparationStatus: status, preparationError: error, preparationUpdatedAt: at })
      .where(and(eq(courses.id, job.targetId), eq(courses.preparationVersion, job.generationVersion)))
      .run().changes > 0;
  }
  if (job.artifactType === "chapter") {
    return db.update(chapters)
      .set({ contentGenerationStatus: status, contentGenerationError: error, contentGenerationUpdatedAt: at })
      .where(and(eq(chapters.id, job.targetId), eq(chapters.contentGenerationVersion, job.generationVersion)))
      .run().changes > 0;
  }
  return db.update(chapters)
    .set({ quizGenerationStatus: status, quizGenerationError: error, quizGenerationUpdatedAt: at })
    .where(and(eq(chapters.id, job.targetId), eq(chapters.contentGenerationVersion, job.generationVersion)))
    .run().changes > 0;
}

export function invalidateChapterGeneration(
  chapterId: string,
  depthHint?: "easy" | "hard",
  at = new Date(),
) {
  return db.transaction((tx) => {
    const chapter = tx.select().from(chapters).where(eq(chapters.id, chapterId)).get();
    if (!chapter) return undefined;
    const version = chapter.contentGenerationVersion + 1;
    tx.update(chapters)
      .set({
        ...(depthHint ? { depthHint } : {}),
        contentGenerationVersion: version,
        contentGenerationStatus: "pending",
        contentGenerationError: null,
        contentGenerationUpdatedAt: at,
        quizGenerationVersion: 0,
        quizGenerationStatus: "pending",
        quizGenerationError: null,
        quizGenerationUpdatedAt: at,
      })
      .where(eq(chapters.id, chapterId))
      .run();
    return { ...chapter, contentGenerationVersion: version, depthHint: depthHint ?? chapter.depthHint };
  });
}

