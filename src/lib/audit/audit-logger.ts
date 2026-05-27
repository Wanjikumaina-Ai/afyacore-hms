import { createHash } from 'node:crypto';
import { db } from '../db/database';

// ─── Types ────────────────────────────────────────────────────────────────────
export type AuditAction =
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'LOGIN_BLOCKED' | 'MFA_FAILED'
  | 'USER_CREATED' | 'USER_UPDATED' | 'USER_LOCKED' | 'USER_UNLOCKED' | 'USER_DELETED'
  | 'PASSWORD_CHANGED' | 'ROLE_ASSIGNED' | 'PERMISSION_CHANGED' | 'SESSION_REVOKED'
  | 'PATIENT_CREATED' | 'PATIENT_UPDATED' | 'PATIENT_VIEWED' | 'PATIENT_DELETED'
  | 'VISIT_CREATED' | 'VISIT_UPDATED' | 'VISIT_CLOSED'
  | 'PRESCRIPTION_CREATED' | 'PRESCRIPTION_UPDATED' | 'PRESCRIPTION_DISPENSED' | 'PRESCRIPTION_CANCELLED'
  | 'LAB_REQUEST_CREATED' | 'LAB_RESULT_ENTERED' | 'LAB_RESULT_VERIFIED'
  | 'RADIOLOGY_REQUEST_CREATED' | 'RADIOLOGY_REPORTED'
  | 'INVOICE_CREATED' | 'INVOICE_VOIDED' | 'PAYMENT_RECEIVED' | 'PAYMENT_REVERSED'
  | 'ADMISSION_CREATED' | 'PATIENT_DISCHARGED' | 'BED_ASSIGNED'
  | 'SURGERY_BOOKED' | 'SURGERY_COMPLETED'
  | 'DRUG_DISPENSED' | 'DRUG_ADJUSTED' | 'DRUG_EXPIRED_DISPOSED'
  | 'STOCK_ADJUSTED' | 'PO_CREATED' | 'PO_APPROVED' | 'PO_RECEIVED'
  | 'PAYROLL_CREATED' | 'PAYROLL_APPROVED' | 'PAYROLL_PAID'
  | 'LEAVE_REQUESTED' | 'LEAVE_APPROVED' | 'LEAVE_REJECTED'
  | 'BACKUP_CREATED' | 'RESTORE_PERFORMED' | 'DB_EXPORT'
  | 'CONFIG_CHANGED' | 'LICENSE_ACTIVATED' | 'LICENSE_INVALID'
  | 'RECORD_EXPORTED' | 'RECORD_PRINTED' | 'REPORT_GENERATED'
  | 'SYNC_STARTED' | 'SYNC_COMPLETED' | 'SYNC_CONFLICT'
  | 'REFERRAL_CREATED' | 'REFERRAL_ACCEPTED' | 'REFERRAL_REJECTED'
  | 'DATA_ACCESS' | 'BULK_OPERATION' | 'SYSTEM_START' | 'SYSTEM_SHUTDOWN';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type AuditStatus = 'success' | 'failed' | 'blocked';

export interface AuditEntry {
  userId?: string;
  username?: string;
  userRole?: string;
  branchId?: string;
  branchName?: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  sessionId?: string;
  action: AuditAction | string;
  module: string;
  resource: string;
  resourceId?: string;
  previousValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  changedFields?: string[];
  status: AuditStatus;
  failureReason?: string;
  riskLevel?: RiskLevel;
}

export interface AuditSearchParams {
  userId?: string;
  module?: string;
  action?: string;
  resourceId?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
  riskLevel?: RiskLevel;
  status?: AuditStatus;
  page?: number;
  pageSize?: number;
}

// ─── AuditLogger ──────────────────────────────────────────────────────────────
class AuditLogger {
  private static instance: AuditLogger;
  private queue: AuditEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) AuditLogger.instance = new AuditLogger();
    return AuditLogger.instance;
  }

  constructor() {
    // Batch-flush queue every 2 seconds for performance
    this.flushTimer = setInterval(() => this.flushQueue(), 2_000);
  }

  // ─── Primary log method ──────────────────────────────────────────────────
  async log(entry: AuditEntry): Promise<void> {
    // High-risk events written immediately (synchronously)
    if (entry.riskLevel === 'critical' || entry.riskLevel === 'high') {
      this.write(entry);
    } else {
      this.queue.push(entry);
    }
  }

  // Synchronous version for use in middleware
  logSync(entry: AuditEntry): void {
    this.write(entry);
  }

  private write(entry: AuditEntry): void {
    try {
      const timestamp = new Date().toISOString();
      const previousJson = entry.previousValues
        ? JSON.stringify(entry.previousValues)
        : null;
      const newJson = entry.newValues
        ? JSON.stringify(entry.newValues)
        : null;
      const changedJson = entry.changedFields
        ? JSON.stringify(entry.changedFields)
        : null;

      // Compute tamper-detection checksum over all fields
      const checksumPayload = [
        timestamp,
        entry.userId ?? '',
        entry.username ?? '',
        entry.action,
        entry.module,
        entry.resource,
        entry.resourceId ?? '',
        entry.status,
        previousJson ?? '',
        newJson ?? '',
      ].join('|');

      const checksum = createHash('sha256')
        .update(checksumPayload)
        .digest('hex');

      db.run(
        `INSERT INTO audit_logs (
          timestamp, user_id, username, user_role, branch_id, branch_name,
          ip_address, device_fingerprint, session_id,
          action, module, resource, resource_id,
          previous_values, new_values, changed_fields,
          status, failure_reason, risk_level, checksum
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          timestamp,
          entry.userId ?? null,
          entry.username ?? null,
          entry.userRole ?? null,
          entry.branchId ?? null,
          entry.branchName ?? null,
          entry.ipAddress ?? null,
          entry.deviceFingerprint ?? null,
          entry.sessionId ?? null,
          entry.action,
          entry.module,
          entry.resource,
          entry.resourceId ?? null,
          previousJson,
          newJson,
          changedJson,
          entry.status,
          entry.failureReason ?? null,
          entry.riskLevel ?? 'low',
          checksum,
        ],
      );
    } catch (err) {
      // Audit logger MUST NOT crash the app — log to stderr only
      console.error('[AUDIT CRITICAL] Failed to write audit log:', err);
    }
  }

  private flushQueue(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      db.transaction(() => {
        for (const entry of batch) {
          this.write(entry);
        }
      });
    } catch (err) {
      console.error('[AUDIT] Batch flush failed:', err);
    }
  }

  // ─── Search ──────────────────────────────────────────────────────────────
  search(params: AuditSearchParams): {
    rows: AuditLogRow[];
    total: number;
    page: number;
    totalPages: number;
  } {
    const conditions: string[] = [];
    const values: (string | number | null)[] = [];

    if (params.userId) { conditions.push('user_id = ?'); values.push(params.userId); }
    if (params.module) { conditions.push('module = ?'); values.push(params.module); }
    if (params.action) { conditions.push('action = ?'); values.push(params.action); }
    if (params.resourceId) { conditions.push('resource_id = ?'); values.push(params.resourceId); }
    if (params.branchId) { conditions.push('branch_id = ?'); values.push(params.branchId); }
    if (params.startDate) { conditions.push('timestamp >= ?'); values.push(params.startDate); }
    if (params.endDate) { conditions.push('timestamp <= ?'); values.push(params.endDate); }
    if (params.riskLevel) { conditions.push('risk_level = ?'); values.push(params.riskLevel); }
    if (params.status) { conditions.push('status = ?'); values.push(params.status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const countResult = db.query<{ total: number }>(
      `SELECT COUNT(*) as total FROM audit_logs ${where}`,
      values,
    );
    const total = countResult.rows[0]?.total ?? 0;

    const rows = db.query<AuditLogRow>(
      `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    ).rows;

    return { rows, total, page, totalPages: Math.ceil(total / pageSize) };
  }

  // ─── Integrity verification ──────────────────────────────────────────────
  verifyIntegrity(
    startId?: number,
    endId?: number,
  ): { valid: boolean; tampered: number[]; checked: number } {
    const where =
      startId && endId
        ? `WHERE id BETWEEN ${startId} AND ${endId}`
        : '';
    const logs = db.query<AuditLogRow>(
      `SELECT * FROM audit_logs ${where} ORDER BY id ASC`,
    ).rows;

    const tampered: number[] = [];

    for (const log of logs) {
      const payload = [
        log.timestamp,
        log.user_id ?? '',
        log.username ?? '',
        log.action,
        log.module,
        log.resource,
        log.resource_id ?? '',
        log.status,
        log.previous_values ?? '',
        log.new_values ?? '',
      ].join('|');

      const expected = createHash('sha256').update(payload).digest('hex');
      if (expected !== log.checksum) {
        tampered.push(log.id);
      }
    }

    return { valid: tampered.length === 0, tampered, checked: logs.length };
  }

  // ─── Export ──────────────────────────────────────────────────────────────
  exportToCsv(params: AuditSearchParams): string {
    const { rows } = this.search({ ...params, pageSize: 100_000 });
    const headers = [
      'ID', 'Timestamp', 'User', 'Username', 'Role', 'Branch',
      'IP Address', 'Action', 'Module', 'Resource', 'Resource ID',
      'Status', 'Risk Level', 'Failure Reason', 'Previous Values', 'New Values',
    ];
    const csvRows = rows.map((r) =>
      [
        r.id, r.timestamp, r.user_id, r.username, r.user_role, r.branch_name,
        r.ip_address, r.action, r.module, r.resource, r.resource_id,
        r.status, r.risk_level, r.failure_reason,
        r.previous_values, r.new_values,
      ]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(','),
    );
    return [headers.join(','), ...csvRows].join('\n');
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushQueue();
  }
}

export interface AuditLogRow {
  id: number;
  event_id: string;
  timestamp: string;
  user_id: string | null;
  username: string | null;
  user_role: string | null;
  branch_id: string | null;
  branch_name: string | null;
  ip_address: string | null;
  device_fingerprint: string | null;
  session_id: string | null;
  action: string;
  module: string;
  resource: string;
  resource_id: string | null;
  previous_values: string | null;
  new_values: string | null;
  changed_fields: string | null;
  status: string;
  failure_reason: string | null;
  risk_level: string;
  checksum: string;
}

export const auditLogger = AuditLogger.getInstance();

// ─── Audit Middleware Helper ──────────────────────────────────────────────────
// Wraps a service call and auto-logs before/after
export async function withAudit<T>(
  entry: Omit<AuditEntry, 'status'>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    auditLogger.log({ ...entry, status: 'success' });
    return result;
  } catch (err) {
    auditLogger.log({
      ...entry,
      status: 'failed',
      failureReason: err instanceof Error ? err.message : String(err),
      riskLevel: 'medium',
    });
    throw err;
  }
}

// Compute diff between two records for audit trail
export function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { changedFields: string[]; previousValues: Record<string, unknown>; newValues: Record<string, unknown> } {
  const changedFields: string[] = [];
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  const SENSITIVE_FIELDS = new Set(['password_hash', 'salt', 'mfa_secret', 'session_token']);

  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      changedFields.push(key);
      if (!SENSITIVE_FIELDS.has(key)) {
        previousValues[key] = before[key];
        newValues[key] = after[key];
      } else {
        previousValues[key] = '[REDACTED]';
        newValues[key] = '[REDACTED]';
      }
    }
  }

  return { changedFields, previousValues, newValues };
}
