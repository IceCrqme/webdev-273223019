const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const request = require('supertest');

const modulePaths = [
  '../database/init',
  '../src/app',
  '../src/data/db',
  '../src/services/authService',
  '../src/services/eventService',
  '../src/routes/authRoutes',
  '../src/routes/eventRoutes',
  '../src/services/geminiClient',
  '../src/services/eventDescriptionService',
  '../src/middleware/sessionAuthorization',
  '../src/middleware/csrfProtection',
].map((modulePath) => path.resolve(__dirname, modulePath));

describe('organizer event management API', () => {
  let app;
  let db;
  let tmpDir;
  let originalDbPath;
  let originalSessionSecret;
  let originalModules;
  let student;
  let secondStudent;
  let organizer;
  let otherOrganizer;
  let generatedDescription;
  let generatedError;
  let generatedRequests;

  before(async () => {
    originalDbPath = process.env.DB_PATH;
    originalSessionSecret = process.env.SESSION_SECRET;
    originalModules = new Map(modulePaths.map((modulePath) => [
      modulePath,
      require.cache[modulePath],
    ]));

    for (const modulePath of modulePaths) {
      delete require.cache[modulePath];
    }

    const geminiClient = require('../src/services/geminiClient');
    generatedDescription = 'A mocked description for the community event.';
    generatedError = undefined;
    generatedRequests = [];
    geminiClient.isConfigured = () => true;
    geminiClient.generate = async (input) => {
      generatedRequests.push(input);
      if (generatedError) throw generatedError;
      return generatedDescription;
    };

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-management-test-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.SESSION_SECRET = 'event-management-test-session-secret';

    require('../database/init');
    app = require('../src/app');
    db = require('../src/data/db');

    student = await createUser('management-student@example.com');
    secondStudent = await createUser('management-second-student@example.com');
    organizer = await createUser('management-organizer@example.com', 'organizer');
    otherOrganizer = await createUser('management-other-organizer@example.com', 'organizer');
  });

  beforeEach(() => {
    db.prepare('DELETE FROM registrations').run();
    db.prepare('DELETE FROM events').run();
  });

  after(() => {
    try {
      if (db) db.close();
    } finally {
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

      for (const modulePath of modulePaths) {
        delete require.cache[modulePath];
        const originalModule = originalModules.get(modulePath);
        if (originalModule) require.cache[modulePath] = originalModule;
      }

      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  async function createUser(email, role = 'student') {
    const agent = request.agent(app);
    const response = await agent
      .post('/api/auth/register')
      .send({ email, password: 'securePassword123' });
    assert.strictEqual(response.status, 201);

    if (role !== 'student') {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, response.body.id);
    }

    return { agent, id: response.body.id };
  }

  function eventFields(overrides = {}) {
    return {
      title: 'Community Workshop',
      description: 'A practical workshop for club members.',
      date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      location: 'Student Center',
      capacity: 20,
      ...overrides,
    };
  }

  async function getCsrfToken(user) {
    const response = await user.agent.get('/api/organizer/csrf-token');
    assert.strictEqual(response.status, 200);
    assert.match(response.body.csrfToken, /^[a-f0-9]{64}$/);
    return response.body.csrfToken;
  }

  async function createEvent(user, fields = eventFields()) {
    const csrfToken = await getCsrfToken(user);
    const response = await user.agent
      .post('/api/organizer/events')
      .set('X-CSRF-Token', csrfToken)
      .send(fields);
    assert.strictEqual(response.status, 201);
    assert.strictEqual(response.body.organizer_id, user.id);
    return { event: response.body, csrfToken };
  }

  it('rejects anonymous access to organizer reads, writes, and token issuance', async () => {
    const list = await request(app).get('/api/organizer/events');
    const detail = await request(app).get('/api/organizer/events/1');
    const create = await request(app)
      .post('/api/organizer/events')
      .send(eventFields());
    const token = await request(app).get('/api/organizer/csrf-token');
    const description = await request(app).post('/api/organizer/event-description');

    for (const response of [list, detail, create, token, description]) {
      assert.strictEqual(response.status, 401);
    }
    assert.equal(token.body.csrfToken, undefined);
  });

  it('denies students even when they submit forged organizer identity fields', async () => {
    const csrfToken = await getCsrfToken(organizer);
    const list = await student.agent.get('/api/organizer/events');
    const create = await student.agent
      .post('/api/organizer/events')
      .set('X-CSRF-Token', csrfToken)
      .send(eventFields({
        role: 'organizer',
        userId: organizer.id,
        organizerId: organizer.id,
        organizer_id: organizer.id,
      }));
    const description = await student.agent
      .post('/api/organizer/event-description')
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Forged request', keywords: ['test'] });

    assert.strictEqual(list.status, 403);
    assert.strictEqual(create.status, 403);
    assert.strictEqual(description.status, 403);
  });

  it('AC-9: generates a description through the authenticated, CSRF-protected organizer API', async () => {
    const csrfToken = await getCsrfToken(organizer);
    const response = await organizer.agent
      .post('/api/organizer/event-description')
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Community Garden Day', keywords: ['gardening', 'volunteers'] });

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.body, {
      description: generatedDescription,
      fallback: false,
    });
    assert.strictEqual(generatedRequests.length, 1);
    assert.strictEqual(generatedRequests[0].title, 'Community Garden Day');
    assert.deepStrictEqual(generatedRequests[0].keywords, ['gardening', 'volunteers']);
    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM events').get().count, 0);
  });

  it('AC-10: returns a manual-entry fallback when the mocked AI provider fails', async () => {
    generatedError = new Error('mocked provider unavailable');
    const csrfToken = await getCsrfToken(organizer);
    const response = await organizer.agent
      .post('/api/organizer/event-description')
      .set('X-CSRF-Token', csrfToken)
      .send({ title: 'Community Garden Day', keywords: ['gardening'] });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.fallback, true);
    assert.match(response.body.description, /Community Garden Day/);
    assert.doesNotMatch(response.body.description, /<invalid/);
  });

  it('rejects invalid organizer description input and missing CSRF tokens', async () => {
    const missingCsrf = await organizer.agent
      .post('/api/organizer/event-description')
      .send({ title: 'Community Garden Day', keywords: ['gardening'] });
    const invalid = await organizer.agent
      .post('/api/organizer/event-description')
      .set('X-CSRF-Token', await getCsrfToken(organizer))
      .send({ title: '', keywords: ['gardening'] });

    assert.strictEqual(missingCsrf.status, 403);
    assert.strictEqual(invalid.status, 400);
  });

  it('allows organizers to list, read, create, update, and delete any event', async () => {
    const { event, csrfToken } = await createEvent(organizer);

    const list = await organizer.agent.get('/api/organizer/events');
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.some((listedEvent) => listedEvent.id === event.id));

    const detail = await organizer.agent.get(`/api/organizer/events/${event.id}`);
    assert.strictEqual(detail.status, 200);
    assert.strictEqual(detail.body.title, event.title);

    const updateFields = eventFields({
      title: 'Updated Workshop',
      description: 'An updated workshop description.',
      capacity: 25,
    });
    const update = await organizer.agent
      .put(`/api/organizer/events/${event.id}`)
      .set('X-CSRF-Token', csrfToken)
      .send(updateFields);
    assert.strictEqual(update.status, 200);
    assert.strictEqual(update.body.title, updateFields.title);
    assert.strictEqual(update.body.capacity, updateFields.capacity);

    const deleteResponse = await organizer.agent
      .delete(`/api/organizer/events/${event.id}`)
      .set('X-CSRF-Token', csrfToken);
    assert.strictEqual(deleteResponse.status, 204);
    assert.equal(db.prepare('SELECT id FROM events WHERE id = ?').get(event.id), undefined);
  });

  it('denies another organizer updates and deletes while keeping event details readable', async () => {
    const { event } = await createEvent(organizer);
    const detail = await otherOrganizer.agent.get(`/api/organizer/events/${event.id}`);
    assert.strictEqual(detail.status, 200);
    assert.strictEqual(detail.body.organizer_id, organizer.id);

    const update = await otherOrganizer.agent
      .put(`/api/organizer/events/${event.id}`)
      .set('X-CSRF-Token', await getCsrfToken(otherOrganizer))
      .send(eventFields({ title: 'Managed by another organizer' }));
    assert.strictEqual(update.status, 403);

    const deleted = await otherOrganizer.agent
      .delete(`/api/organizer/events/${event.id}`)
      .set('X-CSRF-Token', await getCsrfToken(otherOrganizer));
    assert.strictEqual(deleted.status, 403);
    assert.strictEqual(
      db.prepare('SELECT title FROM events WHERE id = ?').get(event.id).title,
      event.title
    );
  });

  it('allows legacy NULL-owner events to be read but not modified or deleted', async () => {
    const eventId = db.prepare(`
      INSERT INTO events (title, description, date, location, capacity, organizer_id)
      VALUES (?, ?, ?, ?, ?, NULL)
    `).run(
      'Unowned legacy event',
      'Read-only legacy record',
      eventFields().date,
      'Old Hall',
      15
    ).lastInsertRowid;
    const csrfToken = await getCsrfToken(organizer);

    const detail = await organizer.agent.get(`/api/organizer/events/${eventId}`);
    assert.strictEqual(detail.status, 200);
    assert.strictEqual(detail.body.organizer_id, null);

    const update = await organizer.agent
      .put(`/api/organizer/events/${eventId}`)
      .set('X-CSRF-Token', csrfToken)
      .send(eventFields({ title: 'Claimed legacy event' }));
    assert.strictEqual(update.status, 403);

    const deletion = await organizer.agent
      .delete(`/api/organizer/events/${eventId}`)
      .set('X-CSRF-Token', csrfToken);
    assert.strictEqual(deletion.status, 403);
    assert.strictEqual(
      db.prepare('SELECT organizer_id FROM events WHERE id = ?').get(eventId).organizer_id,
      null
    );
  });

  it('rejects missing fields, invalid dates, invalid capacities, and identity fields', async () => {
    const csrfToken = await getCsrfToken(organizer);
    const invalidPayloads = [
      { title: 'Incomplete' },
      eventFields({ date: 'not-a-date' }),
      eventFields({ capacity: 0 }),
      eventFields({ capacity: 1.5 }),
      eventFields({ capacity: '20' }),
      eventFields({ role: 'organizer' }),
      eventFields({ organizerId: organizer.id }),
      eventFields({ organizer_id: organizer.id }),
      eventFields({ userId: organizer.id }),
    ];

    for (const payload of invalidPayloads) {
      const response = await organizer.agent
        .post('/api/organizer/events')
        .set('X-CSRF-Token', csrfToken)
        .send(payload);
      assert.strictEqual(response.status, 400, JSON.stringify(payload));
    }

    assert.strictEqual(db.prepare('SELECT COUNT(*) AS count FROM events').get().count, 0);
  });

  it('rejects reducing capacity below registrations without changing the event', async () => {
    const { event, csrfToken } = await createEvent(organizer, eventFields({ capacity: 2 }));
    const registration = await student.agent.post(`/api/events/${event.id}/register`);
    assert.strictEqual(registration.status, 201);
    const secondRegistration = await secondStudent.agent.post(`/api/events/${event.id}/register`);
    assert.strictEqual(secondRegistration.status, 201);

    const response = await organizer.agent
      .put(`/api/organizer/events/${event.id}`)
      .set('X-CSRF-Token', csrfToken)
      .send(eventFields({ capacity: 1 }));

    assert.strictEqual(response.status, 409);
    assert.strictEqual(db.prepare('SELECT capacity FROM events WHERE id = ?').get(event.id).capacity, 2);
  });

  it('returns 409 when deletion or capacity reduction would invalidate registrations', async () => {
    const { event } = await createEvent(organizer, eventFields({ capacity: 2 }));
    const registration = await student.agent.post(`/api/events/${event.id}/register`);
    assert.strictEqual(registration.status, 201);
    const secondRegistration = await secondStudent.agent.post(`/api/events/${event.id}/register`);
    assert.strictEqual(secondRegistration.status, 201);
    const csrfToken = await getCsrfToken(organizer);

    const deletion = await organizer.agent
      .delete(`/api/organizer/events/${event.id}`)
      .set('X-CSRF-Token', csrfToken);
    assert.strictEqual(deletion.status, 409);

    const capacityUpdate = await organizer.agent
      .put(`/api/organizer/events/${event.id}`)
      .set('X-CSRF-Token', csrfToken)
      .send(eventFields({ capacity: 1 }));
    assert.strictEqual(capacityUpdate.status, 409);

    assert.ok(db.prepare('SELECT id FROM events WHERE id = ?').get(event.id));
    assert.ok(db.prepare('SELECT id FROM registrations WHERE id = ?').get(registration.body.id));
    assert.ok(db.prepare('SELECT id FROM registrations WHERE id = ?').get(secondRegistration.body.id));
  });

  it('requires a valid session-bound CSRF token for organizer writes', async () => {
    const anonymousToken = await request(app).get('/api/organizer/csrf-token');
    assert.strictEqual(anonymousToken.status, 401);
    const studentToken = await student.agent.get('/api/organizer/csrf-token');
    assert.strictEqual(studentToken.status, 403);

    const { event } = await createEvent(organizer);
    const missing = await organizer.agent
      .post('/api/organizer/events')
      .send(eventFields());
    assert.strictEqual(missing.status, 403);

    const missingUpdate = await organizer.agent
      .put(`/api/organizer/events/${event.id}`)
      .send(eventFields());
    assert.strictEqual(missingUpdate.status, 403);

    const missingDelete = await organizer.agent
      .delete(`/api/organizer/events/${event.id}`);
    assert.strictEqual(missingDelete.status, 403);

    const invalid = await organizer.agent
      .post('/api/organizer/events')
      .set('X-CSRF-Token', 'a'.repeat(64))
      .send(eventFields());
    assert.strictEqual(invalid.status, 403);

    const otherSessionToken = await getCsrfToken(otherOrganizer);
    const crossSession = await organizer.agent
      .post('/api/organizer/events')
      .set('X-CSRF-Token', otherSessionToken)
      .send(eventFields());
    assert.strictEqual(crossSession.status, 403);

    const validToken = await getCsrfToken(organizer);
    const valid = await organizer.agent
      .post('/api/organizer/events')
      .set('X-CSRF-Token', validToken)
      .send(eventFields());
    assert.strictEqual(valid.status, 201);
  });

  it('returns 404 for absent events and malformed IDs return 400', async () => {
    const csrfToken = await getCsrfToken(organizer);
    const missingRead = await organizer.agent.get('/api/organizer/events/999999');
    const invalidRead = await organizer.agent.get('/api/organizer/events/01');
    const missingUpdate = await organizer.agent
      .put('/api/organizer/events/999999')
      .set('X-CSRF-Token', csrfToken)
      .send(eventFields());
    const missingDelete = await organizer.agent
      .delete('/api/organizer/events/999999')
      .set('X-CSRF-Token', csrfToken);

    assert.strictEqual(missingRead.status, 404);
    assert.strictEqual(invalidRead.status, 400);
    assert.strictEqual(missingUpdate.status, 404);
    assert.strictEqual(missingDelete.status, 404);
  });
});
