Evolve Mastery Tutor into an evidence-driven adaptive tutor that helps learners demonstrate, retain, and apply knowledge.

Work autonomously in this repository, following AGENTS.md. Inspect the existing implementation, create a phased implementation checklist, then repeatedly implement, test, review, and improve one coherent increment until the goal is complete.

Build a persistent concept-level learner model with stable concept IDs, prerequisites, misconceptions, assessment evidence, hint usage, optional confidence ratings, and mastery uncertainty. Replace single-quiz completion as the sole mastery signal with evidence from varied independent problems, delayed retrieval, and transfer tasks.

Implement diagnostic assessment, targeted remediation, worked examples with gradually reduced assistance, retrieval practice, explanatory questions, varied practice, and time-based spaced review. Use transparent, testable adaptation rules initially. Repeated difficulty must trigger a different teaching approach or prerequisite intervention.

Add learner-facing analytics showing demonstrated knowledge, weak concepts, retention checks, confidence calibration, and the next recommended activity, with explanations grounded in recorded evidence.

Preserve existing courses, progress, profiles, exports, and supported topics. Use differential equations as the first validation scenario. Keep the established visual system, consistent headers, accessibility, and mobile usability.

Validate generated assessments, use deterministic answer verification where feasible, and handle uncertain grading explicitly. Never fabricate learning evidence or infer psychological diagnoses.

Completion requires:
- A working end-to-end diagnostic → teaching → assessment → adaptation → scheduled review flow.
- Persisted evidence and accurate analytics across sessions.
- Tests covering prerequisite gaps, repeated mistakes, assisted versus independent success, delayed review, uncertain grading, and transfer checks.
- Passing lint, typecheck, tests, browser checks, and production build.
- A documented evaluation harness for retention and transfer; no unsupported claims of proven teaching effectiveness.

Do not stop at a plan, mockup, or disconnected dashboard. Output COMPLETE only when these criteria are satisfied; otherwise continue the loop or report a concrete external blocker.