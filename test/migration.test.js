const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const runMigration = require('../database/migrations/001_registrations_migration');

describe('Database Migration Tests', () => {
  let tmpDir;
  let dbPath;
  let oldDbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-mig-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    oldDbPath = process.env.DB_PATH;
    process.env.DB_PATH = dbPath;
  });

  afterEach(() => {
    if (oldDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = oldDbPath;
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  function initSchema(targetDbPath) {
    const db = new Database(targetDbPath);
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password TEXT,
          google_id TEXT UNIQUE,
          role TEXT DEFAULT 'student',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          date DATETIME NOT NULL,
          location TEXT NOT NULL,
          capacity INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS registrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          event_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (event_id) REFERENCES events(id),
          UNIQUE(user_id, event_id)
        );
      `);
    } finally {
      db.close();
    }
  }

  function getIndexes(targetDbPath) {
    const db = new Database(targetDbPath, { readonly: true });
    try {
      const list = db.prepare("PRAGMA index_list('registrations')").all();
      return list.map(idx => {
        const info = db.prepare(`PRAGMA index_info('${idx.name}')`).all();
        return { ...idx, info };
      });
    } finally {
      db.close();
    }
  }

  function getRegistrations(targetDbPath) {
    const db = new Database(targetDbPath, { readonly: true });
    try {
      return db.prepare('SELECT * FROM registrations').all();
    } finally {
      db.close();
    }
  }

  it('1. fresh database initializes expected schema and enforces uniqueness', () => {
    const res = runMigration(dbPath);
    assert.strictEqual(res.success, true);

    const db = new Database(dbPath);
    try {
      db.prepare('INSERT INTO users (email) VALUES (?)').run('user1@example.com');
      db.prepare('INSERT INTO events (title, date, location, capacity) VALUES (?, ?, ?, ?)').run('Event 1', '2026-12-01 18:00:00', 'Here', 10);
      db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(1, 1);

      assert.throws(() => {
        db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(1, 1);
      }, /UNIQUE constraint failed/);
    } finally {
      db.close();
    }
  });

  it('2. pre-existing database with UNIQUE(user_id,event_id) retains rows and does not gain redundant index', () => {
    initSchema(dbPath);
    const db = new Database(dbPath);
    try {
      db.prepare('INSERT INTO users (email) VALUES (?)').run('user1@example.com');
      db.prepare('INSERT INTO events (title, date, location, capacity) VALUES (?, ?, ?, ?)').run('Event 1', '2026-12-01 18:00:00', 'Here', 10);
      db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(1, 1);
    } finally {
      db.close();
    }

    const regsBefore = getRegistrations(dbPath);
    const indexesBefore = getIndexes(dbPath);

    const res = runMigration(dbPath);
    assert.strictEqual(res.success, true);

    const regsAfter = getRegistrations(dbPath);
    const indexesAfter = getIndexes(dbPath);

    assert.deepEqual(regsAfter, regsBefore);
    assert.deepEqual(indexesAfter, indexesBefore);
  });

  it('3. legacy database without unique constraint gains effective unique index and retains all rows', () => {
    const db = new Database(dbPath);
    try {
      db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL);
        CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, date DATETIME NOT NULL, location TEXT NOT NULL, capacity INTEGER NOT NULL);
        CREATE TABLE registrations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, event_id INTEGER NOT NULL);
      `);
      db.prepare('INSERT INTO users (email) VALUES (?)').run('user1@example.com');
      db.prepare('INSERT INTO events (title, date, location, capacity) VALUES (?, ?, ?, ?)').run('Event 1', '2026-12-01 18:00:00', 'Here', 10);
      db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(1, 1);
    } finally {
      db.close();
    }

    const regsBefore = getRegistrations(dbPath);

    const res = runMigration(dbPath);
    assert.strictEqual(res.success, true);

    const regsAfter = getRegistrations(dbPath);
    assert.deepEqual(regsAfter, regsBefore);

    const dbCheck = new Database(dbPath);
    try {
      assert.throws(() => {
        dbCheck.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(1, 1);
      }, /UNIQUE constraint failed/);
    } finally {
      dbCheck.close();
    }
  });

  it('4. legacy duplicates cause failure with identical records and schema before and after', () => {
    const db = new Database(dbPath);
    try {
      db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL);
        CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, date DATETIME NOT NULL, location TEXT NOT NULL, capacity INTEGER NOT NULL);
        CREATE TABLE registrations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, event_id INTEGER NOT NULL);
      `);
      db.prepare('INSERT INTO users (email) VALUES (?)').run('user1@example.com');
      db.prepare('INSERT INTO events (title, date, location, capacity) VALUES (?, ?, ?, ?)').run('Event 1', '2026-12-01 18:00:00', 'Here', 10);
      db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(1, 1);
      db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(1, 1);
    } finally {
      db.close();
    }

    const regsBefore = getRegistrations(dbPath);
    const indexesBefore = getIndexes(dbPath);

    assert.throws(() => {
      runMigration(dbPath);
    }, /Duplicate registrations found/);

    const regsAfter = getRegistrations(dbPath);
    const indexesAfter = getIndexes(dbPath);

    assert.deepEqual(regsAfter, regsBefore);
    assert.deepEqual(indexesAfter, indexesBefore);
  });

  it('5. repeated migration runs leave schema and records unchanged', () => {
    runMigration(dbPath);
    const indexes1 = getIndexes(dbPath);

    // Insert a valid registration before the second migration run
    const db = new Database(dbPath);
    try {
      db.prepare('INSERT INTO users (email) VALUES (?)').run('user2@example.com');
      db.prepare('INSERT INTO events (title, date, location, capacity) VALUES (?, ?, ?, ?)').run('Event 2', '2026-12-05 14:00:00', 'Lab 101', 30);
      db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(1, 1);
    } finally {
      db.close();
    }

    const recordsBeforeSecondRun = getRegistrations(dbPath);

    const res = runMigration(dbPath);
    assert.strictEqual(res.success, true);

    const regs2 = getRegistrations(dbPath);
    const indexes2 = getIndexes(dbPath);

    assert.deepEqual(regs2, recordsBeforeSecondRun);
    assert.deepEqual(indexes2, indexes1);
  });
});
