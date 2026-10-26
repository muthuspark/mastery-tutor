import { authorize } from "@/lib/access";
import { and, asc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { chapters, courses } from "@/lib/db/schema";
import { coursePlanSchema, QualityError, reviewSchema, syllabusGraphIssues } from "@/lib/quality-contracts";
import { agentForRequest, noAgentError, runAgentObject } from "@/lib/agent";
import { REVIEW_PROMPT } from "@/lib/quality";
import { courseProfilePrompt } from "@/lib/profile";
import { enqueueGenerationJob, invalidateChapterGeneration } from "@/lib/generation";

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
  const access = await authorize("course", await context.params);
  if (access instanceof Response) return access;
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
  const access = await authorize("course", await context.params);
  if (access instanceof Response) return access;
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

  const existing = db.select().from(chapters).where(eq(chapters.courseId, id)).orderBy(asc(chapters.idx)).all();
  const existingIds = new Set(existing.map((chapter) => chapter.id));
  if (body.data.chapters.some((chapter) => !existingIds.has(chapter.id))) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "The syllabus contains an unknown chapter.", retryable: false } },
      { status: 400 },
    );
  }

  if (new Set(body.data.chapters.map((chapter) => chapter.id)).size !== body.data.chapters.length) return NextResponse.json({ error: { code: "invalid_input", message: "A chapter cannot be edited twice in one request." } }, { status: 400 });
  const edits = new Map(body.data.chapters.map((chapter) => [chapter.id, chapter]));
  const merged = existing.map((chapter) => ({ ...chapter, ...edits.get(chapter.id) }));
  if (syllabusGraphIssues(merged).length) return NextResponse.json({ error: { code: "invalid_input", message: "Every prerequisite must identify an earlier chapter, without duplicates. Chapter titles must be distinct." } }, { status: 400 });
  if (course.qualityPolicyVersion) {
    if (course.preparationStatus !== "ready") return NextResponse.json({ error: { code: "preparing", message: "Wait for course preparation before editing." } }, { status: 409 });
    const plan = coursePlanSchema.safeParse({ topic: course.topic, brief: course.brief, chapters: merged });
    if (!plan.success) return NextResponse.json({ error: { code: "invalid_input", message: "The edited outline is incomplete." } }, { status: 400 });
    try {
      const agent = await agentForRequest(request);
      if (!agent) throw noAgentError();
      const review = reviewSchema.parse(await runAgentObject(agent, "review", `${REVIEW_PROMPT}\n${courseProfilePrompt(course.id)}\nLearning request: ${JSON.stringify(course.learningRequest)}\nArtifact: syllabus\nDraft: ${JSON.stringify(plan.data)}`, reviewSchema));
      if (review.issues.some((issue) => issue.severity === "blocking")) throw new QualityError();
    } catch (error) {
      return NextResponse.json({ error: { code: error instanceof QualityError ? "quality_rejected" : "review_failed", message: error instanceof QualityError ? "The edited outline needs revision to fit the course goal and chapter coverage." : "Could not review these edits. Try again.", retryable: true } }, { status: error instanceof QualityError ? 422 : 502 });
    }
  }

  const saved = db.transaction((tx) => {
    const current = tx.select().from(courses).where(eq(courses.id, id)).get();
    if (!current || current.startedAt || current.preparationVersion !== course.preparationVersion) return false;
    for (const chapter of body.data.chapters) {
      tx.update(chapters)
        .set({ title: chapter.title, objectives: chapter.objectives, prerequisites: chapter.prerequisites })
        .where(eq(chapters.id, chapter.id))
        .run();
    }
    if (course.qualityPolicyVersion) {
      tx.update(courses).set({ preparationVersion: course.preparationVersion + 1 }).where(eq(courses.id, id)).run();
      for (const chapter of existing) {
        const invalidated = invalidateChapterGeneration(chapter.id);
        if (invalidated && chapter.status === "open") enqueueGenerationJob("chapter", chapter.id, invalidated.contentGenerationVersion);
      }
    }
    return true;
  });
  if (!saved) return NextResponse.json({ error: { code: "course_changed", message: "The course changed while reviewing these edits. Reload it and try again." } }, { status: 409 });

  return NextResponse.json({ updated: body.data.chapters.length });
}
