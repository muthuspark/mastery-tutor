# Exploration: assessment-question-quality

## Context

The generated multiple-choice assessments are systematically biased: learners observed that option 1 is always correct and the correct choice is conspicuously easy. This undermines assessment validity and makes mastery gating gameable.

## Codebase Analysis

Inspected data/tutor.db, lib/prompts.ts, lib/schemas.ts, lib/quiz.ts, the quiz API route, and the quiz UI. The persisted assessment has 10 MCQs for Operating Systems chapter 0; every model answer exactly matches options[0]. The UI preserves stored order. Generation asks only for plausible options; Zod validates option count and unique prompts but not that the answer occurs exactly once, position balance, distractor quality, or duplication. Grading compares response text to the stored model answer.

## Recommendations

Add deterministic post-generation quality validation and randomization before persistence or delivery. Require each answer to appear exactly once in its options, use 4 options, reject or retry a quiz whose correct-answer positions are badly skewed, and shuffle options with the model answer kept aligned. Strengthen the generation prompt with answer-position and distractor rules, including misconception-based distractors and no obvious category mismatches. Prompt-only changes are insufficient because models can ignore them; code-level validation and tests make the behavior reliable. Decide whether order is randomized once per generated question set or per learner attempt.

## Open Questions

Should answer positions be balanced across each 10-question generated quiz (recommended: approximately 2-3 per A-D) or only randomized? Should existing persisted questions be regenerated through a user-facing action or an admin/development migration? What objective quality controls should define non-obvious distractors beyond structural checks?

## Decisions Confirmed

No implementation decision has been confirmed. The confirmed investigation finding is that the present local assessment is 10/10 option A correct, and its weak distractors make the answer highly obvious.
