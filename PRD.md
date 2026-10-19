# Course Chapter Page Improvements

## Problem

Learners can see their course progress, but may have to scan many completed chapters to find where to continue. Locked chapters do not explain how to unlock them, and “Revisit” can be mistaken for rereading even though it starts a progress-reset flow. Repeated actions also make the chapter outline longer than necessary.

## Goal

Help learners quickly identify the next lesson, understand chapter availability, and choose safely between reading and retaking.

## Requirements

1. **Make continuing obvious.** Show a prominent action near course progress that names and opens the current open chapter. Keep the ordered chapter list available.
2. **Explain locked chapters.** Show the actual prerequisite for unlocking a chapter. Use the product’s real progression rule; do not imply a prerequisite that is not enforced.
3. **Clarify completed-chapter actions.** Label the reset flow “Retake mastery check” (or equivalent). Keep “Read lesson” as a distinct action that does not reset progress. Preserve the existing reset confirmation and its safe cancel action.
4. **Reduce list scanning and repetition.** Preserve course order while reducing the visual weight or number of repeated actions for mastered chapters. If completed chapters are collapsed, learners must still be able to find and open them, and the current and locked chapters must remain easy to locate.
5. **Keep progress concise.** Retain clear course progress information while avoiding unnecessary duplication between the percentage and chapter count.

## Acceptance Criteria

- The current open chapter can be started from near the course progress summary without scanning completed rows.
- Each locked chapter, or the locked section, explains the accurate unlock condition.
- Reading a completed lesson is clearly distinct from retaking its mastery check; only the retake flow can reset progress.
- All chapters remain accessible in their original learning order, including when completed chapters are collapsed.
- Progress remains understandable without redundant labels or metrics.
- The page remains keyboard accessible and usable on mobile and desktop; action names and status do not rely on color alone.
- Verify the chapter page in the browser and run relevant checks.

## Out of Scope

- Changing course progression, mastery thresholds, or assessment behavior.
- Reordering chapters or removing access to completed lessons.
