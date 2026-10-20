import { desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { answers, chapters, courses, questions } from "@/lib/db/schema";
import { classifyCodexFailure, CodexError } from "@/lib/codex-errors";
import { dueReviewQuestions, latestAttempt, latestAttemptQuestionIds } from "@/lib/quiz";
import { isBalancedQuiz } from "@/lib/assessment-quality";
import { claimGenerationJob, enqueueGenerationJob } from "@/lib/generation";
import { processGenerationJob } from "@/lib/generation-worker";
import { recordGenerationEvent } from "@/lib/generation-observability";

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (!(error instanceof CodexError)) return NextResponse.json({ error: { code: "database_error", message: "Could not load the quiz.", retryable: true } }, { status: 500 });
  const classified = classifyCodexFailure(error);
  const status = classified.code === "not_found" ? 503 : classified.code === "timeout" ? 504 : 502;
  return NextResponse.json({ error: { code: classified.code, message: classified.message, retryable: classified.retryable } }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const chapter = db.select().from(chapters).where(eq(chapters.id, id)).get();
  if (!chapter) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
  if (chapter.status === "locked") return NextResponse.json({ error: { code: "locked", message: "This chapter is locked." } }, { status: 403 });
  const reviewed = db.select().from(courses).where(eq(courses.id, chapter.courseId)).get()?.qualityPolicyVersion;
  if (reviewed) {
    if (chapter.quizGenerationStatus === "failed") return NextResponse.json({ error: { code: "generation_failed", message: chapter.quizGenerationError ?? "Could not prepare this quiz. Try again.", retryable: true } }, { status: 503 });
    if (chapter.contentGenerationStatus !== "ready") return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
    if (chapter.quizGenerationStatus !== "ready" || chapter.quizGenerationVersion !== chapter.contentGenerationVersion) {
      enqueueGenerationJob("quiz", id, chapter.contentGenerationVersion);
      return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
    }
  }

  try {
    let current = db.select().from(questions).where(eq(questions.chapterId, id)).orderBy(desc(questions.createdAt)).all()
      .filter((question) => question.generationVersion === chapter.contentGenerationVersion && question.type === "mcq" && (question.options?.length ?? 0) >= 2)
      .slice(0, 10);
    const attempt = latestAttempt(id);
    const latestAttemptIds = attempt ? latestAttemptQuestionIds(attempt.id) : new Set<string>();
    const currentMcqs = current.filter((question): question is typeof question & { options: string[] } => question.type === "mcq" && question.options !== null);
    if (isBalancedQuiz(currentMcqs)) recordGenerationEvent("artifact_cache_hit", { artifactType: "quiz", targetId: id, generationVersion: chapter.contentGenerationVersion });
    if (!isBalancedQuiz(currentMcqs) && current.length) {
      const answeredIds = new Set(db.select({ questionId: answers.questionId }).from(answers).where(inArray(answers.questionId, current.map((question) => question.id))).all().map((row) => row.questionId));
      const staleIds = current.filter((question) => !answeredIds.has(question.id)).map((question) => question.id);
      if (staleIds.length) db.delete(questions).where(inArray(questions.id, staleIds)).run();
      current = [];
    }
    if (current.length < 10 || (attempt && !attempt.passed && current.some((question) => latestAttemptIds.has(question.id)))) {
      const hasReadyContent = chapter.contentGenerationStatus === "ready"
        || (chapter.contentGenerationStatus === "pending" && chapter.contentGenerationVersion === 1 && chapter.generatedAt);
      if (!chapter.content || !hasReadyContent) {
        return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
      }
      const job = enqueueGenerationJob("quiz", id, chapter.contentGenerationVersion);
      if (reviewed) {
        db.update(chapters).set({ quizGenerationStatus: "pending", quizGenerationError: null }).where(eq(chapters.id, id)).run();
        return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
      }
      const claimed = claimGenerationJob(job.id, `request-${randomUUID()}`);
      if (!claimed) return NextResponse.json({ status: "generating", retryable: true }, { status: 202 });
      await processGenerationJob(claimed, claimed.leaseOwner ?? "");
      current = db.select().from(questions).where(eq(questions.chapterId, id)).orderBy(desc(questions.createdAt)).all()
        .filter((question) => question.generationVersion === chapter.contentGenerationVersion && question.type === "mcq" && (question.options?.length ?? 0) >= 2)
        .slice(0, 10);
    }
    const exclude = new Set([...current.map((question) => question.id), ...latestAttemptIds]);
    const delivered = [...current, ...dueReviewQuestions(chapter.courseId, chapter.idx, exclude)]
      .map(({ id, type, prompt, options, isReview }) => ({ id, type, prompt, options, isReview }));
    return NextResponse.json({ questions: delivered });
  } catch (error) {
    return errorResponse(error);
  }
}
