import { normalizeOption } from "./assessment-quality";
import type { TodayStudy, ReviewPublic, ReviewResult } from "./study-contracts";
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import {
  chapters,
  courses,
  questions,
  reviewItems,
  studyPreferences,
  conceptReviewSchedules,
  studyReviewSessions,
  studyReviewEvents,
} from "./db/schema";
import {
  AssessmentError,
  snapshotCurrent,
  type AssessmentQuestion,
  type AssessmentTx,
  validOptions,
} from "./assessment-sessions";
import {
  conceptKey,
  observeSchedule,
  orderReviews,
  reviewReason,
  selectNextLesson,
} from "./study-policy";
import { localDate, validTimeZone, nextRollover } from "./study-calendar";

export type ReviewSnapshot = {
  timeZone: string;
  questions: (AssessmentQuestion & {
    scheduleId: string;
    revision: number;
    concept: string;
    course: string;
    reason: string;
  })[];
};
export type StudyDb = AssessmentTx | typeof db;
export function studyContext(userId: string, tx: StudyDb = db) {
  const ownedCourses = tx
    .select()
    .from(courses)
    .where(eq(courses.userId, userId))
    .all();
  const ownedChapters = ownedCourses.length
    ? tx
        .select()
        .from(chapters)
        .where(
          inArray(
            chapters.courseId,
            ownedCourses.map((c) => c.id),
          ),
        )
        .all()
    : [];
  const ownedQuestions = ownedChapters.length
    ? tx
        .select()
        .from(questions)
        .where(
          inArray(
            questions.chapterId,
            ownedChapters.map((c) => c.id),
          ),
        )
        .all()
    : [];
  const misses = ownedCourses.length
    ? tx
        .select()
        .from(reviewItems)
        .where(
          inArray(
            reviewItems.courseId,
            ownedCourses.map((c) => c.id),
          ),
        )
        .all()
    : [];
  return {
    courses: ownedCourses,
    chapters: ownedChapters,
    questions: ownedQuestions,
    misses,
  };
}
export function setupStudy(userId: string, timeZone: string, now = new Date()) {
  if (!validTimeZone(timeZone))
    throw new AssessmentError("Choose a valid review time zone.", 400);
  return db.transaction(
    (tx) => {
      const previous = tx
        .select()
        .from(studyPreferences)
        .where(eq(studyPreferences.userId, userId))
        .get();
      if (previous) {
        if (previous.timeZone !== timeZone) {
          tx.update(studyPreferences)
            .set({ timeZone })
            .where(eq(studyPreferences.userId, userId))
            .run();
          tx.update(studyReviewSessions)
            .set({ status: "invalidated" })
            .where(
              and(
                eq(studyReviewSessions.userId, userId),
                eq(studyReviewSessions.status, "open"),
              ),
            )
            .run();
        }
        return { timeZone };
      }
      tx.insert(studyPreferences)
        .values({ userId, timeZone, initializedAt: now })
        .run();
      const context = studyContext(userId, tx);
      const missedIds = new Set(context.misses.map((r) => r.sourceQuestionId));
      for (const q of [...context.questions].sort(
        (a, b) =>
          Number(missedIds.has(b.id)) - Number(missedIds.has(a.id)) ||
          a.id.localeCompare(b.id),
      )) {
        const chapter = context.chapters.find((c) => c.id === q.chapterId)!;
        if (
          chapter.status === "locked" ||
          (chapter.status !== "passed" && !missedIds.has(q.id)) ||
          q.generationVersion !== chapter.contentGenerationVersion ||
          !validOptions(q) ||
          !conceptKey(q.conceptTag)
        )
          continue;
        tx.insert(conceptReviewSchedules)
          .values({
            id: randomUUID(),
            userId,
            courseId: chapter.courseId,
            chapterId: q.chapterId,
            normalizedTag: conceptKey(q.conceptTag),
            displayTag: q.conceptTag.trim(),
            sourceQuestionId: q.id,
            sourceContentVersion: chapter.contentGenerationVersion,
            dueDate: localDate(now, timeZone),
            lastOutcome: missedIds.has(q.id) ? "incorrect" : null,
          })
          .onConflictDoNothing()
          .run();
      }
      return { timeZone };
    },
    { behavior: "immediate" },
  );
}

export function applyStudyObservation(
  tx: AssessmentTx,
  userId: string,
  question: AssessmentQuestion,
  correct: boolean,
  sourceKind: "chapter" | "review",
  sourceEventId: string,
  now: Date,
) {
  const preferences = tx
    .select()
    .from(studyPreferences)
    .where(eq(studyPreferences.userId, userId))
    .get();
  const normalizedTag = conceptKey(question.conceptTag);
  if (!preferences || !normalizedTag) return null;
  const chapter = tx
    .select()
    .from(chapters)
    .where(eq(chapters.id, question.chapterId))
    .get();
  const course =
    chapter &&
    tx.select().from(courses).where(eq(courses.id, chapter.courseId)).get();
  if (!chapter || course?.userId !== userId || chapter.status === "locked")
    throw new AssessmentError("Source unavailable.");
  const existing = tx
    .select()
    .from(conceptReviewSchedules)
    .where(
      and(
        eq(conceptReviewSchedules.userId, userId),
        eq(conceptReviewSchedules.chapterId, question.chapterId),
        eq(conceptReviewSchedules.normalizedTag, normalizedTag),
      ),
    )
    .get();
  if (
    existing &&
    tx
      .select()
      .from(studyReviewEvents)
      .where(
        and(
          eq(studyReviewEvents.scheduleId, existing.id),
          eq(studyReviewEvents.sourceKind, sourceKind),
          eq(studyReviewEvents.sourceEventId, sourceEventId),
        ),
      )
      .get()
  )
    return existing;
  const date = localDate(now, preferences.timeZone);
  const next = observeSchedule(existing, correct, date, sourceKind);
  const values = {
    ...next,
    sourceQuestionId: question.id,
    sourceContentVersion: question.sourceVersion,
    suspended: false,
    lastObservedAt: now,
    lastOutcome: (correct ? "correct" : "incorrect") as "correct" | "incorrect",
    revision: (existing?.revision ?? 0) + 1,
  };
  const schedule = existing
    ? tx
        .update(conceptReviewSchedules)
        .set(values)
        .where(eq(conceptReviewSchedules.id, existing.id))
        .returning()
        .get()!
    : tx
        .insert(conceptReviewSchedules)
        .values({
          ...values,
          id: randomUUID(),
          userId,
          courseId: chapter.courseId,
          chapterId: question.chapterId,
          normalizedTag,
          displayTag: question.conceptTag.trim(),
        })
        .returning()
        .get();
  tx.insert(studyReviewEvents)
    .values({
      id: randomUUID(),
      userId,
      scheduleId: schedule.id,
      sourceKind,
      sourceEventId,
      outcome: correct ? "correct" : "incorrect",
      observedAt: now,
      localDate: date,
    })
    .run();
  return schedule;
}
export function applyChapterStudyObservations(
  tx: AssessmentTx,
  userId: string,
  attemptId: string,
  graded: { question: AssessmentQuestion; score: number }[],
  now: Date,
) {
  const grouped = new Map<
    string,
    { question: AssessmentQuestion; score: number }
  >();
  for (const item of graded) {
    const key = `${item.question.chapterId}:${conceptKey(item.question.conceptTag)}`;
    const prior = grouped.get(key);
    if (!prior || item.score < prior.score) grouped.set(key, item);
  }
  for (const item of grouped.values())
    applyStudyObservation(
      tx,
      userId,
      item.question,
      item.score === 1,
      "chapter",
      attemptId,
      now,
    );
}

export function studyCandidates(userId: string, tx: StudyDb = db) {
  const context = studyContext(userId, tx);
  const schedules = tx
    .select()
    .from(conceptReviewSchedules)
    .where(eq(conceptReviewSchedules.userId, userId))
    .all();
  const candidates = schedules.map((schedule) => {
    const chapter = context.chapters.find((c) => c.id === schedule.chapterId);
    const course = context.courses.find((c) => c.id === schedule.courseId);
    const question =
      !schedule.suspended &&
      chapter?.status !== "locked" &&
      course?.preparationStatus === "ready" &&
      chapter?.contentGenerationVersion === schedule.sourceContentVersion
        ? context.questions
            .filter(
              (q) =>
                q.chapterId === schedule.chapterId &&
                q.generationVersion === chapter.contentGenerationVersion &&
                conceptKey(q.conceptTag) === schedule.normalizedTag &&
                validOptions(q),
            )
            .sort(
              (a, b) =>
                Number(b.id === schedule.sourceQuestionId) -
                  Number(a.id === schedule.sourceQuestionId) ||
                a.id.localeCompare(b.id),
            )[0]
        : undefined;
    return { schedule, chapter, course, question };
  });
  const missing = new Set<string>();
  for (const q of context.questions) {
    const chapter = context.chapters.find((c) => c.id === q.chapterId)!;
    if (
      chapter.status === "locked" ||
      (chapter.status !== "passed" &&
        !context.misses.some((m) => m.sourceQuestionId === q.id))
    )
      continue;
    const key = `${q.chapterId}:${conceptKey(q.conceptTag) || q.id}`;
    if (
      !schedules.some(
        (s) =>
          s.chapterId === q.chapterId &&
          s.normalizedTag === conceptKey(q.conceptTag),
      )
    )
      missing.add(key);
  }
  return { context, candidates, missingCount: missing.size };
}
export function todayStudy(userId: string, now = new Date()): TodayStudy {
  const preferences = db
    .select()
    .from(studyPreferences)
    .where(eq(studyPreferences.userId, userId))
    .get();
  const timeZone = preferences?.timeZone ?? "UTC",
    today = localDate(now, timeZone);
  const { context, candidates, missingCount } = studyCandidates(userId);
  const due = orderReviews(
    candidates
      .filter((c) => c.question && c.schedule.dueDate <= today)
      .map((c) => ({ ...c.schedule, candidate: c })),
  );
  const future =
    candidates
      .filter((c) => c.question && c.schedule.dueDate > today)
      .map((c) => c.schedule.dueDate)
      .sort()[0] ?? null;
  const open = db
    .select()
    .from(studyReviewSessions)
    .where(
      and(
        eq(studyReviewSessions.userId, userId),
        eq(studyReviewSessions.status, "open"),
      ),
    )
    .get();
  return {
    setupRequired: !preferences,
    today,
    timeZone,
    nextRollover: nextRollover(now, timeZone),
    dueCount: due.length,
    unavailableCount: preferences
      ? missingCount + candidates.filter((c) => !c.question).length
      : 0,
    items: due
      .slice(0, 5)
      .map((s) => ({
        id: s.id,
        concept: s.displayTag,
        course: s.candidate.course!.topic,
        chapter: s.candidate.chapter!.title,
        courseId: s.courseId,
        chapterIdx: s.candidate.chapter!.idx,
        dueDate: s.dueDate,
        reason: reviewReason(s.dueDate, today, s.lastOutcome),
      })),
    nextLesson: selectNextLesson(context.courses, context.chapters),
    nextDueDate: future,
    openReviewId: open?.id ?? null,
  };
}

export function reviewCurrent(
  row: typeof studyReviewSessions.$inferSelect,
  tx: StudyDb = db,
) {
  const preferences = tx
    .select()
    .from(studyPreferences)
    .where(eq(studyPreferences.userId, row.userId))
    .get();
  return (
    row.status === "open" &&
    preferences?.timeZone === row.snapshot.timeZone &&
    snapshotCurrent(row.snapshot, row.userId, tx) &&
    row.snapshot.questions.every((q) => {
      const schedule = tx
        .select()
        .from(conceptReviewSchedules)
        .where(
          and(
            eq(conceptReviewSchedules.id, q.scheduleId),
            eq(conceptReviewSchedules.userId, row.userId),
          ),
        )
        .get();
      return (
        schedule && !schedule.suspended && schedule.revision === q.revision
      );
    })
  );
}
export function publicReview(
  row: typeof studyReviewSessions.$inferSelect,
): ReviewPublic {
  return {
    id: row.id,
    status: row.status,
    questions: row.snapshot.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options!,
      concept: q.concept,
      course: q.course,
      reason: q.reason,
    })),
    result: row.result,
  };
}
export function issueReview(userId: string, now = new Date(), restart = false) {
  return db.transaction(
    (tx) => {
      const open = tx
        .select()
        .from(studyReviewSessions)
        .where(
          and(
            eq(studyReviewSessions.userId, userId),
            eq(studyReviewSessions.status, "open"),
          ),
        )
        .get();
      if (open && !restart && reviewCurrent(open, tx))
        return publicReview(open);
      if (open)
        tx.update(studyReviewSessions)
          .set({ status: "invalidated" })
          .where(eq(studyReviewSessions.id, open.id))
          .run();
      const preferences = tx
        .select()
        .from(studyPreferences)
        .where(eq(studyPreferences.userId, userId))
        .get();
      if (!preferences)
        throw new AssessmentError("Set up your review time zone first.", 400);
      const today = localDate(now, preferences.timeZone);
      const candidates = studyCandidates(userId, tx).candidates;
      const selected = orderReviews(
        candidates
          .filter((c) => c.question && c.schedule.dueDate <= today)
          .map((c) => ({ ...c.schedule, candidate: c })),
      ).slice(0, 5);
      if (!selected.length)
        throw new AssessmentError("No reviews are due right now.");
      const snapshot: ReviewSnapshot = {
        timeZone: preferences.timeZone,
        questions: selected.map((s) => {
          const c = s.candidate;
          return {
            ...c.question!,
            sourceVersion: c.chapter!.contentGenerationVersion,
            preparationVersion: c.course!.preparationVersion,
            scheduleId: s.id,
            revision: s.revision,
            concept: s.displayTag,
            course: c.course!.topic,
            reason: reviewReason(s.dueDate, today, s.lastOutcome),
          };
        }),
      };
      return publicReview(
        tx
          .insert(studyReviewSessions)
          .values({
            id: randomUUID(),
            userId,
            status: "open",
            snapshot,
            createdAt: now,
          })
          .returning()
          .get(),
      );
    },
    { behavior: "immediate" },
  );
}
export function loadReview(userId: string, id: string) {
  const row = db
    .select()
    .from(studyReviewSessions)
    .where(
      and(
        eq(studyReviewSessions.id, id),
        eq(studyReviewSessions.userId, userId),
      ),
    )
    .get();
  if (!row) throw new AssessmentError("Review unavailable.", 404);
  if (row.status !== "consumed" && !reviewCurrent(row))
    throw new AssessmentError(
      "This review changed. Refresh it before submitting.",
    );
  return publicReview(row);
}
export function submitReview(
  userId: string,
  id: string,
  answers: { questionId: string; selectedOptionIndex: number }[],
  now = new Date(),
) {
  return db.transaction(
    (tx) => {
      const row = tx
        .select()
        .from(studyReviewSessions)
        .where(
          and(
            eq(studyReviewSessions.id, id),
            eq(studyReviewSessions.userId, userId),
          ),
        )
        .get();
      if (!row) throw new AssessmentError("Review unavailable.", 404);
      const issued = row.snapshot.questions;
      if (
        answers.length !== issued.length ||
        new Set(answers.map((a) => a.questionId)).size !== issued.length
      )
        throw new AssessmentError("Answer every question exactly once.", 400);
      const canonical = issued.map((q) => {
        const answer = answers.find((a) => a.questionId === q.id);
        if (
          !answer ||
          !Number.isInteger(answer.selectedOptionIndex) ||
          answer.selectedOptionIndex < 0 ||
          answer.selectedOptionIndex >= q.options!.length
        )
          throw new AssessmentError(
            "Choose a valid option for every question.",
            400,
          );
        return answer;
      });
      const submission = JSON.stringify(
        canonical.map((a) => ({
          questionId: a.questionId,
          selectedOptionIndex: a.selectedOptionIndex,
        })),
      );
      if (row.status === "consumed") {
        if (submission !== row.submission)
          throw new AssessmentError(
            "This review already has different saved answers.",
          );
        return row.result!;
      }
      if (!reviewCurrent(row, tx))
        throw new AssessmentError(
          "This review changed. Refresh it before submitting.",
        );
      const result: ReviewResult = {
        answers: issued.map((q, i) => {
          const response = q.options![canonical[i].selectedOptionIndex],
            correct =
              normalizeOption(response) === normalizeOption(q.modelAnswer);
          const schedule = applyStudyObservation(
            tx,
            userId,
            q,
            correct,
            "review",
            row.id,
            now,
          )!;
          return {
            id: q.id,
            concept: q.concept,
            prompt: q.prompt,
            response,
            correct,
            feedback:
              `${correct ? "Correct." : `The expected answer is: ${q.modelAnswer}.`} ${q.rubric}`.trim(),
            modelAnswer: q.modelAnswer,
            dueDate: schedule.dueDate,
          };
        }),
      };
      tx.update(studyReviewSessions)
        .set({ status: "consumed", submission, result })
        .where(eq(studyReviewSessions.id, row.id))
        .run();
      return result;
    },
    { behavior: "immediate" },
  );
}
