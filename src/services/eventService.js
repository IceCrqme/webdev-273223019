const db = require('../data/db');

const EVENT_FIELDS = ['title', 'description', 'date', 'location', 'capacity'];
const EVENT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i;

function isValidId(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function assertOrganizer(organizerId) {
  if (!isValidId(organizerId)) {
    throw new Error('INVALID_INPUT');
  }

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(organizerId);
  if (!user || user.role !== 'organizer') {
    throw new Error('FORBIDDEN');
  }
}

function validateEventInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('INVALID_INPUT');
  }

  const keys = Object.keys(input);
  if (keys.length !== EVENT_FIELDS.length || keys.some((key) => !EVENT_FIELDS.includes(key))) {
    throw new Error('INVALID_INPUT');
  }

  const { title, description, date, location, capacity } = input;
  if (
    typeof title !== 'string'
    || !title.trim()
    || typeof description !== 'string'
    || !description.trim()
    || typeof location !== 'string'
    || !location.trim()
    || typeof date !== 'string'
    || !EVENT_DATE_PATTERN.test(date.trim())
    || Number.isNaN(new Date(date).getTime())
    || !Number.isSafeInteger(capacity)
    || capacity <= 0
  ) {
    throw new Error('INVALID_INPUT');
  }

  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1
    || calendarDate.getUTCDate() !== day
  ) {
    throw new Error('INVALID_INPUT');
  }

  return {
    title: title.trim(),
    description: description.trim(),
    date: date.trim(),
    location: location.trim(),
    capacity,
  };
}

async function getUpcomingEvents() {
  const query = `
    SELECT 
      e.id, 
      e.title, 
      e.description, 
      e.date, 
      e.location, 
      e.capacity,
      (e.capacity - COUNT(r.id)) as available_places
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    WHERE e.date >= CURRENT_TIMESTAMP
    GROUP BY e.id
    ORDER BY e.date ASC
  `;
  
  return db.prepare(query).all();
}

async function getEventDetails(eventId) {
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    throw new Error('INVALID_INPUT');
  }

  const event = db.prepare(`
    SELECT
      e.id,
      e.title,
      e.description,
      e.date,
      e.location,
      e.capacity,
      (e.capacity - COUNT(r.id)) as available_places
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    WHERE e.id = ?
    GROUP BY e.id
  `).get(eventId);

  if (!event) throw new Error('EVENT_NOT_FOUND');
  return event;
}

async function getOrganizerEvents(organizerId) {
  assertOrganizer(organizerId);

  return db.prepare(`
    SELECT
      e.id,
      e.title,
      e.description,
      e.date,
      e.location,
      e.capacity,
      e.organizer_id,
      (e.capacity - COUNT(r.id)) AS available_places
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    GROUP BY e.id
    ORDER BY e.date ASC
  `).all();
}

async function getOrganizerEventDetails(organizerId, eventId) {
  assertOrganizer(organizerId);
  if (!isValidId(eventId)) {
    throw new Error('INVALID_INPUT');
  }

  const event = db.prepare(`
    SELECT
      e.id,
      e.title,
      e.description,
      e.date,
      e.location,
      e.capacity,
      e.organizer_id,
      (e.capacity - COUNT(r.id)) AS available_places
    FROM events e
    LEFT JOIN registrations r ON e.id = r.event_id
    WHERE e.id = ?
    GROUP BY e.id
  `).get(eventId);

  if (!event) throw new Error('EVENT_NOT_FOUND');
  return event;
}

async function createEvent(organizerId, input) {
  assertOrganizer(organizerId);
  const fields = validateEventInput(input);

  const insertEvent = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO events (title, description, date, location, capacity, organizer_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      fields.title,
      fields.description,
      fields.date,
      fields.location,
      fields.capacity,
      organizerId
    );
    return Number(info.lastInsertRowid);
  });

  const eventId = insertEvent.immediate();
  return getOrganizerEventDetails(organizerId, eventId);
}

async function updateEvent(organizerId, eventId, input) {
  assertOrganizer(organizerId);
  if (!isValidId(eventId)) {
    throw new Error('INVALID_INPUT');
  }
  const fields = validateEventInput(input);

  const updateEventTransaction = db.transaction(() => {
    const event = db.prepare('SELECT organizer_id FROM events WHERE id = ?').get(eventId);
    if (!event) throw new Error('EVENT_NOT_FOUND');
    if (event.organizer_id !== organizerId) throw new Error('FORBIDDEN');

    const registrationCount = db.prepare(
      'SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?'
    ).get(eventId).count;
    if (fields.capacity < registrationCount) {
      throw new Error('EVENT_CAPACITY_CONFLICT');
    }

    db.prepare(`
      UPDATE events
      SET title = ?, description = ?, date = ?, location = ?, capacity = ?
      WHERE id = ? AND organizer_id = ?
    `).run(
      fields.title,
      fields.description,
      fields.date,
      fields.location,
      fields.capacity,
      eventId,
      organizerId
    );
  });

  updateEventTransaction.immediate();
  return getOrganizerEventDetails(organizerId, eventId);
}

async function deleteEvent(organizerId, eventId) {
  assertOrganizer(organizerId);
  if (!isValidId(eventId)) {
    throw new Error('INVALID_INPUT');
  }

  const deleteEventTransaction = db.transaction(() => {
    const event = db.prepare('SELECT organizer_id FROM events WHERE id = ?').get(eventId);
    if (!event) throw new Error('EVENT_NOT_FOUND');
    if (event.organizer_id !== organizerId) throw new Error('FORBIDDEN');

    const registrationCount = db.prepare(
      'SELECT COUNT(*) AS count FROM registrations WHERE event_id = ?'
    ).get(eventId).count;
    if (registrationCount > 0) {
      throw new Error('EVENT_HAS_REGISTRATIONS');
    }

    db.prepare('DELETE FROM events WHERE id = ? AND organizer_id = ?').run(
      eventId,
      organizerId
    );
  });

  deleteEventTransaction.immediate();
}

async function registerForEvent(userId, eventId) {
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(eventId) || eventId <= 0) {
    throw new Error('INVALID_INPUT');
  }

  const registerTx = db.transaction(() => {
    const event = db.prepare('SELECT id, date, capacity FROM events WHERE id = ?').get(eventId);
    if (!event) throw new Error('EVENT_NOT_FOUND');

    const eventDate = new Date(event.date);
    if (Number.isNaN(eventDate.getTime())) throw new Error('INVALID_INPUT');
    if (eventDate <= new Date()) throw new Error('EVENT_PAST');

    const existing = db.prepare('SELECT id FROM registrations WHERE user_id = ? AND event_id = ?').get(userId, eventId);
    if (existing) throw new Error('ALREADY_REGISTERED');

    const regCount = db.prepare('SELECT COUNT(*) as count FROM registrations WHERE event_id = ?').get(eventId).count;
    if (regCount >= event.capacity) throw new Error('EVENT_FULL');

    const info = db.prepare('INSERT INTO registrations (user_id, event_id) VALUES (?, ?)').run(userId, eventId);
    return { id: info.lastInsertRowid };
  });

  return registerTx();
}

async function cancelRegistration(userId, registrationId) {
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(registrationId) || registrationId <= 0) {
    throw new Error('INVALID_INPUT');
  }

  const registration = db.prepare('SELECT user_id FROM registrations WHERE id = ?').get(registrationId);
  if (!registration) throw new Error('REGISTRATION_NOT_FOUND');

  if (registration.user_id !== userId) {
    throw new Error('FORBIDDEN');
  }

  db.prepare('DELETE FROM registrations WHERE id = ?').run(registrationId);
  return { success: true };
}

async function getUserRegistrations(userId) {
  if (!isValidId(userId)) {
    throw new Error('INVALID_INPUT');
  }

  return db.prepare(`
    SELECT
      r.id AS registration_id,
      e.id AS event_id,
      e.title,
      e.description,
      e.date,
      e.location
    FROM registrations r
    JOIN events e ON e.id = r.event_id
    WHERE r.user_id = ?
    ORDER BY e.date ASC
  `).all(userId);
}

module.exports = {
  getUpcomingEvents,
  getEventDetails,
  getOrganizerEvents,
  getOrganizerEventDetails,
  createEvent,
  updateEvent,
  deleteEvent,
  registerForEvent,
  cancelRegistration,
  getUserRegistrations
};
