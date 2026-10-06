import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { chapters, courses } from "@/lib/db/schema";

const syllabusUpdateSchema = z.object({
  chapters: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      objectives: z.array(z.string().trim().min(1)).min(1).max(3),
      prerequisites: z.array(z.number().int().nonnegative()),
    }),
  ),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const course = db.select().from(courses).where(eq(courses.id, id)).get();
  if (!course) return NextResponse.json({ error: { code: "not_found", message: "Course not found." } }, { status: 404 });

  const courseChapters = db
    .select()
    .from(chapters)
    .where(eq(chapters.courseId, id))
    .orderBy(asc(chapters.idx))
    .all();
  const passed = courseChapters.filter((chapter) => chapter.status === "passed").length;

  return NextResponse.json({ course, chapters: courseChapters, progress: { passed, total: courseChapters.length } });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = syllabusUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "The syllabus update is invalid.", retryable: false } },
      { status: 400 },
    );
  }

  const course = db.select().from(courses).where(and(eq(courses.id, id), isNull(courses.startedAt))).get();
  if (!course) {
    return NextResponse.json(
      { error: { code: "course_started", message: "The syllabus can only be edited before studying.", retryable: false } },
      { status: 409 },
    );
  }

  const existing = db.select().from(chapters).where(eq(chapters.courseId, id)).all();
  const existingIds = new Set(existing.map((chapter) => chapter.id));
  if (body.data.chapters.some((chapter) => !existingIds.has(chapter.id))) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "The syllabus contains an unknown chapter.", retryable: false } },
      { status: 400 },
    );
  }

  db.transaction((tx) => {
    for (const chapter of body.data.chapters) {
      tx.update(chapters)
        .set({ title: chapter.title, objectives: chapter.objectives, prerequisites: chapter.prerequisites })
        .where(eq(chapters.id, chapter.id))
        .run();
    }
  });

  return NextResponse.json({ updated: body.data.chapters.length });
}
