import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chapters, courses } from "@/lib/db/schema";
import { courseToMarkdown } from "@/lib/export";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const course = db.select().from(courses).where(eq(courses.id, id)).get();
  if (!course) return NextResponse.json({ error: { code: "not_found", message: "Course not found." } }, { status: 404 });
  const courseChapters = db.select().from(chapters).where(eq(chapters.courseId, id)).orderBy(asc(chapters.idx)).all();
  const markdown = courseToMarkdown({ topic: course.topic, chapters: courseChapters });
  return new NextResponse(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${course.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course"}.md"`,
    },
  });
}
