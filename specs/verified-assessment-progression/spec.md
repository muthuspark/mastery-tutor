# Verified assessment progression — Spec

## Summary

<!-- Format: State the outcome, scope, and measurable reason for doing this. -->

Draft: enforce complete, fresh, server-issued MCQ assessments and verify a bounded assessment/progression model using Lean. Production TypeScript agreement remains tested rather than formally proved. Two policy choices await user confirmation before finalization.

## Problem

<!-- Format: Describe the current behavior, observed failure/opportunity, affected users, and evidence. -->

Quiz GET delivers question IDs without a durable assessment identity. Attempt POST accepts any nonempty subset of eligible questions and averages only the submitted answers. Existing route tests allow a one-answer passing retry. Client completeness checks cannot enforce the server contract.

## Goals and Non-Goals

<!-- Format: Use `### Goals` and `### Non-goals` headings, each followed by a Markdown bullet list. Keep each item testable or explicitly bounded. -->

### Goals
- Reject incomplete, duplicate, foreign, and stale submissions before learning-state writes.
- Make assessment consumption atomic and repeatable across retries and concurrent tabs.
- Prove deterministic model properties and check production agreement reproducibly.
### Non-Goals
- Verify the entire app, authentication, SQLite, textual grading, generated content, or learning effectiveness.
- Change explicit revisit/reset semantics or verify generation-worker leases.
- Prove deployed TypeScript equivalence through sampled comparisons.

## Users and Scenarios

<!-- Format: Use `### Actors` followed by a Markdown bullet list, then `### Scenarios` followed by a Markdown numbered list. Include the expected result for each scenario. -->

### Actors
- Learner completing a quiz, retrying after failure, or recovering from a network interruption.
- Maintainer reviewing behavior contracts, proofs, and integration evidence.
### Scenarios
1. A complete valid submission records a score and unlocks an eligible next chapter on passing.
2. An incomplete/altered submission changes no learning records.
3. Concurrent tabs and network retries record at most one attempt for an issued quiz.
4. A policy change must pass model-proof and production-comparison gates.

## Requirements

<!-- Format: Use stable IDs such as REQ-001. For each requirement state the behavior, inputs/outputs, and priority. -->

- REQ-1: Issue a durable private assessment identity bound to learner, chapter, source revisions, and exact ordered questions. Reloads reuse an open current assessment.
- REQ-2: Require that identity and exactly one valid selected option per issued question. Reject missing, extra, duplicate, foreign, unsupported, and incomplete answers before learning writes.
- REQ-3: Proposed policy pending confirmation: ten base MCQs plus zero to two due review MCQs; equal weighting across all issued questions; inclusive 80% passing threshold. Preserve numeric option text meaning. Never trust caller-provided grades.
- REQ-4: Freeze issued questions, answer keys, and review membership. Review scheduling changes alone do not invalidate a quiz. Source edits, explicit revisit, and relevant question deletion invalidate affected open assessments.
- REQ-5: Passing marks the current chapter passed and opens only its immediate sequential successor when every prerequisite is passed. Submission cannot downgrade passed chapters. Empty courses cannot complete. Explicit revisit is a separate reset operation.
- REQ-6: Atomically persist attempt, answers, review changes, progression, and session consumption. Identical replay returns the stored result without side effects; different replay is rejected. At most one attempt consumes an assessment.
- REQ-7: Preserve historical scores and ownership. Require the new identity for all new MCQ submissions, including legacy courses. Old clients receive reload guidance. Historical free-text records remain readable; new non-MCQ submissions are outside this pilot contract.
- REQ-8: Keep proved model guarantees separate from sampled TypeScript agreement and tested adapters. Require pinned proof build, transitive axiom audit, independent proof rechecking, differential comparisons, and persistence/browser checks.

## User/System Flows

<!-- Format: Use numbered steps. Name the actor, system action, state change, and failure branch at each relevant step. -->

1. Authorized learner loads a ready quiz; server returns or saves its issued identity and public questions, without answer keys.
2. Learner answers all displayed questions and submits identity plus answers.
3. Server revalidates ownership, source freshness, exact coverage, and selections, then commits the result and learning effects atomically.
4. Identical network retry returns the saved result. After failure, the existing fresh-quiz preparation flow produces a replacement assessment.
5. Validation errors retain inputs. Stale quizzes offer explicit reload; clear answers only when the learner chooses reload.
6. Maintainer runs proof, model-comparison, integration, and regression checks before accepting changes.

## Decisions and Constraints

<!-- Format: Use `### Confirmed Decisions`, `### Assumptions`, `### Constraints`, and `### Open Questions` headings, each followed by Markdown bullets. Do not hide unresolved choices. -->

### Confirmed Decisions
- User authorized proceeding with the assessment-validity and progression pilot specification.
- Preserve existing records and the single-server SQLite deployment.
### Pending Decisions
- Keep TypeScript in production with a proved Lean reference model, or execute Lean in production.
- Include review questions in equal-weight scoring, or exclude them from the mastery score.
### Constraints
- Draft uses the recommended TypeScript/reference-model and equal-weight choices until confirmed; build must wait.
- Formal statements and assumptions require human review. Proof generation must not weaken the intended contract.
- Submission monotonicity excludes explicit revisit/reset operations.

## Edge Cases and Failure Handling

<!-- Format: Use a case/action table or bullets with trigger, expected behavior, recovery, and user-visible error. -->

- Unauthorized/unknown/foreign identities: reject without exposing private content or writing learning state.
- Missing identity or invalid coverage/options: correction/reload guidance; no grading provider call or learning writes.
- Stale/revisited/deleted source: conflict and reload guidance; never grade replacement questions under an old identity.
- Concurrent identical/different submission: one commit, stable identical replay, conflicting replay rejected.
- Database failure: full rollback with the session still retryable. Enqueue failure after commit cannot report a committed attempt as failed.
- Already-passed successor: preserve its status. Missing prerequisites, duplicate chapter indices, ambiguous options/keys: fail closed.
- Migration preserves historical attempts, answers, scores, and ownership; old browser tabs must reload.

## Acceptance Criteria

<!-- Format: Use stable IDs such as AC-001. Make each criterion observable and state how it will be verified. -->

- AC-1: Ready quiz returns a stable identity and exact displayed questions; frozen review membership and private keys remain protected.
- AC-2: Missing identity, subset, extra, duplicate, foreign, and invalid-option submissions leave all learning tables unchanged.
- AC-3: Complete quizzes compute the confirmed score and inclusive 80% decision for ten, eleven, and twelve questions, including numeric option text.
- AC-4: Only an eligible immediate successor unlocks; failed attempts do not unlock; passed statuses and unrelated course states remain unchanged; empty courses cannot complete.
- AC-5: Source changes/revisit/relevant deletion invalidate open assessments; review schedule changes alone do not. Stale and old-client errors provide recovery.
- AC-6: Replay, concurrent submissions, and injected persistence failure establish single consumption, stable saved results, and atomic writes.
- AC-7: Migration preserves history/ownership; authenticated learners complete, retry, and recover on desktop/mobile without paid providers.
- AC-8: Named Lean theorems prove coverage validation, inclusive threshold, permitted progression, and unchanged modeled state on rejection. Dependencies pass axiom audit and independent rechecking.
- AC-9: Seeded adversarial comparisons detect deliberately mutated TypeScript policies; proof checks reject incomplete/custom-axiom fixtures. Required gates fail closed in direct commands and Ralph.
- AC-10: Documentation distinguishes proved model properties, sampled agreement, tested adapters, and runtime assumptions; it makes no whole-app or teaching-correctness claim.

## Explanation and Output Artifacts

<!-- Format: Use a Markdown bullet list with separate `Audience:`, `Writing profile:`, `Primary artifact:`, `Supporting artifacts:`, and `Accessibility:` fields. Prefer an 80% ASD-STE100 controlled-language style for explanatory prose unless strict ASD-STE100 or plain language is required. Choose the clearest medium: prose, diagram, interactive HTML, or narrated explainer video. State the topic, purpose, interaction or narration needs, delivery location, and acceptance evidence for each requested artifact. -->

Provide learner validation/reload messages, a pinned Lean model and named proofs, executable comparison oracle, reproducible check reports, maintainer setup and trust-boundary documentation, plus spec.md, plan.md, and unchecked task.md. This draft is not build-ready until the pending decisions are resolved.
