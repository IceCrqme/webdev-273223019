const express = require('express');
const router = express.Router();
const eventService = require('../services/eventService');

router.get('/events', async (req, res) => {
  try {
    const events = await eventService.getUpcomingEvents();
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming events' });
  }
});

module.exports = router;
