const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const request = require('supertest');

describe('Exercise 3: Event Registration (AC-20 to AC-25)', () => {
  let app, db;
  let student1, student2, student1Id, student2Id;
  let originalDbPath, originalSessionSecret;
  let tmpDir, dbPath;

  before(async () => {
    // Store original environment to restore in after()
    originalDbPath = process.env.DB_PATH;
    originalSessionSecret = process.env.SESSION_SECRET;

    // Create unique temporary database for this test file
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-reg-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    process.env.DB_PATH = dbPath;
    process.env.SESSION_SECRET = 'registration-test-secret';

    // Initialize database schema and seeds
    require('../database/init');
    app = require('../src/app');
    db = require('../src/data/db');

    // Setup Student 1: Register and verify session
    student1 = request.agent(app);
    const reg1 = await student1.post('/api/auth/register').send({ email: 's1@ex.com', password: 'password1234' });
    assert.strictEqual(reg1.status, 201, 'Student 1 registration should succeed');
    student1Id = reg1.body.id;
    const me1 = await student1.get('/api/auth/me');
    assert.strictEqual(me1.status, 200, 'Student 1 session should be active');
    assert.strictEqual(me1.body.id, student1Id);

    // Setup Student 2: Register and verify session
    student2 = request.agent(app);
    const reg2 = await student2.post('/api/auth/register').send({ email: 's2@ex.com', password: 'password1234' });
    assert.strictEqual(reg2.status, 201, 'Student 2 registration should succeed');
    student2Id = reg2.body.id;
    const me2 = await student2.get('/api/auth/me');
    assert.strictEqual(me2.status, 200, 'Student 2 session should be active');
    assert.strictEqual(me2.body.id, student2Id);
  });

  after(() => {
    // Close database connection
    if (db) {
      try { db.close(); } catch (e) {}
    }

    // Restore environment variables
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

    // Clean up temporary files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  });

  beforeEach(() => {
    // Ensure test independence by clearing events and registrations before each test
    // We keep users to avoid re-authenticating agents
    db.prepare('DELETE FROM registrations').run();
    db.prepare('DELETE FROM events').run();
  });

  function createEvent(title, capacity, date) {
    if (!date) {
      const future = new Date();
      future.setDate(future.getDate() + 7);
      date = future.toISOString();
    }
    const stmt = db.prepare('INSERT INTO events (title, description, date, location, capacity) VALUES (?, ?, ?, ?, ?)');
    return stmt.run(title, 'Test Description', date, 'Test Location', capacity).lastInsertRowid;
  }

  it('AC-20: should allow a logged-in student to register for an upcoming event (201)', async () => {
    const eventId = createEvent('Future Event', 50);
    const res = await student1.post(`/api/events/${eventId}/register`);
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.id, 'Response should contain registration ID');
  });

  it('AC-21: should reject duplicate registration with 409', async () => {
    const eventId = createEvent('Duplicate Test', 50);
    const firstRes = await student1.post(`/api/events/${eventId}/register`);
    assert.strictEqual(firstRes.status, 201, 'First registration should succeed');

    const res = await student1.post(`/api/events/${eventId}/register`);
    assert.strictEqual(res.status, 409);
    assert.match(res.body.error, /already registered/i);
  });

  it('AC-22: should reject registration for a full event with 409', async () => {
    const eventId = createEvent('Full Event', 1);
    const firstRes = await student1.post(`/api/events/${eventId}/register`);
    assert.strictEqual(firstRes.status, 201, 'First registration should succeed');

    const res = await student2.post(`/api/events/${eventId}/register`);
    assert.strictEqual(res.status, 409);
    assert.match(res.body.error, /full/i);
  });

  it('AC-23: should allow owner to cancel registration with 204', async () => {
    const eventId = createEvent('Cancel Test', 50);
    const regRes = await student1.post(`/api/events/${eventId}/register`);
    assert.strictEqual(regRes.status, 201, 'Prerequisite registration should succeed');
    const registrationId = regRes.body.id;

    const res = await student1.delete(`/api/registrations/${registrationId}`);
    assert.strictEqual(res.status, 204);

    const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(registrationId);
    assert.equal(reg, undefined, 'Registration should be removed from database');
  });

  it('AC-23: should reject cancellation by non-owner with 403', async () => {
    const eventId = createEvent('Not Owner Test', 50);
    const regRes = await student1.post(`/api/events/${eventId}/register`);
    assert.strictEqual(regRes.status, 201, 'Prerequisite registration should succeed');
    const registrationId = regRes.body.id;

    const res = await student2.delete(`/api/registrations/${registrationId}`);
    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /not authorized/i);
  });

  it('AC-24: should reject anonymous registration with 401', async () => {
    const eventId = createEvent('Anon Reg', 50);
    const res = await request(app).post(`/api/events/${eventId}/register`);
    assert.strictEqual(res.status, 401);
  });

  it('AC-24: should reject anonymous cancellation with 401', async () => {
    const eventId = createEvent('Anon Cancel', 50);
    const regRes = await student1.post(`/api/events/${eventId}/register`);
    assert.strictEqual(regRes.status, 201, 'Prerequisite registration should succeed');
    const registrationId = regRes.body.id;

    const res = await request(app).delete(`/api/registrations/${registrationId}`);
    assert.strictEqual(res.status, 401);
  });

  it('AC-25: should return 404 when registering for a non-existent event', async () => {
    const res = await student1.post('/api/events/999999/register');
    assert.strictEqual(res.status, 404);
  });

  it('AC-25: should return 404 when cancelling a non-existent registration', async () => {
    const res = await student1.delete('/api/registrations/999999');
    assert.strictEqual(res.status, 404);
  });

  it('should reject registration for past events with 400', async () => {
    const eventId = createEvent('Past Event', 50, '2020-01-01 10:00:00');
    const res = await student1.post(`/api/events/${eventId}/register`);
    assert.strictEqual(res.status, 400);
    assert.match(res.body.error, /past/i);
  });

  it('should preserve database integrity after failed operations', async () => {
    const eventId = createEvent('Integrity Test', 1);
    const regRes = await student1.post(`/api/events/${eventId}/register`);
    assert.strictEqual(regRes.status, 201, 'Prerequisite registration should succeed');
    const regId = regRes.body.id;

    const countBefore = db.prepare('SELECT COUNT(*) as count FROM registrations').get().count;

    // Failure Case 1: Capacity Conflict (409)
    const resCap = await student2.post(`/api/events/${eventId}/register`);
    assert.strictEqual(resCap.status, 409, 'Should fail with 409 due to capacity');

    // Failure Case 2: Unauthorized Cancellation (403)
    const resAuth = await student2.delete(`/api/registrations/${regId}`);
    assert.strictEqual(resAuth.status, 403, 'Should fail with 403 (unauthorized)');

    // Failure Case 3: Non-existent registration (404)
    const res404 = await student1.delete('/api/registrations/999999');
    assert.strictEqual(res404.status, 404, 'Should fail with 404 (non-existent)');

    const countAfter = db.prepare('SELECT COUNT(*) as count FROM registrations').get().count;
    assert.strictEqual(countAfter, countBefore, 'Database state should be unchanged after failed operations');
  });
});
