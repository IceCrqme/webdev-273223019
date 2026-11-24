const Database = require('better-sqlite3');

function runMigration(customDbPath) {
  const dbPath = customDbPath || process.env.DB_PATH;
  if (!dbPath) {
    throw new Error('Database path must be provided via argument or process.env.DB_PATH');
  }

  const db = new Database(dbPath);
  try {
    db.pragma('foreign_keys = ON');

    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name IN ('users', 'events')
    `).all().map((table) => table.name);

    if (!tables.includes('users') || !tables.includes('events')) {
      throw new Error('Users and events tables must exist before applying this migration');
    }

    const applyMigration = db.transaction(() => {
      let columns = db.pragma('table_info(events)');
      let organizerId = columns.find((column) => column.name === 'organizer_id');

      if (!organizerId) {
        db.exec('ALTER TABLE events ADD COLUMN organizer_id INTEGER REFERENCES users(id)');
        columns = db.pragma('table_info(events)');
        organizerId = columns.find((column) => column.name === 'organizer_id');
      }

      const ownerReferenceExists = db.pragma('foreign_key_list(events)').some(
        (foreignKey) => foreignKey.from === 'organizer_id'
          && foreignKey.table === 'users'
          && foreignKey.to === 'id'
      );

      if (!organizerId || organizerId.notnull !== 0 || !ownerReferenceExists) {
        throw new Error('events.organizer_id must be nullable and reference users(id)');
      }

      db.exec('CREATE INDEX IF NOT EXISTS idx_events_organizer_id ON events(organizer_id)');
    });

    applyMigration.immediate();
    return { success: true };
  } finally {
    db.close();
  }
}

module.exports = runMigration;
