import { desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { answers, chapters, questions } from "@/lib/db/schema";
import { classifyCodexFailure, CodexError } from "@/lib/codex-errors";
import { dueReviewQuestions, generateQuiz, latestAttempt, latestAttemptQuestionIds } from "@/lib/quiz";
import { agentForRequest, noAgentError } from "@/lib/agent";
import { isBalancedQuiz } from "@/lib/assessment-quality";

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

  try {
    let current = db.select().from(questions).where(eq(questions.chapterId, id)).orderBy(desc(questions.createdAt)).all()
      .filter((question) => question.type === "mcq" && (question.options?.length ?? 0) >= 2)
      .slice(0, 10);
    const attempt = latestAttempt(id);
    const latestAttemptIds = attempt ? latestAttemptQuestionIds(attempt.id) : new Set<string>();
    const currentMcqs = current.filter((question): question is typeof question & { options: string[] } => question.type === "mcq" && question.options !== null);
    if (!isBalancedQuiz(currentMcqs) && current.length) {
      const answeredIds = new Set(db.select({ questionId: answers.questionId }).from(answers).where(inArray(answers.questionId, current.map((question) => question.id))).all().map((row) => row.questionId));
      const staleIds = current.filter((question) => !answeredIds.has(question.id)).map((question) => question.id);
      if (staleIds.length) db.delete(questions).where(inArray(questions.id, staleIds)).run();
      current = [];
    }
    if (current.length < 10 || (attempt && !attempt.passed && current.some((question) => latestAttemptIds.has(question.id)))) {
      const agent = await agentForRequest(request);
      if (!agent) throw noAgentError();
      current = await generateQuiz(id, agent);
    }
    const exclude = new Set([...current.map((question) => question.id), ...latestAttemptIds]);
    return NextResponse.json({ questions: [...current, ...dueReviewQuestions(chapter.courseId, chapter.idx, exclude)] });
  } catch (error) {
    return errorResponse(error);
  }
}
