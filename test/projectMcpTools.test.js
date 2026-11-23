const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const Database = require('better-sqlite3');
const { createProjectTools } = require('../mcp-server/projectTools');

function textValue(result) {
  return JSON.parse(result.content[0].text);
}

describe('Exercise 3: project MCP tools (AC-11)', () => {
  it('AC-11: advertises the three project tools', () => {
    const tools = createProjectTools({
      eventService: {},
      authService: {},
      userId: 17,
    });

    assert.deepStrictEqual(
      tools.definitions.map((tool) => tool.name),
      ['list_events', 'get_event_details', 'register_for_event']
    );
  });

  it('AC-11: lists events through the event service', async () => {
    const events = [{ id: 3, title: 'Workshop', available_places: 5 }];
    let calls = 0;
    const tools = createProjectTools({
      eventService: {
        getUpcomingEvents: async () => {
          calls += 1;
          return events;
        },
      },
      authService: {},
      userId: null,
    });

    const result = await tools.call('list_events', {});

    assert.strictEqual(calls, 1);
    assert.deepStrictEqual(textValue(result), events);
  });

  it('AC-11: gets event details through the event service and reports not found', async () => {
    let requestedId;
    const tools = createProjectTools({
      eventService: {
        getEventDetails: async (eventId) => {
          requestedId = eventId;
          throw new Error('EVENT_NOT_FOUND');
        },
      },
      authService: {},
      userId: null,
    });

    const result = await tools.call('get_event_details', { event_id: 21 });

    assert.strictEqual(requestedId, 21);
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /event not found/i);
  });

  it('AC-11: registers with trusted user identity and returns success', async () => {
    let received;
    const tools = createProjectTools({
      eventService: {
        registerForEvent: async (userId, eventId) => {
          received = { userId, eventId };
          return { id: 81 };
        },
      },
      authService: {
        getUserById: async (userId) => ({ id: userId }),
      },
      userId: 17,
    });

    const result = await tools.call('register_for_event', {
      event_id: 6,
      user_id: 999,
    });

    assert.deepStrictEqual(received, { userId: 17, eventId: 6 });
    assert.deepStrictEqual(textValue(result), { id: 81 });
  });

  it('AC-11: maps duplicate and capacity conflicts to MCP tool errors', async () => {
    for (const [serviceError, expectedMessage] of [
      ['ALREADY_REGISTERED', /already registered/i],
      ['EVENT_FULL', /event is full/i],
    ]) {
      const tools = createProjectTools({
        eventService: {
          registerForEvent: async () => {
            throw new Error(serviceError);
          },
        },
        authService: {
          getUserById: async (userId) => ({ id: userId }),
        },
        userId: 17,
      });

      const result = await tools.call('register_for_event', { event_id: 6 });
      assert.strictEqual(result.isError, true);
      assert.match(result.content[0].text, expectedMessage);
    }
  });

  it('AC-11: rejects registration when no trusted MCP user is configured', async () => {
    let calls = 0;
    const tools = createProjectTools({
      eventService: {
        registerForEvent: async () => {
          calls += 1;
          return { id: 81 };
        },
      },
      authService: {},
      userId: null,
    });

    const result = await tools.call('register_for_event', { event_id: 6 });

    assert.strictEqual(calls, 0);
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /authenticated user/i);
  });

  it('AC-11: rejects a configured MCP user ID absent from SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-mcp-user-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    const db = new Database(dbPath);
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        google_id TEXT UNIQUE,
        role TEXT DEFAULT 'student',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        date DATETIME NOT NULL,
        location TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        event_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (event_id) REFERENCES events(id),
        UNIQUE(user_id, event_id)
      );
    `);
    db.prepare(
      'INSERT INTO events (title, description, date, location, capacity) VALUES (?, ?, ?, ?, ?)'
    ).run('MCP Test Event', 'Test', futureDate, 'Test Location', 10);
    db.close();

    const server = spawn(process.execPath, [
      path.join(__dirname, '../mcp-server/server.js'),
    ], {
      env: {
        ...process.env,
        DB_PATH: dbPath,
        MCP_USER_ID: '900001',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const exitPromise = new Promise((resolve) => server.once('exit', resolve));

    let responseBuffer = '';
    const responsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('MCP server did not respond')), 3000);
      server.stdout.setEncoding('utf8');
      server.stdout.on('data', (chunk) => {
        responseBuffer += chunk;
        const newline = responseBuffer.indexOf('\n');
        if (newline < 0) return;
        const response = JSON.parse(responseBuffer.slice(0, newline));
        if (response.id === 77) {
          clearTimeout(timeout);
          resolve(response);
        }
      });
      server.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    try {
      server.stdin.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id: 77,
        method: 'tools/call',
        params: {
          name: 'register_for_event',
          arguments: { event_id: 1 },
        },
      })}\n`);

      const response = await responsePromise;
      assert.strictEqual(response.result.isError, true);
      assert.match(response.result.content[0].text, /configured MCP user.*not found/i);
    } finally {
      if (server.exitCode === null && server.signalCode === null) server.kill();
      await exitPromise;
      const verificationDb = new Database(dbPath, { readonly: true });
      const registrationCount = verificationDb.prepare('SELECT COUNT(*) AS count FROM registrations').get().count;
      verificationDb.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      assert.strictEqual(registrationCount, 0);
    }
  });
});
