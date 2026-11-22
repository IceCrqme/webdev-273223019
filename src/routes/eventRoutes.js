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

function isValidId(idStr) {
  const n = Number(idStr);
  return Number.isSafeInteger(n) && n > 0 && String(n) === idStr;
}

router.post('/events/:eventId/register', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { eventId } = req.params;
    if (!isValidId(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    const registration = await eventService.registerForEvent(req.session.userId, Number(eventId));
    res.status(201).json(registration);
  } catch (error) {
    if (error.message === 'EVENT_NOT_FOUND') return res.status(404).json({ error: 'Event not found' });
    if (error.message === 'EVENT_PAST') return res.status(400).json({ error: 'Cannot register for past events' });
    if (error.message === 'ALREADY_REGISTERED') return res.status(409).json({ error: 'Already registered for this event' });
    if (error.message === 'EVENT_FULL') return res.status(409).json({ error: 'Event is full' });
    if (error.message === 'INVALID_INPUT') return res.status(400).json({ error: 'Invalid input' });

    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/registrations/:registrationId', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { registrationId } = req.params;
    if (!isValidId(registrationId)) {
      return res.status(400).json({ error: 'Invalid registration ID' });
    }

    await eventService.cancelRegistration(req.session.userId, Number(registrationId));
    res.status(204).end();
  } catch (error) {
    if (error.message === 'REGISTRATION_NOT_FOUND') return res.status(404).json({ error: 'Registration not found' });
    if (error.message === 'FORBIDDEN') return res.status(403).json({ error: 'Not authorized to cancel this registration' });
    if (error.message === 'INVALID_INPUT') return res.status(400).json({ error: 'Invalid input' });

    console.error('Cancellation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
