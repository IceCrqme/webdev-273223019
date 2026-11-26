const express = require('express');
const crypto = require('node:crypto');
const router = express.Router();
const authService = require('../services/authService');
const { createGoogleOAuthService } = require('../services/googleOAuthService');
const {
  loadAuthenticatedUser,
} = require('../middleware/sessionAuthorization');
const {
  issueCsrfToken,
  requireCsrfToken,
} = require('../middleware/csrfProtection');

const googleOAuthService = createGoogleOAuthService();

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function redirectGoogleStatus(res, status) {
  res.set('Cache-Control', 'no-store');
  return res.redirect(303, `/login.html?google=${status}`);
}

async function startGoogleFlow(req, res, intent, userId, returnAuthorizationUrl = false) {
  if (!googleOAuthService.isConfigured()) {
    if (returnAuthorizationUrl) {
      return res.status(503).json({ error: 'Google sign-in is not configured' });
    }
    return redirectGoogleStatus(res, 'unavailable');
  }

  const state = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  try {
    const authorizationUrl = await googleOAuthService.createAuthorizationUrl({
      state,
      nonce,
      codeChallenge,
    });
    req.session.googleOAuth = {
      state,
      nonce,
      codeVerifier,
      intent,
      ...(intent === 'link' ? { userId } : {}),
    };
    await saveSession(req);
    res.set('Cache-Control', 'no-store');
    if (returnAuthorizationUrl) return res.json({ authorizationUrl });
    return res.redirect(302, authorizationUrl);
  } catch (error) {
    delete req.session.googleOAuth;
    if (returnAuthorizationUrl) {
      return res.status(503).json({ error: 'Google sign-in is unavailable' });
    }
    return redirectGoogleStatus(res, 'unavailable');
  }
}

function stateMatches(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function regenerateSessionForUser(req, res, user) {
  req.session.regenerate((error) => {
    if (error) return redirectGoogleStatus(res, 'failed');
    req.session.userId = user.id;
    req.session.save((saveError) => {
      if (saveError) return redirectGoogleStatus(res, 'failed');
      return res.redirect(303, user.role === 'organizer' ? '/organizer.html' : '/');
    });
  });
}

router.get('/google', (req, res) => startGoogleFlow(req, res, 'login'));

router.get('/google/link/csrf-token', loadAuthenticatedUser, issueCsrfToken);

router.post(
  '/google/link',
  loadAuthenticatedUser,
  requireCsrfToken,
  (req, res) => startGoogleFlow(req, res, 'link', req.authenticatedUser.id, true)
);

router.get('/google/callback', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const flow = req.session?.googleOAuth;
  if (!flow || !stateMatches(flow.state, req.query.state)) {
    return redirectGoogleStatus(res, 'invalid_state');
  }

  delete req.session.googleOAuth;
  try {
    await saveSession(req);
  } catch (error) {
    return redirectGoogleStatus(res, 'failed');
  }

  if (req.query.error) {
    return redirectGoogleStatus(res, req.query.error === 'access_denied' ? 'denied' : 'failed');
  }
  if (
    typeof req.query.code !== 'string'
    || !req.query.code
    || (flow.intent !== 'login' && flow.intent !== 'link')
  ) {
    return redirectGoogleStatus(res, 'failed');
  }
  if (flow.intent === 'link' && req.session.userId !== flow.userId) {
    return redirectGoogleStatus(res, 'link_requires_login');
  }

  let identity;
  try {
    identity = await googleOAuthService.exchangeCodeAndVerifyIdentity({
      code: req.query.code,
      codeVerifier: flow.codeVerifier,
      nonce: flow.nonce,
    });
  } catch (error) {
    return redirectGoogleStatus(res, 'failed');
  }

  if (flow.intent === 'link') {
    if (req.session.userId !== flow.userId) {
      return redirectGoogleStatus(res, 'link_requires_login');
    }
    try {
      await authService.linkGoogleAccount(flow.userId, identity.subject);
      return redirectGoogleStatus(res, 'linked');
    } catch (error) {
      if (
        error.message === 'GOOGLE_ACCOUNT_LINKED'
        || error.message === 'GOOGLE_ACCOUNT_ALREADY_LINKED'
      ) {
        return redirectGoogleStatus(res, 'link_conflict');
      }
      return redirectGoogleStatus(res, 'failed');
    }
  }

  try {
    const user = await authService.findOrCreateGoogleUser(identity);
    return regenerateSessionForUser(req, res, user);
  } catch (error) {
    if (error.message === 'GOOGLE_EMAIL_CONFLICT') {
      return redirectGoogleStatus(res, 'conflict');
    }
    return redirectGoogleStatus(res, 'failed');
  }
});

/**
 * POST /api/auth/register
 * Registers a new user and starts a session.
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await authService.register(email, password);

    // Securely regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error during registration:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      
      req.session.userId = user.id;
      res.status(201).json(user);
    });
  } catch (error) {
    if (error.message === 'Email already registered') {
      return res.status(409).json({ error: error.message });
    }
    if (error.message === 'Invalid email format' || 
        error.message === 'Password must be at least 8 characters long' ||
        error.message === 'Email and password must be strings') {
      return res.status(400).json({ error: error.message });
    }
    
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Authenticates a user and starts a session.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await authService.login(email, password);

    // Securely regenerate session
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error during login:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      req.session.userId = user.id;
      res.json(user);
    });
  } catch (error) {
    if (error.message === 'Invalid email or password') {
      return res.status(401).json({ error: error.message });
    }
    
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/csrf-token', loadAuthenticatedUser, issueCsrfToken);

/**
 * POST /api/auth/logout
 * Destroys the user session.
 */
router.post('/logout', loadAuthenticatedUser, requireCsrfToken, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.clearCookie('connect.sid', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ message: 'Logged out successfully' });
  });
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 */
router.get('/me', loadAuthenticatedUser, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(req.authenticatedUser);
});

module.exports = router;
