const { randomBytes, timingSafeEqual } = require('node:crypto');

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function issueCsrfToken(req, res) {
  if (!req.session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (typeof req.session.csrfToken !== 'string' || !TOKEN_PATTERN.test(req.session.csrfToken)) {
    req.session.csrfToken = randomBytes(32).toString('hex');
  }

  res.set('Cache-Control', 'no-store');
  return res.json({ csrfToken: req.session.csrfToken });
}

function requireCsrfToken(req, res, next) {
  const expectedToken = req.session?.csrfToken;
  const providedToken = req.get('X-CSRF-Token');

  if (
    typeof expectedToken !== 'string'
    || !TOKEN_PATTERN.test(expectedToken)
    || typeof providedToken !== 'string'
    || !TOKEN_PATTERN.test(providedToken)
  ) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  const expectedBuffer = Buffer.from(expectedToken, 'hex');
  const providedBuffer = Buffer.from(providedToken, 'hex');

  if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  return next();
}

module.exports = {
  issueCsrfToken,
  requireCsrfToken,
};
