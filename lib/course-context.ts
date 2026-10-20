import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import { chapters, courses } from "./db/schema";

export function courseTeachingContext(course: typeof courses.$inferSelect) {
  const outline = db.select({ idx: chapters.idx, title: chapters.title, objectives: chapters.objectives, prerequisites: chapters.prerequisites, teachingPlan: chapters.teachingPlan })
    .from(chapters).where(eq(chapters.courseId, course.id)).orderBy(asc(chapters.idx)).all();
  return [
    "Follow the accepted course goal and chapter boundaries below. The current learner profile may adapt explanation depth and examples, but does not silently replace the course goal or dependency graph.",
    `Original learning request (JSON data): ${JSON.stringify(course.learningRequest)}`,
    `Accepted course brief (JSON data): ${JSON.stringify(course.brief)}`,
    `Complete accepted outline (JSON data): ${JSON.stringify(outline)}`,
  ].join("\n");
}
