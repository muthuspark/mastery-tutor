import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { chapters, courses } from "./db/schema";
import { type Agent } from "./agent";
import { coursePlanSchema } from "./quality-contracts";
import { generateReviewedObject } from "./quality";
import { courseProfilePrompt } from "./profile";
import { enqueueGenerationJob } from "./generation";

export const COURSE_PLAN_PROMPT = `Create a concise course brief and a dependency-ordered teaching plan tailored to the learning request and relevant learner background.
Derive a concise subject title, not a sentence. Preserve the full request's scope and desired outcome in the brief.
Assumed knowledge is an inference, not demonstrated mastery. An explicit request to start from scratch overrides inferred expertise. Do not transfer expertise to unrelated domains. Without relevant background, explain accessibly without inferring age or education.
Use 1–24 focused chapters according to the material. Do not pad narrow topics. Compress already-known background into a brief refresher instead of repeated elementary chapters. Split substantial topics at planning time so each can teach one substantive capability in at most 600 words with an example/application.
Give every chapter distinct objectives and a teaching plan: the capability it develops, concepts introduced, knowledge assumed, and a concrete worked example/application appropriate to the subject. Explain mechanisms, reasoning, and trade-offs at the chosen depth.
Prerequisites use ZERO-BASED indexes and must refer only to earlier chapters. No duplicates, self-dependencies, or forward references. Include prerequisites needed to understand and assess the capability. Avoid duplicate or overlapping chapters.
Choose photos, diagrams, timelines, tables, code, or formulas only when they help the teaching purpose. Do not require decorative visuals or a coding example for every subject.
Return only the structured brief and syllabus.`;

export async function prepareCourse(courseId: string, agent: Agent, version: number, guard: () => void) {
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  if (!course?.learningRequest || course.preparationVersion !== version) throw new Error("Course preparation is stale or not found");
  const profile = courseProfilePrompt(courseId);
  const plan = await generateReviewedObject(agent, "syllabus", `${COURSE_PLAN_PROMPT}\n${profile}\nLearning request (JSON data): ${JSON.stringify(course.learningRequest)}`, coursePlanSchema, {
    targetId: courseId,
    onStage(stage) {
      db.transaction(() => {
        guard();
        db.update(courses).set({ preparationStage: stage, preparationUpdatedAt: new Date() })
          .where(and(eq(courses.id, courseId), eq(courses.preparationVersion, version))).run();
      });
    },
  });
  return db.transaction((tx) => {
    guard();
    const current = tx.select().from(courses).where(eq(courses.id, courseId)).get();
    if (current?.preparationVersion !== version || current.preparationStatus !== "generating") throw new Error("Course preparation is stale");
    const now = new Date();
    const rows = plan.chapters.map((chapter, idx) => ({ ...chapter, id: randomUUID(), courseId, idx, status: idx === 0 ? "open" as const : "locked" as const, createdAt: now }));
    tx.insert(chapters).values(rows).run();
    tx.update(courses).set({ topic: plan.topic, brief: plan.brief, preparationStatus: "ready", preparationStage: null, preparationError: null, preparationUpdatedAt: now }).where(eq(courses.id, courseId)).run();
    enqueueGenerationJob("chapter", rows[0].id, 1, now);
    return plan;
  });
}
