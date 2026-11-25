const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-session-store-'));
const previousEnv = {
  DB_PATH: process.env.DB_PATH,
  SESSION_SECRET: process.env.SESSION_SECRET,
  NODE_ENV: process.env.NODE_ENV,
};
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.SESSION_SECRET = 'sqlite-session-store-test-secret';
process.env.NODE_ENV = 'production';

require('../database/init');
const app = require('../src/app');
const db = require('../src/data/db');
const SQLiteSessionStore = require('../src/data/sqliteSessionStore');

function storeCall(store, method, ...args) {
  return new Promise((resolve, reject) => {
    store[method](...args, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

describe('SQLite-backed production session store', () => {
  const store = new SQLiteSessionStore();

  after(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('starts the HTTP app in production mode and creates the session table', async () => {
    assert.strictEqual((await request(app).get('/health')).status, 200);
    assert.ok(db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'"
    ).get());
  });

  it('stores, reads, touches, and destroys serialized sessions', async () => {
    const expires = new Date(Date.now() + 60_000);
    const sessionData = {
      userId: 23,
      cookie: {
        expires,
        originalMaxAge: 60_000,
      },
    };

    await storeCall(store, 'set', 'session-one', sessionData);
    assert.deepStrictEqual(await storeCall(store, 'get', 'session-one'), {
      userId: 23,
      cookie: {
        expires: expires.toISOString(),
        originalMaxAge: 60_000,
      },
    });

    const extendedExpiry = new Date(Date.now() + 120_000);
    await storeCall(store, 'touch', 'session-one', {
      ...sessionData,
      cookie: { expires: extendedExpiry, originalMaxAge: 120_000 },
    });
    assert.strictEqual(
      db.prepare('SELECT expires FROM sessions WHERE sid = ?').get('session-one').expires,
      extendedExpiry.getTime()
    );

    await storeCall(store, 'destroy', 'session-one');
    assert.strictEqual(await storeCall(store, 'get', 'session-one'), null);
  });

  it('does not return expired sessions and prunes them during writes', async () => {
    db.prepare('INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)')
      .run('expired-session', JSON.stringify({ userId: 24 }), Date.now() - 1);
    assert.strictEqual(await storeCall(store, 'get', 'expired-session'), null);

    await storeCall(store, 'set', 'fresh-session', {
      userId: 25,
      cookie: { expires: new Date(Date.now() + 60_000), originalMaxAge: 60_000 },
    });
    assert.strictEqual(
      db.prepare('SELECT sid FROM sessions WHERE sid = ?').get('expired-session'),
      undefined
    );
  });
});
