import { useState, useEffect } from "react";
import { api, useAuthStore } from "../stores";

type Tab = "staff" | "attendance" | "leave" | "shifts";

export default function StaffPage() {
  const { hasPermission } = useAuthStore();
  const [tab, setTab] = useState<Tab>("staff");

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>👥 HR Management</h1>
      </div>
      <div style={s.tabs}>
        {(["staff","attendance","leave","shifts"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
            {t === "staff" && "👤 Staff"}
            {t === "attendance" && "✅ Attendance"}
            {t === "leave" && "🌴 Leave"}
            {t === "shifts" && "🔄 Shifts"}
          </button>
        ))}
      </div>
      {tab === "staff" && <StaffList />}
      {tab === "attendance" && <AttendanceView />}
      {tab === "leave" && <LeaveView canApprove={hasPermission("hr","leave","approve")} />}
      {tab === "shifts" && <ShiftsView />}
    </div>
  );
}

// ─── Staff List ────────────────────────────────────────────────────────────────
function StaffList() {
  const { hasPermission } = useAuthStore();
  const [staff, setStaff] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showAddStaff, setShowAddStaff] = useState(false);

  const fetchStaff = async (p = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "25", ...(q ? { q } : {}), ...(roleFilter ? { roleId: roleFilter } : {}) });
      const res = await api.get<any>(`/users?${params}`);
      setStaff(res.rows ?? []);
      setTotal(res.total ?? 0);
      setPage(p);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchStaff(1); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && fetchStaff(1)} placeholder="Search staff by name or username..." style={s.searchInput} />
        <button onClick={() => fetchStaff(1)} style={s.filterBtn}>🔍</button>
        {hasPermission("hr","users","create") && (
          <button onClick={() => setShowAddStaff(true)} style={s.primaryBtn}>+ Add Staff</button>
        )}
      </div>
      <div style={s.tableCard}>
        {isLoading ? <div style={s.loading}>Loading...</div> : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Staff Member</th>
                <th style={s.th}>Username</th>
                <th style={s.th}>Role</th>
                <th style={s.th}>Branch</th>
                <th style={s.th}>Department</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Last Login</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(u => (
                <tr key={u.id} style={s.tr}>
                  <td style={s.td}>
                    <div style={s.nameCell}>
                      <div style={s.avatar}>{u.first_name?.[0]}{u.last_name?.[0]}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.first_name} {u.last_name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={s.tdMono}>{u.username}</td>
                  <td style={s.td}><span style={s.rolePill}>{u.role_display}</span></td>
                  <td style={s.td}>{u.branch_name ?? "—"}</td>
                  <td style={s.td}>{u.department_name ?? "—"}</td>
                  <td style={s.td}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: u.is_active ? "#10b981" : "#ef4444", background: u.is_active ? "#f0fdf4" : "#fef2f2", padding: "2px 8px", borderRadius: 8 }}>
                      {u.is_locked ? "🔒 Locked" : u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={s.td}>{u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}</td>
                  <td style={s.td}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button style={s.actionBtn} title="View">👁</button>
                      {hasPermission("hr","users","update") && <button style={s.actionBtn} title="Edit">✏️</button>}
                      {u.is_locked && hasPermission("hr","users","update") && (
                        <button onClick={() => api.post(`/users/${u.id}/unlock`).then(() => fetchStaff(page))} style={{ ...s.actionBtn, color: "#10b981" }} title="Unlock">🔓</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {total > 25 && (
          <div style={s.pagination}>
            <button disabled={page <= 1} onClick={() => fetchStaff(page-1)} style={s.pageBtn}>← Prev</button>
            <span style={s.pageInfo}>Page {page} · {total} total</span>
            <button onClick={() => fetchStaff(page+1)} style={s.pageBtn}>Next →</button>
          </div>
        )}
      </div>
      {showAddStaff && <AddStaffModal onClose={() => setShowAddStaff(false)} onCreated={() => { setShowAddStaff(false); fetchStaff(1); }} />}
    </div>
  );
}

// ─── Attendance View ───────────────────────────────────────────────────────────
function AttendanceView() {
  const [records, setRecords] = useState<any[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchAttendance = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<any>(`/hr/attendance?date=${date}`);
      setRecords(res.rows ?? []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchAttendance(); }, [date]);

  const statusColors: Record<string, string> = {
    present: "#10b981", absent: "#ef4444", late: "#f59e0b",
    half_day: "#6366f1", on_leave: "#8b5cf6", off: "#94a3b8", holiday: "#3b82f6",
  };

  const summary = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ fontWeight: 600, fontSize: 13 }}>Date:</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={s.dateInput} max={new Date().toISOString().split("T")[0]} />
        <button onClick={fetchAttendance} style={s.filterBtn}>Refresh</button>
      </div>
      {/* Summary pills */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.entries(summary).map(([status, count]) => (
          <div key={status} style={{ background: statusColors[status] + "18", color: statusColors[status], border: `1px solid ${statusColors[status]}33`, borderRadius: 10, padding: "6px 14px", fontSize: 13, fontWeight: 700 }}>
            {count} {status}
          </div>
        ))}
      </div>
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr style={s.thead}>
              <th style={s.th}>Staff Member</th>
              <th style={s.th}>Shift</th>
              <th style={s.th}>Clock In</th>
              <th style={s.th}>Clock Out</th>
              <th style={s.th}>Hours</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Loading...</td></tr>
            ) : records.map(r => (
              <tr key={r.id} style={s.tr}>
                <td style={s.td}><div style={{ fontWeight: 600 }}>{r.first_name} {r.last_name}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>{r.role_name}</div></td>
                <td style={s.td}>{r.shift ?? "—"}</td>
                <td style={s.tdMono}>{r.clock_in ?? "—"}</td>
                <td style={s.tdMono}>{r.clock_out ?? "—"}</td>
                <td style={s.td}>{r.hours_worked ? `${r.hours_worked}h` : "—"}</td>
                <td style={s.td}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: statusColors[r.status] ?? "#374151", background: (statusColors[r.status] ?? "#94a3b8") + "18", padding: "2px 8px", borderRadius: 8 }}>{r.status}</span>
                </td>
                <td style={s.td}>{r.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Leave View ────────────────────────────────────────────────────────────────
function LeaveView({ canApprove }: { canApprove: boolean }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [isLoading, setIsLoading] = useState(false);

  const fetchLeave = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<any>(`/hr/leave?status=${statusFilter}`);
      setRequests(res.rows ?? []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchLeave(); }, [statusFilter]);

  const handleApprove = async (id: string, approved: boolean) => {
    await api.post(`/hr/leave/${id}/${approved ? "approve" : "reject"}`);
    fetchLeave();
  };

  const LEAVE_COLORS: Record<string, string> = {
    pending: "#f59e0b", approved: "#10b981", rejected: "#ef4444", cancelled: "#94a3b8",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {["pending","approved","rejected","all"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{ padding: "7px 14px", borderRadius: 8, border: "1.5px solid", borderColor: statusFilter === s ? "#3b82f6" : "#e2e8f0", background: statusFilter === s ? "#eff6ff" : "#fff", color: statusFilter === s ? "#1d4ed8" : "#374151", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {s}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {isLoading ? <div style={s.loading}>Loading...</div> : requests.length === 0 ? (
          <div style={s.empty}>No leave requests found</div>
        ) : requests.map(r => (
          <div key={r.id} style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{r.first_name} {r.last_name}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{r.leave_type}</span> leave ·
                {r.start_date} → {r.end_date} ({r.days_requested} days)
              </div>
              {r.reason && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4, fontStyle: "italic" }}>"{r.reason}"</div>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: LEAVE_COLORS[r.status] ?? "#374151", background: (LEAVE_COLORS[r.status] ?? "#94a3b8") + "18", padding: "3px 10px", borderRadius: 10 }}>{r.status}</span>
              {r.status === "pending" && canApprove && (
                <>
                  <button onClick={() => handleApprove(r.id, true)} style={{ padding: "6px 12px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✓ Approve</button>
                  <button onClick={() => handleApprove(r.id, false)} style={{ padding: "6px 12px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>✕ Reject</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shifts View ───────────────────────────────────────────────────────────────
function ShiftsView() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [week, setWeek] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    api.get<any>(`/hr/shifts?week=${week}`).then(r => setShifts(r.rows ?? [])).catch(() => {});
  }, [week]);

  const SHIFT_COLORS: Record<string, string> = { morning: "#3b82f6", afternoon: "#f59e0b", night: "#6366f1", on_call: "#8b5cf6", overtime: "#ef4444" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ fontWeight: 600, fontSize: 13 }}>Week of:</label>
        <input type="date" value={week} onChange={e => setWeek(e.target.value)} style={s.dateInput} />
      </div>
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr style={s.thead}>
              <th style={s.th}>Staff</th>
              <th style={s.th}>Date</th>
              <th style={s.th}>Shift</th>
              <th style={s.th}>Start</th>
              <th style={s.th}>End</th>
              <th style={s.th}>Department</th>
              <th style={s.th}>Assigned By</th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>No shifts scheduled for this week</td></tr>
            ) : shifts.map(sh => (
              <tr key={sh.id} style={s.tr}>
                <td style={s.td}><div style={{ fontWeight: 600 }}>{sh.first_name} {sh.last_name}</div></td>
                <td style={s.td}>{sh.shift_date}</td>
                <td style={s.td}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: SHIFT_COLORS[sh.shift_type] ?? "#374151", background: (SHIFT_COLORS[sh.shift_type] ?? "#94a3b8") + "18", padding: "2px 8px", borderRadius: 8, textTransform: "capitalize" }}>
                    {sh.shift_type}
                  </span>
                </td>
                <td style={s.tdMono}>{sh.start_time}</td>
                <td style={s.tdMono}>{sh.end_time}</td>
                <td style={s.td}>{sh.department_name ?? "—"}</td>
                <td style={s.td}>{sh.assigned_by_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Add Staff Modal ───────────────────────────────────────────────────────────
function AddStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", username: "", email: "", password: "", roleId: "", branchId: "", departmentId: "" });
  const [roles, setRoles] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<any>("/roles").then(r => setRoles(r.roles ?? [])).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (!form.firstName || !form.lastName || !form.username || !form.email || !form.password || !form.roleId) {
      return setError("All fields marked * are required");
    }
    setIsSaving(true);
    try {
      await api.post("/users", form);
      onCreated();
    } catch (err) { setError((err as Error).message); setIsSaving(false); }
  };

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );

  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, maxWidth: 500 }}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>👤 Add Staff Member</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <F label="First Name *"><input value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} style={s.inp} /></F>
            <F label="Last Name *"><input value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} style={s.inp} /></F>
          </div>
          <F label="Username *"><input value={form.username} onChange={e => setForm({...form, username: e.target.value})} style={s.inp} /></F>
          <F label="Email *"><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} style={s.inp} /></F>
          <F label="Temporary Password *"><input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} style={s.inp} placeholder="Min 8 chars, uppercase, number, symbol" /></F>
          <F label="Role *">
            <select value={form.roleId} onChange={e => setForm({...form, roleId: e.target.value})} style={s.inp}>
              <option value="">Select role...</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.display_name}</option>)}
            </select>
          </F>
          {error && <div style={s.errorBox}>⚠️ {error}</div>}
          <div style={{ fontSize: 12, color: "#94a3b8" }}>ℹ️ Staff member will be required to change their password on first login.</div>
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSaving} style={s.primaryBtn}>
            {isSaving ? "Creating..." : "✓ Create Staff Account"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", gap: 20 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 },
  primaryBtn: { background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  cancelBtn: { background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  tabs: { display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4, width: "fit-content" },
  tab: { padding: "8px 16px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#64748b" },
  tabActive: { background: "#fff", color: "#1d4ed8", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  searchInput: { flex: 1, padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, outline: "none", background: "#fff" },
  filterBtn: { padding: "9px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  dateInput: { padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13 },
  tableCard: { background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: "#f8fafc" },
  th: { padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#374151", textAlign: "left", borderBottom: "1px solid #e2e8f0" },
  tr: { borderBottom: "1px solid #f8fafc" },
  td: { padding: "10px 14px", fontSize: 13, color: "#374151", verticalAlign: "middle" },
  tdMono: { padding: "10px 14px", fontSize: 12, fontFamily: "monospace" },
  nameCell: { display: "flex", alignItems: "center", gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 },
  rolePill: { fontSize: 10, background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 8, fontWeight: 600 },
  actionBtn: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  loading: { padding: 40, textAlign: "center", color: "#64748b" },
  empty: { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 },
  pagination: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderTop: "1px solid #f1f5f9" },
  pageBtn: { padding: "6px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 13 },
  pageInfo: { fontSize: 13, color: "#64748b" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 16, width: "90%", maxWidth: 500, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #f1f5f9" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" },
  modalBody: { overflowY: "auto", padding: "20px 24px" },
  modalFooter: { display: "flex", gap: 10, justifyContent: "flex-end", padding: "16px 24px", borderTop: "1px solid #f1f5f9" },
  inp: { padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#f8fafc", outline: "none", width: "100%", boxSizing: "border-box" as const },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 8 },
};
