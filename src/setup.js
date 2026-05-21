/**
 * FILE: src/setup.js
 * Usage: npm run setup
 *
 * AFYA_SECRET below must match exactly what is in license-key-generator.html
 */

import readline from 'readline';
import { createHmac } from 'crypto';
import bcrypt from 'bcryptjs';
import initSqlJs from 'sql.js';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

// ── MUST MATCH license-key-generator.html exactly ─────────────────────────
const AFYA_SECRET = 'AFYATECH-WANJIKU-CHANGE-ME-2025';

const DATA_DIR = join(process.cwd(), 'data');
const DB_PATH  = join(DATA_DIR, 'afyacore.db');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

// ── Hex decode (reverses toHex in the browser generator) ──────────────────
function fromHex(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return Buffer.from(bytes).toString('utf8');
}

// ── Verify license key ─────────────────────────────────────────────────────
function verifyKey(facilityName, key) {
  try {
    const parts = key.trim().toUpperCase().split('-');
    // key = AFYA-<16 char sig>-<hex payload>
    // But hex payload itself contains no dashes, sig is 16 chars
    // Format: AFYA + sig(16) + hexPayload — split gives ['AFYA', sig, ...hexparts]
    if (parts[0] !== 'AFYA') return { ok: false, error: 'Key must start with AFYA' };

    const sig        = parts[1];                      // 16 char HMAC
    const hexPayload = parts.slice(2).join('-');      // rest is hex (no dashes but safe)

    // Decode payload
    let payload;
    try { payload = fromHex(hexPayload); } catch {
      return { ok: false, error: 'Key is corrupted' };
    }

    // payload = "FACILITYNAME|ISSUED|EXPIRES"
    const [encodedFacility, issuedAt, expiresAt] = payload.split('|');

    // Verify HMAC
    const expectedSig = createHmac('sha256', AFYA_SECRET)
      .update(payload)
      .digest('hex')
      .substring(0, 16)
      .toUpperCase();

    if (sig !== expectedSig) {
      return { ok: false, error: 'Invalid license key — signature does not match' };
    }

    // Verify facility name (case-insensitive)
    if (encodedFacility !== facilityName.trim().toUpperCase()) {
      return {
        ok: false,
        error: `Key was generated for "${encodedFacility}", you entered "${facilityName.trim().toUpperCase()}"`,
      };
    }

    // Verify expiry
    if (new Date(expiresAt) < new Date()) {
      return { ok: false, error: `License expired on ${expiresAt}` };
    }

    return { ok: true, issuedAt, expiresAt };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║      AfyaCore HMS — Installation Setup        ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  if (existsSync(DB_PATH)) {
    const answer = await ask('⚠  Database exists. Add another admin? (yes/no): ');
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('\nSetup cancelled.\n');
      rl.close(); return;
    }
  }

  // ── Step 1: License ────────────────────────────────────────────────────
  console.log('── Step 1: License Activation ───────────────────────────\n');
  const facilityName = await ask('Hospital / clinic name: ');
  const licenseKey   = await ask('License key (AFYA-...): ');

  const check = verifyKey(facilityName, licenseKey);
  if (!check.ok) {
    console.error(`\n❌  ${check.error}\n`);
    rl.close();
    process.exit(1);
  }
  console.log(`\n✅  License valid until ${check.expiresAt}\n`);

  // ── Step 2: Init DB ────────────────────────────────────────────────────
  const SQL = await initSqlJs();
  const db  = existsSync(DB_PATH)
    ? new SQL.Database(readFileSync(DB_PATH))
    : new SQL.Database();

  db.run('PRAGMA foreign_keys = ON;');

  db.run(`
    CREATE TABLE IF NOT EXISTS license (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      facility_name TEXT NOT NULL,
      license_key   TEXT NOT NULL,
      installed_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS facilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER NOT NULL REFERENCES facilities(id),
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'staff',
      facility_id   INTEGER REFERENCES facilities(id),
      department_id INTEGER REFERENCES departments(id),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      token      TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS patients (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id        INTEGER NOT NULL REFERENCES facilities(id),
      patient_number     TEXT NOT NULL UNIQUE,
      first_name         TEXT NOT NULL,
      middle_name        TEXT,
      last_name          TEXT NOT NULL,
      gender             TEXT,
      dob                TEXT,
      phone              TEXT,
      email              TEXT,
      address            TEXT,
      category           TEXT NOT NULL DEFAULT 'outpatient',
      allergies          TEXT,
      chronic_conditions TEXT,
      next_of_kin_name   TEXT,
      next_of_kin_phone  TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS visits (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_id    INTEGER NOT NULL REFERENCES patients(id),
      facility_id   INTEGER NOT NULL REFERENCES facilities(id),
      visit_number  TEXT NOT NULL UNIQUE,
      priority      TEXT NOT NULL DEFAULT 'normal',
      department_id INTEGER REFERENCES departments(id),
      status        TEXT NOT NULL DEFAULT 'waiting',
      triage_vitals TEXT,
      triage_notes  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
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
      test_name    TEXT NOT NULL,
      requested_by INTEGER NOT NULL REFERENCES auth_users(id),
      status       TEXT NOT NULL DEFAULT 'requested',
      result TEXT, result_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS prescriptions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id     INTEGER NOT NULL REFERENCES visits(id),
      drug_name    TEXT NOT NULL,
      dosage TEXT, frequency TEXT, duration TEXT, quantity INTEGER,
      requested_by INTEGER REFERENCES auth_users(id),
      dispensed    INTEGER NOT NULL DEFAULT 0,
      dispensed_by INTEGER REFERENCES auth_users(id),
      dispensed_at TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS inventory (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id   INTEGER NOT NULL REFERENCES facilities(id),
      item_name     TEXT NOT NULL,
      category TEXT, sku TEXT,
      quantity      INTEGER NOT NULL DEFAULT 0,
      unit TEXT, buying_price REAL, selling_price REAL,
      reorder_level INTEGER DEFAULT 10, expiry_date TEXT,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bills (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id     INTEGER NOT NULL REFERENCES visits(id),
      patient_id   INTEGER NOT NULL REFERENCES patients(id),
      total_amount REAL NOT NULL DEFAULT 0,
      net_amount   REAL NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'unpaid',
      created_by   INTEGER REFERENCES auth_users(id),
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bill_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL REFERENCES bills(id),
      item_type TEXT, description TEXT,
      quantity    INTEGER NOT NULL DEFAULT 1,
      unit_price  REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS payments (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id          INTEGER NOT NULL REFERENCES bills(id),
      patient_id       INTEGER NOT NULL REFERENCES patients(id),
      amount           REAL NOT NULL,
      method           TEXT NOT NULL DEFAULT 'cash',
      reference_number TEXT,
      cashier_id       INTEGER REFERENCES auth_users(id),
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      facility_id INTEGER REFERENCES facilities(id),
      user_id     INTEGER REFERENCES auth_users(id),
      action TEXT NOT NULL, module TEXT, record_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Save license
  db.run(
    `INSERT OR REPLACE INTO license (id, facility_name, license_key, installed_at)
     VALUES (1, ?, ?, datetime('now'))`,
    [facilityName.trim(), licenseKey.trim().toUpperCase()]
  );

  // Create facility if not exists
  let facilityId;
  const existing = db.exec(
    'SELECT id FROM facilities WHERE LOWER(name) = LOWER(?) LIMIT 1',
    [facilityName.trim()]
  );
  if (existing.length && existing[0].values.length) {
    facilityId = existing[0].values[0][0];
  } else {
    db.run('INSERT INTO facilities (name) VALUES (?)', [facilityName.trim()]);
    facilityId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    for (const name of ['OPD','Triage','Consultation','Laboratory','Pharmacy','Billing']) {
      db.run('INSERT INTO departments (facility_id, name) VALUES (?, ?)', [facilityId, name]);
    }
    console.log(`✅  Created facility with default departments.\n`);
  }

  // ── Step 3: Admin account ──────────────────────────────────────────────
  console.log('── Step 2: Admin Account ────────────────────────────────\n');
  const adminName     = await ask('Admin full name: ');
  const adminEmail    = await ask('Admin email: ');
  const adminPassword = await ask('Admin password (min 8 characters): ');

  if (adminPassword.length < 8) {
    console.error('\n❌  Password must be at least 8 characters.\n');
    rl.close(); process.exit(1);
  }

  const existingUser = db.exec(
    'SELECT id FROM auth_users WHERE LOWER(email) = LOWER(?)', [adminEmail.trim()]
  );
  if (existingUser.length && existingUser[0].values.length) {
    console.log(`\n⚠  "${adminEmail}" already exists — skipping.\n`);
  } else {
    const hash = await bcrypt.hash(adminPassword, 12);
    db.run(
      `INSERT INTO auth_users (name, email, password_hash, role, facility_id)
       VALUES (?, ?, ?, 'admin', ?)`,
      [adminName.trim(), adminEmail.trim().toLowerCase(), hash, facilityId]
    );
    console.log('\n✅  Admin account created!\n');
  }

  // Save DB
  writeFileSync(DB_PATH, Buffer.from(db.export()));
  db.close();

  console.log('══════════════════════════════════════════════════════════');
  console.log('🎉  AfyaCore is ready!');
  console.log('   Start the app:  npm run electron:dev');
  console.log('   Build .exe:     npm run build:win');
  console.log('   Build .dmg:     npm run build:mac');
  console.log('══════════════════════════════════════════════════════════\n');
  rl.close();
}

main().catch((err) => {
  console.error('\n❌  Setup failed:', err.message || err);
  process.exit(1);
});