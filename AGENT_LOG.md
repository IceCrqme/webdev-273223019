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
