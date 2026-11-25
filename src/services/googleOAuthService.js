const crypto = require('node:crypto');

const DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';
const EXPECTED_ISSUER = 'https://accounts.google.com';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_ID_TOKEN_LENGTH = 20000;

function getConfiguration() {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_REDIRECT_URI: redirectUri } = process.env;
  if (!clientId || !clientSecret || !redirectUri) return null;

  let parsedRedirectUri;
  try {
    parsedRedirectUri = new URL(redirectUri);
  } catch (error) {
    return null;
  }

  const localHttp = parsedRedirectUri.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(parsedRedirectUri.hostname);
  if (
    (parsedRedirectUri.protocol !== 'https:' && !localHttp)
    || parsedRedirectUri.username
    || parsedRedirectUri.password
    || parsedRedirectUri.search
    || parsedRedirectUri.hash
    || parsedRedirectUri.pathname !== '/api/auth/google/callback'
  ) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

function isTrustedGoogleEndpoint(endpoint, allowedHosts) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:'
      && allowedHosts.includes(url.hostname)
      && !url.port
      && !url.username
      && !url.password;
  } catch (error) {
    return false;
  }
}

function createGoogleOAuthService({
  fetchImpl = (...args) => global.fetch(...args),
  now = () => Date.now(),
} = {}) {
  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        ...options,
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('OAUTH_PROVIDER_ERROR');
      const body = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new Error('OAUTH_PROVIDER_ERROR');
      }
      return body;
    } catch (error) {
      if (error.message === 'OAUTH_PROVIDER_ERROR') throw error;
      throw new Error('OAUTH_PROVIDER_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getProviderMetadata() {
    const metadata = await fetchJson(DISCOVERY_URL);
    if (
      metadata.issuer !== EXPECTED_ISSUER
      || !isTrustedGoogleEndpoint(metadata.authorization_endpoint, ['accounts.google.com'])
      || !isTrustedGoogleEndpoint(metadata.token_endpoint, ['oauth2.googleapis.com'])
      || !isTrustedGoogleEndpoint(metadata.jwks_uri, ['www.googleapis.com'])
    ) {
      throw new Error('OAUTH_PROVIDER_ERROR');
    }
    return metadata;
  }

  function isConfigured() {
    return Boolean(getConfiguration());
  }

  async function createAuthorizationUrl({ state, nonce, codeChallenge }) {
    const config = getConfiguration();
    if (!config) throw new Error('OAUTH_NOT_CONFIGURED');

    const metadata = await getProviderMetadata();
    const url = new URL(metadata.authorization_endpoint);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  function parseJwtPart(value) {
    try {
      return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    } catch (error) {
      throw new Error('OAUTH_INVALID_ID_TOKEN');
    }
  }

  function constantTimeEqual(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  async function verifyIdToken(idToken, metadata, config, expectedNonce) {
    if (typeof idToken !== 'string' || idToken.length > MAX_ID_TOKEN_LENGTH) {
      throw new Error('OAUTH_INVALID_ID_TOKEN');
    }

    const parts = idToken.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) {
      throw new Error('OAUTH_INVALID_ID_TOKEN');
    }

    const header = parseJwtPart(parts[0]);
    const claims = parseJwtPart(parts[1]);
    if (
      header.alg !== 'RS256'
      || typeof header.kid !== 'string'
      || !header.kid
      || claims.iss !== EXPECTED_ISSUER
      || !(
        claims.aud === config.clientId
        || (Array.isArray(claims.aud) && claims.aud.includes(config.clientId))
      )
      || (claims.azp !== undefined && claims.azp !== config.clientId)
      || (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== config.clientId)
    ) {
      throw new Error('OAUTH_INVALID_ID_TOKEN');
    }

    const nowSeconds = Math.floor(now() / 1000);
    if (
      typeof claims.exp !== 'number'
      || claims.exp <= nowSeconds - 60
      || typeof claims.iat !== 'number'
      || claims.iat > nowSeconds + 60
      || claims.iat < nowSeconds - 10 * 60
      || (claims.nbf !== undefined && (
        typeof claims.nbf !== 'number' || claims.nbf > nowSeconds + 60
      ))
      || !constantTimeEqual(claims.nonce, expectedNonce)
      || typeof claims.sub !== 'string'
      || !claims.sub
      || claims.sub.length > 255
      || typeof claims.email !== 'string'
      || claims.email_verified !== true
    ) {
      throw new Error('OAUTH_INVALID_ID_TOKEN');
    }

    const jwks = await fetchJson(metadata.jwks_uri);
    if (!Array.isArray(jwks.keys)) throw new Error('OAUTH_INVALID_ID_TOKEN');
    const key = jwks.keys.find((candidate) => (
      candidate
      && candidate.kid === header.kid
      && candidate.kty === 'RSA'
      && (!candidate.alg || candidate.alg === 'RS256')
      && (!candidate.use || candidate.use === 'sig')
      && (!Array.isArray(candidate.key_ops) || candidate.key_ops.includes('verify'))
    ));
    if (!key) throw new Error('OAUTH_INVALID_ID_TOKEN');

    let isValidSignature = false;
    try {
      const publicKey = crypto.createPublicKey({ key, format: 'jwk' });
      isValidSignature = crypto.verify(
        'RSA-SHA256',
        Buffer.from(`${parts[0]}.${parts[1]}`),
        publicKey,
        Buffer.from(parts[2], 'base64url')
      );
    } catch (error) {
      throw new Error('OAUTH_INVALID_ID_TOKEN');
    }
    if (!isValidSignature) throw new Error('OAUTH_INVALID_ID_TOKEN');

    return {
      subject: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified,
    };
  }

  async function exchangeCodeAndVerifyIdentity({ code, codeVerifier, nonce }) {
    const config = getConfiguration();
    if (!config) throw new Error('OAUTH_NOT_CONFIGURED');
    if (
      typeof code !== 'string'
      || !code
      || code.length > 4096
      || typeof codeVerifier !== 'string'
      || !nonce
    ) {
      throw new Error('OAUTH_INVALID_RESPONSE');
    }

    const metadata = await getProviderMetadata();
    const tokenBody = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    });
    const tokens = await fetchJson(metadata.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
    return verifyIdToken(tokens.id_token, metadata, config, nonce);
  }

  return {
    isConfigured,
    createAuthorizationUrl,
    exchangeCodeAndVerifyIdentity,
  };
}

module.exports = { createGoogleOAuthService };
