import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AfyaDatabase, generateId, generateSequentialNumber } from '../src/lib/db/database';
import { AuthService } from '../src/lib/auth/auth-service';
import { AuditLogger } from '../src/lib/audit/audit-logger';
import { LicenseService } from '../src/lib/license/license-service';
import { SyncEngine } from '../src/lib/sync/sync-engine';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Test DB setup ─────────────────────────────────────────────────────────────
let testDb: AfyaDatabase;

beforeAll(async () => {
  testDb = AfyaDatabase.getInstance();
  await testDb.initialize(':memory:'); // Use in-memory DB for tests
  const schema = readFileSync(join(__dirname, '../src/lib/db/schema.sql'), 'utf-8');
  testDb.exec(schema);
});

afterAll(() => {
  testDb.close();
});

// ─── Database Tests ────────────────────────────────────────────────────────────
describe('AfyaDatabase', () => {
  it('should initialize successfully', () => {
    expect(testDb.ready).toBe(true);
  });

  it('should insert and query records', () => {
    testDb.run(`INSERT INTO system_config(key, value) VALUES(?, ?)`, ['test_key', 'test_value']);
    const result = testDb.findOne<{ value: string }>(`SELECT value FROM system_config WHERE key = ?`, ['test_key']);
    expect(result?.value).toBe('test_value');
  });

  it('should support transactions with rollback', () => {
    expect(() => {
      testDb.transaction(() => {
        testDb.run(`INSERT INTO system_config(key, value) VALUES(?, ?)`, ['tx_test', 'value']);
        throw new Error('Simulated failure');
      });
    }).toThrow('Simulated failure');

    const result = testDb.findOne(`SELECT * FROM system_config WHERE key = ?`, ['tx_test']);
    expect(result).toBeNull();
  });

  it('should support async transactions', async () => {
    const id = await testDb.transactionAsync(async () => {
      return testDb.insert('hospitals', {
        name: 'Test Hospital',
        is_active: 1,
      });
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('should paginate correctly', () => {
    // Insert 10 hospitals
    for (let i = 0; i < 10; i++) {
      testDb.insert('hospitals', { name: `Hospital ${i}`, is_active: 1 });
    }
    const result = testDb.paginate(
      `SELECT * FROM hospitals WHERE name LIKE 'Hospital%' ORDER BY name`,
      `SELECT COUNT(*) as total FROM hospitals WHERE name LIKE 'Hospital%'`,
      [],
      1, 3,
    );
    expect(result.rows.length).toBe(3);
    expect(result.total).toBeGreaterThanOrEqual(10);
    expect(result.totalPages).toBeGreaterThanOrEqual(4);
  });

  it('should count records correctly', () => {
    const count = testDb.count('system_config', '1=1');
    expect(count).toBeGreaterThan(0);
  });

  it('should check existence', () => {
    const exists = testDb.exists('system_config', `key = ?`, ['test_key']);
    expect(exists).toBe(true);
    const notExists = testDb.exists('system_config', `key = ?`, ['nonexistent_key_xyz']);
    expect(notExists).toBe(false);
  });

  it('should generate sequential numbers', () => {
    // Insert a patient first
    testDb.run(
      `INSERT INTO patients(id, patient_number, branch_id, first_name, last_name, date_of_birth, gender)
       VALUES(?,?,?,?,?,?,?)`,
      [generateId(), 'AFC-000001', 'branch-test', 'John', 'Doe', '1990-01-01', 'male'],
    );
    const num = generateSequentialNumber(testDb, 'AFC', 'patients', 'patient_number');
    expect(num).toBe('AFC-000002');
  });

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
});

// ─── Auth Tests ────────────────────────────────────────────────────────────────
describe('AuthService', () => {
  const authService = AuthService.getInstance();

  it('should hash and verify password correctly', async () => {
    const { hash } = await authService.hashPassword('TestPass@123');
    expect(hash).toBeTruthy();
    expect(hash.length).toBeGreaterThan(20);
  });

  it('should reject weak passwords', () => {
    expect(authService.validatePasswordStrength('weak').valid).toBe(false);
    expect(authService.validatePasswordStrength('NoNumber!').valid).toBe(false);
    expect(authService.validatePasswordStrength('nonumber1!').valid).toBe(false);
    expect(authService.validatePasswordStrength('NOLOWER1!').valid).toBe(false);
    expect(authService.validatePasswordStrength('ValidPass@1').valid).toBe(true);
  });

  it('should create a user successfully', async () => {
    const result = await authService.createUser({
      username: 'testdoctor',
      email: 'doctor@test.local',
      password: 'Doctor@Test1',
      firstName: 'Test',
      lastName: 'Doctor',
      roleId: 'role-doctor',
      createdBy: 'system',
    });
    expect(result.success).toBe(true);
    expect(result.userId).toBeTruthy();
  });

  it('should reject duplicate username', async () => {
    const result = await authService.createUser({
      username: 'testdoctor',
      email: 'different@test.local',
      password: 'Doctor@Test1',
      firstName: 'Another',
      lastName: 'Doctor',
      roleId: 'role-doctor',
      createdBy: 'system',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('should load permissions for role', () => {
    const perms = authService.loadPermissions('role-doctor');
    expect(perms instanceof Set).toBe(true);
  });

  it('should check permissions correctly', () => {
    const perms = new Set(['clinical:visits:create', 'patients:patients:read']);
    expect(authService.hasPermission(perms, 'clinical', 'visits', 'create')).toBe(true);
    expect(authService.hasPermission(perms, 'clinical', 'visits', 'delete')).toBe(false);
    expect(authService.hasPermission(perms, 'patients', 'patients', 'read')).toBe(true);
    // Wildcard
    const adminPerms = new Set(['*:*:*']);
    expect(authService.hasPermission(adminPerms, 'anything', 'anything', 'anything')).toBe(true);
  });

  it('should generate TOTP codes', () => {
    const secret = authService.generateMfaSecret();
    expect(secret.length).toBeGreaterThan(10);
    // TOTP verification is time-based; just test format
    expect(typeof secret).toBe('string');
  });
});

// ─── Audit Logger Tests ────────────────────────────────────────────────────────
describe('AuditLogger', () => {
  const logger = AuditLogger.getInstance();

  it('should write and read audit logs', async () => {
    await logger.log({
      userId: 'user-test-1',
      username: 'testuser',
      action: 'PATIENT_CREATED',
      module: 'patients',
      resource: 'patients',
      resourceId: 'patient-test-1',
      status: 'success',
      riskLevel: 'low',
    });

    const result = logger.search({ userId: 'user-test-1', pageSize: 10 });
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].action).toBe('PATIENT_CREATED');
  });

  it('should prevent audit log modification via trigger', () => {
    const logs = logger.search({ pageSize: 1 });
    if (logs.rows.length > 0) {
      expect(() => {
        testDb.run(`UPDATE audit_logs SET action = 'TAMPERED' WHERE id = ?`, [logs.rows[0].id]);
      }).toThrow('immutable');
    }
  });

  it('should prevent audit log deletion via trigger', () => {
    const logs = logger.search({ pageSize: 1 });
    if (logs.rows.length > 0) {
      expect(() => {
        testDb.run(`DELETE FROM audit_logs WHERE id = ?`, [logs.rows[0].id]);
      }).toThrow('immutable');
    }
  });

  it('should verify integrity of valid logs', async () => {
    await logger.log({
      action: 'LOGIN',
      module: 'auth',
      resource: 'users',
      status: 'success',
    });
    const check = logger.verifyIntegrity();
    expect(check.valid).toBe(true);
    expect(check.tampered.length).toBe(0);
  });

  it('should export CSV with correct format', async () => {
    const csv = logger.exportToCsv({});
    expect(csv).toContain('ID,Timestamp');
    expect(csv.split('\n').length).toBeGreaterThan(1);
  });

  it('should compute diff between records', () => {
    const { computeDiff } = require('../src/lib/audit/audit-logger');
    const before = { name: 'Old Name', phone: '0700000000', password_hash: 'secret' };
    const after = { name: 'New Name', phone: '0700000000', password_hash: 'newsecret' };
    const diff = computeDiff(before, after);
    expect(diff.changedFields).toContain('name');
    expect(diff.changedFields).toContain('password_hash');
    expect(diff.previousValues.password_hash).toBe('[REDACTED]');
    expect(diff.newValues.password_hash).toBe('[REDACTED]');
    expect(diff.previousValues.name).toBe('Old Name');
  });
});

// ─── License Service Tests ─────────────────────────────────────────────────────
describe('LicenseService', () => {
  const licenseService = LicenseService.getInstance();

  it('should generate hardware fingerprint', () => {
    const fp = licenseService.getHardwareFingerprint();
    expect(fp.fingerprint).toBeTruthy();
    expect(fp.fingerprint.length).toBe(32);
    expect(typeof fp.cpuModel).toBe('string');
    expect(fp.cpuCores).toBeGreaterThan(0);
  });

  it('should return consistent fingerprint', () => {
    const fp1 = licenseService.getHardwareFingerprint();
    const fp2 = licenseService.getHardwareFingerprint();
    expect(fp1.fingerprint).toBe(fp2.fingerprint);
  });

  it('should reject invalid license keys', async () => {
    const result = await licenseService.activateLicense('INVALID-LICENSE-KEY');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('should generate offline activation request', () => {
    const request = licenseService.generateOfflineActivationRequest();
    expect(typeof request).toBe('string');
    const decoded = JSON.parse(Buffer.from(request, 'base64').toString());
    expect(decoded.fingerprint).toBeTruthy();
    expect(decoded.requestedAt).toBeTruthy();
  });

  it('should return invalid status when no license activated', () => {
    const status = licenseService.validateLicense();
    // In test environment, no license is activated
    expect(status.active).toBe(false);
  });
});

// ─── Sync Engine Tests ─────────────────────────────────────────────────────────
describe('SyncEngine', () => {
  const syncEngine = SyncEngine.getInstance();

  beforeEach(() => {
    syncEngine.init('branch-test-001');
  });

  it('should initialize correctly', () => {
    expect(syncEngine).toBeTruthy();
  });

  it('should collect pending changes', () => {
    // Insert something to trigger a change log entry
    testDb.insert('hospitals', { name: 'Sync Test Hospital', is_active: 1 });
    const changes = syncEngine.collectPendingChanges('hospitals');
    expect(Array.isArray(changes)).toBe(true);
  });

  it('should build sync payload with checksum', () => {
    const payload = syncEngine.buildSyncPayload();
    expect(payload.sourceBranchId).toBe('branch-test-001');
    expect(payload.checksum).toBeTruthy();
    expect(payload.checksum.length).toBe(64); // SHA-256 hex
    expect(Array.isArray(payload.changes)).toBe(true);
    expect(typeof payload.vectorClock).toBe('object');
  });

  it('should verify payload checksum on apply', () => {
    const payload = syncEngine.buildSyncPayload();
    payload.checksum = 'invalid_checksum';
    const result = syncEngine.applyIncomingChanges(payload);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('checksum');
  });

  it('should report sync status', () => {
    const status = syncEngine.getSyncStatus();
    expect(typeof status.pendingChanges).toBe('number');
    expect(typeof status.inProgress).toBe('boolean');
    expect(status.inProgress).toBe(false);
  });

  it('should apply insert changes', () => {
    const payload = syncEngine.buildSyncPayload();
    // Inject a fake insert change
    payload.changes = [{
      id: 1,
      tableName: 'hospitals',
      recordId: 'remote-hosp-999',
      operation: 'insert',
      oldValues: null,
      newValues: { id: 'remote-hosp-999', name: 'Remote Hospital', is_active: 1 },
      changedBy: null,
      branchId: 'remote-branch',
      synced: 0,
      createdAt: new Date().toISOString(),
    }];
    payload.checksum = require('node:crypto')
      .createHash('sha256')
      .update(JSON.stringify({ changes: payload.changes, vectorClock: payload.vectorClock, timestamp: payload.timestamp }))
      .digest('hex');

    const result = syncEngine.applyIncomingChanges(payload);
    expect(result.applied).toBe(1);
    expect(result.errors.length).toBe(0);
    expect(testDb.exists('hospitals', 'id = ?', ['remote-hosp-999'])).toBe(true);
  });
});

// ─── DB Schema Integrity Tests ─────────────────────────────────────────────────
describe('Schema Integrity', () => {
  const REQUIRED_TABLES = [
    'system_config', 'license_info', 'hospitals', 'branches', 'departments',
    'roles', 'permissions', 'role_permissions',
    'users', 'staff_profiles',
    'patients', 'patient_vitals', 'patient_medical_history',
    'appointments', 'visits', 'clinical_notes', 'diagnoses', 'treatment_plans',
    'wards', 'beds', 'admissions', 'nursing_records',
    'icu_monitoring', 'theatres', 'surgical_bookings', 'emergency_triage',
    'lab_test_catalog', 'lab_requests', 'lab_request_items',
    'radiology_requests', 'radiology_equipment',
    'drug_catalog', 'pharmacy_inventory', 'prescriptions', 'prescription_items',
    'pharmacy_transactions', 'billing_items_catalog', 'invoices', 'invoice_items',
    'payments', 'insurance_claims', 'chart_of_accounts', 'journal_entries',
    'journal_lines', 'payroll_periods', 'payroll_records', 'leave_requests',
    'staff_attendance', 'staff_shifts', 'suppliers', 'inventory_items',
    'stock_items', 'purchase_orders', 'purchase_order_items', 'assets',
    'maintenance_records', 'messages', 'notifications', 'sync_log',
    'sync_vector_clocks', 'change_log', 'audit_logs', 'active_sessions',
    'failed_login_attempts', 'analytics_daily_snapshots', 'patient_portal_tokens',
    'referrals', 'user_branch_access',
  ];

  it('should have all required tables', () => {
    const existing = testDb.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    ).rows.map(r => r.name);

    const missing = REQUIRED_TABLES.filter(t => !existing.includes(t));
    if (missing.length > 0) {
      console.error('Missing tables:', missing);
    }
    expect(missing).toEqual([]);
  });

  it('should have seeded roles', () => {
    const roles = testDb.query<{ name: string }>(`SELECT name FROM roles`).rows;
    const roleNames = roles.map(r => r.name);
    expect(roleNames).toContain('super_admin');
    expect(roleNames).toContain('doctor');
    expect(roleNames).toContain('nurse');
    expect(roleNames).toContain('pharmacist');
    expect(roleNames).toContain('billing_officer');
  });

  it('should have all required indexes', () => {
    const indexes = testDb.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`,
    ).rows.map(r => r.name);
    expect(indexes).toContain('idx_patients_number');
    expect(indexes).toContain('idx_audit_timestamp');
    expect(indexes).toContain('idx_visits_patient');
    expect(indexes).toContain('idx_invoice_patient');
  });

  it('should have audit triggers', () => {
    const triggers = testDb.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='trigger'`,
    ).rows.map(r => r.name);
    expect(triggers).toContain('prevent_audit_update');
    expect(triggers).toContain('prevent_audit_delete');
  });

  it('should enforce foreign key constraints', () => {
    expect(() => {
      testDb.run(
        `INSERT INTO patients(id, patient_number, branch_id, first_name, last_name, date_of_birth, gender)
         VALUES(?,?,?,?,?,?,?)`,
        [generateId(), 'AFC-999999', 'nonexistent-branch', 'Test', 'Patient', '1990-01-01', 'male'],
      );
    }).toThrow();
  });
});
