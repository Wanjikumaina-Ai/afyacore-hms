import { useState, useEffect } from "react";
import { api, useAuthStore } from "../stores";

type Tab = "invoices" | "payments" | "insurance";

interface Invoice {
  id: string;
  invoice_number: string;
  patient_name: string;
  patient_number: string;
  invoice_date: string;
  payment_type: string;
  status: string;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  created_by_name: string;
}

interface Payment {
  id: string;
  receipt_number: string;
  invoice_number: string;
  patient_name: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  cashier_name: string;
  mpesa_transaction_id: string | null;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: "#f1f5f9", color: "#64748b" },
  pending: { bg: "#fff7ed", color: "#c2410c" },
  partial: { bg: "#eff6ff", color: "#1d4ed8" },
  paid: { bg: "#f0fdf4", color: "#16a34a" },
  voided: { bg: "#fef2f2", color: "#dc2626" },
  disputed: { bg: "#fdf4ff", color: "#9333ea" },
};

const METHOD_ICONS: Record<string, string> = {
  cash: "💵", mpesa: "📱", card: "💳", bank_transfer: "🏦",
  insurance: "🏥", nhif: "🏥", cheque: "📄", waiver: "🎁",
};

export default function BillingPage() {
  const { hasPermission } = useAuthStore();
  const [tab, setTab] = useState<Tab>("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [filters, setFilters] = useState({ status: "", paymentType: "", startDate: "", endDate: "" });

  const fetchInvoices = async (p = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "30",
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
      const res = await api.get<any>(`/billing/invoices?${params}`);
      setInvoices(res.rows ?? []);
      setTotal(res.total ?? 0);
      setPage(p);
    } finally { setIsLoading(false); }
  };

  const fetchPayments = async (p = 1) => {
    setIsLoading(true);
    try {
      const res = await api.get<any>(`/billing/payments?page=${p}&pageSize=30`);
      setPayments(res.rows ?? []);
      setTotal(res.total ?? 0);
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (tab === "invoices") fetchInvoices(1);
    if (tab === "payments") fetchPayments(1);
  }, [tab]);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🧾 Billing & Finance</h1>
          <p style={s.sub}>{total.toLocaleString()} {tab}</p>
        </div>
        {tab === "invoices" && hasPermission("finance", "invoices", "create") && (
          <button onClick={() => setShowNewInvoice(true)} style={s.primaryBtn}>+ Create Invoice</button>
        )}
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {(["invoices", "payments", "insurance"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
            {t === "invoices" && "🧾 Invoices"}
            {t === "payments" && "💰 Payments"}
            {t === "insurance" && "🏦 Insurance Claims"}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {tab === "invoices" && <BillingSummary />}

      {/* Filters */}
      {tab === "invoices" && (
        <div style={s.filters}>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} style={s.select}>
            <option value="">All Statuses</option>
            {Object.keys(STATUS_COLORS).map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <select value={filters.paymentType} onChange={(e) => setFilters({ ...filters, paymentType: e.target.value })} style={s.select}>
            <option value="">All Payment Types</option>
            <option value="cash">Cash</option><option value="insurance">Insurance</option>
            <option value="nhif">NHIF</option><option value="mpesa">M-Pesa</option>
          </select>
          <input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} style={s.dateInput} />
          <input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} style={s.dateInput} />
          <button onClick={() => fetchInvoices(1)} style={s.filterBtn}>Filter</button>
        </div>
      )}

      {/* Invoices Table */}
      {tab === "invoices" && (
        <div style={s.tableCard}>
          {isLoading ? <div style={s.loading}>Loading...</div> : (
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  <th style={s.th}>Invoice #</th>
                  <th style={s.th}>Patient</th>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Type</th>
                  <th style={s.th}>Total (KES)</th>
                  <th style={s.th}>Paid (KES)</th>
                  <th style={s.th}>Balance (KES)</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const sc = STATUS_COLORS[inv.status] ?? STATUS_COLORS.draft;
                  return (
                    <tr key={inv.id} style={s.tr} onClick={() => setSelectedInvoice(inv)}>
                      <td style={s.tdMono}><code style={s.numCode}>{inv.invoice_number}</code></td>
                      <td style={s.td}>
                        <div style={{ fontWeight: 600 }}>{inv.patient_name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{inv.patient_number}</div>
                      </td>
                      <td style={s.td}>{new Date(inv.invoice_date).toLocaleDateString()}</td>
                      <td style={s.td}><span style={s.typePill}>{inv.payment_type}</span></td>
                      <td style={{ ...s.td, fontWeight: 700 }}>{inv.total_amount.toLocaleString()}</td>
                      <td style={{ ...s.td, color: "#10b981" }}>{inv.paid_amount.toLocaleString()}</td>
                      <td style={{ ...s.td, color: inv.balance_due > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>
                        {inv.balance_due.toLocaleString()}
                      </td>
                      <td style={s.td}>
                        <span style={{ ...s.statusPill, background: sc.bg, color: sc.color }}>{inv.status}</span>
                      </td>
                      <td style={s.td} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {inv.status !== "paid" && inv.status !== "voided" && hasPermission("finance", "payments", "create") && (
                            <button onClick={() => { setSelectedInvoice(inv); setShowPaymentModal(true); }} style={s.actionBtn} title="Record payment">💰</button>
                          )}
                          <button onClick={() => window.print()} style={s.actionBtn} title="Print">🖨</button>
                          {inv.status !== "voided" && hasPermission("finance", "invoices", "void") && (
                            <button onClick={() => { setSelectedInvoice(inv); setShowVoidModal(true); }} style={{ ...s.actionBtn, color: "#ef4444" }} title="Void">🚫</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {total > 30 && (
            <div style={s.pagination}>
              <button disabled={page <= 1} onClick={() => fetchInvoices(page - 1)} style={s.pageBtn}>← Prev</button>
              <span style={s.pageInfo}>Page {page} · {total.toLocaleString()} total</span>
              <button onClick={() => fetchInvoices(page + 1)} style={s.pageBtn}>Next →</button>
            </div>
          )}
        </div>
      )}

      {/* Payments Table */}
      {tab === "payments" && (
        <div style={s.tableCard}>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Receipt #</th>
                <th style={s.th}>Invoice #</th>
                <th style={s.th}>Patient</th>
                <th style={s.th}>Amount (KES)</th>
                <th style={s.th}>Method</th>
                <th style={s.th}>Reference</th>
                <th style={s.th}>Date</th>
                <th style={s.th}>Cashier</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} style={s.tr}>
                  <td style={s.tdMono}><code style={s.numCode}>{p.receipt_number}</code></td>
                  <td style={s.tdMono}><code>{p.invoice_number}</code></td>
                  <td style={s.td}>{p.patient_name}</td>
                  <td style={{ ...s.td, fontWeight: 700, color: "#10b981" }}>{p.amount.toLocaleString()}</td>
                  <td style={s.td}>
                    <span style={s.methodBadge}>
                      {METHOD_ICONS[p.payment_method] ?? "💳"} {p.payment_method.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={s.tdMono}>{p.mpesa_transaction_id ?? "—"}</td>
                  <td style={s.td}>{new Date(p.payment_date).toLocaleString()}</td>
                  <td style={s.td}>{p.cashier_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <PaymentModal
          invoice={selectedInvoice}
          onClose={() => setShowPaymentModal(false)}
          onPaid={() => { setShowPaymentModal(false); fetchInvoices(page); }}
        />
      )}

      {/* Void Modal */}
      {showVoidModal && selectedInvoice && (
        <VoidModal
          invoice={selectedInvoice}
          onClose={() => setShowVoidModal(false)}
          onVoided={() => { setShowVoidModal(false); fetchInvoices(page); }}
        />
      )}

      {showNewInvoice && (
        <NewInvoiceModal
          onClose={() => setShowNewInvoice(false)}
          onCreated={() => { setShowNewInvoice(false); fetchInvoices(1); }}
        />
      )}
    </div>
  );
}

// ─── Summary Cards ─────────────────────────────────────────────────────────────
function BillingSummary() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => {
    api.get<any>("/billing/summary").then(setStats).catch(() => {});
  }, []);
  if (!stats) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
      {[
        { label: "Today's Revenue", value: `KES ${((stats.todayRevenue ?? 0) / 1000).toFixed(1)}K`, icon: "💰", color: "#10b981" },
        { label: "Outstanding Balance", value: `KES ${((stats.outstandingBalance ?? 0) / 1000).toFixed(1)}K`, icon: "⏳", color: "#f59e0b" },
        { label: "Pending Invoices", value: stats.pendingInvoices ?? 0, icon: "🧾", color: "#3b82f6" },
        { label: "Month Collections", value: `KES ${((stats.monthRevenue ?? 0) / 1000).toFixed(1)}K`, icon: "📊", color: "#8b5cf6" },
      ].map((c) => (
        <div key={c.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", borderLeft: `4px solid ${c.color}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>{c.icon}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: c.color }}>{c.value}</div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ invoice, onClose, onPaid }: { invoice: Invoice; onClose: () => void; onPaid: () => void }) {
  const [form, setForm] = useState({ amount: invoice.balance_due.toString(), method: "cash", mpesa: "", reference: "", notes: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!form.amount || Number(form.amount) <= 0) return setError("Enter a valid amount");
    setIsSaving(true);
    try {
      await api.post(`/billing/invoices/${invoice.id}/payment`, {
        amount: Number(form.amount), paymentMethod: form.method,
        mpesaTransactionId: form.mpesa || null, bankReference: form.reference || null, notes: form.notes || null,
      });
      onPaid();
    } catch (err) { setError((err as Error).message); setIsSaving(false); }
  };

  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, maxWidth: 440 }}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>💰 Record Payment — {invoice.invoice_number}</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#64748b" }}>{invoice.patient_name}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 13 }}>Balance Due:</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: "#ef4444" }}>KES {invoice.balance_due.toLocaleString()}</span>
            </div>
          </div>
          <div style={s.formRow}>
            <label style={s.label}>Amount (KES) *</label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} style={s.input} max={invoice.balance_due} />
          </div>
          <div style={s.formRow}>
            <label style={s.label}>Payment Method *</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} style={s.input}>
              <option value="cash">💵 Cash</option>
              <option value="mpesa">📱 M-Pesa</option>
              <option value="card">💳 Card</option>
              <option value="bank_transfer">🏦 Bank Transfer</option>
              <option value="insurance">🏥 Insurance</option>
              <option value="nhif">🏥 NHIF</option>
              <option value="waiver">🎁 Waiver</option>
            </select>
          </div>
          {form.method === "mpesa" && (
            <div style={s.formRow}>
              <label style={s.label}>M-Pesa Transaction ID</label>
              <input value={form.mpesa} onChange={(e) => setForm({ ...form, mpesa: e.target.value })} style={s.input} placeholder="QJY4T..." />
            </div>
          )}
          {["bank_transfer", "card"].includes(form.method) && (
            <div style={s.formRow}>
              <label style={s.label}>Reference Number</label>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} style={s.input} />
            </div>
          )}
          <div style={s.formRow}>
            <label style={s.label}>Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={s.input} />
          </div>
          {error && <div style={s.errorBox}>⚠️ {error}</div>}
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSaving} style={s.primaryBtn}>
            {isSaving ? "Processing..." : "✓ Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Void Modal ────────────────────────────────────────────────────────────────
function VoidModal({ invoice, onClose, onVoided }: { invoice: Invoice; onClose: () => void; onVoided: () => void }) {
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const handleVoid = async () => {
    if (!reason.trim()) return;
    setIsSaving(true);
    try {
      await api.post(`/billing/invoices/${invoice.id}/void`, { reason });
      onVoided();
    } catch (err) { alert((err as Error).message); setIsSaving(false); }
  };
  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, maxWidth: 400 }}>
        <div style={s.modalHeader}>
          <h3 style={{ ...s.modalTitle, color: "#dc2626" }}>🚫 Void Invoice {invoice.invoice_number}</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <div style={{ background: "#fef2f2", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13, color: "#b91c1c" }}>
            ⚠️ This action is irreversible. The invoice will be voided and all associated items will be marked invalid.
          </div>
          <div style={s.formRow}>
            <label style={s.label}>Reason for Void *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...s.input, height: 80, resize: "vertical" }} placeholder="Provide a detailed reason..." />
          </div>
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleVoid} disabled={isSaving || !reason.trim()} style={{ ...s.primaryBtn, background: "#dc2626" }}>
            {isSaving ? "Voiding..." : "Void Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Invoice Modal (simplified) ───────────────────────────────────────────
function NewInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ patientId: "", paymentType: "cash", notes: "" });
  const [items, setItems] = useState([{ description: "", category: "consultation", quantity: 1, unitPrice: 0 }]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const addItem = () => setItems([...items, { description: "", category: "consultation", quantity: 1, unitPrice: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) =>
    setItems(items.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const total = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);

  const handleSubmit = async () => {
    setError("");
    if (!form.patientId) return setError("Patient ID is required");
    if (!items.some((it) => it.description && it.unitPrice > 0)) return setError("Add at least one item");
    setIsSaving(true);
    try {
      await api.post("/billing/invoices", { ...form, items });
      onCreated();
    } catch (err) { setError((err as Error).message); setIsSaving(false); }
  };

  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, maxWidth: 680 }}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>🧾 Create Invoice</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={s.formRow}>
              <label style={s.label}>Patient ID *</label>
              <input value={form.patientId} onChange={(e) => setForm({ ...form, patientId: e.target.value })} style={s.input} />
            </div>
            <div style={s.formRow}>
              <label style={s.label}>Payment Type</label>
              <select value={form.paymentType} onChange={(e) => setForm({ ...form, paymentType: e.target.value })} style={s.input}>
                <option value="cash">Cash</option><option value="mpesa">M-Pesa</option>
                <option value="insurance">Insurance</option><option value="nhif">NHIF</option>
              </select>
            </div>
          </div>
          {/* Items */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={s.label}>Invoice Items</label>
              <button onClick={addItem} style={s.addItemBtn}>+ Add Item</button>
            </div>
            {items.map((item, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 100px 100px 32px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} style={s.input} placeholder="Description" />
                <select value={item.category} onChange={(e) => updateItem(i, "category", e.target.value)} style={s.input}>
                  {["consultation","laboratory","radiology","pharmacy","procedure","ward","nursing","other"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(i, "quantity", Number(e.target.value))} style={s.input} placeholder="Qty" />
                <input type="number" min="0" value={item.unitPrice} onChange={(e) => updateItem(i, "unitPrice", Number(e.target.value))} style={s.input} placeholder="Price" />
                {items.length > 1 && <button onClick={() => removeItem(i)} style={s.removeBtn}>✕</button>}
              </div>
            ))}
          </div>
          <div style={{ textAlign: "right", fontSize: 18, fontWeight: 800, color: "#0f172a", padding: "8px 0" }}>
            Total: KES {total.toLocaleString()}
          </div>
          {error && <div style={s.errorBox}>⚠️ {error}</div>}
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSaving} style={s.primaryBtn}>
            {isSaving ? "Creating..." : "✓ Create Invoice"}
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
  dateInput: { padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13 },
  filterBtn: { padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  tableCard: { background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: "#f8fafc" },
  th: { padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#374151", textAlign: "left", borderBottom: "1px solid #e2e8f0" },
  tr: { borderBottom: "1px solid #f8fafc", cursor: "pointer" },
  td: { padding: "10px 14px", fontSize: 13, color: "#374151" },
  tdMono: { padding: "10px 14px", fontSize: 12, fontFamily: "monospace" },
  numCode: { fontSize: 11, background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 },
  typePill: { fontSize: 10, background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 8, fontWeight: 600 },
  statusPill: { fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 10 },
  methodBadge: { fontSize: 12, background: "#f8fafc", padding: "3px 8px", borderRadius: 8 },
  actionBtn: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  loading: { padding: 40, textAlign: "center", color: "#64748b" },
  pagination: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderTop: "1px solid #f1f5f9" },
  pageBtn: { padding: "6px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 13 },
  pageInfo: { fontSize: 13, color: "#64748b" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 16, width: "90%", maxWidth: 680, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #f1f5f9" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" },
  modalBody: { overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 0 },
  modalFooter: { display: "flex", gap: 10, justifyContent: "flex-end", padding: "16px 24px", borderTop: "1px solid #f1f5f9" },
  formRow: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: 600, color: "#374151" },
  input: { padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#f8fafc", outline: "none" },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c" },
  addItemBtn: { background: "#eff6ff", border: "none", color: "#3b82f6", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 },
  removeBtn: { background: "#fef2f2", border: "none", color: "#dc2626", borderRadius: 6, padding: "4px 6px", cursor: "pointer", fontSize: 12 },
};
