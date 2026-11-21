const db = require('../data/db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

/**
 * Validates email format.
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Registers a new user.
 */
async function register(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new Error('Email and password must be strings');
  }

  const normalizedEmail = email.trim().toLowerCase();
  
  if (!isValidEmail(normalizedEmail)) {
    throw new Error('Invalid email format');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  // Check if email already exists (pre-check)
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existingUser) {
    throw new Error('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const info = db.prepare(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)'
    ).run(normalizedEmail, passwordHash, 'student');

    return {
      id: info.lastInsertRowid,
      email: normalizedEmail,
      role: 'student'
    };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Email already registered');
    }
    throw error;
  }
}

/**
 * Authenticates a user.
 */
async function login(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new Error('Invalid email or password');
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

  // Generic error message for security
  const INVALID_MESSAGE = 'Invalid email or password';

  if (!user) {
    throw new Error(INVALID_MESSAGE);
  }

  // (1) Handle users with a NULL password (Google-only accounts)
  if (!user.password) {
    throw new Error(INVALID_MESSAGE);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error(INVALID_MESSAGE);
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role
  };
}

/**
 * Gets user by ID.
 */
async function getUserById(id) {
  const user = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(id);
  if (!user) {
    throw new Error('User not found');
  }
  return user;
}

module.exports = {
  register,
  login,
  getUserById
};
