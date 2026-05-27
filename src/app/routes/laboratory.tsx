import { useState, useEffect } from "react";
import { api, useAuthStore } from "../stores";

type Tab = "requests" | "catalog" | "results";

interface LabRequest {
  id: string;
  request_number: string;
  patient_name: string;
  patient_number: string;
  requested_by_name: string;
  urgency: string;
  status: string;
  requested_at: string;
  items: LabRequestItem[];
}

interface LabRequestItem {
  id: string;
  test_id: string;
  test_name: string;
  category: string;
  status: string;
  result_value: string | null;
  result_flag: string | null;
  reference_range: string | null;
  result_unit: string | null;
}

interface LabTest {
  id: string;
  code: string;
  name: string;
  category: string;
  specimen_type: string;
  processing_time_hours: number;
  price: number;
  reference_range_male: string;
  reference_range_female: string;
  units: string;
}

const URGENCY_COLORS: Record<string, string> = { routine: "#10b981", urgent: "#f59e0b", stat: "#ef4444" };
const STATUS_COLORS: Record<string, string> = {
  pending: "#64748b", specimen_collected: "#3b82f6", processing: "#f59e0b",
  resulted: "#8b5cf6", verified: "#10b981", reported: "#10b981", cancelled: "#ef4444",
};
const FLAG_COLORS: Record<string, string> = {
  normal: "#10b981", high: "#f59e0b", low: "#3b82f6",
  critical_high: "#ef4444", critical_low: "#7c3aed", abnormal: "#f97316",
};

export default function LaboratoryPage() {
  const { hasPermission } = useAuthStore();
  const [tab, setTab] = useState<Tab>("requests");
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [catalog, setCatalog] = useState<LabTest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<LabRequest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [showResultEntry, setShowResultEntry] = useState(false);
  const [filters, setFilters] = useState({ status: "", urgency: "", date: "" });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchRequests = async (p = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p), pageSize: "30",
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      });
      const res = await api.get<any>(`/lab/requests?${params}`);
      setRequests(res.rows ?? []);
      setTotal(res.total ?? 0);
      setPage(p);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCatalog = async (q = "") => {
    const params = new URLSearchParams(q ? { q } : {});
    const res = await api.get<any>(`/lab/catalog?${params}`);
    setCatalog(res.catalog ?? []);
  };

  useEffect(() => {
    if (tab === "requests" || tab === "results") fetchRequests(1);
    if (tab === "catalog") fetchCatalog();
  }, [tab]);

  const handleVerify = async (requestId: string) => {
    await api.post(`/lab/requests/${requestId}/verify`);
    fetchRequests(page);
    if (selectedRequest?.id === requestId) setSelectedRequest(null);
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🧪 Laboratory</h1>
          <p style={s.sub}>{total.toLocaleString()} requests</p>
        </div>
        {hasPermission("laboratory", "requests", "create") && (
          <button onClick={() => setShowNewRequest(true)} style={s.primaryBtn}>+ New Lab Request</button>
        )}
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {(["requests", "results", "catalog"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
            {t === "requests" && "📋 Requests"}
            {t === "results" && "📊 Results Entry"}
            {t === "catalog" && "📚 Test Catalog"}
          </button>
        ))}
      </div>

      {/* Filters */}
      {(tab === "requests" || tab === "results") && (
        <div style={s.filters}>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={s.select}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="specimen_collected">Specimen Collected</option>
            <option value="processing">Processing</option>
            <option value="resulted">Resulted</option>
            <option value="verified">Verified</option>
          </select>
          <select value={filters.urgency} onChange={(e) => setFilters({ ...filters, urgency: e.target.value })} style={s.select}>
            <option value="">All Urgency</option>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="stat">STAT</option>
          </select>
          <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} style={s.dateInput} />
          <button onClick={() => fetchRequests(1)} style={s.filterBtn}>Filter</button>
        </div>
      )}

      {/* Requests List + Detail panel */}
      {(tab === "requests" || tab === "results") && (
        <div style={s.splitLayout}>
          {/* List */}
          <div style={s.listPanel}>
            {isLoading ? (
              <div style={s.loading}>Loading...</div>
            ) : requests.length === 0 ? (
              <div style={s.empty}>No lab requests found</div>
            ) : requests.map((req) => (
              <div
                key={req.id}
                onClick={() => setSelectedRequest(req)}
                style={{ ...s.requestCard, ...(selectedRequest?.id === req.id ? s.requestCardActive : {}) }}
              >
                <div style={s.reqTop}>
                  <code style={s.reqNumber}>{req.request_number}</code>
                  <span style={{ ...s.urgencyBadge, color: URGENCY_COLORS[req.urgency], background: URGENCY_COLORS[req.urgency] + "18" }}>
                    {req.urgency.toUpperCase()}
                  </span>
                </div>
                <div style={s.reqPatient}>{req.patient_name}</div>
                <div style={s.reqMeta}>
                  <span>{req.patient_number}</span>
                  <span>·</span>
                  <span>Dr. {req.requested_by_name}</span>
                </div>
                <div style={s.reqBottom}>
                  <span style={{ ...s.statusBadge, color: STATUS_COLORS[req.status], background: STATUS_COLORS[req.status] + "18" }}>
                    {req.status.replace(/_/g, " ")}
                  </span>
                  <span style={s.reqTime}>{new Date(req.requested_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {/* Pagination */}
            {total > 30 && (
              <div style={s.pagination}>
                <button disabled={page <= 1} onClick={() => fetchRequests(page - 1)} style={s.pageBtn}>←</button>
                <span style={s.pageInfo}>Page {page}</span>
                <button onClick={() => fetchRequests(page + 1)} style={s.pageBtn}>→</button>
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div style={s.detailPanel}>
            {!selectedRequest ? (
              <div style={s.detailEmpty}>
                <div style={{ fontSize: 48 }}>🧪</div>
                <p style={{ color: "#94a3b8", marginTop: 12 }}>Select a request to view details</p>
              </div>
            ) : (
              <RequestDetail
                request={selectedRequest}
                onVerify={handleVerify}
                onResultsEntered={() => fetchRequests(page)}
                canVerify={hasPermission("laboratory", "results", "approve")}
                canEnterResults={hasPermission("laboratory", "results", "create")}
              />
            )}
          </div>
        </div>
      )}

      {/* Test Catalog */}
      {tab === "catalog" && (
        <div style={s.tableCard}>
          <div style={{ padding: "16px 16px 0" }}>
            <input
              placeholder="Search tests by name or code..."
              style={s.searchInput}
              onChange={(e) => fetchCatalog(e.target.value)}
            />
          </div>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Code</th>
                <th style={s.th}>Test Name</th>
                <th style={s.th}>Category</th>
                <th style={s.th}>Specimen</th>
                <th style={s.th}>TAT (hrs)</th>
                <th style={s.th}>Ref Range (M)</th>
                <th style={s.th}>Ref Range (F)</th>
                <th style={s.th}>Units</th>
                <th style={s.th}>Price (KES)</th>
              </tr>
            </thead>
            <tbody>
              {catalog.map((test) => (
                <tr key={test.id} style={s.tr}>
                  <td style={s.tdMono}><code>{test.code}</code></td>
                  <td style={s.td}><strong>{test.name}</strong></td>
                  <td style={s.td}><span style={s.catBadge}>{test.category}</span></td>
                  <td style={s.td}>{test.specimen_type ?? "—"}</td>
                  <td style={s.td}>{test.processing_time_hours}h</td>
                  <td style={s.td}>{test.reference_range_male ?? "—"}</td>
                  <td style={s.td}>{test.reference_range_female ?? "—"}</td>
                  <td style={s.td}>{test.units ?? "—"}</td>
                  <td style={s.td}>{test.price > 0 ? test.price.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Request Modal */}
      {showNewRequest && (
        <NewLabRequestModal
          onClose={() => setShowNewRequest(false)}
          onCreated={() => { setShowNewRequest(false); fetchRequests(1); }}
          catalog={catalog.length ? catalog : []}
        />
      )}
    </div>
  );
}

// ─── Request Detail ────────────────────────────────────────────────────────────
function RequestDetail({ request, onVerify, onResultsEntered, canVerify, canEnterResults }: {
  request: LabRequest;
  onVerify: (id: string) => void;
  onResultsEntered: () => void;
  canVerify: boolean;
  canEnterResults: boolean;
}) {
  const [resultInputs, setResultInputs] = useState<Record<string, { value: string; flag: string }>>({});
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveResults = async () => {
    setIsSaving(true);
    try {
      const results = Object.entries(resultInputs).map(([itemId, data]) => ({
        itemId,
        value: data.value,
        flag: data.flag || "normal",
      }));
      await api.post(`/lab/requests/${request.id}/results`, { results });
      onResultsEntered();
      setResultInputs({});
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const canSaveResults = canEnterResults &&
    ["pending", "specimen_collected", "processing"].includes(request.status);
  const canVerifyNow = canVerify && request.status === "resulted";
  const hasUnenteredResults = Object.keys(resultInputs).length > 0;

  return (
    <div style={s.detailContent}>
      <div style={s.detailHeader}>
        <div>
          <code style={s.detailNum}>{request.request_number}</code>
          <h3 style={s.detailPatient}>{request.patient_name}</h3>
          <p style={s.detailMeta}>
            {request.patient_number} · Dr. {request.requested_by_name} · {new Date(request.requested_at).toLocaleString()}
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <span style={{ ...s.urgencyBadge, color: URGENCY_COLORS[request.urgency], background: URGENCY_COLORS[request.urgency] + "18" }}>
            {request.urgency.toUpperCase()}
          </span>
          <span style={{ ...s.statusBadge, color: STATUS_COLORS[request.status], background: STATUS_COLORS[request.status] + "18" }}>
            {request.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {/* Test items */}
      <div style={s.testItems}>
        {(request.items ?? []).map((item) => (
          <div key={item.id} style={s.testItem}>
            <div style={s.testItemHeader}>
              <div>
                <span style={s.testName}>{item.test_name}</span>
                <span style={s.testCat}>{item.category}</span>
              </div>
              {item.result_flag && (
                <span style={{ fontSize: 11, fontWeight: 700, color: FLAG_COLORS[item.result_flag] }}>
                  {item.result_flag.replace(/_/g, " ").toUpperCase()}
                </span>
              )}
            </div>

            {/* Result display */}
            {item.result_value ? (
              <div style={s.resultDisplay}>
                <span style={{ fontSize: 20, fontWeight: 800, color: FLAG_COLORS[item.result_flag ?? "normal"] }}>
                  {item.result_value}
                </span>
                <span style={{ fontSize: 13, color: "#64748b" }}>{item.result_unit}</span>
                {item.reference_range && (
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>Ref: {item.reference_range}</span>
                )}
              </div>
            ) : canSaveResults ? (
              <div style={s.resultEntry}>
                <input
                  type="text"
                  placeholder="Result value"
                  value={resultInputs[item.id]?.value ?? ""}
                  onChange={(e) => setResultInputs({
                    ...resultInputs,
                    [item.id]: { ...resultInputs[item.id], value: e.target.value, flag: resultInputs[item.id]?.flag ?? "normal" },
                  })}
                  style={s.resultInput}
                />
                <select
                  value={resultInputs[item.id]?.flag ?? "normal"}
                  onChange={(e) => setResultInputs({
                    ...resultInputs,
                    [item.id]: { ...resultInputs[item.id], flag: e.target.value, value: resultInputs[item.id]?.value ?? "" },
                  })}
                  style={s.flagSelect}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="low">Low</option>
                  <option value="critical_high">Critical High</option>
                  <option value="critical_low">Critical Low</option>
                  <option value="abnormal">Abnormal</option>
                </select>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#94a3b8", padding: "8px 0" }}>Pending result</div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={s.detailActions}>
        {canSaveResults && hasUnenteredResults && (
          <button onClick={handleSaveResults} disabled={isSaving} style={s.saveResultsBtn}>
            {isSaving ? "Saving..." : "💾 Save Results"}
          </button>
        )}
        {canVerifyNow && (
          <button onClick={() => onVerify(request.id)} style={s.verifyBtn}>
            ✅ Verify & Release
          </button>
        )}
        <button onClick={() => window.print()} style={s.printBtn}>🖨 Print Report</button>
      </div>
    </div>
  );
}

// ─── New Lab Request Modal ─────────────────────────────────────────────────────
function NewLabRequestModal({ onClose, onCreated, catalog }: {
  onClose: () => void;
  onCreated: () => void;
  catalog: LabTest[];
}) {
  const [patientId, setPatientId] = useState("");
  const [visitId, setVisitId] = useState("");
  const [urgency, setUrgency] = useState("routine");
  const [clinicalInfo, setClinicalInfo] = useState("");
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = catalog.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => setSelectedTests((s) =>
    s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
  );

  const handleSubmit = async () => {
    setError("");
    if (!patientId) return setError("Patient ID is required");
    if (!selectedTests.length) return setError("Select at least one test");
    setIsSaving(true);
    try {
      await api.post("/lab/requests", {
        patientId, visitId: visitId || null, urgency, clinicalInfo, testIds: selectedTests,
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setIsSaving(false);
    }
  };

  return (
    <div style={s.overlay}>
      <div style={s.modal}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>🧪 New Lab Request</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <div style={s.formRow}>
            <label style={s.label}>Patient ID *</label>
            <input value={patientId} onChange={(e) => setPatientId(e.target.value)} style={s.input} placeholder="Patient UUID or search" />
          </div>
          <div style={s.formRow}>
            <label style={s.label}>Visit ID (optional)</label>
            <input value={visitId} onChange={(e) => setVisitId(e.target.value)} style={s.input} placeholder="Link to visit" />
          </div>
          <div style={s.formRow}>
            <label style={s.label}>Urgency</label>
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={s.input}>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT (Immediate)</option>
            </select>
          </div>
          <div style={s.formRow}>
            <label style={s.label}>Clinical Information</label>
            <textarea value={clinicalInfo} onChange={(e) => setClinicalInfo(e.target.value)} style={{ ...s.input, height: 60, resize: "vertical" }} placeholder="Relevant clinical details..." />
          </div>
          <div style={s.formRow}>
            <label style={s.label}>Select Tests ({selectedTests.length} selected)</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...s.input, marginBottom: 8 }} placeholder="Search tests..." />
            <div style={s.testCheckList}>
              {filtered.slice(0, 50).map((test) => (
                <label key={test.id} style={s.testCheckItem}>
                  <input
                    type="checkbox"
                    checked={selectedTests.includes(test.id)}
                    onChange={() => toggle(test.id)}
                    style={{ marginRight: 8 }}
                  />
                  <span style={{ fontWeight: 600 }}>{test.code}</span>
                  <span style={{ marginLeft: 8, color: "#374151" }}>{test.name}</span>
                  <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 11 }}>{test.specimen_type}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <div style={s.errorBox}>⚠️ {error}</div>}
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSaving} style={s.primaryBtn}>
            {isSaving ? "Submitting..." : "✓ Submit Request"}
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
  sub: { fontSize: 13, color: "#64748b", marginTop: 4 },
  primaryBtn: { background: "linear-gradient(135deg,#1d4ed8,#3b82f6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  cancelBtn: { background: "#f1f5f9", color: "#374151", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  tabs: { display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4, width: "fit-content" },
  tab: { padding: "8px 18px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#64748b" },
  tabActive: { background: "#fff", color: "#1d4ed8", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  filters: { display: "flex", gap: 8, flexWrap: "wrap" },
  select: { padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#fff" },
  dateInput: { padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#fff" },
  filterBtn: { padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 },
  splitLayout: { display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" },
  listPanel: { display: "flex", flexDirection: "column", gap: 8, maxHeight: "calc(100vh - 280px)", overflowY: "auto" },
  requestCard: { background: "#fff", borderRadius: 12, padding: "14px 16px", cursor: "pointer", border: "1.5px solid transparent", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", transition: "all 0.15s" },
  requestCardActive: { border: "1.5px solid #3b82f6", boxShadow: "0 0 0 3px #bfdbfe" },
  reqTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  reqNumber: { fontSize: 11, color: "#6b7280", background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 },
  urgencyBadge: { fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8 },
  reqPatient: { fontWeight: 700, color: "#0f172a", fontSize: 14, marginBottom: 2 },
  reqMeta: { fontSize: 11, color: "#94a3b8", display: "flex", gap: 6, marginBottom: 6 },
  reqBottom: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8, textTransform: "capitalize" },
  reqTime: { fontSize: 10, color: "#94a3b8" },
  detailPanel: { background: "#fff", borderRadius: 14, minHeight: 400, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  detailEmpty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, color: "#94a3b8" },
  detailContent: { padding: 24 },
  detailHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #f1f5f9" },
  detailNum: { fontSize: 11, color: "#6b7280", background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, display: "block", marginBottom: 4 },
  detailPatient: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" },
  detailMeta: { fontSize: 12, color: "#64748b", margin: 0 },
  testItems: { display: "flex", flexDirection: "column", gap: 12 },
  testItem: { background: "#f8fafc", borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" },
  testItemHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  testName: { fontWeight: 700, fontSize: 14, color: "#0f172a", marginRight: 8 },
  testCat: { fontSize: 10, background: "#eff6ff", color: "#3b82f6", padding: "2px 6px", borderRadius: 6 },
  resultDisplay: { display: "flex", alignItems: "baseline", gap: 8 },
  resultEntry: { display: "flex", gap: 8, marginTop: 4 },
  resultInput: { flex: 1, padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 14 },
  flagSelect: { padding: "8px 10px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 12, background: "#fff" },
  detailActions: { display: "flex", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "1px solid #f1f5f9" },
  saveResultsBtn: { padding: "10px 18px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 },
  verifyBtn: { padding: "10px 18px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 },
  printBtn: { padding: "10px 18px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 13 },
  tableCard: { background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: "#f8fafc" },
  th: { padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#374151", textAlign: "left", borderBottom: "1px solid #e2e8f0" },
  tr: { borderBottom: "1px solid #f8fafc" },
  td: { padding: "10px 14px", fontSize: 13, color: "#374151" },
  tdMono: { padding: "10px 14px", fontSize: 12, color: "#374151", fontFamily: "monospace" },
  catBadge: { fontSize: 10, background: "#f0fdf4", color: "#16a34a", padding: "2px 8px", borderRadius: 6, fontWeight: 600 },
  searchInput: { width: "100%", padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, boxSizing: "border-box", marginBottom: 12, background: "#f8fafc" },
  loading: { padding: 40, textAlign: "center", color: "#64748b" },
  empty: { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 },
  pagination: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" },
  pageBtn: { background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px", cursor: "pointer" },
  pageInfo: { fontSize: 12, color: "#64748b" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 16, width: "90%", maxWidth: 600, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #f1f5f9" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" },
  modalBody: { overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 },
  modalFooter: { display: "flex", gap: 10, justifyContent: "flex-end", padding: "16px 24px", borderTop: "1px solid #f1f5f9" },
  formRow: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 12, fontWeight: 600, color: "#374151" },
  input: { padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", background: "#f8fafc" },
  testCheckList: { border: "1.5px solid #e2e8f0", borderRadius: 8, maxHeight: 240, overflowY: "auto" },
  testCheckItem: { display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", fontSize: 13 },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c" },
};
