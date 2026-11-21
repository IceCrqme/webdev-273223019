const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const eventRoutes = require('./routes/eventRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Security: Enforce SESSION_SECRET in all environments
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required');
}

// Security: Reject MemoryStore in production
if (process.env.NODE_ENV === 'production') {
  throw new Error('MemoryStore is not suitable for production. Please configure a persistent session store (e.g., connect-sqlite3 or redis).');
}

// Optional: Trust proxy for deployments behind a load balancer (e.g., Render, Heroku)
if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(express.json());
app.use(cookieParser());

// Session configuration
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  store: new session.MemoryStore()
}));

// API Routes
app.use('/api', eventRoutes);
app.use('/api/auth', authRoutes);

// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
