const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'club_events.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    google_id TEXT UNIQUE,
    role TEXT DEFAULT 'student',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    date DATETIME NOT NULL,
    location TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (event_id) REFERENCES events(id),
    UNIQUE(user_id, event_id)
  );
`);

// Seed some dummy events if table is empty
const eventCount = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
if (eventCount === 0) {
  const insertEvent = db.prepare('INSERT INTO events (title, description, date, location, capacity) VALUES (?, ?, ?, ?, ?)');
  insertEvent.run('Welcome Party', 'Come and meet your fellow club members!', '2026-12-01 18:00:00', 'Student Center', 100);
  insertEvent.run('Coding Workshop', 'Learn the basics of Node.js and Express.', '2026-12-05 14:00:00', 'Lab 101', 30);
  insertEvent.run('Hackathon 2026', 'A weekend of building and learning.', '2026-12-12 09:00:00', 'Main Hall', 50);
  console.log('Database seeded with dummy events.');
} else {
  console.log('Database already contains events.');
}

db.close();
console.log('Database initialized.');
