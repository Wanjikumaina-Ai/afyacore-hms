import { useState, useEffect } from "react";
import { api } from "../stores";

interface AuditLog {
  id: number;
  timestamp: string;
  username: string | null;
  user_role: string | null;
  branch_name: string | null;
  ip_address: string | null;
  action: string;
  module: string;
  resource: string;
  resource_id: string | null;
  status: string;
  risk_level: string;
  failure_reason: string | null;
  previous_values: string | null;
  new_values: string | null;
}

const RISK_COLORS: Record<string, string> = {
  low: "#10b981", medium: "#f59e0b", high: "#ef4444", critical: "#7c2d12",
};
const STATUS_COLORS: Record<string, string> = {
  success: "#10b981", failed: "#ef4444", blocked: "#8b5cf6",
};
const MODULES = ["auth","patients","clinical","pharmacy","finance","laboratory","radiology","hr","admin","sync","license"];
const ACTIONS = ["LOGIN","LOGOUT","LOGIN_FAILED","PATIENT_CREATED","PATIENT_UPDATED","PATIENT_VIEWED","VISIT_CREATED","PRESCRIPTION_CREATED","PRESCRIPTION_DISPENSED","LAB_REQUEST_CREATED","LAB_RESULT_ENTERED","INVOICE_CREATED","INVOICE_VOIDED","PAYMENT_RECEIVED","ADMISSION_CREATED","PATIENT_DISCHARGED","USER_CREATED","USER_LOCKED","BACKUP_CREATED","CONFIG_CHANGED"];

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [integrity, setIntegrity] = useState<{ valid: boolean; tampered: number[]; checked: number } | null>(null);

  const [filters, setFilters] = useState({
    module: "", action: "", status: "", riskLevel: "",
    startDate: "", endDate: "", userId: "",
  });

  const fetchLogs = async (p = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p), pageSize: "50",
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      });
      const res = await api.get<any>(`/audit?${params}`);
      setLogs(res.rows);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setPage(p);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const checkIntegrity = async () => {
    const res = await api.get<any>("/audit/verify");
    setIntegrity(res);
  };

  const exportCsv = () => {
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v]) => v)));
    window.open(`/api/audit/export?${params}`, "_blank");
  };

  useEffect(() => { fetchLogs(1); }, []);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>📜 Audit Logs</h1>
          <p style={s.sub}>{total.toLocaleString()} records • Immutable & cryptographically verified</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={checkIntegrity} style={s.secBtn}>🔐 Verify Integrity</button>
          <button onClick={exportCsv} style={s.secBtn}>⬇ Export CSV</button>
        </div>
      </div>

      {/* Integrity banner */}
      {integrity && (
        <div style={{ ...s.integrityBanner, background: integrity.valid ? "#f0fdf4" : "#fef2f2", border: `1px solid ${integrity.valid ? "#bbf7d0" : "#fecaca"}` }}>
          {integrity.valid
            ? `✅ Integrity verified — ${integrity.checked.toLocaleString()} records checked, no tampering detected`
            : `🚨 TAMPERING DETECTED — ${integrity.tampered.length} records have invalid checksums: IDs ${integrity.tampered.slice(0, 5).join(", ")}${integrity.tampered.length > 5 ? "..." : ""}`}
        </div>
      )}

      {/* Filters */}
      <div style={s.filters}>
        <select value={filters.module} onChange={(e) => setFilters({ ...filters, module: e.target.value })} style={s.filterSelect}>
          <option value="">All Modules</option>
          {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} style={s.filterSelect}>
          <option value="">All Actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={s.filterSelect}>
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="blocked">Blocked</option>
        </select>
        <select value={filters.riskLevel} onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })} style={s.filterSelect}>
          <option value="">All Risk Levels</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} style={s.filterInput} />
        <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} style={s.filterInput} />
        <button onClick={() => fetchLogs(1)} style={s.filterBtn}>🔍 Filter</button>
        <button onClick={() => { setFilters({ module: "", action: "", status: "", riskLevel: "", startDate: "", endDate: "", userId: "" }); setTimeout(() => fetchLogs(1), 0); }} style={s.clearBtn}>✕ Clear</button>
      </div>

      {/* Table */}
      <div style={s.tableCard}>
        {isLoading ? (
          <div style={s.loading}>Loading audit logs...</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>#</th>
                <th style={s.th}>Timestamp</th>
                <th style={s.th}>User</th>
                <th style={s.th}>Role</th>
                <th style={s.th}>Branch</th>
                <th style={s.th}>Action</th>
                <th style={s.th}>Module</th>
                <th style={s.th}>Resource</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Risk</th>
                <th style={s.th}>IP</th>
                <th style={s.th}>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={s.tr}>
                  <td style={s.tdMono}>{log.id}</td>
                  <td style={s.tdMono}>{new Date(log.timestamp).toLocaleString()}</td>
                  <td style={s.td}>{log.username ?? "—"}</td>
                  <td style={s.td}><span style={s.rolePill}>{log.user_role ?? "—"}</span></td>
                  <td style={s.td}>{log.branch_name ?? "—"}</td>
                  <td style={s.td}><code style={s.actionCode}>{log.action}</code></td>
                  <td style={s.td}><span style={s.modPill}>{log.module}</span></td>
                  <td style={s.td}>{log.resource}{log.resource_id ? <span style={s.resId}> #{log.resource_id.slice(0, 8)}</span> : ""}</td>
                  <td style={s.td}>
                    <span style={{ ...s.statusPill, background: STATUS_COLORS[log.status] + "18", color: STATUS_COLORS[log.status] }}>
                      {log.status}
                    </span>
                  </td>
                  <td style={s.td}>
                    <span style={{ ...s.riskPill, color: RISK_COLORS[log.risk_level] }}>
                      {["●", "●", "●", "●"][["low","medium","high","critical"].indexOf(log.risk_level)] ?? "●"} {log.risk_level}
                    </span>
                  </td>
                  <td style={s.tdMono}>{log.ip_address ?? "—"}</td>
                  <td style={s.td}>
                    <button onClick={() => setSelected(log)} style={s.detailBtn}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={s.pagination}>
            <button disabled={page <= 1} onClick={() => fetchLogs(page - 1)} style={s.pageBtn}>← Prev</button>
            <span style={s.pageInfo}>Page {page} of {totalPages} ({total.toLocaleString()} total)</span>
            <button disabled={page >= totalPages} onClick={() => fetchLogs(page + 1)} style={s.pageBtn}>Next →</button>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div style={s.modalOverlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>Audit Log #{selected.id}</h3>
              <button onClick={() => setSelected(null)} style={s.closeBtn}>✕</button>
            </div>
            <div style={s.modalBody}>
              <Detail label="Timestamp" value={new Date(selected.timestamp).toLocaleString()} />
              <Detail label="User" value={selected.username ?? "—"} />
              <Detail label="Role" value={selected.user_role ?? "—"} />
              <Detail label="Branch" value={selected.branch_name ?? "—"} />
              <Detail label="IP Address" value={selected.ip_address ?? "—"} />
              <Detail label="Action" value={selected.action} mono />
              <Detail label="Module" value={selected.module} />
              <Detail label="Resource" value={`${selected.resource}${selected.resource_id ? ` (${selected.resource_id})` : ""}`} />
              <Detail label="Status" value={selected.status} />
              <Detail label="Risk Level" value={selected.risk_level} />
              {selected.failure_reason && <Detail label="Failure Reason" value={selected.failure_reason} />}
              {selected.previous_values && (
                <div style={s.jsonSection}>
                  <div style={s.jsonLabel}>Previous Values</div>
                  <pre style={s.json}>{JSON.stringify(JSON.parse(selected.previous_values), null, 2)}</pre>
                </div>
              )}
              {selected.new_values && (
                <div style={s.jsonSection}>
                  <div style={s.jsonLabel}>New Values</div>
                  <pre style={s.json}>{JSON.stringify(JSON.parse(selected.new_values), null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ width: 140, fontSize: 12, fontWeight: 600, color: "#64748b", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#0f172a", fontFamily: mono ? "monospace" : undefined }}>{value}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", gap: 20 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 },
  sub: { fontSize: 13, color: "#64748b", marginTop: 4 },
  secBtn: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 },
  integrityBanner: { padding: "12px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600 },
  filters: { display: "flex", gap: 8, flexWrap: "wrap" },
  filterSelect: { padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#fff", cursor: "pointer" },
  filterInput: { padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#fff" },
  filterBtn: { padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  clearBtn: { padding: "8px 12px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer" },
  tableCard: { background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  thead: { background: "#f8fafc" },
  th: { padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#374151", textAlign: "left", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  tr: { borderBottom: "1px solid #f8fafc" },
  td: { padding: "9px 12px", color: "#374151", verticalAlign: "middle" },
  tdMono: { padding: "9px 12px", color: "#374151", fontFamily: "monospace", fontSize: 11 },
  rolePill: { fontSize: 10, background: "#eff6ff", color: "#1d4ed8", padding: "2px 6px", borderRadius: 6 },
  actionCode: { fontSize: 11, background: "#f1f5f9", padding: "2px 5px", borderRadius: 4, color: "#0f172a" },
  modPill: { fontSize: 10, background: "#f0fdf4", color: "#16a34a", padding: "2px 6px", borderRadius: 6 },
  resId: { fontSize: 10, color: "#94a3b8" },
  statusPill: { fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700 },
  riskPill: { fontSize: 10, fontWeight: 700 },
  detailBtn: { background: "#eff6ff", border: "none", color: "#3b82f6", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600 },
  loading: { padding: 40, textAlign: "center", color: "#64748b" },
  pagination: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderTop: "1px solid #f1f5f9" },
  pageBtn: { padding: "6px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 13 },
  pageInfo: { fontSize: 13, color: "#64748b" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 16, width: "90%", maxWidth: 600, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #f1f5f9" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" },
  modalBody: { overflowY: "auto", padding: "16px 24px 24px" },
  jsonSection: { marginTop: 16 },
  jsonLabel: { fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 },
  json: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, fontSize: 11, overflow: "auto", maxHeight: 200, margin: 0 },
};
