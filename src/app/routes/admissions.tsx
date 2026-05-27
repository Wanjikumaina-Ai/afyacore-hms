import { useState, useEffect } from "react";
import { api, useAuthStore } from "../stores";

type Tab = "bed_board" | "admissions" | "admit";

interface Bed {
  id: string;
  bed_number: string;
  ward_name: string;
  ward_type: string;
  bed_type: string;
  status: string;
  current_patient: string | null;
  features: string | null;
}

interface Admission {
  id: string;
  admission_number: string;
  patient_name: string;
  patient_number: string;
  ward_name: string;
  bed_number: string;
  admitting_doctor_name: string;
  admitting_diagnosis: string;
  admission_type: string;
  admission_datetime: string;
  expected_discharge: string | null;
  status: string;
  length_of_stay: number | null;
}

const BED_STATUS_COLORS: Record<string, string> = {
  available: "#10b981",
  occupied:  "#ef4444",
  reserved:  "#f59e0b",
  maintenance: "#94a3b8",
  dirty:     "#f97316",
};

const BED_STATUS_BG: Record<string, string> = {
  available: "#f0fdf4",
  occupied:  "#fef2f2",
  reserved:  "#fffbeb",
  maintenance: "#f1f5f9",
  dirty:     "#fff7ed",
};

export default function AdmissionsPage() {
  const { hasPermission } = useAuthStore();
  const [tab, setTab] = useState<Tab>("bed_board");
  const [beds, setBeds] = useState<Bed[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null);
  const [selectedAdmission, setSelectedAdmission] = useState<Admission | null>(null);
  const [showAdmitForm, setShowAdmitForm] = useState(false);
  const [showDischargeForm, setShowDischargeForm] = useState(false);
  const [wardFilter, setWardFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Summary
  const bedStats = {
    total: beds.length,
    available: beds.filter(b => b.status === "available").length,
    occupied: beds.filter(b => b.status === "occupied").length,
    dirty: beds.filter(b => b.status === "dirty").length,
    maintenance: beds.filter(b => b.status === "maintenance").length,
  };
  const occupancyRate = bedStats.total > 0 ? Math.round((bedStats.occupied / bedStats.total) * 100) : 0;

  const fetchBeds = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ ...(wardFilter ? { wardId: wardFilter } : {}), ...(statusFilter ? { status: statusFilter } : {}) });
      const res = await api.get<any>(`/admissions/beds?${params}`);
      setBeds(res.beds ?? []);
    } finally { setIsLoading(false); }
  };

  const fetchAdmissions = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<any>("/admissions?status=active&pageSize=50");
      setAdmissions(res.rows ?? []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (tab === "bed_board") fetchBeds();
    if (tab === "admissions") fetchAdmissions();
  }, [tab, wardFilter, statusFilter]);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🛏 Inpatient Management</h1>
          <p style={s.sub}>Bed occupancy: {occupancyRate}% ({bedStats.occupied}/{bedStats.total} beds)</p>
        </div>
        {hasPermission("clinical","admissions","create") && (
          <button onClick={() => setShowAdmitForm(true)} style={s.primaryBtn}>+ Admit Patient</button>
        )}
      </div>

      {/* Occupancy summary */}
      <div style={{ display: "flex", gap: 12 }}>
        {[
          { label: "Available", count: bedStats.available, color: "#10b981" },
          { label: "Occupied", count: bedStats.occupied, color: "#ef4444" },
          { label: "Needs Cleaning", count: bedStats.dirty, color: "#f97316" },
          { label: "Maintenance", count: bedStats.maintenance, color: "#94a3b8" },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", borderRadius: 10, padding: "12px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", borderLeft: `4px solid ${c.color}`, minWidth: 120 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.count}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
        {/* Occupancy bar */}
        <div style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "12px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Bed Occupancy Rate</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: occupancyRate > 85 ? "#ef4444" : occupancyRate > 70 ? "#f59e0b" : "#10b981" }}>{occupancyRate}%</span>
          </div>
          <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${occupancyRate}%`, background: occupancyRate > 85 ? "#ef4444" : occupancyRate > 70 ? "#f59e0b" : "#10b981", borderRadius: 4, transition: "width 0.5s" }} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {(["bed_board","admissions"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
            {t === "bed_board" && "🛏 Bed Board"}
            {t === "admissions" && "📋 Active Admissions"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8 }}>
        {tab === "bed_board" && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={s.select}>
            <option value="">All Statuses</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="dirty">Dirty</option>
            <option value="maintenance">Maintenance</option>
          </select>
        )}
      </div>

      {/* Bed Board */}
      {tab === "bed_board" && (
        <div>
          {isLoading ? <div style={s.loading}>Loading beds...</div> : (
            <BedBoard beds={beds} onSelect={setSelectedBed} selected={selectedBed} onMarkClean={(id) => {
              api.put(`/admissions/beds/${id}`, { status: "available" }).then(fetchBeds);
            }} />
          )}
        </div>
      )}

      {/* Admissions List */}
      {tab === "admissions" && (
        <div style={s.splitLayout}>
          <div style={s.listPanel}>
            {isLoading ? <div style={s.loading}>Loading...</div> : admissions.length === 0 ? (
              <div style={s.empty}>No active admissions</div>
            ) : admissions.map(a => (
              <div key={a.id} onClick={() => setSelectedAdmission(a)} style={{ ...s.admCard, ...(selectedAdmission?.id === a.id ? s.admCardActive : {}) }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <code style={s.admNum}>{a.admission_number}</code>
                  <span style={{ fontSize: 10, color: "#64748b" }}>Day {daysSince(a.admission_datetime)}</span>
                </div>
                <div style={s.admPatient}>{a.patient_name}</div>
                <div style={{ fontSize: 12, color: "#374151", marginTop: 2, fontWeight: 500 }}>{a.admitting_diagnosis}</div>
                <div style={s.admMeta}>
                  🛏 {a.ward_name} · Bed {a.bed_number}
                  {a.expected_discharge && <> · D/C: {new Date(a.expected_discharge).toLocaleDateString()}</>}
                </div>
              </div>
            ))}
          </div>
          <div style={s.detailPanel}>
            {!selectedAdmission ? (
              <div style={s.detailEmpty}>
                <div style={{ fontSize: 48 }}>🛏</div>
                <p style={{ color: "#94a3b8", marginTop: 12 }}>Select an admission to view details</p>
              </div>
            ) : (
              <AdmissionDetail
                admission={selectedAdmission}
                canDischarge={hasPermission("clinical","admissions","update")}
                onDischarge={() => { setShowDischargeForm(true); }}
                onRefresh={fetchAdmissions}
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdmitForm && (
        <AdmitPatientModal
          availableBeds={beds.filter(b => b.status === "available")}
          onClose={() => setShowAdmitForm(false)}
          onAdmitted={() => { setShowAdmitForm(false); fetchBeds(); fetchAdmissions(); }}
        />
      )}
      {showDischargeForm && selectedAdmission && (
        <DischargeModal
          admission={selectedAdmission}
          onClose={() => setShowDischargeForm(false)}
          onDischarged={() => { setShowDischargeForm(false); fetchAdmissions(); setSelectedAdmission(null); }}
        />
      )}
    </div>
  );
}

// ─── Bed Board Grid ────────────────────────────────────────────────────────────
function BedBoard({ beds, onSelect, selected, onMarkClean }: {
  beds: Bed[]; onSelect: (b: Bed) => void;
  selected: Bed | null; onMarkClean: (id: string) => void;
}) {
  const wards = [...new Set(beds.map(b => b.ward_name))].sort();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {wards.map(ward => (
        <div key={ward}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#374151", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            🏥 {ward}
            <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>
              ({beds.filter(b => b.ward_name === ward && b.status === "available").length} available)
            </span>
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            {beds.filter(b => b.ward_name === ward).map(bed => (
              <div
                key={bed.id}
                onClick={() => onSelect(bed)}
                style={{
                  ...s.bedCard,
                  background: BED_STATUS_BG[bed.status] ?? "#f8fafc",
                  borderColor: selected?.id === bed.id ? "#3b82f6" : BED_STATUS_COLORS[bed.status] + "40",
                  boxShadow: selected?.id === bed.id ? "0 0 0 2px #3b82f6" : undefined,
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>🛏</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>Bed {bed.bed_number}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: BED_STATUS_COLORS[bed.status], marginTop: 2, textTransform: "capitalize" }}>
                  {bed.status}
                </div>
                {bed.current_patient && (
                  <div style={{ fontSize: 10, color: "#374151", marginTop: 4, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
                    {bed.current_patient}
                  </div>
                )}
                {bed.status === "dirty" && (
                  <button
                    onClick={e => { e.stopPropagation(); onMarkClean(bed.id); }}
                    style={{ marginTop: 6, fontSize: 10, padding: "2px 8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}
                  >
                    ✓ Mark Clean
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Admission Detail Panel ────────────────────────────────────────────────────
function AdmissionDetail({ admission, canDischarge, onDischarge, onRefresh }: {
  admission: Admission; canDischarge: boolean;
  onDischarge: () => void; onRefresh: () => void;
}) {
  const los = daysSince(admission.admission_datetime);
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" }}>
        <div>
          <code style={s.admNum}>{admission.admission_number}</code>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "4px 0 2px" }}>{admission.patient_name}</h3>
          <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>{admission.patient_number}</p>
        </div>
        {canDischarge && (
          <button onClick={onDischarge} style={{ padding: "8px 16px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
            ✓ Discharge
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[
          { label: "Ward", value: `${admission.ward_name} · Bed ${admission.bed_number}` },
          { label: "Admission Type", value: admission.admission_type },
          { label: "Doctor", value: admission.admitting_doctor_name },
          { label: "Days Admitted", value: `${los} day${los !== 1 ? "s" : ""}` },
          { label: "Admitted", value: new Date(admission.admission_datetime).toLocaleString() },
          { label: "Expected D/C", value: admission.expected_discharge ? new Date(admission.expected_discharge).toLocaleDateString() : "Not set" },
        ].map(item => (
          <div key={item.label} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{item.value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, background: "#eff6ff", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 700, marginBottom: 4 }}>ADMITTING DIAGNOSIS</div>
        <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 600 }}>{admission.admitting_diagnosis}</div>
      </div>
    </div>
  );
}

// ─── Admit Patient Modal ───────────────────────────────────────────────────────
function AdmitPatientModal({ availableBeds, onClose, onAdmitted }: {
  availableBeds: Bed[]; onClose: () => void; onAdmitted: () => void;
}) {
  const { user } = useAuthStore();
  const [form, setForm] = useState({ patientId: "", visitId: "", bedId: "", wardId: "", admittingDiagnosis: "", admissionType: "elective", expectedDischarge: "", notes: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedBed = availableBeds.find(b => b.id === form.bedId);

  const handleSubmit = async () => {
    setError("");
    if (!form.patientId || !form.bedId || !form.admittingDiagnosis) return setError("Patient, bed, and diagnosis are required");
    setIsSaving(true);
    try {
      await api.post("/admissions", { ...form, doctorId: user?.id });
      onAdmitted();
    } catch (err) { setError((err as Error).message); setIsSaving(false); }
  };

  const wardOptions = [...new Set(availableBeds.map(b => b.ward_name))].sort();
  const filteredBeds = form.wardId ? availableBeds.filter(b => b.ward_name === form.wardId) : availableBeds;

  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, maxWidth: 540 }}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>🛏 Admit Patient</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <F label="Patient ID *"><input value={form.patientId} onChange={e => setForm({...form, patientId: e.target.value})} style={s.inp} placeholder="Patient UUID" /></F>
            <F label="Visit ID"><input value={form.visitId} onChange={e => setForm({...form, visitId: e.target.value})} style={s.inp} placeholder="Link to existing visit" /></F>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <F label="Ward">
                <select value={form.wardId} onChange={e => setForm({...form, wardId: e.target.value, bedId: ""})} style={s.inp}>
                  <option value="">All Wards</option>
                  {wardOptions.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </F>
              <F label="Bed *">
                <select value={form.bedId} onChange={e => setForm({...form, bedId: e.target.value})} style={s.inp}>
                  <option value="">Select available bed...</option>
                  {filteredBeds.map(b => <option key={b.id} value={b.id}>{b.ward_name} · Bed {b.bed_number} ({b.bed_type})</option>)}
                </select>
              </F>
            </div>
            {selectedBed && (
              <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
                ✓ Selected: {selectedBed.ward_name} · Bed {selectedBed.bed_number}
              </div>
            )}
            <F label="Admission Type">
              <select value={form.admissionType} onChange={e => setForm({...form, admissionType: e.target.value})} style={s.inp}>
                <option value="elective">Elective</option>
                <option value="emergency">Emergency</option>
                <option value="transfer_in">Transfer In</option>
                <option value="direct">Direct Admission</option>
              </select>
            </F>
            <F label="Admitting Diagnosis *">
              <textarea value={form.admittingDiagnosis} onChange={e => setForm({...form, admittingDiagnosis: e.target.value})} style={{ ...s.inp, height: 70, resize: "vertical" }} placeholder="Primary diagnosis for admission..." />
            </F>
            <F label="Expected Discharge Date">
              <input type="date" value={form.expectedDischarge} onChange={e => setForm({...form, expectedDischarge: e.target.value})} style={s.inp} min={new Date().toISOString().split("T")[0]} />
            </F>
            {error && <div style={s.errorBox}>⚠️ {error}</div>}
          </div>
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSaving} style={s.primaryBtn}>{isSaving ? "Admitting..." : "✓ Admit Patient"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Discharge Modal ───────────────────────────────────────────────────────────
function DischargeModal({ admission, onClose, onDischarged }: {
  admission: Admission; onClose: () => void; onDischarged: () => void;
}) {
  const [form, setForm] = useState({ dischargeCondition: "improved", dischargeDiagnosis: admission.admitting_diagnosis, dischargeSummary: "", followUpDate: "", followUpInstructions: "" });
  const [isSaving, setIsSaving] = useState(false);

  const handleDischarge = async () => {
    setIsSaving(true);
    try {
      await api.post(`/admissions/${admission.id}/discharge`, form);
      onDischarged();
    } catch (err) { alert((err as Error).message); setIsSaving(false); }
  };

  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, maxWidth: 500 }}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>✓ Discharge — {admission.patient_name}</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <F label="Discharge Condition *">
              <select value={form.dischargeCondition} onChange={e => setForm({...form, dischargeCondition: e.target.value})} style={s.inp}>
                <option value="improved">Improved</option>
                <option value="stable">Stable</option>
                <option value="critical">Critical</option>
                <option value="transferred">Transferred</option>
                <option value="absconded">Absconded</option>
                <option value="deceased">Deceased</option>
              </select>
            </F>
            <F label="Final Diagnosis">
              <input value={form.dischargeDiagnosis} onChange={e => setForm({...form, dischargeDiagnosis: e.target.value})} style={s.inp} />
            </F>
            <F label="Discharge Summary">
              <textarea value={form.dischargeSummary} onChange={e => setForm({...form, dischargeSummary: e.target.value})} style={{ ...s.inp, height: 80, resize: "vertical" }} placeholder="Summary of hospital course, treatment, and outcome..." />
            </F>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <F label="Follow-up Date"><input type="date" value={form.followUpDate} onChange={e => setForm({...form, followUpDate: e.target.value})} style={s.inp} /></F>
              <F label="Follow-up Instructions"><input value={form.followUpInstructions} onChange={e => setForm({...form, followUpInstructions: e.target.value})} style={s.inp} /></F>
            </div>
          </div>
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleDischarge} disabled={isSaving} style={{ ...s.primaryBtn, background: "#10b981" }}>
            {isSaving ? "Discharging..." : "✓ Confirm Discharge"}
          </button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{label}</label>
      {children}
    </div>
  );
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

const s: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", gap: 20 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 },
  sub: { fontSize: 13, color: "#64748b", marginTop: 4 },
  primaryBtn: { background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  cancelBtn: { background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  tabs: { display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4, width: "fit-content" },
  tab: { padding: "8px 16px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#64748b" },
  tabActive: { background: "#fff", color: "#1d4ed8", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  select: { padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#fff" },
  bedCard: { borderRadius: 12, padding: "12px 10px", cursor: "pointer", border: "2px solid", textAlign: "center", transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center" },
  splitLayout: { display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" },
  listPanel: { display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 360px)", overflowY: "auto" },
  admCard: { background: "#fff", borderRadius: 10, padding: "12px 14px", cursor: "pointer", border: "1.5px solid transparent", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "all 0.15s" },
  admCardActive: { border: "1.5px solid #3b82f6", boxShadow: "0 0 0 3px #bfdbfe" },
  admNum: { fontSize: 10, color: "#6b7280", background: "#f1f5f9", padding: "1px 5px", borderRadius: 3 },
  admPatient: { fontWeight: 700, color: "#0f172a", fontSize: 14, marginTop: 4, marginBottom: 2 },
  admMeta: { fontSize: 11, color: "#94a3b8", marginTop: 4 },
  detailPanel: { background: "#fff", borderRadius: 14, minHeight: 400, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  detailEmpty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, color: "#94a3b8" },
  loading: { padding: 40, textAlign: "center", color: "#64748b" },
  empty: { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 16, width: "90%", maxWidth: 540, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #f1f5f9" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" },
  modalBody: { overflowY: "auto", padding: "20px 24px" },
  modalFooter: { display: "flex", gap: 10, justifyContent: "flex-end", padding: "16px 24px", borderTop: "1px solid #f1f5f9" },
  inp: { width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#f8fafc", outline: "none", boxSizing: "border-box" as const },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c" },
};
