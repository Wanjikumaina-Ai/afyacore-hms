import {
  auditLogger
} from "../../chunk-FXZ3HZPC.js";
import {
  db
} from "../../chunk-6WJBJ4G3.js";

// src/lib/sync/sync-engine.ts
import { createHash } from "node:crypto";
var SYNCABLE_TABLES = /* @__PURE__ */ new Set([
  "patients",
  "patient_vitals",
  "patient_medical_history",
  "visits",
  "clinical_notes",
  "diagnoses",
  "treatment_plans",
  "appointments",
  "admissions",
  "nursing_records",
  "prescriptions",
  "prescription_items",
  "lab_requests",
  "lab_request_items",
  "radiology_requests",
  "invoices",
  "invoice_items",
  "payments",
  "referrals"
]);
var LAST_WRITE_WINS = /* @__PURE__ */ new Set([
  "patient_vitals",
  "nursing_records",
  "icu_monitoring"
]);
var SyncEngine = class _SyncEngine {
  static instance;
  branchId = "";
  syncInProgress = false;
  syncInterval = null;
  static getInstance() {
    if (!_SyncEngine.instance) _SyncEngine.instance = new _SyncEngine();
    return _SyncEngine.instance;
  }
  init(branchId) {
    this.branchId = branchId;
    console.log(`[Sync] Engine initialized for branch: ${branchId}`);
  }
  // ─── Collect local changes since last sync ────────────────────────────────
  collectPendingChanges(tableName) {
    let where = "WHERE synced = 0";
    const params = [];
    if (tableName) {
      where += " AND table_name = ?";
      params.push(tableName);
    }
    return db.query(
      `SELECT * FROM change_log ${where} ORDER BY id ASC LIMIT 5000`,
      params
    ).rows;
  }
  // ─── Build sync payload to send to remote ────────────────────────────────
  buildSyncPayload() {
    const changes = this.collectPendingChanges().filter((c) => SYNCABLE_TABLES.has(c.tableName));
    const vectorClock = this.getVectorClock();
    const sessionId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const checksum = createHash("sha256").update(JSON.stringify({ changes, vectorClock, timestamp })).digest("hex");
    return {
      sourceBranchId: this.branchId,
      sessionId,
      timestamp,
      changes,
      vectorClock,
      checksum
    };
  }
  // ─── Apply incoming changes from remote branch ────────────────────────────
  applyIncomingChanges(payload) {
    if (this.syncInProgress) {
      return { applied: 0, conflicts: 0, failed: 0, skipped: 1, errors: ["Sync already in progress"] };
    }
    this.syncInProgress = true;
    const result = { applied: 0, conflicts: 0, failed: 0, skipped: 0, errors: [] };
    try {
      const expectedChecksum = createHash("sha256").update(JSON.stringify({
        changes: payload.changes,
        vectorClock: payload.vectorClock,
        timestamp: payload.timestamp
      })).digest("hex");
      if (expectedChecksum !== payload.checksum) {
        throw new Error("Payload checksum mismatch \u2014 data may be corrupted in transit");
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
            db.run(
              `INSERT INTO sync_log (id, branch_id, sync_session_id, direction, table_name,
               record_id, operation, payload, status, synced_at)
               VALUES (lower(hex(randomblob(16))),?,?,?,?,?,?,?,?,datetime('now'))`,
              [
                this.branchId,
                payload.sessionId,
                "pull",
                change.tableName,
                change.recordId,
                change.operation,
                JSON.stringify(change.newValues),
                applied ? "applied" : "skipped"
              ]
            );
          } catch (err) {
            result.failed++;
            result.errors.push(`${change.tableName}:${change.recordId} - ${err.message}`);
            console.error("[Sync] Failed to apply change:", err);
          }
        }
        this.mergeVectorClock(payload.sourceBranchId, payload.vectorClock);
      });
      auditLogger.logSync({
        action: "SYNC_COMPLETED",
        module: "sync",
        resource: "system",
        branchId: this.branchId,
        status: "success",
        riskLevel: "low",
        newValues: {
          sourceBranch: payload.sourceBranchId,
          applied: result.applied,
          conflicts: result.conflicts,
          failed: result.failed
        }
      });
    } catch (err) {
      result.errors.push(err.message);
      auditLogger.logSync({
        action: "SYNC_COMPLETED",
        module: "sync",
        resource: "system",
        branchId: this.branchId,
        status: "failed",
        riskLevel: "high",
        failureReason: err.message
      });
    } finally {
      this.syncInProgress = false;
    }
    return result;
  }
  // ─── Apply a single change ────────────────────────────────────────────────
  applyChange(change, sourceBranchId, result) {
    const { tableName, recordId, operation, newValues, oldValues } = change;
    if (operation === "delete") {
      const hasIsActive = db.exists(tableName, `id = '${recordId}' AND typeof(is_active) = 'integer'`);
      if (hasIsActive) {
        db.run(`UPDATE ${tableName} SET is_active = 0 WHERE id = ?`, [recordId]);
      }
      return true;
    }
    if (operation === "insert") {
      const exists = db.exists(tableName, "id = ?", [recordId]);
      if (exists) {
        return this.resolveConflict(tableName, recordId, newValues, sourceBranchId, result);
      }
      if (newValues) {
        const keys = Object.keys(newValues);
        const placeholders = keys.map(() => "?").join(", ");
        const values = Object.values(newValues).map(
          (v) => v === void 0 ? null : v
        );
        db.run(
          `INSERT OR IGNORE INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders})`,
          values
        );
      }
      return true;
    }
    if (operation === "update") {
      const exists = db.exists(tableName, "id = ?", [recordId]);
      if (!exists) {
        if (newValues) {
          const keys = Object.keys(newValues);
          const placeholders = keys.map(() => "?").join(", ");
          const values = Object.values(newValues).map(
            (v) => v === void 0 ? null : v
          );
          db.run(
            `INSERT OR IGNORE INTO ${tableName} (${keys.join(", ")}) VALUES (${placeholders})`,
            values
          );
        }
        return true;
      }
      return this.resolveConflict(tableName, recordId, newValues, sourceBranchId, result);
    }
    return false;
  }
  // ─── Conflict resolution ──────────────────────────────────────────────────
  resolveConflict(tableName, recordId, remoteValues, sourceBranchId, result) {
    const localRecord = db.findOne(
      `SELECT * FROM ${tableName} WHERE id = ?`,
      [recordId]
    );
    if (!localRecord) return false;
    if (LAST_WRITE_WINS.has(tableName)) {
      const localTime2 = String(localRecord.updated_at ?? localRecord.created_at ?? "");
      const remoteTime2 = String(remoteValues.updated_at ?? remoteValues.created_at ?? "");
      if (remoteTime2 > localTime2) {
        this.applyUpdate(tableName, recordId, remoteValues);
        return true;
      }
      result.skipped++;
      return false;
    }
    if (tableName === "patients" || tableName === "staff_profiles") {
      const merged = this.fieldMerge(localRecord, remoteValues);
      this.applyUpdate(tableName, recordId, merged);
      result.conflicts++;
      this.logConflict(tableName, recordId, localRecord, remoteValues, "merged", sourceBranchId);
      return true;
    }
    const localTime = String(localRecord.updated_at ?? localRecord.created_at ?? "");
    const remoteTime = String(remoteValues.updated_at ?? remoteValues.created_at ?? "");
    if (remoteTime > localTime) {
      this.applyUpdate(tableName, recordId, remoteValues);
      result.conflicts++;
      this.logConflict(tableName, recordId, localRecord, remoteValues, "remote_wins", sourceBranchId);
      return true;
    }
    result.skipped++;
    return false;
  }
  applyUpdate(tableName, recordId, values) {
    const safeValues = Object.fromEntries(
      Object.entries(values).filter(([k]) => k !== "id")
    );
    const setClause = Object.keys(safeValues).map((k) => `${k} = ?`).join(", ");
    const params = [
      ...Object.values(safeValues).map((v) => v === void 0 ? null : v),
      recordId
    ];
    db.run(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, params);
  }
  // Field-level merge: remote fills in blank local fields, local keeps non-null values
  fieldMerge(local, remote) {
    const merged = { ...local };
    for (const [key, remoteVal] of Object.entries(remote)) {
      if (key === "id") continue;
      const localVal = local[key];
      if (localVal === null || localVal === void 0 || localVal === "") {
        merged[key] = remoteVal;
      }
    }
    return merged;
  }
  logConflict(tableName, recordId, local, remote, resolution, sourceBranchId) {
    db.run(
      `INSERT INTO sync_log (id, branch_id, sync_session_id, direction, table_name,
       record_id, operation, payload, conflict_detected, conflict_resolution, status)
       VALUES (lower(hex(randomblob(16))),?,?,?,?,?,?,?,1,?,?)`,
      [
        this.branchId,
        `conflict-${Date.now()}`,
        "pull",
        tableName,
        recordId,
        "update",
        JSON.stringify({ local, remote, sourceBranch: sourceBranchId }),
        resolution,
        "applied"
      ]
    );
    auditLogger.logSync({
      action: "SYNC_CONFLICT",
      module: "sync",
      resource: tableName,
      resourceId: recordId,
      branchId: this.branchId,
      status: "success",
      riskLevel: "medium",
      newValues: { resolution, sourceBranchId }
    });
  }
  // ─── Vector clock management ──────────────────────────────────────────────
  getVectorClock() {
    const rows = db.query(
      `SELECT branch_id, last_seq FROM sync_vector_clocks WHERE branch_id = ?`,
      [this.branchId]
    ).rows;
    return Object.fromEntries(rows.map((r) => [r.branch_id, r.last_seq]));
  }
  mergeVectorClock(sourceBranchId, remoteClock) {
    for (const [branchId, seq] of Object.entries(remoteClock)) {
      db.run(
        `INSERT INTO sync_vector_clocks (branch_id, table_name, last_seq, last_sync)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(branch_id, table_name) DO UPDATE
         SET last_seq = MAX(last_seq, excluded.last_seq), last_sync = datetime('now')`,
        [branchId, sourceBranchId, seq]
      );
    }
  }
  // ─── Mark changes as synced ───────────────────────────────────────────────
  markChangesSynced(changeIds) {
    if (changeIds.length === 0) return;
    const placeholders = changeIds.map(() => "?").join(", ");
    db.run(`UPDATE change_log SET synced = 1 WHERE id IN (${placeholders})`, changeIds);
  }
  // ─── Auto-sync scheduling ─────────────────────────────────────────────────
  startAutoSync(intervalMs = 6e4, syncFn) {
    this.syncInterval = setInterval(async () => {
      if (!this.syncInProgress) {
        try {
          await syncFn();
        } catch (err) {
          console.error("[Sync] Auto-sync failed:", err);
        }
      }
    }, intervalMs);
    console.log(`[Sync] Auto-sync started every ${intervalMs / 1e3}s`);
  }
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
  // ─── Sync status ──────────────────────────────────────────────────────────
  getSyncStatus() {
    const pending = db.count("change_log", "synced = 0");
    const lastSync = db.findOne(
      `SELECT MAX(last_sync) as last_sync FROM sync_vector_clocks`
    )?.last_sync ?? null;
    const conflicts = db.count("sync_log", "conflict_detected = 1");
    return { pendingChanges: pending, lastSync, inProgress: this.syncInProgress, conflicts };
  }
  // ─── Data export for branch migration ────────────────────────────────────
  exportBranchData(branchId) {
    const exported = {};
    for (const table of SYNCABLE_TABLES) {
      const rows = db.query(`SELECT * FROM ${table} WHERE branch_id = ?`, [branchId]).rows;
      if (rows.length > 0) exported[table] = rows;
    }
    return exported;
  }
};
var syncEngine = SyncEngine.getInstance();
export {
  SyncEngine,
  syncEngine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vc3JjL2xpYi9zeW5jL3N5bmMtZW5naW5lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBkYiB9IGZyb20gJy4uL2RiL2RhdGFiYXNlJztcbmltcG9ydCB7IGF1ZGl0TG9nZ2VyIH0gZnJvbSAnLi4vYXVkaXQvYXVkaXQtbG9nZ2VyJztcbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdub2RlOmNyeXB0byc7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMCBUeXBlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCB0eXBlIENvbmZsaWN0UmVzb2x1dGlvbiA9ICdsb2NhbF93aW5zJyB8ICdyZW1vdGVfd2lucycgfCAnbWVyZ2VkJztcblxuZXhwb3J0IGludGVyZmFjZSBDaGFuZ2VSZWNvcmQge1xuICBpZDogbnVtYmVyO1xuICB0YWJsZU5hbWU6IHN0cmluZztcbiAgcmVjb3JkSWQ6IHN0cmluZztcbiAgb3BlcmF0aW9uOiAnaW5zZXJ0JyB8ICd1cGRhdGUnIHwgJ2RlbGV0ZSc7XG4gIG9sZFZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCBudWxsO1xuICBuZXdWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgbnVsbDtcbiAgY2hhbmdlZEJ5OiBzdHJpbmcgfCBudWxsO1xuICBicmFuY2hJZDogc3RyaW5nO1xuICBzeW5jZWQ6IG51bWJlcjtcbiAgY3JlYXRlZEF0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3luY1BheWxvYWQge1xuICBzb3VyY2VCcmFuY2hJZDogc3RyaW5nO1xuICBzZXNzaW9uSWQ6IHN0cmluZztcbiAgdGltZXN0YW1wOiBzdHJpbmc7XG4gIGNoYW5nZXM6IENoYW5nZVJlY29yZFtdO1xuICB2ZWN0b3JDbG9jazogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgY2hlY2tzdW06IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTeW5jUmVzdWx0IHtcbiAgYXBwbGllZDogbnVtYmVyO1xuICBjb25mbGljdHM6IG51bWJlcjtcbiAgZmFpbGVkOiBudW1iZXI7XG4gIHNraXBwZWQ6IG51bWJlcjtcbiAgZXJyb3JzOiBzdHJpbmdbXTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFRhYmxlcyB0aGF0IGFyZSBzeW5jYWJsZSBhY3Jvc3MgYnJhbmNoZXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5jb25zdCBTWU5DQUJMRV9UQUJMRVMgPSBuZXcgU2V0KFtcbiAgJ3BhdGllbnRzJywgJ3BhdGllbnRfdml0YWxzJywgJ3BhdGllbnRfbWVkaWNhbF9oaXN0b3J5JyxcbiAgJ3Zpc2l0cycsICdjbGluaWNhbF9ub3RlcycsICdkaWFnbm9zZXMnLCAndHJlYXRtZW50X3BsYW5zJyxcbiAgJ2FwcG9pbnRtZW50cycsICdhZG1pc3Npb25zJywgJ251cnNpbmdfcmVjb3JkcycsXG4gICdwcmVzY3JpcHRpb25zJywgJ3ByZXNjcmlwdGlvbl9pdGVtcycsXG4gICdsYWJfcmVxdWVzdHMnLCAnbGFiX3JlcXVlc3RfaXRlbXMnLFxuICAncmFkaW9sb2d5X3JlcXVlc3RzJyxcbiAgJ2ludm9pY2VzJywgJ2ludm9pY2VfaXRlbXMnLCAncGF5bWVudHMnLFxuICAncmVmZXJyYWxzJyxcbl0pO1xuXG4vLyBUYWJsZXMgdGhhdCBhcmUgYnJhbmNoLWxvY2FsIG9ubHkgKGRvIE5PVCBzeW5jKVxuY29uc3QgTE9DQUxfT05MWV9UQUJMRVMgPSBuZXcgU2V0KFtcbiAgJ2F1ZGl0X2xvZ3MnLCAnYWN0aXZlX3Nlc3Npb25zJywgJ2ZhaWxlZF9sb2dpbl9hdHRlbXB0cycsXG4gICdjaGFuZ2VfbG9nJywgJ3N5bmNfbG9nJywgJ3N5bmNfdmVjdG9yX2Nsb2NrcycsXG4gICdwaGFybWFjeV9pbnZlbnRvcnknLCAnc3RvY2tfaXRlbXMnLCAvLyBpbnZlbnRvcnkgaXMgYnJhbmNoLWxvY2FsXG5dKTtcblxuLy8gVGFibGVzIHdpdGggXCJsYXN0IHdyaXRlciB3aW5zXCIgc3RyYXRlZ3lcbmNvbnN0IExBU1RfV1JJVEVfV0lOUyA9IG5ldyBTZXQoW1xuICAncGF0aWVudF92aXRhbHMnLCAnbnVyc2luZ19yZWNvcmRzJywgJ2ljdV9tb25pdG9yaW5nJyxcbl0pO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgU3luY0VuZ2luZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBjbGFzcyBTeW5jRW5naW5lIHtcbiAgcHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IFN5bmNFbmdpbmU7XG4gIHByaXZhdGUgYnJhbmNoSWQ6IHN0cmluZyA9ICcnO1xuICBwcml2YXRlIHN5bmNJblByb2dyZXNzID0gZmFsc2U7XG4gIHByaXZhdGUgc3luY0ludGVydmFsOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRJbnRlcnZhbD4gfCBudWxsID0gbnVsbDtcblxuICBzdGF0aWMgZ2V0SW5zdGFuY2UoKTogU3luY0VuZ2luZSB7XG4gICAgaWYgKCFTeW5jRW5naW5lLmluc3RhbmNlKSBTeW5jRW5naW5lLmluc3RhbmNlID0gbmV3IFN5bmNFbmdpbmUoKTtcbiAgICByZXR1cm4gU3luY0VuZ2luZS5pbnN0YW5jZTtcbiAgfVxuXG4gIGluaXQoYnJhbmNoSWQ6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuYnJhbmNoSWQgPSBicmFuY2hJZDtcbiAgICBjb25zb2xlLmxvZyhgW1N5bmNdIEVuZ2luZSBpbml0aWFsaXplZCBmb3IgYnJhbmNoOiAke2JyYW5jaElkfWApO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIENvbGxlY3QgbG9jYWwgY2hhbmdlcyBzaW5jZSBsYXN0IHN5bmMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGNvbGxlY3RQZW5kaW5nQ2hhbmdlcyh0YWJsZU5hbWU/OiBzdHJpbmcpOiBDaGFuZ2VSZWNvcmRbXSB7XG4gICAgbGV0IHdoZXJlID0gJ1dIRVJFIHN5bmNlZCA9IDAnO1xuICAgIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IG51bWJlcilbXSA9IFtdO1xuICAgIGlmICh0YWJsZU5hbWUpIHtcbiAgICAgIHdoZXJlICs9ICcgQU5EIHRhYmxlX25hbWUgPSA/JztcbiAgICAgIHBhcmFtcy5wdXNoKHRhYmxlTmFtZSk7XG4gICAgfVxuICAgIHJldHVybiBkYi5xdWVyeTxDaGFuZ2VSZWNvcmQ+KFxuICAgICAgYFNFTEVDVCAqIEZST00gY2hhbmdlX2xvZyAke3doZXJlfSBPUkRFUiBCWSBpZCBBU0MgTElNSVQgNTAwMGAsXG4gICAgICBwYXJhbXMsXG4gICAgKS5yb3dzO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEJ1aWxkIHN5bmMgcGF5bG9hZCB0byBzZW5kIHRvIHJlbW90ZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgYnVpbGRTeW5jUGF5bG9hZCgpOiBTeW5jUGF5bG9hZCB7XG4gICAgY29uc3QgY2hhbmdlcyA9IHRoaXMuY29sbGVjdFBlbmRpbmdDaGFuZ2VzKClcbiAgICAgIC5maWx0ZXIoKGMpID0+IFNZTkNBQkxFX1RBQkxFUy5oYXMoYy50YWJsZU5hbWUpKTtcblxuICAgIGNvbnN0IHZlY3RvckNsb2NrID0gdGhpcy5nZXRWZWN0b3JDbG9jaygpO1xuICAgIGNvbnN0IHNlc3Npb25JZCA9IGBzeW5jLSR7RGF0ZS5ub3coKX0tJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDM2KS5zbGljZSgyLCA4KX1gO1xuICAgIGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcblxuICAgIGNvbnN0IGNoZWNrc3VtID0gY3JlYXRlSGFzaCgnc2hhMjU2JylcbiAgICAgIC51cGRhdGUoSlNPTi5zdHJpbmdpZnkoeyBjaGFuZ2VzLCB2ZWN0b3JDbG9jaywgdGltZXN0YW1wIH0pKVxuICAgICAgLmRpZ2VzdCgnaGV4Jyk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc291cmNlQnJhbmNoSWQ6IHRoaXMuYnJhbmNoSWQsXG4gICAgICBzZXNzaW9uSWQsXG4gICAgICB0aW1lc3RhbXAsXG4gICAgICBjaGFuZ2VzLFxuICAgICAgdmVjdG9yQ2xvY2ssXG4gICAgICBjaGVja3N1bSxcbiAgICB9O1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEFwcGx5IGluY29taW5nIGNoYW5nZXMgZnJvbSByZW1vdGUgYnJhbmNoIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBhcHBseUluY29taW5nQ2hhbmdlcyhwYXlsb2FkOiBTeW5jUGF5bG9hZCk6IFN5bmNSZXN1bHQge1xuICAgIGlmICh0aGlzLnN5bmNJblByb2dyZXNzKSB7XG4gICAgICByZXR1cm4geyBhcHBsaWVkOiAwLCBjb25mbGljdHM6IDAsIGZhaWxlZDogMCwgc2tpcHBlZDogMSwgZXJyb3JzOiBbJ1N5bmMgYWxyZWFkeSBpbiBwcm9ncmVzcyddIH07XG4gICAgfVxuXG4gICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyA9IHRydWU7XG4gICAgY29uc3QgcmVzdWx0OiBTeW5jUmVzdWx0ID0geyBhcHBsaWVkOiAwLCBjb25mbGljdHM6IDAsIGZhaWxlZDogMCwgc2tpcHBlZDogMCwgZXJyb3JzOiBbXSB9O1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIDEuIFZlcmlmeSBjaGVja3N1bVxuICAgICAgY29uc3QgZXhwZWN0ZWRDaGVja3N1bSA9IGNyZWF0ZUhhc2goJ3NoYTI1NicpXG4gICAgICAgIC51cGRhdGUoSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGNoYW5nZXM6IHBheWxvYWQuY2hhbmdlcyxcbiAgICAgICAgICB2ZWN0b3JDbG9jazogcGF5bG9hZC52ZWN0b3JDbG9jayxcbiAgICAgICAgICB0aW1lc3RhbXA6IHBheWxvYWQudGltZXN0YW1wLFxuICAgICAgICB9KSlcbiAgICAgICAgLmRpZ2VzdCgnaGV4Jyk7XG5cbiAgICAgIGlmIChleHBlY3RlZENoZWNrc3VtICE9PSBwYXlsb2FkLmNoZWNrc3VtKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignUGF5bG9hZCBjaGVja3N1bSBtaXNtYXRjaCBcdTIwMTQgZGF0YSBtYXkgYmUgY29ycnVwdGVkIGluIHRyYW5zaXQnKTtcbiAgICAgIH1cblxuICAgICAgZGIudHJhbnNhY3Rpb24oKCkgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IGNoYW5nZSBvZiBwYXlsb2FkLmNoYW5nZXMpIHtcbiAgICAgICAgICBpZiAoIVNZTkNBQkxFX1RBQkxFUy5oYXMoY2hhbmdlLnRhYmxlTmFtZSkpIHtcbiAgICAgICAgICAgIHJlc3VsdC5za2lwcGVkKys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3QgYXBwbGllZCA9IHRoaXMuYXBwbHlDaGFuZ2UoY2hhbmdlLCBwYXlsb2FkLnNvdXJjZUJyYW5jaElkLCByZXN1bHQpO1xuICAgICAgICAgICAgaWYgKGFwcGxpZWQpIHJlc3VsdC5hcHBsaWVkKys7XG5cbiAgICAgICAgICAgIC8vIExvZyB0byBzeW5jX2xvZ1xuICAgICAgICAgICAgZGIucnVuKFxuICAgICAgICAgICAgICBgSU5TRVJUIElOVE8gc3luY19sb2cgKGlkLCBicmFuY2hfaWQsIHN5bmNfc2Vzc2lvbl9pZCwgZGlyZWN0aW9uLCB0YWJsZV9uYW1lLFxuICAgICAgICAgICAgICAgcmVjb3JkX2lkLCBvcGVyYXRpb24sIHBheWxvYWQsIHN0YXR1cywgc3luY2VkX2F0KVxuICAgICAgICAgICAgICAgVkFMVUVTIChsb3dlcihoZXgocmFuZG9tYmxvYigxNikpKSw/LD8sPyw/LD8sPyw/LD8sZGF0ZXRpbWUoJ25vdycpKWAsXG4gICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICB0aGlzLmJyYW5jaElkLCBwYXlsb2FkLnNlc3Npb25JZCwgJ3B1bGwnLFxuICAgICAgICAgICAgICAgIGNoYW5nZS50YWJsZU5hbWUsIGNoYW5nZS5yZWNvcmRJZCwgY2hhbmdlLm9wZXJhdGlvbixcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShjaGFuZ2UubmV3VmFsdWVzKSwgYXBwbGllZCA/ICdhcHBsaWVkJyA6ICdza2lwcGVkJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICByZXN1bHQuZmFpbGVkKys7XG4gICAgICAgICAgICByZXN1bHQuZXJyb3JzLnB1c2goYCR7Y2hhbmdlLnRhYmxlTmFtZX06JHtjaGFuZ2UucmVjb3JkSWR9IC0gJHsoZXJyIGFzIEVycm9yKS5tZXNzYWdlfWApO1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW1N5bmNdIEZhaWxlZCB0byBhcHBseSBjaGFuZ2U6JywgZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBVcGRhdGUgdmVjdG9yIGNsb2Nrc1xuICAgICAgICB0aGlzLm1lcmdlVmVjdG9yQ2xvY2socGF5bG9hZC5zb3VyY2VCcmFuY2hJZCwgcGF5bG9hZC52ZWN0b3JDbG9jayk7XG4gICAgICB9KTtcblxuICAgICAgYXVkaXRMb2dnZXIubG9nU3luYyh7XG4gICAgICAgIGFjdGlvbjogJ1NZTkNfQ09NUExFVEVEJywgbW9kdWxlOiAnc3luYycsIHJlc291cmNlOiAnc3lzdGVtJyxcbiAgICAgICAgYnJhbmNoSWQ6IHRoaXMuYnJhbmNoSWQsIHN0YXR1czogJ3N1Y2Nlc3MnLCByaXNrTGV2ZWw6ICdsb3cnLFxuICAgICAgICBuZXdWYWx1ZXM6IHtcbiAgICAgICAgICBzb3VyY2VCcmFuY2g6IHBheWxvYWQuc291cmNlQnJhbmNoSWQsXG4gICAgICAgICAgYXBwbGllZDogcmVzdWx0LmFwcGxpZWQsXG4gICAgICAgICAgY29uZmxpY3RzOiByZXN1bHQuY29uZmxpY3RzLFxuICAgICAgICAgIGZhaWxlZDogcmVzdWx0LmZhaWxlZCxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICByZXN1bHQuZXJyb3JzLnB1c2goKGVyciBhcyBFcnJvcikubWVzc2FnZSk7XG4gICAgICBhdWRpdExvZ2dlci5sb2dTeW5jKHtcbiAgICAgICAgYWN0aW9uOiAnU1lOQ19DT01QTEVURUQnLCBtb2R1bGU6ICdzeW5jJywgcmVzb3VyY2U6ICdzeXN0ZW0nLFxuICAgICAgICBicmFuY2hJZDogdGhpcy5icmFuY2hJZCwgc3RhdHVzOiAnZmFpbGVkJywgcmlza0xldmVsOiAnaGlnaCcsXG4gICAgICAgIGZhaWx1cmVSZWFzb246IChlcnIgYXMgRXJyb3IpLm1lc3NhZ2UsXG4gICAgICB9KTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5zeW5jSW5Qcm9ncmVzcyA9IGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgQXBwbHkgYSBzaW5nbGUgY2hhbmdlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBwcml2YXRlIGFwcGx5Q2hhbmdlKFxuICAgIGNoYW5nZTogQ2hhbmdlUmVjb3JkLFxuICAgIHNvdXJjZUJyYW5jaElkOiBzdHJpbmcsXG4gICAgcmVzdWx0OiBTeW5jUmVzdWx0LFxuICApOiBib29sZWFuIHtcbiAgICBjb25zdCB7IHRhYmxlTmFtZSwgcmVjb3JkSWQsIG9wZXJhdGlvbiwgbmV3VmFsdWVzLCBvbGRWYWx1ZXMgfSA9IGNoYW5nZTtcblxuICAgIGlmIChvcGVyYXRpb24gPT09ICdkZWxldGUnKSB7XG4gICAgICAvLyBTb2Z0LWRlbGV0ZSBzdHJhdGVneTogbmV2ZXIgaGFyZC1kZWxldGUgc3luY2VkIHJlY29yZHNcbiAgICAgIGNvbnN0IGhhc0lzQWN0aXZlID0gZGIuZXhpc3RzKHRhYmxlTmFtZSwgYGlkID0gJyR7cmVjb3JkSWR9JyBBTkQgdHlwZW9mKGlzX2FjdGl2ZSkgPSAnaW50ZWdlcidgKTtcbiAgICAgIGlmIChoYXNJc0FjdGl2ZSkge1xuICAgICAgICBkYi5ydW4oYFVQREFURSAke3RhYmxlTmFtZX0gU0VUIGlzX2FjdGl2ZSA9IDAgV0hFUkUgaWQgPSA/YCwgW3JlY29yZElkXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAob3BlcmF0aW9uID09PSAnaW5zZXJ0Jykge1xuICAgICAgY29uc3QgZXhpc3RzID0gZGIuZXhpc3RzKHRhYmxlTmFtZSwgJ2lkID0gPycsIFtyZWNvcmRJZF0pO1xuICAgICAgaWYgKGV4aXN0cykge1xuICAgICAgICAvLyBSZWNvcmQgYWxyZWFkeSBleGlzdHMgXHUyMDE0IGNoZWNrIGZvciBjb25mbGljdFxuICAgICAgICByZXR1cm4gdGhpcy5yZXNvbHZlQ29uZmxpY3QodGFibGVOYW1lLCByZWNvcmRJZCwgbmV3VmFsdWVzISwgc291cmNlQnJhbmNoSWQsIHJlc3VsdCk7XG4gICAgICB9XG4gICAgICAvLyBTYWZlIHRvIGluc2VydFxuICAgICAgaWYgKG5ld1ZhbHVlcykge1xuICAgICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMobmV3VmFsdWVzKTtcbiAgICAgICAgY29uc3QgcGxhY2Vob2xkZXJzID0ga2V5cy5tYXAoKCkgPT4gJz8nKS5qb2luKCcsICcpO1xuICAgICAgICBjb25zdCB2YWx1ZXMgPSBPYmplY3QudmFsdWVzKG5ld1ZhbHVlcykubWFwKCh2KSA9PlxuICAgICAgICAgIHYgPT09IHVuZGVmaW5lZCA/IG51bGwgOiAodiBhcyBzdHJpbmcgfCBudW1iZXIgfCBudWxsKSxcbiAgICAgICAgKTtcbiAgICAgICAgZGIucnVuKFxuICAgICAgICAgIGBJTlNFUlQgT1IgSUdOT1JFIElOVE8gJHt0YWJsZU5hbWV9ICgke2tleXMuam9pbignLCAnKX0pIFZBTFVFUyAoJHtwbGFjZWhvbGRlcnN9KWAsXG4gICAgICAgICAgdmFsdWVzLFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKG9wZXJhdGlvbiA9PT0gJ3VwZGF0ZScpIHtcbiAgICAgIGNvbnN0IGV4aXN0cyA9IGRiLmV4aXN0cyh0YWJsZU5hbWUsICdpZCA9ID8nLCBbcmVjb3JkSWRdKTtcbiAgICAgIGlmICghZXhpc3RzKSB7XG4gICAgICAgIC8vIFJlY29yZCBkb2Vzbid0IGV4aXN0IGxvY2FsbHkgXHUyMDE0IHRyZWF0IGFzIGluc2VydFxuICAgICAgICBpZiAobmV3VmFsdWVzKSB7XG4gICAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG5ld1ZhbHVlcyk7XG4gICAgICAgICAgY29uc3QgcGxhY2Vob2xkZXJzID0ga2V5cy5tYXAoKCkgPT4gJz8nKS5qb2luKCcsICcpO1xuICAgICAgICAgIGNvbnN0IHZhbHVlcyA9IE9iamVjdC52YWx1ZXMobmV3VmFsdWVzKS5tYXAoKHYpID0+XG4gICAgICAgICAgICB2ID09PSB1bmRlZmluZWQgPyBudWxsIDogKHYgYXMgc3RyaW5nIHwgbnVtYmVyIHwgbnVsbCksXG4gICAgICAgICAgKTtcbiAgICAgICAgICBkYi5ydW4oXG4gICAgICAgICAgICBgSU5TRVJUIE9SIElHTk9SRSBJTlRPICR7dGFibGVOYW1lfSAoJHtrZXlzLmpvaW4oJywgJyl9KSBWQUxVRVMgKCR7cGxhY2Vob2xkZXJzfSlgLFxuICAgICAgICAgICAgdmFsdWVzLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLnJlc29sdmVDb25mbGljdCh0YWJsZU5hbWUsIHJlY29yZElkLCBuZXdWYWx1ZXMhLCBzb3VyY2VCcmFuY2hJZCwgcmVzdWx0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgQ29uZmxpY3QgcmVzb2x1dGlvbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgcHJpdmF0ZSByZXNvbHZlQ29uZmxpY3QoXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcmVjb3JkSWQ6IHN0cmluZyxcbiAgICByZW1vdGVWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuICAgIHNvdXJjZUJyYW5jaElkOiBzdHJpbmcsXG4gICAgcmVzdWx0OiBTeW5jUmVzdWx0LFxuICApOiBib29sZWFuIHtcbiAgICBjb25zdCBsb2NhbFJlY29yZCA9IGRiLmZpbmRPbmU8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+KFxuICAgICAgYFNFTEVDVCAqIEZST00gJHt0YWJsZU5hbWV9IFdIRVJFIGlkID0gP2AsXG4gICAgICBbcmVjb3JkSWRdLFxuICAgICk7XG5cbiAgICBpZiAoIWxvY2FsUmVjb3JkKSByZXR1cm4gZmFsc2U7XG5cbiAgICAvLyBTdHJhdGVneSAxOiBMYXN0LXdyaXRlLXdpbnMgdGFibGVzXG4gICAgaWYgKExBU1RfV1JJVEVfV0lOUy5oYXModGFibGVOYW1lKSkge1xuICAgICAgY29uc3QgbG9jYWxUaW1lID0gU3RyaW5nKGxvY2FsUmVjb3JkLnVwZGF0ZWRfYXQgPz8gbG9jYWxSZWNvcmQuY3JlYXRlZF9hdCA/PyAnJyk7XG4gICAgICBjb25zdCByZW1vdGVUaW1lID0gU3RyaW5nKHJlbW90ZVZhbHVlcy51cGRhdGVkX2F0ID8/IHJlbW90ZVZhbHVlcy5jcmVhdGVkX2F0ID8/ICcnKTtcbiAgICAgIGlmIChyZW1vdGVUaW1lID4gbG9jYWxUaW1lKSB7XG4gICAgICAgIHRoaXMuYXBwbHlVcGRhdGUodGFibGVOYW1lLCByZWNvcmRJZCwgcmVtb3RlVmFsdWVzKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgICByZXN1bHQuc2tpcHBlZCsrO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIFN0cmF0ZWd5IDI6IEZpZWxkLWxldmVsIG1lcmdlIGZvciBwYXRpZW50IHJlY29yZHNcbiAgICBpZiAodGFibGVOYW1lID09PSAncGF0aWVudHMnIHx8IHRhYmxlTmFtZSA9PT0gJ3N0YWZmX3Byb2ZpbGVzJykge1xuICAgICAgY29uc3QgbWVyZ2VkID0gdGhpcy5maWVsZE1lcmdlKGxvY2FsUmVjb3JkLCByZW1vdGVWYWx1ZXMpO1xuICAgICAgdGhpcy5hcHBseVVwZGF0ZSh0YWJsZU5hbWUsIHJlY29yZElkLCBtZXJnZWQpO1xuICAgICAgcmVzdWx0LmNvbmZsaWN0cysrO1xuICAgICAgdGhpcy5sb2dDb25mbGljdCh0YWJsZU5hbWUsIHJlY29yZElkLCBsb2NhbFJlY29yZCwgcmVtb3RlVmFsdWVzLCAnbWVyZ2VkJywgc291cmNlQnJhbmNoSWQpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gU3RyYXRlZ3kgMzogUmVtb3RlIHdpbnMgZm9yIGNsaW5pY2FsIGRhdGEgKGRvY3RvcnMnIGRhdGEgYXV0aG9yaXRhdGl2ZSlcbiAgICBjb25zdCBsb2NhbFRpbWUgPSBTdHJpbmcobG9jYWxSZWNvcmQudXBkYXRlZF9hdCA/PyBsb2NhbFJlY29yZC5jcmVhdGVkX2F0ID8/ICcnKTtcbiAgICBjb25zdCByZW1vdGVUaW1lID0gU3RyaW5nKHJlbW90ZVZhbHVlcy51cGRhdGVkX2F0ID8/IHJlbW90ZVZhbHVlcy5jcmVhdGVkX2F0ID8/ICcnKTtcblxuICAgIGlmIChyZW1vdGVUaW1lID4gbG9jYWxUaW1lKSB7XG4gICAgICB0aGlzLmFwcGx5VXBkYXRlKHRhYmxlTmFtZSwgcmVjb3JkSWQsIHJlbW90ZVZhbHVlcyk7XG4gICAgICByZXN1bHQuY29uZmxpY3RzKys7XG4gICAgICB0aGlzLmxvZ0NvbmZsaWN0KHRhYmxlTmFtZSwgcmVjb3JkSWQsIGxvY2FsUmVjb3JkLCByZW1vdGVWYWx1ZXMsICdyZW1vdGVfd2lucycsIHNvdXJjZUJyYW5jaElkKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHJlc3VsdC5za2lwcGVkKys7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSBhcHBseVVwZGF0ZShcbiAgICB0YWJsZU5hbWU6IHN0cmluZyxcbiAgICByZWNvcmRJZDogc3RyaW5nLFxuICAgIHZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHNhZmVWYWx1ZXMgPSBPYmplY3QuZnJvbUVudHJpZXMoXG4gICAgICBPYmplY3QuZW50cmllcyh2YWx1ZXMpLmZpbHRlcigoW2tdKSA9PiBrICE9PSAnaWQnKSxcbiAgICApO1xuICAgIGNvbnN0IHNldENsYXVzZSA9IE9iamVjdC5rZXlzKHNhZmVWYWx1ZXMpLm1hcCgoaykgPT4gYCR7a30gPSA/YCkuam9pbignLCAnKTtcbiAgICBjb25zdCBwYXJhbXMgPSBbXG4gICAgICAuLi5PYmplY3QudmFsdWVzKHNhZmVWYWx1ZXMpLm1hcCgodikgPT4gKHYgPT09IHVuZGVmaW5lZCA/IG51bGwgOiAodiBhcyBzdHJpbmcgfCBudW1iZXIgfCBudWxsKSkpLFxuICAgICAgcmVjb3JkSWQsXG4gICAgXTtcbiAgICBkYi5ydW4oYFVQREFURSAke3RhYmxlTmFtZX0gU0VUICR7c2V0Q2xhdXNlfSBXSEVSRSBpZCA9ID9gLCBwYXJhbXMpO1xuICB9XG5cbiAgLy8gRmllbGQtbGV2ZWwgbWVyZ2U6IHJlbW90ZSBmaWxscyBpbiBibGFuayBsb2NhbCBmaWVsZHMsIGxvY2FsIGtlZXBzIG5vbi1udWxsIHZhbHVlc1xuICBwcml2YXRlIGZpZWxkTWVyZ2UoXG4gICAgbG9jYWw6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuICAgIHJlbW90ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gICk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcbiAgICBjb25zdCBtZXJnZWQgPSB7IC4uLmxvY2FsIH07XG4gICAgZm9yIChjb25zdCBba2V5LCByZW1vdGVWYWxdIG9mIE9iamVjdC5lbnRyaWVzKHJlbW90ZSkpIHtcbiAgICAgIGlmIChrZXkgPT09ICdpZCcpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgbG9jYWxWYWwgPSBsb2NhbFtrZXldO1xuICAgICAgLy8gUmVtb3RlIHdpbnMgaWYgbG9jYWwgaXMgbnVsbC9lbXB0eSwgb3RoZXJ3aXNlIGtlZXAgbG9jYWxcbiAgICAgIGlmIChsb2NhbFZhbCA9PT0gbnVsbCB8fCBsb2NhbFZhbCA9PT0gdW5kZWZpbmVkIHx8IGxvY2FsVmFsID09PSAnJykge1xuICAgICAgICBtZXJnZWRba2V5XSA9IHJlbW90ZVZhbDtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG1lcmdlZDtcbiAgfVxuXG4gIHByaXZhdGUgbG9nQ29uZmxpY3QoXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgcmVjb3JkSWQ6IHN0cmluZyxcbiAgICBsb2NhbDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gICAgcmVtb3RlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbiAgICByZXNvbHV0aW9uOiBDb25mbGljdFJlc29sdXRpb24sXG4gICAgc291cmNlQnJhbmNoSWQ6IHN0cmluZyxcbiAgKTogdm9pZCB7XG4gICAgZGIucnVuKFxuICAgICAgYElOU0VSVCBJTlRPIHN5bmNfbG9nIChpZCwgYnJhbmNoX2lkLCBzeW5jX3Nlc3Npb25faWQsIGRpcmVjdGlvbiwgdGFibGVfbmFtZSxcbiAgICAgICByZWNvcmRfaWQsIG9wZXJhdGlvbiwgcGF5bG9hZCwgY29uZmxpY3RfZGV0ZWN0ZWQsIGNvbmZsaWN0X3Jlc29sdXRpb24sIHN0YXR1cylcbiAgICAgICBWQUxVRVMgKGxvd2VyKGhleChyYW5kb21ibG9iKDE2KSkpLD8sPyw/LD8sPyw/LD8sMSw/LD8pYCxcbiAgICAgIFtcbiAgICAgICAgdGhpcy5icmFuY2hJZCwgYGNvbmZsaWN0LSR7RGF0ZS5ub3coKX1gLCAncHVsbCcsXG4gICAgICAgIHRhYmxlTmFtZSwgcmVjb3JkSWQsICd1cGRhdGUnLFxuICAgICAgICBKU09OLnN0cmluZ2lmeSh7IGxvY2FsLCByZW1vdGUsIHNvdXJjZUJyYW5jaDogc291cmNlQnJhbmNoSWQgfSksXG4gICAgICAgIHJlc29sdXRpb24sICdhcHBsaWVkJyxcbiAgICAgIF0sXG4gICAgKTtcblxuICAgIGF1ZGl0TG9nZ2VyLmxvZ1N5bmMoe1xuICAgICAgYWN0aW9uOiAnU1lOQ19DT05GTElDVCcsIG1vZHVsZTogJ3N5bmMnLCByZXNvdXJjZTogdGFibGVOYW1lLFxuICAgICAgcmVzb3VyY2VJZDogcmVjb3JkSWQsIGJyYW5jaElkOiB0aGlzLmJyYW5jaElkLFxuICAgICAgc3RhdHVzOiAnc3VjY2VzcycsIHJpc2tMZXZlbDogJ21lZGl1bScsXG4gICAgICBuZXdWYWx1ZXM6IHsgcmVzb2x1dGlvbiwgc291cmNlQnJhbmNoSWQgfSxcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBWZWN0b3IgY2xvY2sgbWFuYWdlbWVudCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbiAgZ2V0VmVjdG9yQ2xvY2soKTogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB7XG4gICAgY29uc3Qgcm93cyA9IGRiLnF1ZXJ5PHsgYnJhbmNoX2lkOiBzdHJpbmc7IGxhc3Rfc2VxOiBudW1iZXIgfT4oXG4gICAgICBgU0VMRUNUIGJyYW5jaF9pZCwgbGFzdF9zZXEgRlJPTSBzeW5jX3ZlY3Rvcl9jbG9ja3MgV0hFUkUgYnJhbmNoX2lkID0gP2AsXG4gICAgICBbdGhpcy5icmFuY2hJZF0sXG4gICAgKS5yb3dzO1xuXG4gICAgcmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhyb3dzLm1hcCgocikgPT4gW3IuYnJhbmNoX2lkLCByLmxhc3Rfc2VxXSkpO1xuICB9XG5cbiAgcHJpdmF0ZSBtZXJnZVZlY3RvckNsb2NrKFxuICAgIHNvdXJjZUJyYW5jaElkOiBzdHJpbmcsXG4gICAgcmVtb3RlQ2xvY2s6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4sXG4gICk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgW2JyYW5jaElkLCBzZXFdIG9mIE9iamVjdC5lbnRyaWVzKHJlbW90ZUNsb2NrKSkge1xuICAgICAgZGIucnVuKFxuICAgICAgICBgSU5TRVJUIElOVE8gc3luY192ZWN0b3JfY2xvY2tzIChicmFuY2hfaWQsIHRhYmxlX25hbWUsIGxhc3Rfc2VxLCBsYXN0X3N5bmMpXG4gICAgICAgICBWQUxVRVMgKD8sID8sID8sIGRhdGV0aW1lKCdub3cnKSlcbiAgICAgICAgIE9OIENPTkZMSUNUKGJyYW5jaF9pZCwgdGFibGVfbmFtZSkgRE8gVVBEQVRFXG4gICAgICAgICBTRVQgbGFzdF9zZXEgPSBNQVgobGFzdF9zZXEsIGV4Y2x1ZGVkLmxhc3Rfc2VxKSwgbGFzdF9zeW5jID0gZGF0ZXRpbWUoJ25vdycpYCxcbiAgICAgICAgW2JyYW5jaElkLCBzb3VyY2VCcmFuY2hJZCwgc2VxXSxcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIE1hcmsgY2hhbmdlcyBhcyBzeW5jZWQgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIG1hcmtDaGFuZ2VzU3luY2VkKGNoYW5nZUlkczogbnVtYmVyW10pOiB2b2lkIHtcbiAgICBpZiAoY2hhbmdlSWRzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgIGNvbnN0IHBsYWNlaG9sZGVycyA9IGNoYW5nZUlkcy5tYXAoKCkgPT4gJz8nKS5qb2luKCcsICcpO1xuICAgIGRiLnJ1bihgVVBEQVRFIGNoYW5nZV9sb2cgU0VUIHN5bmNlZCA9IDEgV0hFUkUgaWQgSU4gKCR7cGxhY2Vob2xkZXJzfSlgLCBjaGFuZ2VJZHMpO1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEF1dG8tc3luYyBzY2hlZHVsaW5nIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBzdGFydEF1dG9TeW5jKFxuICAgIGludGVydmFsTXMgPSA2MF8wMDAsXG4gICAgc3luY0ZuOiAoKSA9PiBQcm9taXNlPHZvaWQ+LFxuICApOiB2b2lkIHtcbiAgICB0aGlzLnN5bmNJbnRlcnZhbCA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHtcbiAgICAgIGlmICghdGhpcy5zeW5jSW5Qcm9ncmVzcykge1xuICAgICAgICB0cnkgeyBhd2FpdCBzeW5jRm4oKTsgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcignW1N5bmNdIEF1dG8tc3luYyBmYWlsZWQ6JywgZXJyKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sIGludGVydmFsTXMpO1xuICAgIGNvbnNvbGUubG9nKGBbU3luY10gQXV0by1zeW5jIHN0YXJ0ZWQgZXZlcnkgJHtpbnRlcnZhbE1zIC8gMTAwMH1zYCk7XG4gIH1cblxuICBzdG9wQXV0b1N5bmMoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuc3luY0ludGVydmFsKSB7XG4gICAgICBjbGVhckludGVydmFsKHRoaXMuc3luY0ludGVydmFsKTtcbiAgICAgIHRoaXMuc3luY0ludGVydmFsID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICAvLyBcdTI1MDBcdTI1MDBcdTI1MDAgU3luYyBzdGF0dXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIGdldFN5bmNTdGF0dXMoKToge1xuICAgIHBlbmRpbmdDaGFuZ2VzOiBudW1iZXI7XG4gICAgbGFzdFN5bmM6IHN0cmluZyB8IG51bGw7XG4gICAgaW5Qcm9ncmVzczogYm9vbGVhbjtcbiAgICBjb25mbGljdHM6IG51bWJlcjtcbiAgfSB7XG4gICAgY29uc3QgcGVuZGluZyA9IGRiLmNvdW50KCdjaGFuZ2VfbG9nJywgJ3N5bmNlZCA9IDAnKTtcbiAgICBjb25zdCBsYXN0U3luYyA9IGRiLmZpbmRPbmU8eyBsYXN0X3N5bmM6IHN0cmluZyB9PihcbiAgICAgIGBTRUxFQ1QgTUFYKGxhc3Rfc3luYykgYXMgbGFzdF9zeW5jIEZST00gc3luY192ZWN0b3JfY2xvY2tzYCxcbiAgICApPy5sYXN0X3N5bmMgPz8gbnVsbDtcbiAgICBjb25zdCBjb25mbGljdHMgPSBkYi5jb3VudCgnc3luY19sb2cnLCAnY29uZmxpY3RfZGV0ZWN0ZWQgPSAxJyk7XG5cbiAgICByZXR1cm4geyBwZW5kaW5nQ2hhbmdlczogcGVuZGluZywgbGFzdFN5bmMsIGluUHJvZ3Jlc3M6IHRoaXMuc3luY0luUHJvZ3Jlc3MsIGNvbmZsaWN0cyB9O1xuICB9XG5cbiAgLy8gXHUyNTAwXHUyNTAwXHUyNTAwIERhdGEgZXhwb3J0IGZvciBicmFuY2ggbWlncmF0aW9uIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuICBleHBvcnRCcmFuY2hEYXRhKGJyYW5jaElkOiBzdHJpbmcpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duW10+IHtcbiAgICBjb25zdCBleHBvcnRlZDogUmVjb3JkPHN0cmluZywgdW5rbm93bltdPiA9IHt9O1xuICAgIGZvciAoY29uc3QgdGFibGUgb2YgU1lOQ0FCTEVfVEFCTEVTKSB7XG4gICAgICBjb25zdCByb3dzID0gZGIucXVlcnkoYFNFTEVDVCAqIEZST00gJHt0YWJsZX0gV0hFUkUgYnJhbmNoX2lkID0gP2AsIFticmFuY2hJZF0pLnJvd3M7XG4gICAgICBpZiAocm93cy5sZW5ndGggPiAwKSBleHBvcnRlZFt0YWJsZV0gPSByb3dzO1xuICAgIH1cbiAgICByZXR1cm4gZXhwb3J0ZWQ7XG4gIH1cbn1cblxuZXhwb3J0IGNv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
