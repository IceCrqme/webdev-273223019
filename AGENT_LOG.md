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
