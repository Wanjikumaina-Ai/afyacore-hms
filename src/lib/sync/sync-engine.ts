import { db } from '../db/database';
import { auditLogger } from '../audit/audit-logger';
import { createHash } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ConflictResolution = 'local_wins' | 'remote_wins' | 'merged';

export interface ChangeRecord {
  id: number;
  tableName: string;
  recordId: string;
  operation: 'insert' | 'update' | 'delete';
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedBy: string | null;
  branchId: string;
  synced: number;
  createdAt: string;
}

export interface SyncPayload {
  sourceBranchId: string;
  sessionId: string;
  timestamp: string;
  changes: ChangeRecord[];
  vectorClock: Record<string, number>;
  checksum: string;
}

export interface SyncResult {
  applied: number;
  conflicts: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// ─── Tables that are syncable across branches ─────────────────────────────────
const SYNCABLE_TABLES = new Set([
  'patients', 'patient_vitals', 'patient_medical_history',
  'visits', 'clinical_notes', 'diagnoses', 'treatment_plans',
  'appointments', 'admissions', 'nursing_records',
  'prescriptions', 'prescription_items',
  'lab_requests', 'lab_request_items',
  'radiology_requests',
  'invoices', 'invoice_items', 'payments',
  'referrals',
]);

// Tables that are branch-local only (do NOT sync)
const LOCAL_ONLY_TABLES = new Set([
  'audit_logs', 'active_sessions', 'failed_login_attempts',
  'change_log', 'sync_log', 'sync_vector_clocks',
  'pharmacy_inventory', 'stock_items', // inventory is branch-local
]);

// Tables with "last writer wins" strategy
const LAST_WRITE_WINS = new Set([
  'patient_vitals', 'nursing_records', 'icu_monitoring',
]);

// ─── SyncEngine ────────────────────────────────────────────────────────────────
export class SyncEngine {
  private static instance: SyncEngine;
  private branchId: string = '';
  private syncInProgress = false;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  static getInstance(): SyncEngine {
    if (!SyncEngine.instance) SyncEngine.instance = new SyncEngine();
    return SyncEngine.instance;
  }

  init(branchId: string): void {
    this.branchId = branchId;
    console.log(`[Sync] Engine initialized for branch: ${branchId}`);
  }

  // ─── Collect local changes since last sync ────────────────────────────────
  collectPendingChanges(tableName?: string): ChangeRecord[] {
    let where = 'WHERE synced = 0';
    const params: (string | number)[] = [];
    if (tableName) {
      where += ' AND table_name = ?';
      params.push(tableName);
    }
    return db.query<ChangeRecord>(
      `SELECT * FROM change_log ${where} ORDER BY id ASC LIMIT 5000`,
      params,
    ).rows;
  }

  // ─── Build sync payload to send to remote ────────────────────────────────
  buildSyncPayload(): SyncPayload {
    const changes = this.collectPendingChanges()
      .filter((c) => SYNCABLE_TABLES.has(c.tableName));

    const vectorClock = this.getVectorClock();
    const sessionId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    const checksum = createHash('sha256')
      .update(JSON.stringify({ changes, vectorClock, timestamp }))
      .digest('hex');

    return {
      sourceBranchId: this.branchId,
      sessionId,
      timestamp,
      changes,
      vectorClock,
      checksum,
    };
  }

  // ─── Apply incoming changes from remote branch ────────────────────────────
  applyIncomingChanges(payload: SyncPayload): SyncResult {
    if (this.syncInProgress) {
      return { applied: 0, conflicts: 0, failed: 0, skipped: 1, errors: ['Sync already in progress'] };
    }

    this.syncInProgress = true;
    const result: SyncResult = { applied: 0, conflicts: 0, failed: 0, skipped: 0, errors: [] };

    try {
      // 1. Verify checksum
      const expectedChecksum = createHash('sha256')
        .update(JSON.stringify({
          changes: payload.changes,
          vectorClock: payload.vectorClock,
          timestamp: payload.timestamp,
        }))
        .digest('hex');

      if (expectedChecksum !== payload.checksum) {
        throw new Error('Payload checksum mismatch — data may be corrupted in transit');
      }

      db.transaction(() => {
        for (const change of payload.changes) {
          if (!SYNCABLE_TABLES.has(change.tableName)) {
            result.skipped++;
            continue;
          }

          try {
            const applied = this.applyChange(change, payload.sourceBranchId, result);
            if (applied) result.applied++;

            // Log to sync_log
            db.run(
              `INSERT INTO sync_log (id, branch_id, sync_session_id, direction, table_name,
               record_id, operation, payload, status, synced_at)
               VALUES (lower(hex(randomblob(16))),?,?,?,?,?,?,?,?,datetime('now'))`,
              [
                this.branchId, payload.sessionId, 'pull',
                change.tableName, change.recordId, change.operation,
                JSON.stringify(change.newValues), applied ? 'applied' : 'skipped',
              ],
            );
          } catch (err) {
            result.failed++;
            result.errors.push(`${change.tableName}:${change.recordId} - ${(err as Error).message}`);
            console.error('[Sync] Failed to apply change:', err);
          }
        }

        // Update vector clocks
        this.mergeVectorClock(payload.sourceBranchId, payload.vectorClock);
      });

      auditLogger.logSync({
        action: 'SYNC_COMPLETED', module: 'sync', resource: 'system',
        branchId: this.branchId, status: 'success', riskLevel: 'low',
        newValues: {
          sourceBranch: payload.sourceBranchId,
          applied: result.applied,
          conflicts: result.conflicts,
          failed: result.failed,
        },
      });

    } catch (err) {
      result.errors.push((err as Error).message);
      auditLogger.logSync({
        action: 'SYNC_COMPLETED', module: 'sync', resource: 'system',
        branchId: this.branchId, status: 'failed', riskLevel: 'high',
        failureReason: (err as Error).message,
      });
    } finally {
      this.syncInProgress = false;
    }

    return result;
  }

  // ─── Apply a single change ────────────────────────────────────────────────
  private applyChange(
    change: ChangeRecord,
    sourceBranchId: string,
    result: SyncResult,
  ): boolean {
    const { tableName, recordId, operation, newValues, oldValues } = change;

    if (operation === 'delete') {
      // Soft-delete strategy: never hard-delete synced records
      const hasIsActive = db.exists(tableName, `id = '${recordId}' AND typeof(is_active) = 'integer'`);
      if (hasIsActive) {
        db.run(`UPDATE ${tableName} SET is_active = 0 WHERE id = ?`, [recordId]);
      }
      return true;
    }

    if (operation === 'insert') {
      const exists = db.exists(tableName, 'id = ?', [recordId]);
      if (exists) {
        // Record already exists — check for conflict
        return this.resolveConflict(tableName, recordId, newValues!, sourceBranchId, result);
      }
      // Safe to insert
      if (newValues) {
        const keys = Object.keys(newValues);
        const placeholders = keys.map(() => '?').join(', ');
        const values = Object.values(newValues).map((v) =>
          v === undefined ? null : (v as string | number | null),
        );
        db.run(
          `INSERT OR IGNORE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`,
          values,
        );
      }
      return true;
    }

    if (operation === 'update') {
      const exists = db.exists(tableName, 'id = ?', [recordId]);
      if (!exists) {
        // Record doesn't exist locally — treat as insert
        if (newValues) {
          const keys = Object.keys(newValues);
          const placeholders = keys.map(() => '?').join(', ');
          const values = Object.values(newValues).map((v) =>
            v === undefined ? null : (v as string | number | null),
          );
          db.run(
            `INSERT OR IGNORE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`,
            values,
          );
        }
        return true;
      }

      return this.resolveConflict(tableName, recordId, newValues!, sourceBranchId, result);
    }

    return false;
  }

  // ─── Conflict resolution ──────────────────────────────────────────────────
  private resolveConflict(
    tableName: string,
    recordId: string,
    remoteValues: Record<string, unknown>,
    sourceBranchId: string,
    result: SyncResult,
  ): boolean {
    const localRecord = db.findOne<Record<string, unknown>>(
      `SELECT * FROM ${tableName} WHERE id = ?`,
      [recordId],
    );

    if (!localRecord) return false;

    // Strategy 1: Last-write-wins tables
    if (LAST_WRITE_WINS.has(tableName)) {
      const localTime = String(localRecord.updated_at ?? localRecord.created_at ?? '');
      const remoteTime = String(remoteValues.updated_at ?? remoteValues.created_at ?? '');
      if (remoteTime > localTime) {
        this.applyUpdate(tableName, recordId, remoteValues);
        return true;
      }
      result.skipped++;
      return false;
    }

    // Strategy 2: Field-level merge for patient records
    if (tableName === 'patients' || tableName === 'staff_profiles') {
      const merged = this.fieldMerge(localRecord, remoteValues);
      this.applyUpdate(tableName, recordId, merged);
      result.conflicts++;
      this.logConflict(tableName, recordId, localRecord, remoteValues, 'merged', sourceBranchId);
      return true;
    }

    // Strategy 3: Remote wins for clinical data (doctors' data authoritative)
    const localTime = String(localRecord.updated_at ?? localRecord.created_at ?? '');
    const remoteTime = String(remoteValues.updated_at ?? remoteValues.created_at ?? '');

    if (remoteTime > localTime) {
      this.applyUpdate(tableName, recordId, remoteValues);
      result.conflicts++;
      this.logConflict(tableName, recordId, localRecord, remoteValues, 'remote_wins', sourceBranchId);
      return true;
    }

    result.skipped++;
    return false;
  }

  private applyUpdate(
    tableName: string,
    recordId: string,
    values: Record<string, unknown>,
  ): void {
    const safeValues = Object.fromEntries(
      Object.entries(values).filter(([k]) => k !== 'id'),
    );
    const setClause = Object.keys(safeValues).map((k) => `${k} = ?`).join(', ');
    const params = [
      ...Object.values(safeValues).map((v) => (v === undefined ? null : (v as string | number | null))),
      recordId,
    ];
    db.run(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, params);
  }

  // Field-level merge: remote fills in blank local fields, local keeps non-null values
  private fieldMerge(
    local: Record<string, unknown>,
    remote: Record<string, unknown>,
  ): Record<string, unknown> {
    const merged = { ...local };
    for (const [key, remoteVal] of Object.entries(remote)) {
      if (key === 'id') continue;
      const localVal = local[key];
      // Remote wins if local is null/empty, otherwise keep local
      if (localVal === null || localVal === undefined || localVal === '') {
        merged[key] = remoteVal;
      }
    }
    return merged;
  }

  private logConflict(
    tableName: string,
    recordId: string,
    local: Record<string, unknown>,
    remote: Record<string, unknown>,
    resolution: ConflictResolution,
    sourceBranchId: string,
  ): void {
    db.run(
      `INSERT INTO sync_log (id, branch_id, sync_session_id, direction, table_name,
       record_id, operation, payload, conflict_detected, conflict_resolution, status)
       VALUES (lower(hex(randomblob(16))),?,?,?,?,?,?,?,1,?,?)`,
      [
        this.branchId, `conflict-${Date.now()}`, 'pull',
        tableName, recordId, 'update',
        JSON.stringify({ local, remote, sourceBranch: sourceBranchId }),
        resolution, 'applied',
      ],
    );

    auditLogger.logSync({
      action: 'SYNC_CONFLICT', module: 'sync', resource: tableName,
      resourceId: recordId, branchId: this.branchId,
      status: 'success', riskLevel: 'medium',
      newValues: { resolution, sourceBranchId },
    });
  }

  // ─── Vector clock management ──────────────────────────────────────────────
  getVectorClock(): Record<string, number> {
    const rows = db.query<{ branch_id: string; last_seq: number }>(
      `SELECT branch_id, last_seq FROM sync_vector_clocks WHERE branch_id = ?`,
      [this.branchId],
    ).rows;

    return Object.fromEntries(rows.map((r) => [r.branch_id, r.last_seq]));
  }

  private mergeVectorClock(
    sourceBranchId: string,
    remoteClock: Record<string, number>,
  ): void {
    for (const [branchId, seq] of Object.entries(remoteClock)) {
      db.run(
        `INSERT INTO sync_vector_clocks (branch_id, table_name, last_seq, last_sync)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(branch_id, table_name) DO UPDATE
         SET last_seq = MAX(last_seq, excluded.last_seq), last_sync = datetime('now')`,
        [branchId, sourceBranchId, seq],
      );
    }
  }

  // ─── Mark changes as synced ───────────────────────────────────────────────
  markChangesSynced(changeIds: number[]): void {
    if (changeIds.length === 0) return;
    const placeholders = changeIds.map(() => '?').join(', ');
    db.run(`UPDATE change_log SET synced = 1 WHERE id IN (${placeholders})`, changeIds);
  }

  // ─── Auto-sync scheduling ─────────────────────────────────────────────────
  startAutoSync(
    intervalMs = 60_000,
    syncFn: () => Promise<void>,
  ): void {
    this.syncInterval = setInterval(async () => {
      if (!this.syncInProgress) {
        try { await syncFn(); } catch (err) {
          console.error('[Sync] Auto-sync failed:', err);
        }
      }
    }, intervalMs);
    console.log(`[Sync] Auto-sync started every ${intervalMs / 1000}s`);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // ─── Sync status ──────────────────────────────────────────────────────────
  getSyncStatus(): {
    pendingChanges: number;
    lastSync: string | null;
    inProgress: boolean;
    conflicts: number;
  } {
    const pending = db.count('change_log', 'synced = 0');
    const lastSync = db.findOne<{ last_sync: string }>(
      `SELECT MAX(last_sync) as last_sync FROM sync_vector_clocks`,
    )?.last_sync ?? null;
    const conflicts = db.count('sync_log', 'conflict_detected = 1');

    return { pendingChanges: pending, lastSync, inProgress: this.syncInProgress, conflicts };
  }

  // ─── Data export for branch migration ────────────────────────────────────
  exportBranchData(branchId: string): Record<string, unknown[]> {
    const exported: Record<string, unknown[]> = {};
    for (const table of SYNCABLE_TABLES) {
      const rows = db.query(`SELECT * FROM ${table} WHERE branch_id = ?`, [branchId]).rows;
      if (rows.length > 0) exported[table] = rows;
    }
    return exported;
  }
}

export const syncEngine = SyncEngine.getInstance();
