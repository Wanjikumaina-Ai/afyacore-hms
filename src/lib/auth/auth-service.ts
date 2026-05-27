import bcrypt from 'bcryptjs';
import { createHmac, createHash, randomBytes } from 'node:crypto';
import { db, generateId } from '../db/database';
import { auditLogger } from '../audit/audit-logger';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleName: string;
  roleCategory: string;
  branchId: string | null;
  departmentId: string | null;
  permissions: Set<string>;
  sessionToken: string;
  sessionExpires: string;
  mfaEnabled: boolean;
  mfaPending: boolean;
  mustChangePassword: boolean;
}

export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  requiresMfa?: boolean;
  tempToken?: string;
  error?: string;
  lockedUntil?: string;
}

export interface SessionInfo {
  userId: string;
  branchId: string | null;
  roleId: string;
  roleName: string;
  permissions: Set<string>;
  expiresAt: string;
}

const SESSION_DURATION_MINUTES = 30;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const BCRYPT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET ?? 'afyacore-session-secret-change-in-prod';

// ─── AuthService ──────────────────────────────────────────────────────────────
export class AuthService {
  private static instance: AuthService;

  static getInstance(): AuthService {
    if (!AuthService.instance) AuthService.instance = new AuthService();
    return AuthService.instance;
  }

  // ─── Login ───────────────────────────────────────────────────────────────
  async login(
    username: string,
    password: string,
    deviceFingerprint: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<LoginResult> {
    // 1. Find user
    const user = db.findOne<{
      id: string; username: string; email: string; password_hash: string;
      salt: string; first_name: string; last_name: string; role_id: string;
      branch_id: string | null; department_id: string | null;
      is_active: number; is_locked: number; failed_login_count: number;
      mfa_enabled: number; mfa_secret: string | null; must_change_password: number;
    }>(
      `SELECT u.*, r.name as role_name, r.category as role_category
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE (u.username = ? OR u.email = ?) AND u.is_active = 1`,
      [username, username],
    );

    if (!user) {
      this.recordFailedAttempt(username, ipAddress, deviceFingerprint, 'user_not_found');
      await auditLogger.log({
        action: 'LOGIN_FAILED', module: 'auth', resource: 'users',
        username, ipAddress, deviceFingerprint,
        status: 'failed', failureReason: 'User not found', riskLevel: 'medium',
      });
      return { success: false, error: 'Invalid credentials' };
    }

    // 2. Check lock
    if (user.is_locked) {
      await auditLogger.log({
        userId: user.id, username: user.username, action: 'LOGIN_BLOCKED',
        module: 'auth', resource: 'users', resourceId: user.id,
        ipAddress, deviceFingerprint, status: 'blocked',
        failureReason: 'Account locked', riskLevel: 'high',
      });
      return { success: false, error: 'Account is locked. Contact administrator.' };
    }

    // 3. Check if failed logins warrant lockout
    if (user.failed_login_count >= MAX_FAILED_LOGINS) {
      db.run(
        `UPDATE users SET is_locked = 1 WHERE id = ?`,
        [user.id],
      );
      return { success: false, error: 'Account locked due to multiple failed attempts.' };
    }

    // 4. Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      db.run(
        `UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = ?`,
        [user.id],
      );
      this.recordFailedAttempt(username, ipAddress, deviceFingerprint, 'wrong_password');
      await auditLogger.log({
        userId: user.id, username: user.username, action: 'LOGIN_FAILED',
        module: 'auth', resource: 'users', resourceId: user.id,
        ipAddress, deviceFingerprint, status: 'failed',
        failureReason: 'Invalid password', riskLevel: 'medium',
      });
      const remaining = MAX_FAILED_LOGINS - user.failed_login_count - 1;
      return { success: false, error: `Invalid credentials. ${remaining} attempts remaining.` };
    }

    // 5. Handle MFA
    if (user.mfa_enabled && user.mfa_secret) {
      const tempToken = this.generateTempToken(user.id);
      return { success: true, requiresMfa: true, tempToken };
    }

    // 6. Create session
    const authUser = await this.createSession(user, deviceFingerprint, ipAddress, userAgent);

    // 7. Reset failed logins
    db.run(
      `UPDATE users SET failed_login_count = 0, last_login = datetime('now'),
       last_login_ip = ?, last_login_device = ? WHERE id = ?`,
      [ipAddress, deviceFingerprint, user.id],
    );

    await auditLogger.log({
      userId: user.id, username: user.username, userRole: (user as any).role_name,
      branchId: user.branch_id ?? undefined, action: 'LOGIN',
      module: 'auth', resource: 'users', resourceId: user.id,
      ipAddress, deviceFingerprint, sessionId: authUser.sessionToken,
      status: 'success', riskLevel: 'low',
    });

    return { success: true, user: authUser };
  }

  // ─── MFA Verification ────────────────────────────────────────────────────
  async verifyMfa(tempToken: string, totpCode: string, ipAddress: string): Promise<LoginResult> {
    const userId = this.verifyTempToken(tempToken);
    if (!userId) return { success: false, error: 'Invalid or expired MFA token' };

    const user = db.findOne<any>(
      `SELECT u.*, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      [userId],
    );
    if (!user) return { success: false, error: 'User not found' };

    const valid = this.verifyTotp(user.mfa_secret, totpCode);
    if (!valid) {
      await auditLogger.log({
        userId: user.id, username: user.username, action: 'MFA_FAILED',
        module: 'auth', resource: 'users', resourceId: user.id,
        ipAddress, status: 'failed', riskLevel: 'high',
      });
      return { success: false, error: 'Invalid MFA code' };
    }

    const authUser = await this.createSession(user, '', ipAddress, '');
    return { success: true, user: authUser };
  }

  // ─── Session ─────────────────────────────────────────────────────────────
  private async createSession(
    user: any,
    deviceFingerprint: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthUser> {
    const sessionToken = this.generateSessionToken();
    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_MINUTES * 60_000,
    ).toISOString();

    // Remove old sessions for same device
    db.run(
      `DELETE FROM active_sessions WHERE user_id = ? AND device_fingerprint = ?`,
      [user.id, deviceFingerprint],
    );

    db.run(
      `INSERT INTO active_sessions
       (id, user_id, session_token, device_fingerprint, ip_address, user_agent, branch_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(), user.id, sessionToken, deviceFingerprint,
        ipAddress, userAgent, user.branch_id ?? null, expiresAt,
      ],
    );

    const permissions = this.loadPermissions(user.role_id);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      roleId: user.role_id,
      roleName: user.role_name,
      roleCategory: user.role_category,
      branchId: user.branch_id,
      departmentId: user.department_id,
      permissions,
      sessionToken,
      sessionExpires: expiresAt,
      mfaEnabled: !!user.mfa_enabled,
      mfaPending: false,
      mustChangePassword: !!user.must_change_password,
    };
  }

  validateSession(token: string): SessionInfo | null {
    const session = db.findOne<{
      user_id: string; branch_id: string | null; expires_at: string;
      is_revoked: number; role_id: string; role_name: string;
    }>(
      `SELECT s.user_id, s.branch_id, s.expires_at, s.is_revoked,
              u.role_id, r.name as role_name
       FROM active_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE s.session_token = ? AND s.is_revoked = 0`,
      [token],
    );

    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) {
      this.revokeSession(token, 'expired');
      return null;
    }

    // Refresh session activity
    db.run(
      `UPDATE active_sessions SET last_activity = datetime('now'), expires_at = ?
       WHERE session_token = ?`,
      [
        new Date(Date.now() + SESSION_DURATION_MINUTES * 60_000).toISOString(),
        token,
      ],
    );

    return {
      userId: session.user_id,
      branchId: session.branch_id,
      roleId: session.role_id,
      roleName: session.role_name,
      permissions: this.loadPermissions(session.role_id),
      expiresAt: session.expires_at,
    };
  }

  revokeSession(token: string, reason = 'logout'): void {
    db.run(
      `UPDATE active_sessions SET is_revoked = 1, revoked_reason = ? WHERE session_token = ?`,
      [reason, token],
    );
  }

  revokeAllUserSessions(userId: string): void {
    db.run(
      `UPDATE active_sessions SET is_revoked = 1, revoked_reason = 'admin_revoke'
       WHERE user_id = ?`,
      [userId],
    );
  }

  // ─── Permissions ─────────────────────────────────────────────────────────
  loadPermissions(roleId: string): Set<string> {
    const perms = db.query<{ module: string; resource: string; action: string }>(
      `SELECT p.module, p.resource, p.action
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ?`,
      [roleId],
    );
    return new Set(perms.rows.map((p) => `${p.module}:${p.resource}:${p.action}`));
  }

  hasPermission(permissions: Set<string>, module: string, resource: string, action: string): boolean {
    // Super admin always has access
    if (permissions.has('*:*:*')) return true;
    return (
      permissions.has(`${module}:${resource}:${action}`) ||
      permissions.has(`${module}:*:*`) ||
      permissions.has(`${module}:${resource}:*`)
    );
  }

  // ─── Password Management ─────────────────────────────────────────────────
  async hashPassword(password: string): Promise<{ hash: string; salt: string }> {
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);
    return { hash, salt };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean; error?: string }> {
    const user = db.findOne<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = ?`,
      [userId],
    );
    if (!user) return { success: false, error: 'User not found' };

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return { success: false, error: 'Current password is incorrect' };

    const validation = this.validatePasswordStrength(newPassword);
    if (!validation.valid) return { success: false, error: validation.error };

    const { hash, salt } = await this.hashPassword(newPassword);
    db.run(
      `UPDATE users SET password_hash = ?, salt = ?, password_changed_at = datetime('now'),
       must_change_password = 0,
       password_expires_at = datetime('now', '+90 days')
       WHERE id = ?`,
      [hash, salt, userId],
    );
    return { success: true };
  }

  validatePasswordStrength(password: string): { valid: boolean; error?: string } {
    if (password.length < 8) return { valid: false, error: 'Password must be at least 8 characters' };
    if (!/[A-Z]/.test(password)) return { valid: false, error: 'Password must contain uppercase letter' };
    if (!/[0-9]/.test(password)) return { valid: false, error: 'Password must contain a number' };
    if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, error: 'Password must contain a symbol' };
    return { valid: true };
  }

  // ─── MFA Helpers ─────────────────────────────────────────────────────────
  generateMfaSecret(): string {
    return randomBytes(20).toString('base64');
  }

  verifyTotp(secret: string, token: string): boolean {
    // RFC 6238 TOTP — 30s window, ±1 step tolerance
    const time = Math.floor(Date.now() / 30_000);
    for (const step of [-1, 0, 1]) {
      const expected = this.generateTotp(secret, time + step);
      if (expected === token) return true;
    }
    return false;
  }

  private generateTotp(secret: string, counter: number): string {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(counter));
    const hmac = createHmac('sha1', Buffer.from(secret, 'base64'));
    hmac.update(buf);
    const digest = hmac.digest();
    const offset = digest[19] & 0x0f;
    const code =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return String(code % 1_000_000).padStart(6, '0');
  }

  // ─── Token Helpers ───────────────────────────────────────────────────────
  private generateSessionToken(): string {
    return randomBytes(48).toString('hex');
  }

  private generateTempToken(userId: string): string {
    const payload = `${userId}:${Date.now()}`;
    const sig = createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
  }

  private verifyTempToken(token: string): string | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString();
      const parts = decoded.split(':');
      if (parts.length !== 3) return null;
      const [userId, ts, sig] = parts;
      const expectedSig = createHmac('sha256', JWT_SECRET)
        .update(`${userId}:${ts}`)
        .digest('hex');
      if (sig !== expectedSig) return null;
      if (Date.now() - Number(ts) > 5 * 60_000) return null; // 5min expiry
      return userId;
    } catch {
      return null;
    }
  }

  // ─── Failed Attempts ─────────────────────────────────────────────────────
  private recordFailedAttempt(
    username: string,
    ipAddress: string,
    deviceFingerprint: string,
    reason: string,
  ): void {
    db.run(
      `INSERT INTO failed_login_attempts(username, ip_address, device_fingerprint, reason)
       VALUES (?, ?, ?, ?)`,
      [username, ipAddress, deviceFingerprint, reason],
    );
  }

  // ─── User Management ─────────────────────────────────────────────────────
  async createUser(data: {
    username: string; email: string; password: string;
    firstName: string; lastName: string; roleId: string;
    branchId?: string; departmentId?: string; createdBy: string;
  }): Promise<{ success: boolean; userId?: string; error?: string }> {
    const existing = db.findOne(
      `SELECT id FROM users WHERE username = ? OR email = ?`,
      [data.username, data.email],
    );
    if (existing) return { success: false, error: 'Username or email already exists' };

    const strength = this.validatePasswordStrength(data.password);
    if (!strength.valid) return { success: false, error: strength.error };

    const { hash, salt } = await this.hashPassword(data.password);
    const userId = generateId();

    db.run(
      `INSERT INTO users
       (id, username, email, password_hash, salt, first_name, last_name,
        role_id, branch_id, department_id, must_change_password, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        userId, data.username, data.email, hash, salt,
        data.firstName, data.lastName, data.roleId,
        data.branchId ?? null, data.departmentId ?? null, data.createdBy,
      ],
    );

    return { success: true, userId };
  }

  lockUser(userId: string, reason: string, adminId: string): void {
    db.run(`UPDATE users SET is_locked = 1 WHERE id = ?`, [userId]);
    auditLogger.log({
      userId: adminId, action: 'USER_LOCKED', module: 'auth',
      resource: 'users', resourceId: userId,
      newValues: { reason }, riskLevel: 'high', status: 'success',
    });
  }

  unlockUser(userId: string, adminId: string): void {
    db.run(
      `UPDATE users SET is_locked = 0, failed_login_count = 0 WHERE id = ?`,
      [userId],
    );
    auditLogger.log({
      userId: adminId, action: 'USER_UNLOCKED', module: 'auth',
      resource: 'users', resourceId: userId, riskLevel: 'medium', status: 'success',
    });
  }
}

export const authService = AuthService.getInstance();
