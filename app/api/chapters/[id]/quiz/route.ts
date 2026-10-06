import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chapters, questions } from "@/lib/db/schema";
import { classifyCodexFailure, CodexError } from "@/lib/codex-errors";
import { dueReviewQuestions, generateQuiz, latestAttempt, latestAttemptQuestionIds } from "@/lib/quiz";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (!(error instanceof CodexError)) return NextResponse.json({ error: { code: "database_error", message: "Could not load the quiz.", retryable: true } }, { status: 500 });
  const classified = classifyCodexFailure(error);
  const status = classified.code === "not_found" ? 503 : classified.code === "timeout" ? 504 : 502;
  return NextResponse.json({ error: { code: classified.code, message: classified.message, retryable: classified.retryable } }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const chapter = db.select().from(chapters).where(eq(chapters.id, id)).get();
  if (!chapter) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
  if (chapter.status === "locked") return NextResponse.json({ error: { code: "locked", message: "This chapter is locked." } }, { status: 403 });

  try {
    let current = db.select().from(questions).where(eq(questions.chapterId, id)).orderBy(desc(questions.createdAt)).all();
    const attempt = latestAttempt(id);
    if (!current.length || (attempt && !attempt.passed && latestAttemptQuestionIds(attempt.id).size >= current.length)) {
      current = await generateQuiz(id);
    }
    return NextResponse.json({ questions: [...current, ...dueReviewQuestions(chapter.courseId, chapter.idx)] });
  } catch (error) {
    return errorResponse(error);
  }
}
