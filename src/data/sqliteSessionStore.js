const session = require('express-session');
const db = require('./db');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

class SQLiteSessionStore extends session.Store {
  constructor(database = db) {
    super();
    this.db = database;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY NOT NULL,
        sess TEXT NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
    `);
  }

  complete(callback, error, value) {
    if (typeof callback !== 'function') return;
    process.nextTick(() => callback(error, value));
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare(
        'SELECT sess FROM sessions WHERE sid = ? AND expires > ?'
      ).get(sid, Date.now());
      this.complete(callback, null, row ? JSON.parse(row.sess) : null);
    } catch (error) {
      this.complete(callback, error);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const expiresAt = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + (
          sessionData.cookie?.originalMaxAge
          ?? sessionData.cookie?.maxAge
          ?? SESSION_TTL_MS
        );
      if (!Number.isFinite(expiresAt)) throw new Error('Invalid session expiry');

      this.db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
      this.db.prepare(`
        INSERT INTO sessions (sid, sess, expires)
        VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires
      `).run(sid, JSON.stringify(sessionData), expiresAt);
      this.complete(callback, null);
    } catch (error) {
      this.complete(callback, error);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }

  destroy(sid, callback) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      this.complete(callback, null);
    } catch (error) {
      this.complete(callback, error);
    }
  }
}

module.exports = SQLiteSessionStore;
