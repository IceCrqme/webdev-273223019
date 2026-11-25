# Web Development course · your workspace

This repository is your workspace for the whole course: Exercise 1 in `mcp-server/`, and your project (Exercises 2–5) in the rest of it. Everything runs in your browser through GitHub Codespaces, so nothing needs to be installed on your laptop.

By the end you hand in one working application: a backend and a frontend over a real database, sign-in with a password **and** with a provider, a feature that uses a model, your own MCP server over the same data, a UI that holds up on a phone and a keyboard, and tests that trace to the criteria in your spec. The full target is on the course site under **Resources → The course project**, and the questions you will be asked about it are under **Resources → The defence**. Read both before you start Exercise 2.

## Start

1. On the course template page, click **Use this template → Create a new repository**. Make it **public** and name it `webdev-<your faculty number>`.
2. Your repository is public, so the lecturer and your Exercise 5 review partner can read it without an invitation. That also means **no keys, passwords or client secrets ever go into it**: put them in **Settings → Secrets and variables → Codespaces** instead, where the workspace picks them up as environment variables.
3. Click **Code → Codespaces → Create codespace on main**. The first start takes a few minutes while the tools are installed.
4. When the terminal shows `Workspace ready`, type `gemini` and follow the sign-in steps on the course setup page.
5. Fill in `AGENTS.md` as you go, and add one entry to `AGENT_LOG.md` and `USAGE.md` after every agent session.

The course setup page explains accounts, sign-in, free limits and what to do if something goes wrong.

## Google sign-in setup

Google sign-in uses the OpenID Connect Authorization Code flow. It stays disabled when any of
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or `GOOGLE_REDIRECT_URI` is missing; email/password
authentication continues to work.

1. In Google Cloud Console, select or create a project and configure the OAuth consent screen
   (Google Auth Platform **Branding** and **Audience**). Use the app's name and support email,
   select the appropriate internal/external audience, and add your account under **Test users**
   while the app is in testing.
2. Under **Clients** / **Credentials**, create an OAuth client ID for a **Web application**.
   The app requests the OpenID Connect `openid email profile` scopes.
3. Add this exact **Authorized redirect URI** for local testing:
   `http://localhost:3000/api/auth/google/callback`
   For Codespaces or deployment, use the app's HTTPS origin followed by
   `/api/auth/google/callback` (for example,
   `https://<your-codespace-forwarded-host>/api/auth/google/callback`). The URI in Google
   Cloud and `GOOGLE_REDIRECT_URI` must match exactly.
4. Put the client ID, client secret, and exact redirect URI in the runtime environment as
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`. For Codespaces, use
   **Repository Settings → Secrets and variables → Codespaces**. Keep the client secret out
   of source control and browser code. `SESSION_SECRET` is also required by the app.

Manual verification: with the Google variables unset, start the app and confirm that email /
password login still works and Google sign-in reports that it is unavailable. With a configured
client and test user, use **Continue with Google** and confirm `/api/auth/me` reports a student.
For account linking, sign in to a local account first, then use **link Google to your account**;
confirm the existing account remains signed in. A first-time Google login whose verified email
matches a local account must be rejected rather than linked; linking an identity already used
by another account must also be rejected. Cancelling Google's consent should return to login
with a cancellation message.

## What is already here

| Path | What it is for |
|---|---|
| `.devcontainer/` | The workspace definition: Node 22, Python 3.12, SQLite, Docker, GitHub CLI, Gemini CLI |
| `.gemini/settings.json` | Tells Gemini CLI to read `AGENTS.md`, and where it finds your MCP servers (Exercise 1) |
| `.vscode/mcp.json` | The same for Copilot, if you use it (the key is `servers`) |
| `.github/workflows/ci.yml` | Runs your tests, the coverage gate, the MCP conformance check and the spec check on every push |
| `AGENTS.md` | Instructions your agent reads every session |
| `SPEC.md` | Your project specification (Exercise 2) |
| `AGENT_LOG.md`, `USAGE.md` | The logs you keep from Exercise 1 on |
| `mcp-server/` | Exercise 1, with `lectures.json`, `messages.jsonl` and the self-check `check.mjs` |
| `checks/` | One self-check per exercise: `node checks/ex2.mjs`, `ex3`, `ex4`, `ex5`, plus `project.mjs` before the defence |
| `docs/UI.md` | The UI checklist your project is graded against (Exercise 4) |
| `DEFENSE.md` | Your notes for the defence (Exercise 5) |
| `.env.example` | Every environment variable your app needs, with placeholder values |
| `course.json` | How to start your MCP server, and where your deployment answers |

## Fill in `course.json` first

Two facts about your copy that nobody can work out by reading the code:

```json
{
  "mcp": "npm run mcp",
  "liveUrl": "https://webdev-121220001.onrender.com"
}
```

`mcp` is the command that starts your MCP server, which the Exercise 1 check runs, so
add an `mcp` script to `package.json` and leave the default alone. `liveUrl` is filled
in at Exercise 4. The self-checks read both.

## Check yourself before you hand in

Each exercise ships a self-check you run from the repository root:

```bash
node mcp-server/check.mjs -- node mcp-server/server.js   # exercise 1
node checks/ex2.mjs                                       # exercise 2
node checks/ex3.mjs                                       # exercise 3
node checks/ex4.mjs https://your-app.onrender.com         # exercise 4, URL optional
node checks/ex5.mjs                                       # exercise 5
node checks/project.mjs                                   # the night before the defence
```

They check **structure**, not quality: they catch a missing section, an unwritten acceptance criterion or a fix committed without its test. Every check must pass before you hand in: an exercise that fails one comes back to you as incomplete. Passing them all is the minimum, not the point. What the work is worth is decided by the evidence you wrote down and by the defence at the end of the course, where you explain your own code.

## Showing your work

When an exercise is done, commit and push, so your work is on GitHub and CI has run on it. Then ask the assistant to check your work in the room. They go through the exercise page's **What the assistant checks** list with you, at your codespace, and either accept the exercise or tell you exactly what is still missing.

## Save your free quota

Stop the codespace when you finish (**Code → Codespaces → … → Stop codespace**) and delete codespaces you no longer need.
