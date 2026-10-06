import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { answers, attempts, chapters, courses, questions, reviewItems } from "@/lib/db/schema";
import { classifyCodexFailure, CodexError } from "@/lib/codex-errors";
import { dueReviewQuestions, gradeAnswer } from "@/lib/quiz";
import { courseIsComplete, passed, prerequisitesPassed, remediation } from "@/lib/gating";
import { dueChapterIndex } from "@/lib/review";

type RouteContext = { params: Promise<{ id: string }> };
const attemptSchema = z.object({ answers: z.array(z.object({ questionId: z.string().uuid(), response: z.string().max(5000) })).min(1) });

function errorResponse(error: unknown) {
  if (!(error instanceof CodexError)) return NextResponse.json({ error: { code: "database_error", message: "Could not save the attempt.", retryable: true } }, { status: 500 });
  const classified = classifyCodexFailure(error);
  const status = classified.code === "not_found" ? 503 : classified.code === "timeout" ? 504 : 502;
  return NextResponse.json({ error: { code: classified.code, message: classified.message, retryable: classified.retryable } }, { status });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = attemptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_input", message: "Submit an answer for each question." } }, { status: 400 });
  const chapter = db.select().from(chapters).where(eq(chapters.id, id)).get();
  if (!chapter) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
  if (chapter.status === "locked") return NextResponse.json({ error: { code: "locked", message: "This chapter is locked." } }, { status: 403 });

  try {
    const reviewIds = new Set(dueReviewQuestions(chapter.courseId, chapter.idx).map((question) => question.id));
    const pending: Array<{ question: typeof questions.$inferSelect; response: string }> = [];
    for (const answer of parsed.data.answers) {
      const question = db.select().from(questions).where(eq(questions.id, answer.questionId)).get();
      if (!question || (question.chapterId !== id && !reviewIds.has(question.id))) {
        return NextResponse.json({ error: { code: "invalid_input", message: "The quiz contains an unknown question." } }, { status: 400 });
      }
      pending.push({ question, response: answer.response });
    }
    const graded = await Promise.all(pending.map(async ({ question, response }) => ({ question, response, ...(await gradeAnswer(question, response)) })));
    const score = graded.reduce((sum, answer) => sum + answer.score, 0) / graded.length;
    const didPass = passed(score);
    const previous = db.select({ attemptNo: attempts.attemptNo }).from(attempts).where(eq(attempts.chapterId, id)).all();
    const attemptNo = Math.max(0, ...previous.map((item) => item.attemptNo)) + 1;
    const attemptId = randomUUID();
    const now = new Date();
    let complete = false;
    let nextChapterIdx: number | null = null;
    db.transaction((tx) => {
      tx.insert(attempts).values({ id: attemptId, chapterId: id, attemptNo, score, passed: didPass, createdAt: now }).run();
      tx.insert(answers).values(graded.map((answer) => ({ id: randomUUID(), attemptId, questionId: answer.question.id, response: answer.response, score: answer.score, feedback: answer.feedback, createdAt: now }))).run();
      const allChapters = tx.select().from(chapters).where(eq(chapters.courseId, chapter.courseId)).all();
      const currentAsPassed = allChapters.map((item) => item.id === id ? { ...item, status: "passed" as const } : item);
      if (didPass) {
        tx.update(chapters).set({ status: "passed" }).where(eq(chapters.id, id)).run();
        const next = currentAsPassed.find((item) => item.idx === chapter.idx + 1);
        if (next && prerequisitesPassed(next, currentAsPassed)) {
          tx.update(chapters).set({ status: "open" }).where(eq(chapters.id, next.id)).run();
          nextChapterIdx = next.idx;
        }
        complete = courseIsComplete(currentAsPassed);
        if (complete) tx.update(courses).set({ completedAt: now }).where(eq(courses.id, chapter.courseId)).run();
      } else {
        for (const answer of graded.filter((item) => item.missedConcept)) {
          const conceptTag = answer.missedConcept as string;
          const existing = tx.select().from(reviewItems).where(and(eq(reviewItems.courseId, chapter.courseId), eq(reviewItems.conceptTag, conceptTag))).get();
          if (existing) {
            tx.update(reviewItems).set({ misses: existing.misses + 1, sourceQuestionId: answer.question.id, dueAfterChapterIdx: dueChapterIndex(chapter.idx, existing.misses) }).where(eq(reviewItems.id, existing.id)).run();
          } else {
            tx.insert(reviewItems).values({ id: randomUUID(), courseId: chapter.courseId, conceptTag, sourceQuestionId: answer.question.id, misses: 1, dueAfterChapterIdx: dueChapterIndex(chapter.idx, 0), createdAt: now }).run();
          }
        }
      }
    });
    return NextResponse.json({ attemptId, score, passed: didPass, complete, nextChapterIdx, remediation: didPass ? null : remediation(graded.flatMap((answer) => answer.missedConcept ? [answer.missedConcept] : [])), answers: graded.map(({ question, response, score: answerScore, feedback, missedConcept }) => ({ questionId: question.id, prompt: question.prompt, response, score: answerScore, feedback, modelAnswer: question.modelAnswer, missedConcept })) });
  } catch (error) {
    return errorResponse(error);
  }
}
