const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const request = require('supertest');
const Database = require('better-sqlite3');

// Create unique temporary database and set environment variables before requiring app or database modules
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-test-'));
const dbPath = path.join(tmpDir, 'test.db');

process.env.DB_PATH = dbPath;
process.env.SESSION_SECRET = 'test-session-secret';

// Initialize the temporary database schema & seed
require('../database/init');

// Require app and db after setting env and initializing
const app = require('../src/app');
const db = require('../src/data/db');
const authService = require('../src/services/authService');

describe('AC-14: Authentication Tests', () => {
  const agent = request.agent(app);
  const testEmail = 'testuser@example.com';
  const testPassword = 'securePassword123';

  after(() => {
    try {
      db.close();
    } catch (e) {
      // ignore if already closed
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  it('AC-12, AC-14: should reject registration with invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'notanemail', password: testPassword });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Invalid email format');
  });

  it('AC-12, AC-14: should reject registration with short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@example.com', password: 'short' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'Password must be at least 8 characters long');
  });

  it('AC-14: should successfully register a new user', async () => {
    const res = await agent
      .post('/api/auth/register')
      .send({ email: testEmail, password: testPassword });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.email, testEmail);
    assert.ok(res.body.id);
  });

  it('AC-14: should reject registration with duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, password: testPassword });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.body.error, 'Email already registered');
  });

  it('AC-14: should reject login with unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: testPassword });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'Invalid email or password');
  });

  it('AC-14: should reject login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'wrongPassword123' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'Invalid email or password');
  });

  it('AC-14: should successfully login with valid credentials', async () => {
    const loginAgent = request.agent(app);
    const res = await loginAgent
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.email, testEmail);
  });

  it('AC-19: should return 401 for unauthenticated GET /api/auth/me', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'Not authenticated');
    const token = await request(app).get('/api/auth/csrf-token');
    assert.strictEqual(token.status, 401);
  });

  it('AC-14: should return user profile for authenticated GET /api/auth/me', async () => {
    // agent has active session from successful register/login
    const res = await agent.get('/api/auth/me');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.email, testEmail);
    assert.strictEqual(res.headers['cache-control'], 'no-store');
  });

  it('requires an authenticated session and a valid CSRF token before logout', async () => {
    const anonymousLogout = await request(app).post('/api/auth/logout');
    assert.strictEqual(anonymousLogout.status, 401);

    const tokenResponse = await agent.get('/api/auth/csrf-token');
    assert.strictEqual(tokenResponse.status, 200);
    assert.match(tokenResponse.body.csrfToken, /^[a-f0-9]{64}$/);

    const missingToken = await agent.post('/api/auth/logout');
    assert.strictEqual(missingToken.status, 403);
    const invalidToken = await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', 'invalid-token');
    assert.strictEqual(invalidToken.status, 403);

    const stillAuthenticated = await agent.get('/api/auth/me');
    assert.strictEqual(stillAuthenticated.status, 200);
  });

  it('AC-14: should successfully logout and deny subsequent access', async () => {
    const tokenResponse = await agent.get('/api/auth/csrf-token');
    const logoutRes = await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', tokenResponse.body.csrfToken);
    assert.strictEqual(logoutRes.status, 200);
    assert.strictEqual(logoutRes.body.message, 'Logged out successfully');
    const clearCookie = logoutRes.headers['set-cookie']?.find((cookie) => (
      /^connect\.sid=;/.test(cookie) && /expires=/i.test(cookie)
    ));
    assert.ok(clearCookie, 'logout should expire the session cookie');

    const meRes = await agent.get('/api/auth/me');
    assert.strictEqual(meRes.status, 401);
    assert.strictEqual(meRes.body.error, 'Not authenticated');
    assert.strictEqual((await agent.get('/api/registrations')).status, 401);
    assert.strictEqual((await agent.post('/api/events/1/register')).status, 401);
  });

  it('rejects non-string credentials through the authentication service', async () => {
    await assert.rejects(authService.register(null, testPassword), {
      message: 'Email and password must be strings',
    });
    await assert.rejects(authService.register('valid@example.com', null), {
      message: 'Email and password must be strings',
    });
    await assert.rejects(authService.login(null, testPassword), {
      message: 'Invalid email or password',
    });
    await assert.rejects(authService.login(testEmail, null), {
      message: 'Invalid email or password',
    });
  });

  it('denies local-password login for Google-only accounts and looks users up by ID', async () => {
    const googleUser = authService.findOrCreateGoogleUser({
      subject: 'auth-service-google-subject',
      email: 'google-only@example.com',
      emailVerified: true,
    });

    await assert.rejects(authService.login(googleUser.email, testPassword), {
      message: 'Invalid email or password',
    });
    assert.deepStrictEqual(await authService.getUserById(googleUser.id), {
      id: googleUser.id,
      email: googleUser.email,
      role: 'student',
    });
    await assert.rejects(authService.getUserById(-1), { message: 'User not found' });
  });

  it('rejects malformed Google identities before creating or linking accounts', () => {
    for (const identity of [
      { subject: '', email: 'valid@example.com', emailVerified: true },
      { subject: 'subject', email: 'invalid', emailVerified: true },
      { subject: 'subject', email: 'valid@example.com', emailVerified: false },
    ]) {
      assert.throws(() => authService.findOrCreateGoogleUser(identity), {
        message: 'INVALID_GOOGLE_IDENTITY',
      });
    }

    for (const [userId, subject] of [[0, 'subject'], [1, ''], [1, null]]) {
      assert.throws(() => authService.linkGoogleAccount(userId, subject), {
        message: 'INVALID_GOOGLE_IDENTITY',
      });
    }
  });

  it('does not link a Google identity to a missing local account', () => {
    assert.throws(() => authService.linkGoogleAccount(999999, 'unowned-subject'), {
      message: 'User not found',
    });
  });

  it('preserves Google email and linked-account conflict protections', () => {
    const localUser = db.prepare(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)'
    ).run('google-conflict-local@example.com', 'unused-hash', 'student');
    const linkedUser = authService.findOrCreateGoogleUser({
      subject: 'google-conflict-subject',
      email: 'google-conflict-linked@example.com',
      emailVerified: true,
    });

    assert.throws(() => authService.findOrCreateGoogleUser({
      subject: 'different-google-subject',
      email: 'google-conflict-local@example.com',
      emailVerified: true,
    }), { message: 'GOOGLE_EMAIL_CONFLICT' });

    assert.throws(() => authService.linkGoogleAccount(
      Number(localUser.lastInsertRowid),
      'google-conflict-subject'
    ), { message: 'GOOGLE_ACCOUNT_LINKED' });

    assert.strictEqual(
      db.prepare('SELECT google_id FROM users WHERE id = ?')
        .get(localUser.lastInsertRowid).google_id,
      null
    );
    assert.strictEqual(
      db.prepare('SELECT google_id FROM users WHERE id = ?').get(linkedUser.id).google_id,
      'google-conflict-subject'
    );
  });

  it('handles a duplicate email inserted while password hashing is in progress', async () => {
    const email = 'register-race@example.com';
    const registration = authService.register(email, testPassword);
    db.prepare('INSERT INTO users (email, password, role) VALUES (?, ?, ?)')
      .run(email, 'race-winner-hash', 'student');

    await assert.rejects(registration, { message: 'Email already registered' });
  });

  it('propagates a real database-busy error during registration', async () => {
    const competingConnection = new Database(dbPath);
    const previousBusyTimeout = db.pragma('busy_timeout', { simple: true });
    let lockStarted = false;
    try {
      db.pragma('busy_timeout = 0');
      const registration = authService.register('database-busy@example.com', testPassword);
      competingConnection.exec('BEGIN IMMEDIATE');
      lockStarted = true;

      await assert.rejects(registration, (error) => error.code === 'SQLITE_BUSY');
    } finally {
      if (lockStarted) competingConnection.exec('ROLLBACK');
      competingConnection.close();
      db.pragma(`busy_timeout = ${previousBusyTimeout}`);
    }
  });

});
