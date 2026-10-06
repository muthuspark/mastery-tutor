import type { chapters } from "@/lib/db/schema";

export const PASS_THRESHOLD = 0.8;
export type ChapterState = typeof chapters.$inferSelect;

export function passed(score: number) {
  return score >= PASS_THRESHOLD;
}

export function prerequisitesPassed(chapter: ChapterState, allChapters: ChapterState[]) {
  const statuses = new Map(allChapters.map((item) => [item.idx, item.status]));
  return chapter.prerequisites.every((idx) => statuses.get(idx) === "passed");
}

export function courseIsComplete(allChapters: ChapterState[]) {
  return allChapters.length > 0 && allChapters.every((chapter) => chapter.status === "passed");
}

export function remediation(missedConcepts: string[]) {
  if (!missedConcepts.length) return "Review the explanations, then try a fresh QnA.";
  return `Review these concepts before trying again: ${[...new Set(missedConcepts)].join(", ")}.`;
}
