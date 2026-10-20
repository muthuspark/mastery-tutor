import { z } from "zod";

export const QUALITY_POLICY_VERSION = 1;

const text = z.string().trim().min(1);
export const courseBriefSchema = z.object({
  outcome: text.max(1000),
  assumedKnowledge: z.array(text.max(300)).max(12),
  likelyGaps: z.array(text.max(300)).max(12),
  depthGuidance: text.max(1000),
});
export const teachingPlanSchema = z.object({
  capability: text.max(500),
  introduces: z.array(text.max(200)).min(1).max(8),
  assumes: z.array(text.max(200)).max(12),
  application: text.max(800),
});

type GraphChapter = { title: string; prerequisites: number[] };
export function syllabusGraphIssues(chapters: GraphChapter[]) {
  const issues: string[] = [];
  const titles = new Set<string>();
  chapters.forEach((chapter, idx) => {
    const title = chapter.title.trim().toLowerCase().replace(/\s+/g, " ");
    if (titles.has(title)) issues.push(`Chapter ${idx}: duplicate title`);
    titles.add(title);
    if (new Set(chapter.prerequisites).size !== chapter.prerequisites.length) issues.push(`Chapter ${idx}: duplicate prerequisite`);
    if (chapter.prerequisites.some((prior) => !Number.isInteger(prior) || prior < 0 || prior >= idx)) {
      issues.push(`Chapter ${idx}: prerequisites must refer only to earlier chapter indexes`);
    }
  });
  return issues;
}

export const coursePlanSchema = z.object({
  topic: text.max(100),
  brief: courseBriefSchema,
  chapters: z.array(z.object({
    title: text.max(200),
    objectives: z.array(text.max(500)).min(1).max(3),
    prerequisites: z.array(z.number().int().nonnegative()),
    teachingPlan: teachingPlanSchema,
  })).min(1).max(24),
}).superRefine((plan, ctx) => {
  for (const message of syllabusGraphIssues(plan.chapters)) {
    ctx.addIssue({ code: "custom", path: ["chapters"], message });
  }
});

export const reviewSchema = z.object({
  issues: z.array(z.object({
    severity: z.enum(["blocking", "warning"]),
    category: z.enum(["learner_fit", "coverage", "repetition", "prerequisite_order", "unsupported_concept", "application", "alignment", "ambiguity", "correctness"]),
    location: text.max(300),
    evidence: text.max(1000),
    guidance: text.max(1000),
  })).max(20),
});

export type CourseBrief = z.infer<typeof courseBriefSchema>;
export type TeachingPlan = z.infer<typeof teachingPlanSchema>;
export type CoursePlan = z.infer<typeof coursePlanSchema>;
export type QualityReview = z.infer<typeof reviewSchema>;

export class QualityError extends Error {
  constructor(message = "The generated material did not pass quality review. Try again.") {
    super(message);
    this.name = "QualityError";
  }
}
