const express = require('express');
const router = express.Router();
const eventService = require('../services/eventService');
const {
  loadAuthenticatedUser,
  requireRole,
} = require('../middleware/sessionAuthorization');
const {
  issueCsrfToken,
  requireCsrfToken,
} = require('../middleware/csrfProtection');

const organizerAccess = [loadAuthenticatedUser, requireRole('organizer')];

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

function handleOrganizerError(res, error, action) {
  if (error.message === 'INVALID_INPUT') {
    return res.status(400).json({ error: 'Invalid input' });
  }
  if (error.message === 'FORBIDDEN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (error.message === 'EVENT_NOT_FOUND') {
    return res.status(404).json({ error: 'Event not found' });
  }
  if (
    error.message === 'EVENT_CAPACITY_CONFLICT'
    || error.message === 'EVENT_HAS_REGISTRATIONS'
  ) {
    return res.status(409).json({ error: 'Event conflicts with existing registrations' });
  }

  console.error(`Organizer event ${action} error:`, error);
  return res.status(500).json({ error: 'Internal server error' });
}

router.get('/organizer/csrf-token', ...organizerAccess, issueCsrfToken);

router.get('/organizer/events', ...organizerAccess, async (req, res) => {
  try {
    const events = await eventService.getOrganizerEvents(req.authenticatedUser.id);
    res.json(events);
  } catch (error) {
    handleOrganizerError(res, error, 'list');
  }
});

router.get('/organizer/events/:eventId', ...organizerAccess, async (req, res) => {
  const { eventId } = req.params;
  if (!isValidId(eventId)) {
    return res.status(400).json({ error: 'Invalid event ID' });
  }

  try {
    const event = await eventService.getOrganizerEventDetails(
      req.authenticatedUser.id,
      Number(eventId)
    );
    res.json(event);
  } catch (error) {
    handleOrganizerError(res, error, 'read');
  }
});

router.post(
  '/organizer/events',
  ...organizerAccess,
  requireCsrfToken,
  async (req, res) => {
    try {
      const event = await eventService.createEvent(req.authenticatedUser.id, req.body);
      res.status(201).json(event);
    } catch (error) {
      handleOrganizerError(res, error, 'create');
    }
  }
);

router.put(
  '/organizer/events/:eventId',
  ...organizerAccess,
  requireCsrfToken,
  async (req, res) => {
    const { eventId } = req.params;
    if (!isValidId(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    try {
      const event = await eventService.updateEvent(
        req.authenticatedUser.id,
        Number(eventId),
        req.body
      );
      res.json(event);
    } catch (error) {
      handleOrganizerError(res, error, 'update');
    }
  }
);

router.delete(
  '/organizer/events/:eventId',
  ...organizerAccess,
  requireCsrfToken,
  async (req, res) => {
    const { eventId } = req.params;
    if (!isValidId(eventId)) {
      return res.status(400).json({ error: 'Invalid event ID' });
    }

    try {
      await eventService.deleteEvent(req.authenticatedUser.id, Number(eventId));
      res.status(204).end();
    } catch (error) {
      handleOrganizerError(res, error, 'delete');
    }
  }
);

router.get(
  '/registrations',
  loadAuthenticatedUser,
  requireRole('student'),
  async (req, res) => {
    try {
      const registrations = await eventService.getUserRegistrations(
        req.authenticatedUser.id
      );
      res.json(registrations);
    } catch (error) {
      if (error.message === 'INVALID_INPUT') {
        return res.status(400).json({ error: 'Invalid input' });
      }

      console.error('Registration list error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

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
