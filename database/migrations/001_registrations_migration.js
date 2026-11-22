const Database = require('better-sqlite3');

function runMigration(customDbPath) {
  const dbPath = customDbPath || process.env.DB_PATH;
  if (!dbPath) {
    throw new Error('Database path must be provided via argument or process.env.DB_PATH');
  }
  const db = new Database(dbPath);

  try {
    // 1. Check if tables exist. If not, initialize schema.
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'events', 'registrations')").all();
    const tableNames = tables.map(t => t.name);

    if (!tableNames.includes('users') || !tableNames.includes('events') || !tableNames.includes('registrations')) {
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
      return { success: true };
    }

    // 2. Check if an existing non-partial unique index or constraint enforces uniqueness on (user_id, event_id)
    const indexes = db.prepare("PRAGMA index_list('registrations')").all();
    let hasUniquePairIndex = false;

    for (const idx of indexes) {
      if ((idx.unique === 1 || idx.origin === 'u' || idx.origin === 'pk') && idx.partial === 0) {
        const info = db.prepare(`PRAGMA index_xinfo('${idx.name}')`).all();
        const keyCols = info.filter(col => col.key === 1).map(col => col.name);
        if (keyCols.length === 2 && keyCols.includes('user_id') && keyCols.includes('event_id')) {
          hasUniquePairIndex = true;
          break;
        }
      }
    }

    if (hasUniquePairIndex) {
      return { success: true };
    }

    // 3. Perform duplicate check and index creation atomically inside a transaction
    const performMigrationTx = db.transaction(() => {
      const currentIndexes = db.prepare("PRAGMA index_list('registrations')").all();
      for (const idx of currentIndexes) {
        if ((idx.unique === 1 || idx.origin === 'u' || idx.origin === 'pk') && idx.partial === 0) {
          const info = db.prepare(`PRAGMA index_xinfo('${idx.name}')`).all();
          const keyCols = info.filter(col => col.key === 1).map(col => col.name);
          if (keyCols.length === 2 && keyCols.includes('user_id') && keyCols.includes('event_id')) {
            return;
          }
        }
      }

      const duplicates = db.prepare(`
        SELECT user_id, event_id, COUNT(*) as cnt
        FROM registrations
        GROUP BY user_id, event_id
        HAVING COUNT(*) > 1
      `).all();

      if (duplicates.length > 0) {
        throw new Error('Duplicate registrations found: cannot apply unique index.');
      }

      db.exec('CREATE UNIQUE INDEX idx_registrations_user_event ON registrations(user_id, event_id);');
    });

    performMigrationTx();

    return { success: true };
  } finally {
    try {
      db.close();
    } catch (e) {
      // ignore
    }
  }
}

module.exports = runMigration;
