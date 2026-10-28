# Optimize initial page load — Spec

## Summary

<!-- Format: State the outcome, scope, and measurable reason for doing this. -->

Reduce the initial loading cost of Newton's public entrance and learning workspace, with reproducible production measurements and preserved visual quality, accessibility, authentication, and study creation. Track GitHub issue #8: https://github.com/muthuspark/mastery-tutor/issues/8. Prioritize the measured font cost and eliminate demonstrated unnecessary requests. The build-phase baseline and coverage analysis set a 30% reduction target for cold transferred bytes on desktop /login and empty /. This is an acceptance target, not a claimed result.

## Problem

<!-- Format: Describe the current behavior, observed failure/opportunity, affected users, and evidence. -->

The user reported approximately 108 resources and 1.8 MB. The original route, environment, cache state, and byte definition remain unknown; those numbers are not a verified baseline.

Evidence: Exploration at commit f9eacf1 used Next.js 16.3.8 production build/start, Chromium 153 headless, a fresh browser context with cache disabled, 1440x900 viewport, device scale factor 1, loopback networking without throttling, an isolated invited account with no studies, and a three-second post-load observation after fonts were ready. Three desktop repetitions held at 17 requests / approximately 653 kB transferred / 1,124 kB decoded for /login, and 21 requests / approximately 660 kB transferred / 1,110 kB decoded for /. Counts included the document, API requests and automatic prefetches; sizes used Resource Timing transferSize and decodedBodySize, with decimal kB. Fonts contributed 318 kB and 467 kB respectively. Single 390x844, scale-factor-1 samples were 17 requests / 557 kB / 1,029 kB decoded for /login and 20 requests / 655 kB / 1,105 kB decoded for /.

Evidence: Desktop workspace layout shift repeatedly totaled approximately 0.276 during the observation. Its source has not been attributed. Local paint timings varied and are not field performance results. No third-party requests, KaTeX font requests, or Mermaid code downloads were observed on these two routes. These exploration samples are reference evidence, not a substitute for the build-phase baseline on the current tree.

## Goals and Non-Goals

<!-- Format: Use `### Goals` and `### Non-goals` headings, each followed by a Markdown bullet list. Keep each item testable or explicitly bounded. -->

### Goals
- Reduce initial transferred bytes and demonstrated unnecessary requests on the public entrance and workspace.
- Measure cold and repeat visits on desktop and a fixed mobile profile, including empty and populated workspaces.
- Reduce the observed loading-related layout shift without changing the approved design.
- Preserve typography, character coverage, illustrations, navigation, authentication, study creation, and lesson rendering.
### Non-goals
- Redesign the interface, replace fonts with system fonts, or remove illustrations to achieve a size target.
- Change session lifetime, invitation rules, authorization, or learner-data caching policy.
- Optimize AI generation latency, add production analytics, or pursue dependency removal without evidence of initial browser cost.
- Deploy, publish, commit, push, or close the issue as part of specification or implementation without a separate instruction.

## Users and Scenarios

<!-- Format: Use `### Actors` followed by a Markdown bullet list, then `### Scenarios` followed by a Markdown numbered list. Include the expected result for each scenario. -->

### Actors
- Signed-out invited visitor requesting a login code.
- Signed-in learner opening an empty or populated workspace and starting or resuming a study.
- Maintainer comparing production loading cost under recorded conditions.
### Scenarios
1. A signed-out visitor opens /login directly or reaches it through the protected / route; the entrance and login form render correctly with fewer avoidable downloads.
2. A signed-in learner opens / with no studies; the creation form appears without a disruptive loading-related rearrangement.
3. A learner opens / with saved studies, then navigates to settings or a course; initial download improvements preserve working navigation and readable content.
4. A returning visitor reuses unchanged static assets; an asset update still delivers the new version.
5. A learner opens lesson text containing accented characters, non-Latin scripts, code, mathematics, and diagrams; supported content remains legible and functional.

## Requirements

<!-- Format: Use stable IDs such as REQ-001. For each requirement state the behavior, inputs/outputs, and priority. -->

- REQ-001 (must): Establish and retain reproducible before/after production measurements for /login and /, including request count, transferred bytes, encoded body bytes, decoded body bytes, resource categories, key load metrics, and observation conditions.
- REQ-002 (must): Reduce cold initial transferred bytes on both routes and eliminate identified unnecessary requests. Reduce median cold transferred bytes by at least 30% on desktop /login and empty / against the matching current baseline; populated and mobile pages must not regress.
- REQ-003 (must): Preserve the approved font families, used weights/styles, existing character coverage and font licensing. Optional character ranges may load only when needed; font delivery failure must leave readable fallback text.
- REQ-004 (must): Improve reuse of unchanged fonts and static assets using update-safe asset versions. Authenticated HTML, session responses and private learning data retain existing privacy and freshness behavior.
- REQ-005 (must): Prevent loading-related workspace instability. Verify a CLS budget of at most 0.1 on controlled empty and populated workspace measurements.
- REQ-006 (must): Preserve successful and failed login, sign-out/session cleanup, keyboard navigation, study creation, course navigation, and lesson math/diagram rendering.
- REQ-007 (must): Judge improvements under equivalent data, viewport, device scale, browser, network/CPU conditions, cache state and observation window; separate cold-browser visits from server/image-transform cache state.

## User/System Flows

<!-- Format: Use numbered steps. Name the actor, system action, state change, and failure branch at each relevant step. -->

1. Visitor requests /login. The system resolves the public header and delivers the entrance, readable text, optimized illustration and interactive login form. Font failure uses readable fallbacks; login errors retain current recovery controls.
2. Invited visitor signs in. The system replaces the document and opens the protected workspace; stale user state is cleared as today. A signed-out request to / continues to reach /login.
3. Learner opens /. The system presents a stable loading state, then the empty creation workspace or saved studies. Data failure exposes the existing retry action rather than an empty-success state.
4. Learner creates a study or opens an existing one. Current saving, preparation, course and lesson flows continue; deferred lesson-only assets become available when their content requires them.
5. Visitor returns with browser cache available. Unchanged versioned assets are reused; changed assets use new versions. Private content still resolves from the current authorized session.
6. Maintainer captures equivalent before/after samples and reviews request changes, byte totals, layout stability, load metrics and behavior regressions before marking the work complete.

## Decisions and Constraints

<!-- Format: Use `### Confirmed Decisions`, `### Assumptions`, `### Constraints`, and `### Open Questions` headings, each followed by Markdown bullets. Do not hide unresolved choices. -->

### Confirmed Decisions
- The user requested exploration of issue #8 and then invoked MSDD specification based on that exploration.
- Measure a production build with cold browser cache for the public entrance and initial workspace, preserve behavior and design, and choose optimizations from observed cost.
### Assumptions
- /login is the landing page and / is the authenticated workspace. No separate deployed URL has been supplied.
- The completed build-phase baseline and coverage analysis fixed the desktop byte target at 30%; all comparisons must use equivalent conditions.
- Existing character coverage is preserved; English-only content is not assumed.
### Constraints
- Keep the approved typography, illustration style and accessible interactions.
- Use isolated test data and controlled email delivery; do not touch production learner records or send real mail.
- Treat existing unrelated workspace changes as concurrent work to preserve.
### Open Questions
- The original 108-resource / 1.8-MB environment is unknown. This does not block using the defined production routes as the new baseline.
- Profiling fixed the 30% desktop target and attributed the major shifts to the studies panel changing columns or growing after client data arrives; the technical solution and verification are in plan.md.

## Edge Cases and Failure Handling

<!-- Format: Use a case/action table or bullets with trigger, expected behavior, recovery, and user-visible error. -->

- Character outside the common subset: preserve access to the corresponding glyphs; never silently discard coverage to meet a target.
- Slow or failed font fetch: readable fallback remains visible; loading completion must not destabilize the workspace beyond its CLS budget.
- Stale browser cache after a font update: changed version URL delivers the new font; do not cache mutable font names indefinitely.
- Expired or removed invitation/session: protected pages and API requests retain existing redirect/error behavior, including cross-tab cleanup.
- Empty, populated, failed or slowly loaded studies: retain the appropriate creation/list/retry behavior with stable geometry.
- Mathematics or diagrams reached by direct URL or linked navigation: styles and renderers remain available without requiring a page refresh.
- Long names, accented and non-Latin text, narrow screens or zoom: retain readable text, keyboard reachability and current overflow behavior.
- Failed benchmark request or unavailable metric: report it explicitly; do not count it as a zero-byte improvement or claim unmeasured field results.

## Acceptance Criteria

<!-- Format: Use stable IDs such as AC-001. Make each criterion observable and state how it will be verified. -->

- AC-001: A reproducible baseline and matching after report cover /login and empty/populated / on desktop and mobile, with at least three cold samples per case. Reports specify commit/tree state, environment, fixtures, browser/version, viewport/scale, cache states, throttle settings, observation window, aggregation, request categories, transferred/encoded/decoded bytes, FCP, LCP, CLS, DOMContentLoaded and load timings. Requests and failures are accounted for.
- AC-002: Median cold transferred bytes decrease for both desktop routes against the current matching baseline and meet the numerical target recorded before optimization acceptance. At least one identified unnecessary initial request is removed on each desktop route. Mobile comparisons demonstrate no material byte or request regression; changes required for additional character ranges are measured separately. Any revision of the provisional 30% objective has evidence and is visible in the plan before final verification.
- AC-003: Font checks show preserved supported character mappings, families and used styles/weights; representative accented, non-Latin, code and math content remains readable. Keyboard, focus, contrast and responsive checks show no material regression.
- AC-004: Repeat-visit checks demonstrate reuse of unchanged font assets, and an asset-version change fetches the updated font. Hashed build assets keep effective caching. Private HTML and authenticated responses retain existing privacy/freshness behavior.
- AC-005: All controlled empty/populated workspace runs on both profiles have CLS <= 0.1 during the measurement window, including delayed data/font cases. Before/after traces identify the shift source and verify the fix.
- AC-006: Controlled browser checks pass for signed-out redirects, successful/failed login, sign-out and existing cross-tab behavior, settings/course navigation, creating a study, and lesson text/math/diagrams through direct and linked navigation.
- AC-007: The final production build and relevant automated checks pass; report actual outcomes, before/after metrics, remaining limitations, and any target revision. No result is accepted by dropping requests, hiding failures, changing sample conditions, or reporting unused disk assets as browser savings.

## Explanation and Output Artifacts

<!-- Format: Use a Markdown bullet list with separate `Audience:`, `Writing profile:`, `Primary artifact:`, `Supporting artifacts:`, and `Accessibility:` fields. Prefer an 80% ASD-STE100 controlled-language style for explanatory prose unless strict ASD-STE100 or plain language is required. Choose the clearest medium: prose, diagram, interactive HTML, or narrated explainer video. State the topic, purpose, interaction or narration needs, delivery location, and acceptance evidence for each requested artifact. -->

- Audience: Maintainers evaluating issue #8 and agents implementing the approved feature.
- Writing profile: Plain, concise technical prose using the repository's MSDD format.
- Primary artifact: This high-level spec in specs/optimize-initial-page-load/spec.md.
- Supporting artifacts: plan.md for technical design and evidence; task.md for checkable execution; build-phase raw measurements in output/ and tracked aggregate conditions/results in measurements.json, linked from the plan. Reports must identify their route, purpose and conditions, and exclude tokens, cookies, OTPs and private learner content.
- Accessibility: Preserve approved typography, readable fallbacks, keyboard/focus behavior, semantic loading/error states and responsive content. Tables must label units and metric definitions.
