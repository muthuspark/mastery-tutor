# PRD: Private Beta User Onboarding

## Summary

Convert Newton from a single-learner app into an invite-only service where each learner signs in with an email OTP and has a private learning workspace.

After verifying their email, new learners go directly to course creation. Returning learners see their saved courses and progress. Existing courses and progress transfer to the owner’s account.

Payments, credits, and pricing are deferred.

## Goals and User Experience

The first release must let invited learners independently create, study, and resume courses without accessing another learner’s information.

**New learner flow**

1. Open the app and enter an email address.
2. If invited, receive a six-digit login code through Mailtrap.
3. Enter the code to verify email ownership and create an account.
4. Arrive at the existing course creation form.

**Returning learner flow**

- An active session opens the learner’s workspace directly.
- An expired session requires another email OTP.
- Signing out returns to the login screen and clears cached learner data.

There is no required name, password, profile questionnaire, or product tour. Learners can optionally describe their background in settings.

## Product Requirements

### Invitations and login

- Maintain a server-configured allowlist of invited emails. Include the owner email automatically.
- Normalize emails consistently by trimming whitespace and treating case consistently. Do not rewrite aliases or remove address components.
- Check invitation eligibility both when requesting a code and when completing sign-in.
- Uninvited visitors see a clear invitation-only message and cannot create accounts or trigger email delivery.
- Use a single email field followed by a single code field that supports paste, keyboard submission, and OTP autofill.
- Allow learners to correct their email address and request a replacement code.
- Removing an email from the allowlist blocks subsequent access, including existing sessions.

### OTP and sessions

Proposed defaults:

| Setting | Default |
|---|---|
| Code length | Six digits |
| Code validity | Five minutes |
| Incorrect verification attempts | Three per issued code |
| Resend cooldown | 60 seconds |
| Session lifetime | Seven days, fixed expiry |
| OTP storage | Hashed |
| Resend behavior | Replace the previous code |

- Consume each code once. Successful verification cannot be replayed.
- Enforce persistent request limits per email and IP, including concurrent requests.
- Do not record codes, credentials, or session tokens in application logs.
- Use secure, HTTP-only session cookies in production.
- Validate sessions and access on the server. Page redirects alone are insufficient.
- Logout invalidates the current session.

### Mailtrap delivery

- Use Mailtrap’s transactional HTTP API for login emails.
- Configure `MAILTRAP_API_KEY` and `FROM_EMAIL` in this app’s own server environment, using the existing setup in `../agent/.env` as the configuration source.
- Do not make this app depend on reading the sibling app’s environment at runtime.
- Send emails branded as Newton, with the code, expiry, and instructions for ignoring an unsolicited request.
- If Mailtrap rejects or cannot confirm a send, show a retryable delivery error. Provider acceptance must not be described as confirmed inbox delivery.
- Keep credentials and raw provider errors out of browser responses.

### Private learning data

- Associate each course and learner profile with an authenticated user.
- Enforce ownership across course lists, lessons, quizzes, attempts, review items, practice sessions, explanations, regeneration, and exports.
- Derive identity from the session rather than a client-supplied user ID.
- Return an unauthenticated response for protected API requests without a valid session. Return a consistent not-found response for another learner’s resources.
- Background jobs resolve the course owner’s profile and context rather than using the global learner profile.
- Clear browser query caches on logout or account changes.
- Preserve current learning and mastery behavior.

### Learner settings

- Keep background personalization optional and private.
- Remove AI provider selection and server-configuration instructions from learner-facing screens.
- Select the AI provider through server configuration.
- Present service failures in language that helps learners retry without exposing infrastructure details.

### Existing data

- Configure an explicit owner email before migration.
- Assign existing courses, profile, progress, and related learning records to that owner.
- Make migration repeatable without duplicating or reassigning records.
- Never assign existing data to whichever learner happens to register first.
- Back up the database before migration and verify record counts and relationships afterward.

## Technical Direction and Boundaries

Use Better Auth for email OTP authentication and session management, integrated with Drizzle. Connect its email delivery callback to Mailtrap.

Add authentication records and course/profile ownership. Existing course and chapter identifiers can remain unchanged; related records inherit access through their owning course.

Retain SQLite for this milestone on a single persistent server. A broader production database and deployment migration is separate work.

New server configuration includes the auth secret, application URL, owner email, invited emails, selected AI provider, and Mailtrap settings. Fail clearly when required configuration is missing.

Out of scope:

- Payments, credit balances, purchases, and course entitlements.
- Enforcing the future one-free-lesson offer.
- Teams, classrooms, collaboration, and shared course catalogs.
- Social login, passwords, email changes, and invitation-management UI.
- A marketing-site redesign.

## Acceptance and Validation

The milestone is complete when:

- An invited learner receives a code, signs in, and reaches course creation without additional setup.
- A returning learner resumes their own courses and progress.
- Uninvited emails cannot send codes, register, or access protected resources.
- Wrong, expired, replaced, exhausted, and previously consumed codes fail correctly.
- Cooldowns and rate limits hold under repeated and concurrent requests.
- Mailtrap failures produce recoverable feedback without exposing secrets.
- Two learners cannot read, modify, export, or trigger AI work against each other’s resources.
- Background generation uses the correct learner’s context.
- Logout and account switching leave no previous learner’s cached information visible.
- Existing owner data survives migration, and rerunning migration is safe.
- Login works on mobile and desktop with keyboard navigation, accessible labels, and clear loading and error states.

Validate authentication, authorization, migration, and delivery failures with automated tests. Exercise the full login and two-user learning flows in browser tests using a controlled email transport. Verify real Mailtrap delivery before inviting beta users.

Track code requests, provider acceptance/failure, successful verification, first-course creation, and first-lesson opening without logging OTPs or learning content. Use the beta to establish onboarding completion and delivery reliability baselines.
