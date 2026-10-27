# Exploration: Course generation quality

## Context

Improve the quality of every newly created course: use learner background appropriately, preserve the actual learning goal, avoid repetitive chapters, teach prerequisites before relying on them, explain through concrete applications, and assess what the lessons actually support.

The motivating example is the saved Operating Systems course `de1e13b4-4b4d-4d49-a19f-8650632c1dee`. Its first four chapters overlap substantially, despite a learner profile describing extensive software engineering experience and a CS degree. The first two repeat resource coordination; the next two repeat the program/process distinction. Chapter 4 introduces threads and virtual address spaces without explicit earlier instruction. These are editorial observations about this example, not an automated quality measurement.

Read-only inspection on 2026-10-20 found 12 planned chapters and four generated lessons, approximately 342, 457, 484, and 518 whitespace-delimited words. Chapter index 9 lists prerequisite 9; index 11 lists prerequisite 11. Those self-dependencies are structurally invalid and conflict with the unlocking logic.

This document records exploration and recommendations only. It does not authorize implementation, a specification, or a task list.

## Codebase Analysis

### Current generation flow

- `app/api/courses/route.ts`: one synchronous structured syllabus call uses the learning request and latest profile. Only the generated title and chapter metadata are saved; the original request is lost. The course stores `level: foundational`, but chapter generation does not consume this field, so changing that label alone would not improve instruction. Chapter 0 is queued immediately after creation.
- `lib/schemas.ts`: syllabus size is 6–15 chapters; each chapter has a title, 1–3 objectives, and nonnegative prerequisite indexes. There is no graph validation or semantic review. Shape-valid output can therefore contain self-dependencies, forward references, or missing indexes. The minimum count may encourage padding for narrow topics; this is a risk, not a proven cause of this course's repetition.
- `lib/chapter.ts`: the writer sees the course title, current objectives, prerequisite indexes, prior summaries, missed concepts, depth feedback, current profile, and verified Wikipedia image candidates. It does not see the full outline, upcoming scope, explicit assumed knowledge, or the original request. Earlier summaries are useful but do not define the teaching boundary for each chapter.
- `lib/quiz.ts`: quizzes receive chapter title, objectives, and current profile, but no lesson text. Existing deterministic MCQ checks enforce four distinct options, one matching answer, ten questions, and balanced answer positions. They cannot establish that the question is answerable from the instruction or that a distractor is plausible. Preserve these checks and local grading.
- `lib/db/schema.ts`: no persisted course brief or teaching-boundary metadata exists. Optional new metadata and a migration would be needed for a durable plan; legacy rows need a distinguishable fallback rather than invented original requests.

### Existing contracts to account for

- The original Newton spec requires one-field onboarding, short chapters, and no level/difficulty questionnaire. Later profile support explicitly personalizes future generation. Keep the single-input experience; reconcile the old foundational-default language with subject-specific calibration when specifying this feature.
- `lib/profile.test.ts` requires latest profile changes to affect future generation while leaving saved content and progress intact. A frozen profile snapshot for an entire course would conflict with that behavior. A stored course goal can stay stable while later explanations use the current profile.
- Pre-study syllabus PATCH accepts partial chapter updates and checks IDs, but does not validate the resulting complete graph or coordinate teaching metadata. Any new-course quality guarantee must also consider this entry point. Chapter warm-up can begin before edits; edits need to keep accepted plans and generated artifacts consistent.
- Generation jobs already support persistence, versions, coalescing, retries, stale-output checks, and chapter-to-quiz sequencing. Jobs cover chapters and quizzes, not course planning.
- Both CLI adapters default to a 60-second timeout per call. Jobs have a 120-second lease and up to three attempts. A writer, reviewer, repair writer, and final reviewer could exceed the lease. The queue does not currently renew leases. Review calls also multiply the cost of existing whole-job retries.
- Chapter clients retry pending generation up to 45 times at two-second intervals. More review time must be reconciled with that waiting experience.
- Some chapter API paths return retained `content` after processing without checking that the current generation reached ready status. A new review gate must ensure unaccepted or stale content is not represented as the accepted new artifact. Existing completed lessons should remain readable.
- `lib/agent.ts` centralizes Codex/Claude execution and task-specific model selection. A separate review invocation does not require a new provider, framework, or agent orchestration system.

### Existing visual support

Markdown already supports math, tables, code, Mermaid, and verified Wikipedia images. Teaching quality can improve by choosing an appropriate representation. Photographs are not a substitute for scheduling timelines, process layouts, or worked calculations. This exploration does not propose a new visual rendering engine.

## Recommendations

### Preferred direction

Use a persisted course brief and chapter teaching boundaries, deterministic validation, and separate rubric-based review calls. Generate the brief and syllabus together and review them as a unit; avoid an extra planning call solely to produce the brief.

Conceptual flow:

`request + current profile -> brief and syllabus -> structural validation -> review and bounded repair -> accepted plan -> chapter -> review -> accepted lesson -> quiz grounded in lesson and outcomes -> review -> accepted quiz`

This is a candidate architecture, not an implementation sequence or approved specification.

### Intent and subject-specific calibration

Preserve the original request separately from the concise title. The brief should explain the intended outcome, relevant assumed knowledge, likely gaps, and instructional depth. Treat inferred knowledge as an assumption rather than demonstrated mastery. A request to start from scratch should override assumptions drawn from job experience. General engineering expertise should not imply expertise in biology or another unrelated domain. With no profile, choose an accessible introduction without inventing demographics.

Use the current profile for future explanation style and examples, consistent with existing behavior. Preserve the course's accepted purpose and scope unless an explicit future action changes the plan. Capture a consistent context for each generation/review attempt so a profile edit midway through one artifact does not produce contradictory writer/reviewer assumptions.

### Distinct teaching boundaries

Extend chapter planning with a clear learner capability, concepts introduced here, concepts assumed, and an example or application suitable for the subject. Give writers the complete accepted outline plus prior summaries. Permit brief recaps and clearly explained previews; flag material that is required to understand or pass the chapter but is deferred until later. Prevent needless repetition of basics without banning reuse of important terminology.

Prefer short lessons that each develop a substantive idea. Split large topics while planning, rather than expanding or renumbering the course midway through study. Reconsider the six-chapter minimum and the fifteen-chapter ceiling together; exact limits remain open. Do not force the same worked-example format on every subject.

### Structural guarantees and semantic review

Use code to require each prerequisite to identify an earlier existing chapter, reject duplicates, and validate the complete final syllabus after edits. Strictly backward edges make cycles impossible. Do not silently remove invalid edges: a bad edge may indicate a missing or wrongly ordered lesson.

Use review calls to identify material problems in coverage, repetition, learner fit, dependency order, unexplained concepts, worked examples, question ambiguity, and instructional alignment. Require concrete evidence from the artifact and specific repair guidance. Separate substantive failures from stylistic suggestions; avoid making a subjective numerical score the sole publication gate. A separate invocation using the same provider/model is a reasonable initial option; it is not an independent factual authority.

A bounded repair followed by validation and review is preferable to unlimited regeneration. The exact repair budget, treatment of reviewer unavailability, and behavior after persistent semantic failure remain to be decided. Never serve a structurally invalid artifact. Surface failed required review as an explicit preparation failure rather than quietly claiming the artifact passed.

Quiz review should use both intended outcomes and the accepted lesson, with supported prerequisites and explicitly marked due review material. Application to a new case is desirable; copying lesson sentences is not the goal. Avoid rewarding recall of assumed basics at the expense of the new capability being taught.

### Integration and trade-offs

| Approach | Benefit | Limitation |
| --- | --- | --- |
| Stronger prompts and graph validation | Few extra calls; prevents impossible dependencies | Repetition and poor depth can still pass |
| Brief, full outline context, and syllabus review | Improves course coherence before writing | Later lesson and quiz quality remains unchecked |
| Brief and context plus review of each artifact | Checks planning, teaching, and assessment alignment | More latency, CLI calls, repair handling, and operational complexity |

Recommend the third approach if the user accepts the additional latency. Keep review stages inside the existing generation architecture where feasible. Renewable owned leases and a total stage budget are a likely simpler starting point than a separate job for every review, but stage jobs offer better resumption and observability for longer workflows. Decide after setting the call budget; merely increasing the lease constant leaves the design fragile.

Course planning can remain synchronous for a modest bounded flow, or become a durable preparation job if its latency/recovery requirements justify it. The latter needs course preparation status and a real polling UI. Current creation progress is timer-based, so it must not claim actual review completion without server evidence.

Prefer nullable brief/teaching metadata and an explicit quality-policy version for new courses, preserving legacy reads and historical attempts. No automatic replanning, migration of learning progress, changes to the 80% gate, or changes to MCQ count/type are recommended here. Extend generation observability with stage durations, repair counts, and issue categories; keep raw learner background and content out of logs.

### How to evaluate the direction

Consider fixture cases for an experienced engineer studying OS, a beginner studying OS, an engineer studying an unfamiliar domain, a narrow refresher, and an empty profile. Check graph validity, distinct learning progression, appropriate prerequisite assumptions, preservation of request scope, and whether questions are supported by instruction. Include invalid graphs, persistent review failure, timeout/lease expiry, concurrent generation, mid-run edits, and legacy-course reads.

Automated tests can prove persistence, graph rules, bounds, and orchestration. Compare live generated courses against a stable rubric and human inspection to assess semantics. Reviewer approval and quiz pass rates do not establish factual correctness or durable learning. A source-grounded factual verification system would be a separate capability.

## Open Questions

The user was asked these preferences during exploration; no answers have been received at the time of recording. Suggested defaults are recommendations, not confirmed decisions:

- Review scope: review the syllabus, chapters, and quizzes despite additional generation time (recommended), or review the syllabus only initially.
- Lesson length: retain the 600-word limit and split substantial topics during planning (recommended), or permit longer worked-example chapters.
- Existing courses: apply the new pipeline only to new courses and preserve existing progress (recommended), or explore an explicit upgrade action as additional scope.

Further questions for specification:

- What upper bound on creation wait and additional model calls is acceptable, and should course planning use a durable preparation job?
- What bounded repair policy and user-visible outcome should apply when a semantic review repeatedly fails or the reviewer is unavailable?
- What chapter-count bounds should replace or retain the current 6–15 range?
- How should a stronger live profile update affect depth when it conflicts with assumptions in an already accepted course brief? Recommended baseline: adapt future explanations without silently changing the course goal or graph.
- Is the separate review invocation allowed to use the same configured model initially? Recommended baseline: yes, with a distinct rubric and evidence-based issue report; add dedicated review-model configuration only when useful.

Limits: this exploration does not establish reliable subject-wide factual verification, diagnostic proof of prior knowledge, or universal pedagogical quality. It identifies a more testable process and clear structural guarantees.

## Decisions Confirmed

Confirmed by the user:

- Investigate improvements that make future newly created courses avoid the problems found in the Operating Systems example.
- Use MSDD Explore and record the exploration before specification or implementation.

Already established product behavior to preserve unless explicitly changed:

- One-field course creation, optional learner profile, latest-profile personalization for future generation, explicit difficulty feedback, cached lessons, mastery gating, and preserved attempt history.

Not yet confirmed: review scope/call budget, a changed word limit, changed chapter-count limits, existing-course upgrades, a particular database/interface design, and review failure policy. Previous assistant architecture suggestions are recommendations, not accepted product decisions.

Only `explore.md` is created by this work. No production code, tests, migrations, `spec.md`, or `task.md` are changed. Specification remains a separate user-invoked `$msdd-spec` step.
