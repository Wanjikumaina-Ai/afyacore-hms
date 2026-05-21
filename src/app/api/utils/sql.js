/**
 * FILE: src/app/api/utils/sql.js
 *
 * Reads AFYA_DATA_DIR env var (set by electron/main.js) so the database
 * lives in the OS userData folder and survives app updates.
 *
 * Fallback (npm run dev without Electron): <project-root>/data/
 */

import initSqlJs from 'sql.js';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const DATA_DIR = process.env.AFYA_DATA_DIR || join(process.cwd(), 'data');
const DB_PATH  = join(DATA_DIR, 'afyacore.db');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

let _db = null;

async function getDb() {
  if (_db) return _db;

  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
    runSchema(_db);
    persist(_db);
  }

  _db.run('PRAGMA foreign_keys = ON;');
  runMigrations(_db);
  persist(_db);

  return _db;
}

function persist(db) {
  writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function runSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS license (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      facility_name TEXT    NOT NULL,
      license_key   TEXT    NOT NULL,
      installed_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS facilities (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS departments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER NOT NULL REFERENCES facilities(id),
      name        TEXT    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'staff',
      facility_id   INTEGER REFERENCES facilities(id),
      department_id INTEGER REFERENCES departments(id),
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      token      TEXT    NOT NULL UNIQUE,
      expires_at TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS staff_profiles (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
      staff_number     TEXT    NOT NULL UNIQUE,
      job_title        TEXT,
      employment_type  TEXT    NOT NULL DEFAULT 'full_time',
      basic_salary     REAL    NOT NULL DEFAULT 0,
      allowances       REAL    NOT NULL DEFAULT 0,
      bank_name        TEXT, bank_account TEXT,
      kra_pin          TEXT, nssf_number TEXT, shif_number TEXT,
      national_id      TEXT, date_of_birth TEXT,
      hire_date        TEXT, termination_date TEXT,
      is_active        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id   INTEGER NOT NULL REFERENCES facilities(id),
      period_month  INTEGER NOT NULL,
      period_year   INTEGER NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'draft',
      total_gross   REAL    NOT NULL DEFAULT 0,
      total_net     REAL    NOT NULL DEFAULT 0,
      total_paye    REAL    NOT NULL DEFAULT 0,
      total_nssf    REAL    NOT NULL DEFAULT 0,
      total_shif    REAL    NOT NULL DEFAULT 0,
      total_housing REAL    NOT NULL DEFAULT 0,
      created_by    INTEGER REFERENCES auth_users(id),
      approved_by   INTEGER REFERENCES auth_users(id),
      approved_at   TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(facility_id, period_month, period_year)
    );
    CREATE TABLE IF NOT EXISTS payroll_items (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id             INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      user_id            INTEGER NOT NULL REFERENCES auth_users(id),
      staff_number       TEXT,
      basic_salary       REAL    NOT NULL DEFAULT 0,
      allowances         REAL    NOT NULL DEFAULT 0,
      gross_pay          REAL    NOT NULL DEFAULT 0,
      nssf_employee      REAL    NOT NULL DEFAULT 0,
      nssf_employer      REAL    NOT NULL DEFAULT 0,
      shif_deduction     REAL    NOT NULL DEFAULT 0,
      housing_levy_emp   REAL    NOT NULL DEFAULT 0,
      housing_levy_er    REAL    NOT NULL DEFAULT 0,
      taxable_pay        REAL    NOT NULL DEFAULT 0,
      paye_before_relief REAL    NOT NULL DEFAULT 0,
      personal_relief    REAL    NOT NULL DEFAULT 2400,
      paye               REAL    NOT NULL DEFAULT 0,
      other_deductions   REAL    NOT NULL DEFAULT 0,
      net_pay            REAL    NOT NULL DEFAULT 0,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS patients (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id        INTEGER NOT NULL REFERENCES facilities(id),
      patient_number     TEXT    NOT NULL UNIQUE,
      first_name         TEXT    NOT NULL,
      middle_name        TEXT,
      last_name          TEXT    NOT NULL,
      gender             TEXT, dob TEXT, phone TEXT, email TEXT, address TEXT,
      category           TEXT    NOT NULL DEFAULT 'outpatient',
      allergies          TEXT, chronic_conditions TEXT,
      next_of_kin_name   TEXT, next_of_kin_phone TEXT,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS visits (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id    INTEGER NOT NULL REFERENCES patients(id),
      facility_id   INTEGER NOT NULL REFERENCES facilities(id),
      visit_number  TEXT    NOT NULL UNIQUE,
      priority      TEXT    NOT NULL DEFAULT 'normal',
      department_id INTEGER REFERENCES departments(id),
      status        TEXT    NOT NULL DEFAULT 'waiting',
      triage_vitals TEXT, triage_notes TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS consultations (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id        INTEGER NOT NULL REFERENCES visits(id),
      doctor_id       INTEGER NOT NULL REFERENCES auth_users(id),
      chief_complaint TEXT, history TEXT, examination TEXT,
      diagnosis TEXT, plan TEXT, follow_up_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS lab_requests (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id     INTEGER NOT NULL REFERENCES visits(id),
      test_name    TEXT    NOT NULL,
      requested_by INTEGER NOT NULL REFERENCES auth_users(id),
      status       TEXT    NOT NULL DEFAULT 'requested',
      result TEXT, result_notes TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS prescriptions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id     INTEGER NOT NULL REFERENCES visits(id),
      drug_name    TEXT    NOT NULL,
      dosage TEXT, frequency TEXT, duration TEXT, quantity INTEGER,
      requested_by INTEGER REFERENCES auth_users(id),
      dispensed    INTEGER NOT NULL DEFAULT 0,
      dispensed_by INTEGER REFERENCES auth_users(id),
      dispensed_at TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS inventory (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id   INTEGER NOT NULL REFERENCES facilities(id),
      item_name     TEXT    NOT NULL,
      category TEXT, sku TEXT,
      quantity      INTEGER NOT NULL DEFAULT 0,
      unit TEXT, buying_price REAL, selling_price REAL,
      reorder_level INTEGER DEFAULT 10, expiry_date TEXT,
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bills (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id     INTEGER NOT NULL REFERENCES visits(id),
      patient_id   INTEGER NOT NULL REFERENCES patients(id),
      total_amount REAL    NOT NULL DEFAULT 0,
      net_amount   REAL    NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'unpaid',
      created_by   INTEGER REFERENCES auth_users(id),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bill_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id     INTEGER NOT NULL REFERENCES bills(id),
      item_type TEXT, description TEXT,
      quantity    INTEGER NOT NULL DEFAULT 1,
      unit_price  REAL    NOT NULL DEFAULT 0,
      total_price REAL    NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS payments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id          INTEGER NOT NULL REFERENCES bills(id),
      patient_id       INTEGER NOT NULL REFERENCES patients(id),
      amount           REAL    NOT NULL,
      method           TEXT    NOT NULL DEFAULT 'cash',
      reference_number TEXT,
      cashier_id       INTEGER REFERENCES auth_users(id),
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER REFERENCES facilities(id),
      user_id     INTEGER REFERENCES auth_users(id),
      action      TEXT    NOT NULL,
      module      TEXT, record_id TEXT, old_value TEXT, new_value TEXT, ip_address TEXT,
      severity    TEXT    NOT NULL DEFAULT 'info',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function runMigrations(db) {
  const safe = [
    `ALTER TABLE audit_logs ADD COLUMN old_value TEXT`,
    `ALTER TABLE audit_logs ADD COLUMN new_value TEXT`,
    `ALTER TABLE audit_logs ADD COLUMN ip_address TEXT`,
    `ALTER TABLE audit_logs ADD COLUMN severity TEXT NOT NULL DEFAULT 'info'`,
    `CREATE TABLE IF NOT EXISTS staff_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
      staff_number TEXT NOT NULL UNIQUE, job_title TEXT, employment_type TEXT NOT NULL DEFAULT 'full_time',
      basic_salary REAL NOT NULL DEFAULT 0, allowances REAL NOT NULL DEFAULT 0,
      bank_name TEXT, bank_account TEXT, kra_pin TEXT, nssf_number TEXT, shif_number TEXT,
      national_id TEXT, date_of_birth TEXT, hire_date TEXT, termination_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS payroll_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, facility_id INTEGER NOT NULL REFERENCES facilities(id),
      period_month INTEGER NOT NULL, period_year INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      total_gross REAL NOT NULL DEFAULT 0, total_net REAL NOT NULL DEFAULT 0,
      total_paye REAL NOT NULL DEFAULT 0, total_nssf REAL NOT NULL DEFAULT 0,
      total_shif REAL NOT NULL DEFAULT 0, total_housing REAL NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES auth_users(id), approved_by INTEGER REFERENCES auth_users(id),
      approved_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(facility_id, period_month, period_year)
    )`,
    `CREATE TABLE IF NOT EXISTS payroll_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES auth_users(id), staff_number TEXT,
      basic_salary REAL NOT NULL DEFAULT 0, allowances REAL NOT NULL DEFAULT 0, gross_pay REAL NOT NULL DEFAULT 0,
      nssf_employee REAL NOT NULL DEFAULT 0, nssf_employer REAL NOT NULL DEFAULT 0,
      shif_deduction REAL NOT NULL DEFAULT 0, housing_levy_emp REAL NOT NULL DEFAULT 0,
      housing_levy_er REAL NOT NULL DEFAULT 0, taxable_pay REAL NOT NULL DEFAULT 0,
      paye_before_relief REAL NOT NULL DEFAULT 0, personal_relief REAL NOT NULL DEFAULT 2400,
      paye REAL NOT NULL DEFAULT 0, other_deductions REAL NOT NULL DEFAULT 0,
      net_pay REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ];
  for (const m of safe) {
    try { db.run(m); } catch { /* already exists */ }
  }
}

function toObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

export default async function sql(query, params = []) {
  const db   = await getDb();
  const type = query.trim().toUpperCase();
  const isRead = type.startsWith('SELECT') || type.startsWith('WITH');

  if (isRead) return toObjects(db.exec(query, params));

  db.run(query, params);
  persist(db);

  if (type.startsWith('INSERT')) {
    const table = query.match(/INSERT\s+INTO\s+(\w+)/i)?.[1];
    if (table) {
      try {
        const rows = toObjects(db.exec(`SELECT * FROM ${table} WHERE rowid = last_insert_rowid()`));
        if (rows.length > 0) return rows;
      } catch { /* fall through */ }
    }
    return toObjects(db.exec('SELECT last_insert_rowid() as id'));
  }

  return [{ changes: db.getRowsModified() }];
}

export async function sqlTransaction(fn) {
  const db = await getDb();

  async function txnSql(query, params = []) {
    const type   = query.trim().toUpperCase();
    const isRead = type.startsWith('SELECT') || type.startsWith('WITH');
    if (isRead) return toObjects(db.exec(query, params));
    db.run(query, params);
    if (type.startsWith('INSERT')) {
      const table = query.match(/INSERT\s+INTO\s+(\w+)/i)?.[1];
      if (table) {
        try {
          const rows = toObjects(db.exec(`SELECT * FROM ${table} WHERE rowid = last_insert_rowid()`));
          if (rows.length > 0) return rows;
        } catch { /* fall through */ }
      }
      return toObjects(db.exec('SELECT last_insert_rowid() as id'));
    }
    return [{ changes: db.getRowsModified() }];
  }

  db.run('BEGIN');
  try {
    const result = await fn(txnSql);
    db.run('COMMIT');
    persist(db);
    return result;
  } catch (err) {
    try { db.run('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

export async function auditLog({
  facilityId, userId, action, module, recordId,
  oldValue, newValue, severity = 'info', request = null,
}) {
  try {
    const ip = request?.headers?.get('x-forwarded-for')
            || request?.headers?.get('x-real-ip')
            || null;
    await sql(
      `INSERT INTO audit_logs
         (facility_id, user_id, action, module, record_id, old_value, new_value, ip_address, severity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        facilityId, userId, action, module,
        recordId ? String(recordId) : null,
        oldValue  ? JSON.stringify(oldValue)  : null,
        newValue  ? JSON.stringify(newValue)  : null,
        ip, severity,
      ]
    );
  } catch (e) {
    console.error('auditLog error:', e);
  }
}