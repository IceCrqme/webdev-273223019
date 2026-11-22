const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Create unique temporary database for legacy backend tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-events-backend-test-'));
const dbPath = path.join(tmpDir, 'test.db');

const testEnv = {
  ...process.env,
  DB_PATH: dbPath,
  SESSION_SECRET: 'test-session-secret-backend'
};

let exitCode = 0;

try {
  console.log('Running database initialization for backend tests...');
  const initResult = spawnSync(process.execPath, ['database/init.js'], {
    env: testEnv,
    stdio: 'inherit'
  });

  if (initResult.status !== 0) {
    console.error('Database initialization failed.');
    exitCode = initResult.status || 1;
  } else {
    console.log('Running legacy backend tests (test_backend.js)...');
    const backendResult = spawnSync(process.execPath, ['test_backend.js'], {
      env: testEnv,
      stdio: 'inherit'
    });

    if (backendResult.status !== 0) {
      exitCode = backendResult.status || 1;
    } else {
      console.log('Running Mocha tests (test/*.test.js)...');
      const mochaBin = path.join('node_modules', 'mocha', 'bin', 'mocha');
      fs.readdirSync('test').filter(f => f.endsWith('.test.js')).forEach(file => {
        const mochaResult = spawnSync(process.execPath, [mochaBin, path.join('test', file)], {
          env: process.env,
          stdio: 'inherit'
        });
        if (mochaResult.status !== 0) exitCode = mochaResult.status || 1;
      });
    }
  }
} finally {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('Cleaned up temporary backend test database.');
  } catch (err) {
    console.error('Failed to clean up temporary directory:', err);
  }
}

process.exitCode = exitCode;
