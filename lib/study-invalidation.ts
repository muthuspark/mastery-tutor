import "server-only";
import { eq } from "drizzle-orm";
import {
  assessmentSessions,
  conceptReviewSchedules,
  studyReviewSessions,
} from "./db/schema";
import type { AssessmentTx } from "./assessment-sessions";
export function invalidateStudySource(tx: AssessmentTx, chapterId: string) {
  tx.update(conceptReviewSchedules)
    .set({ suspended: true })
    .where(eq(conceptReviewSchedules.chapterId, chapterId))
    .run();
  for (const row of tx
    .select()
    .from(studyReviewSessions)
    .where(eq(studyReviewSessions.status, "open"))
    .all()) {
    if (row.snapshot.questions.some((q) => q.chapterId === chapterId))
      tx.update(studyReviewSessions)
        .set({ status: "invalidated" })
        .where(eq(studyReviewSessions.id, row.id))
        .run();
  }
  for (const row of tx
    .select()
    .from(assessmentSessions)
    .where(eq(assessmentSessions.status, "open"))
    .all()) {
    if (
      row.chapterId === chapterId ||
      row.snapshot.questions.some((q) => q.chapterId === chapterId)
    )
      tx.update(assessmentSessions)
        .set({ status: "invalidated" })
        .where(eq(assessmentSessions.id, row.id))
        .run();
  }
}
