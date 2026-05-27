import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { api, useAuthStore } from "../stores";

type Tab = "active" | "today" | "all";

interface Visit {
  id: string;
  visit_number: string;
  patient_name: string;
  patient_number: string;
  visit_type: string;
  triage_level: number | null;
  chief_complaint: string | null;
  status: string;
  department_name: string | null;
  doctor_name: string | null;
  check_in_time: string;
  check_out_time: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active:      { bg: "#eff6ff", text: "#1d4ed8" },
  admitted:    { bg: "#f0fdf4", text: "#16a34a" },
  discharged:  { bg: "#f1f5f9", text: "#64748b" },
  transferred: { bg: "#fff7ed", text: "#c2410c" },
  absconded:   { bg: "#fef2f2", text: "#dc2626" },
  deceased:    { bg: "#0f172a", text: "#fff" },
};

const TRIAGE_CONFIG: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "Immediate", color: "#fff",     bg: "#dc2626" },
  2: { label: "Urgent",    color: "#fff",     bg: "#f97316" },
  3: { label: "Less Urgent",color: "#0f172a", bg: "#fbbf24" },
  4: { label: "Non-Urgent", color: "#fff",    bg: "#22c55e" },
  5: { label: "Deceased",   color: "#fff",    bg: "#94a3b8" },
};

const VISIT_TYPES = ["opd","ipd","emergency","day_case","referral"];

export default function VisitsPage() {
  const { hasPermission, user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledPatient = searchParams.get("patientId");

  const [tab, setTab] = useState<Tab>("active");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [showNewVisit, setShowNewVisit] = useState(!!prefilledPatient);
  const [filters, setFilters] = useState({ status: tab === "active" ? "active" : "", date: tab === "today" ? new Date().toISOString().split("T")[0] : "" });

  const fetchVisits = async (p = 1, extraFilters: Record<string,string> = {}) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p), pageSize: "30",
        ...Object.fromEntries(Object.entries({ ...filters, ...extraFilters }).filter(([,v]) => v)),
      });
      const res = await api.get<any>(`/visits?${params}`);
      setVisits(res.rows ?? []);
      setTotal(res.total ?? 0);
      setPage(p);
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    const f: Record<string,string> = {};
    if (tab === "active") f.status = "active";
    if (tab === "today") f.date = new Date().toISOString().split("T")[0];
    setFilters(f);
    fetchVisits(1, f);
  }, [tab]);

  const handleCloseVisit = async (visitId: string) => {
    await api.put(`/visits/${visitId}`, { status: "discharged" });
    fetchVisits(page);
  };

  // Compute stats
  const triageCounts = visits.reduce((acc, v) => {
    if (v.triage_level) acc[v.triage_level] = (acc[v.triage_level] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🩺 OPD Visits</h1>
          <p style={s.sub}>{total.toLocaleString()} visits</p>
        </div>
        {hasPermission("clinical", "visits", "create") && (
          <button onClick={() => setShowNewVisit(true)} style={s.primaryBtn}>+ New Visit</button>
        )}
      </div>

      {/* Triage board (active tab) */}
      {tab === "active" && visits.some(v => v.triage_level) && (
        <div style={s.triageBoard}>
          {[1,2,3,4].map(level => {
            const cfg = TRIAGE_CONFIG[level];
            const count = triageCounts[level] ?? 0;
            return (
              <div key={level} style={{ ...s.triageCard, background: cfg.bg }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: cfg.color }}>{count}</div>
                <div style={{ fontSize: 11, color: cfg.color, opacity: 0.85, marginTop: 2 }}>Level {level}: {cfg.label}</div>
              </div>
            );
          })}
          <div style={{ ...s.triageCard, background: "#6366f1" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{visits.length}</div>
            <div style={{ fontSize: 11, color: "#fff", opacity: 0.85, marginTop: 2 }}>Total Active</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={s.tabs}>
        {(["active","today","all"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
            {t === "active" && "🔴 Active Visits"}
            {t === "today" && "📅 Today's Visits"}
            {t === "all" && "📋 All Visits"}
          </button>
        ))}
      </div>

      {/* Visit List + Detail */}
      <div style={s.splitLayout}>
        {/* List */}
        <div style={s.listPanel}>
          {isLoading ? (
            <div style={s.loading}>Loading visits...</div>
          ) : visits.length === 0 ? (
            <div style={s.empty}>No visits found</div>
          ) : visits.map(v => {
            const sc = STATUS_COLORS[v.status] ?? STATUS_COLORS.active;
            const tc = v.triage_level ? TRIAGE_CONFIG[v.triage_level] : null;
            return (
              <div
                key={v.id}
                onClick={() => setSelectedVisit(v)}
                style={{ ...s.visitCard, ...(selectedVisit?.id === v.id ? s.visitCardActive : {}) }}
              >
                <div style={s.visitTop}>
                  <code style={s.visitNum}>{v.visit_number}</code>
                  <div style={{ display: "flex", gap: 4 }}>
                    {tc && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: tc.color, background: tc.bg, padding: "1px 6px", borderRadius: 6 }}>
                        T{v.triage_level}
                      </span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 600, color: sc.text, background: sc.bg, padding: "1px 8px", borderRadius: 8 }}>
                      {v.status}
                    </span>
                  </div>
                </div>
                <div style={s.visitPatient}>{v.patient_name}</div>
                <div style={s.visitMeta}>
                  {v.patient_number} · {v.visit_type.toUpperCase()}
                  {v.doctor_name && <> · Dr. {v.doctor_name}</>}
                </div>
                {v.chief_complaint && (
                  <div style={s.visitComplaint}>"{v.chief_complaint}"</div>
                )}
                <div style={s.visitTime}>
                  {new Date(v.check_in_time).toLocaleTimeString()}
                  {v.department_name && <> · {v.department_name}</>}
                </div>
              </div>
            );
          })}
          {total > 30 && (
            <div style={s.pagination}>
              <button disabled={page <= 1} onClick={() => fetchVisits(page-1)} style={s.pageBtn}>←</button>
              <span style={s.pageInfo}>Page {page}</span>
              <button onClick={() => fetchVisits(page+1)} style={s.pageBtn}>→</button>
            </div>
          )}
        </div>

        {/* Detail */}
        <div style={s.detailPanel}>
          {!selectedVisit ? (
            <div style={s.detailEmpty}>
              <div style={{ fontSize: 48 }}>🩺</div>
              <p style={{ color: "#94a3b8", marginTop: 12 }}>Select a visit to view encounter details</p>
            </div>
          ) : (
            <VisitDetail
              visit={selectedVisit}
              onClose={() => handleCloseVisit(selectedVisit.id)}
              onNavigate={(path) => navigate(path)}
              canEdit={hasPermission("clinical", "visits", "update")}
            />
          )}
        </div>
      </div>

      {/* New Visit Modal */}
      {showNewVisit && (
        <NewVisitModal
          prefilledPatientId={prefilledPatient ?? ""}
          onClose={() => setShowNewVisit(false)}
          onCreated={(id, num) => {
            setShowNewVisit(false);
            fetchVisits(1);
            navigate(`/visits?highlight=${id}`);
          }}
        />
      )}
    </div>
  );
}

// ─── Visit Detail Panel ────────────────────────────────────────────────────────
function VisitDetail({ visit, onClose, onNavigate, canEdit }: {
  visit: Visit; onClose: () => void;
  onNavigate: (path: string) => void; canEdit: boolean;
}) {
  const [notes, setNotes] = useState<any[]>([]);
  const [diagnoses, setDiagnoses] = useState<any[]>([]);
  const [vitals, setVitals] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"notes"|"diagnoses"|"vitals">("notes");
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteForm, setNoteForm] = useState({ noteType: "progress", content: "" });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Fetch visit-related data
    api.get<any>(`/visits/${visit.id}/notes`).then(r => setNotes(r.notes ?? [])).catch(() => {});
    api.get<any>(`/visits/${visit.id}/diagnoses`).then(r => setDiagnoses(r.diagnoses ?? [])).catch(() => {});
  }, [visit.id]);

  const handleAddNote = async () => {
    setIsSaving(true);
    try {
      await api.post(`/visits/${visit.id}/notes`, noteForm);
      const r = await api.get<any>(`/visits/${visit.id}/notes`);
      setNotes(r.notes ?? []);
      setShowAddNote(false);
      setNoteForm({ noteType: "progress", content: "" });
    } finally { setIsSaving(false); }
  };

  const sc = STATUS_COLORS[visit.status] ?? STATUS_COLORS.active;

  return (
    <div style={s.detail}>
      {/* Header */}
      <div style={s.detailHeader}>
        <div>
          <code style={s.detailNum}>{visit.visit_number}</code>
          <h3 style={s.detailPatient}>{visit.patient_name}</h3>
          <p style={s.detailMeta}>
            {visit.patient_number} · {visit.visit_type.toUpperCase()}
            {visit.doctor_name && <> · Dr. {visit.doctor_name}</>}
          </p>
          {visit.chief_complaint && (
            <p style={{ fontSize: 13, color: "#374151", fontStyle: "italic", marginTop: 4 }}>
              Chief complaint: {visit.chief_complaint}
            </p>
          )}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: sc.text, background: sc.bg, padding: "4px 12px", borderRadius: 12 }}>
          {visit.status}
        </span>
      </div>

      {/* Quick actions */}
      <div style={s.quickActions}>
        <button onClick={() => onNavigate(`/patients/${visit.id}`)} style={s.qBtn}>👤 Patient File</button>
        <button onClick={() => onNavigate(`/lab/request?visitId=${visit.id}`)} style={s.qBtn}>🧪 Lab Request</button>
        <button onClick={() => onNavigate(`/prescriptions/new?visitId=${visit.id}`)} style={s.qBtn}>💊 Prescribe</button>
        <button onClick={() => onNavigate(`/billing/new?visitId=${visit.id}`)} style={s.qBtn}>🧾 Invoice</button>
        {visit.status === "active" && canEdit && (
          <button onClick={onClose} style={{ ...s.qBtn, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
            ✓ Close Visit
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={s.detailTabs}>
        {(["notes","diagnoses","vitals"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ ...s.detailTab, ...(activeTab === t ? s.detailTabActive : {}) }}>
            {t === "notes" && "📝 Notes"}
            {t === "diagnoses" && "🔍 Diagnoses"}
            {t === "vitals" && "📊 Vitals"}
          </button>
        ))}
      </div>

      {/* Notes */}
      {activeTab === "notes" && (
        <div style={s.tabContent}>
          {canEdit && (
            <button onClick={() => setShowAddNote(!showAddNote)} style={s.addBtn}>+ Add Note</button>
          )}
          {showAddNote && (
            <div style={s.noteForm}>
              <select value={noteForm.noteType} onChange={e => setNoteForm({...noteForm, noteType: e.target.value})} style={s.noteSelect}>
                {["history","examination","assessment","plan","progress","soap","procedure","nursing"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <textarea
                value={noteForm.content}
                onChange={e => setNoteForm({...noteForm, content: e.target.value})}
                style={s.noteTextarea}
                placeholder="Enter clinical note..."
                rows={4}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleAddNote} disabled={isSaving || !noteForm.content} style={s.saveBtn}>
                  {isSaving ? "Saving..." : "Save Note"}
                </button>
                <button onClick={() => setShowAddNote(false)} style={s.cancelSmBtn}>Cancel</button>
              </div>
            </div>
          )}
          {notes.length === 0 ? (
            <div style={s.tabEmpty}>No clinical notes recorded yet</div>
          ) : notes.map((note: any) => (
            <div key={note.id} style={s.noteCard}>
              <div style={s.noteHeader}>
                <span style={s.noteType}>{note.note_type}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {note.is_signed && <span style={s.signedBadge}>✓ Signed</span>}
                  <span style={s.noteTime}>{new Date(note.created_at).toLocaleString()}</span>
                </div>
              </div>
              <p style={s.noteContent}>{note.content}</p>
              <div style={s.noteFooter}>By: {note.created_by_name ?? "Unknown"}</div>
            </div>
          ))}
        </div>
      )}

      {/* Diagnoses */}
      {activeTab === "diagnoses" && (
        <div style={s.tabContent}>
          {diagnoses.length === 0 ? (
            <div style={s.tabEmpty}>No diagnoses recorded</div>
          ) : diagnoses.map((d: any) => (
            <div key={d.id} style={s.diagCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  {d.icd10_code && <code style={s.icdCode}>{d.icd10_code}</code>}
                  <div style={s.diagText}>{d.diagnosis_text}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ ...s.diagTypePill, ...(d.is_primary ? s.primaryDiag : {}) }}>
                    {d.is_primary ? "Primary" : d.diagnosis_type}
                  </span>
                  {d.severity && <span style={s.severityPill}>{d.severity}</span>}
                </div>
              </div>
              {d.notes && <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{d.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Vitals */}
      {activeTab === "vitals" && (
        <div style={s.tabContent}>
          <div style={s.tabEmpty}>Vitals displayed from patient record</div>
        </div>
      )}
    </div>
  );
}

// ─── New Visit Modal ───────────────────────────────────────────────────────────
function NewVisitModal({ prefilledPatientId, onClose, onCreated }: {
  prefilledPatientId: string;
  onClose: () => void;
  onCreated: (id: string, num: string) => void;
}) {
  const { user } = useAuthStore();
  const [form, setForm] = useState({
    patientId: prefilledPatientId, visitType: "opd", chiefComplaint: "",
    triageLevel: "", departmentId: "", doctorId: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!form.patientId) return setError("Patient ID is required");
    if (!form.chiefComplaint) return setError("Chief complaint is required");
    setIsSaving(true);
    try {
      const res = await api.post<{ id: string; visitNumber: string }>("/visits", {
        patientId: form.patientId,
        visitType: form.visitType,
        chiefComplaint: form.chiefComplaint,
        triageLevel: form.triageLevel ? Number(form.triageLevel) : null,
        departmentId: form.departmentId || null,
        doctorId: form.doctorId || user?.id,
      });
      onCreated(res.id, res.visitNumber);
    } catch (err) {
      setError((err as Error).message);
      setIsSaving(false);
    }
  };

  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, maxWidth: 480 }}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>🩺 Start New Visit</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <Row2>
            <F label="Patient ID *">
              <input value={form.patientId} onChange={e => setForm({...form, patientId: e.target.value})} style={s.inp} placeholder="Patient UUID" />
            </F>
            <F label="Visit Type">
              <select value={form.visitType} onChange={e => setForm({...form, visitType: e.target.value})} style={s.inp}>
                {VISIT_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </F>
          </Row2>
          <F label="Chief Complaint *">
            <input value={form.chiefComplaint} onChange={e => setForm({...form, chiefComplaint: e.target.value})} style={s.inp} placeholder="e.g. Chest pain for 2 hours" />
          </F>
          <Row2>
            <F label="Triage Level">
              <select value={form.triageLevel} onChange={e => setForm({...form, triageLevel: e.target.value})} style={s.inp}>
                <option value="">None</option>
                <option value="1">1 - Immediate (Red)</option>
                <option value="2">2 - Urgent (Orange)</option>
                <option value="3">3 - Less Urgent (Yellow)</option>
                <option value="4">4 - Non-Urgent (Green)</option>
                <option value="5">5 - Deceased (Blue)</option>
              </select>
            </F>
            <F label="Doctor ID">
              <input value={form.doctorId} onChange={e => setForm({...form, doctorId: e.target.value})} style={s.inp} placeholder="Leave blank for self" />
            </F>
          </Row2>
          {error && <div style={s.errorBox}>⚠️ {error}</div>}
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSaving} style={s.primaryBtn}>
            {isSaving ? "Starting..." : "✓ Start Visit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Form helpers ─────────────────────────────────────────────────────────────
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}
function Row2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
}

const s: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", gap: 20 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 },
  sub: { fontSize: 13, color: "#64748b", marginTop: 4 },
  primaryBtn: { background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  cancelBtn: { background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  triageBoard: { display: "flex", gap: 12 },
  triageCard: { flex: 1, borderRadius: 12, padding: "14px 16px", textAlign: "center" },
  tabs: { display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4, width: "fit-content" },
  tab: { padding: "8px 16px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#64748b" },
  tabActive: { background: "#fff", color: "#1d4ed8", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  splitLayout: { display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, alignItems: "start" },
  listPanel: { display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 300px)", overflowY: "auto" },
  visitCard: { background: "#fff", borderRadius: 12, padding: "12px 14px", cursor: "pointer", border: "1.5px solid transparent", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "all 0.15s" },
  visitCardActive: { border: "1.5px solid #3b82f6", boxShadow: "0 0 0 3px #bfdbfe" },
  visitTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  visitNum: { fontSize: 10, color: "#6b7280", background: "#f1f5f9", padding: "1px 5px", borderRadius: 3 },
  visitPatient: { fontWeight: 700, color: "#0f172a", fontSize: 14, marginBottom: 2 },
  visitMeta: { fontSize: 11, color: "#94a3b8", marginBottom: 4 },
  visitComplaint: { fontSize: 12, color: "#374151", fontStyle: "italic", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  visitTime: { fontSize: 10, color: "#94a3b8" },
  detailPanel: { background: "#fff", borderRadius: 14, minHeight: 500, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  detailEmpty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, color: "#94a3b8" },
  detail: { display: "flex", flexDirection: "column" },
  detailHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9" },
  detailNum: { fontSize: 10, color: "#6b7280", background: "#f1f5f9", padding: "1px 5px", borderRadius: 3, marginBottom: 4, display: "block" },
  detailPatient: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" },
  detailMeta: { fontSize: 12, color: "#64748b", margin: 0 },
  quickActions: { display: "flex", gap: 8, padding: "12px 24px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" },
  qBtn: { fontSize: 12, padding: "6px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontWeight: 600, color: "#374151" },
  detailTabs: { display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0" },
  detailTab: { padding: "12px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#64748b", borderBottom: "2px solid transparent" },
  detailTabActive: { color: "#1d4ed8", borderBottom: "2px solid #3b82f6" },
  tabContent: { padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12, maxHeight: 420, overflowY: "auto" },
  tabEmpty: { textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 24 },
  addBtn: { background: "#eff6ff", border: "none", color: "#3b82f6", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: 8, alignSelf: "flex-start" },
  noteForm: { background: "#f8fafc", borderRadius: 10, padding: 14, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 },
  noteSelect: { padding: "7px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 13, background: "#fff" },
  noteTextarea: { padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 13, resize: "vertical", fontFamily: "inherit" },
  saveBtn: { padding: "8px 16px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700 },
  cancelSmBtn: { padding: "8px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, cursor: "pointer", fontSize: 13 },
  noteCard: { background: "#f8fafc", borderRadius: 10, padding: "12px 14px", border: "1px solid #e2e8f0" },
  noteHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  noteType: { fontSize: 11, fontWeight: 700, background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 6, textTransform: "uppercase" },
  signedBadge: { fontSize: 10, color: "#10b981", fontWeight: 700 },
  noteTime: { fontSize: 10, color: "#94a3b8" },
  noteContent: { fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.6 },
  noteFooter: { fontSize: 11, color: "#94a3b8", marginTop: 6 },
  diagCard: { background: "#f8fafc", borderRadius: 10, padding: "12px 14px", border: "1px solid #e2e8f0" },
  icdCode: { fontSize: 11, background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, color: "#6b7280", display: "inline-block", marginBottom: 4 },
  diagText: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  diagTypePill: { fontSize: 10, background: "#f1f5f9", color: "#64748b", padding: "2px 8px", borderRadius: 8, fontWeight: 600 },
  primaryDiag: { background: "#eff6ff", color: "#1d4ed8" },
  severityPill: { fontSize: 10, background: "#fff7ed", color: "#c2410c", padding: "2px 8px", borderRadius: 8, fontWeight: 600 },
  loading: { padding: 40, textAlign: "center", color: "#64748b" },
  empty: { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 },
  pagination: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" },
  pageBtn: { background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px", cursor: "pointer" },
  pageInfo: { fontSize: 12, color: "#64748b" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 16, width: "90%", maxWidth: 480, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #f1f5f9" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" },
  modalBody: { overflowY: "auto", padding: "20px 24px" },
  modalFooter: { display: "flex", gap: 10, justifyContent: "flex-end", padding: "16px 24px", borderTop: "1px solid #f1f5f9" },
  inp: { padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#f8fafc", outline: "none", width: "100%", boxSizing: "border-box" as const },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c" },
};
