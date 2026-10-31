import { applyChapterStudyObservations } from "@/lib/study-store";
import {
  AssessmentError,
  decodeSubmission,
  snapshotCurrent,
} from "@/lib/assessment-sessions";
import { authorize } from "@/lib/access";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  answers,
  attempts,
  chapters,
  courses,
  reviewItems,
  assessmentSessions,
} from "@/lib/db/schema";
import { classifyCodexFailure, CodexError } from "@/lib/codex-errors";
import {
  courseIsComplete,
  passed,
  prerequisitesPassed,
  remediation,
} from "@/lib/gating";
import { dueChapterIndex } from "@/lib/review";
import { enqueueGenerationJob } from "@/lib/generation";

type RouteContext = { params: Promise<{ id: string }> };
const attemptSchema = z.object({
  assessmentId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        response: z.string().max(5000),
      }),
    )
    .min(1),
});

function errorResponse(error: unknown) {
  if (!(error instanceof CodexError))
    return NextResponse.json(
      {
        error: {
          code: "database_error",
          message: "Could not save the attempt.",
          retryable: true,
        },
      },
      { status: 500 },
    );
  const classified = classifyCodexFailure(error);
  const status =
    classified.code === "not_found"
      ? 503
      : classified.code === "timeout"
        ? 504
        : 502;
  return NextResponse.json(
    {
      error: {
        code: classified.code,
        message: classified.message,
        retryable: classified.retryable,
      },
    },
    { status },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const access = await authorize("chapter", await context.params);
  if (access instanceof Response) return access;
  const { id } = await context.params;
  const parsed = attemptSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      {
        error: {
          code: "invalid_input",
          message: "Reload the quiz and submit an answer for each question.",
        },
      },
      { status: 400 },
    );
  const chapter = db.select().from(chapters).where(eq(chapters.id, id)).get();
  if (!chapter)
    return NextResponse.json(
      { error: { code: "not_found", message: "Chapter not found." } },
      { status: 404 },
    );
  if (chapter.status === "locked")
    return NextResponse.json(
      { error: { code: "locked", message: "This chapter is locked." } },
      { status: 403 },
    );

  try {
    let replay = false;
    const result = db.transaction(
      (tx) => {
        const session = tx
          .select()
          .from(assessmentSessions)
          .where(
            and(
              eq(assessmentSessions.id, parsed.data.assessmentId),
              eq(assessmentSessions.userId, access.user.id),
              eq(assessmentSessions.chapterId, id),
            ),
          )
          .get();
        if (!session)
          throw new AssessmentError(
            "Assessment unavailable. Reload the quiz.",
            404,
          );
        const canonical = decodeSubmission(
          session.snapshot,
          parsed.data.answers,
        );
        const submission = JSON.stringify(canonical);
        if (session.status === "consumed") {
          if (session.submission !== submission)
            throw new AssessmentError(
              "This quiz was already submitted with different answers.",
            );
          replay = true;
          return session.result!;
        }
        if (
          session.status !== "open" ||
          !snapshotCurrent(session.snapshot, access.user.id, tx)
        )
          throw new AssessmentError(
            "This quiz changed. Reload it before submitting.",
          );
        const reviewIds = new Set(
          session.snapshot.questions.filter((q) => q.isReview).map((q) => q.id),
        );
        const graded = canonical.map((answer) => {
          const question = session.snapshot.questions.find(
            (q) => q.id === answer.questionId,
          )!;
          const correct =
            question.modelAnswer.trim().toLowerCase().replace(/\s+/g, " ") ===
            answer.response.trim().toLowerCase().replace(/\s+/g, " ");
          return {
            question,
            response: answer.response,
            score: correct ? 1 : 0,
            feedback: correct
              ? "Correct."
              : `The expected answer is: ${question.modelAnswer}.\n\n${question.rubric}`,
            missedConcept: correct ? null : question.conceptTag,
          };
        });
        const score =
          graded.reduce((sum, answer) => sum + answer.score, 0) / graded.length;
        const didPass = passed(score);
        const previous = db
          .select({ attemptNo: attempts.attemptNo })
          .from(attempts)
          .where(eq(attempts.chapterId, id))
          .all();
        const attemptNo =
          Math.max(0, ...previous.map((item) => item.attemptNo)) + 1;
        const attemptId = randomUUID();
        const now = new Date();
        let complete = false;
        let nextChapterIdx: number | null = null;
        tx.insert(attempts)
          .values({
            id: attemptId,
            chapterId: id,
            attemptNo,
            score,
            passed: didPass,
            createdAt: now,
          })
          .run();
        tx.insert(answers)
          .values(
            graded.map((answer) => ({
              id: randomUUID(),
              attemptId,
              questionId: answer.question.id,
              response: answer.response,
              score: answer.score,
              feedback: answer.feedback,
              createdAt: now,
            })),
          )
          .run();
        const allChapters = tx
          .select()
          .from(chapters)
          .where(eq(chapters.courseId, chapter.courseId))
          .all();
        const currentAsPassed = allChapters.map((item) =>
          item.id === id ? { ...item, status: "passed" as const } : item,
        );
        if (didPass) {
          tx.update(chapters)
            .set({ status: "passed" })
            .where(eq(chapters.id, id))
            .run();
          const next = currentAsPassed.find(
            (item) => item.idx === chapter.idx + 1,
          );
          if (
            next &&
            next.status === "locked" &&
            prerequisitesPassed(next, currentAsPassed)
          ) {
            tx.update(chapters)
              .set({ status: "open" })
              .where(eq(chapters.id, next.id))
              .run();
            nextChapterIdx = next.idx;
          }
          complete = courseIsComplete(currentAsPassed);
          if (complete)
            tx.update(courses)
              .set({ completedAt: now })
              .where(eq(courses.id, chapter.courseId))
              .run();
        }
        // Retire only review questions successfully answered in this attempt.
        // Process new misses afterwards so another miss on the same concept wins.
        for (const answer of graded.filter(
          (item) => item.score >= 0.8 && reviewIds.has(item.question.id),
        )) {
          tx.delete(reviewItems)
            .where(
              and(
                eq(reviewItems.courseId, chapter.courseId),
                eq(reviewItems.sourceQuestionId, answer.question.id),
              ),
            )
            .run();
        }
        for (const answer of graded.filter((item) => item.missedConcept)) {
          const conceptTag = answer.missedConcept as string;
          const existing = tx
            .select()
            .from(reviewItems)
            .where(
              and(
                eq(reviewItems.courseId, chapter.courseId),
                eq(reviewItems.conceptTag, conceptTag),
              ),
            )
            .get();
          if (existing) {
            tx.update(reviewItems)
              .set({
                misses: existing.misses + 1,
                sourceQuestionId: answer.question.id,
                dueAfterChapterIdx: dueChapterIndex(
                  chapter.idx,
                  existing.misses,
                ),
              })
              .where(eq(reviewItems.id, existing.id))
              .run();
          } else {
            tx.insert(reviewItems)
              .values({
                id: randomUUID(),
                courseId: chapter.courseId,
                conceptTag,
                sourceQuestionId: answer.question.id,
                misses: 1,
                dueAfterChapterIdx: dueChapterIndex(chapter.idx, 0),
                createdAt: now,
              })
              .run();
          }
        }
        applyChapterStudyObservations(
          tx,
          access.user.id,
          attemptId,
          graded,
          now,
        );
        const committed = {
          attemptId,
          score,
          passed: didPass,
          complete,
          nextChapterIdx,
          remediation: didPass
            ? null
            : remediation(
                graded.flatMap((answer) =>
                  answer.missedConcept ? [answer.missedConcept] : [],
                ),
              ),
          answers: graded.map(
            ({
              question,
              response,
              score: answerScore,
              feedback,
              missedConcept,
            }) => ({
              questionId: question.id,
              prompt: question.prompt,
              response,
              score: answerScore,
              feedback,
              modelAnswer: question.modelAnswer,
              missedConcept,
            }),
          ),
        };
        tx.update(assessmentSessions)
          .set({ status: "consumed", submission, result: committed })
          .where(eq(assessmentSessions.id, session.id))
          .run();
        return committed;
      },
      { behavior: "immediate" },
    );
    // Cache warming is best effort after commit; never turn a saved result into an error.
    if (!replay && typeof result.nextChapterIdx === "number") {
      try {
        const next = db
          .select()
          .from(chapters)
          .where(
            and(
              eq(chapters.courseId, chapter.courseId),
              eq(chapters.idx, result.nextChapterIdx),
            ),
          )
          .get();
        if (next)
          enqueueGenerationJob(
            "chapter",
            next.id,
            next.contentGenerationVersion,
          );
      } catch {
        /* Saved result remains authoritative. */
      }
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AssessmentError)
      return NextResponse.json(
        { error: { code: "assessment_invalid", message: error.message } },
        { status: error.status },
      );
    return errorResponse(error);
  }
}
