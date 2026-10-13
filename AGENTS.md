# Instructions for the agent

Read this file at the start of every session. Keep it short and correct; update it when the project changes.

## Project
<!-- One or two sentences: what the app does and for whom. Link SPEC.md. -->
See `SPEC.md` for goals, non-goals and acceptance criteria.

## Commands
- Install: `npm install`
- Run: `npm run mcp`
- Test: `node mcp-server/check.mjs -- npm run --silent mcp`
- Coverage: Not configured
- MCP server: `node mcp-server/server.js`

## Conventions
<!-- Folder layout, naming, where business rules live, how errors are returned to the client. -->

## Layers
<!-- Fill in the file or folder for each layer. -->
Requests arrive two ways and both end in the same place:

- HTTP route handler → service → data access → database
- MCP tool → **the same service** → data access → database

A route handler reads the request and turns a result into a status code. A service holds the
rules and knows nothing about HTTP or about MCP. Only the data layer writes SQL. An MCP tool
that talks to the database directly is a second, unguarded way into your data: never add one.

## The model feature
<!-- Provider, env var, and the call site. -->
- The provider is named in exactly one file:
- The key comes from an environment variable and is never committed or logged.
- Every call has a timeout and a deterministic fallback, so the app still works when the provider is down or rate-limited.
- The model's output is re-checked against real data before anything is saved or shown.
- Tests never call the provider: they pass in a fake client.

## The MCP server
<!-- Where it lives and how it authenticates. -->
- Lives in `mcp-server/`, grew out of Exercise 1.
- Every tool calls a service function; none touches the data layer or the database directly.
- It carries a user, and enforces exactly the same authorization rules as the HTTP API.
- Adding a tool means adding a row to the table in `SPEC.md` too.

## Tests and coverage
- Every acceptance criterion in `SPEC.md` has an id like `AC-3`, and a test whose title contains that id.
- The coverage gate runs in CI: 100% of the service layer, 80% overall.
- A test is evidence. Changing a test so the code passes destroys the evidence.

## Always ask before
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`
- changing an authentication or authorization rule
- adding, renaming or removing an MCP tool
- changing a coverage threshold
- sending user data to a third-party model

## Never
- commit secrets, passwords, API keys or an OAuth client secret
- weaken or delete a test to make it pass
- lower a coverage threshold or switch off a CI job to make the build green
- add an MCP tool that reaches past the service layer
- log a prompt that contains somebody's personal data

## 2026-10-13 · Exercise 1 MCP server

- Goal: Implement a working MCP server for the course lectures.
- Delegated: Used an AI assistant for step-by-step guidance and debugging explanations.
- Checkpoints: Self-check passed all 12/12 checks, including initialization, tool listing, valid and invalid tool calls, protocol errors, and clean stdout.
- Went wrong: The first implementation returned a tool result instead of JSON-RPC error -32602 for an unknown tool. Fixed the handler and reran the self-check successfully.
- Changed by hand: Created `mcp-server/server.js`, updated `mcp-server/README.md`, created the root `package.json`, and added the `mcp` npm script.
