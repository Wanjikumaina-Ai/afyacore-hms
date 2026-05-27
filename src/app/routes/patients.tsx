import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { usePatientStore, useAuthStore } from "../stores";

export default function PatientsPage() {
  const { patients, total, page, totalPages, isLoading, query, fetchPatients, setQuery } = usePatientStore();
  const { hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState(query);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  const handleSearch = useCallback(() => {
    setQuery(searchInput);
    fetchPatients({ q: searchInput, page: 1 });
  }, [searchInput, setQuery, fetchPatients]);

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleSearch(); };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>👤 Patients</h1>
          <p style={s.sub}>{total.toLocaleString()} registered patients</p>
        </div>
        {hasPermission("patients", "patients", "create") && (
          <button onClick={() => navigate("/patients/new")} style={s.primaryBtn}>
            + Register Patient
          </button>
        )}
      </div>

      {/* Search bar */}
      <div style={s.searchBar}>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Search by name, patient number, phone, national ID..."
          style={s.searchInput}
        />
        <button onClick={handleSearch} style={s.searchBtn}>🔍 Search</button>
        {query && (
          <button onClick={() => { setSearchInput(""); setQuery(""); fetchPatients({ q: "", page: 1 }); }} style={s.clearBtn}>
            ✕ Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={s.tableCard}>
        {isLoading ? (
          <div style={s.loading}>Loading patients...</div>
        ) : patients.length === 0 ? (
          <div style={s.empty}>No patients found{query ? ` for "${query}"` : ""}</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Patient #</th>
                <th style={s.th}>Name</th>
                <th style={s.th}>DOB / Age</th>
                <th style={s.th}>Gender</th>
                <th style={s.th}>Phone</th>
                <th style={s.th}>Blood Group</th>
                <th style={s.th}>Insurance</th>
                <th style={s.th}>Branch</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} style={s.tr} onClick={() => navigate(`/patients/${p.id}`)} className="table-row">
                  <td style={s.td}><code style={s.pnumber}>{p.patientNumber}</code></td>
                  <td style={s.td}>
                    <div style={s.nameCell}>
                      <div style={s.avatar}>{p.firstName[0]}{p.lastName[0]}</div>
                      <div>
                        <div style={s.patientName}>{p.firstName} {p.middleName ? p.middleName + " " : ""}{p.lastName}</div>
                      </div>
                    </div>
                  </td>
                  <td style={s.td}>{p.dateOfBirth ? `${p.dateOfBirth} (${getAge(p.dateOfBirth)}y)` : "—"}</td>
                  <td style={s.td}><GenderBadge gender={p.gender} /></td>
                  <td style={s.td}>{p.phone ?? "—"}</td>
                  <td style={s.td}>{p.bloodGroup ? <BloodBadge bg={p.bloodGroup} /> : "—"}</td>
                  <td style={s.td}>{p.insuranceProvider ?? p.nhifNumber ? <span style={s.insureBadge}>✓ {p.insuranceProvider ?? "NHIF"}</span> : "—"}</td>
                  <td style={s.td}><span style={s.branchBadge}>{p.branchName ?? "—"}</span></td>
                  <td style={s.td} onClick={(e) => e.stopPropagation()}>
                    <div style={s.actions}>
                      <button onClick={() => navigate(`/patients/${p.id}`)} style={s.actionBtn} title="View">👁</button>
                      <button onClick={() => navigate(`/visits/new?patientId=${p.id}`)} style={s.actionBtn} title="New Visit">🩺</button>
                      {hasPermission("patients", "patients", "update") && (
                        <button onClick={() => navigate(`/patients/${p.id}/edit`)} style={s.actionBtn} title="Edit">✏️</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={s.pagination}>
            <button disabled={page <= 1} onClick={() => fetchPatients({ page: page - 1 })} style={s.pageBtn}>← Prev</button>
            <span style={s.pageInfo}>Page {page} of {totalPages} ({total.toLocaleString()} total)</span>
            <button disabled={page >= totalPages} onClick={() => fetchPatients({ page: page + 1 })} style={s.pageBtn}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Register Patient Form ─────────────────────────────────────────────────────
export function RegisterPatientPage() {
  const { createPatient } = usePatientStore();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: "", middleName: "", lastName: "", dateOfBirth: "",
    gender: "", bloodGroup: "", nationalId: "", phone: "", email: "",
    maritalStatus: "", occupation: "", nationality: "Kenyan",
    address: "", city: "", county: "",
    nextOfKinName: "", nextOfKinRelation: "", nextOfKinPhone: "",
    nhifNumber: "", nhifCardNumber: "", insuranceProvider: "", insuranceNumber: "",
    allergies: "", chronicConditions: "",
  });

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.firstName || !form.lastName || !form.dateOfBirth || !form.gender) {
      setError("First name, last name, date of birth, and gender are required");
      return;
    }
    setIsSaving(true);
    try {
      const { id, patientNumber } = await createPatient({
        ...form,
        allergies: form.allergies ? form.allergies.split(",").map((a) => a.trim()) : [],
        chronicConditions: form.chronicConditions ? form.chronicConditions.split(",").map((c) => c.trim()) : [],
      } as any);
      navigate(`/patients/${id}`, { state: { justCreated: true, patientNumber } });
    } catch (err) {
      setError((err as Error).message);
      setIsSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <button onClick={() => navigate(-1)} style={s.backBtn}>← Back</button>
          <h1 style={s.title}>Register New Patient</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={s.formCard}>
        <Section title="Personal Information">
          <Row>
            <Field label="First Name *" required><input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} style={s.input} /></Field>
            <Field label="Middle Name"><input value={form.middleName} onChange={(e) => set("middleName", e.target.value)} style={s.input} /></Field>
            <Field label="Last Name *" required><input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} style={s.input} /></Field>
          </Row>
          <Row>
            <Field label="Date of Birth *" required><input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} style={s.input} max={new Date().toISOString().split("T")[0]} /></Field>
            <Field label="Gender *" required>
              <select value={form.gender} onChange={(e) => set("gender", e.target.value)} style={s.input}>
                <option value="">Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Blood Group">
              <select value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} style={s.input}>
                <option value="">Unknown</option>
                {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((bg) => <option key={bg} value={bg}>{bg}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="National ID"><input value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} style={s.input} /></Field>
            <Field label="Marital Status">
              <select value={form.maritalStatus} onChange={(e) => set("maritalStatus", e.target.value)} style={s.input}>
                <option value="">Select</option>
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="divorced">Divorced</option>
                <option value="widowed">Widowed</option>
              </select>
            </Field>
            <Field label="Nationality"><input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} style={s.input} /></Field>
          </Row>
        </Section>

        <Section title="Contact Information">
          <Row>
            <Field label="Phone"><input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} style={s.input} placeholder="+254..." /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} style={s.input} /></Field>
            <Field label="Occupation"><input value={form.occupation} onChange={(e) => set("occupation", e.target.value)} style={s.input} /></Field>
          </Row>
          <Row>
            <Field label="Address"><input value={form.address} onChange={(e) => set("address", e.target.value)} style={s.input} /></Field>
            <Field label="City/Town"><input value={form.city} onChange={(e) => set("city", e.target.value)} style={s.input} /></Field>
            <Field label="County">
              <select value={form.county} onChange={(e) => set("county", e.target.value)} style={s.input}>
                <option value="">Select county</option>
                {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </Row>
        </Section>

        <Section title="Next of Kin">
          <Row>
            <Field label="Name"><input value={form.nextOfKinName} onChange={(e) => set("nextOfKinName", e.target.value)} style={s.input} /></Field>
            <Field label="Relation"><input value={form.nextOfKinRelation} onChange={(e) => set("nextOfKinRelation", e.target.value)} style={s.input} placeholder="e.g. Spouse, Parent" /></Field>
            <Field label="Phone"><input type="tel" value={form.nextOfKinPhone} onChange={(e) => set("nextOfKinPhone", e.target.value)} style={s.input} /></Field>
          </Row>
        </Section>

        <Section title="Insurance & NHIF">
          <Row>
            <Field label="NHIF Number"><input value={form.nhifNumber} onChange={(e) => set("nhifNumber", e.target.value)} style={s.input} /></Field>
            <Field label="NHIF Card Number"><input value={form.nhifCardNumber} onChange={(e) => set("nhifCardNumber", e.target.value)} style={s.input} /></Field>
          </Row>
          <Row>
            <Field label="Insurance Provider"><input value={form.insuranceProvider} onChange={(e) => set("insuranceProvider", e.target.value)} style={s.input} /></Field>
            <Field label="Insurance Number"><input value={form.insuranceNumber} onChange={(e) => set("insuranceNumber", e.target.value)} style={s.input} /></Field>
          </Row>
        </Section>

        <Section title="Medical Background">
          <Row>
            <Field label="Known Allergies" hint="Comma-separated e.g. Penicillin, Aspirin">
              <input value={form.allergies} onChange={(e) => set("allergies", e.target.value)} style={s.input} placeholder="Penicillin, Aspirin..." />
            </Field>
            <Field label="Chronic Conditions" hint="Comma-separated e.g. Diabetes, Hypertension">
              <input value={form.chronicConditions} onChange={(e) => set("chronicConditions", e.target.value)} style={s.input} placeholder="Diabetes, Hypertension..." />
            </Field>
          </Row>
        </Section>

        {error && <div style={s.errorBox}>⚠️ {error}</div>}

        <div style={s.formFooter}>
          <button type="button" onClick={() => navigate(-1)} style={s.cancelBtn}>Cancel</button>
          <button type="submit" disabled={isSaving} style={s.primaryBtn}>
            {isSaving ? "Registering..." : "✓ Register Patient"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sec.section}>
      <h3 style={sec.title}>{title}</h3>
      <div style={sec.body}>{children}</div>
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 16 }}>{children}</div>;
}
function Field({ label, children, required, hint }: { label: string; children: React.ReactNode; required?: boolean; hint?: string }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>{hint}</p>}
    </div>
  );
}
function GenderBadge({ gender }: { gender: string }) {
  const colors: Record<string, string> = { male: "#3b82f6", female: "#ec4899", other: "#8b5cf6" };
  return <span style={{ fontSize: 11, background: colors[gender] + "18", color: colors[gender], padding: "2px 8px", borderRadius: 8, fontWeight: 600, textTransform: "capitalize" }}>{gender}</span>;
}
function BloodBadge({ bg }: { bg: string }) {
  return <span style={{ fontSize: 11, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", padding: "2px 6px", borderRadius: 6, fontWeight: 700 }}>{bg}</span>;
}
function getAge(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
}

const KENYA_COUNTIES = ["Nairobi","Mombasa","Kisumu","Nakuru","Eldoret","Kiambu","Machakos","Meru","Nyeri","Kakamega","Kisii","Thika","Garissa","Malindi","Kitui","Murang'a","Embu","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Homa Bay","Isiolo","Kajiado","Kericho","Kilifi","Kirinyaga","Kwale","Laikipia","Lamu","Makueni","Mandera","Marsabit","Migori","Narok","Nandi","Nyandarua","Nyamira","Samburu","Siaya","Taita Taveta","Tana River","Tharaka-Nithi","Trans-Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"].sort();

const sec = { section: { marginBottom: 28 } as React.CSSProperties, title: { fontSize: 14, fontWeight: 700, color: "#1e40af", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #e0f2fe" } as React.CSSProperties, body: {} as React.CSSProperties };

const s: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", gap: 20 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 },
  sub: { fontSize: 13, color: "#64748b", marginTop: 4 },
  backBtn: { background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 13, marginBottom: 8, padding: 0 },
  primaryBtn: { background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  cancelBtn: { background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  searchBar: { display: "flex", gap: 8 },
  searchInput: { flex: 1, padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, outline: "none", background: "#fff" },
  searchBtn: { padding: "10px 18px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  clearBtn: { padding: "10px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, cursor: "pointer", fontSize: 14 },
  tableCard: { background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: "#f8fafc" },
  th: { padding: "12px 16px", fontSize: 12, fontWeight: 700, color: "#374151", textAlign: "left", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  tr: { cursor: "pointer", transition: "background 0.1s" },
  td: { padding: "12px 16px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f1f5f9" },
  nameCell: { display: "flex", alignItems: "center", gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 },
  patientName: { fontWeight: 600, color: "#0f172a" },
  pnumber: { fontSize: 11, background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, color: "#6b7280" },
  insureBadge: { fontSize: 11, background: "#f0fdf4", color: "#16a34a", padding: "2px 8px", borderRadius: 8, fontWeight: 600 },
  branchBadge: { fontSize: 11, background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 8 },
  actions: { display: "flex", gap: 4 },
  actionBtn: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  loading: { padding: 40, textAlign: "center", color: "#64748b" },
  empty: { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 },
  pagination: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderTop: "1px solid #f1f5f9" },
  pageBtn: { padding: "6px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  pageInfo: { fontSize: 13, color: "#64748b" },
  formCard: { background: "#fff", borderRadius: 14, padding: 28, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  input: { width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#f8fafc" },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#b91c1c", marginBottom: 12 },
  formFooter: { display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 16, borderTop: "1px solid #f1f5f9" },
};
