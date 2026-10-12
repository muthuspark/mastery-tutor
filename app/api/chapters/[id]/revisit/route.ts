import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { answers, chapters, courses, generationJobs, questions, reviewItems } from "@/lib/db/schema";
import { enqueueGenerationJob } from "@/lib/generation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const chapter = db.select().from(chapters).where(eq(chapters.id, id)).get();
  if (!chapter) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
  if (chapter.status === "locked") return NextResponse.json({ error: { code: "locked", message: "This chapter is locked." } }, { status: 403 });

  const now = new Date();
  db.transaction((tx) => {
    const questionIds = tx.select({ id: questions.id }).from(questions).where(eq(questions.chapterId, id)).all().map((question) => question.id);
    if (questionIds.length) {
      tx.delete(reviewItems).where(eq(reviewItems.sourceQuestionId, questionIds[0])).run();
      for (const questionId of questionIds.slice(1)) tx.delete(reviewItems).where(eq(reviewItems.sourceQuestionId, questionId)).run();
      tx.delete(answers).where(eq(answers.questionId, questionIds[0])).run();
      for (const questionId of questionIds.slice(1)) tx.delete(answers).where(eq(answers.questionId, questionId)).run();
      tx.delete(questions).where(eq(questions.chapterId, id)).run();
    }
    tx.delete(generationJobs).where(and(eq(generationJobs.artifactType, "quiz"), eq(generationJobs.targetId, id), eq(generationJobs.generationVersion, chapter.contentGenerationVersion))).run();
    tx.update(chapters).set({ status: "open", quizGenerationStatus: "pending", quizGenerationError: null, quizGenerationUpdatedAt: now }).where(eq(chapters.id, id)).run();
    tx.update(courses).set({ completedAt: null }).where(eq(courses.id, chapter.courseId)).run();
  });
  enqueueGenerationJob("quiz", id, chapter.contentGenerationVersion, now);
  return NextResponse.json({ reset: true, chapterId: id });
}
