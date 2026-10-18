# Mastery Tutor

Mastery Tutor turns a learning intention into a focused, chapter-by-chapter path. You name what you want to understand, read a short lesson, answer a few retrieval questions, and unlock the next idea only when you have mastered the current one.

It is deliberately small: one learner, one local SQLite database, and a locally installed Codex or Claude CLI running server-side for structured course, lesson, quiz, and free-text grading generation.

## The experience

![Start with an intention](docs/screenshots/home.png)

Start with one sentence. Optionally open Profile settings to describe your background, experience, goals, and preferred explanation style. Your profile is saved in SQLite and used for future syllabus, lesson, quiz, and grading feedback generation. Updates leave saved content and progress intact; clear and save the field to remove personalization.

![Course path](docs/screenshots/course.png)

The course view keeps the full path visible while making only the next chapter actionable.

![Reading view](docs/screenshots/chapter.png)

Each chapter is short, rendered with Markdown, math, and syntax-highlighted code, followed by a single check for understanding.

![QnA view](docs/screenshots/quiz.png)

Questions mix multiple choice, short answers, explanations, and scheduled review. Passing requires a score of 0.8 or higher.

## Why it exists

Most learning tools optimize for content consumption. Mastery Tutor is organized around retrieval, feedback, prerequisite order, and deliberate progression instead:

- Generate a dependency-aware syllabus from a plain-language topic.
- Generate chapter content only when the learner opens it.
- Render LaTeX formulas with KaTeX and Mermaid diagrams when they improve an explanation.
- Mix deterministic MCQ grading with rubric-based Codex grading for free text.
- Keep failed attempts, remediation, and missed-concept review schedules.
- Unlock the next chapter transactionally after mastery.
- Export the course as Markdown without making another model call.

## Stack

- Next.js App Router, React, TypeScript, and Tailwind CSS
- Drizzle ORM with SQLite via `better-sqlite3`
- Codex or Claude CLI with structured JSON output and Zod validation
- Vitest, Testing Library, and Playwright
- Unified Markdown, KaTeX, and Shiki rendering

## Requirements

- Node.js 20+
- npm
- Codex CLI or Claude CLI installed and already authenticated for the same OS user running the server

The normal local path does not need an API key. If the server runs as a different service user, in a container, or in a headless environment, configure authentication for the selected CLI in that process. When both CLIs are available, choose between them on the home screen; the selection persists until changed.

## Run locally

```bash
git clone https://github.com/muthuspark/mastery-tutor.git
cd mastery-tutor
npm install
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The development command applies SQLite migrations automatically. The database is created at `data/tutor.db`.

## Useful commands

```bash
npm run db:migrate  # Apply migrations
npm run db:generate # Generate a migration after schema changes
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # Unit, domain, route, and component tests
npm run test:e2e    # Playwright browser smoke test
npm run build       # Production build
```

## Architecture notes

The browser talks only to Next.js route handlers. Model work stays on the server:

```text
Learner → Next.js UI → Route handler → Codex / Claude CLI
                              ↓
                         SQLite / Drizzle
```

Codex is invoked with fixed arguments, a read-only sandbox, a bounded timeout, and a generated JSON Schema. Claude runs in non-interactive JSON print mode with a bounded timeout. Every response is parsed and validated with Zod before it can be persisted. Prompts, credentials, command lines, and raw CLI output are not exposed to the browser.

## Project structure

```text
app/                 Pages and route handlers
components/          Client-side learning views
lib/codex.ts         Server-only Codex CLI adapter
lib/db/              Drizzle schema and SQLite connection
lib/gating.ts         Mastery and chapter progression rules
lib/review.ts         Missed-concept scheduling
lib/export.ts         Deterministic Markdown export
drizzle/              SQLite migrations
specs/mastery-tutor/  MSDD exploration, specification, tasks, and mockups
docs/screenshots/     README screenshots captured from the local app
```

## Design direction

The interface follows the repository's Paper & Ink guide: warm paper, charcoal ink, crimson actions, literary typography, thin rules, and a calm reading rhythm. The visual system is intentionally restrained so the learner's attention stays on the idea in front of them.

## Status

The core local learning loop is implemented and verified: onboarding, syllabus creation, lazy chapter generation, QnA, mastery gating, remediation, review scheduling, regeneration, and export.

## Autonomous improvement loop

The Ralph script uses your installed, authenticated Codex CLI to improve this repository toward a supplied goal. Each iteration proposes five diverse candidates, ranks their estimated impact and confidence against effort and risk, implements the winner, runs checks, reviews it in a fresh session, and repairs defects before committing. Scores are estimates supported by repository evidence, not measured product outcomes.

```bash
npm run ralph -- --goal "Improve learner retention" --iterations 10
npm run ralph -- --goal-file loop-prd.md --base-url http://localhost:3000
npm run ralph -- --resume <run-id>
npm run ralph -- --help
```

Start from a clean Git working tree, including untracked files. Commit the script and any existing goal/progress files you want to keep before starting; the script never stashes existing changes. A goal file outside the repository is also supported. Ralph creates and stays on a local `ralph/<run-id>` branch, with one commit per verified iteration. It never pushes, merges, or deploys. Review the resulting branch yourself before merging.

The default run completes **10 verified iterations**. Use `--iterations 0` to continue until stopped, `--model <model>` to override your Codex configuration, `--max-fix-attempts <N>` to change the default three repair rounds, or `--phase-timeout-minutes <N>` to change the default 30-minute timeout per agent/check command. Codex runs with approvals disabled, read-only access for discovery/review, and workspace-write access for implementation/repair. Missing permissions or unavailable external services are blockers rather than reasons to silently change the sandbox. If this machine cannot initialize the Codex sandbox, `--agent-sandbox danger-full-access` explicitly selects host execution for child sessions; it can accompany start or resume and is saved and logged. This grants the agents the current OS user’s filesystem and network access. There is no automatic fallback. `--agent-sandbox phase-default` restores the default read-only/workspace-write policies; working-tree change detection still applies to discovery and review in either mode.

Lint, typecheck, tests, and production build run before the first iteration and after every implementation/repair. Ralph then prepares a feature-specific Playwright spec under `e2e/ralph/<run-id>/`, validates its lint/types, and executes it from the **host Node process**, outside the Codex sandbox. The reviewer inspects the spec, JSON results, screenshots, and traces before approving the increment. Tests must cover actual changed flows; mocked APIs do not establish real grading or persistence. A smoke test alone does not establish feature acceptance.

Keep the app running from the same checkout at `http://localhost:3000` (or pass `--base-url URL`). Ralph's browser configuration never starts, stops, or changes the environment of your server. Install Chromium once if necessary with `npx playwright install chromium`. Tests use only test-owned fixtures and must preserve existing learner data. You can check the host setup without a paid agent run:

```bash
npm run test:e2e:ralph -- smoke.spec.ts
```

This read-only smoke test opens the app, navigates to settings, and reloads. Its JSON report, HTML report, screenshots, and traces go to `.ralph/manual-browser/`. Iteration evidence goes to `.ralph/<run-id>/*-playwright/`. To use a different URL for a standalone test, set `RALPH_BASE_URL`; `RALPH_BROWSER_OUTPUT` overrides its output directory. The ordinary `npm run test:e2e` setup continues to use port 3100.

Browser assertion failures enter the bounded repair loop. An unreachable server, missing Chromium, socket permission errors, missing reports, zero tests, or skipped tests stop at `browser-run` without consuming a repair attempt. Fix that environment issue, then use the ordinary resume command to retry host verification. Failed checks or unresolved defects block new features; exhausted code repairs stop the run with unfinished changes preserved. The initial goal checklist is a direction for improvement, not an automatic termination signal.

Every decision is appended with a timestamp and run ID to root `progress.txt`: all five candidates and scores, selection reasoning, implementation summaries, check outcomes, review evidence and findings, repairs, resume actions, and stop decisions. Existing contents are preserved. The log is included in each verified iteration’s commit; an interrupted run preserves its pending log entries alongside unfinished code. Commit hashes are recorded in the run state.

Prompts, raw CLI events, check logs, candidate rankings, and atomic state checkpoints are saved in ignored `.ralph/<run-id>/`. Ctrl+C stops the active child process and preserves work. Resume with the printed command on the same branch, without editing the recorded changes or HEAD; saved options and the goal snapshot are reused. Interrupted implementations resume as repairs, while checks and reviews can be repeated. After an abrupt machine/process crash, uncheckpointed edits may require manual reconciliation; the script refuses mismatched state rather than resetting files. A lock prevents simultaneous runs in the same working tree.

For a run created before host browser verification, or after manually repairing code, explicitly request full verification of the current working tree:

```bash
npm run ralph -- --resume <run-id> --retry-verification --base-url http://localhost:3000
```

`--retry-verification` backs up the old checkpoint, accepts the current edits on the recorded branch and HEAD, and restarts checks, host Playwright execution, and review. An existing iteration spec is reused, preserving manual test fixes; browser coverage preparation runs when that spec is missing. The reviewer still checks coverage. It does **not** reset the repair count or bypass acceptance. Use it only when you intend the current edits to belong to that increment. `--base-url` can also accompany ordinary resume; changing it invalidates prior browser evidence. Other run options remain saved.

Creating or testing this script does not start a paid agent run. Its automated tests use fake Codex/npm executables and temporary Git repositories.
