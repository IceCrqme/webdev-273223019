const db = require('../data/db');

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

module.exports = {
  getUpcomingEvents,
  getEventDetails,
  registerForEvent,
  cancelRegistration
};
