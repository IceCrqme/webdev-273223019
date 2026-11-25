const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-google-oauth-'));
const previousEnv = {
  DB_PATH: process.env.DB_PATH,
  SESSION_SECRET: process.env.SESSION_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
};
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.SESSION_SECRET = 'google-oauth-test-session-secret';
process.env.GOOGLE_CLIENT_ID = `mock-${crypto.randomBytes(12).toString('hex')}`;
process.env.GOOGLE_CLIENT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';

require('../database/init');
const app = require('../src/app');
const db = require('../src/data/db');

const privateKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = privateKey.publicKey.export({ format: 'jwk' });
jwk.kid = 'mock-google-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

let originalFetch;
let expectedNonce;
let claimsOverride;
let tokenSignatureInvalid;
let tokenRequest;
let tokenRequestCount;

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createIdToken(nonce) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: 'https://accounts.google.com',
    aud: process.env.GOOGLE_CLIENT_ID,
    exp: now + 300,
    iat: now,
    nonce,
    sub: 'google-subject-1',
    email: 'google-user@example.com',
    email_verified: true,
    ...claimsOverride,
  };
  const encodedHeader = Buffer.from(JSON.stringify({
    alg: 'RS256',
    kid: jwk.kid,
    typ: 'JWT',
  })).toString('base64url');
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signedInput = `${encodedHeader}.${encodedClaims}`;
  const signature = tokenSignatureInvalid
    ? crypto.randomBytes(256)
    : crypto.sign('RSA-SHA256', Buffer.from(signedInput), privateKey.privateKey);
  return `${signedInput}.${signature.toString('base64url')}`;
}

async function mockedGoogleFetch(url, options = {}) {
  const parsedUrl = new URL(url);
  if (parsedUrl.href === 'https://accounts.google.com/.well-known/openid-configuration') {
    return jsonResponse(200, {
      issuer: 'https://accounts.google.com',
      authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_endpoint: 'https://oauth2.googleapis.com/token',
      jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
    });
  }
  if (parsedUrl.href === 'https://oauth2.googleapis.com/token') {
    tokenRequestCount += 1;
    tokenRequest = options;
    return jsonResponse(200, {
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: createIdToken(expectedNonce),
    });
  }
  if (parsedUrl.href === 'https://www.googleapis.com/oauth2/v3/certs') {
    return jsonResponse(200, { keys: [jwk] });
  }
  throw new Error(`Unexpected mocked Google URL: ${parsedUrl.href}`);
}

async function startGoogleFlow(agent, url = '/api/auth/google') {
  const response = await agent.get(url);
  assert.strictEqual(response.status, 302);
  const authorizationUrl = new URL(response.headers.location);
  expectedNonce = authorizationUrl.searchParams.get('nonce');
  return {
    state: authorizationUrl.searchParams.get('state'),
    authorizationUrl,
    cookie: response.headers['set-cookie']?.[0],
  };
}

async function startGoogleLinkFlow(agent) {
  const tokenResponse = await agent.get('/api/auth/google/link/csrf-token');
  assert.strictEqual(tokenResponse.status, 200);
  const response = await agent
    .post('/api/auth/google/link')
    .set('X-CSRF-Token', tokenResponse.body.csrfToken);
  assert.strictEqual(response.status, 200);
  const authorizationUrl = new URL(response.body.authorizationUrl);
  expectedNonce = authorizationUrl.searchParams.get('nonce');
  return {
    state: authorizationUrl.searchParams.get('state'),
    authorizationUrl,
  };
}

async function finishGoogleFlow(agent, state, query = {}) {
  return agent
    .get('/api/auth/google/callback')
    .query({ state, code: 'mock-authorization-code', ...query });
}

function insertUser({ email, role = 'student', googleId = null, password = null }) {
  const result = db.prepare(`
    INSERT INTO users (email, password, google_id, role)
    VALUES (?, ?, ?, ?)
  `).run(email, password, googleId, role);
  return Number(result.lastInsertRowid);
}

describe('AC-3, AC-15: Google OpenID Connect', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM users').run();
    originalFetch = global.fetch;
    global.fetch = mockedGoogleFetch;
    expectedNonce = undefined;
    claimsOverride = {};
    tokenSignatureInvalid = false;
    tokenRequest = undefined;
    tokenRequestCount = 0;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  after(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('AC-3, AC-15: signs in a verified first-time Google user with state, nonce, PKCE, and a regenerated session', async () => {
    const agent = request.agent(app);
    const flow = await startGoogleFlow(agent);

    assert.ok(flow.state);
    assert.ok(flow.authorizationUrl.searchParams.get('nonce'));
    assert.strictEqual(flow.authorizationUrl.searchParams.get('response_type'), 'code');
    assert.strictEqual(flow.authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(flow.authorizationUrl.searchParams.get('code_challenge'));
    assert.match(flow.authorizationUrl.searchParams.get('scope'), /openid/);

    const response = await finishGoogleFlow(agent, flow.state);
    assert.strictEqual(response.status, 303);
    assert.strictEqual(response.headers.location, '/');
    assert.ok(flow.cookie);
    assert.notStrictEqual(
      response.headers['set-cookie']?.[0]?.split(';')[0],
      flow.cookie.split(';')[0]
    );

    const tokenBody = new URLSearchParams(tokenRequest.body);
    const verifier = tokenBody.get('code_verifier');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    assert.strictEqual(challenge, flow.authorizationUrl.searchParams.get('code_challenge'));
    assert.strictEqual(tokenBody.get('client_secret'), process.env.GOOGLE_CLIENT_SECRET);

    const profile = await agent.get('/api/auth/me');
    assert.strictEqual(profile.status, 200);
    assert.strictEqual(profile.body.email, 'google-user@example.com');
    assert.strictEqual(profile.body.role, 'student');
    assert.ok(db.prepare('SELECT id FROM users WHERE google_id = ?').get('google-subject-1'));
  });

  it('AC-3, AC-15: signs in an existing Google subject and preserves its database role', async () => {
    const userId = insertUser({
      email: 'organizer-google@example.com',
      role: 'organizer',
      googleId: 'google-subject-1',
    });
    claimsOverride = { email: 'changed-google-email@example.com' };
    const agent = request.agent(app);
    const flow = await startGoogleFlow(agent);

    const response = await finishGoogleFlow(agent, flow.state);

    assert.strictEqual(response.headers.location, '/organizer.html');
    const profile = await agent.get('/api/auth/me');
    assert.deepStrictEqual(profile.body, {
      id: userId,
      email: 'organizer-google@example.com',
      role: 'organizer',
    });
  });

  it('AC-3: rejects denied consent without creating or authenticating an account', async () => {
    const agent = request.agent(app);
    const flow = await startGoogleFlow(agent);

    const response = await agent
      .get('/api/auth/google/callback')
      .query({ state: flow.state, error: 'access_denied' });

    assert.strictEqual(response.status, 303);
    assert.strictEqual(response.headers.location, '/login.html?google=denied');
    assert.strictEqual(tokenRequestCount, 0);
    assert.strictEqual((await agent.get('/api/auth/me')).status, 401);
  });

  it('AC-3: rejects an invalid state before exchanging the authorization code', async () => {
    const agent = request.agent(app);
    await startGoogleFlow(agent);

    const response = await finishGoogleFlow(agent, 'attacker-controlled-state');

    assert.strictEqual(response.status, 303);
    assert.strictEqual(response.headers.location, '/login.html?google=invalid_state');
    assert.strictEqual(tokenRequestCount, 0);
    assert.strictEqual((await agent.get('/api/auth/me')).status, 401);
  });

  it('AC-3: rejects an ID token with an invalid signature', async () => {
    tokenSignatureInvalid = true;
    const agent = request.agent(app);
    const flow = await startGoogleFlow(agent);

    const response = await finishGoogleFlow(agent, flow.state);

    assert.strictEqual(response.headers.location, '/login.html?google=failed');
    assert.strictEqual((await agent.get('/api/auth/me')).status, 401);
    assert.strictEqual(db.prepare('SELECT id FROM users WHERE google_id = ?').get('google-subject-1'), undefined);
  });

  it('AC-3: rejects a validly signed token with an unverified email', async () => {
    claimsOverride = { email_verified: false };
    const agent = request.agent(app);
    const flow = await startGoogleFlow(agent);

    const response = await finishGoogleFlow(agent, flow.state);

    assert.strictEqual(response.headers.location, '/login.html?google=failed');
    assert.strictEqual((await agent.get('/api/auth/me')).status, 401);
  });

  it('AC-3: rejects tokens with a mismatched nonce, audience, or issuer', async () => {
    for (const invalidClaims of [
      { nonce: 'another-flow-nonce' },
      { aud: 'different-client' },
      { iss: 'https://attacker.example' },
    ]) {
      claimsOverride = invalidClaims;
      const agent = request.agent(app);
      const flow = await startGoogleFlow(agent);
      const response = await finishGoogleFlow(agent, flow.state);

      assert.strictEqual(response.headers.location, '/login.html?google=failed');
      assert.strictEqual((await agent.get('/api/auth/me')).status, 401);
    }
  });

  it('AC-3: rejects a first-time Google identity whose verified email already belongs to a local account', async () => {
    const localAgent = request.agent(app);
    await localAgent.post('/api/auth/register').send({
      email: 'google-user@example.com',
      password: 'securePassword123',
    });
    const user = db.prepare('SELECT id, google_id FROM users WHERE email = ?')
      .get('google-user@example.com');
    const agent = request.agent(app);
    const flow = await startGoogleFlow(agent);

    const response = await finishGoogleFlow(agent, flow.state);

    assert.strictEqual(response.headers.location, '/login.html?google=conflict');
    assert.strictEqual(user.google_id, null);
    assert.strictEqual(
      db.prepare('SELECT google_id FROM users WHERE id = ?').get(user.id).google_id,
      null
    );
    assert.strictEqual((await agent.get('/api/auth/me')).status, 401);
  });

  it('AC-3: links only after explicit intent from an authenticated account and rejects linked-subject conflicts', async () => {
    const linkedUserId = insertUser({
      email: 'another-user@example.com',
      googleId: 'google-subject-1',
    });
    const localAgent = request.agent(app);
    const registration = await localAgent.post('/api/auth/register').send({
      email: 'local-user@example.com',
      password: 'securePassword123',
    });
    assert.strictEqual(registration.status, 201);
    const localUserId = registration.body.id;
    const flow = await startGoogleLinkFlow(localAgent);

    const response = await finishGoogleFlow(localAgent, flow.state);

    assert.strictEqual(response.headers.location, '/login.html?google=link_conflict');
    assert.strictEqual(
      db.prepare('SELECT google_id FROM users WHERE id = ?').get(localUserId).google_id,
      null
    );
    assert.strictEqual(
      db.prepare('SELECT google_id FROM users WHERE id = ?').get(linkedUserId).google_id,
      'google-subject-1'
    );
    assert.strictEqual((await localAgent.get('/api/auth/me')).body.id, localUserId);
  });

  it('AC-3: links a verified Google subject to the explicitly authenticated account', async () => {
    claimsOverride = {
      email: 'a-different-verified-address@example.com',
    };
    const localAgent = request.agent(app);
    const registration = await localAgent.post('/api/auth/register').send({
      email: 'link-target@example.com',
      password: 'securePassword123',
    });
    const flow = await startGoogleLinkFlow(localAgent);

    const response = await finishGoogleFlow(localAgent, flow.state);

    assert.strictEqual(response.headers.location, '/login.html?google=linked');
    assert.strictEqual(
      db.prepare('SELECT google_id FROM users WHERE id = ?').get(registration.body.id).google_id,
      'google-subject-1'
    );
    assert.strictEqual((await localAgent.get('/api/auth/me')).body.id, registration.body.id);
  });

  it('AC-3: rejects linking a second, different Google identity to the same account', async () => {
    claimsOverride = { sub: 'google-subject-2' };
    const localAgent = request.agent(app);
    const registration = await localAgent.post('/api/auth/register').send({
      email: 'link-another-google@example.com',
      password: 'securePassword123',
    });
    db.prepare('UPDATE users SET google_id = ? WHERE id = ?')
      .run('original-google-subject', registration.body.id);
    const flow = await startGoogleLinkFlow(localAgent);

    const response = await finishGoogleFlow(localAgent, flow.state);

    assert.strictEqual(response.headers.location, '/login.html?google=link_conflict');
    assert.strictEqual(
      db.prepare('SELECT google_id FROM users WHERE id = ?').get(registration.body.id).google_id,
      'original-google-subject'
    );
    assert.strictEqual((await localAgent.get('/api/auth/me')).body.id, registration.body.id);
  });

  it('AC-3: requires an authenticated user to initiate account linking', async () => {
    const agent = request.agent(app);
    const token = await agent.get('/api/auth/google/link/csrf-token');
    const response = await agent.post('/api/auth/google/link');
    assert.strictEqual(token.status, 401);
    assert.strictEqual(response.status, 401);
    assert.strictEqual(tokenRequestCount, 0);
  });

  it('AC-3: requires a session CSRF token before starting an authenticated link flow', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'csrf-link@example.com',
      password: 'securePassword123',
    });

    const response = await agent.post('/api/auth/google/link');

    assert.strictEqual(response.status, 403);
    assert.strictEqual(tokenRequestCount, 0);
  });

  it('AC-3: reports missing OAuth configuration while email/password login remains available', async () => {
    const localAgent = request.agent(app);
    await localAgent.post('/api/auth/register').send({
      email: 'oauth-disabled@example.com',
      password: 'securePassword123',
    });
    delete process.env.GOOGLE_CLIENT_SECRET;

    const unavailable = await request(app).get('/api/auth/google');
    const login = await request(app).post('/api/auth/login').send({
      email: 'oauth-disabled@example.com',
      password: 'securePassword123',
    });

    assert.strictEqual(unavailable.status, 303);
    assert.strictEqual(unavailable.headers.location, '/login.html?google=unavailable');
    assert.strictEqual(login.status, 200);
    assert.strictEqual(tokenRequestCount, 0);
  });
});
