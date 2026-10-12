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

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const workerRegistry = globalThis as typeof globalThis & {
  __masteryTutorGenerationWorker?: { stop: () => void };
};

function workerError(error: unknown) {
  if (error instanceof CodexError) {
    const classified = classifyCodexFailure(error);
    return { message: classified.message, retryable: classified.retryable };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { message, retryable: !/stale|locked|not found/i.test(message) };
}

export async function processGenerationJob(job: GenerationJob, workerId: string, requestedAgent?: Agent) {
  const startedAt = Date.now();
  if (!isCurrentGeneration(job)) {
    completeGenerationJob(job.id, workerId);
    return "stale" as const;
  }
  if (!markGenerationStarted(job)) {
    completeGenerationJob(job.id, workerId);
    return "missing" as const;
  }

  try {
    const agent = requestedAgent ?? await agentForRequest(new Request("http://localhost"));
    if (!agent) throw new Error("No generation agent is available");
    if (job.artifactType === "chapter") {
      await generateChapterContent(job.targetId, agent, job.generationVersion);
      enqueueGenerationJob("quiz", job.targetId, job.generationVersion);
    } else {
      await generateQuiz(job.targetId, agent, job.generationVersion);
    }
    completeGenerationJob(job.id, workerId);
    recordGenerationEvent("job_completed", { jobId: job.id, artifactType: job.artifactType, targetId: job.targetId, generationVersion: job.generationVersion, durationMs: Date.now() - startedAt });
    return "completed" as const;
  } catch (error) {
    const failure = workerError(error);
    const status = failGenerationJob(job.id, workerId, failure.message, failure.retryable);
    if (status === "pending" || status === "failed") markGenerationOutcome(job, status, failure.message);
    recordGenerationEvent("job_failed", { jobId: job.id, artifactType: job.artifactType, targetId: job.targetId, generationVersion: job.generationVersion, status, retryable: failure.retryable, durationMs: Date.now() - startedAt });
    return status ?? "lost";
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
