const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createGoogleOAuthService } = require('../src/services/googleOAuthService');

const CLIENT_ID = 'oauth-service-test-client';
const CLIENT_SECRET = 'oauth-service-test-secret';
const REDIRECT_URI = 'https://app.example.test/api/auth/google/callback';
const EXPECTED_NONCE = 'oauth-service-test-nonce';
const NOW_SECONDS = 1_800_000_000;
const DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const metadata = {
  issuer: 'https://accounts.google.com',
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: TOKEN_URL,
  jwks_uri: JWKS_URL,
};
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: 'jwk' }),
  kid: 'oauth-service-test-key',
  alg: 'RS256',
  use: 'sig',
  key_ops: ['verify'],
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createIdToken({ header = {}, claims = {}, signature = true, rawHeader, rawClaims } = {}) {
  const defaultHeader = {
    alg: 'RS256',
    kid: jwk.kid,
    typ: 'JWT',
  };
  const defaultClaims = {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    exp: NOW_SECONDS + 300,
    iat: NOW_SECONDS,
    nonce: EXPECTED_NONCE,
    sub: 'oauth-service-subject',
    email: 'oauth-service@example.test',
    email_verified: true,
  };
  const encodedHeader = rawHeader ?? encode({ ...defaultHeader, ...header });
  const encodedClaims = rawClaims ?? encode({ ...defaultClaims, ...claims });
  const signedInput = `${encodedHeader}.${encodedClaims}`;
  const signatureBytes = signature
    ? crypto.sign('RSA-SHA256', Buffer.from(signedInput), keys.privateKey)
    : crypto.randomBytes(256);
  return `${signedInput}.${signatureBytes.toString('base64url')}`;
}

function createFetch({
  discovery = jsonResponse(metadata),
  token = jsonResponse({ id_token: createIdToken() }),
  jwks = jsonResponse({ keys: [jwk] }),
  onRequest = () => {},
} = {}) {
  return async (url, options) => {
    onRequest(url, options);
    if (url === DISCOVERY_URL) return discovery;
    if (url === TOKEN_URL) return token;
    if (url === JWKS_URL) return jwks;
    throw new Error(`Unexpected OAuth URL: ${url}`);
  };
}

function createService(options = {}) {
  return createGoogleOAuthService({
    fetchImpl: createFetch(),
    now: () => NOW_SECONDS * 1000,
    ...options,
  });
}

async function exchangeWith(options = {}) {
  const {
    idToken = createIdToken(),
    discovery,
    token,
    jwks,
    onRequest,
  } = options;
  const fetchImpl = createFetch({
    discovery,
    token: token ?? jsonResponse({ id_token: idToken }),
    jwks,
    onRequest,
  });
  const service = createGoogleOAuthService({
    fetchImpl,
    now: () => NOW_SECONDS * 1000,
  });
  return service.exchangeCodeAndVerifyIdentity({
    code: 'authorization-code',
    codeVerifier: 'code-verifier',
    nonce: EXPECTED_NONCE,
  });
}

describe('Google OAuth service', () => {
  const environmentNames = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
  ];
  let originalEnvironment;

  beforeEach(() => {
    originalEnvironment = Object.fromEntries(
      environmentNames.map((name) => [name, process.env[name]])
    );
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = CLIENT_SECRET;
    process.env.GOOGLE_REDIRECT_URI = REDIRECT_URI;
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('accepts a trusted local redirect and rejects incomplete or malformed configuration', async () => {
    const service = createService();
    assert.strictEqual(service.isConfigured(), true);

    for (const name of environmentNames) {
      const saved = process.env[name];
      delete process.env[name];
      assert.strictEqual(service.isConfigured(), false);
      await assert.rejects(
        service.createAuthorizationUrl({ state: 's', nonce: 'n', codeChallenge: 'c' }),
        { message: 'OAUTH_NOT_CONFIGURED' }
      );
      process.env[name] = saved;
    }

    for (const redirectUri of [
      'not a URL',
      'http://example.test/api/auth/google/callback',
      'https://user@app.example.test/api/auth/google/callback',
      'https://user:pass@app.example.test/api/auth/google/callback',
      'https://app.example.test/api/auth/google/callback?code=bad',
      'https://app.example.test/api/auth/google/callback#fragment',
      'https://app.example.test/wrong-callback',
    ]) {
      process.env.GOOGLE_REDIRECT_URI = redirectUri;
      assert.strictEqual(service.isConfigured(), false, redirectUri);
    }

    process.env.GOOGLE_REDIRECT_URI = 'http://127.0.0.1/api/auth/google/callback';
    assert.strictEqual(service.isConfigured(), true);
  });

  it('builds a PKCE authorization URL using trusted provider metadata', async () => {
    const requests = [];
    const service = createGoogleOAuthService({
      fetchImpl: createFetch({ onRequest: (url, options) => requests.push({ url, options }) }),
    });

    const result = new URL(await service.createAuthorizationUrl({
      state: 'state-value',
      nonce: 'nonce-value',
      codeChallenge: 'challenge-value',
    }));

    assert.strictEqual(result.origin, 'https://accounts.google.com');
    assert.strictEqual(result.searchParams.get('client_id'), CLIENT_ID);
    assert.strictEqual(result.searchParams.get('redirect_uri'), REDIRECT_URI);
    assert.strictEqual(result.searchParams.get('scope'), 'openid email profile');
    assert.strictEqual(result.searchParams.get('state'), 'state-value');
    assert.strictEqual(result.searchParams.get('nonce'), 'nonce-value');
    assert.strictEqual(result.searchParams.get('code_challenge'), 'challenge-value');
    assert.strictEqual(result.searchParams.get('code_challenge_method'), 'S256');
    assert.strictEqual(requests[0].options.redirect, 'error');
    assert.ok(requests[0].options.signal instanceof AbortSignal);
  });

  it('clears the provider request timeout after a successful response', async () => {
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const timeoutHandle = {};
    let scheduledDelay;
    let clearedHandle;
    global.setTimeout = (callback, delay) => {
      assert.strictEqual(typeof callback, 'function');
      scheduledDelay = delay;
      return timeoutHandle;
    };
    global.clearTimeout = (handle) => {
      clearedHandle = handle;
    };

    try {
      const service = createGoogleOAuthService({
        fetchImpl: createFetch(),
      });
      await service.createAuthorizationUrl({
        state: 'state-value',
        nonce: 'nonce-value',
        codeChallenge: 'challenge-value',
      });

      assert.strictEqual(scheduledDelay, 10000);
      assert.strictEqual(clearedHandle, timeoutHandle);
    } finally {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  });

  it('rejects untrusted or malformed discovery metadata and provider responses', async () => {
    const invalidMetadata = [
      { ...metadata, issuer: 'https://attacker.example' },
      { ...metadata, authorization_endpoint: 'not a URL' },
      { ...metadata, authorization_endpoint: 'https://evil.example/authorize' },
      { ...metadata, authorization_endpoint: 'http://accounts.google.com/authorize' },
      { ...metadata, authorization_endpoint: 'https://accounts.google.com:444/authorize' },
      { ...metadata, token_endpoint: 'https://user@oauth2.googleapis.com/token' },
      { ...metadata, jwks_uri: 'https://www.googleapis.com:444/keys' },
    ];

    for (const discovery of invalidMetadata) {
      const service = createGoogleOAuthService({
        fetchImpl: createFetch({ discovery: jsonResponse(discovery) }),
      });
      await assert.rejects(
        service.createAuthorizationUrl({ state: 's', nonce: 'n', codeChallenge: 'c' }),
        { message: 'OAUTH_PROVIDER_ERROR' }
      );
    }

    for (const discovery of [
      jsonResponse(null),
      jsonResponse([]),
      jsonResponse(metadata, 503),
      { ok: true, json: async () => { throw new Error('invalid JSON'); } },
      null,
    ]) {
      const service = createGoogleOAuthService({
        fetchImpl: async () => discovery,
      });
      await assert.rejects(
        service.createAuthorizationUrl({ state: 's', nonce: 'n', codeChallenge: 'c' }),
        { message: 'OAUTH_PROVIDER_ERROR' }
      );
    }

    const providerError = createGoogleOAuthService({
      fetchImpl: async () => { throw new Error('network unavailable'); },
    });
    await assert.rejects(
      providerError.createAuthorizationUrl({ state: 's', nonce: 'n', codeChallenge: 'c' }),
      { message: 'OAUTH_PROVIDER_ERROR' }
    );
  });

  it('rejects malformed exchange inputs before making provider requests', async () => {
    const service = createService();

    for (const input of [
      { code: '', codeVerifier: 'v', nonce: 'n' },
      { code: 'c'.repeat(4097), codeVerifier: 'v', nonce: 'n' },
      { code: 'code', codeVerifier: 12, nonce: 'n' },
      { code: 'code', codeVerifier: 'v', nonce: '' },
    ]) {
      await assert.rejects(
        service.exchangeCodeAndVerifyIdentity(input),
        { message: 'OAUTH_INVALID_RESPONSE' }
      );
    }

    delete process.env.GOOGLE_CLIENT_SECRET;
    await assert.rejects(
      service.exchangeCodeAndVerifyIdentity({
        code: 'code',
        codeVerifier: 'verifier',
        nonce: 'nonce',
      }),
      { message: 'OAUTH_NOT_CONFIGURED' }
    );
  });

  it('verifies single and multi-audience tokens with valid authorized parties', async () => {
    for (const claims of [
      { aud: [CLIENT_ID] },
      { azp: CLIENT_ID },
      { aud: ['other-client', CLIENT_ID], azp: CLIENT_ID },
    ]) {
      assert.deepStrictEqual(await exchangeWith({
        idToken: createIdToken({ claims }),
      }), {
        subject: 'oauth-service-subject',
        email: 'oauth-service@example.test',
        emailVerified: true,
      });
    }
  });

  it('rejects malformed compact tokens, headers, and audience claims', async () => {
    const malformedJson = Buffer.from('not json').toString('base64url');
    for (const idToken of [
      null,
      42,
      'x'.repeat(20001),
      'one.two',
      '..',
      `${malformedJson}.${encode({})}.signature`,
      `${encode({ alg: 'RS256', kid: jwk.kid })}.${malformedJson}.signature`,
      createIdToken({ header: { alg: 'none' } }),
      createIdToken({ header: { kid: 12 } }),
      createIdToken({ header: { kid: '' } }),
      createIdToken({ claims: { iss: 'https://invalid.example' } }),
      createIdToken({ claims: { aud: 'other-client' } }),
      createIdToken({ claims: { azp: 'other-client' } }),
      createIdToken({ claims: { aud: ['other-client', CLIENT_ID] } }),
    ]) {
      await assert.rejects(exchangeWith({ idToken }), { message: 'OAUTH_INVALID_ID_TOKEN' });
    }
  });

  it('rejects invalid time, nonce, subject, and email claims', async () => {
    const invalidClaims = [
      { exp: 'later' },
      { exp: NOW_SECONDS - 60 },
      { iat: 'now' },
      { iat: NOW_SECONDS + 61 },
      { iat: NOW_SECONDS - 601 },
      { nbf: 'now' },
      { nbf: NOW_SECONDS + 61 },
      { nonce: 42 },
      { sub: 42 },
      { sub: '' },
      { sub: 's'.repeat(256) },
      { email: 42 },
      { email_verified: false },
    ];

    for (const claims of invalidClaims) {
      await assert.rejects(
        exchangeWith({ idToken: createIdToken({ claims }) }),
        { message: 'OAUTH_INVALID_ID_TOKEN' }
      );
    }
  });

  it('rejects unavailable signing keys, unsupported key operations, and malformed JWKs', async () => {
    const validToken = createIdToken();
    for (const jwks of [
      { keys: 'not-an-array' },
      { keys: [] },
      { keys: [null] },
      { keys: [{ ...jwk, kid: 'different-key' }] },
      { keys: [{ ...jwk, kty: 'EC' }] },
      { keys: [{ ...jwk, alg: 'HS256' }] },
      { keys: [{ ...jwk, use: 'enc' }] },
      { keys: [{ ...jwk, key_ops: ['sign'] }] },
      { keys: [{ kid: jwk.kid, kty: 'RSA', n: 1, e: 1 }] },
    ]) {
      await assert.rejects(
        exchangeWith({ idToken: validToken, jwks: jsonResponse(jwks) }),
        { message: 'OAUTH_INVALID_ID_TOKEN' }
      );
    }

    const optionalKeyMetadata = { ...jwk };
    delete optionalKeyMetadata.alg;
    delete optionalKeyMetadata.use;
    delete optionalKeyMetadata.key_ops;
    const identity = await exchangeWith({
      idToken: validToken,
      jwks: jsonResponse({ keys: [optionalKeyMetadata] }),
    });
    assert.strictEqual(identity.subject, 'oauth-service-subject');
  });
});
