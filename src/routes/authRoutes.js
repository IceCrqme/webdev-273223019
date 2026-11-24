const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const { loadAuthenticatedUser } = require('../middleware/sessionAuthorization');

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

/**
 * POST /api/auth/logout
 * Destroys the user session.
 */
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user's profile.
 */
router.get('/me', loadAuthenticatedUser, (req, res) => {
  res.json(req.authenticatedUser);
});

module.exports = router;
