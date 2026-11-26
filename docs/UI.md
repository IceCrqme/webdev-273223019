# UI checklist

<!-- Exercise 4 hands this in. Tick an item only when you have checked it, and replace
     the "how I checked" line with what you actually did. An unticked box is not a
     failure: it is a gap you then write into READINESS.md. A ticked box you cannot
     demonstrate at the defence is worse than an unticked one. -->

"Modern" is not a style. It is a short list of things a user notices when they are
missing: the screen tells you what is happening, you can get through it with a keyboard,
the text is readable, and nothing jumps around while it loads.

## Layout and typography

- [ ] **One spacing scale and one type scale.** Sizes come from a small set of design tokens, not from numbers typed where they were needed.
  - Manual verification required: inspect the computed spacing and type values across every page in browser developer tools; confirm a consistent scale.
- [x] **Responsive at 380, 768 and 1280 pixels wide.** No horizontal scrollbar, no text running under another element.
  - How I checked (user-reported): the user reports manually checking the responsive layouts in Chrome at 380, 768 and 1280 CSS pixels. No repository screenshot or measurement log was provided.
- [ ] **Nothing jumps while the page loads.** Images and cards reserve their space before their content arrives.
  - Manual verification required: cold-load the pages with throttled network and watch the layout before and after content arrives.

## The four states, on every screen

A screen that only handles "it worked" is a screen that lies to the user on the day it matters.

- [ ] **Loading.** Something tells the user the app is working, within about 100 ms.
  - Manual verification required: throttle the network and confirm each screen shows a useful loading message promptly.
- [ ] **Empty.** The screen says what this list is for and what to do next, instead of showing nothing.
  - Manual verification required: use an empty test database and review every list screen's empty message and next action.
- [ ] **Error.** A sentence a person can read. Never a raw JSON body, never a stack trace, never just "Error".
  - Manual verification required: force API failures in browser developer tools and inspect each screen's visible message.
- [ ] **Success.** The user can see that what they did took effect, without reloading the page to find out.
  - Manual verification required: complete each core action in a browser and confirm the result appears without a reload.

## Keyboard and accessibility

- [ ] **The main flow works with the keyboard alone.** Sign in, do the core action, sign out, without touching the mouse.
  - Manual verification required: use only Tab, Shift+Tab, Enter, Space, and arrow keys through sign-in, a core action, and sign-out.
- [ ] **The focused element is visible.** A `:focus-visible` outline that is not switched off.
  - Manual verification required: tab through every page and confirm the focused control is always clearly visible.
- [ ] **Text contrast is at least 4.5:1.** Name the tool you measured with.
  - Manual verification required: measure normal text with an accessibility contrast checker and record the tool and results.
- [ ] **Every input has a label** a screen reader reads, not just placeholder text.
  - Manual verification required: inspect every form with a screen reader and confirm each input's accessible name.
- [ ] **The page has a correct `<title>` and `lang`.**
  - Manual verification required: inspect every page's browser tab title and document language, then confirm with an accessibility-tree inspection.
- [ ] **Touch targets are at least 44 pixels.**
  - Manual verification required: measure interactive targets in browser developer tools at phone viewport sizes.

## The model feature

- [ ] **It shows that it is thinking.** A model call is slow and a free service may have been asleep; a frozen button is the worst possible answer.
  - Manual verification required: use a delayed mocked model response in a browser and confirm loading feedback and button state.
- [ ] **It shows when it failed,** and the rest of the screen still works.
  - Manual verification required: force timeout and provider-error responses in a browser; confirm a readable message and manual description entry still work.
- [ ] **The user can tell the model's suggestion from a fact.** It is labelled as a suggestion, not presented as data the app knows.
  - Manual verification required: generate a description and inspect the rendered label and editable field in a browser.

## Decisions

- [x] **Dark mode, or a written decision not to have one.**
  - Decision: keep one light theme for this course app; an alternate theme is outside the current scope. This is a written decision, not a claim of dark-mode support.

## Evidence

<!-- Screenshots of at least the four states of one screen, and of the model feature
     thinking and failing. A link to them is enough; they do not have to be in the repo. -->

### Assessment record · 2026-11-26

The first local probe used `DB_PATH=:memory:`; because the initializer and app are
separate processes, that did not share the initialized schema. It verified `/health`
and static pages only, not the event API or UI. Follow-up testing used the disposable
file `/tmp/club-events-ui-ex4-20261126/club_events.db`, initialized and seeded with the
project scripts. With `PORT=3100`, `/health` returned 200 and `/api/events` returned
three future events. `/`, `/login.html`, `/register.html`, `/my-events.html`, and
`/organizer.html` each returned 200 with `text/html` and a page title. These are HTTP
checks only, not rendered layout, state timing, or accessibility checks.

The user subsequently reported manual Chrome checks at 380, 768 and 1280 CSS pixels,
plus account registration, duplicate-email handling, event registration and
cancellation, and successful logout. The responsive-layout checklist item is ticked
based on that report. The interaction results are recorded here, but do not by
themselves verify the broader keyboard, accessibility, or four-states-on-every-screen
criteria below.

Screenshots shown in chat are conversation-only: they are not stored or linked in this
repository. No repository screenshot files or durable screenshot links were provided.
The chat images are not claimed as evidence for states or pages they do not show.
Earlier local HTTP checks, frontend tests, and API checks are not visual or keyboard
evidence. `node checks/ex4.mjs` was reported at 26/29 structural checks; there is still
no deployed URL in `course.json`. The dark-mode decision and the user-reported
responsive-layout item are the only checked UI items.

### UI checks still missing

The following checklist items remain unticked:

- **Visual stability/design tokens:** verify one spacing/type scale in developer tools
  and check for layout shifts on throttled cold loads.
- **Loading, empty, and error states:** verify useful loading feedback, meaningful empty
  lists, and readable errors on every applicable screen. Include `/api/events`,
  `/api/registrations`, auth, and organizer API failures.
- **Success state:** confirm each core action's visible result without reloading on every
  applicable screen. The reported registration, duplicate-email, event
  registration/cancellation, and logout flows do not establish this full criterion.
- **Keyboard flow and focus:** complete sign-in, a core action, and sign-out using only
  the keyboard; then tab through every page and confirm visible focus indicators.
- **Accessibility:** measure normal-text contrast with a named tool; inspect form input
  names with a screen reader; verify each page's title and `lang` in the accessibility
  tree; measure phone-sized touch targets against 44 by 44 CSS pixels.
- **Model UI:** with delayed mocked responses, verify thinking feedback, failure
  messaging/manual entry, and that suggestions are labelled as editable suggestions,
  not facts.
- **Persistent screenshot evidence:** capture and link genuine loading, empty, error,
  and success states for one screen and the model thinking/failure states. Record the
  browser, viewport, setup, and action. Chat-only images are not repository evidence.

Use a real browser, an isolated database, and test student/organizer accounts for these
remaining checks. The deployment notes still lack a verified organizer provisioning
procedure; arrange a safe test organizer account or provisioning steps before testing
the dashboard.
