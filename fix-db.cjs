const initSqlJs = require('./node_modules/sql.js/dist/sql-asm.js');
const fs = require('fs');

initSqlJs().then(SQL => {
  const db = new SQL.Database(fs.readFileSync('./data/afyacore.db'));

  // Add missing columns to auth_users
  const alterStatements = [
    "ALTER TABLE auth_users ADD COLUMN branch_id INTEGER REFERENCES branches(id)",
    "ALTER TABLE auth_users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE auth_users ADD COLUMN phone TEXT",
    "ALTER TABLE auth_users ADD COLUMN avatar TEXT",
    "ALTER TABLE auth_users ADD COLUMN specialization TEXT",
    "ALTER TABLE auth_users ADD COLUMN license_number TEXT",
  ];

  for (const stmt of alterStatements) {
    try {
      db.run(stmt);
      const col = stmt.split('ADD COLUMN ')[1].split(' ')[0];
      console.log('Added column:', col);
    } catch(e) {
      const col = stmt.split('ADD COLUMN ')[1].split(' ')[0];
      console.log('Already exists:', col);
    }
  }

  // Add missing tables
  db.run(`
    CREATE TABLE IF NOT EXISTS branches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER REFERENCES facilities(id),
      name        TEXT    NOT NULL,
      address     TEXT,
      phone       TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payroll (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER REFERENCES facilities(id),
      staff_id    INTEGER REFERENCES auth_users(id),
      month       TEXT    NOT NULL,
      basic_pay   REAL    NOT NULL DEFAULT 0,
      allowances  REAL    NOT NULL DEFAULT 0,
      deductions  REAL    NOT NULL DEFAULT 0,
      net_pay     REAL    NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'pending',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounting (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER REFERENCES facilities(id),
      type        TEXT    NOT NULL,
      category    TEXT,
      amount      REAL    NOT NULL,
      description TEXT,
      reference   TEXT,
      created_by  INTEGER REFERENCES auth_users(id),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id  INTEGER REFERENCES patients(id),
      facility_id INTEGER REFERENCES facilities(id),
      doctor_id   INTEGER REFERENCES auth_users(id),
      appt_date   TEXT    NOT NULL,
      reason      TEXT,
      status      TEXT    NOT NULL DEFAULT 'scheduled',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS staff (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id     INTEGER REFERENCES facilities(id),
      user_id         INTEGER REFERENCES auth_users(id),
      department_id   INTEGER REFERENCES departments(id),
      job_title       TEXT,
      employment_type TEXT,
      start_date      TEXT,
      salary          REAL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Save back to disk
  const data = db.export();
  fs.writeFileSync('./data/afyacore.db', Buffer.from(data));

  console.log('Done — database patched successfully.');
});
