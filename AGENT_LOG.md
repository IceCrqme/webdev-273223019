# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

## 2026-11-16 · First Gemini CLI session

- Goal: Implement Slice 1 of the Club Events application, covering acceptance criteria AC-14 to AC-19.

- Delegated: Asked Gemini CLI to read SPEC.md and AGENTS.md and implement email/password authentication, Google OAuth, and an upcoming events list using SQLite and a backend API.

- Checkpoints: Gemini CLI started successfully and detected AGENTS.md and the MCP server configuration. A simple "Reply with OK" request succeeded. Model usage statistics were collected using /stats.

- Went wrong: The initial implementation request took too long and was cancelled. Subsequent attempts encountered model usage limits and API errors. Gemini CLI could not complete the requested implementation.

- Changed by hand: Updated SPEC.md with numbered acceptance criteria and a Markdown table for MCP tools. Added coding conventions to AGENTS.md and recorded actual token usage in USAGE.md. No Slice 1 implementation was completed during this session.

## 2026-11-16 · Second Gemini CLI session

- Goal: Implement the backend foundation for Club Events as the first part of Slice 1.

- Delegated: Asked Gemini CLI to use Node.js, Express, and SQLite to create the database schema and a GET /api/events endpoint. Authentication was explicitly excluded from this step.

- Checkpoints: Reviewed proposed file changes before approval. Installed express and better-sqlite3, initialized SQLite with three sample events, and created the backend routes, services, and server.

- Verification: Ran node test_backend.js successfully. The API returned three upcoming events with available_places values of 100, 30, and 50. Ran node checks/ex2.mjs and passed 32/32 structural checks.

- Went wrong: The first dependency installation failed because sqlite-migrations was unavailable. Gemini corrected the dependencies. Later, the daily quota for gemini-3-flash-preview was exhausted while Gemini was preparing to update AGENTS.md.

- Result: Backend foundation implemented and tested. Email/password authentication, Google OAuth, account protection, and the frontend remain unfinished. The existing Exercise 1 MCP server was not modified.

## 2026-11-22 · Exercise 3 planning and preparation session

- Goal: Plan and prepare Exercise 3 for student event registration with capacity and duplicate checks, owner-only cancellation, Gemini AI service with fallback, and service-backed MCP tools preserving Exercise 1 functionality.

- Reviewed plan:
  1. Acceptance criteria (AC-20 to AC-26), always-ask rules in AGENTS.md, and session checkpoints.
  2. Numbered migration adding registration unique constraint and verification on an empty database.
  3. Failing service unit tests followed by implementation of registration and capacity business rules.
  4. REST API integration tests and endpoints for event registration returning 201, 409.
  5. Owner-only event registration cancellation tests and endpoints returning 204, 403, 404, 401.
  6. Frontend implementation with loading, empty, and error states.
  7. Gemini AI event description service with fake-client unit tests, AbortSignal timeout, and fallback.
  8. Three service-backed MCP tools (`list_events`, `get_event_details`, `register_for_event`) with user context, preserving Exercise 1 tools.
  9. Manual HTTP status verification, mutation test proving rule tests fail when broken, self-written architecture note, traceability table, USAGE.md, GitHub Actions CI verification, and `checks/ex3.mjs` execution.
  - Development workflow: run `npm test`, review diff, and make a commit after each working implementation step.

- Autonomy & Checkpoints: Set autonomy to one small approved step at a time, requiring explicit permission before file changes, dependency installation, schema/auth changes, destructive commands, or Git push. Checkpoints established for plan review, diff inspection, test execution before commits, manual status verification, mutation testing, CI, and running checks/ex3.mjs.

- Went wrong / Changed in review: Removed unrelated organizer CRUD and Google OAuth from the Exercise 3 scope per the professor's instructions. Decided to use a numbered migration adding a unique constraint rather than recreating existing tables. Included frontend loading/empty/error states, separated service tests from API tests, and adopted TDD (writing failure tests before implementation).

## 2026-11-22 · Exercise 3 database migration implementation checkpoint

- Goal: Implement numbered database migration for registrations unique constraint and verify with TDD.

- Progress:
  - TDD Red phase: Verified test failure due to missing `database/migrations/001_registrations_migration.js`.
  - TDD Green phase: Implemented `runMigration` supporting fresh DBs, pre-existing unique indexes, legacy tables without unique constraints (adding unique index atomically), safe duplicate rejection without deleting records, and idempotent repeated runs. All 5 migration tests pass successfully (15/15 total tests passing).
  - Dependency changes: None.

- Diagnostic (`checks/ex3.mjs`): 9/18 checks passed. Pending items include acceptance criteria traceability in test titles, model feature integration, and MCP tools implementation.

## 2026-11-22 · Exercise 3 event registration implementation checkpoint

- Goal: Implement event registration and cancellation business rules and HTTP endpoints (AC-20 to AC-25) using TDD.

- Progress:
  - TDD Red phase: Implemented `test/eventRegistration.test.js` covering successful registration (201), duplicate/capacity conflicts (409), owner cancellation (204), unauthorized cancellation (403), anonymous access (401), and non-existent resources (404). Verified 9/11 registration tests failed.
  - TDD Green phase:
    - Updated `src/services/eventService.js` with `registerForEvent` and `cancelRegistration` using atomic SQLite transactions, ID validation, and stable machine-readable error codes.
    - Updated `src/routes/eventRoutes.js` with `POST /api/events/:eventId/register` and `DELETE /api/registrations/:registrationId` endpoints, including strict positive safe-integer validation for URL parameters.
    - Updated `test/eventRegistration.test.js` to use dynamic future dates.
  - Verification: All 26 tests pass successfully (10 auth, 5 migration, 11 registration). `test_backend.js` also passes.
  - Dependency changes: None.

- Went wrong / Changed in review: Fixed trailing whitespace in `src/routes/eventRoutes.js`. Ensured all tests run in isolated processes via `scripts/run-tests.js` to prevent SQLite connection leaks.

## 2026-11-23 · Exercise 3 AC-26 frontend test and implementation checkpoint

- Goal: Implement the AC-26 frontend for event loading and registration states while preserving the existing registration API.
- TDD Red: Added `test/frontend.test.js` and ran it before the UI existed. The initial suite reported 3 failing tests. After strengthening it with a lightweight fake DOM and mocked fetch, the suite reported 0 passing and 7 failing tests covering static serving, loading, empty, event rendering/fetch error, pending/success, 401/409 messages, and existing endpoint reuse.
- Implementation: Added `public/index.html`, `public/styles.css`, and `public/app.js`, plus static-file serving in `src/app.js`. The frontend shows loading, empty, fetch error, registration pending, success, 401, and 409 states with no new dependencies.
- TDD Green: The focused `test/frontend.test.js` suite passes 7/7 tests.

## 2026-11-23 · Exercise 3 AC-26 observable UI regression fixes

- Goal: Correct semantic event-card rendering and server-consistent registration/loading states found after initial frontend delivery.
- Changes: Preserved the actual event-card heading, paragraphs, and button elements instead of replacing them with `textContent`; added explicit 409/full and duplicate button states; added a working event-loading retry; cleared stale cards on failed refreshes; and separated POST success from subsequent event-list refresh failure.
- Testing: Added focused behavioral assertions for semantic DOM structure, 409 button states, Retry behavior, stale-card clearing, and separate refresh-failure reporting. The focused frontend suite passes 11/11 tests.

## 2026-11-23 · Exercise 3 AI description suggestion service

- Goal: Implement the AC-9/AC-10 provider-backed description suggestion service with a bounded timeout and deterministic fallback.
- TDD Red: Added `test/eventDescriptionService.test.js` first. The focused test command failed at module loading because `src/services/eventDescriptionService.js` did not exist; no test cases ran.
- Implementation: Added the isolated Gemini client and injectable event-description service. The service validates inputs and plain-text output, uses `AbortController` with a rejecting timeout race, and returns only a `{ description, fallback }` suggestion result. It never writes or publishes events. Missing credentials, malformed output, timeouts, and provider errors use an input-derived deterministic fallback.
- TDD Green: The focused mocked-client suite passes 5/5 tests, including malformed output, missing credentials, timeout abort, and provider failure. No dependencies or credentials were used.
- Verification: `npm test` passes all 42 tests. `checks/ex3.mjs` passes 14/18; the model checks pass, while the remaining failures concern unimplemented AC traceability and project MCP tools/authentication, outside this task.

## 2026-11-23 · Exercise 3 project MCP tools

- Goal: Add `list_events`, `get_event_details`, and `register_for_event` to the project MCP server while retaining the two Exercise 1 lecture tools and reusing event services.
- Identity: The existing stdio server had no caller context; HTTP routes use `req.session.userId`. After review, registration identity is the trusted process-level `MCP_USER_ID`, configured by the MCP host and never accepted in tool arguments. Missing or invalid identity fails closed. Updated `.env.example` and the MCP README to match; no authorization rule or schema changed.
- TDD Red: Added `test/projectMcpTools.test.js` before the implementation. The focused run failed to load the not-yet-created `mcp-server/projectTools.js`.
- Implementation: Added an injectable project-tool adapter that calls `eventService.getUpcomingEvents`, `getEventDetails`, and `registerForEvent`. Added the event-detail service query, delegated registration to the existing service, and registered project tools in the existing stdio JSON-RPC server without removing lecture tools.
- TDD Green: The mocked project-tool tests pass 6/6, covering tool listing, event listing/detail/not-found, trusted identity, successful registration, duplicate/full errors, and missing identity.
- Verification: `npm test` passes all 48 tests. The Exercise 1 MCP conformance check passes 12/12. `checks/ex3.mjs` passes 17/18; its sole remaining failure is traceability for unrelated AC-3/4/5/6/7/8/12/13/15/16/17/18/19.

## 2026-11-23 · Exercise 3 MCP identity and JSON-RPC audit

- Goal: Verify configured MCP user existence in SQLite, distinguish parse/invalid-parameter/internal JSON-RPC errors, and audit the Exercise 3 traceability failure before committing.
- TDD Red: Added a real temporary-SQLite test for a valid positive but nonexistent `MCP_USER_ID`; before the fix, the MCP tool returned only a generic event error. Added stdio malformed-JSON and null-params tests plus an injected handler-rejection test; null params were incorrectly reported as `-32700 Parse error`, and the injectable line-handler module did not yet exist.
- Implementation: MCP registration now verifies the configured user through `authService.getUserById` before delegating unchanged to `eventService.registerForEvent`. The tool still does not accept a user ID argument. The line handler now separates JSON parsing from request dispatch: malformed JSON returns `-32700`, invalid params return `-32602`, and unexpected handler failures return `-32603` with the request ID.
- Traceability: Added identifiers only to existing evidence for AC-6/7/12/13/18/19. AC-3/5/8/15 remain unsupported; AC-4/16/17 remain unlinked because existing tests do not establish the full required behavior.
- Verification: `npm test` passes all 52 tests; Exercise 1 MCP conformance passes 12/12; `git diff --check` passes. `checks/ex3.mjs` passes 17/18, with only the aggregate traceability check failing for AC-3/4/5/8/15/16/17.

## 2026-11-23 · Exercise 3 event listing integration evidence

- Goal: Verify AC-4, AC-16, and AC-17 through a signed-in student's real SQLite-to-API-to-frontend flow.
- Test: Added a temporary-database integration test that registers a student, confirms the session, inserts future and past events plus one registration, requests the real `GET /api/events` endpoint through the authenticated Supertest agent, and asserts that the frontend displays only the upcoming event with its title, formatted date, location, and available places.
- Implementation: No production changes were needed; the existing endpoint and frontend behavior satisfy the tested criteria. Updated the SPEC traceability table only after the integration assertions passed.
- Verification: The first focused run exposed a missing `node:os` import in the test setup; after adding it, the focused frontend suite passes 12/12 and `npm test` passes all 53 tests. `git diff --check` passes. `checks/ex3.mjs` remains 17/18 because unrelated AC-3, AC-5, AC-8, and AC-15 still lack tests.

## 2026-11-24 · AC-2/AC-14 email and password UI

- Goal: Add accessible email/password Login and Register pages using the existing authentication API, without changing server authentication behavior.
- TDD Red: Added frontend tests first for page serving/navigation, client validation, same-origin session requests, role resolution through `/api/auth/me`, accessible loading/errors/success, and registration without role input. The focused run had 22 passing existing frontend tests and 5 failing auth UI tests because the pages and script did not exist.
- Implementation: Added `public/login.html`, `public/register.html`, and shared `public/auth.js`; added responsive auth styling and navigation on the home, login, register, and organizer pages. Login checks `/api/auth/me` and routes students to events and organizers to the dashboard. Registration sends only email/password and reports success. No backend/API changes, local storage, or secrets.
- Traceability: Linked AC-2 to `test/frontend.test.js` and AC-14 to `test/auth.test.js` and `test/frontend.test.js`; updated the Slice 1 status to reflect the email/password UI while retaining Google OAuth and protected account features as incomplete.
- Verification: Focused frontend tests pass 27/27. `npm test` passes all 85 Mocha tests, and the legacy backend smoke checks pass. Exercise 1 MCP conformance passes 12/12. `git diff --check` passes.

## 2026-11-24 · AC-6/AC-19 student My Events

- Goal: Show a signed-in student's own event registrations and allow cancellation without trusting browser-supplied identity.
- TDD Red: Added temporary-SQLite API tests and fake-DOM frontend tests first. The focused API run had 11 passing and 2 failing tests because the registrations list endpoint was missing; the frontend run had 27 passing and 4 failing My Events tests because the page and script were missing.
- Implementation: Added `GET /api/registrations`, guarded by database-backed student role middleware and using the authenticated user's ID from the session lookup. Added a parameterized service query, responsive `public/my-events.html` and `public/my-events.js`, same-origin reads/cancellation, confirmation, accessible loading/empty/error/success feedback, and navigation links. Cancellation continues through the existing owner-checked endpoint. No schema or dependency changes.
- Traceability: Linked AC-6 to `test/eventRegistration.test.js` and `test/frontend.test.js`; linked AC-19 to `test/auth.test.js`, `test/eventRegistration.test.js`, and `test/frontend.test.js`. Updated the Slice 1 status.
- Verification: Focused registration API tests pass 13/13 and frontend tests pass 32/32. `npm test` passes all 92 Mocha tests and the legacy backend smoke checks. Exercise 1 MCP conformance passes 12/12. `git diff --check` passes.

## 2026-11-25 · Exercise 3 AC-9/AC-10 Organizer Dashboard integration

- Goal: Integrate the existing event-description service into the organizer dashboard without publishing generated content or exposing provider credentials.
- TDD Red: Added organizer API tests using a mocked Gemini client and frontend tests for generation, fallback, loading, errors, and overwrite confirmation. Before implementation, the new endpoint tests returned 404 and the UI tests found no keywords field or generation handler. An initial combined Mocha invocation also caused an unrelated shared-database close in the frontend suite; the suites were run separately for valid verification.
- Implementation: Added `POST /api/organizer/event-description` with database-backed organizer authorization and the session-bound CSRF middleware. It validates title/keywords and delegates only to the existing `eventDescriptionService`; it does not write event data. Added comma-separated keywords and a Generate with AI control. Suggestions are editable; a nonempty description is replaced only after explicit confirmation. Fallback/error messaging leaves the manual description field available. Requests use same-origin session credentials; Gemini remains server-side.
- Traceability: Linked AC-9 and AC-10 to the service, organizer API, and dashboard tests in `SPEC.md`.
- Verification: Focused API tests pass 13/13; focused frontend tests pass 37/37; mocked service tests pass 5/5. `npm test` passes all 100 Mocha tests plus the legacy backend smoke checks. MCP conformance passes 12/12. `git diff --check` passes. Tests used mocked provider responses; no paid API request or dependency change.
- Changed: `src/routes/eventRoutes.js`, `public/organizer.html`, `public/organizer.js`, `test/eventManagement.test.js`, `test/frontend.test.js`, `SPEC.md`, and `AGENT_LOG.md`.

## 2026-11-25 · Exercise 3 AC-3/AC-15 Google sign-in and account linking

- Goal: Implement Google OpenID Connect sign-in and explicit secure linking without changing organizer roles or password authentication.
- TDD Red: Added `test/googleOAuth.test.js` with mocked discovery, token, and JWKS responses plus frontend tests for Google controls and callback feedback. The initial focused OAuth run returned 404 for the not-yet-implemented endpoints; the frontend run failed because the page had no Google actions or outcome messages.
- Implementation: Added native Node.js Authorization Code + PKCE, session-bound state/nonce, Google discovery, RS256/JWKS ID-token verification, verified-email checks, stable `sub` lookup, and session regeneration at sign-in. First-time identities create student accounts only; verified-email collisions return a conflict rather than linking. Account linking now requires an authenticated user, session CSRF token, and explicit POST action; it rejects subjects linked elsewhere and accounts already linked to a different subject. The existing unique `users.google_id` column was reused; no schema or package changes. Missing/invalid OAuth configuration degrades to a clear login-page message while email/password auth remains available. Added Google Cloud setup and manual verification instructions.
- Traceability: Linked AC-3 and AC-15 to `test/googleOAuth.test.js` and `test/frontend.test.js` in `SPEC.md`.
- Verification: Focused OAuth tests pass 14/14 and frontend tests pass 39/39. `npm test` passes 116 Mocha tests plus legacy backend checks. MCP conformance passes 12/12. `git diff --check` passes, and no OAuth client credential references occur in public assets. All OAuth network traffic in tests is mocked; no real client credentials or Google requests were used.
- Changed: `.env.example`, `README.md`, `SPEC.md`, `AGENT_LOG.md`, `src/routes/authRoutes.js`, `src/services/authService.js`, `src/services/googleOAuthService.js`, `public/login.html`, `public/auth.js`, `public/styles.css`, `test/frontend.test.js`, and `test/googleOAuth.test.js`.
