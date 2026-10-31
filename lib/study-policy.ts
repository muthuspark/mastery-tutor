import { addDays, daysBetween } from "./study-calendar";
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30] as const;
export type ScheduleState = {
  intervalStage: number;
  dueDate: string;
  lastObservedDate: string | null;
  lastMissDate: string | null;
};
export function conceptKey(tag: string) {
  return tag.trim().toLowerCase().replace(/\s+/g, " ");
}
export function observeSchedule(
  state: ScheduleState | undefined,
  correct: boolean,
  date: string,
  kind: "chapter" | "review",
) {
  if (!correct || state?.lastMissDate === date)
    return {
      intervalStage: 0,
      dueDate: addDays(date, 1),
      lastObservedDate: date,
      lastMissDate: date,
    };
  if (!state)
    return {
      intervalStage: 0,
      dueDate: addDays(date, 1),
      lastObservedDate: date,
      lastMissDate: null,
    };
  if (kind === "chapter" || state.lastObservedDate === date)
    return { ...state, lastObservedDate: date };
  const intervalStage = Math.min(4, state.intervalStage + 1);
  return {
    intervalStage,
    dueDate: addDays(date, REVIEW_INTERVALS[intervalStage]),
    lastObservedDate: date,
    lastMissDate: state.lastMissDate,
  };
}
export function reviewReason(
  dueDate: string,
  today: string,
  lastOutcome: string | null,
) {
  const overdue = daysBetween(dueDate, today);
  return `${overdue > 0 ? `Overdue by ${overdue} ${overdue === 1 ? "day" : "days"}` : "Scheduled for today"}${lastOutcome === "incorrect" ? ". You missed this last time" : ""}`;
}
export function orderReviews<
  T extends { id: string; dueDate: string; lastOutcome: string | null },
>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      Number(b.lastOutcome === "incorrect") -
        Number(a.lastOutcome === "incorrect") ||
      a.id.localeCompare(b.id),
  );
}
export function selectNextLesson<
  C extends {
    id: string;
    topic: string;
    preparationStatus: string;
    startedAt: Date | null;
    createdAt: Date;
  },
  H extends {
    id: string;
    courseId: string;
    idx: number;
    title: string;
    status: string;
    prerequisites: number[];
  },
>(courses: C[], chapters: H[]) {
  const ordered = [...courses]
    .filter((c) => c.preparationStatus === "ready")
    .sort((a, b) => {
      const started = (c: C) =>
        Boolean(
          c.startedAt ||
            chapters.some((h) => h.courseId === c.id && h.status === "passed"),
        );
      return (
        Number(started(b)) - Number(started(a)) ||
        (b.startedAt ?? b.createdAt).getTime() -
          (a.startedAt ?? a.createdAt).getTime() ||
        a.id.localeCompare(b.id)
      );
    });
  for (const course of ordered) {
    const own = chapters.filter((h) => h.courseId === course.id);
    const chapter = own
      .filter(
        (h) =>
          h.status === "open" &&
          h.prerequisites.every((idx) =>
            own.some((p) => p.idx === idx && p.status === "passed"),
          ),
      )
      .sort((a, b) => a.idx - b.idx)[0];
    if (chapter)
      return {
        course: course.topic,
        title: chapter.title,
        href: `/course/${course.id}/ch/${chapter.idx}`,
        reason: `Continue ${course.topic}. Its prerequisites are complete.`,
      };
  }
  return null;
}
