/**
 * FILE: src/app/api/auth/token/route.js
 *
 * POST { action:'signin',  email, password }  → sets session cookie, returns user
 * POST { action:'signout' }                   → clears cookie
 * GET                                         → returns current user or null
 */

import sql from '@/app/api/utils/sql.js';
import { auditLog } from '@/app/api/utils/rbac.js';
import {
  verifyPassword, createSession, deleteSession,
  makeSessionCookie, checkLicense, auth,
} from '@/auth.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const ip   = request.headers.get('x-forwarded-for') || null;
    const ua   = request.headers.get('user-agent')      || null;

    // ── Sign out ───────────────────────────────────────────────────────────
    if (body.action === 'signout') {
      const cookieHeader = request.headers.get('cookie') || '';
      const match        = cookieHeader.match(/afya_session=([^;]+)/);
      if (match?.[1]) {
        const session = await auth(request);
        if (session?.user) {
          await auditLog({ user: session.user, action: 'LOGOUT', module: 'auth', request });
        }
        await deleteSession(match[1]);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie':   makeSessionCookie(null, true),
        },
      });
    }

    // ── Sign in ────────────────────────────────────────────────────────────
    const lic = await checkLicense();
    if (!lic.licensed) {
      return Response.json({ error: `License error: ${lic.error}` }, { status: 403 });
    }

    const { email, password } = body;
    if (!email || !password) {
      return Response.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const users = await sql(
      `SELECT u.*, f.name AS facility_name, b.name AS branch_name
       FROM auth_users u
       LEFT JOIN facilities f ON u.facility_id = f.id
       LEFT JOIN branches   b ON u.branch_id   = b.id
       WHERE LOWER(u.email) = LOWER(?)`,
      [email.trim()]
    );

    if (!users.length) {
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const user = users[0];

    if (!user.is_active) {
      return Response.json({ error: 'Your account is inactive. Contact your administrator.' }, { status: 403 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      await auditLog({
        user: { id: user.id, facility_id: user.facility_id, branch_id: user.branch_id, role: user.role },
        action: 'LOGIN_FAILED', module: 'auth', notes: 'Wrong password', request,
      });
      return Response.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const token = await createSession(user.id, ip, ua);
    const { password_hash, ...safeUser } = user;

    await auditLog({
      user: { id: user.id, facility_id: user.facility_id, branch_id: user.branch_id, role: user.role },
      action: 'LOGIN', module: 'auth', request,
    });

    return new Response(JSON.stringify({ ok: true, user: safeUser }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie':   makeSessionCookie(token),
      },
    });
  } catch (err) {
    console.error('POST /api/auth/token error:', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET(request) {
  const session = await auth(request);
  if (!session?.user) return Response.json({ user: null });
  return Response.json({ user: session.user });
}