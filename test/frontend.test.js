




const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const vm = require('node:vm');

function createNode(tagName = 'div') {
  return {
    tagName: tagName.toUpperCase(),
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: false,
    disabled: false,
    dataset: {},
    className: '',
    children: [],
    attributes: {},
    listeners: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = [...children];
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
  };
}

function createFakeDocument() {
  const status = createNode('div');
  status.setAttribute('aria-live', 'polite');

  const list = createNode('div');
  const document = {
    body: createNode('body'),
    createElement: createNode,
    querySelector(selector) {
      if (selector === '#events-status') return status;
      if (selector === '#events-list') return list;
      return null;
    },
  };

  return { document, status, list };
}

function createOrganizerDocument() {
  const status = createNode('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const list = createNode('ul');
  const form = createNode('form');
  const fields = {
    title: createNode('input'),
    keywords: createNode('input'),
    description: createNode('textarea'),
    date: createNode('input'),
    location: createNode('input'),
    capacity: createNode('input'),
  };
  const generateDescription = createNode('button');
  const cancelEdit = createNode('button');
  const elements = {
    '#organizer-status': status,
    '#organizer-events': list,
    '#event-form': form,
    '#event-title': fields.title,
    '#event-keywords': fields.keywords,
    '#event-description': fields.description,
    '#event-date': fields.date,
    '#event-location': fields.location,
    '#event-capacity': fields.capacity,
    '#generate-description': generateDescription,
    '#cancel-edit': cancelEdit,
  };

  return {
    document: {
      body: createNode('body'),
      createElement: createNode,
      querySelector(selector) {
        return elements[selector] || null;
      },
      addEventListener() {},
    },
    status,
    list,
    form,
    fields,
    generateDescription,
    cancelEdit,
  };
}

function createAuthDocument(mode) {
  const status = createNode('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  const sessionStatus = createNode('p');
  sessionStatus.setAttribute('role', 'status');
  sessionStatus.setAttribute('aria-live', 'polite');
  const form = createNode('form');
  form.dataset = { mode };
  const panel = createNode('section');
  panel.hidden = true;
  const googleLinkPanel = createNode('section');
  googleLinkPanel.hidden = true;
  const fields = {
    email: createNode('input'),
    password: createNode('input'),
  };
  const submit = createNode('button');
  const googleLink = createNode('button');
  const elements = {
    '#auth-status': status,
    '#auth-session-status': sessionStatus,
    '#auth-panel': panel,
    '#google-link-panel': googleLinkPanel,
    '#auth-form': form,
    '#auth-email': fields.email,
    '#auth-password': fields.password,
    '#auth-submit': submit,
    '#google-link': googleLink,
  };
  const documentListeners = {};

  return {
    document: {
      body: createNode('body'),
      createElement: createNode,
      querySelector(selector) {
        return elements[selector] || null;
      },
      addEventListener(type, listener) {
        documentListeners[type] = listener;
      },
    },
    documentListeners,
    status,
    sessionStatus,
    panel,
    googleLinkPanel,
    form,
    fields,
    submit,
    googleLink,
  };
}

function createNavigationDocument() {
  const guestLinks = [createNode('a'), createNode('a')];
  const user = createNode('span');
  user.hidden = true;
  const logout = createNode('button');
  logout.hidden = true;
  const status = createNode('span');
  const authPanel = createNode('section');
  authPanel.hidden = true;
  const googleLinkPanel = createNode('section');
  googleLinkPanel.hidden = true;
  const authSessionStatus = createNode('p');
  const documentListeners = {};
  const elements = {
    '#auth-nav-user': user,
    '#auth-nav-logout': logout,
    '#auth-nav-status': status,
    '#auth-panel': authPanel,
    '#auth-session-status': authSessionStatus,
    '#google-link-panel': googleLinkPanel,
  };

  return {
    document: {
      querySelector(selector) {
        return elements[selector] || null;
      },
      querySelectorAll(selector) {
        return selector === '[data-auth-guest]' ? guestLinks : [];
      },
      addEventListener(type, listener) {
        documentListeners[type] = listener;
      },
    },
    documentListeners,
    guestLinks,
    user,
    logout,
    status,
    authPanel,
    googleLinkPanel,
    authSessionStatus,
  };
}

function createMyEventsDocument() {
  const status = createNode('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const list = createNode('ul');
  const elements = {
    '#my-events-status': status,
    '#my-events-list': list,
  };
  const documentListeners = {};

  return {
    document: {
      body: createNode('body'),
      createElement: createNode,
      querySelector(selector) {
        return elements[selector] || null;
      },
      addEventListener(type, listener) {
        documentListeners[type] = listener;
      },
    },
    documentListeners,
    status,
    list,
  };
}

async function loadFrontend(fetchImpl) {
  const appPath = path.join(__dirname, '../public/app.js');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const fake = createFakeDocument();
  const context = vm.createContext({
    window: {},
    document: fake.document,
    fetch: fetchImpl,
    console,
  });

  vm.runInContext(appSource, context);
  return { ...fake, api: context.window.ClubEvents };
}

async function loadOrganizerFrontend(fetchImpl, confirmImpl = () => true) {
  const appPath = path.join(__dirname, '../public/organizer.js');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const fake = createOrganizerDocument();
  const context = vm.createContext({
    window: { confirm: confirmImpl },
    document: fake.document,
    fetch: fetchImpl,
    console,
    Date,
  });

  vm.runInContext(appSource, context);
  return { ...fake, api: context.window.OrganizerDashboard };
}

async function loadAuthFrontend(mode, fetchImpl, locationSearch = '', authNavigation) {
  const appPath = path.join(__dirname, '../public/auth.js');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const fake = createAuthDocument(mode);
  const context = vm.createContext({
    window: {
      location: { href: '', search: locationSearch },
      AuthNavigation: authNavigation,
    },
    document: fake.document,
    fetch: fetchImpl,
    console,
    URLSearchParams,
    URL,
  });

  vm.runInContext(appSource, context);
  return { ...fake, window: context.window };
}

async function loadNavigationFrontend(fetchImpl) {
  const appPath = path.join(__dirname, '../public/navigation.js');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const fake = createNavigationDocument();
  let reloadCount = 0;
  const window = {
    location: {
      reload() {
        reloadCount += 1;
      },
    },
  };
  const context = vm.createContext({
    window,
    document: fake.document,
    fetch: fetchImpl,
    console,
  });

  vm.runInContext(appSource, context);
  return {
    ...fake,
    api: context.window.AuthNavigation,
    get reloadCount() {
      return reloadCount;
    },
  };
}

async function loadMyEventsFrontend(fetchImpl, confirmImpl = () => true) {
  const appPath = path.join(__dirname, '../public/my-events.js');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const fake = createMyEventsDocument();
  const context = vm.createContext({
    window: { confirm: confirmImpl },
    document: fake.document,
    fetch: fetchImpl,
    console,
    Date,
  });

  vm.runInContext(appSource, context);
  return { ...fake, window: context.window };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function collectText(node) {
  return [
    node.textContent,
    ...node.children.map((child) => collectText(child)),
  ].filter(Boolean).join(' ');
}

describe('Exercise 3: AC-26 frontend event states', () => {
  let app;
  let db;
  let tmpDir;
  let originalDbPath;
  let originalSessionSecret;

  before(() => {
    originalDbPath = process.env.DB_PATH;
    originalSessionSecret = process.env.SESSION_SECRET;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-frontend-test-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.SESSION_SECRET = 'frontend-test-secret';

    require('../database/init');
    app = require('../src/app');
    db = require('../src/data/db');
  });

  after(() => {
    if (db) db.close();
    if (originalDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = originalDbPath;
    }
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC-26: serves the events frontend and its assets', async () => {
    const page = await request(app).get('/');
    assert.strictEqual(page.status, 200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.match(page.text, /Upcoming Club Events/);

    const script = await request(app).get('/app.js');
    assert.strictEqual(script.status, 200);
    assert.match(script.headers['content-type'], /javascript/);

    const styles = await request(app).get('/styles.css');
    assert.strictEqual(styles.status, 200);
    assert.match(styles.headers['content-type'], /text\/css/);
  });

  it('AC-26: loading state is visible while events are pending', async () => {
    let resolveFetch;
    const pending = new Promise((resolve) => { resolveFetch = resolve; });
    const { api, status } = await loadFrontend(() => pending);
    const loadPromise = api.loadEvents();

    assert.match(status.textContent, /Loading upcoming events/i);

    resolveFetch(jsonResponse(200, []));
    await loadPromise;
  });

  it('AC-26: empty state is rendered when no upcoming events exist', async () => {
    const { api, status, list } = await loadFrontend(async () => jsonResponse(200, []));
    await api.loadEvents();

    assert.match(status.textContent, /No upcoming events/i);
    assert.strictEqual(list.children.length, 0);
  });

  it('AC-26: event rendering and fetch error states are observable', async () => {
    const events = [{
      id: 7,
      title: 'Coding Workshop',
      description: 'Learn Node.js',
      date: '2030-12-05T14:00:00.000Z',
      location: 'Lab 101',
      capacity: 30,
      available_places: 12,
    }];
    const { api, status, list } = await loadFrontend(async (url) => {
      if (url === '/api/events') return jsonResponse(200, events);
      throw new Error('Unexpected request');
    });

    await api.loadEvents();
    assert.strictEqual(list.children.length, 1);
    assert.match(collectText(list.children[0]), /Coding Workshop/);

    const failing = await loadFrontend(async () => {
      throw new Error('network unavailable');
    });
    await failing.api.loadEvents();
    assert.match(failing.status.textContent, /Could not load events/i);
  });

  it('AC-4, AC-16, AC-17: signed-in student sees real upcoming event fields from SQLite', async () => {
    db.prepare('DELETE FROM registrations').run();
    db.prepare('DELETE FROM events').run();

    const student = request.agent(app);
    const signup = await student.post('/api/auth/register').send({
      email: `events-reader-${Date.now()}@example.com`,
      password: 'securePassword123',
    });
    assert.strictEqual(signup.status, 201);

    const profile = await student.get('/api/auth/me');
    assert.strictEqual(profile.status, 200);
    assert.strictEqual(profile.body.id, signup.body.id);

    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const insertEvent = db.prepare(
      'INSERT INTO events (title, description, date, location, capacity) VALUES (?, ?, ?, ?, ?)'
    );
    const eventId = insertEvent.run(
      'SQLite-backed Workshop',
      'A real event from the test database.',
      futureDate,
      'Engineering Lab',
      7
    ).lastInsertRowid;
    insertEvent.run(
      'Past Workshop',
      'This event should be filtered out.',
      '2020-01-01T10:00:00.000Z',
      'Old Hall',
      10
    );
    db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(
      signup.body.id,
      eventId
    );

    let requestedUrl;
    const { api, list } = await loadFrontend(async (url) => {
      requestedUrl = url;
      const response = await student.get(url);
      return jsonResponse(response.status, response.body);
    });
    await api.loadEvents();

    assert.strictEqual(requestedUrl, '/api/events');
    assert.strictEqual(list.children.length, 1);
    const card = list.children[0];
    assert.strictEqual(card.children[0].textContent, 'SQLite-backed Workshop');
    assert.strictEqual(
      card.children[1].textContent,
      `${new Date(futureDate).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} | Engineering Lab`
    );
    assert.strictEqual(card.children[3].textContent, '6 places available');
  });

  it('AC-26: register pending state disables the button and success is announced', async () => {
    let resolveFetch;
    const pending = new Promise((resolve) => { resolveFetch = resolve; });
    const { api, status, list } = await loadFrontend(async (url, options) => {
      if (url === '/api/events/7/register' && options?.method === 'POST') {
        return pending;
      }
      return jsonResponse(200, []);
    });

    const button = createNode('button');
    api.registerForEvent(7, button);
    assert.strictEqual(button.disabled, true);
    assert.match(button.textContent, /Registering/i);

    resolveFetch(jsonResponse(201, { id: 99 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(status.textContent, /registered successfully/i);
    assert.strictEqual(button.disabled, false);
  });

  it('AC-26: registration 401 and 409 responses show readable messages', async () => {
    const unauthorized = await loadFrontend(async () => jsonResponse(401, { error: 'Not authenticated' }));
    const unauthorizedButton = createNode('button');
    await unauthorized.api.registerForEvent(7, unauthorizedButton);
    assert.match(unauthorized.status.textContent, /log in/i);

    const conflict = await loadFrontend(async (url, options) => {
      if (options?.method === 'POST') return jsonResponse(409, { error: 'Already registered for this event' });
      throw new Error('Unexpected request');
    });
    const conflictButton = createNode('button');
    await conflict.api.registerForEvent(7, conflictButton);
    assert.match(conflict.status.textContent, /already registered/i);
  });

  it('AC-26: event cards preserve semantic elements instead of replacing them with text', async () => {
    const event = [{
      id: 7,
      title: 'Coding Workshop',
      description: 'Learn Node.js',
      date: '2030-12-05T14:00:00.000Z',
      location: 'Lab 101',
      capacity: 30,
      available_places: 12,
    }];
    const { api, list } = await loadFrontend(async () => jsonResponse(200, event));

    await api.loadEvents();
    const card = list.children[0];
    assert.strictEqual(card.children.filter((child) => child.tagName === 'H2').length, 1);
    assert.strictEqual(card.children.filter((child) => child.tagName === 'P').length, 3);
    assert.strictEqual(card.children.filter((child) => child.tagName === 'BUTTON').length, 1);
  });

  it('AC-26: 409 full and duplicate outcomes leave buttons in server-consistent states', async () => {
    const full = await loadFrontend(async () => jsonResponse(409, { error: 'Event is full' }));
    const fullButton = createNode('button');
    await full.api.registerForEvent(7, fullButton);
    assert.strictEqual(fullButton.disabled, true);
    assert.match(fullButton.textContent, /full/i);

    const duplicate = await loadFrontend(async () => jsonResponse(409, { error: 'Already registered for this event' }));
    const duplicateButton = createNode('button');
    await duplicate.api.registerForEvent(7, duplicateButton);
    assert.strictEqual(duplicateButton.disabled, false);
    assert.match(duplicateButton.textContent, /register/i);
  });

  it('AC-26: event-loading failure provides a working retry and clears stale cards', async () => {
    let eventRequests = 0;
    const { api, status, list } = await loadFrontend(async () => {
      eventRequests += 1;
      if (eventRequests === 1) {
        throw new Error('network unavailable');
      }
      return jsonResponse(200, []);
    });

    await api.loadEvents();
    assert.strictEqual(list.children.length, 0);
    assert.match(status.textContent, /Could not load events/i);
    assert.strictEqual(status.children.length, 1);
    assert.strictEqual(status.children[0].tagName, 'BUTTON');

    status.children[0].listeners.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.strictEqual(eventRequests, 2);
    assert.match(status.textContent, /No upcoming events/i);
  });

  it('AC-26: refresh failure after registration is reported separately and clears stale cards', async () => {
    let eventRequests = 0;
    const staleEvent = [{
      id: 7,
      title: 'Stale Event',
      description: 'Old data',
      date: '2030-12-05T14:00:00.000Z',
      location: 'Lab 101',
      capacity: 30,
      available_places: 12,
    }];
    const { api, status, list } = await loadFrontend(async (url, options) => {
      if (url === '/api/events' && !options) {
        eventRequests += 1;
        return jsonResponse(200, staleEvent);
      }
      if (url === '/api/events/7/register') {
        return jsonResponse(201, { id: 99 });
      }
      throw new Error('refresh failed');
    });

    await api.loadEvents();
    assert.strictEqual(list.children.length, 1);

    // Force the next event request to fail, representing a failed post-registration refresh.
    const refreshFailure = await loadFrontend(async (url, options) => {
      if (url === '/api/events/7/register') return jsonResponse(201, { id: 99 });
      throw new Error('refresh failed');
    });
    const staleButton = createNode('button');
    await refreshFailure.api.registerForEvent(7, staleButton);

    assert.strictEqual(refreshFailure.list.children.length, 0);
    assert.match(refreshFailure.status.textContent, /registered successfully/i);
    assert.match(refreshFailure.status.textContent, /could not refresh/i);
  });

  it('AC-18, AC-26: frontend calls the existing event and registration APIs', () => {
    const appSource = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

    assert.match(appSource, /\/api\/events/);
    assert.match(appSource, /\/api\/events\/\$\{eventId\}\/register/);
  });
});

describe('AC-5, AC-8: Organizer dashboard frontend', () => {
  let app;
  let tmpDir;
  let originalDbPath;
  let originalSessionSecret;

  before(() => {
    originalDbPath = process.env.DB_PATH;
    originalSessionSecret = process.env.SESSION_SECRET;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-organizer-ui-test-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.SESSION_SECRET = 'organizer-ui-test-secret';
    require('../database/init');
    app = require('../src/app');
  });

  after(() => {
    const db = require('../src/data/db');
    if (db) db.close();
    if (originalDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = originalDbPath;
    }
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const event = {
    id: 12,
    title: 'Accessible Workshop',
    description: 'Build something together.',
    date: '2031-04-05T18:30:00.000Z',
    location: 'Community Hall',
    capacity: 24,
    available_places: 17,
    organizer_id: 8,
  };

  function authResponses(events = [event]) {
    return async (url, options) => {
      if (url === '/api/auth/me') {
        return jsonResponse(200, { id: 8, role: 'organizer' });
      }
      if (url === '/api/organizer/csrf-token') {
        return jsonResponse(200, { csrfToken: 'session-token-123' });
      }
      if (url === '/api/organizer/events' && !options?.method) {
        return jsonResponse(200, events);
      }
      throw new Error(`Unexpected request: ${url}`);
    };
  }

  it('serves the organizer page and its script', async () => {
    const page = await request(app).get('/organizer.html');
    assert.strictEqual(page.status, 200);
    assert.match(page.text, /Organizer Dashboard/);
    assert.match(page.text, /aria-live="polite"/);
    assert.match(page.text, /id="event-keywords"/);
    assert.match(page.text, /Generate with AI/);

    const script = await request(app).get('/organizer.js');
    assert.strictEqual(script.status, 200);
    assert.match(script.headers['content-type'], /javascript/);
  });

  it('AC-9: generates an editable description with same-origin session and CSRF credentials', async () => {
    const calls = [];
    const { api, fields, generateDescription, status } = await loadOrganizerFrontend(async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/auth/me') return jsonResponse(200, { id: 8, role: 'organizer' });
      if (url === '/api/organizer/csrf-token') return jsonResponse(200, { csrfToken: 'session-token-123' });
      if (url === '/api/organizer/events' && !options?.method) return jsonResponse(200, []);
      if (url === '/api/organizer/event-description' && options.method === 'POST') {
        return jsonResponse(200, {
          description: 'Join us for a day in the garden.',
          fallback: false,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await api.initialize();
    fields.title.value = 'Community Garden Day';
    fields.keywords.value = 'gardening, volunteers';
    await generateDescription.listeners.click();

    const generation = calls.find((call) => call.url === '/api/organizer/event-description');
    assert.strictEqual(generation.options.credentials, 'same-origin');
    assert.strictEqual(generation.options.headers['X-CSRF-Token'], 'session-token-123');
    assert.deepStrictEqual(JSON.parse(generation.options.body), {
      title: 'Community Garden Day',
      keywords: ['gardening', 'volunteers'],
    });
    assert.strictEqual(fields.description.value, 'Join us for a day in the garden.');
    assert.match(status.textContent, /description generated/i);
    assert.strictEqual(fields.description.disabled, false);
  });

  it('AC-9: announces generation loading and restores the button after completion', async () => {
    let resolveSuggestion;
    const pendingSuggestion = new Promise((resolve) => { resolveSuggestion = resolve; });
    const { api, fields, generateDescription, status } = await loadOrganizerFrontend((url, options) => {
      if (url === '/api/auth/me') return Promise.resolve(jsonResponse(200, { id: 8, role: 'organizer' }));
      if (url === '/api/organizer/csrf-token') return Promise.resolve(jsonResponse(200, { csrfToken: 'session-token-123' }));
      if (url === '/api/organizer/events' && !options?.method) return Promise.resolve(jsonResponse(200, []));
      if (url === '/api/organizer/event-description' && options.method === 'POST') return pendingSuggestion;
      throw new Error(`Unexpected request: ${url}`);
    });

    await api.initialize();
    fields.title.value = 'Community Garden Day';
    const generation = generateDescription.listeners.click();
    assert.match(status.textContent, /generating/i);
    assert.strictEqual(status.attributes['data-state'], 'loading');
    assert.strictEqual(generateDescription.disabled, true);

    resolveSuggestion(jsonResponse(200, { description: 'A generated description.', fallback: false }));
    await generation;
    assert.strictEqual(generateDescription.disabled, false);
  });

  it('AC-10: keeps manual description entry available when generation uses a fallback', async () => {
    const { api, fields, generateDescription, status } = await loadOrganizerFrontend(async (url, options) => {
      if (url === '/api/auth/me') return jsonResponse(200, { id: 8, role: 'organizer' });
      if (url === '/api/organizer/csrf-token') return jsonResponse(200, { csrfToken: 'session-token-123' });
      if (url === '/api/organizer/events' && !options?.method) return jsonResponse(200, []);
      if (url === '/api/organizer/event-description' && options.method === 'POST') {
        return jsonResponse(200, {
          description: 'Join us for Community Garden Day. Topics include gardening.',
          fallback: true,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await api.initialize();
    fields.title.value = 'Community Garden Day';
    fields.keywords.value = 'gardening';
    await generateDescription.listeners.click();

    assert.match(fields.description.value, /Topics include gardening/);
    assert.strictEqual(fields.description.disabled, false);
    assert.match(status.textContent, /AI.*unavailable|manual/i);
    assert.strictEqual(status.attributes['aria-live'], 'polite');
  });

  it('AC-10: reports generation errors without disabling manual entry', async () => {
    const { api, fields, generateDescription, status } = await loadOrganizerFrontend(async (url, options) => {
      if (url === '/api/auth/me') return jsonResponse(200, { id: 8, role: 'organizer' });
      if (url === '/api/organizer/csrf-token') return jsonResponse(200, { csrfToken: 'session-token-123' });
      if (url === '/api/organizer/events' && !options?.method) return jsonResponse(200, []);
      if (url === '/api/organizer/event-description' && options.method === 'POST') {
        return jsonResponse(500, { error: 'Could not generate an event description' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await api.initialize();
    fields.title.value = 'Community Garden Day';
    fields.description.value = 'I can still write this manually.';
    await generateDescription.listeners.click();

    assert.match(status.textContent, /could not generate/i);
    assert.strictEqual(status.attributes['data-state'], 'error');
    assert.strictEqual(fields.description.value, 'I can still write this manually.');
    assert.strictEqual(fields.description.disabled, false);
    assert.strictEqual(generateDescription.disabled, false);
  });

  it('does not replace an existing description unless the organizer confirms', async () => {
    const { api, fields, generateDescription } = await loadOrganizerFrontend(async (url, options) => {
      if (url === '/api/auth/me') return jsonResponse(200, { id: 8, role: 'organizer' });
      if (url === '/api/organizer/csrf-token') return jsonResponse(200, { csrfToken: 'session-token-123' });
      if (url === '/api/organizer/events' && !options?.method) return jsonResponse(200, []);
      if (url === '/api/organizer/event-description' && options.method === 'POST') {
        return jsonResponse(200, { description: 'Generated suggestion.', fallback: false });
      }
      throw new Error(`Unexpected request: ${url}`);
    }, () => false);

    await api.initialize();
    fields.title.value = 'Community Garden Day';
    fields.description.value = 'Organizer-written description.';
    await generateDescription.listeners.click();

    assert.strictEqual(fields.description.value, 'Organizer-written description.');
  });

  it('verifies organizer role and renders a labeled event management list', async () => {
    const calls = [];
    const { api, list, status } = await loadOrganizerFrontend(async (url, options) => {
      calls.push({ url, options });
      return authResponses() (url, options);
    });

    await api.initialize();

    assert.deepEqual(calls.map((call) => call.url), [
      '/api/auth/me',
      '/api/organizer/csrf-token',
      '/api/organizer/events',
    ]);
    assert.ok(calls.every((call) => call.options.credentials === 'same-origin'));
    assert.strictEqual(list.children.length, 1);
    assert.match(collectText(list.children[0]), /Accessible Workshop/);
    assert.match(collectText(list.children[0]), /17 places available/);
    assert.strictEqual(status.attributes.role, 'status');
    assert.strictEqual(status.attributes['aria-live'], 'polite');
  });

  it('shows edit and delete controls only for events owned by the current organizer', async () => {
    const events = [
      event,
      { ...event, id: 13, title: 'Another organizer event', organizer_id: 9 },
      { ...event, id: 14, title: 'Legacy event', organizer_id: null },
    ];
    const { api, list } = await loadOrganizerFrontend(async (url, options) => {
      if (url === '/api/auth/me') return jsonResponse(200, { id: 8, role: 'organizer' });
      if (url === '/api/organizer/csrf-token') return jsonResponse(200, { csrfToken: 'session-token-123' });
      if (url === '/api/organizer/events' && !options?.method) return jsonResponse(200, events);
      throw new Error(`Unexpected request: ${url}`);
    });

    await api.initialize();
    assert.strictEqual(list.children.length, 3);

    const ownActions = list.children[0].children.find(
      (node) => node.className === 'organizer-event-actions'
    );
    assert.ok(ownActions);

    for (const readOnlyEvent of list.children.slice(1)) {
      assert.strictEqual(
        readOnlyEvent.children.some((node) => node.className === 'organizer-event-actions'),
        false
      );
      assert.match(collectText(readOnlyEvent), /read.only/i);
    }
  });

  it('shows loading and empty states for the organizer list', async () => {
    let resolveList;
    let markListStarted;
    const pendingList = new Promise((resolve) => { resolveList = resolve; });
    const listStarted = new Promise((resolve) => { markListStarted = resolve; });
    const { api, status, list } = await loadOrganizerFrontend((url, options) => {
      if (url === '/api/auth/me') return Promise.resolve(jsonResponse(200, { id: 8, role: 'organizer' }));
      if (url === '/api/organizer/csrf-token') return Promise.resolve(jsonResponse(200, { csrfToken: 'session-token-123' }));
      if (url === '/api/organizer/events' && !options?.method) {
        markListStarted();
        return pendingList;
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const loading = api.initialize();
    await listStarted;
    assert.match(status.textContent, /Loading/i);
    resolveList(jsonResponse(200, []));
    await loading;
    assert.match(status.textContent, /No events/i);
    assert.strictEqual(list.children.length, 0);
  });

  it('blocks anonymous users and students before loading the organizer token or list', async () => {
    const anonymousCalls = [];
    const anonymous = await loadOrganizerFrontend(async (url) => {
      anonymousCalls.push(url);
      return jsonResponse(401, { error: 'Not authenticated' });
    });
    await anonymous.api.initialize();
    assert.match(anonymous.status.textContent, /log in/i);
    assert.deepEqual(anonymousCalls, ['/api/auth/me']);

    const studentCalls = [];
    const student = await loadOrganizerFrontend(async (url) => {
      studentCalls.push(url);
      return jsonResponse(200, { id: 9, role: 'student' });
    });
    await student.api.initialize();
    assert.match(student.status.textContent, /organizer/i);
    assert.deepEqual(studentCalls, ['/api/auth/me']);
  });

  it('creates events with same-origin credentials and the session CSRF header', async () => {
    const calls = [];
    const createdEvent = { ...event, id: 13, title: 'New Workshop' };
    const { api, form, fields, status } = await loadOrganizerFrontend(async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/auth/me') return jsonResponse(200, { id: 8, role: 'organizer' });
      if (url === '/api/organizer/csrf-token') return jsonResponse(200, { csrfToken: 'session-token-123' });
      if (url === '/api/organizer/events' && !options?.method) return jsonResponse(200, []);
      if (url === '/api/organizer/events' && options.method === 'POST') {
        return jsonResponse(201, createdEvent);
      }
      if (url === '/api/organizer/events' && !options.method) return jsonResponse(200, [createdEvent]);
      throw new Error(`Unexpected request: ${url}`);
    });

    await api.initialize();
    fields.title.value = 'New Workshop';
    fields.description.value = 'A new event description.';
    fields.date.value = '2031-04-05T18:30';
    fields.location.value = 'Community Hall';
    fields.capacity.value = '24';
    const submittedDate = new Date(fields.date.value).toISOString();
    await form.listeners.submit({ preventDefault() {} });

    const createCall = calls.find((call) => call.options?.method === 'POST');
    assert.strictEqual(createCall.options.credentials, 'same-origin');
    assert.strictEqual(createCall.options.headers['X-CSRF-Token'], 'session-token-123');
    assert.deepEqual(JSON.parse(createCall.options.body), {
      title: 'New Workshop',
      description: 'A new event description.',
      date: submittedDate,
      location: 'Community Hall',
      capacity: 24,
    });
    assert.match(status.textContent, /created/i);
  });

  it('reports a successful save when the following event-list refresh fails', async () => {
    let listRequests = 0;
    const { api, form, fields, status } = await loadOrganizerFrontend(async (url, options) => {
      if (url === '/api/auth/me') return jsonResponse(200, { id: 8, role: 'organizer' });
      if (url === '/api/organizer/csrf-token') return jsonResponse(200, { csrfToken: 'session-token-123' });
      if (url === '/api/organizer/events' && !options?.method) {
        listRequests += 1;
        return listRequests === 1
          ? jsonResponse(200, [])
          : jsonResponse(500, { error: 'Internal server error' });
      }
      if (url === '/api/organizer/events' && options.method === 'POST') {
        return jsonResponse(201, event);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await api.initialize();
    fields.title.value = 'Saved Workshop';
    fields.description.value = 'A saved description.';
    fields.date.value = '2031-04-05T18:30';
    fields.location.value = 'Community Hall';
    fields.capacity.value = '24';
    await form.listeners.submit({ preventDefault() {} });

    assert.match(status.textContent, /created successfully/i);
    assert.match(status.textContent, /could not refresh/i);
  });

  it('edits an event using PUT and forwards the CSRF token', async () => {
    const calls = [];
    const { api, list, form, fields, status } = await loadOrganizerFrontend(async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/auth/me') return jsonResponse(200, { id: 8, role: 'organizer' });
      if (url === '/api/organizer/csrf-token') return jsonResponse(200, { csrfToken: 'session-token-123' });
      if (url === '/api/organizer/events' && !options?.method) return jsonResponse(200, [event]);
      if (url === `/api/organizer/events/${event.id}` && options.method === 'PUT') {
        return jsonResponse(200, { ...event, title: 'Edited title' });
      }
      if (url === '/api/organizer/events' && !options.method) {
        return jsonResponse(200, [{ ...event, title: 'Edited title' }]);
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await api.initialize();
    assert.strictEqual(list.children.length, 1, status.textContent);
    const actions = list.children[0].children.find(
      (node) => node.className === 'organizer-event-actions'
    );
    const editButton = actions.children.find((node) => node.textContent === 'Edit');
    await editButton.listeners.click();
    assert.strictEqual(fields.title.value, event.title);
    fields.title.value = 'Edited title';
    await form.listeners.submit({ preventDefault() {} });

    const updateCall = calls.find((call) => call.options?.method === 'PUT');
    assert.strictEqual(updateCall.options.credentials, 'same-origin');
    assert.strictEqual(updateCall.options.headers['X-CSRF-Token'], 'session-token-123');
    assert.match(updateCall.url, new RegExp(`/organizer/events/${event.id}$`));
  });

  it('asks before deletion and sends an authorized DELETE with CSRF protection', async () => {
    const calls = [];
    const decisions = [false, true];
    const { api, list, status } = await loadOrganizerFrontend(
      async (url, options) => {
        calls.push({ url, options });
        if (url === '/api/auth/me') return jsonResponse(200, { id: 8, role: 'organizer' });
        if (url === '/api/organizer/csrf-token') return jsonResponse(200, { csrfToken: 'session-token-123' });
        if (url === '/api/organizer/events' && !options?.method) return jsonResponse(200, [event]);
        if (url === `/api/organizer/events/${event.id}` && options.method === 'DELETE') {
          return jsonResponse(204, null);
        }
        if (url === '/api/organizer/events' && !options.method) return jsonResponse(200, []);
        throw new Error(`Unexpected request: ${url}`);
      },
      () => decisions.shift()
    );

    await api.initialize();
    assert.strictEqual(list.children.length, 1, status.textContent);
    const actions = list.children[0].children.find(
      (node) => node.className === 'organizer-event-actions'
    );
    const deleteButton = actions.children.find((node) => node.textContent === 'Delete');
    await deleteButton.listeners.click();
    assert.strictEqual(calls.some((call) => call.options?.method === 'DELETE'), false);

    await deleteButton.listeners.click();
    const deleteCall = calls.find((call) => call.options?.method === 'DELETE');
    assert.strictEqual(deleteCall.options.credentials, 'same-origin');
    assert.strictEqual(deleteCall.options.headers['X-CSRF-Token'], 'session-token-123');
    assert.match(status.textContent, /deleted/i);
  });

  it('shows validation, authorization, and conflict feedback accessibly', async () => {
    const invalid = await loadOrganizerFrontend(authResponses([]));
    await invalid.api.initialize();
    await invalid.form.listeners.submit({ preventDefault() {} });
    assert.match(invalid.status.textContent, /required|valid/i);
    assert.strictEqual(invalid.status.attributes['aria-live'], 'polite');

    for (const [statusCode, expectedMessage] of [
      [401, /log in|session/i],
      [403, /permission|forbidden/i],
      [409, /conflict|registration/i],
    ]) {
      const { api, form, fields, status } = await loadOrganizerFrontend(async (url, options) => {
        if (url === '/api/auth/me') return jsonResponse(200, { id: 8, role: 'organizer' });
        if (url === '/api/organizer/csrf-token') return jsonResponse(200, { csrfToken: 'session-token-123' });
        if (url === '/api/organizer/events' && !options?.method) return jsonResponse(200, []);
        if (options?.method === 'POST') return jsonResponse(statusCode, { error: 'Event conflicts with existing registrations' });
        throw new Error(`Unexpected request: ${url}`);
      });
      await api.initialize();
      fields.title.value = 'Valid Event';
      fields.description.value = 'Description';
      fields.date.value = '2031-04-05T18:30';
      fields.location.value = 'Community Hall';
      fields.capacity.value = '10';
      await form.listeners.submit({ preventDefault() {} });
      assert.match(status.textContent, expectedMessage);
    }
  });
});

describe('AC-2, AC-14: email and password authentication frontend', () => {
  let app;

  before(() => {
    app = require('../src/app');
  });

  it('serves accessible login and registration pages with navigation and no role selector', async () => {
    const login = await request(app).get('/login.html');
    const register = await request(app).get('/register.html');
    const script = await request(app).get('/auth.js');

    assert.strictEqual(login.status, 200);
    assert.match(login.text, /<h1[^>]*>Log in<\/h1>/i);
    assert.match(login.text, /href="\/register\.html"/);
    assert.match(login.text, /href="\/"/);
    assert.match(login.text, /href="\/organizer\.html"/);
    assert.match(login.text, /aria-live="polite"/);
    assert.match(login.text, /id="auth-panel"[^>]+hidden/);
    assert.match(login.text, /id="google-sign-in"[^>]+href="\/api\/auth\/google"/);
    assert.match(login.text, /id="google-link"[^>]+type="button"/);
    assert.strictEqual(register.status, 200);
    assert.match(register.text, /<h1[^>]*>Create an account<\/h1>/i);
    assert.match(register.text, /href="\/login\.html"/);
    assert.match(register.text, /href="\/"/);
    assert.match(register.text, /href="\/organizer\.html"/);
    assert.match(register.text, /id="auth-panel"[^>]+hidden/);
    assert.doesNotMatch(register.text, /name=["']role["']/i);
    assert.strictEqual(script.status, 200);
    assert.match(script.headers['content-type'], /javascript/);
  });

  it('loads the shared authentication navigation on every screen', async () => {
    for (const page of [
      '/',
      '/login.html',
      '/register.html',
      '/my-events.html',
      '/organizer.html',
    ]) {
      const response = await request(app).get(page);
      assert.strictEqual(response.status, 200, page);
      assert.match(response.text, /<script src="\/navigation\.js"><\/script>/, page);
      assert.match(response.text, /id="auth-nav-logout"[^>]+type="button"[^>]+hidden/, page);
    }

    const navigationScript = await request(app).get('/navigation.js');
    assert.strictEqual(navigationScript.status, 200);
    assert.match(navigationScript.headers['content-type'], /javascript/);
  });

  it('gives every shared navigation link a 44px target and preserves wrapping and focus styles', async () => {
    for (const page of [
      '/',
      '/login.html',
      '/register.html',
      '/my-events.html',
      '/organizer.html',
    ]) {
      const response = await request(app).get(page);
      assert.strictEqual(response.status, 200, page);
      assert.match(response.text, /<nav class="site-nav"/, page);
      assert.match(response.text, /<link rel="stylesheet" href="\/styles\.css">/, page);
    }

    const styles = await request(app).get('/styles.css');
    assert.strictEqual(styles.status, 200);
    const navigationRule = styles.text.match(/\.site-nav\s*\{([^}]+)\}/)?.[1] ?? '';
    const linkRule = styles.text.match(/\.site-nav a\s*\{([^}]+)\}/)?.[1] ?? '';
    assert.match(navigationRule, /flex-wrap:\s*wrap/);
    assert.match(linkRule, /display:\s*inline-flex/);
    assert.match(linkRule, /min-width:\s*44px/);
    assert.match(linkRule, /min-height:\s*44px/);
    assert.match(linkRule, /align-items:\s*center/);
    assert.match(styles.text, /\.site-nav a:focus-visible/);
    assert.match(styles.text, /outline:\s*3px solid/);
  });

  it('shows guest links and the login form only after the server confirms the session is anonymous', async () => {
    const page = await loadNavigationFrontend(async (url, options) => {
      assert.strictEqual(url, '/api/auth/me');
      assert.strictEqual(options.credentials, 'same-origin');
      return jsonResponse(401, { error: 'Not authenticated' });
    });

    await page.documentListeners.DOMContentLoaded();

    assert.ok(page.guestLinks.every((link) => !link.hidden));
    assert.strictEqual(page.logout.hidden, true);
    assert.strictEqual(page.authPanel.hidden, false);
    assert.strictEqual(page.googleLinkPanel.hidden, true);
    assert.strictEqual(page.authSessionStatus.hidden, true);
  });

  it('hides guest links and auth forms for signed-in users and logs out with the session CSRF token', async () => {
    const calls = [];
    const page = await loadNavigationFrontend(async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/auth/me') {
        return jsonResponse(200, {
          id: 8,
          email: 'signed-in@example.com',
          role: 'student',
        });
      }
      if (url === '/api/auth/csrf-token') {
        return jsonResponse(200, { csrfToken: 'session-csrf-token' });
      }
      if (url === '/api/auth/logout') return jsonResponse(200, { message: 'Logged out successfully' });
      throw new Error(`Unexpected request: ${url}`);
    });

    await page.documentListeners.DOMContentLoaded();

    assert.ok(page.guestLinks.every((link) => link.hidden));
    assert.strictEqual(page.user.textContent, 'Signed in as signed-in@example.com');
    assert.strictEqual(page.user.hidden, false);
    assert.strictEqual(page.logout.hidden, false);
    assert.strictEqual(page.authPanel.hidden, true);
    assert.strictEqual(page.googleLinkPanel.hidden, false);
    assert.match(page.authSessionStatus.textContent, /already signed in as signed-in@example.com/i);

    await page.logout.listeners.click();

    assert.deepStrictEqual(calls.map((call) => call.url), [
      '/api/auth/me',
      '/api/auth/csrf-token',
      '/api/auth/logout',
    ]);
    assert.strictEqual(calls[2].options.method, 'POST');
    assert.strictEqual(calls[2].options.credentials, 'same-origin');
    assert.strictEqual(calls[2].options.headers['X-CSRF-Token'], 'session-csrf-token');
    assert.strictEqual(page.reloadCount, 1);
  });

  it('keeps auth forms hidden when the current session cannot be verified', async () => {
    const page = await loadNavigationFrontend(async () => {
      throw new Error('network unavailable');
    });

    await page.documentListeners.DOMContentLoaded();

    assert.strictEqual(page.authPanel.hidden, true);
    assert.strictEqual(page.googleLinkPanel.hidden, true);
    assert.match(page.authSessionStatus.textContent, /could not verify sign-in status/i);
    assert.strictEqual(page.logout.hidden, true);
  });

  it('validates login input before sending a request', async () => {
    let calls = 0;
    const page = await loadAuthFrontend('login', async () => {
      calls += 1;
      return jsonResponse(200, {});
    });
    page.documentListeners.DOMContentLoaded();

    await page.form.listeners.submit({ preventDefault() {} });

    assert.strictEqual(calls, 0);
    assert.match(page.status.textContent, /valid email.*password/i);
    assert.strictEqual(page.status.attributes['aria-live'], 'polite');
  });

  it('logs in with same-origin credentials, checks /me, and routes by server role', async () => {
    for (const [role, destination] of [
      ['student', '/'],
      ['organizer', '/organizer.html'],
    ]) {
      const calls = [];
      const page = await loadAuthFrontend('login', async (url, options) => {
        calls.push({ url, options });
        if (url === '/api/auth/login') {
          return jsonResponse(200, { id: 8, role: 'forged-client-role' });
        }
        if (url === '/api/auth/me') {
          return jsonResponse(200, { id: 8, role });
        }
        throw new Error(`Unexpected request: ${url}`);
      });
      page.documentListeners.DOMContentLoaded();
      page.fields.email.value = 'user@example.com';
      page.fields.password.value = 'securePassword123';
      await page.form.listeners.submit({ preventDefault() {} });

      assert.deepStrictEqual(calls.map((call) => call.url), [
        '/api/auth/login',
        '/api/auth/me',
      ]);
      assert.ok(calls.every((call) => call.options.credentials === 'same-origin'));
      assert.deepStrictEqual(JSON.parse(calls[0].options.body), {
        email: 'user@example.com',
        password: 'securePassword123',
      });
      assert.strictEqual(page.window.location.href, destination);
      assert.match(page.status.textContent, /signed in/i);
      assert.strictEqual(page.fields.password.value, '');
    }
  });

  it('validates registration and creates a student account without sending a role', async () => {
    const calls = [];
    let navigationRefreshes = 0;
    const page = await loadAuthFrontend('register', async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(201, { id: 9, role: 'student' });
    }, '', {
      async refresh() {
        navigationRefreshes += 1;
      },
    });
    page.documentListeners.DOMContentLoaded();

    await page.form.listeners.submit({ preventDefault() {} });
    assert.strictEqual(calls.length, 0);
    assert.match(page.status.textContent, /valid email.*password/i);

    page.fields.email.value = 'new-user@example.com';
    page.fields.password.value = 'short';
    await page.form.listeners.submit({ preventDefault() {} });
    assert.strictEqual(calls.length, 0);
    assert.match(page.status.textContent, /at least 8 characters/i);

    page.fields.password.value = 'newPassword123';
    await page.form.listeners.submit({ preventDefault() {} });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, '/api/auth/register');
    assert.strictEqual(calls[0].options.credentials, 'same-origin');
    assert.deepStrictEqual(JSON.parse(calls[0].options.body), {
      email: 'new-user@example.com',
      password: 'newPassword123',
    });
    assert.match(page.status.textContent, /account created/i);
    assert.strictEqual(page.fields.password.value, '');
    assert.strictEqual(navigationRefreshes, 1);
    assert.strictEqual(page.window.location.href, '');
  });

  it('shows loading and authentication errors accessibly', async () => {
    let resolveLogin;
    const pendingLogin = new Promise((resolve) => { resolveLogin = resolve; });
    const page = await loadAuthFrontend('login', () => pendingLogin);
    page.documentListeners.DOMContentLoaded();
    page.fields.email.value = 'user@example.com';
    page.fields.password.value = 'securePassword123';

    const submission = page.form.listeners.submit({ preventDefault() {} });
    assert.match(page.status.textContent, /signing in/i);
    assert.strictEqual(page.submit.disabled, true);
    resolveLogin(jsonResponse(401, { error: 'Invalid email or password' }));
    await submission;

    assert.match(page.status.textContent, /invalid email or password/i);
    assert.strictEqual(page.status.attributes['aria-live'], 'polite');
    assert.strictEqual(page.submit.disabled, false);
  });

  it('AC-3, AC-15: explains Google sign-in and linking outcomes accessibly', async () => {
    for (const [result, message] of [
      ['unavailable', /not configured/i],
      ['denied', /cancelled/i],
      ['invalid_state', /could not be verified/i],
      ['conflict', /existing account/i],
      ['link_conflict', /already linked/i],
      ['link_requires_login', /sign in.*before linking/i],
      ['linked', /linked securely/i],
    ]) {
      const page = await loadAuthFrontend('login', async () => jsonResponse(200, {}), `?google=${result}`);
      page.documentListeners.DOMContentLoaded();
      assert.match(page.status.textContent, message);
      assert.strictEqual(page.status.attributes['aria-live'], 'polite');
    }
  });

  it('AC-3: starts account linking only with same-origin credentials and a session CSRF token', async () => {
    const calls = [];
    const page = await loadAuthFrontend('login', async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/auth/google/link/csrf-token') {
        return jsonResponse(200, { csrfToken: 'session-csrf-token' });
      }
      if (url === '/api/auth/google/link' && options.method === 'POST') {
        return jsonResponse(200, {
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=secure',
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    page.documentListeners.DOMContentLoaded();

    await page.googleLink.listeners.click();

    assert.deepStrictEqual(calls.map((call) => call.url), [
      '/api/auth/google/link/csrf-token',
      '/api/auth/google/link',
    ]);
    assert.ok(calls.every((call) => call.options.credentials === 'same-origin'));
    assert.strictEqual(calls[1].options.headers['X-CSRF-Token'], 'session-csrf-token');
    assert.strictEqual(page.window.location.href, 'https://accounts.google.com/o/oauth2/v2/auth?state=secure');
  });
});

describe('AC-6, AC-19: student My Events frontend', () => {
  let app;

  before(() => {
    app = require('../src/app');
  });

  const registration = {
    registration_id: 31,
    event_id: 12,
    title: 'Accessible Workshop',
    description: 'Build something together.',
    date: '2031-04-05T18:30:00.000Z',
    location: 'Community Hall',
  };

  it('serves the accessible My Events page and links to it from app navigation', async () => {
    const page = await request(app).get('/my-events.html');
    const script = await request(app).get('/my-events.js');
    assert.strictEqual(page.status, 200);
    assert.match(page.text, /My Events/);
    assert.match(page.text, /aria-live="polite"/);
    assert.match(page.text, /href="\/login\.html"/);
    assert.match(page.text, /href="\/"/);
    assert.strictEqual(script.status, 200);

    for (const route of ['/', '/login.html', '/register.html', '/organizer.html']) {
      const response = await request(app).get(route);
      assert.match(response.text, /href="\/my-events\.html"/, route);
    }
  });

  it('shows loading and empty states while using the session-authenticated endpoint', async () => {
    let resolveList;
    const pending = new Promise((resolve) => { resolveList = resolve; });
    const calls = [];
    const page = await loadMyEventsFrontend((url, options) => {
      calls.push({ url, options });
      return pending;
    });
    const loading = page.documentListeners.DOMContentLoaded();
    assert.match(page.status.textContent, /Loading your registrations/i);

    resolveList(jsonResponse(200, []));
    await loading;
    assert.match(page.status.textContent, /No registrations yet/i);
    assert.strictEqual(page.list.children.length, 0);
  });

  it('renders only the API-provided registrations and cancels with confirmation', async () => {
    let listRequests = 0;
    const calls = [];
    const decisions = [false, true];
    const page = await loadMyEventsFrontend(async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/registrations' && !options?.method) {
        listRequests += 1;
        return jsonResponse(200, listRequests === 1 ? [registration] : []);
      }
      if (url === `/api/registrations/${registration.registration_id}` && options.method === 'DELETE') {
        return jsonResponse(204, null);
      }
      throw new Error(`Unexpected request: ${url}`);
    }, () => decisions.shift());
    await page.documentListeners.DOMContentLoaded();

    assert.strictEqual(page.list.children.length, 1);
    assert.match(collectText(page.list.children[0]), /Accessible Workshop/);
    assert.match(collectText(page.list.children[0]), /Community Hall/);
    const cancelButton = page.list.children[0].children.find((child) => child.tagName === 'BUTTON');
    assert.ok(cancelButton);
    await cancelButton.listeners.click();
    assert.strictEqual(calls.some((call) => call.options?.method === 'DELETE'), false);

    await cancelButton.listeners.click();
    assert.ok(calls.some((call) => call.url === '/api/registrations'));
    const deletion = calls.find((call) => call.options?.method === 'DELETE');
    assert.strictEqual(deletion.url, `/api/registrations/${registration.registration_id}`);
    assert.strictEqual(deletion.options.credentials, 'same-origin');
    assert.match(page.status.textContent, /cancelled successfully/i);
    assert.strictEqual(page.list.children.length, 0);
    assert.ok(calls.every((call) => call.options.credentials === 'same-origin'));
  });

  it('shows authentication, authorization, and load-error feedback without rendering private data', async () => {
    for (const [statusCode, expected] of [
      [401, /log in/i],
      [403, /student account/i],
      [500, /could not load/i],
    ]) {
      const page = await loadMyEventsFrontend(async () => jsonResponse(statusCode, {
        error: 'private registration details',
      }));
      await page.documentListeners.DOMContentLoaded();
      assert.match(page.status.textContent, expected);
      assert.strictEqual(page.list.children.length, 0);
      assert.doesNotMatch(page.status.textContent, /private registration details/i);
    }
  });

  it('reports a denied cancellation without hiding the registration', async () => {
    const page = await loadMyEventsFrontend(async (url, options) => {
      if (url === '/api/registrations' && !options?.method) {
        return jsonResponse(200, [registration]);
      }
      if (options?.method === 'DELETE') {
        return jsonResponse(403, { error: 'Not authorized to cancel this registration' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    await page.documentListeners.DOMContentLoaded();
    const cancelButton = page.list.children[0].children.find((child) => child.tagName === 'BUTTON');

    await cancelButton.listeners.click();

    assert.match(page.status.textContent, /not authorized/i);
    assert.strictEqual(page.list.children.length, 1);
  });
});
