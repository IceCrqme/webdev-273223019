const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const modulePaths = [
  '../database/init',
  '../src/app',
  '../src/data/db',
  '../src/services/authService',
  '../src/services/eventService',
  '../src/routes/authRoutes',
  '../src/routes/eventRoutes',
  '../src/middleware/sessionAuthorization',
].map((modulePath) => path.resolve(__dirname, modulePath));

describe('server-side session and role authorization', () => {
  let app;
  let db;
  let tmpDir;
  let originalDbPath;
  let originalSessionSecret;
  let originalModules;

  before(() => {
    originalDbPath = process.env.DB_PATH;
    originalSessionSecret = process.env.SESSION_SECRET;
    originalModules = new Map(modulePaths.map((modulePath) => [
      modulePath,
      require.cache[modulePath],
    ]));

    for (const modulePath of modulePaths) {
      delete require.cache[modulePath];
    }

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-authz-test-'));
    process.env.DB_PATH = path.join(tmpDir, 'test.db');
    process.env.SESSION_SECRET = 'authorization-test-secret';

    require('../database/init');
    app = require('../src/app');
    db = require('../src/data/db');

    const {
      loadAuthenticatedUser,
      requireRole,
    } = require('../src/middleware/sessionAuthorization');
    const authorizationRoutes = express.Router();
    const organizerOnly = [
      loadAuthenticatedUser,
      requireRole('organizer'),
    ];

    authorizationRoutes.get('/organizer', ...organizerOnly, (req, res) => {
      res.json(req.authenticatedUser);
    });
    authorizationRoutes.post('/organizer', ...organizerOnly, (req, res) => {
      res.json(req.authenticatedUser);
    });
    app.use('/__test/authorization', authorizationRoutes);
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

  async function register(agent, email) {
    const response = await agent
      .post('/api/auth/register')
      .send({ email, password: 'securePassword123' });
    assert.strictEqual(response.status, 201);
    return response.body;
  }

  it('returns 401 for anonymous organizer access', async () => {
    const response = await request(app).get('/__test/authorization/organizer');
    assert.strictEqual(response.status, 401);
    assert.strictEqual(response.body.error, 'Not authenticated');
  });

  it('returns 403 for a student despite forged organizer fields', async () => {
    const student = request.agent(app);
    const user = await register(student, 'student-authz@example.com');

    const response = await student
      .post('/__test/authorization/organizer')
      .send({ role: 'organizer', userId: user.id + 1000 });

    assert.strictEqual(response.status, 403);
    assert.strictEqual(response.body.error, 'Forbidden');
  });

  it('uses the current database role rather than a role cached in the session', async () => {
    const userAgent = request.agent(app);
    const user = await register(userAgent, 'changing-role@example.com');

    db.prepare("UPDATE users SET role = 'organizer' WHERE id = ?").run(user.id);
    const promoted = await userAgent.get('/__test/authorization/organizer');
    assert.strictEqual(promoted.status, 200);
    assert.strictEqual(promoted.body.id, user.id);
    assert.strictEqual(promoted.body.role, 'organizer');

    db.prepare("UPDATE users SET role = 'student' WHERE id = ?").run(user.id);
    const demoted = await userAgent.get('/__test/authorization/organizer');
    assert.strictEqual(demoted.status, 403);
  });

  it('authorizes a database-provisioned organizer and ignores forged identity fields', async () => {
    const organizer = request.agent(app);
    const user = await register(organizer, 'organizer-authz@example.com');
    const otherUser = await register(request.agent(app), 'other-user-authz@example.com');
    db.prepare("UPDATE users SET role = 'organizer' WHERE id = ?").run(user.id);

    const response = await organizer
      .post('/__test/authorization/organizer')
      .send({ role: 'student', userId: otherUser.id });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.id, user.id);
    assert.strictEqual(response.body.role, 'organizer');
  });
});
