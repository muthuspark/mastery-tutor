---
target: chapters page / components/course-page.tsx
total_score: 27
p0_count: 0
p1_count: 2
timestamp: 2026-10-19T05-26-01Z
slug: components-course-page-tsx
---
# Course page critique

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Progress and chapter states are clear; the current chapter action sits below the initial viewport. |
| 2 | Match System / Real World | 3/4 | Language is familiar overall; “mastered” is not explained, and “Revisit” hides a reset consequence. |
| 3 | User Control and Freedom | 3/4 | The revisit dialog offers a safe cancel, but a committed reset has no undo. |
| 4 | Consistency and Standards | 3/4 | The visual system is consistent; mastered chapters expose two links with overlapping destinations and unclear differences. |
| 5 | Error Prevention | 4/4 | Reset consequences are disclosed and confirmed before proceeding. |
| 6 | Recognition Rather Than Recall | 3/4 | Progress and statuses are visible, while the unlock rule and current next step require scanning. |
| 7 | Flexibility and Efficiency | 2/4 | There is no quick jump to the current chapter from the top; the learner scans a long ordered list. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Strong editorial hierarchy, with repeated per-row actions adding length and visual repetition. |
| 9 | Error Recovery | 3/4 | The source provides retry and failure states; a live failure was not induced. |
| 10 | Help and Documentation | 0/4 | No contextual guidance explains mastery, locked chapters, or retaking. |
| **Total** |  | **27/40** | **Acceptable — significant improvements would make the next step easier to find.** |

## Anti-Patterns Verdict

**LLM assessment:** No obvious AI-generated feel. The restrained warm paper palette and serif display type fit the established editorial system. Chapter titles are specific; there are no generic marketing blocks, repetitive feature cards, gradients, or decorative UI motifs. The main weakness is task clarity and action placement rather than visual identity.

**Deterministic scan:** The scoped detector reported zero findings (`[]`) for `components/course-page.tsx`. No false positives were identified.

**Browser evidence:** The course page rendered in Chrome with the course title, 53% progress, 8 of 15 chapters mastered, the ordered chapter list, and export action visible. Browser console warning/error logs were empty. In-page detector injection was unavailable through the read-only browser evaluation surface, so no user-visible overlay is available.

## Overall Impression

The page feels calm, readable, and trustworthy. It gives a useful course map, but after progress is established the learner still has to hunt for the next action. Make “continue” obvious, explain why future chapters are locked, and clearly distinguish reading from resetting an assessment.

## What’s Working

- The editorial hierarchy and warm paper/ink design are coherent and easy to read.
- The page states both the percentage and chapter count, and labels mastered, current, and locked rows.
- The revisit confirmation explains the impact on mastery and quiz questions and provides a safe “Keep mastered” option.

## Priority Issues

### [P1] Continue is buried below completed chapters

**Why it matters:** With 8 of 15 chapters mastered, the open chapter appears after eight completed rows and is below the first viewport. Learners can lose momentum while searching for where to resume.

**Fix:** Add a prominent “Continue: [current chapter]” action beside the course progress summary, linking to the open chapter. Keep the ordered chapter map below it.

**Suggested command:** `$impeccable layout components/course-page.tsx`

### [P1] Locked rows do not explain the unlock condition

**Why it matters:** “Locked” tells learners they cannot proceed but not what action will unlock the next lesson. This can feel like a dead end, especially for first-time users.

**Fix:** State the actual prerequisite near the locked section or on each locked row, such as “Pass the previous chapter to unlock,” if that matches the product rule.

**Suggested command:** `$impeccable clarify components/course-page.tsx`

### [P2] “Revisit” obscures that the action resets progress

**Why it matters:** “Revisit” sounds like rereading. It opens a confirmation that resets chapter mastery and quiz questions, while “Read lesson” is the non-resetting path. The distinction only becomes clear after the learner clicks.

**Fix:** Rename the reset action to “Retake mastery check” or another accurate label. Keep “Read lesson” as a separate reading action. The repeated helper sentence has already been removed.

**Suggested command:** `$impeccable clarify components/course-page.tsx`

### [P2] The 15-row outline is long and repeats actions

**Why it matters:** Learners scan 15 entries in course order, and each mastered row has both “Revisit” and “Read lesson.” This adds visual repetition and pushes the active chapter farther down.

**Fix:** Preserve course order, but reduce completed-row action weight or collapse completed chapters behind a compact “8 mastered chapters” disclosure while keeping the current and locked map visible.

**Suggested command:** `$impeccable distill components/course-page.tsx`

## Persona Red Flags

**Alex (power user):** There is no quick jump to the current chapter near the top. Reaching the open lesson requires scanning past completed entries.

**Jordan (first-time learner):** “Locked” gives no next step, and “Revisit” sounds like reading even though it opens a reset flow.

**Casey (distracted mobile learner):** A long sequence can push “Continue” below the fold. Mobile touch-target behavior was not inspected in this review.

## Minor Observations

- “Export notes” is easy to find and clearly labeled.
- The ordered list and chapter numbers communicate course sequence; grouping by state should not obscure that sequence.
- The page repeats progress in both a percentage and an “8 of 15” count. This may be useful redundancy, but could be tightened if vertical space is needed.
- No live loading/error state or mobile viewport was inspected; the source includes recovery copy for loading, course errors, and revisit failures.

## Questions to Consider

- Should the course page primarily help learners resume the next lesson, or serve as a full curriculum map?
- What exact evidence unlocks a chapter, and can that rule be shown before a learner reaches a locked row?
- Should “Revisit” mean reread, or should reading and retaking remain explicitly separate actions?
