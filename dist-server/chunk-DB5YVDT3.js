import {
  auditLogger
} from "./chunk-RKPTT3DN.js";
import {
  db,
  generateId
} from "./chunk-O5JH7GYK.js";

// src/lib/auth/auth-service.ts
import bcrypt from "bcryptjs";
import { createHmac, randomBytes } from "node:crypto";
var SESSION_DURATION_MINUTES = 30;
var MAX_FAILED_LOGINS = 5;
var BCRYPT_ROUNDS = 12;
var JWT_SECRET = process.env.JWT_SECRET ?? "afyacore-session-secret-change-in-prod";
var AuthService = class _AuthService {
  static instance;
  static getInstance() {
    if (!_AuthService.instance) _AuthService.instance = new _AuthService();
    return _AuthService.instance;
  }
  // ─── Login ───────────────────────────────────────────────────────────────
  async login(username, password, deviceFingerprint, ipAddress, userAgent) {
    const user = db.findOne(
      `SELECT u.*, r.name as role_name, r.category as role_category
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE (u.username = ? OR u.email = ?) AND u.is_active = 1`,
      [username, username]
    );
    if (!user) {
      this.recordFailedAttempt(username, ipAddress, deviceFingerprint, "user_not_found");
      await auditLogger.log({
        action: "LOGIN_FAILED",
        module: "auth",
        resource: "users",
        username,
        ipAddress,
        deviceFingerprint,
        status: "failed",
        failureReason: "User not found",
        riskLevel: "medium"
      });
      return { success: false, error: "Invalid credentials" };
    }
    if (user.is_locked) {
      await auditLogger.log({
        userId: user.id,
        username: user.username,
        action: "LOGIN_BLOCKED",
        module: "auth",
        resource: "users",
        resourceId: user.id,
        ipAddress,
        deviceFingerprint,
        status: "blocked",
        failureReason: "Account locked",
        riskLevel: "high"
      });
      return { success: false, error: "Account is locked. Contact administrator." };
    }
    if (user.failed_login_count >= MAX_FAILED_LOGINS) {
      db.run(
        `UPDATE users SET is_locked = 1 WHERE id = ?`,
        [user.id]
      );
      return { success: false, error: "Account locked due to multiple failed attempts." };
    }
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      db.run(
        `UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = ?`,
        [user.id]
      );
      this.recordFailedAttempt(username, ipAddress, deviceFingerprint, "wrong_password");
      await auditLogger.log({
        userId: user.id,
        username: user.username,
        action: "LOGIN_FAILED",
        module: "auth",
        resource: "users",
        resourceId: user.id,
        ipAddress,
        deviceFingerprint,
        status: "failed",
        failureReason: "Invalid password",
        riskLevel: "medium"
      });
      const remaining = MAX_FAILED_LOGINS - user.failed_login_count - 1;
      return { success: false, error: `Invalid credentials. ${remaining} attempts remaining.` };
    }
    if (user.mfa_enabled && user.mfa_secret) {
      const tempToken = this.generateTempToken(user.id);
      return { success: true, requiresMfa: true, tempToken };
    }
    const authUser = await this.createSession(user, deviceFingerprint, ipAddress, userAgent);
    db.run(
      `UPDATE users SET failed_login_count = 0, last_login = datetime('now'),
       last_login_ip = ?, last_login_device = ? WHERE id = ?`,
      [ipAddress, deviceFingerprint, user.id]
    );
    await auditLogger.log({
      userId: user.id,
      username: user.username,
      userRole: user.role_name,
      branchId: user.branch_id ?? void 0,
      action: "LOGIN",
      module: "auth",
      resource: "users",
      resourceId: user.id,
      ipAddress,
      deviceFingerprint,
      sessionId: authUser.sessionToken,
      status: "success",
      riskLevel: "low"
    });
    return { success: true, user: authUser };
  }
  // ─── MFA Verification ────────────────────────────────────────────────────
  async verifyMfa(tempToken, totpCode, ipAddress) {
    const userId = this.verifyTempToken(tempToken);
    if (!userId) return { success: false, error: "Invalid or expired MFA token" };
    const user = db.findOne(
      `SELECT u.*, r.name as role_name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      [userId]
    );
    if (!user) return { success: false, error: "User not found" };
    const valid = this.verifyTotp(user.mfa_secret, totpCode);
    if (!valid) {
      await auditLogger.log({
        userId: user.id,
        username: user.username,
        action: "MFA_FAILED",
        module: "auth",
        resource: "users",
        resourceId: user.id,
        ipAddress,
        status: "failed",
        riskLevel: "high"
      });
      return { success: false, error: "Invalid MFA code" };
    }
    const authUser = await this.createSession(user, "", ipAddress, "");
    return { success: true, user: authUser };
  }
  // ─── Session ─────────────────────────────────────────────────────────────
  async createSession(user, deviceFingerprint, ipAddress, userAgent) {
    const sessionToken = this.generateSessionToken();
    const expiresAt = new Date(
      Date.now() + SESSION_DURATION_MINUTES * 6e4
    ).toISOString();
    db.run(
      `DELETE FROM active_sessions WHERE user_id = ? AND device_fingerprint = ?`,
      [user.id, deviceFingerprint]
    );
    db.run(
      `INSERT INTO active_sessions
       (id, user_id, session_token, device_fingerprint, ip_address, user_agent, branch_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId(),
        user.id,
        sessionToken,
        deviceFingerprint,
        ipAddress,
        userAgent,
        user.branch_id ?? null,
        expiresAt
      ]
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
      mustChangePassword: !!user.must_change_password
    };
  }
  validateSession(token) {
    const session = db.findOne(
      `SELECT s.user_id, s.branch_id, s.expires_at, s.is_revoked,
              u.role_id, r.name as role_name
       FROM active_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE s.session_token = ? AND s.is_revoked = 0`,
      [token]
    );
    if (!session) return null;
    if (new Date(session.expires_at) < /* @__PURE__ */ new Date()) {
      this.revokeSession(token, "expired");
      return null;
    }
    db.run(
      `UPDATE active_sessions SET last_activity = datetime('now'), expires_at = ?
       WHERE session_token = ?`,
      [
        new Date(Date.now() + SESSION_DURATION_MINUTES * 6e4).toISOString(),
        token
      ]
    );
    return {
      userId: session.user_id,
      branchId: session.branch_id,
      roleId: session.role_id,
      roleName: session.role_name,
      permissions: this.loadPermissions(session.role_id),
      expiresAt: session.expires_at
    };
  }
  revokeSession(token, reason = "logout") {
    db.run(
      `UPDATE active_sessions SET is_revoked = 1, revoked_reason = ? WHERE session_token = ?`,
      [reason, token]
    );
  }
  revokeAllUserSessions(userId) {
    db.run(
      `UPDATE active_sessions SET is_revoked = 1, revoked_reason = 'admin_revoke'
       WHERE user_id = ?`,
      [userId]
    );
  }
  // ─── Permissions ─────────────────────────────────────────────────────────
  loadPermissions(roleId) {
    const perms = db.query(
      `SELECT p.module, p.resource, p.action
       FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ?`,
      [roleId]
    );
    return new Set(perms.rows.map((p) => `${p.module}:${p.resource}:${p.action}`));
  }
  hasPermission(permissions, module, resource, action) {
    if (permissions.has("*:*:*")) return true;
    return permissions.has(`${module}:${resource}:${action}`) || permissions.has(`${module}:*:*`) || permissions.has(`${module}:${resource}:*`);
  }
  // ─── Password Management ─────────────────────────────────────────────────
  async hashPassword(password) {
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const hash = await bcrypt.hash(password, salt);
    return { hash, salt };
  }
  async changePassword(userId, currentPassword, newPassword) {
    const user = db.findOne(
      `SELECT password_hash FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) return { success: false, error: "User not found" };
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return { success: false, error: "Current password is incorrect" };
    const validation = this.validatePasswordStrength(newPassword);
    if (!validation.valid) return { success: false, error: validation.error };
    const { hash, salt } = await this.hashPassword(newPassword);
    db.run(
      `UPDATE users SET password_hash = ?, salt = ?, password_changed_at = datetime('now'),
       must_change_password = 0,
       password_expires_at = datetime('now', '+90 days')
       WHERE id = ?`,
      [hash, salt, userId]
    );
    return { success: true };
  }
  validatePasswordStrength(password) {
    if (password.length < 8) return { valid: false, error: "Password must be at least 8 characters" };
    if (!/[A-Z]/.test(password)) return { valid: false, error: "Password must contain uppercase letter" };
    if (!/[0-9]/.test(password)) return { valid: false, error: "Password must contain a number" };
    if (!/[^A-Za-z0-9]/.test(password)) return { valid: false, error: "Password must contain a symbol" };
    return { valid: true };
  }
  // ─── MFA Helpers ─────────────────────────────────────────────────────────
  generateMfaSecret() {
    return randomBytes(20).toString("base64");
  }
  verifyTotp(secret, token) {
    const time = Math.floor(Date.now() / 3e4);
    for (const step of [-1, 0, 1]) {
      const expected = this.generateTotp(secret, time + step);
      if (expected === token) return true;
    }
    return false;
  }
  generateTotp(secret, counter) {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(counter));
    const hmac = createHmac("sha1", Buffer.from(secret, "base64"));
    hmac.update(buf);
    const digest = hmac.digest();
    const offset = digest[19] & 15;
    const code = (digest[offset] & 127) << 24 | (digest[offset + 1] & 255) << 16 | (digest[offset + 2] & 255) << 8 | digest[offset + 3] & 255;
    return String(code % 1e6).padStart(6, "0");
  }
  // ─── Token Helpers ───────────────────────────────────────────────────────
  generateSessionToken() {
    return randomBytes(48).toString("hex");
  }
  generateTempToken(userId) {
    const payload = `${userId}:${Date.now()}`;
    const sig = createHmac("sha256", JWT_SECRET).update(payload).digest("hex");
    return Buffer.from(`${payload}:${sig}`).toString("base64url");
  }
  verifyTempToken(token) {
    try {
      const decoded = Buffer.from(token, "base64url").toString();
      const parts = decoded.split(":");
      if (parts.length !== 3) return null;
      const [userId, ts, sig] = parts;
      const expectedSig = createHmac("sha256", JWT_SECRET).update(`${userId}:${ts}`).digest("hex");
      if (sig !== expectedSig) return null;
      if (Date.now() - Number(ts) > 5 * 6e4) return null;
      return userId;
    } catch {
      return null;
    }
  }
  // ─── Failed Attempts ─────────────────────────────────────────────────────
  recordFailedAttempt(username, ipAddress, deviceFingerprint, reason) {
    db.run(
      `INSERT INTO failed_login_attempts(username, ip_address, device_fingerprint, reason)
       VALUES (?, ?, ?, ?)`,
      [username, ipAddress, deviceFingerprint, reason]
    );
  }
  // ─── User Management ─────────────────────────────────────────────────────
  async createUser(data) {
    const existing = db.findOne(
      `SELECT id FROM users WHERE username = ? OR email = ?`,
      [data.username, data.email]
    );
    if (existing) return { success: false, error: "Username or email already exists" };
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
        userId,
        data.username,
        data.email,
        hash,
        salt,
        data.firstName,
        data.lastName,
        data.roleId,
        data.branchId ?? null,
        data.departmentId ?? null,
        data.createdBy
      ]
    );
    return { success: true, userId };
  }
  lockUser(userId, reason, adminId) {
    db.run(`UPDATE users SET is_locked = 1 WHERE id = ?`, [userId]);
    auditLogger.log({
      userId: adminId,
      action: "USER_LOCKED",
      module: "auth",
      resource: "users",
      resourceId: userId,
      newValues: { reason },
      riskLevel: "high",
      status: "success"
    });
  }
  unlockUser(userId, adminId) {
    db.run(
      `UPDATE users SET is_locked = 0, failed_login_count = 0 WHERE id = ?`,
      [userId]
    );
    auditLogger.log({
      userId: adminId,
      action: "USER_UNLOCKED",
      module: "auth",
      resource: "users",
      resourceId: userId,
      riskLevel: "medium",
      status: "success"
    });
  }
};
var authService = AuthService.getInstance();

export {
  AuthService,
  authService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2xpYi9hdXRoL2F1dGgtc2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IGJjcnlwdCBmcm9tICdiY3J5cHRqcyc7XG5pbXBvcnQgeyBjcmVhdGVIbWFjLCBjcmVhdGVIYXNoLCByYW5kb21CeXRlcyB9IGZyb20gJ25vZGU6Y3J5cHRvJztcbmltcG9ydCB7IGRiLCBnZW5lcmF0ZUlkIH0gZnJvbSAnLi4vZGIvZGF0YWJhc2UnO1xuaW1wb3J0IHsgYXVkaXRMb2dnZXIgfSBmcm9tICcuLi9hdWRpdC9hdWRpdC1sb2dnZXInO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgVHlwZXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhVc2VyIHtcbiAgaWQ6IHN0cmluZztcbiAgdXNlcm5hbWU6IHN0cmluZztcbiAgZW1haWw6IHN0cmluZztcbiAgZmlyc3ROYW1lOiBzdHJpbmc7XG4gIGxhc3ROYW1lOiBzdHJpbmc7XG4gIHJvbGVJZDogc3RyaW5nO1xuICByb2xlTmFtZTogc3RyaW5nO1xuICByb2xlQ2F0ZWdvcnk6IHN0cmluZztcbiAgYnJhbmNoSWQ6IHN0cmluZyB8IG51bGw7XG4gIGRlcGFydG1lbnRJZDogc3RyaW5nIHwgbnVsbDtcbiAgcGVybWlzc2lvbnM6IFNldDxzdHJpbmc+O1xuICBzZXNzaW9uVG9rZW46IHN0cmluZztcbiAgc2Vzc2lvbkV4cGlyZXM6IHN0cmluZztcbiAgbWZhRW5hYmxlZDogYm9vbGVhbjtcbiAgbWZhUGVuZGluZzogYm9vbGVhbjtcbiAgbXVzdENoYW5nZVBhc3N3b3JkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExvZ2luUmVzdWx0IHtcbiAgc3VjY2VzczogYm9vbGVhbjtcbiAgdXNlcj86IEF1dGhVc2VyO1xuICByZXF1aXJlc01mYT86IGJvb2xlYW47XG4gIHRlbXBUb2tlbj86IHN0cmluZztcbiAgZXJyb3I/OiBzdHJpbmc7XG4gIGxvY2tlZFVudGlsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlc3Npb25JbmZvIHtcbiAgdXNlcklkOiBzdHJpbmc7XG4gIGJyYW5jaElkOiBzdHJpbmcgfCBudWxsO1xuICByb2xlSWQ6IHN0cmluZztcbiAgcm9sZU5hbWU6IHN0cmluZztcbiAgcGVybWlzc2lvbnM6IFNldDxzdHJpbmc+O1xuICBleHBpcmVzQXQ6IHN0cmluZztcbn1cblxuY29uc3QgU0VTU0lPTl9EVVJBVElPTl9NSU5VVEVTID0gMzA7XG5jb25zdCBNQVhfRkFJTEVEX0xPR0lOUyA9IDU7XG5jb25zdCBMT0NLT1VUX01JTlVURVMgPSAxNTtcbmNvbnN0IEJDUllQVF9ST1VORFMgPSAxMjtcbmNvbnN0IEpXVF9TRUNSRVQgPSBwcm9jZXNzLmVudi5KV1RfU0VDUkVUID8/ICdhZnlhY29yZS1zZXNzaW9uLXNlY3JldC1jaGFuZ2UtaW4tcHJvZCc7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBBdXRoU2VydmljZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjbGFzcyBBdXRoU2VydmljZSB7XG4gIHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBBdXRoU2VydmljZTtcblxuICBzdGF0aWMgZ2V0SW5zdGFuY2UoKTogQXV0aFNlcnZpY2Uge1xuICAgIGlmICghQXV0aFNlcnZpY2UuaW5zdGFuY2UpIEF1dGhTZXJ2aWNlLmluc3RhbmNlID0gbmV3IEF1dGhTZXJ2aWNlKCk7XG4gICAgcmV0dXJuIEF1dGhTZXJ2aWNlLmluc3RhbmNlO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIExvZ2luIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBhc3luYyBsb2dpbihcbiAgICB1c2VybmFtZTogc3RyaW5nLFxuICAgIHBhc3N3b3JkOiBzdHJpbmcsXG4gICAgZGV2aWNlRmluZ2VycHJpbnQ6IHN0cmluZyxcbiAgICBpcEFkZHJlc3M6IHN0cmluZyxcbiAgICB1c2VyQWdlbnQ6IHN0cmluZyxcbiAgKTogUHJvbWlzZTxMb2dpblJlc3VsdD4ge1xuICAgIC8vIDEuIEZpbmQgdXNlclxuICAgIGNvbnN0IHVzZXIgPSBkYi5maW5kT25lPHtcbiAgICAgIGlkOiBzdHJpbmc7IHVzZXJuYW1lOiBzdHJpbmc7IGVtYWlsOiBzdHJpbmc7IHBhc3N3b3JkX2hhc2g6IHN0cmluZztcbiAgICAgIHNhbHQ6IHN0cmluZzsgZmlyc3RfbmFtZTogc3RyaW5nOyBsYXN0X25hbWU6IHN0cmluZzsgcm9sZV9pZDogc3RyaW5nO1xuICAgICAgYnJhbmNoX2lkOiBzdHJpbmcgfCBudWxsOyBkZXBhcnRtZW50X2lkOiBzdHJpbmcgfCBudWxsO1xuICAgICAgaXNfYWN0aXZlOiBudW1iZXI7IGlzX2xvY2tlZDogbnVtYmVyOyBmYWlsZWRfbG9naW5fY291bnQ6IG51bWJlcjtcbiAgICAgIG1mYV9lbmFibGVkOiBudW1iZXI7IG1mYV9zZWNyZXQ6IHN0cmluZyB8IG51bGw7IG11c3RfY2hhbmdlX3Bhc3N3b3JkOiBudW1iZXI7XG4gICAgfT4oXG4gICAgICBgU0VMRUNUIHUuKiwgci5uYW1lIGFzIHJvbGVfbmFtZSwgci5jYXRlZ29yeSBhcyByb2xlX2NhdGVnb3J5XG4gICAgICAgRlJPTSB1c2VycyB1XG4gICAgICAgSk9JTiByb2xlcyByIE9OIHIuaWQgPSB1LnJvbGVfaWRcbiAgICAgICBXSEVSRSAodS51c2VybmFtZSA9ID8gT1IgdS5lbWFpbCA9ID8pIEFORCB1LmlzX2FjdGl2ZSA9IDFgLFxuICAgICAgW3VzZXJuYW1lLCB1c2VybmFtZV0sXG4gICAgKTtcblxuICAgIGlmICghdXNlcikge1xuICAgICAgdGhpcy5yZWNvcmRGYWlsZWRBdHRlbXB0KHVzZXJuYW1lLCBpcEFkZHJlc3MsIGRldmljZUZpbmdlcnByaW50LCAndXNlcl9ub3RfZm91bmQnKTtcbiAgICAgIGF3YWl0IGF1ZGl0TG9nZ2VyLmxvZyh7XG4gICAgICAgIGFjdGlvbjogJ0xPR0lOX0ZBSUxFRCcsIG1vZHVsZTogJ2F1dGgnLCByZXNvdXJjZTogJ3VzZXJzJyxcbiAgICAgICAgdXNlcm5hbWUsIGlwQWRkcmVzcywgZGV2aWNlRmluZ2VycHJpbnQsXG4gICAgICAgIHN0YXR1czogJ2ZhaWxlZCcsIGZhaWx1cmVSZWFzb246ICdVc2VyIG5vdCBmb3VuZCcsIHJpc2tMZXZlbDogJ21lZGl1bScsXG4gICAgICB9KTtcbiAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0ludmFsaWQgY3JlZGVudGlhbHMnIH07XG4gICAgfVxuXG4gICAgLy8gMi4gQ2hlY2sgbG9ja1xuICAgIGlmICh1c2VyLmlzX2xvY2tlZCkge1xuICAgICAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICAgICAgdXNlcklkOiB1c2VyLmlkLCB1c2VybmFtZTogdXNlci51c2VybmFtZSwgYWN0aW9uOiAnTE9HSU5fQkxPQ0tFRCcsXG4gICAgICAgIG1vZHVsZTogJ2F1dGgnLCByZXNvdXJjZTogJ3VzZXJzJywgcmVzb3VyY2VJZDogdXNlci5pZCxcbiAgICAgICAgaXBBZGRyZXNzLCBkZXZpY2VGaW5nZXJwcmludCwgc3RhdHVzOiAnYmxvY2tlZCcsXG4gICAgICAgIGZhaWx1cmVSZWFzb246ICdBY2NvdW50IGxvY2tlZCcsIHJpc2tMZXZlbDogJ2hpZ2gnLFxuICAgICAgfSk7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdBY2NvdW50IGlzIGxvY2tlZC4gQ29udGFjdCBhZG1pbmlzdHJhdG9yLicgfTtcbiAgICB9XG5cbiAgICAvLyAzLiBDaGVjayBpZiBmYWlsZWQgbG9naW5zIHdhcnJhbnQgbG9ja291dFxuICAgIGlmICh1c2VyLmZhaWxlZF9sb2dpbl9jb3VudCA+PSBNQVhfRkFJTEVEX0xPR0lOUykge1xuICAgICAgZGIucnVuKFxuICAgICAgICBgVVBEQVRFIHVzZXJzIFNFVCBpc19sb2NrZWQgPSAxIFdIRVJFIGlkID0gP2AsXG4gICAgICAgIFt1c2VyLmlkXSxcbiAgICAgICk7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdBY2NvdW50IGxvY2tlZCBkdWUgdG8gbXVsdGlwbGUgZmFpbGVkIGF0dGVtcHRzLicgfTtcbiAgICB9XG5cbiAgICAvLyA0LiBWZXJpZnkgcGFzc3dvcmRcbiAgICBjb25zdCBwYXNzd29yZFZhbGlkID0gYXdhaXQgYmNyeXB0LmNvbXBhcmUocGFzc3dvcmQsIHVzZXIucGFzc3dvcmRfaGFzaCk7XG4gICAgaWYgKCFwYXNzd29yZFZhbGlkKSB7XG4gICAgICBkYi5ydW4oXG4gICAgICAgIGBVUERBVEUgdXNlcnMgU0VUIGZhaWxlZF9sb2dpbl9jb3VudCA9IGZhaWxlZF9sb2dpbl9jb3VudCArIDEgV0hFUkUgaWQgPSA/YCxcbiAgICAgICAgW3VzZXIuaWRdLFxuICAgICAgKTtcbiAgICAgIHRoaXMucmVjb3JkRmFpbGVkQXR0ZW1wdCh1c2VybmFtZSwgaXBBZGRyZXNzLCBkZXZpY2VGaW5nZXJwcmludCwgJ3dyb25nX3Bhc3N3b3JkJyk7XG4gICAgICBhd2FpdCBhdWRpdExvZ2dlci5sb2coe1xuICAgICAgICB1c2VySWQ6IHVzZXIuaWQsIHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lLCBhY3Rpb246ICdMT0dJTl9GQUlMRUQnLFxuICAgICAgICBtb2R1bGU6ICdhdXRoJywgcmVzb3VyY2U6ICd1c2VycycsIHJlc291cmNlSWQ6IHVzZXIuaWQsXG4gICAgICAgIGlwQWRkcmVzcywgZGV2aWNlRmluZ2VycHJpbnQsIHN0YXR1czogJ2ZhaWxlZCcsXG4gICAgICAgIGZhaWx1cmVSZWFzb246ICdJbnZhbGlkIHBhc3N3b3JkJywgcmlza0xldmVsOiAnbWVkaXVtJyxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgcmVtYWluaW5nID0gTUFYX0ZBSUxFRF9MT0dJTlMgLSB1c2VyLmZhaWxlZF9sb2dpbl9jb3VudCAtIDE7XG4gICAgICByZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBJbnZhbGlkIGNyZWRlbnRpYWxzLiAke3JlbWFpbmluZ30gYXR0ZW1wdHMgcmVtYWluaW5nLmAgfTtcbiAgICB9XG5cbiAgICAvLyA1LiBIYW5kbGUgTUZBXG4gICAgaWYgKHVzZXIubWZhX2VuYWJsZWQgJiYgdXNlci5tZmFfc2VjcmV0KSB7XG4gICAgICBjb25zdCB0ZW1wVG9rZW4gPSB0aGlzLmdlbmVyYXRlVGVtcFRva2VuKHVzZXIuaWQpO1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgcmVxdWlyZXNNZmE6IHRydWUsIHRlbXBUb2tlbiB9O1xuICAgIH1cblxuICAgIC8vIDYuIENyZWF0ZSBzZXNzaW9uXG4gICAgY29uc3QgYXV0aFVzZXIgPSBhd2FpdCB0aGlzLmNyZWF0ZVNlc3Npb24odXNlciwgZGV2aWNlRmluZ2VycHJpbnQsIGlwQWRkcmVzcywgdXNlckFnZW50KTtcblxuICAgIC8vIDcuIFJlc2V0IGZhaWxlZCBsb2dpbnNcbiAgICBkYi5ydW4oXG4gICAgICBgVVBEQVRFIHVzZXJzIFNFVCBmYWlsZWRfbG9naW5fY291bnQgPSAwLCBsYXN0X2xvZ2luID0gZGF0ZXRpbWUoJ25vdycpLFxuICAgICAgIGxhc3RfbG9naW5faXAgPSA/LCBsYXN0X2xvZ2luX2RldmljZSA9ID8gV0hFUkUgaWQgPSA/YCxcbiAgICAgIFtpcEFkZHJlc3MsIGRldmljZUZpbmdlcnByaW50LCB1c2VyLmlkXSxcbiAgICApO1xuXG4gICAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICAgIHVzZXJJZDogdXNlci5pZCwgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUsIHVzZXJSb2xlOiAodXNlciBhcyBhbnkpLnJvbGVfbmFtZSxcbiAgICAgIGJyYW5jaElkOiB1c2VyLmJyYW5jaF9pZCA/PyB1bmRlZmluZWQsIGFjdGlvbjogJ0xPR0lOJyxcbiAgICAgIG1vZHVsZTogJ2F1dGgnLCByZXNvdXJjZTogJ3VzZXJzJywgcmVzb3VyY2VJZDogdXNlci5pZCxcbiAgICAgIGlwQWRkcmVzcywgZGV2aWNlRmluZ2VycHJpbnQsIHNlc3Npb25JZDogYXV0aFVzZXIuc2Vzc2lvblRva2VuLFxuICAgICAgc3RhdHVzOiAnc3VjY2VzcycsIHJpc2tMZXZlbDogJ2xvdycsXG4gICAgfSk7XG5cbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCB1c2VyOiBhdXRoVXNlciB9O1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE1GQSBWZXJpZmljYXRpb24gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGFzeW5jIHZlcmlmeU1mYSh0ZW1wVG9rZW46IHN0cmluZywgdG90cENvZGU6IHN0cmluZywgaXBBZGRyZXNzOiBzdHJpbmcpOiBQcm9taXNlPExvZ2luUmVzdWx0PiB7XG4gICAgY29uc3QgdXNlcklkID0gdGhpcy52ZXJpZnlUZW1wVG9rZW4odGVtcFRva2VuKTtcbiAgICBpZiAoIXVzZXJJZCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnSW52YWxpZCBvciBleHBpcmVkIE1GQSB0b2tlbicgfTtcblxuICAgIGNvbnN0IHVzZXIgPSBkYi5maW5kT25lPGFueT4oXG4gICAgICBgU0VMRUNUIHUuKiwgci5uYW1lIGFzIHJvbGVfbmFtZSBGUk9NIHVzZXJzIHUgSk9JTiByb2xlcyByIE9OIHIuaWQgPSB1LnJvbGVfaWQgV0hFUkUgdS5pZCA9ID9gLFxuICAgICAgW3VzZXJJZF0sXG4gICAgKTtcbiAgICBpZiAoIXVzZXIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ1VzZXIgbm90IGZvdW5kJyB9O1xuXG4gICAgY29uc3QgdmFsaWQgPSB0aGlzLnZlcmlmeVRvdHAodXNlci5tZmFfc2VjcmV0LCB0b3RwQ29kZSk7XG4gICAgaWYgKCF2YWxpZCkge1xuICAgICAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICAgICAgdXNlcklkOiB1c2VyLmlkLCB1c2VybmFtZTogdXNlci51c2VybmFtZSwgYWN0aW9uOiAnTUZBX0ZBSUxFRCcsXG4gICAgICAgIG1vZHVsZTogJ2F1dGgnLCByZXNvdXJjZTogJ3VzZXJzJywgcmVzb3VyY2VJZDogdXNlci5pZCxcbiAgICAgICAgaXBBZGRyZXNzLCBzdGF0dXM6ICdmYWlsZWQnLCByaXNrTGV2ZWw6ICdoaWdoJyxcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnSW52YWxpZCBNRkEgY29kZScgfTtcbiAgICB9XG5cbiAgICBjb25zdCBhdXRoVXNlciA9IGF3YWl0IHRoaXMuY3JlYXRlU2Vzc2lvbih1c2VyLCAnJywgaXBBZGRyZXNzLCAnJyk7XG4gICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgdXNlcjogYXV0aFVzZXIgfTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBTZXNzaW9uIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBwcml2YXRlIGFzeW5jIGNyZWF0ZVNlc3Npb24oXG4gICAgdXNlcjogYW55LFxuICAgIGRldmljZUZpbmdlcnByaW50OiBzdHJpbmcsXG4gICAgaXBBZGRyZXNzOiBzdHJpbmcsXG4gICAgdXNlckFnZW50OiBzdHJpbmcsXG4gICk6IFByb21pc2U8QXV0aFVzZXI+IHtcbiAgICBjb25zdCBzZXNzaW9uVG9rZW4gPSB0aGlzLmdlbmVyYXRlU2Vzc2lvblRva2VuKCk7XG4gICAgY29uc3QgZXhwaXJlc0F0ID0gbmV3IERhdGUoXG4gICAgICBEYXRlLm5vdygpICsgU0VTU0lPTl9EVVJBVElPTl9NSU5VVEVTICogNjBfMDAwLFxuICAgICkudG9JU09TdHJpbmcoKTtcblxuICAgIC8vIFJlbW92ZSBvbGQgc2Vzc2lvbnMgZm9yIHNhbWUgZGV2aWNlXG4gICAgZGIucnVuKFxuICAgICAgYERFTEVURSBGUk9NIGFjdGl2ZV9zZXNzaW9ucyBXSEVSRSB1c2VyX2lkID0gPyBBTkQgZGV2aWNlX2ZpbmdlcnByaW50ID0gP2AsXG4gICAgICBbdXNlci5pZCwgZGV2aWNlRmluZ2VycHJpbnRdLFxuICAgICk7XG5cbiAgICBkYi5ydW4oXG4gICAgICBgSU5TRVJUIElOVE8gYWN0aXZlX3Nlc3Npb25zXG4gICAgICAgKGlkLCB1c2VyX2lkLCBzZXNzaW9uX3Rva2VuLCBkZXZpY2VfZmluZ2VycHJpbnQsIGlwX2FkZHJlc3MsIHVzZXJfYWdlbnQsIGJyYW5jaF9pZCwgZXhwaXJlc19hdClcbiAgICAgICBWQUxVRVMgKD8sID8sID8sID8sID8sID8sID8sID8pYCxcbiAgICAgIFtcbiAgICAgICAgZ2VuZXJhdGVJZCgpLCB1c2VyLmlkLCBzZXNzaW9uVG9rZW4sIGRldmljZUZpbmdlcnByaW50LFxuICAgICAgICBpcEFkZHJlc3MsIHVzZXJBZ2VudCwgdXNlci5icmFuY2hfaWQgPz8gbnVsbCwgZXhwaXJlc0F0LFxuICAgICAgXSxcbiAgICApO1xuXG4gICAgY29uc3QgcGVybWlzc2lvbnMgPSB0aGlzLmxvYWRQZXJtaXNzaW9ucyh1c2VyLnJvbGVfaWQpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiB1c2VyLmlkLFxuICAgICAgdXNlcm5hbWU6IHVzZXIudXNlcm5hbWUsXG4gICAgICBlbWFpbDogdXNlci5lbWFpbCxcbiAgICAgIGZpcnN0TmFtZTogdXNlci5maXJzdF9uYW1lLFxuICAgICAgbGFzdE5hbWU6IHVzZXIubGFzdF9uYW1lLFxuICAgICAgcm9sZUlkOiB1c2VyLnJvbGVfaWQsXG4gICAgICByb2xlTmFtZTogdXNlci5yb2xlX25hbWUsXG4gICAgICByb2xlQ2F0ZWdvcnk6IHVzZXIucm9sZV9jYXRlZ29yeSxcbiAgICAgIGJyYW5jaElkOiB1c2VyLmJyYW5jaF9pZCxcbiAgICAgIGRlcGFydG1lbnRJZDogdXNlci5kZXBhcnRtZW50X2lkLFxuICAgICAgcGVybWlzc2lvbnMsXG4gICAgICBzZXNzaW9uVG9rZW4sXG4gICAgICBzZXNzaW9uRXhwaXJlczogZXhwaXJlc0F0LFxuICAgICAgbWZhRW5hYmxlZDogISF1c2VyLm1mYV9lbmFibGVkLFxuICAgICAgbWZhUGVuZGluZzogZmFsc2UsXG4gICAgICBtdXN0Q2hhbmdlUGFzc3dvcmQ6ICEhdXNlci5tdXN0X2NoYW5nZV9wYXNzd29yZCxcbiAgICB9O1xuICB9XG5cbiAgdmFsaWRhdGVTZXNzaW9uKHRva2VuOiBzdHJpbmcpOiBTZXNzaW9uSW5mbyB8IG51bGwge1xuICAgIGNvbnN0IHNlc3Npb24gPSBkYi5maW5kT25lPHtcbiAgICAgIHVzZXJfaWQ6IHN0cmluZzsgYnJhbmNoX2lkOiBzdHJpbmcgfCBudWxsOyBleHBpcmVzX2F0OiBzdHJpbmc7XG4gICAgICBpc19yZXZva2VkOiBudW1iZXI7IHJvbGVfaWQ6IHN0cmluZzsgcm9sZV9uYW1lOiBzdHJpbmc7XG4gICAgfT4oXG4gICAgICBgU0VMRUNUIHMudXNlcl9pZCwgcy5icmFuY2hfaWQsIHMuZXhwaXJlc19hdCwgcy5pc19yZXZva2VkLFxuICAgICAgICAgICAgICB1LnJvbGVfaWQsIHIubmFtZSBhcyByb2xlX25hbWVcbiAgICAgICBGUk9NIGFjdGl2ZV9zZXNzaW9ucyBzXG4gICAgICAgSk9JTiB1c2VycyB1IE9OIHUuaWQgPSBzLnVzZXJfaWRcbiAgICAgICBKT0lOIHJvbGVzIHIgT04gci5pZCA9IHUucm9sZV9pZFxuICAgICAgIFdIRVJFIHMuc2Vzc2lvbl90b2tlbiA9ID8gQU5EIHMuaXNfcmV2b2tlZCA9IDBgLFxuICAgICAgW3Rva2VuXSxcbiAgICApO1xuXG4gICAgaWYgKCFzZXNzaW9uKSByZXR1cm4gbnVsbDtcbiAgICBpZiAobmV3IERhdGUoc2Vzc2lvbi5leHBpcmVzX2F0KSA8IG5ldyBEYXRlKCkpIHtcbiAgICAgIHRoaXMucmV2b2tlU2Vzc2lvbih0b2tlbiwgJ2V4cGlyZWQnKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIFJlZnJlc2ggc2Vzc2lvbiBhY3Rpdml0eVxuICAgIGRiLnJ1bihcbiAgICAgIGBVUERBVEUgYWN0aXZlX3Nlc3Npb25zIFNFVCBsYXN0X2FjdGl2aXR5ID0gZGF0ZXRpbWUoJ25vdycpLCBleHBpcmVzX2F0ID0gP1xuICAgICAgIFdIRVJFIHNlc3Npb25fdG9rZW4gPSA/YCxcbiAgICAgIFtcbiAgICAgICAgbmV3IERhdGUoRGF0ZS5ub3coKSArIFNFU1NJT05fRFVSQVRJT05fTUlOVVRFUyAqIDYwXzAwMCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgdG9rZW4sXG4gICAgICBdLFxuICAgICk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgdXNlcklkOiBzZXNzaW9uLnVzZXJfaWQsXG4gICAgICBicmFuY2hJZDogc2Vzc2lvbi5icmFuY2hfaWQsXG4gICAgICByb2xlSWQ6IHNlc3Npb24ucm9sZV9pZCxcbiAgICAgIHJvbGVOYW1lOiBzZXNzaW9uLnJvbGVfbmFtZSxcbiAgICAgIHBlcm1pc3Npb25zOiB0aGlzLmxvYWRQZXJtaXNzaW9ucyhzZXNzaW9uLnJvbGVfaWQpLFxuICAgICAgZXhwaXJlc0F0OiBzZXNzaW9uLmV4cGlyZXNfYXQsXG4gICAgfTtcbiAgfVxuXG4gIHJldm9rZVNlc3Npb24odG9rZW46IHN0cmluZywgcmVhc29uID0gJ2xvZ291dCcpOiB2b2lkIHtcbiAgICBkYi5ydW4oXG4gICAgICBgVVBEQVRFIGFjdGl2ZV9zZXNzaW9ucyBTRVQgaXNfcmV2b2tlZCA9IDEsIHJldm9rZWRfcmVhc29uID0gPyBXSEVSRSBzZXNzaW9uX3Rva2VuID0gP2AsXG4gICAgICBbcmVhc29uLCB0b2tlbl0sXG4gICAgKTtcbiAgfVxuXG4gIHJldm9rZUFsbFVzZXJTZXNzaW9ucyh1c2VySWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIGRiLnJ1bihcbiAgICAgIGBVUERBVEUgYWN0aXZlX3Nlc3Npb25zIFNFVCBpc19yZXZva2VkID0gMSwgcmV2b2tlZF9yZWFzb24gPSAnYWRtaW5fcmV2b2tlJ1xuICAgICAgIFdIRVJFIHVzZXJfaWQgPSA/YCxcbiAgICAgIFt1c2VySWRdLFxuICAgICk7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgUGVybWlzc2lvbnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGxvYWRQZXJtaXNzaW9ucyhyb2xlSWQ6IHN0cmluZyk6IFNldDxzdHJpbmc+IHtcbiAgICBjb25zdCBwZXJtcyA9IGRiLnF1ZXJ5PHsgbW9kdWxlOiBzdHJpbmc7IHJlc291cmNlOiBzdHJpbmc7IGFjdGlvbjogc3RyaW5nIH0+KFxuICAgICAgYFNFTEVDVCBwLm1vZHVsZSwgcC5yZXNvdXJjZSwgcC5hY3Rpb25cbiAgICAgICBGUk9NIHJvbGVfcGVybWlzc2lvbnMgcnBcbiAgICAgICBKT0lOIHBlcm1pc3Npb25zIHAgT04gcC5pZCA9IHJwLnBlcm1pc3Npb25faWRcbiAgICAgICBXSEVSRSBycC5yb2xlX2lkID0gP2AsXG4gICAgICBbcm9sZUlkXSxcbiAgICApO1xuICAgIHJldHVybiBuZXcgU2V0KHBlcm1zLnJvd3MubWFwKChwKSA9PiBgJHtwLm1vZHVsZX06JHtwLnJlc291cmNlfToke3AuYWN0aW9ufWApKTtcbiAgfVxuXG4gIGhhc1Blcm1pc3Npb24ocGVybWlzc2lvbnM6IFNldDxzdHJpbmc+LCBtb2R1bGU6IHN0cmluZywgcmVzb3VyY2U6IHN0cmluZywgYWN0aW9uOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAvLyBTdXBlciBhZG1pbiBhbHdheXMgaGFzIGFjY2Vzc1xuICAgIGlmIChwZXJtaXNzaW9ucy5oYXMoJyo6KjoqJykpIHJldHVybiB0cnVlO1xuICAgIHJldHVybiAoXG4gICAgICBwZXJtaXNzaW9ucy5oYXMoYCR7bW9kdWxlfToke3Jlc291cmNlfToke2FjdGlvbn1gKSB8fFxuICAgICAgcGVybWlzc2lvbnMuaGFzKGAke21vZHVsZX06KjoqYCkgfHxcbiAgICAgIHBlcm1pc3Npb25zLmhhcyhgJHttb2R1bGV9OiR7cmVzb3VyY2V9OipgKVxuICAgICk7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgUGFzc3dvcmQgTWFuYWdlbWVudCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgYXN5bmMgaGFzaFBhc3N3b3JkKHBhc3N3b3JkOiBzdHJpbmcpOiBQcm9taXNlPHsgaGFzaDogc3RyaW5nOyBzYWx0OiBzdHJpbmcgfT4ge1xuICAgIGNvbnN0IHNhbHQgPSBhd2FpdCBiY3J5cHQuZ2VuU2FsdChCQ1JZUFRfUk9VTkRTKTtcbiAgICBjb25zdCBoYXNoID0gYXdhaXQgYmNyeXB0Lmhhc2gocGFzc3dvcmQsIHNhbHQpO1xuICAgIHJldHVybiB7IGhhc2gsIHNhbHQgfTtcbiAgfVxuXG4gIGFzeW5jIGNoYW5nZVBhc3N3b3JkKFxuICAgIHVzZXJJZDogc3RyaW5nLFxuICAgIGN1cnJlbnRQYXNzd29yZDogc3RyaW5nLFxuICAgIG5ld1Bhc3N3b3JkOiBzdHJpbmcsXG4gICk6IFByb21pc2U8eyBzdWNjZXNzOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gICAgY29uc3QgdXNlciA9IGRiLmZpbmRPbmU8eyBwYXNzd29yZF9oYXNoOiBzdHJpbmcgfT4oXG4gICAgICBgU0VMRUNUIHBhc3N3b3JkX2hhc2ggRlJPTSB1c2VycyBXSEVSRSBpZCA9ID9gLFxuICAgICAgW3VzZXJJZF0sXG4gICAgKTtcbiAgICBpZiAoIXVzZXIpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ1VzZXIgbm90IGZvdW5kJyB9O1xuXG4gICAgY29uc3QgdmFsaWQgPSBhd2FpdCBiY3J5cHQuY29tcGFyZShjdXJyZW50UGFzc3dvcmQsIHVzZXIucGFzc3dvcmRfaGFzaCk7XG4gICAgaWYgKCF2YWxpZCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnQ3VycmVudCBwYXNzd29yZCBpcyBpbmNvcnJlY3QnIH07XG5cbiAgICBjb25zdCB2YWxpZGF0aW9uID0gdGhpcy52YWxpZGF0ZVBhc3N3b3JkU3RyZW5ndGgobmV3UGFzc3dvcmQpO1xuICAgIGlmICghdmFsaWRhdGlvbi52YWxpZCkgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiB2YWxpZGF0aW9uLmVycm9yIH07XG5cbiAgICBjb25zdCB7IGhhc2gsIHNhbHQgfSA9IGF3YWl0IHRoaXMuaGFzaFBhc3N3b3JkKG5ld1Bhc3N3b3JkKTtcbiAgICBkYi5ydW4oXG4gICAgICBgVVBEQVRFIHVzZXJzIFNFVCBwYXNzd29yZF9oYXNoID0gPywgc2FsdCA9ID8sIHBhc3N3b3JkX2NoYW5nZWRfYXQgPSBkYXRldGltZSgnbm93JyksXG4gICAgICAgbXVzdF9jaGFuZ2VfcGFzc3dvcmQgPSAwLFxuICAgICAgIHBhc3N3b3JkX2V4cGlyZXNfYXQgPSBkYXRldGltZSgnbm93JywgJys5MCBkYXlzJylcbiAgICAgICBXSEVSRSBpZCA9ID9gLFxuICAgICAgW2hhc2gsIHNhbHQsIHVzZXJJZF0sXG4gICAgKTtcbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlIH07XG4gIH1cblxuICB2YWxpZGF0ZVBhc3N3b3JkU3RyZW5ndGgocGFzc3dvcmQ6IHN0cmluZyk6IHsgdmFsaWQ6IGJvb2xlYW47IGVycm9yPzogc3RyaW5nIH0ge1xuICAgIGlmIChwYXNzd29yZC5sZW5ndGggPCA4KSByZXR1cm4geyB2YWxpZDogZmFsc2UsIGVycm9yOiAnUGFzc3dvcmQgbXVzdCBiZSBhdCBsZWFzdCA4IGNoYXJhY3RlcnMnIH07XG4gICAgaWYgKCEvW0EtWl0vLnRlc3QocGFzc3dvcmQpKSByZXR1cm4geyB2YWxpZDogZmFsc2UsIGVycm9yOiAnUGFzc3dvcmQgbXVzdCBjb250YWluIHVwcGVyY2FzZSBsZXR0ZXInIH07XG4gICAgaWYgKCEvWzAtOV0vLnRlc3QocGFzc3dvcmQpKSByZXR1cm4geyB2YWxpZDogZmFsc2UsIGVycm9yOiAnUGFzc3dvcmQgbXVzdCBjb250YWluIGEgbnVtYmVyJyB9O1xuICAgIGlmICghL1teQS1aYS16MC05XS8udGVzdChwYXNzd29yZCkpIHJldHVybiB7IHZhbGlkOiBmYWxzZSwgZXJyb3I6ICdQYXNzd29yZCBtdXN0IGNvbnRhaW4gYSBzeW1ib2wnIH07XG4gICAgcmV0dXJuIHsgdmFsaWQ6IHRydWUgfTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBNRkEgSGVscGVycyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgZ2VuZXJhdGVNZmFTZWNyZXQoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gcmFuZG9tQnl0ZXMoMjApLnRvU3RyaW5nKCdiYXNlNjQnKTtcbiAgfVxuXG4gIHZlcmlmeVRvdHAoc2VjcmV0OiBzdHJpbmcsIHRva2VuOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICAvLyBSRkMgNjIzOCBUT1RQIFx1MjAxNCAzMHMgd2luZG93LCBcdTAwQjExIHN0ZXAgdG9sZXJhbmNlXG4gICAgY29uc3QgdGltZSA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDMwXzAwMCk7XG4gICAgZm9yIChjb25zdCBzdGVwIG9mIFstMSwgMCwgMV0pIHtcbiAgICAgIGNvbnN0IGV4cGVjdGVkID0gdGhpcy5nZW5lcmF0ZVRvdHAoc2VjcmV0LCB0aW1lICsgc3RlcCk7XG4gICAgICBpZiAoZXhwZWN0ZWQgPT09IHRva2VuKSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSBnZW5lcmF0ZVRvdHAoc2VjcmV0OiBzdHJpbmcsIGNvdW50ZXI6IG51bWJlcik6IHN0cmluZyB7XG4gICAgY29uc3QgYnVmID0gQnVmZmVyLmFsbG9jKDgpO1xuICAgIGJ1Zi53cml0ZUJpZ0ludDY0QkUoQmlnSW50KGNvdW50ZXIpKTtcbiAgICBjb25zdCBobWFjID0gY3JlYXRlSG1hYygnc2hhMScsIEJ1ZmZlci5mcm9tKHNlY3JldCwgJ2Jhc2U2NCcpKTtcbiAgICBobWFjLnVwZGF0ZShidWYpO1xuICAgIGNvbnN0IGRpZ2VzdCA9IGhtYWMuZGlnZXN0KCk7XG4gICAgY29uc3Qgb2Zmc2V0ID0gZGlnZXN0WzE5XSAmIDB4MGY7XG4gICAgY29uc3QgY29kZSA9XG4gICAgICAoKGRpZ2VzdFtvZmZzZXRdICYgMHg3ZikgPDwgMjQpIHxcbiAgICAgICgoZGlnZXN0W29mZnNldCArIDFdICYgMHhmZikgPDwgMTYpIHxcbiAgICAgICgoZGlnZXN0W29mZnNldCArIDJdICYgMHhmZikgPDwgOCkgfFxuICAgICAgKGRpZ2VzdFtvZmZzZXQgKyAzXSAmIDB4ZmYpO1xuICAgIHJldHVybiBTdHJpbmcoY29kZSAlIDFfMDAwXzAwMCkucGFkU3RhcnQoNiwgJzAnKTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBUb2tlbiBIZWxwZXJzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBwcml2YXRlIGdlbmVyYXRlU2Vzc2lvblRva2VuKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHJhbmRvbUJ5dGVzKDQ4KS50b1N0cmluZygnaGV4Jyk7XG4gIH1cblxuICBwcml2YXRlIGdlbmVyYXRlVGVtcFRva2VuKHVzZXJJZDogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBjb25zdCBwYXlsb2FkID0gYCR7dXNlcklkfToke0RhdGUubm93KCl9YDtcbiAgICBjb25zdCBzaWcgPSBjcmVhdGVIbWFjKCdzaGEyNTYnLCBKV1RfU0VDUkVUKS51cGRhdGUocGF5bG9hZCkuZGlnZXN0KCdoZXgnKTtcbiAgICByZXR1cm4gQnVmZmVyLmZyb20oYCR7cGF5bG9hZH06JHtzaWd9YCkudG9TdHJpbmcoJ2Jhc2U2NHVybCcpO1xuICB9XG5cbiAgcHJpdmF0ZSB2ZXJpZnlUZW1wVG9rZW4odG9rZW46IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBkZWNvZGVkID0gQnVmZmVyLmZyb20odG9rZW4sICdiYXNlNjR1cmwnKS50b1N0cmluZygpO1xuICAgICAgY29uc3QgcGFydHMgPSBkZWNvZGVkLnNwbGl0KCc6Jyk7XG4gICAgICBpZiAocGFydHMubGVuZ3RoICE9PSAzKSByZXR1cm4gbnVsbDtcbiAgICAgIGNvbnN0IFt1c2VySWQsIHRzLCBzaWddID0gcGFydHM7XG4gICAgICBjb25zdCBleHBlY3RlZFNpZyA9IGNyZWF0ZUhtYWMoJ3NoYTI1NicsIEpXVF9TRUNSRVQpXG4gICAgICAgIC51cGRhdGUoYCR7dXNlcklkfToke3RzfWApXG4gICAgICAgIC5kaWdlc3QoJ2hleCcpO1xuICAgICAgaWYgKHNpZyAhPT0gZXhwZWN0ZWRTaWcpIHJldHVybiBudWxsO1xuICAgICAgaWYgKERhdGUubm93KCkgLSBOdW1iZXIodHMpID4gNSAqIDYwXzAwMCkgcmV0dXJuIG51bGw7IC8vIDVtaW4gZXhwaXJ5XG4gICAgICByZXR1cm4gdXNlcklkO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEZhaWxlZCBBdHRlbXB0cyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgcHJpdmF0ZSByZWNvcmRGYWlsZWRBdHRlbXB0KFxuICAgIHVzZXJuYW1lOiBzdHJpbmcsXG4gICAgaXBBZGRyZXNzOiBzdHJpbmcsXG4gICAgZGV2aWNlRmluZ2VycHJpbnQ6IHN0cmluZyxcbiAgICByZWFzb246IHN0cmluZyxcbiAgKTogdm9pZCB7XG4gICAgZGIucnVuKFxuICAgICAgYElOU0VSVCBJTlRPIGZhaWxlZF9sb2dpbl9hdHRlbXB0cyh1c2VybmFtZSwgaXBfYWRkcmVzcywgZGV2aWNlX2ZpbmdlcnByaW50LCByZWFzb24pXG4gICAgICAgVkFMVUVTICg/LCA/LCA/LCA/KWAsXG4gICAgICBbdXNlcm5hbWUsIGlwQWRkcmVzcywgZGV2aWNlRmluZ2VycHJpbnQsIHJlYXNvbl0sXG4gICAgKTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBVc2VyIE1hbmFnZW1lbnQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGFzeW5jIGNyZWF0ZVVzZXIoZGF0YToge1xuICAgIHVzZXJuYW1lOiBzdHJpbmc7IGVtYWlsOiBzdHJpbmc7IHBhc3N3b3JkOiBzdHJpbmc7XG4gICAgZmlyc3ROYW1lOiBzdHJpbmc7IGxhc3ROYW1lOiBzdHJpbmc7IHJvbGVJZDogc3RyaW5nO1xuICAgIGJyYW5jaElkPzogc3RyaW5nOyBkZXBhcnRtZW50SWQ/OiBzdHJpbmc7IGNyZWF0ZWRCeTogc3RyaW5nO1xuICB9KTogUHJvbWlzZTx7IHN1Y2Nlc3M6IGJvb2xlYW47IHVzZXJJZD86IHN0cmluZzsgZXJyb3I/OiBzdHJpbmcgfT4ge1xuICAgIGNvbnN0IGV4aXN0aW5nID0gZGIuZmluZE9uZShcbiAgICAgIGBTRUxFQ1QgaWQgRlJPTSB1c2VycyBXSEVSRSB1c2VybmFtZSA9ID8gT1IgZW1haWwgPSA/YCxcbiAgICAgIFtkYXRhLnVzZXJuYW1lLCBkYXRhLmVtYWlsXSxcbiAgICApO1xuICAgIGlmIChleGlzdGluZykgcmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnVXNlcm5hbWUgb3IgZW1haWwgYWxyZWFkeSBleGlzdHMnIH07XG5cbiAgICBjb25zdCBzdHJlbmd0aCA9IHRoaXMudmFsaWRhdGVQYXNzd29yZFN0cmVuZ3RoKGRhdGEucGFzc3dvcmQpO1xuICAgIGlmICghc3RyZW5ndGgudmFsaWQpIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogc3RyZW5ndGguZXJyb3IgfTtcblxuICAgIGNvbnN0IHsgaGFzaCwgc2FsdCB9ID0gYXdhaXQgdGhpcy5oYXNoUGFzc3dvcmQoZGF0YS5wYXNzd29yZCk7XG4gICAgY29uc3QgdXNlcklkID0gZ2VuZXJhdGVJZCgpO1xuXG4gICAgZGIucnVuKFxuICAgICAgYElOU0VSVCBJTlRPIHVzZXJzXG4gICAgICAgKGlkLCB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkX2hhc2gsIHNhbHQsIGZpcnN0X25hbWUsIGxhc3RfbmFtZSxcbiAgICAgICAgcm9sZV9pZCwgYnJhbmNoX2lkLCBkZXBhcnRtZW50X2lkLCBtdXN0X2NoYW5nZV9wYXNzd29yZCwgY3JlYXRlZF9ieSlcbiAgICAgICBWQUxVRVMgKD8sID8sID8sID8sID8sID8sID8sID8sID8sID8sIDEsID8pYCxcbiAgICAgIFtcbiAgICAgICAgdXNlcklkLCBkYXRhLnVzZXJuYW1lLCBkYXRhLmVtYWlsLCBoYXNoLCBzYWx0LFxuICAgICAgICBkYXRhLmZpcnN0TmFtZSwgZGF0YS5sYXN0TmFtZSwgZGF0YS5yb2xlSWQsXG4gICAgICAgIGRhdGEuYnJhbmNoSWQgPz8gbnVsbCwgZGF0YS5kZXBhcnRtZW50SWQgPz8gbnVsbCwgZGF0YS5jcmVhdGVkQnksXG4gICAgICBdLFxuICAgICk7XG5cbiAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCB1c2VySWQgfTtcbiAgfVxuXG4gIGxvY2tVc2VyKHVzZXJJZDogc3RyaW5nLCByZWFzb246IHN0cmluZywgYWRtaW5JZDogc3RyaW5nKTogdm9pZCB7XG4gICAgZGIucnVuKGBVUERBVEUgdXNlcnMgU0VUIGlzX2xvY2tlZCA9IDEgV0hFUkUgaWQgPSA/YCwgW3VzZXJJZF0pO1xuICAgIGF1ZGl0TG9nZ2VyLmxvZyh7XG4gICAgICB1c2VySWQ6IGFkbWluSWQsIGFjdGlvbjogJ1VTRVJfTE9DS0VEJywgbW9kdWxlOiAnYXV0aCcsXG4gICAgICByZXNvdXJjZTogJ3VzZXJzJywgcmVzb3VyY2VJZDogdXNlcklkLFxuICAgICAgbmV3VmFsdWVzOiB7IHJlYXNvbiB9LCByaXNrTGV2ZWw6ICdoaWdoJywgc3RhdHVzOiAnc3VjY2VzcycsXG4gICAgfSk7XG4gIH1cblxuICB1bmxvY2tVc2VyKHVzZXJJZDogc3RyaW5nLCBhZG1pbklkOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBkYi5ydW4oXG4gICAgICBgVVBEQVRFIHVzZXJzIFNFVCBpc19sb2NrZWQgPSAwLCBmYWlsZWRfbG9naW5fY291bnQgPSAwIFdIRVJFIGlkID0gP2AsXG4gICAgICBbdXNlcklkXSxcbiAgICApO1xuICAgIGF1ZGl0TG9nZ2VyLmxvZyh7XG4gICAgICB1c2VySWQ6IGFkbWluSWQsIGFjdGlvbjogJ1VTRVJfVU5MT0NLRUQnLCBtb2R1bGU6ICdhdXRoJyxcbiAgICAgIHJlc291cmNlOiAndXNlcnMnLCByZXNvdXJjZUlkOiB1c2VySWQsIHJpc2tMZXZlbDogJ21lZGl1bScsIHN0YXR1czogJ3N1Y2Nlc3MnLFxuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBjb25zdCBhdXRoU2VydmljZSA9IEF1dGhTZXJ2aWNlLmdldEluc3RhbmNlKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7QUFBQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxZQUF3QixtQkFBbUI7QUEwQ3BELElBQU0sMkJBQTJCO0FBQ2pDLElBQU0sb0JBQW9CO0FBRTFCLElBQU0sZ0JBQWdC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
