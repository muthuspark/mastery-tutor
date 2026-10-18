# Mastery Tutor: Evidence-Driven Adaptive Learning

## Product goal

Help learners demonstrate, retain, and apply knowledge through an adaptive tutoring experience grounded in recorded learning evidence.

Quiz completion alone does not establish durable mastery. Mastery Tutor needs to distinguish independent understanding from assisted success, identify prerequisite gaps, and check whether learning holds over time and transfers to unfamiliar problems.

## Users and needs

Learners using Mastery Tutor to study a topic need to:

- Understand what they can demonstrate and where their knowledge is uncertain.
- Receive instruction and practice suited to their current understanding.
- Recover from repeated mistakes through a different teaching approach or prerequisite support.
- Revisit knowledge at appropriate intervals and apply it beyond familiar question formats.
- See a clear next activity and an explanation grounded in their own learning evidence.

## Intended learner journey

1. **Diagnose:** An initial assessment identifies concept strengths, gaps, and missing prerequisites.
2. **Learn:** Targeted instruction, worked examples, and remediation address those gaps.
3. **Practice:** Varied problems and explanatory questions provide opportunities for retrieval and application, with assistance gradually reduced.
4. **Assess and adapt:** Independent performance updates the learner model and determines the next activity. Repeated difficulty changes the teaching approach or triggers prerequisite intervention.
5. **Review:** Time-based spaced review checks retention through delayed retrieval and transfer tasks.
6. **Understand progress:** Analytics explain demonstrated knowledge, weak concepts, uncertainty, and the next recommended activity.

This journey continues across sessions, retaining the evidence behind each recommendation.

## Functional requirements

### Persistent learner model

- Concepts have stable IDs and prerequisite relationships.
- The learner model records concept-level assessment evidence, misconceptions, hint usage, optional confidence ratings, and mastery uncertainty.
- Mastery reflects varied independent problems, delayed retrieval, and transfer tasks. Completing a single quiz is not sufficient evidence on its own.
- Assisted and independent success remain distinguishable in the evidence used for adaptation and analytics.

### Teaching and adaptation

- The experience supports diagnostic assessment, targeted remediation, worked examples with gradually reduced assistance, retrieval practice, explanatory questions, and varied practice.
- Initial adaptation uses transparent, testable rules.
- Repeated difficulty triggers a different teaching approach or prerequisite intervention.
- Recommended activities have explanations tied to recorded evidence.

### Retention and transfer

- Review activities are scheduled over time and remain available across sessions.
- Delayed retrieval provides evidence of retention.
- Transfer tasks check whether learners can apply knowledge to unfamiliar problems.
- Review and transfer outcomes contribute to subsequent adaptation and progress reporting.

### Learner-facing analytics

- Analytics show demonstrated knowledge, weak concepts, retention checks, mastery uncertainty, and the next recommended activity.
- Confidence calibration compares optional learner confidence ratings with observed performance.
- Displayed progress and explanations accurately reflect persisted evidence, including the distinction between assisted and independent performance.

### Assessment and grading quality

- Generated assessments are validated before use.
- Answer verification is deterministic where feasible.
- Uncertain grading is handled explicitly rather than presented as certain evidence of success or failure.
- Learning evidence is never fabricated, and learner performance is not used to infer psychological diagnoses.

## Compatibility and experience requirements

- Existing courses, progress, profiles, exports, and supported topics remain supported.
- The experience follows the established visual system, with consistent headers, accessible interactions, and mobile usability.
- Differential equations is the first end-to-end validation scenario.

## Acceptance criteria

The product increment is ready when:

- A learner can complete the diagnostic → teaching → assessment → adaptation → scheduled review journey end to end.
- Concept-level evidence persists across sessions, and analytics accurately reflect that evidence.
- Verification covers prerequisite gaps, repeated mistakes, assisted versus independent success, delayed review, uncertain grading, and transfer checks.
- Lint, typecheck, automated tests, browser checks, and the production build pass.
- A documented evaluation harness supports assessment of retention and transfer.

## Evaluation and boundaries

Product evaluation examines independent performance, delayed retention, transfer performance, and whether recommendations correspond to recorded gaps and evidence. The evaluation harness documents how these outcomes are assessed; no numerical effectiveness target is established in this PRD.

A working implementation does not by itself demonstrate improved teaching effectiveness. Claims of improved retention or transfer require evaluation evidence. Psychological diagnosis and unsupported claims of proven teaching effectiveness are outside the product's scope.
