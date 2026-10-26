# Mastery Tutor

Mastery Tutor turns a learning intention into a focused, chapter-by-chapter path. You name what you want to understand, read a short lesson, answer a few retrieval questions, and unlock the next idea only when you have mastered the current one.

It is deliberately small: invited learners with private workspaces, one persistent SQLite database, and Codex CLI, Claude CLI, or DeepSeek API running server-side for structured course, lesson, quiz, and free-text grading generation.

## The experience

![Start with an intention](docs/screenshots/home.png)

Start with one sentence. Optionally open Profile settings to describe your background, experience, goals, and preferred explanation style. Your profile is saved in SQLite and used for future syllabus, lesson, quiz, and grading feedback generation. Updates leave saved content and progress intact; clear and save the field to remove personalization.

![Course path](docs/screenshots/course.png)

The course view keeps the full path visible while making only the next chapter actionable.

New courses prepare in the background. The app saves your full learning request, builds a course brief and 1–24 focused chapters, and reviews the plan before making it available. The course page shows preparation, review, or repair status. You can leave and return; interrupted jobs resume after the server restarts. If preparation fails, use **Try again** on that course instead of creating a duplicate.

Each new lesson and quiz also receives a separate quality review. Generation allows one structural-validation repair and one content-review repair, with at most three drafts total. Review findings are logged, and persistent failures retain the reason for retrying. Lessons use the accepted course plan and stay within 600 words. Quizzes use the accepted lesson and its objectives. Review adds preparation time and can miss mistakes; it does not certify factual accuracy or learning outcomes. Existing courses keep their saved content, progress, and earlier generation policy.

![Reading view](docs/screenshots/chapter.png)

Each chapter is short, rendered with Markdown, math, and syntax-highlighted code, followed by a single check for understanding.

Generated lessons must pass Markdown math validation before they are saved as ready. Use `$...$` for inline math. For display math, place each `$$` delimiter on its own line, with the equation between them and blank lines around the block. Keep prose outside math blocks and use KaTeX-supported commands. A failed draft gets one repair attempt with its validation errors; persistent failures are not published and can be regenerated. Saved lessons are checked again before rendering.

![QnA view](docs/screenshots/quiz.png)

Each quiz has ten multiple-choice questions with four options each, plus up to two due review questions. Passing requires a score of 0.8 or higher.

## Why it exists

Most learning tools optimize for content consumption. Mastery Tutor is organized around retrieval, feedback, prerequisite order, and deliberate progression instead:

- Generate a dependency-aware syllabus from a plain-language topic.
- Prepare the first lesson after accepting the course plan, then warm newly unlocked lessons through saved generation jobs.
- Render LaTeX formulas with KaTeX and Mermaid diagrams when they improve an explanation.
- Mix deterministic MCQ grading with rubric-based AI grading for free text.
- Keep failed attempts, remediation, and missed-concept review schedules.
- Unlock the next chapter transactionally after mastery.
- Export the course as Markdown without making another model call.

## Stack

- Next.js App Router, React, TypeScript, and Tailwind CSS
- Drizzle ORM with SQLite via `better-sqlite3`
- Codex CLI, Claude CLI, or DeepSeek API with structured JSON output and Zod validation
- Vitest, Testing Library, and Playwright
- Unified Markdown, KaTeX, and Shiki rendering

## Requirements

- Node.js 20+
- npm
- At least one provider: an authenticated Codex/Claude CLI for the same OS user running the server, or a DeepSeek API key

The CLI path does not need an API key. DeepSeek uses a paid API key and requires no CLI installation. If the server runs as a different service user, in a container, or in a headless environment, configure authentication for the selected CLI in that process. The operator selects the learning provider using `AI_PROVIDER=codex|claude|deepseek`. Learner settings contain only optional private background. Provider credentials stay on the server.

## Run locally

```bash
git clone https://github.com/muthuspark/mastery-tutor.git
cd mastery-tutor
npm install
cp .env.example .env
# Configure the authentication, owner, email, and AI settings below first.
npm run dev
```

Open the exact origin configured in `BETTER_AUTH_URL` (default: [http://localhost:3000](http://localhost:3000)).

The development command applies SQLite migrations automatically. The database is created at `data/tutor.db`.

## Private beta login and migration

Before starting, configure these values in this app’s own `.env`:

```dotenv
BETTER_AUTH_SECRET=generate-with-openssl-rand-base64-48
BETTER_AUTH_URL=http://localhost:3000
OWNER_EMAIL=owner@example.com
INVITED_EMAILS=learner@example.com,another@example.com
AI_PROVIDER=codex
MAILTRAP_API_KEY=your-transactional-token
FROM_EMAIL=tutor@your-verified-domain.com
```

Generate a fresh secret with `openssl rand -base64 48`. Production requires an HTTPS URL. The owner is automatically invited. Emails are trimmed and lowercased; plus aliases and address components are preserved. Removing an email from every invitation source blocks both new sign-ins and existing sessions on their next request. Restart after changing deployment environment variables.

The owner can invite learners from **Profile settings → Invite a learner**. Invitations are saved in SQLite and enable access immediately, without editing `.env` or restarting. The app sends an invitation email with its sign-in URL; the recipient requests their own OTP when signing in. Only the signed-in `OWNER_EMAIL` can use this form or its API. If email delivery fails, access stays enabled and the owner can retry or share the app link directly. Repeated invitations reuse the same access record and resend the email.

`INVITED_EMAILS` remains supported alongside database invitations. Removing an environment entry blocks access only if that email has no database invitation. Invitation removal is not available in the UI yet.

`MAILTRAP_API_KEY` and `FROM_EMAIL` may be copied once from the existing `../agent/.env` configuration. This app never reads that sibling environment at runtime. Use a verified Mailtrap sending domain. Provider acceptance means the provider accepted the request, not confirmed inbox delivery. Verify actual receipt for the owner before inviting beta learners; controlled automated tests do not prove real delivery.

`npm run db:migrate` requires the explicit owner email and backs up an existing database to `<database>.before-login-<timestamp>.bak` before the ownership upgrade. It assigns legacy courses and the existing profile to that owner, preserves learning records, and verifies counts and foreign keys. Reruns preserve existing assignments. Keep backups private and stop other writers during the upgrade. Never set the owner to whichever learner registers first. `DATABASE_URL` accepts a relative or absolute SQLite file path; default is `data/tutor.db`. Use a single persistent server for this milestone.

Login uses Better Auth’s email OTP plugin and Drizzle adapter. Codes contain six digits, expire after five minutes, allow three incorrect attempts, are stored hashed, and are consumed once. Resending replaces the old code. SQLite enforces a 60-second resend cooldown, five requests per email per hour, and twenty per IP per hour; verification is capped at twenty per email and one hundred per IP per hour. Per-email database leases serialize concurrent send and verification operations. A failed or uncertain send invalidates its code. Sessions last seven days without sliding renewal; production cookies are secure and HTTP-only. Logout revokes the session and clears browser caches across open tabs.

If deployed behind a proxy, set `AUTH_TRUSTED_IP_HEADER` only to a header that the proxy strips and replaces with a trustworthy client IP. With no trusted header, requests use one conservative shared IP bucket. Do not trust arbitrary incoming forwarding headers. The app exposes only the required auth endpoints; password, social login, email changes, and additional OTP endpoints are unavailable.

The `auth_events` table tracks code requests, provider acceptance/failure, verification, first-course creation, and first-lesson opening. Codes, tokens, email addresses, and learning content are excluded from those events. Generation logs retain operational counts and identifiers rather than generated text.

Run `npm run test:e2e:login` for an isolated database and a controlled Mailtrap transport. Browser tests use `.next-e2e` as a separate build directory so they can run alongside the development app. It never sends real mail or calls paid AI providers. Test mail is written only by an explicitly loaded test fixture, outside application code; it is not exposed through an HTTP endpoint.

## DeepSeek API setup

Add your key to the repository-root `.env` file, then restart the server:

```dotenv
DEEPSEEK_API_KEY=your-key-here
# Optional settings:
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_TIMEOUT_MS=180000
```

Set `AI_PROVIDER=deepseek` in the server environment. It can run course planning, lesson and quiz writing, quality review, free-text grading, and Socratic practice without Codex or Claude installed. The key stays on the server. Do not use a `NEXT_PUBLIC_` variable or commit your `.env` file. Next.js uses normal environment precedence: process variables and more specific `.env` files can override `.env`.

Provider availability checks configuration, not account access, model access, or balance. After fixing server configuration, restart and use the existing retry action. Learners receive a retry message without infrastructure details. Changing `AI_PROVIDER` applies to future generation, review, practice, and grading in every course. Calls already running finish with their starting provider; saved content and progress are unchanged.

The default model is `deepseek-flash`. To select another supported model, set `DEEPSEEK_MODEL` (for example, `deepseek-v4-pro`). Task overrides take precedence: `DEEPSEEK_MODEL_SYLLABUS`, `DEEPSEEK_MODEL_CHAPTER`, `DEEPSEEK_MODEL_QUIZ`, `DEEPSEEK_MODEL_GRADING`, `DEEPSEEK_MODEL_REVIEW`, and `DEEPSEEK_MODEL_SOCRATIC`. Socratic practice checks its own override, then the chapter override, then the global model, then the default. Other tasks check their own override, the global model, then the default. Blank values are ignored.

Requests use JSON output with local schema validation, thinking disabled, and output limits of 16,384 tokens per call (4,096 for Socratic calls). The default timeout is 180,000 milliseconds for each call, including response-body reading. Override it with a positive integer up to 2,147,483,647; invalid values use the default.

DeepSeek charges for API usage. A course can require several writing, review, and repair calls. Socratic practice can prepare a follow-up in the background that goes unused. The adapter makes one HTTP attempt per invocation; existing generation jobs can retry transient failures up to three attempts. Cancelling a timed-out request does not guarantee that it was not billed. Automated provider tests use mocked HTTP and do not validate live teaching quality or account access.

## Useful commands

```bash
npm run db:migrate  # Apply migrations
npm run db:generate # Generate a migration after schema changes
npm run lint        # ESLint
npm run typecheck   # TypeScript
npm test            # Unit, domain, route, and component tests
npm run test:e2e:login # Isolated login, two-user study, and mobile browser tests
npm run build       # Production build
```

## Architecture notes

The browser talks only to Next.js route handlers. Model work stays on the server:

```text
Learner → Next.js UI → Route handler → Codex CLI / Claude CLI / DeepSeek API
                              ↓
                         SQLite / Drizzle
```

Codex is invoked with fixed arguments, a read-only sandbox, a bounded timeout, and a generated JSON Schema. Claude runs in non-interactive JSON print mode with the schema in its prompt and a bounded timeout. Every response is parsed and validated with Zod before it can be persisted. Prompts, credentials, command lines, and raw CLI output are not exposed to the browser.

Each provider call has a three-minute timeout, including individual planning, writing, and review calls. Set `CODEX_TIMEOUT_MS`, `CLAUDE_TIMEOUT_MS`, or `DEEPSEEK_TIMEOUT_MS` in the server environment to allow more time on slower models or connections. Values must be positive integer milliseconds within Node's timer range; invalid values use the default. After changing environment settings, restart the server and select **Try again** on the saved course if preparation previously failed.

Interactive chapter practice uses a separate `socratic` task. Codex runs these short requests with low reasoning effort in a temporary working directory, using only the supplied lesson and conversation. Optional `CODEX_MODEL_SOCRATIC` and `CLAUDE_MODEL_SOCRATIC` overrides fall back to the chapter/global model settings. After displaying a question, the server prepares one likely next step in the background. It reuses that result only for the matching answer, hint usage, agent, learner profile, and lesson version; other choices receive a newly generated follow-up. Preparation never records an answer or changes progress. One speculative call may go unused if the learner chooses differently or leaves. The cache is bounded, expires after five minutes, and safely falls back to generation after a server restart.

New-course planning, lessons, and quizzes run through the saved generation queue. A worker renews its lease every 30 seconds and checks ownership and generation versions before publication. Persistent review rejection requires explicit retry; transient provider failures have at most three job attempts. Requests do not wait for multi-call generation. Each course records its creation-time agent for reference; future AI work uses the server-selected provider and that course owner’s private background. Client provider preferences are ignored. Optional `CODEX_MODEL_REVIEW` and `CLAUDE_MODEL_REVIEW` overrides follow the existing per-task model configuration.

Apply migrations and restart all app processes sharing a database after this upgrade so each background worker recognizes course-preparation jobs. Keep a server process running while preparation is in progress. Profile edits affect future generated explanations without silently changing accepted course goals or saved progress.

## Project structure

```text
app/                 Pages and route handlers
components/          Client-side learning views
lib/codex.ts         Server-only Codex CLI adapter
lib/deepseek.ts      Server-only DeepSeek HTTP adapter
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
