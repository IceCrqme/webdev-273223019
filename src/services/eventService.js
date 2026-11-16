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

module.exports = {
  getUpcomingEvents
};
