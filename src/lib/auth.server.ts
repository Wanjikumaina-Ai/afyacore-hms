/**
 * src/lib/auth.server.ts
 *
 * All server-side auth logic. Never imported by client-side code.
 *
 * Exports:
 *   getDb()               sql.js singleton, auto-migrates schema
 *   getSession()          reads session cookie → AuthUser | null
 *   createSession()       writes session row, returns token
 *   makeLoginCookie()     Set-Cookie header string (12h)
 *   makeLogoutCookie()    Set-Cookie header string (clears)
 *   destroySession()      deletes session row
 *   requireAuth()         throws redirect('/login') if not authenticated
 *   requireRole()         throws redirect('/403') if wrong role
 *   loginUser()           validates credentials
 *   changePassword()      bcrypt hash + clears must_change_password
 *   ensureDefaultAdmin()  called once after license activation
 *   createUser()          admin creates staff account
 *   listUsers()           admin lists all users
 *   updateUser()          admin edits name/role/active status
 *   resetUserPassword()   admin resets password → temp = Afya@{username}
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { redirect } from 'react-router';
import type { Database } from 'sql.js';
import type { Role } from './roles';

// ── DB singleton ──────────────────────────────────────────────────────────────

let _db: Database | null = null;

function getDbPath(): string {
  return path.resolve(process.cwd(), 'data', 'afyacore.db');
}

export async function getDb(): Promise<Database> {
  if (_db) return _db;

  // sql.js ships as CJS; use createRequire for ESM SSR compatibility
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const initSqlJs = require(
    path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-asm.js')
  ) as (cfg?: object) => Promise<{ Database: new (data?: Buffer) => Database }>;

  const SQL = await initSqlJs();
  const dbPath = getDbPath();

  _db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database();

  runMigrations(_db);
  return _db;
}

function saveDb(db: Database): void {
  const dbPath = getDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function safeAlter(db: Database, sql: string): void {
  try { db.run(sql); } catch { /* column/table already exists — safe to ignore */ }
}

function runMigrations(db: Database): void {
  // Sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      token      TEXT    NOT NULL UNIQUE,
      user_id    INTEGER NOT NULL REFERENCES auth_users(id),
      expires_at TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Columns that may not exist in older schema versions
  safeAlter(db, `ALTER TABLE auth_users ADD COLUMN password_hash        TEXT`);
  safeAlter(db, `ALTER TABLE auth_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`);
  safeAlter(db, `ALTER TABLE auth_users ADD COLUMN is_active            INTEGER NOT NULL DEFAULT 1`);
  safeAlter(db, `ALTER TABLE auth_users ADD COLUMN role                 TEXT    NOT NULL DEFAULT 'receptionist'`);
  safeAlter(db, `ALTER TABLE auth_users ADD COLUMN facility_id          INTEGER REFERENCES facilities(id)`);
  safeAlter(db, `ALTER TABLE auth_users ADD COLUMN created_at           TEXT    DEFAULT (datetime('now'))`);

  saveDb(db);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  is_active: number;
  must_change_password: number;
  facility_id: number | null;
}

export interface UserRow extends AuthUser {
  created_at: string;
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

const COOKIE_NAME = 'afya_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('='))];
    })
  );
}

function makeSessionCookie(token: string, maxAge: number): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function makeLoginCookie(token: string): string {
  return makeSessionCookie(token, SESSION_TTL_MS / 1000);
}

export function makeLogoutCookie(): string {
  return makeSessionCookie('', 0);
}

// ── Session ───────────────────────────────────────────────────────────────────

export async function getSession(request: Request): Promise<AuthUser | null> {
  const token = parseCookies(request.headers.get('cookie'))[COOKIE_NAME];
  if (!token) return null;

  const db = await getDb();
  const res = db.exec(
    `SELECT u.id, u.username, u.name, u.role, u.is_active,
            u.must_change_password, u.facility_id
     FROM   sessions s
     JOIN   auth_users u ON u.id = s.user_id
     WHERE  s.token = ?
       AND  s.expires_at > datetime('now')
       AND  u.is_active = 1`,
    [token]
  );
  if (!res.length || !res[0].values.length) return null;

  const [id, username, name, role, is_active, must_change_password, facility_id] =
    res[0].values[0];

  return {
    id: id as number,
    username: username as string,
    name: name as string,
    role: role as Role,
    is_active: is_active as number,
    must_change_password: must_change_password as number,
    facility_id: facility_id as number | null,
  };
}

export async function createSession(userId: number): Promise<string> {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.run(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
    [token, userId, expiresAt]
  );
  saveDb(db);
  return token;
}

export async function destroySession(request: Request): Promise<void> {
  const token = parseCookies(request.headers.get('cookie'))[COOKIE_NAME];
  if (!token) return;
  const db = await getDb();
  db.run(`DELETE FROM sessions WHERE token = ?`, [token]);
  saveDb(db);
}

// ── Auth guards ───────────────────────────────────────────────────────────────

/**
 * Use at the top of any route loader/action that requires login.
 * Throws a redirect to /login if no valid session exists.
 * Throws a redirect to /change-password if password change is pending.
 */
export async function requireAuth(request: Request): Promise<AuthUser> {
  const user = await getSession(request);
  if (!user) throw redirect('/login');
  if (user.must_change_password) throw redirect('/change-password');
  return user;
}

/**
 * Use at the top of any route loader/action that requires a specific role.
 * Throws a redirect to /403 if the user's role is not in the allowedRoles list.
 *
 * @example
 * const user = await requireRole(request, ['admin', 'accountant']);
 */
export async function requireRole(
  request: Request,
  allowedRoles: Role[]
): Promise<AuthUser> {
  const user = await requireAuth(request);
  if (!allowedRoles.includes(user.role)) throw redirect('/403');
  return user;
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function loginUser(
  username: string,
  password: string
): Promise<{ success: true; user: AuthUser } | { success: false; error: string }> {
  const db = await getDb();

  const res = db.exec(
    `SELECT id, username, name, role, is_active, must_change_password,
            facility_id, password_hash
     FROM   auth_users
     WHERE  username = ? AND is_active = 1`,
    [username.trim().toLowerCase()]
  );

  if (!res.length || !res[0].values.length) {
    // Deliberate delay to frustrate brute-force even on "user not found"
    await bcrypt.hash('dummy', 10);
    return { success: false, error: 'Invalid username or password.' };
  }

  const [id, uname, name, role, is_active, must_change_password, facility_id, hash] =
    res[0].values[0];

  const ok = await bcrypt.compare(password, hash as string);
  if (!ok) return { success: false, error: 'Invalid username or password.' };

  return {
    success: true,
    user: {
      id: id as number,
      username: uname as string,
      name: name as string,
      role: role as Role,
      is_active: is_active as number,
      must_change_password: must_change_password as number,
      facility_id: facility_id as number | null,
    },
  };
}

// ── Password management ───────────────────────────────────────────────────────

export async function changePassword(
  userId: number,
  newPassword: string
): Promise<void> {
  const db = await getDb();
  const hash = await bcrypt.hash(newPassword, 12);
  db.run(
    `UPDATE auth_users SET password_hash = ?, must_change_password = 0 WHERE id = ?`,
    [hash, userId]
  );
  saveDb(db);
}

/**
 * Admin resets a user's password back to the default pattern: Afya@{username}
 * Sets must_change_password = 1 so they are forced to change it on next login.
 * Returns the temp password to show the admin.
 */
export async function resetUserPassword(userId: number): Promise<string> {
  const db = await getDb();
  const res = db.exec(
    `SELECT username FROM auth_users WHERE id = ?`,
    [userId]
  );
  if (!res.length || !res[0].values.length) throw new Error('User not found.');

  const username = res[0].values[0][0] as string;
  const tempPassword = `Afya@${username}`;
  const hash = await bcrypt.hash(tempPassword, 12);

  db.run(
    `UPDATE auth_users
     SET    password_hash = ?, must_change_password = 1
     WHERE  id = ?`,
    [hash, userId]
  );
  saveDb(db);
  return tempPassword;
}

// ── First-boot setup ──────────────────────────────────────────────────────────

/**
 * Called once after a license key is activated.
 * Creates the facility row and the default admin account if they don't exist.
 * Default admin credentials: username=admin, password=Admin@1234
 * must_change_password=1 so they set their own password on first login.
 */
export async function ensureDefaultAdmin(hospitalName: string): Promise<void> {
  const db = await getDb();

  db.run(
    `INSERT OR IGNORE INTO facilities (id, name) VALUES (1, ?)`,
    [hospitalName]
  );

  const existing = db.exec(
    `SELECT id FROM auth_users WHERE username = 'admin' LIMIT 1`
  );
  if (existing.length && existing[0].values.length) {
    saveDb(db);
    return;
  }

  const hash = await bcrypt.hash('Admin@1234', 12);
  db.run(
    `INSERT INTO auth_users
       (username, name, role, is_active, must_change_password, facility_id, password_hash)
     VALUES ('admin', 'System Administrator', 'admin', 1, 1, 1, ?)`,
    [hash]
  );
  saveDb(db);
}

// ── User management (admin only) ──────────────────────────────────────────────

export interface CreateUserInput {
  username: string;
  name: string;
  role: Role;
  facilityId?: number;
}

/**
 * Creates a new staff account.
 * Initial password = Afya@{username}  e.g. "Afya@drnjoroge"
 * must_change_password = 1 — user must set their own password on first login.
 * Returns the generated temp password so the admin can hand it to the staff member.
 */
export async function createUser(
  input: CreateUserInput
): Promise<{ id: number; tempPassword: string }> {
  const db = await getDb();
  const username = input.username.trim().toLowerCase();

  const dup = db.exec(
    `SELECT id FROM auth_users WHERE username = ?`,
    [username]
  );
  if (dup.length && dup[0].values.length) {
    throw new Error(`Username "${username}" is already taken.`);
  }

  const tempPassword = `Afya@${username}`;
  const hash = await bcrypt.hash(tempPassword, 12);
  const facilityId = input.facilityId ?? 1;

  db.run(
    `INSERT INTO auth_users
       (username, name, role, is_active, must_change_password, facility_id, password_hash)
     VALUES (?, ?, ?, 1, 1, ?, ?)`,
    [username, input.name.trim(), input.role, facilityId, hash]
  );

  const idRes = db.exec(`SELECT last_insert_rowid() AS id`);
  const id = idRes[0].values[0][0] as number;
  saveDb(db);
  return { id, tempPassword };
}

export async function listUsers(facilityId?: number): Promise<UserRow[]> {
  const db = await getDb();
  const sql = facilityId
    ? `SELECT id, username, name, role, is_active, must_change_password,
              facility_id, coalesce(created_at,'') AS created_at
       FROM   auth_users
       WHERE  facility_id = ?
       ORDER  BY name`
    : `SELECT id, username, name, role, is_active, must_change_password,
              facility_id, coalesce(created_at,'') AS created_at
       FROM   auth_users
       ORDER  BY name`;

  const res = db.exec(sql, facilityId ? [facilityId] : []);
  if (!res.length) return [];
  const cols = res[0].columns;
  return res[0].values.map(
    (row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])) as unknown as UserRow
  );
}

export async function updateUser(
  userId: number,
  data: { name?: string; role?: Role; is_active?: number }
): Promise<void> {
  const db = await getDb();
  if (data.name !== undefined)
    db.run(`UPDATE auth_users SET name = ?      WHERE id = ?`, [data.name,      userId]);
  if (data.role !== undefined)
    db.run(`UPDATE auth_users SET role = ?      WHERE id = ?`, [data.role,      userId]);
  if (data.is_active !== undefined)
    db.run(`UPDATE auth_users SET is_active = ? WHERE id = ?`, [data.is_active, userId]);
  saveDb(db);
}
