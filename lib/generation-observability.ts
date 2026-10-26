import "server-only";

export type GenerationEvent =
  | "generation_stage"
  | "generation_validation"
  | "quality_review"
  | "job_enqueued"
  | "job_duplicate"
  | "job_claimed"
  | "job_completed"
  | "job_failed"
  | "job_recovered"
  | "artifact_cache_hit"
  | "artifact_stale";

export function recordGenerationEvent(event: GenerationEvent, fields: Record<string, string | number | boolean | null | undefined> = {}) {
  const operational = Object.fromEntries(Object.entries(fields).filter(([key]) => !["findings", "details"].includes(key)));
  console.info(JSON.stringify({ scope: "generation", event, at: new Date().toISOString(), ...operational }));
}
