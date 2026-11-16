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
