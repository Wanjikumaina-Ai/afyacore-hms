/**
 * FILE: src/auth.js
 *
 * Local authentication — replaces @hono/auth-js and @auth/core.
 * Uses bcryptjs (pure JS, zero native compilation).
 *
 * Exports used by every API route:
 *   auth(request)           → { user } | null
 *   hashPassword(pw)        → string
 *   verifyPassword(pw,hash) → boolean
 *   createSession(userId)   → token string
 *   deleteSession(token)
 *   makeSessionCookie(token, clear?)
 *   checkLicense()          → { licensed, facilityName?, expiresAt?, error? }
 */

import bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'crypto';
import sql from '@/app/api/utils/sql.js';

// ── Config ─────────────────────────────────────────────────────────────────
// THIS SECRET IS USED TO SIGN LICENSE KEYS.
// It must be the same value you used in the license-key generator tool.
// Change it before selling the first copy — after that, NEVER change it
// or all existing license keys will stop working.
export const AFYA_SECRET  = 'AFYATECH-WANJIKU-CHANGE-ME-2025';

const SESSION_COOKIE = 'afya_session';
const SESSION_DAYS   = 7;

// ── Password helpers ────────────────────────────────────────────────────────
export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// ── Session token generator ────────────────────────────────────────────────
function generateToken() {
  return randomBytes(32).toString('hex');
}

// ── Session management ──────────────────────────────────────────────────────
export async function createSession(userId) {
  const token     = await generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await sql(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
    [userId, token, expiresAt]
  );
  return token;
}

export async function deleteSession(token) {
  await sql('DELETE FROM sessions WHERE token = ?', [token]);
}

export function makeSessionCookie(token, clear = false) {
  if (clear) {
    return `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
  }
  return (
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86_400}`
  );
}

// ── auth(request) — drop-in for Anything's auth() ──────────────────────────
// Returns { user: { id, name, email, role, facility_id, department_id } }
// or null if not logged in / session expired.
export async function auth(request) {
  try {
    const cookieHeader = request?.headers?.get('cookie') || '';
    const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    const token = match?.[1];
    if (!token) return null;

    const rows = await sql(
      `SELECT s.user_id    AS id,
              u.name,
              u.email,
              u.role,
              u.facility_id,
              u.department_id
       FROM   sessions  s
       JOIN   auth_users u ON s.user_id = u.id
       WHERE  s.token      = ?
         AND  s.expires_at > datetime('now')`,
      [token]
    );

    if (!rows.length) return null;
    return { user: rows[0] };
  } catch {
    return null;
  }
}

// ── License validation ──────────────────────────────────────────────────────
// License key format:  AFYA-<base64url-payload>-<16-char HMAC sig>
// Payload (base64url-encoded JSON): { facilityName, issuedAt, expiresAt }
//
// Generation (run in license-key-generator.html before each client visit):
//   payload = btoa(JSON.stringify({ facilityName, issuedAt, expiresAt }))
//             .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
//   sig     = HMAC-SHA256(AFYA_SECRET, payload).substring(0, 16)
//   key     = `AFYA-${payload}-${sig}`

export async function checkLicense() {
  try {
    const rows = await sql('SELECT * FROM license WHERE id = 1', []);
    if (!rows.length) return { licensed: false, error: 'No license installed' };

    const lic   = rows[0];
    const parts = lic.license_key.split('-');
    if (parts.length < 3 || parts[0] !== 'AFYA') {
      return { licensed: false, error: 'Invalid key format' };
    }

    const sig     = parts[parts.length - 1];
    const payload = parts.slice(1, -1).join('-');

    const expected = createHmac('sha256', AFYA_SECRET)
      .update(payload)
      .digest('hex')
      .substring(0, 16);

    if (sig !== expected) {
      return { licensed: false, error: 'License key invalid' };
    }

    let data;
    try {
      data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
      return { licensed: false, error: 'License key corrupt' };
    }

    if (new Date(data.expiresAt) < new Date()) {
      return { licensed: false, error: `License expired on ${data.expiresAt}` };
    }
    if (data.facilityName !== lic.facility_name) {
      return { licensed: false, error: 'Facility name mismatch' };
    }

    return {
      licensed:     true,
      facilityName: lic.facility_name,
      expiresAt:    data.expiresAt,
    };
  } catch (err) {
    return { licensed: false, error: err.message };
  }
}