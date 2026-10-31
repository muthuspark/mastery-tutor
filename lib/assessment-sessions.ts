import "server-only";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { assessmentSessions, chapters, courses, questions } from "./db/schema";
import { normalizeOption } from "./assessment-quality";

export class AssessmentError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export type AssessmentQuestion = typeof questions.$inferSelect & {
  sourceVersion: number;
  preparationVersion: number;
};
export type AssessmentSnapshot = { questions: AssessmentQuestion[] };
export type AssessmentTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function validOptions(q: {
  type: string;
  options: string[] | null;
  modelAnswer: string;
}) {
  const options = q.options?.map(normalizeOption) ?? [];
  return (
    q.type === "mcq" &&
    options.length >= 2 &&
    options.every(Boolean) &&
    new Set(options).size === options.length &&
    options.filter((o) => o === normalizeOption(q.modelAnswer)).length === 1
  );
}
export function snapshotCurrent(
  snapshot: AssessmentSnapshot,
  userId: string,
  tx: AssessmentTx | typeof db = db,
) {
  return snapshot.questions.every((q) => {
    const chapter = tx
      .select()
      .from(chapters)
      .where(eq(chapters.id, q.chapterId))
      .get();
    const course =
      chapter &&
      tx.select().from(courses).where(eq(courses.id, chapter.courseId)).get();
    const current = tx
      .select()
      .from(questions)
      .where(eq(questions.id, q.id))
      .get();
    return (
      chapter &&
      course?.userId === userId &&
      course.preparationStatus === "ready" &&
      chapter.status !== "locked" &&
      chapter.contentGenerationVersion === q.sourceVersion &&
      course.preparationVersion === q.preparationVersion &&
      current &&
      current.chapterId === q.chapterId &&
      current.type === q.type &&
      current.generationVersion === q.sourceVersion &&
      current.generationVersion === q.generationVersion &&
      current.prompt === q.prompt &&
      current.modelAnswer === q.modelAnswer &&
      current.rubric === q.rubric &&
      current.conceptTag === q.conceptTag &&
      JSON.stringify(current.options) === JSON.stringify(q.options)
    );
  });
}
export function openAssessment(userId: string, chapterId: string) {
  const row = db
    .select()
    .from(assessmentSessions)
    .where(
      and(
        eq(assessmentSessions.userId, userId),
        eq(assessmentSessions.chapterId, chapterId),
        eq(assessmentSessions.status, "open"),
      ),
    )
    .get();
  if (row && snapshotCurrent(row.snapshot, userId)) return row;
  if (row)
    db.update(assessmentSessions)
      .set({ status: "invalidated" })
      .where(and(eq(assessmentSessions.id, row.id), eq(assessmentSessions.status, "open")))
      .run();
}
export function publicAssessment(row: typeof assessmentSessions.$inferSelect) {
  return {
    assessmentId: row.id,
    questions: row.snapshot.questions.map(
      ({ id, type, prompt, options, isReview }) => ({
        id,
        type,
        prompt,
        options,
        isReview,
      }),
    ),
  };
}
export function issueAssessment(
  userId: string,
  chapterId: string,
  selected: (typeof questions.$inferSelect)[],
) {
  return db.transaction(
    (tx) => {
      const existing = openAssessment(userId, chapterId);
      if (existing) return existing;
      if (
        !selected.length ||
        new Set(selected.map((q) => q.id)).size !== selected.length ||
        !selected.every(validOptions)
      )
        throw new AssessmentError(
          "This quiz needs fresh questions. Reload it.",
        );
      const snapshot: AssessmentSnapshot = {
        questions: selected.map((q) => {
          const chapter = tx
            .select()
            .from(chapters)
            .where(eq(chapters.id, q.chapterId))
            .get();
          const course =
            chapter &&
            tx
              .select()
              .from(courses)
              .where(eq(courses.id, chapter.courseId))
              .get();
          if (!chapter || course?.userId !== userId)
            throw new AssessmentError("Question unavailable.");
          return {
            ...q,
            sourceVersion: chapter.contentGenerationVersion,
            preparationVersion: course.preparationVersion,
          };
        }),
      };
      if (!snapshotCurrent(snapshot, userId, tx))
        throw new AssessmentError("This quiz changed. Reload it.");
      return tx
        .insert(assessmentSessions)
        .values({
          id: randomUUID(),
          userId,
          chapterId,
          status: "open",
          snapshot,
          createdAt: new Date(),
        })
        .returning()
        .get();
    },
    { behavior: "immediate" },
  );
}
export function decodeSubmission(
  snapshot: AssessmentSnapshot,
  submitted: { questionId: string; response: string }[],
) {
  if (
    submitted.length !== snapshot.questions.length ||
    new Set(submitted.map((a) => a.questionId)).size !== submitted.length
  )
    throw new AssessmentError("Answer every question exactly once.", 400);
  return snapshot.questions.map((q) => {
    const answer = submitted.find((a) => a.questionId === q.id);
    const option = q.options?.find(
      (o) => normalizeOption(o) === normalizeOption(answer?.response ?? ""),
    );
    if (!answer || option === undefined)
      throw new AssessmentError(
        "Choose a valid answer for every issued question.",
        400,
      );
    return { questionId: q.id, response: option };
  });
}
