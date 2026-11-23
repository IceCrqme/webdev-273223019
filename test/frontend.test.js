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
    disabled: false,
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
