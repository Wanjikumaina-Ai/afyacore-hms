/**
 * scripts/migrate-auth.cjs
 *
 * Safe, idempotent migration — adds all columns and tables needed by the
 * auth system to an existing afyacore.db without touching existing data.
 *
 * Run once after pulling this branch:
 *   node scripts/migrate-auth.cjs
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const DB_PATH     = path.resolve(__dirname, '..', 'data', 'afyacore.db');
const SQL_JS_PATH = path.resolve(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-asm.js');

if (!fs.existsSync(SQL_JS_PATH)) {
  console.error('ERROR: sql.js not found. Run:  pnpm install');
  process.exit(1);
}

const initSqlJs = require(SQL_JS_PATH);

initSqlJs().then((SQL) => {
  if (!fs.existsSync(DB_PATH)) {
    console.log('No database at', DB_PATH);
    console.log('A new one will be created automatically on first app launch.');
    process.exit(0);
  }

  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  function safeRun(sql, desc) {
    try {
      db.run(sql);
      console.log(`  ✅  ${desc}`);
    } catch {
      console.log(`  ⏭   Already exists: ${desc}`);
    }
  }

  console.log('\n==> Adding auth columns to auth_users…');
  safeRun(`ALTER TABLE auth_users ADD COLUMN password_hash        TEXT`,             'password_hash');
  safeRun(`ALTER TABLE auth_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`, 'must_change_password');
  safeRun(`ALTER TABLE auth_users ADD COLUMN is_active            INTEGER NOT NULL DEFAULT 1`, 'is_active');
  safeRun(`ALTER TABLE auth_users ADD COLUMN role                 TEXT    NOT NULL DEFAULT 'receptionist'`, 'role');
  safeRun(`ALTER TABLE auth_users ADD COLUMN facility_id          INTEGER REFERENCES facilities(id)`, 'facility_id');
  safeRun(`ALTER TABLE auth_users ADD COLUMN created_at           TEXT    DEFAULT (datetime('now'))`, 'created_at');

  console.log('\n==> Creating sessions table…');
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      token      TEXT    NOT NULL UNIQUE,
      user_id    INTEGER NOT NULL REFERENCES auth_users(id),
      expires_at TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('  ✅  sessions table');

  // Persist
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('\n🎉  Migration complete →', DB_PATH, '\n');
}).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
