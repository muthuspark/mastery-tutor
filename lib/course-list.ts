import "server-only";
import { asc, count, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "./db";
import { chapters, courses } from "./db/schema";

/** Call only after authorizing the user; never cache across users or requests. */
export function listUserCourses(userId: string) {
  const result = db.select({
    ...getTableColumns(courses),
    passed: count(sql`case when ${chapters.status} = 'passed' then 1 end`),
    total: count(chapters.id),
  }).from(courses)
    .leftJoin(chapters, eq(chapters.courseId, courses.id))
    .where(eq(courses.userId, userId))
    .groupBy(courses.id)
    .orderBy(asc(courses.createdAt))
    .all();
  return result.map(({ passed, total, ...course }) => ({ ...course, progress: { passed, total } }));
}
