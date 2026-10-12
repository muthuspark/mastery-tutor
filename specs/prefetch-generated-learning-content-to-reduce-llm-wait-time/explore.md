# Exploration: Prefetch generated learning content to reduce LLM wait time

## Context

Reduce the 20–60 second waits caused by lazy LLM generation during study. Investigate what content can be generated ahead of learner demand, where to trigger it, what must remain on demand, and how to preserve adaptive behavior from difficulty feedback and review items. The desired experience is that opening the next lesson or quiz is mostly instant without wasting excessive LLM calls or generating locked/unreachable content.

## Codebase Analysis

Inspect the course creation route and syllabus persistence; chapter GET/regeneration and chapter database fields; quiz GET/generation and question persistence; attempt grading, pass/unlock transitions, review-item creation; course/chapter/quiz React Query navigation and prefetch opportunities; agent/model selection, retry and timeout behavior; DB schema and migrations; existing async/background-job support. Constraints: exploration only, no production changes; account for locked chapters, adaptive depthHint, missed-concept review questions, duplicate concurrent requests, stale content after feedback/regeneration, and CLI/LLM cost.

## Recommendations

Recommended direction: use two layers. (1) Low-risk client prefetch: when the current chapter loads, prefetch its quiz and the next reachable chapter route/data; on quiz load, prefetch the next chapter only. This hides latency when navigation is predictable but does not start work if the user abandons the course. (2) Server-side persisted warm-up: after course creation, generate chapter 0 content and its quiz; after a chapter is passed, asynchronously warm the newly unlocked chapter content and quiz, with a durable generation status/lease or idempotent in-flight guard so duplicate GET/prefetch calls do not launch multiple CLI processes. Prefer warming only the next unlocked chapter (optionally one look-ahead after measuring cost), because later chapters depend on prior summaries and may become unreachable. Generate a quiz only after its chapter content is available if quiz prompts should reflect content; otherwise the current quiz uses title/objectives and can be generated independently. Keep answer grading on demand: it depends on learner responses and creates review items/unlocks, and MCQ grading is already local. Keep regeneration on demand and invalidate/re-warm the quiz when depthHint or chapter content changes. Trade-offs: client-only is simplest and avoids wasted calls but still has a cold start; server warm-up gives best UX but needs job lifecycle, failure recovery, concurrency control, and deployment-process considerations; eager all-course generation minimizes waits but wastes cost, delays creation, and generates content using stale/no review context. Consider a lightweight in-process queue first only if one server process is guaranteed; otherwise use a durable jobs table/worker. Track generation latency, hit rate, wasted generations, and duplicate suppression before increasing look-ahead depth.

## Open Questions

hed alongside generated chapter data or React Query can cache it; next-course metadata is cheap DB work and can be prefetched freely. Do not prefetch submit/attempt grading or review questions as fixed data because review items are created after grading and affect the next quiz. Open questions: whether course creation should wait for chapter 0, whether background work is allowed after the HTTP response in the target deployment, whether a durable worker is available, desired maximum extra LLM calls per learner, and whether quiz generation should use chapter content rather than objectives only.Concrete prefetch candidates: syllabus is already eager at POST /api/courses; chapter content/pretest/summary at GET /api/chapters/:id; quiz questions at GET /api/chapters/:id/quiz; rendered HTML can be cac

## Decisions Confirmed

None yet. These are exploration recommendations and open decisions for the user to confirm later; the only confirmed constraint is to investigate prefetching to reduce 20–60 second waits while avoiding unnecessary LLM calls.
