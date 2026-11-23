# Club Events

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
<!-- One line: lab booking, study groups, club events, or the own project the lecturer approved. -->
 - Club Events
## Goals
 - Students can view a list of upcoming club events.
 - Students can register and log in to their accounts.
 - Logged-in students can join events and cancel their registrations.
 - Organizers can create, edit, and delete events.
 - Each event has a title, description, date, location, and capacity.
 - The application stores users, events, and registrations in a database.
## Non-goals
 - No online payments or paid tickets.
 - No real-time chat between students.
 - No separate mobile application.
 - No support for multiple universities.
## Constraints
 - The application must run in GitHub Codespaces.
 - The backend will use Node.js and Express.
 - The frontend will use HTML, CSS, and Javascript.
 - The application must use a real database to store users, events, and registrations.
 - Passwords must be securely hashed and never stored as a plain text.
 - Only organizers can create, edit, and delete events.
 - The application must validate user input and handle errors.
 - The interface should be simple and easy to use.
## The model feature
- Model: Gemini API, text generation using a text-based model.
- Input: An event title and keywords, entered by an organizer.
- Output: A suggested event description that the organizer can review and edit.
- When it fails: Show an error message and allow the organizer to write the description manually. Never publish unverified AI-generated content.

## Auth
- Local: Users can register and sign in using their email address and password. Passwords are securely hashed.
- Provider: Users can sign in using their Google account through OAuth.
- Account linking: If a user already has an account, they can securely link Google sign-in to the same account after authentication. Both methods use the same user profile and event registrations.

## MCP tools
| Tool | Description |
| --- | --- |
| list_events | Lists upcoming club events with their titles, dates, locations, and available places. Accessible to all users. |
| get_event_details | Returns detailed information about a specific event using its ID. Accessible to all users. |
| register_for_event | Registers the authenticated student for an event. Rejects duplicate registrations and registrations for full events. |

All MCP tools use the same service functions as the HTTP API, including authentication, authorization, and validation.

## UI
- Home page: Display upcoming club events with their titles, dates, locations, and available places.
- Event details page: Show the full description, date, location, capacity, and registration button.
- Login and registration pages: Allow users to sign in with email/password or Google.
- My Events page: Show events the student has joined and allow cancellation.
- Organizer dashboard: Allow organizers to create, edit, and delete events.
- AI Assistant: Provide a button to generate an event description when creating or editing an event.
- Navigation: Include links to Events, My Events, Login, and Logout.
- Design: Use a clean, responsive layout that works on desctop and mobile browsers.

## Architecture
- Frontend: HTML, CSS, and JavaScript for the user interface.
- Backend: Node.js with Express for HTTP routes and API endpoints.
- Database: SQLite for persistent storage of users, events, and registrations.
- Data models: User, Event, Registration, and linked authentication accounts.
- Layers: Routes handle HTTP requests, services contain business logic, and the data layer handles database operations.
- Authentication: Local email/password login and Google OAuth, with secure account linking.
- Authorization: Only organizers can manage events. Students can manage only their own registrations.
- MCP: Project MCP tools call the same service functions as the HTTP API.
- AI: The backend calls the Gemini API to suggest event descriptions. API keys are stored in enviroment variables.
- Error handling: Validate input, return appropriate HTTP errors, and provide a manual fallback when the AI service is unavailable.

## Acceptance criteria
- AC-1: The application starts successfully in GitHub Codespaces.
- AC-2: Users can register and log in with email/password.
- AC-3: Users can sign in with Google OAuth and securely link to an existing account.
- AC-4: Upcoming events are loaded from the SQLite database and displayed on the home page.
- AC-5: Organizers can create, edit, and delete events.
- AC-6: Logged-in students can register for events and cancel their registrations.
- AC-7: Users cannot register twice for the same event or exceed its capacity.
- AC-8: Students cannot access organizer-only operations.
- AC-9: The AI assistant generates editable event descriptions from titles and keywords.
- AC-10: If the AI service fails, organizers can still create events manually.
- AC-11: At least three MCP tools are available and use the same business rules as the HTTP API.
- AC-12: Invalid input produces clear errors without crashing the server.
- AC-13: The application includes automated tests for its main business rules.

### Slice 1: sign-in and events list screen
- AC-14: Users can register and sign in using email and password.
- AC-15: Users can sign in using Google OAuth.
- AC-16: Signed-in users can view upcoming events from the SQLite database.
- AC-17: Each event displays its title, date, location, and available capacity.
- AC-18: Event data is loaded through the backend API.
- AC-19: Unauthorized users cannot access protected account features.

### Slice 3: Event Registration
- AC-20: Logged-in students can successfully register for an upcoming event, returning status 201.
- AC-21: Attempting to register twice for the same event is rejected with status 409.
- AC-22: Attempting to register for a full capacity event is rejected with status 409.
- AC-23: Students can cancel their own event registrations resulting in HTTP 204, while another authenticated user attempting cancellation receives HTTP 403.
- AC-24: Unauthenticated users attempting to register or cancel receive status 401.
- AC-25: Attempting to register for or cancel a non-existent event or registration returns status 404.
- AC-26: The frontend displays loading, empty, and error states appropriately during event loading and registration actions.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 |  |
| AC-2 |  |
| AC-3 |  |
| AC-4 |  |
| AC-5 |  |
| AC-6 |  |
| AC-7 |  |
| AC-8 |  |
| AC-9 |  |
| AC-10 |  |
| AC-11 |  |
| AC-12 |  |
| AC-13 |  |
| AC-14 |  |
| AC-15 |  |
| AC-16 |  |
| AC-17 |  |
| AC-18 |  |
| AC-19 |  |
| AC-20 |  |
| AC-21 |  |
| AC-22 |  |
| AC-23 |  |
| AC-24 |  |
| AC-25 |  |
| AC-26 | test/frontend.test.js |

## Spec vs result

The planned Slice 1 covers email/password authentication, Google OAuth, and an upcoming events list backed by SQLite and a backend API (AC-14 to AC-19).

During the first Gemini CLI session, implementation was not completed because of cancelled requests, API errors, and model usage limits.

During the second Gemini CLI session, the backend foundation was implemented using Node.js, Express, and better-sqlite3. The SQLite schema includes users, events, and registrations. The GET /api/events endpoint returns upcoming events with calculated available capacity.

Verification: node test_backend.js returned three sample events with available_places values of 100, 30, and 50. The Exercise 2 structural checker passed 32/32 checks.

Current status: AC-16, AC-17, and AC-18 have initial backend-level evidence, but are not fully verified through a signed-in user interface. AC-14, AC-15, and AC-19 remain unimplemented. Slice 1 is not complete.

The second Gemini CLI session also ended because the model's daily quota was exhausted. The existing Exercise 1 MCP server was not modified.

Next steps: implement email/password authentication, Google OAuth, protected account features, and the frontend; strengthen automated tests and verify all acceptance criteria.
