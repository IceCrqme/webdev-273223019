# Deployment readiness

## Live URL

There is no deployed URL yet. `course.json` intentionally keeps `liveUrl` empty; do not
replace it until the application is deployed at a real HTTPS address. After deployment,
set `liveUrl` to the origin with no trailing slash, then run:

```sh
node checks/ex4.mjs
curl -i https://<deployed-host>/health
```

The health endpoint currently reports process liveness only (`{"status":"ok"}`); it does
not check that SQLite can read or write. Verify a real page as well as `/health`.

## Build and run

The image uses Node 22, runs as the non-root `node` user, initializes the SQLite database
at startup, and expects persistent storage mounted at `/data`.

```sh
docker build -t club-events .
docker volume create club-events-data
docker run -d --name club-events \
  -p 3000:3000 \
  -v club-events-data:/data \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e DB_PATH=/data/club_events.db \
  -e SESSION_SECRET='<generate-a-long-random-value>' \
  club-events
docker inspect --format='{{.State.Health.Status}}' club-events
curl -i http://localhost:3000/health
```

Generate a session secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Set secrets through the deployment platform's secret manager, not a Dockerfile, image,
source file, or committed `.env`. Keep the persistent volume when replacing or restarting
the container. The included database initializer creates the tables and seeds example
events only when there are no events.

## Environment variables

| Variable | Required | Runtime behavior |
| --- | --- | --- |
| `SESSION_SECRET` | Yes | Missing value prevents the HTTP app from starting. Use a long random secret and keep it stable between restarts. |
| `PORT` | No | Listening port; defaults to `3000`. |
| `NODE_ENV` | Deployment | Set to `production` so session cookies are Secure. |
| `DB_PATH` | No | SQLite file path; defaults to `database/club_events.db`. The image sets `/data/club_events.db`. |
| `TRUST_PROXY` | No | Set to `1` only behind a trusted TLS-terminating reverse proxy. |
| `GOOGLE_CLIENT_ID` | Optional | Enables Google sign-in only when all three Google settings are valid. |
| `GOOGLE_CLIENT_SECRET` | Optional | Server-side OAuth credential; never expose or log it. |
| `GOOGLE_REDIRECT_URI` | Optional | Exact callback URL: `<https-origin>/api/auth/google/callback` (localhost HTTP is permitted for local development). |
| `GEMINI_API_KEY` | Optional | Enables the server-side Gemini suggestion request. Missing key uses the deterministic fallback. |
| `MCP_USER_ID` | MCP process only | Trusted process-level student identity used for the MCP registration tool; never a tool argument. |

`DATABASE_URL`, `PUBLIC_BASE_URL`, and `MODEL_NAME` remain in `.env.example` as legacy
template placeholders and are not read by the current application. The Gemini client
currently hard-codes `gemini-2.0-flash`; setting `MODEL_NAME` does not change it.

## Failure modes

- Missing `SESSION_SECRET`, an unwritable database directory, or an invalid `DB_PATH`
  prevents startup. Check container logs and volume permissions; do not fix by deleting
  the database.
- `/health` can return 200 even if a later database operation fails. Check application
  logs and exercise a database-backed page after deployment.
- Missing or invalid Google configuration leaves email/password authentication available;
  Google sign-in reports that it is unavailable.
- Gemini missing configuration, provider errors, rate limits, invalid responses, or its
  five-second timeout produce a deterministic editable fallback. Manual description entry
  remains available; suggestion generation never creates or publishes an event.
- SQLite persistence requires the `/data` volume to survive container replacement. A
  single file-backed SQLite database is not configured for multi-replica concurrent
  deployment.

## Four states

The browser UI has code and automated test coverage for loading, empty, error, and success
flows, including model generation/failure behavior. These are not visual sign-off: no
live-browser walkthrough or screenshots have been recorded. Follow the exact manual steps
in `docs/UI.md` and leave each item unticked until its browser evidence is captured.

## Request waterfall

1. A browser request reaches the Express app; static pages are served from `public/`.
2. Express session middleware reads the HTTP-only session cookie and loads the session
   from SQLite. The user role is loaded from the database, not accepted from browser input.
3. Organizer dashboard API requests require an authenticated organizer session; state
   changes also require the session CSRF token.
4. The organizer suggestion endpoint validates the title and keywords, calls the existing
   description service, and returns a suggestion only. Event creation remains a separate,
   explicit organizer action.
5. Services enforce business rules and the data layer accesses SQLite. MCP project tools
   call the same service functions instead of executing their own SQL.

## Security

- Serve production traffic over HTTPS. The app uses HTTP-only, SameSite=Lax session
  cookies and enables the Secure cookie flag in production. Configure proxy trust only
  when the deployment actually has a trusted TLS-terminating proxy.
- Keep session, Google OAuth, and Gemini secrets in the host's secret manager. The Gemini
  key is sent only in a server-to-Google request header. Do not put keys in browser assets,
  logs, Docker build arguments, or this repository.
- Google identity comes from verified OIDC tokens; account linking requires an authenticated
  session, explicit intent, and CSRF protection. Email/password remains available when
  Google settings are absent.
- Organizer operations use the current database role, session authorization, and CSRF
  protection on writes. Students cannot manage organizer events.
- Store SQLite and session data only on the persistent private volume. No at-rest
  encryption or automated backup/restore procedure has been verified; protect the volume
  and arrange backups with the hosting provider.
- Event title and keywords are sent to Google only when an organizer invokes AI generation
  and `GEMINI_API_KEY` is configured. No registration, account, or session data is sent
  with that request. Review Google's applicable API terms and retention policy before
  production use.

## Gaps, ranked by risk

1. **High — no live deployment:** no public URL, TLS check, host configuration, or deployed
   persistence test exists. Add the actual URL to `course.json` only after verifying it.
2. **High — coverage gates fail:** `npm run coverage` measured project statements 84.34%,
   branches 75.37%, and functions 92.98%; the project gate fails its 80% branch threshold.
   The service layer measured 84.04% lines, 75.82% branches, and 92.30% functions; its
   configured 100% gates fail. Do not weaken the gates; add meaningful tests for uncovered
   behavior before calling coverage ready.
3. **Medium — UI evidence is incomplete:** responsive, visual, browser, and accessibility
   checks are not manually verified. `docs/UI.md` records how to perform each check; its
   screenshots are still absent.
4. **Medium — model availability and price:** the Gemini client is pinned in code to
   `gemini-2.0-flash`. The official pricing page accessed 2026-11-25 does not list that
   model, so a current per-call dollar price cannot be substantiated. Do not enable a paid
   production key until model availability and current input/output token rates are
   confirmed at [Google AI pricing](https://ai.google.dev/gemini-api/docs/pricing). A
   billable call is calculated as `(input tokens × input rate + output tokens × output
   rate) / 1,000,000`; output is capped at 300 tokens, input size varies, and actual cost
   is not measured here. No real provider call was made for this work.
5. **Medium — organizer provisioning and recovery:** public registration creates students;
   there is no verified deployment procedure for provisioning an organizer, nor a tested
   database backup/restore or multi-instance setup.

## Model

The model is an optional event-description suggestion, not a source of event facts. With
the key configured, the server sends the organizer-entered event title and keywords to
Google's Gemini API (`gemini-2.0-flash`) and requests at most 300 output tokens. No dates,
locations, user identities, registrations, or other database records are included. The
five-second timeout, malformed response, provider error, missing configuration, or rate
limit results in the deterministic fallback; the organizer can edit the text manually.
Suggestions are never saved or published automatically.

**Cost evidence:** checked the official [Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing)
on 2026-11-25. That page redirects to the current AI Studio pricing and does not provide a
rate for this code's `gemini-2.0-flash` model. Therefore this report does not claim a
current dollar cost or describe the call as free. Verify the model and rates before
configuring a paid key. The calculation formula and output cap above are the only cost
estimate supported by the current implementation.

## MCP

The MCP server uses stdio, not a public HTTP endpoint. The process owner/client controls
who can invoke it. Project tools list events and read event details through the event
service; registration uses the trusted `MCP_USER_ID` process setting, verifies that user
exists, and delegates to the registration service. The user ID is not accepted in tool
arguments. Anyone able to run the process with a different configured ID can act as that
identity, so only trusted clients should receive the MCP configuration. MCP does not
provide an independent per-caller authentication mechanism.

## How I checked

- `npm test` and MCP conformance are recorded in `AGENT_LOG.md` after the final run.
- `npm run coverage` runs the real Mocha suite through c8 and fails on the thresholds
  above; the measured values are included in this report.
- Docker build, runtime, health, and persistence checks will be recorded here only after
  they actually pass. No deployment, browser screenshots, live OAuth, or paid model call
  is claimed.
