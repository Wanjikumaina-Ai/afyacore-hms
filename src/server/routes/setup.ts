import { Hono } from 'hono';
import { db, generateId } from '../../lib/db/database';
import { authService } from '../../lib/auth/auth-service';
import { auditLogger } from '../../lib/audit/audit-logger';
import { licenseService } from '../../lib/license/license-service';

export const setupRouter = new Hono();

// ── POST /api/auth/setup-admin ─────────────────────────────────
// Called once during the server setup wizard
// Creates the hospital record, first branch, and super admin
// Only works if setup is not already complete
setupRouter.post('/auth/setup-admin', async (c) => {
  // Guard: only run if not already set up
  const alreadySetup = db.findOne<{ value: string }>(
    `SELECT value FROM system_config WHERE key = 'setup_complete'`,
  );
  if (alreadySetup?.value === '1') {
    return c.json({ error: 'Setup already completed. This endpoint is disabled.' }, 403);
  }

  const body = await c.req.json();
  const {
    username, email, password, firstName, lastName,
    hospitalName, hospitalPhone, hospitalAddress, nhifCode,
  } = body;

  // Validate required fields
  if (!username || !email || !password || !firstName || !lastName || !hospitalName) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const passwordCheck = authService.validatePasswordStrength(password);
  if (!passwordCheck.valid) {
    return c.json({ error: passwordCheck.error }, 400);
  }

  try {
    db.transaction(() => {
      // 1. Create hospital record
      const hospitalId = generateId();
      db.run(
        `INSERT INTO hospitals (id, name, phone, address, nhif_code, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [hospitalId, hospitalName, hospitalPhone ?? null, hospitalAddress ?? null, nhifCode ?? null],
      );

      // 2. Create headquarters branch
      const branchId = generateId();
      db.run(
        `INSERT INTO branches (id, hospital_id, name, branch_code, type, phone, is_active)
         VALUES (?, ?, ?, ?, 'headquarters', ?, 1)`,
        [branchId, hospitalId, hospitalName + ' HQ', 'HQ001', hospitalPhone ?? null],
      );

      // 3. Update system config
      const configs: [string, string][] = [
        ['setup_complete', '1'],
        ['hospital_id', hospitalId],
        ['default_branch_id', branchId],
        ['hospital_name', hospitalName],
        ['setup_date', new Date().toISOString()],
      ];
      for (const [key, value] of configs) {
        db.run(
          `INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)`,
          [key, value],
        );
      }
    });

    // 4. Create super admin user (outside transaction so authService can use DB)
    const branchId = db.findOne<{ value: string }>(
      `SELECT value FROM system_config WHERE key = 'default_branch_id'`,
    )?.value ?? '';

    const result = await authService.createUser({
      username,
      email,
      password,
      firstName,
      lastName,
      roleId: 'role-superadmin',
      branchId,
      createdBy: 'system-setup',
    });

    if (!result.success) {
      return c.json({ error: result.error ?? 'Failed to create admin user' }, 400);
    }

    // Clear must_change_password for the setup admin (they just set it)
    db.run(
      `UPDATE users SET must_change_password = 0 WHERE id = ?`,
      [result.userId!],
    );

    await auditLogger.log({
      userId: result.userId,
      username,
      action: 'SYSTEM_START',
      module: 'admin',
      resource: 'system',
      status: 'success',
      riskLevel: 'high',
      newValues: { hospitalName, setupComplete: true },
    });

    return c.json({
      success: true,
      hospitalName,
      adminId: result.userId,
      message: 'Setup complete. AfyaCore is ready.',
    });

  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ── GET /api/system/setup-status ──────────────────────────────
setupRouter.get('/system/setup-status', (c) => {
  const setupComplete = db.findOne<{ value: string }>(
    `SELECT value FROM system_config WHERE key = 'setup_complete'`,
  );
  const hospitalName = db.findOne<{ value: string }>(
    `SELECT value FROM system_config WHERE key = 'hospital_name'`,
  );
  const licenseStatus = licenseService.validateLicense();

  return c.json({
    setupComplete: setupComplete?.value === '1',
    hospitalName: hospitalName?.value ?? null,
    licenseActive: licenseStatus.active,
    licenseType: licenseStatus.licenseType,
    maxBranches: licenseStatus.maxBranches,
    maxUsers: licenseStatus.maxUsers,
  });
});
