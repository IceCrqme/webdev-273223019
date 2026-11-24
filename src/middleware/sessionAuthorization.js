const authService = require('../services/authService');

async function loadAuthenticatedUser(req, res, next) {
  const userId = req.session?.userId;
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    req.authenticatedUser = await authService.getUserById(userId);
    return next();
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.error('Authentication lookup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.authenticatedUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (req.authenticatedUser.role !== role) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return next();
  };
}

module.exports = {
  loadAuthenticatedUser,
  requireRole,
};
