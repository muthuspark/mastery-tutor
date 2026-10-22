# Exploration: DeepSeek API

## Context

Add DeepSeek API as a third learning provider alongside the existing Codex CLI and Claude CLI. The user explicitly wants API-key authentication from the repository-root .env file. This record is exploration only; it does not authorize implementation.

Local inspection on 2026-10-22 found neither .env nor .env.local. No credentials were printed, and no authenticated API request was made. A key will need to be supplied through DEEPSEEK_API_KEY before live use.

## Codebase Analysis

Confirmed codebase findings:
- lib/agent.ts owns the codex/claude Zod enum, executable discovery, cookie preference, provider selection, and runAgentObject dispatcher. CLI detection currently uses which; DeepSeek discovery should instead check server configuration. Discovery indicates configuration, not verified credentials or account balance.
- app/api/agents/route.ts returns available/selected provider IDs and persists a validated preference in the existing httpOnly cookie. It can retain this contract with a third provider.
- components/new-course-form.tsx duplicates the provider union and hardcodes CLI options, single-provider messages, empty state, and overlay label. Options currently do not filter by availability; adding a third provider makes correcting this particularly relevant.
- lib/codex.ts owns the task union (syllabus, chapter, quiz, grading, review, socratic) and modelFor. Model overrides use PROVIDER_MODEL_TASK, then PROVIDER_MODEL; Socratic falls back to the chapter override. lib/agent-timeout.ts similarly accepts only the two CLI providers.
- Existing adapters are server-only and return schema-validated objects. The CLI adapters convert Zod schemas to JSON Schema for prompting and parse returned JSON with Zod.
- Course planning, chapter writing, quizzes, quality review, and the in-progress Socratic flow route through the provider abstraction. DeepSeek should support all task types, preserving existing quality review and repair behavior.
- lib/db/schema.ts limits generationAgent to codex/claude at the TypeScript level. drizzle/0006_oval_marrow.sql created generation_agent as unrestricted SQLite text, so a database data migration appears unnecessary; the schema typing needs expansion and generated migration behavior should be checked later.
- lib/generation-worker.ts resumes jobs using the saved course generationAgent. A missing DeepSeek key after restart therefore needs an intelligible failure, rather than silently switching providers.
- lib/codex-errors.ts defines shared-in-practice error codes and retryability. Routes and the worker consume these errors. API failures must not fall through to misleading Codex CLI messages.
- package.json has no provider SDK. Node fetch is sufficient for one HTTP endpoint, avoiding a new dependency.
- The installed Next.js environment guide at node_modules/next/dist/docs/01-app/02-guides/environment-variables.md confirms root .env loading into process.env, with process environment and more specific .env files taking precedence. Read DEEPSEEK_API_KEY only on the server; never use NEXT_PUBLIC_. Standalone scripts outside Next need an explicit env loader if included in scope.
- The working tree already contains unrelated edits, including provider adapters, timeout handling, schema, and Socratic work. Subsequent specification/build must use the current workspace and preserve those changes.

External findings, checked against official DeepSeek documentation on 2026-10-22:
- https://api-docs.deepseek.com/ documents the official base URL https://api.deepseek.com and Bearer authentication; its examples call /chat/completions.
- https://api-docs.deepseek.com/api/create-chat-completion/ currently lists deepseek-flash and deepseek-v4-pro. Do not assume older model IDs remain the preferred choices; recheck at implementation time.
- https://api-docs.deepseek.com/guides/json_mode/ requires response_format json_object plus explicit JSON instructions and an example. It warns of empty output and truncation. JSON validity does not replace application schema validation.
- https://api-docs.deepseek.com/quick_start/error_codes/ distinguishes invalid requests, authentication, balance, rate limits, and server errors.

## Recommendations

Recommended direction, not yet user-confirmed:

Use a small server-only DeepSeek HTTP adapter behind runAgentObject, returning the same typed objects as the CLI adapters. Keep the existing CLI execution paths. Read process.env.DEEPSEEK_API_KEY and mark DeepSeek configured only when the trimmed value is nonempty. Do not perform a paid completion during provider discovery or expose the key through API responses, logs, cookies, or client bundles.

Use the official Chat Completions endpoint with non-streaming JSON output initially: the current application expects complete validated objects. Include the task prompt, JSON Schema, and an appropriate JSON example; parse choices[0].message.content and run the supplied Zod schema. Reject empty content, malformed envelopes, truncation, and invalid data before persistence. Do not treat reasoning_content as the answer.

Prefer native fetch over a new SDK for this narrow integration. It keeps dependencies unchanged but requires explicit HTTP/envelope parsing and cancellation. Bound the entire request and body-read with a configurable timeout, consistent with existing per-call timeouts. Keep rate-limit/transport retries coordinated with existing generation retries to avoid multiplying paid calls. Treat authentication, balance, and invalid configuration as nonretryable; transient network, timeout, rate-limit, and server failures can use bounded existing retry behavior. Sanitize errors while retaining the DeepSeek provider name.

Suggested configuration: DEEPSEEK_API_KEY, DEEPSEEK_MODEL, DEEPSEEK_MODEL_<TASK>, and DEEPSEEK_TIMEOUT_MS. Preserve the existing Socratic-to-chapter model fallback. A candidate default is deepseek-flash, with deepseek-v4-pro opt-in. Choose thinking behavior and output budgets explicitly after considering latency and representative chapter/review payloads; current API defaults should not silently determine application behavior.

Integrate the third provider across validation, discovery, selection persistence, course generationAgent typing, and provider labels. Render only configured options and make the empty state explain both CLI installation and DeepSeek key configuration. Preserve the present default-provider ordering unless the user asks to change it. Avoid automatic cross-provider failover for failed paid requests.

Later verification should cover provider availability combinations, preference persistence, DeepSeek-only operation, missing/invalid key, balance/rate-limit/server errors, timeout/body cancellation, malformed/empty/truncated/schema-invalid responses, model overrides, saved-provider job recovery, and unchanged CLI behavior. Use mocked HTTP for automated checks; a live smoke check remains unperformed.

## Open Questions

Open choices that can remain defaults for the next discussion:
- Is deepseek-flash an acceptable default, with environment overrides for a different model? Recommended: yes, subject to rechecking current official model support.
- Should DeepSeek cover every existing task, including review and Socratic practice? Recommended: yes, as a peer provider in the existing selector.
- Should selection retain the current Codex-first default when no preference exists? Recommended: preserve existing ordering and let the user explicitly select DeepSeek.
- What thinking mode and output-token budgets best balance long-form quality, interactive latency, and paid-call cost? Resolve during specification using representative payload sizes; no live quality/cost claim is established.

Operational constraint: no local .env file is currently present, so the configured key and live account/model access cannot be confirmed from this workspace.

## Decisions Confirmed

Explicitly confirmed by the user: add DeepSeek API support alongside Claude CLI and Codex CLI; use an API key from .env.

Not explicitly confirmed: model default, thinking settings, token budgets, default-provider order, and detailed retry/fallback behavior. Recommendations above are proposals.

Only specs/deepseek-api/explore.md is saved in this phase. No specification, task list, production changes, dependency changes, or API calls are included. Wait for an explicit $msdd-spec invocation before producing a specification.
