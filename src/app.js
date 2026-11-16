const express = require('express');
const eventRoutes = require('./routes/eventRoutes');

const app = express();

app.use(express.json());

// API Routes
app.use('/api', eventRoutes);

// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
