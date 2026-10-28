# Stable authentication header navigation — Spec

## Summary

<!-- Format: State the outcome, scope, and measurable reason for doing this. -->

Fix [issue #5](https://github.com/muthuspark/mastery-tutor/issues/5): keep Newton's header consistent with authentication throughout logo navigation. Signed-out visitors must never briefly see Settings or Sign out, including when navigation is slow.

## Problem

<!-- Format: Describe the current behavior, observed failure/opportunity, affected users, and evidence. -->

On the public landing page (/login), clicking Newton navigates to protected / before returning to /login. The header assumes every route except /login is authenticated. Exploration reproduced an unintended Settings / Sign out state lasting about 55 ms normally and 461 ms with 400 ms fetch delay. Signed-in navigation from Settings to home retained its account actions under the same delay. These measurements are pre-fix development-browser evidence, not production performance targets.

## Goals and Non-Goals

<!-- Format: Use `### Goals` and `### Non-goals` headings, each followed by a Markdown bullet list. Keep each item testable or explicitly bounded. -->

### Goals
- Show account actions only when a valid, invited user has been established.
- Keep signed-out logo navigation on the public entrance and signed-in logo navigation directed to the learning workspace.
- Prevent transient account actions on signed-out initial loads and redirects.
- Preserve signed-in Settings navigation and sign-out behavior.
### Non-goals
- Redesign the header, landing page, or authentication flow.
- Change session lifetime, invitation rules, protected-page access, or API authorization.
- Add a new authentication library or general client session state system.

## Users and Scenarios

<!-- Format: Use `### Actors` followed by a Markdown bullet list, then `### Scenarios` followed by a Markdown numbered list. Include the expected result for each scenario. -->

### Actors
- Signed-out visitor entering Newton.
- Signed-in, invited learner navigating the workspace.
### Scenarios
1. A signed-out visitor clicks Newton on /login: the visitor remains at the public entrance with no account actions.
2. A signed-out visitor opens / directly: Newton returns the visitor to /login without showing account actions.
3. A learner clicks Newton from Settings: the workspace opens and account actions remain consistent.
4. A learner signs out, then clicks Newton: the public entrance remains free of account actions.
5. Each navigation behaves consistently when responses are delayed.

## Requirements

<!-- Format: Use stable IDs such as REQ-001. For each requirement state the behavior, inputs/outputs, and priority. -->

- REQ-001 (must): The header uses validated authentication state, rather than treating a destination URL as proof of sign-in. An unresolved state exposes no account actions.
- REQ-002 (must): The resolved signed-out header shows Private beta and links Newton to /login. It never displays Settings or Sign out during initial rendering, navigation, or redirects.
- REQ-003 (must): The resolved signed-in header shows Settings and Sign out and links Newton to /. The normal signed-in logo transition preserves these actions.
- REQ-004 (must): Login, logout, and existing cross-tab session changes continue to refresh the displayed identity state through their existing navigation flows.
- REQ-005 (must): Existing protected-page and API access rules remain enforced independently of header visibility. No sensitive session details are exposed in header output.
- REQ-006 (must): Keep the logo accessible by its Newton name and usable by keyboard. Pending authentication must not collapse the header layout or briefly assert a signed-in state.

## User/System Flows

<!-- Format: Use numbered steps. Name the actor, system action, state change, and failure branch at each relevant step. -->

1. A visitor requests a page. Newton validates the current session and invitation access before displaying resolved account actions. While validation is pending, any visible header stays neutral.
2. For a signed-out visitor, Newton displays Private beta. Clicking the Newton link targets /login directly. Opening protected / instead redirects to /login while the header remains public or neutral.
3. For a signed-in learner, Newton displays Settings and Sign out. Clicking Newton from Settings navigates to /. The account actions remain available through this ordinary client navigation.
4. On successful login or logout, existing full-document navigation obtains the new session state and displays the corresponding header. Existing cross-tab handling remains active.
5. If session validation fails, Newton does not guess that the user is signed in; existing page error/retry behavior handles recovery.

## Decisions and Constraints

<!-- Format: Use `### Confirmed Decisions`, `### Assumptions`, `### Constraints`, and `### Open Questions` headings, each followed by Markdown bullets. Do not hide unresolved choices. -->

### Confirmed Decisions
- Use the explored server-validated header approach and authentication-aware logo destinations as the basis of this specification.
- Keep existing authentication and authorization rules.
### Assumptions
- The landing page in issue #5 means /login; / is the protected learning workspace, as confirmed in exploration.
- Successful login/logout continue to perform full-document navigation.
### Constraints
- Shared navigation must not infer authentication from pathname alone.
- Delayed responses must not reveal unintended actions.
- Preserve current header appearance, labels, and accessibility.
### Open Questions
- No material product questions remain for this scope.

## Edge Cases and Failure Handling

<!-- Format: Use a case/action table or bullets with trigger, expected behavior, recovery, and user-visible error. -->

- No session, expired session, or user without invitation access: treat as signed out when the next server validation occurs; preserve existing redirects and cross-tab/session refresh behavior.
- Slow validation: show a neutral header with stable dimensions, without account actions until validated.
- Session lookup failure: do not render authenticated actions as a fallback; use existing error recovery rather than silently claiming a valid session.
- Sign-out request failure: keep the existing actionable error and re-enabled retry button; do not pretend logout succeeded.
- Back navigation after logout: retain the existing protection against restoring private content or a stale identity.
- Direct signed-in /login visit: preserve the existing redirect to /.

## Acceptance Criteria

<!-- Format: Use stable IDs such as AC-001. Make each criterion observable and state how it will be verified. -->

- AC-001: With an empty browser session, loading /login and clicking Newton never inserts Settings or Sign out into the visible header DOM; the final URL is /login and the resolved logo href is /login. Verify normal and delayed navigation.
- AC-002: With an empty browser session, directly loading / ends at /login with no transient account actions in the rendered header. Verify normal and delayed responses, beginning observation before page rendering.
- AC-003: With an invited authenticated session, the resolved logo href is /. Clicking Newton from /settings reaches / and keeps Settings and Sign out present during the transition, normally and with delayed responses. Clicking Newton again on / remains consistent.
- AC-004: Following successful login, account actions are present; following logout, Private beta is present and a subsequent logo click exposes no account actions. Existing multi-tab sign-out and back-navigation behavior still pass.
- AC-005: The Newton link remains named and keyboard-operable; pending header layout reserves the normal header dimensions and shows no account actions. Verify delayed initial rendering and keyboard activation.
- AC-006: Signed-out protected-page and API requests retain existing redirect/401 behavior. Header serialization contains no session tokens or user records; only the minimal display state crosses into interactive controls.

## Explanation and Output Artifacts

<!-- Format: Use a Markdown bullet list with separate `Audience:`, `Writing profile:`, `Primary artifact:`, `Supporting artifacts:`, and `Accessibility:` fields. Prefer an 80% ASD-STE100 controlled-language style for explanatory prose unless strict ASD-STE100 or plain language is required. Choose the clearest medium: prose, diagram, interactive HTML, or narrated explainer video. State the topic, purpose, interaction or narration needs, delivery location, and acceptance evidence for each requested artifact. -->

- Audience: Maintainers addressing GitHub issue #5.
- Writing profile: Concise repository documentation in plain language.
- Primary artifact: spec.md in specs/stable-authentication-header-navigation/ defines behavior and acceptance criteria.
- Supporting artifacts: plan.md defines implementation and verification; task.md is the generated unchecked execution list. Build evidence belongs in these artifacts when implementation occurs. No separate explainer or product copy is needed.
- Accessibility: Preserve the Newton link name, keyboard activation, current control labels, and stable header layout.

Evidence: Acceptance validation completed on 2026-10-28. AC-001/AC-002 pass with signed-out normal and 400 ms delayed navigation, direct protected entry, and continuous transient-action observation. AC-003/AC-004 pass with signed-in navigation, login/logout, multi-tab sign-out and back navigation. AC-005 passes keyboard activation, pending/resolved rendering, and public header geometry at desktop/mobile widths. AC-006 passes existing API access checks and inspection of the presentation boundary. Regression tests fail on the original code and pass on the fix.
