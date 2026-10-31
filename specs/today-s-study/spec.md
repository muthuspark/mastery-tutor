# Today's study — Spec

## Summary

<!-- Format: State the outcome, scope, and measurable reason for doing this. -->

Add a Today’s study entry point that helps an authenticated learner review concepts on calendar dates and continue with one eligible lesson. Recommendations state their factual reason. The first release includes successful as well as missed concepts, supports completed courses, and keeps retention practice separate from chapter completion. Verify scheduling, repeat submissions, ownership, and the full return-to-study flow; no claim of improved retention is made without learner evidence.

## Problem

<!-- Format: Describe the current behavior, observed failure/opportunity, affected users, and evidence. -->

Newton currently offers a featured unfinished course selected from course-start metadata. Missed concepts return inside later chapter quizzes, scheduled one or two chapter positions ahead. A correct review removes that item. Elapsed time alone does not bring material back, and finishing a course leaves no later chapter in which to review it. Learners returning after a break lack a short, explained next action. Existing assessment-submission validity issues are documented in the separate verified-assessment-progression draft and must be addressed before chapter attempts feed this schedule.

## Goals and Non-Goals

<!-- Format: Use `### Goals` and `### Non-goals` headings, each followed by a Markdown bullet list. Keep each item testable or explicitly bounded. -->

### Goals
- Offer a bounded review batch across the learner’s courses, with one recommended next lesson when eligible.
- Schedule review by learner-local calendar date, including concepts previously answered correctly.
- Explain selections using recorded dates, previous misses, and chapter eligibility.
- Preserve course completion, prerequisites, existing history, and normal study navigation.
### Non-goals
- Predict mastery probabilities, certify retention, or claim a causal improvement in learning.
- Rewrite syllabi, skip prerequisites, add notifications, streaks, time-budget controls, or automated teaching-style selection.
- Generate question variants or require an AI provider to read recommendations or grade this MCQ review.
- Replace the separate verified-assessment-progression project or extend its formal proof claims.

## Users and Scenarios

<!-- Format: Use `### Actors` followed by a Markdown bullet list, then `### Scenarios` followed by a Markdown numbered list. Include the expected result for each scenario. -->

### Actors
- Authenticated learner with active, completed, or newly created courses.
- Returning learner with due concepts and a short study window.
### Scenarios
1. The learner opens the workspace, sees the due count and recommendation reasons, and starts a review batch of at most five concepts.
2. The learner submits all review answers, receives feedback and next review dates, then can continue to the recommended eligible lesson.
3. The learner has completed every course but can still review due material without resetting completion.
4. The learner has no due reviews and can continue the next lesson; with no eligible lesson, the workspace explains when the next review is due.
5. The learner retries a submission after a connection failure or opens two tabs; results and scheduling apply once.

## Requirements

<!-- Format: Use stable IDs such as REQ-001. For each requirement state the behavior, inputs/outputs, and priority. -->

- REQ-1 (must): Today’s study shows the learner’s current local date, review time zone, eligible due count, up to five ordered review concepts, and one next lesson when eligible. Keep all saved courses and course creation reachable.
- REQ-2 (must): Each selected concept has a factual reason such as “Scheduled for today”, “Overdue by 3 days”, or “You missed this last time”. The next lesson says it continues the learner’s course and requires passed prerequisites. Explain that review dates are a scheduling rule, not measured forgetting.
- REQ-3 (must): Schedule both correctly and incorrectly assessed concepts. After a first correct chapter observation, review is due tomorrow. Correct standalone reviews advance intervals to 3, 7, 14, then 30 calendar days, remaining at 30 thereafter. An incorrect observation resets the interval to 1 day. Repeated same-day successes cannot advance multiple stages; any same-day miss wins over a later same-day success. Viewing a question never counts as answering it.
- REQ-4 (must): Use a saved IANA time zone, initialized from the browser on first explicit study setup, with UTC fallback and a visible change control. Persist due calendar dates. Changing time zone changes the definition of today for future actions but does not shift existing due-date labels or replay historical observations.
- REQ-5 (must): Review selects distinct concepts, oldest due date first, then prior miss, then stable identity. Bound each batch to five; show remaining due work without forcing another batch. Choose one unfinished ready course using the existing featured-course order, then its earliest open chapter whose prerequisites have passed. If none is eligible in that course, consider the next course. Never unlock content through recommendation.
- REQ-6 (must): A review uses valid saved MCQs, one per selected concept, and an immutable privately owned issued session. Require exactly one permitted answer per issued question. Reject missing, extra, duplicate, foreign, invalid, and stale submissions without learning writes. Do not reveal answer keys before submission. Repeated identical submissions return the committed result; conflicting replays fail.
- REQ-7 (must): Review results include correct/incorrect feedback, an explanation when available, and the next scheduled date for each concept. They do not mark a chapter passed, unlock chapters, alter completion percentage, or reset completed courses. The learner may leave without submitting; no answers or learning evidence are inferred.
- REQ-8 (must): Preserve existing historical attempts, answers, courses, and chapter-based review behavior. Seed existing pending misses as due on the learner’s initial setup date in the saved time zone. Seed other concepts from valid questions in already passed chapters as due on that setup date without claiming a past correct observation. Skip unsupported historical questions visibly. Re-running setup creates no duplicates.
- REQ-9 (must): New validated chapter assessment results update the calendar schedule atomically with their accepted attempt. Do not ingest historical attempts as verified retention evidence. A validated same-concept result is aggregated conservatively: any incorrect answer makes that observation incorrect.
- REQ-10 (must): Private recommendations, sessions, results, and preferences belong to the authenticated learner. Deleted, reset, regenerated, or no-longer-accessible source content cannot be graded as current. Recover from stale content with explicit reload while preserving unrelated work.
- REQ-11 (must): Support loading, empty, retryable error, stale-session, and no-eligible-question states, keyboard use, readable focus, announced results, and 320px/mobile layouts. Refetch on local-date rollover, tab focus, successful attempts/reviews, source changes, and time-zone changes. Recommendation reads cause no AI calls or learning-state writes.

## User/System Flows

<!-- Format: Use numbered steps. Name the actor, system action, state change, and failure branch at each relevant step. -->

1. The learner enters the workspace. If study preferences have not been initialized, a compact inline setup offers the detected review time zone (or UTC) and a change control. Confirmation performs idempotent schedule setup. Until setup succeeds, normal course navigation remains available.
2. The system reads due concepts and one eligible lesson for the saved time zone. When reviews are due, review is the leading action and lesson continuation remains optional. It displays reasons, any skipped unsupported concepts, and a Start review action, or a next-review-date/empty-state message.
3. The learner starts review. The system issues or reuses a private batch and freezes its questions. Opening or reloading it changes no learning evidence.
4. The learner answers every question and submits. The system validates membership and freshness, records the batch and schedule updates atomically, and displays feedback and next dates. Validation errors keep answers; a transport retry reuses the same identity.
5. The learner chooses Continue lesson or returns to the workspace. A fresh recommendation reflects committed results. More due concepts remain available through an explicit further batch.
6. A complete valid chapter quiz may update the schedule. It preserves the existing chapter scoring and progression policy. Invalid or replayed submissions cannot add calendar-review evidence.

## Decisions and Constraints

<!-- Format: Use `### Confirmed Decisions`, `### Assumptions`, `### Constraints`, and `### Open Questions` headings, each followed by Markdown bullets. Do not hide unresolved choices. -->

### Confirmed Decisions
- User requested the Today’s study flow with calendar-based review and clear reasons.
- User confirmed reviews plus one next lesson, and inclusion of passed concepts on the 1/3/7/14/30-day schedule. Reviews lead when due; continuing to the lesson remains optional.
- Keep this MSDD phase to specification, plan, and unchecked tasks.
### Assumptions
- At most five concepts per batch; no minutes estimate or hard daily limit.
- Reuse saved MCQs initially and disclose that questions may repeat. This is practice, not evidence of transfer to unfamiliar questions.
### Constraints
- Preserve private course ownership, historical results, prerequisite gates, and completed-course state.
- Use the established Newton design system and local SQLite deployment.
- User authorized the bounded runtime prerequisite within this build: issued immutable chapter MCQ sessions, complete coverage and freshness validation, and atomic replay-safe consumption. Preserve equal-weight scoring and the inclusive 80% threshold. The separate Lean proof project stays out of scope.
### Open Questions
- No remaining product-scope questions. The user confirmed both recommended choices.
- No outstanding scope decisions. Implement the authorized runtime prerequisite without modifying the separate proof-project draft.

## Edge Cases and Failure Handling

<!-- Format: Use a case/action table or bullets with trigger, expected behavior, recovery, and user-visible error. -->

- No courses: retain course creation; do not invent review recommendations.
- Nothing due: show the earliest future scheduled date and eligible lesson when available; do not pull future questions forward.
- Completed courses: remain reviewable, and stay completed after both correct and incorrect reviews.
- Unsupported/missing/ambiguous MCQs: omit from executable batches, show an unavailable count with a source-course link, and leave their dates unchanged. They must not hide eligible concepts later in the ordered set.
- Same concept in different chapters or courses: keep separate identities; do not merge by similar wording.
- Midnight or daylight-saving change: compare calendar dates in the saved zone; use calendar addition rather than 24-hour arithmetic. An issued batch remains stable across midnight and schedules from the actual submission date.
- Same-day observations: update evidence once per accepted event, but advance intervals no more than once; a miss keeps the next date at tomorrow even if a later success occurs.
- Source reset/regeneration/deletion: invalidate affected open sessions. Remove or suspend orphan schedules; retain already committed review snapshots for surviving courses and allow ordinary course deletion to cascade private data.
- Two tabs/conflicting responses: one transaction wins; identical replay returns its result; a competing stale schedule revision or changed response requires refresh without a second update.
- Database/setup failure: roll back all setup or review learning writes and offer retry. Recommendation failure leaves the saved-study list available.
- Provider unavailable: saved valid review MCQs remain usable. Missing questions do not trigger generation from the recommendation or review flow.

## Acceptance Criteria

<!-- Format: Use stable IDs such as AC-001. Make each criterion observable and state how it will be verified. -->

- AC-1: With an injected date and learner-owned multi-course fixture, the workspace shows the correct due count, at most five distinct ordered review concepts, factual reasons, and one next lesson when eligible. Locked, foreign, and future-due work is absent. Verify service and route tests.
- AC-2: First correct chapter evidence schedules +1 day; standalone correct reviews schedule +3/+7/+14/+30/+30; a miss resets to +1. Same-day success cannot accelerate stages and a same-day miss takes precedence. Verify pure-policy and integration tests.
- AC-3: Learner-local midnight, DST transitions, leap/month/year boundaries, UTC fallback, invalid-zone rejection, and zone changes preserve the defined due-date semantics. Verify fixed-clock tests and browser date rollover.
- AC-4: A completed course supplies due review questions; submitting correct or incorrect reviews leaves chapter states, attempts, completion timestamps, and course percentage unchanged. Verify database projections and browser reload.
- AC-5: Review reloads reuse one open immutable issued batch. Incomplete, duplicate, foreign, invalid-option, stale-source, and changed-replay submissions produce no learning writes; identical replay and two-tab races produce exactly one result and one schedule update. Verify route and two-connection transaction tests.
- AC-6: Idempotent setup on a historical fixture seeds pending misses and passed-chapter concepts once without inventing previous success, changing historical records, or generating content. Unsupported concepts are visible and do not starve valid ones. Verify migration/setup tests.
- AC-7: A complete accepted chapter assessment updates the schedule in the same transaction exactly once; invalid, duplicate, stale, or replayed assessments do not create extra evidence. Verify against the implemented assessment contract before release.
- AC-8: Empty, future-only, failed/preparing-course, provider-offline, deleted/reset/regenerated-source, and unavailable-question cases give truthful recovery and preserve other work. Verify service, route, and component tests.
- AC-9: Two authenticated learners cannot read or submit each other’s recommendations, settings, or review sessions; responses exclude keys before grading and use private uncached delivery. Verify authentication/isolation tests.
- AC-10: Desktop and 390px/320px browser flows cover setup, explained recommendations, full submission, results, persistence after reload, completion preservation, no-review fallback, tab focus and date rollover. Keyboard navigation and announced validation/results remain usable without horizontal overflow.
- AC-11: Recommendations and review perform no AI calls; normal course navigation, chapter quizzes, chapter-based reviews, creation, exports, and historical displays remain functional. Verify provider spies, regression tests, lint, typecheck, production build, and focused browser evidence.

## Explanation and Output Artifacts

<!-- Format: Use a Markdown bullet list with separate `Audience:`, `Writing profile:`, `Primary artifact:`, `Supporting artifacts:`, and `Accessibility:` fields. Prefer an 80% ASD-STE100 controlled-language style for explanatory prose unless strict ASD-STE100 or plain language is required. Choose the clearest medium: prose, diagram, interactive HTML, or narrated explainer video. State the topic, purpose, interaction or narration needs, delivery location, and acceptance evidence for each requested artifact. -->

- Audience: learners returning to Newton and maintainers implementing the feature.
- Writing profile: short, plain learner copy grounded in stored facts; technical details stay in plan.md.
- Primary artifact: the Today’s study workspace section and standalone review/results flow, implemented only in the next build phase.
- Supporting artifacts: this spec.md, plan.md, and unchecked task.md; build adds focused test evidence and README scheduling/limitations notes. No additional explainer artifact is required.
- Accessibility: semantic headings, labelled radio groups, visible focus, at least 44px targets, live validation/result messages, and responsive flat lists following DESIGN.md.
