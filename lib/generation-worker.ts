import "server-only";

import { classifyCodexFailure, CodexError } from "./codex-errors";
import { agentForRequest, type Agent } from "./agent";
import { generateChapterContent } from "./chapter";
import {
  claimNextGenerationJob,
  completeGenerationJob,
  enqueueGenerationJob,
  failGenerationJob,
  isCurrentGeneration,
  markGenerationOutcome,
  markGenerationStarted,
  recoverExpiredGenerationJobs,
  type GenerationJob,
} from "./generation";
import { generateQuiz } from "./quiz";
import { recordGenerationEvent } from "./generation-observability";
import { db } from "./db";
import { prepareCourse } from "./course-planner";
import { QualityError } from "./quality-contracts";
import { ownedJob, renewGenerationLease } from "./generation";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const workerRegistry = globalThis as typeof globalThis & {
  __masteryTutorGenerationWorker?: { stop: () => void };
};

function workerError(error: unknown) {
  if (error instanceof QualityError) return { message: error.message, retryable: false };
  if (error instanceof CodexError) {
    const classified = classifyCodexFailure(error);
    return { message: classified.message, retryable: classified.retryable };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { message: "Could not prepare the learning material. Try again.", retryable: !/stale|locked|not found/i.test(message) };
}

export async function processGenerationJob(job: GenerationJob, workerId: string, requestedAgent?: Agent) {
  const startedAt = Date.now();
  const skipped = db.transaction(() => {
    if (!ownedJob(job.id, workerId)) return "lost" as const;
    if (!isCurrentGeneration(job)) {
      completeGenerationJob(job.id, workerId);
      return "stale" as const;
    }
    if (!markGenerationStarted(job)) {
      completeGenerationJob(job.id, workerId);
      return "missing" as const;
    }
  });
  if (skipped) return skipped;

  const guard = () => {
    if (!ownedJob(job.id, workerId) || !isCurrentGeneration(job)) throw new Error("Generation lease lost or artifact stale");
  };
  const heartbeat = setInterval(() => renewGenerationLease(job.id, workerId), 30_000);
  heartbeat.unref();
  try {
    guard();
    const agent = await agentForRequest(new Request("http://localhost"), requestedAgent);
    if (!agent) throw new Error("No generation agent is available");
    if (job.artifactType === "course") {
      await prepareCourse(job.targetId, agent, job.generationVersion, guard);
    } else if (job.artifactType === "chapter") {
      await generateChapterContent(job.targetId, agent, job.generationVersion, guard);
    } else {
      await generateQuiz(job.targetId, agent, job.generationVersion, guard);
    }
    db.transaction(() => {
      guard();
      if (job.artifactType === "chapter") enqueueGenerationJob("quiz", job.targetId, job.generationVersion);
      completeGenerationJob(job.id, workerId);
    });
    recordGenerationEvent("job_completed", { jobId: job.id, artifactType: job.artifactType, targetId: job.targetId, generationVersion: job.generationVersion, durationMs: Date.now() - startedAt });
    return "completed" as const;
  } catch (error) {
    return db.transaction(() => {
      if (!ownedJob(job.id, workerId) || !isCurrentGeneration(job)) return "lost" as const;
      const failure = workerError(error);
      const status = failGenerationJob(job.id, workerId, failure.message, failure.retryable);
      if (status === "pending" || status === "failed") markGenerationOutcome(job, status, failure.message);
      recordGenerationEvent("job_failed", { jobId: job.id, artifactType: job.artifactType, targetId: job.targetId, generationVersion: job.generationVersion, status, retryable: failure.retryable, durationMs: Date.now() - startedAt });
      return status ?? "lost";
    });
  } finally {
    clearInterval(heartbeat);
  }
}

export function startGenerationWorker(options: { pollIntervalMs?: number; workerId?: string } = {}) {
  if (workerRegistry.__masteryTutorGenerationWorker) return workerRegistry.__masteryTutorGenerationWorker.stop;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const workerId = options.workerId ?? `generation-worker-${process.pid}`;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => void tick(), pollIntervalMs);
    timer.unref();
  };
  const tick = async () => {
    if (stopped) return;
    recoverExpiredGenerationJobs();
    const job = claimNextGenerationJob(workerId);
    if (job) {
      await processGenerationJob(job, workerId);
      return void tick();
    }
    schedule();
  };
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (workerRegistry.__masteryTutorGenerationWorker?.stop === stop) delete workerRegistry.__masteryTutorGenerationWorker;
  };
  workerRegistry.__masteryTutorGenerationWorker = { stop };
  void tick();
  return stop;
}
