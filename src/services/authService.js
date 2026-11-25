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

function findOrCreateGoogleUser({ subject, email, emailVerified }) {
  if (
    typeof subject !== 'string'
    || !subject
    || typeof email !== 'string'
    || emailVerified !== true
  ) {
    throw new Error('INVALID_GOOGLE_IDENTITY');
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    throw new Error('INVALID_GOOGLE_IDENTITY');
  }

  const findOrCreate = db.transaction(() => {
    const linkedUser = db.prepare(
      'SELECT id, email, role FROM users WHERE google_id = ?'
    ).get(subject);
    if (linkedUser) return linkedUser;

    const emailUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (emailUser) throw new Error('GOOGLE_EMAIL_CONFLICT');

    try {
      const result = db.prepare(`
        INSERT INTO users (email, password, google_id, role)
        VALUES (?, NULL, ?, 'student')
      `).run(normalizedEmail, subject);
      return {
        id: Number(result.lastInsertRowid),
        email: normalizedEmail,
        role: 'student',
      };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const concurrentUser = db.prepare(
          'SELECT id, email, role FROM users WHERE google_id = ?'
        ).get(subject);
        if (concurrentUser) return concurrentUser;
        throw new Error('GOOGLE_EMAIL_CONFLICT');
      }
      throw error;
    }
  });

  return findOrCreate.immediate();
}

function linkGoogleAccount(userId, subject) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || typeof subject !== 'string' || !subject) {
    throw new Error('INVALID_GOOGLE_IDENTITY');
  }

  const linkAccount = db.transaction(() => {
    const user = db.prepare('SELECT id, email, role, google_id FROM users WHERE id = ?')
      .get(userId);
    if (!user) throw new Error('User not found');

    const subjectOwner = db.prepare('SELECT id FROM users WHERE google_id = ?').get(subject);
    if (subjectOwner && subjectOwner.id !== userId) {
      throw new Error('GOOGLE_ACCOUNT_LINKED');
    }
    if (user.google_id && user.google_id !== subject) {
      throw new Error('GOOGLE_ACCOUNT_ALREADY_LINKED');
    }

    if (!user.google_id) {
      try {
        db.prepare('UPDATE users SET google_id = ? WHERE id = ? AND google_id IS NULL')
          .run(subject, userId);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          throw new Error('GOOGLE_ACCOUNT_LINKED');
        }
        throw error;
      }
    }

    return { id: user.id, email: user.email, role: user.role };
  });

  return linkAccount.immediate();
}

module.exports = {
  register,
  login,
  getUserById,
  findOrCreateGoogleUser,
  linkGoogleAccount,
};
