# Exploration: Mastery Tutor

## Context

Build a local, single-user web app that turns a topic into a first-principles learning course. The app generates short chapters, uses prediction and retrieval questions, gates chapter access on an 80% mastery score, and gives feedback and remediation after failed attempts. The confirmed product and technical requirements are in `trd.md`.

## Codebase Analysis

The repository currently contains the TRD and no application code. The implementation will therefore establish the Next.js App Router project, TypeScript/Tailwind UI, TanStack Query client data layer, Drizzle ORM with SQLite, server-only OpenAI/Vercel AI SDK integration, and Zod validation. The app is local and single-user, so authentication and multi-tenant concerns are out of scope. The requested model names and reasoning-mode parameter must be verified against the available OpenAI SDK/docs during implementation and kept configurable.

## Recommendations

Implement in milestone order: scaffold and persistence; course/syllabus generation and editable display; lazy chapter generation and rendering; quiz generation, grading, attempts, and gating; review/remediation and difficulty hints; then polish and export. Keep generated content cached and explicit, enforce chapter transitions in server-side domain functions, grade MCQs locally, and use schema-validated server LLM calls for free-text grading and generation. Cover route handlers, gating/review rules, schema validation, and the primary user flows with focused tests.

## Open Questions

- Exact production model IDs and reasoning-mode option must be verified before implementation.
- The local app needs a stable SQLite database path and a documented migration/seed command.
- Syllabus editing should update titles/objectives/prerequisites before the course starts; generated content is not silently regenerated after edits.
- Retry attempts should remain as history, generate fresh questions, and retain review items from missed concepts.
- API errors should use consistent JSON error shapes and never expose the API key or raw provider errors.

## Decisions Confirmed

- Use the TRD as the confirmed product scope and source requirements.
- Use Next.js App Router, TypeScript, React/Tailwind, TanStack Query, Drizzle with better-sqlite3, Vercel AI SDK, and Zod.
- Chapter 0 opens initially; later chapters unlock only when the preceding chapter passes at score >= 0.8.
- Quiz responses include MCQ, short-answer, and explain-why questions, with per-answer feedback and model answers.
- Include up to two due review questions from earlier missed concepts and schedule missed concepts one to two chapters later.
- Produce `spec.md` and generated `task.md` under `specs/mastery-tutor/`.
