const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const initModulePath = path.resolve(__dirname, '../database/init.js');
const sharedDbModulePath = path.resolve(__dirname, '../src/data/db.js');
const ownershipMigrationPath = path.resolve(
  __dirname,
  '../database/migrations/002_event_organizer_id_migration.js'
);

describe('event organizer ownership migration', () => {
  let tmpDir;
  let dbPath;
  let oldDbPath;
  let sharedDb;

  beforeEach(() => {
    oldDbPath = process.env.DB_PATH;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-owner-mig-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    process.env.DB_PATH = dbPath;
    delete require.cache[initModulePath];
    delete require.cache[sharedDbModulePath];
    delete require.cache[ownershipMigrationPath];
  });

  afterEach(() => {
    try {
      if (sharedDb) sharedDb.close();
    } finally {
      sharedDb = undefined;
      delete require.cache[initModulePath];
      delete require.cache[sharedDbModulePath];
      delete require.cache[ownershipMigrationPath];

      if (oldDbPath === undefined) {
        delete process.env.DB_PATH;
      } else {
        process.env.DB_PATH = oldDbPath;
      }

      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function initializeFreshDatabase() {
    delete require.cache[initModulePath];
    require('../database/init');
  }

  function runOwnershipMigration() {
    delete require.cache[ownershipMigrationPath];
    return require('../database/migrations/002_event_organizer_id_migration')(dbPath);
  }

  function initializeLegacyDatabase() {
    const db = new Database(dbPath);
    try {
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
      db.prepare('INSERT INTO users (email, role) VALUES (?, ?)').run(
        'legacy-student@example.com',
        'student'
      );
      db.prepare(`
        INSERT INTO events (title, description, date, location, capacity)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'Legacy event',
        'Must remain intact',
        '2030-12-01 18:00:00',
        'Old Hall',
        12
      );
      db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(1, 1);
    } finally {
      db.close();
    }
  }

  function readRows(table) {
    const db = new Database(dbPath, { readonly: true });
    try {
      return db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    } finally {
      db.close();
    }
  }

  function hasOrganizerIdColumn() {
    const db = new Database(dbPath, { readonly: true });
    try {
      return db.prepare("PRAGMA table_info('events')").all()
        .some((column) => column.name === 'organizer_id');
    } finally {
      db.close();
    }
  }

  it('initializes a fresh database and safely repeats the ownership migration', () => {
    initializeFreshDatabase();
    assert.strictEqual(hasOrganizerIdColumn(), true);

    const initialEvents = readRows('events');
    const firstRun = runOwnershipMigration();
    const secondRun = runOwnershipMigration();

    assert.strictEqual(firstRun.success, true);
    assert.strictEqual(secondRun.success, true);
    assert.strictEqual(hasOrganizerIdColumn(), true);
    assert.deepEqual(readRows('events'), initialEvents.map((event) => ({
      ...event,
      organizer_id: null,
    })));
  });

  it('adds nullable ownership to a legacy database without changing events or registrations', () => {
    initializeLegacyDatabase();
    const eventsBefore = readRows('events');
    const registrationsBefore = readRows('registrations');

    const result = runOwnershipMigration();

    assert.strictEqual(result.success, true);
    assert.deepEqual(
      readRows('events'),
      eventsBefore.map((event) => ({ ...event, organizer_id: null }))
    );
    assert.deepEqual(readRows('registrations'), registrationsBefore);
  });

  it('enforces valid organizer references while allowing legacy NULL owners and registrations', () => {
    initializeFreshDatabase();
    runOwnershipMigration();

    sharedDb = require('../src/data/db');
    assert.strictEqual(sharedDb.pragma('foreign_keys', { simple: true }), 1);

    const userId = sharedDb.prepare(
      'INSERT INTO users (email, role) VALUES (?, ?)'
    ).run('organizer@example.com', 'organizer').lastInsertRowid;
    const validEventId = sharedDb.prepare(`
      INSERT INTO events (title, description, date, location, capacity, organizer_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'Owned event',
      'Valid owner',
      '2030-12-01 18:00:00',
      'New Hall',
      10,
      userId
    ).lastInsertRowid;

    assert.throws(() => {
      sharedDb.prepare(`
        INSERT INTO events (title, date, location, capacity, organizer_id)
        VALUES (?, ?, ?, ?, ?)
      `).run('Invalid owner', '2030-12-01 18:00:00', 'New Hall', 10, 999999);
    }, (error) => error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY');

    const unownedEventId = sharedDb.prepare(`
      INSERT INTO events (title, date, location, capacity)
      VALUES (?, ?, ?, ?)
    `).run('Unowned event', '2030-12-02 18:00:00', 'Old Hall', 10).lastInsertRowid;
    const studentId = sharedDb.prepare(
      'INSERT INTO users (email) VALUES (?)'
    ).run('student@example.com').lastInsertRowid;

    sharedDb.prepare(
      'INSERT INTO registrations (user_id, event_id) VALUES (?, ?)'
    ).run(studentId, validEventId);
    sharedDb.prepare(
      'INSERT INTO registrations (user_id, event_id) VALUES (?, ?)'
    ).run(studentId, unownedEventId);

    assert.equal(
      sharedDb.prepare('SELECT organizer_id FROM events WHERE id = ?').get(unownedEventId).organizer_id,
      null
    );
    assert.strictEqual(
      sharedDb.prepare('SELECT COUNT(*) AS count FROM registrations').get().count,
      2
    );
  });
});
