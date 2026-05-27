import { useState, useEffect } from "react";
import { api, useAuthStore } from "../stores";

type Tab = "dispensing" | "inventory" | "drugs" | "transactions";

interface Prescription {
  id: string;
  prescription_number: string;
  patient_name: string;
  patient_number: string;
  prescribed_by_name: string;
  prescription_date: string;
  status: string;
  items: PrescriptionItem[];
}

interface PrescriptionItem {
  id: string;
  drug_name: string;
  dose: string;
  frequency: string;
  route: string;
  duration_days: number | null;
  quantity_prescribed: number | null;
  quantity_dispensed: number;
  is_dispensed: number;
  instructions: string | null;
}

interface DrugStock {
  id: string;
  generic_name: string;
  brand_name: string | null;
  formulation: string;
  strength: string;
  batch_number: string;
  quantity_in_stock: number;
  selling_price: number;
  expiry_date: string;
  reorder_level: number;
  location: string | null;
}

const RX_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active:    { bg: "#eff6ff", text: "#1d4ed8" },
  partial:   { bg: "#fff7ed", text: "#c2410c" },
  dispensed: { bg: "#f0fdf4", text: "#16a34a" },
  cancelled: { bg: "#fef2f2", text: "#dc2626" },
  expired:   { bg: "#f1f5f9", text: "#64748b" },
};

export default function PharmacyPage() {
  const { hasPermission } = useAuthStore();
  const [tab, setTab] = useState<Tab>("dispensing");

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>💊 Pharmacy</h1>
      </div>
      <div style={s.tabs}>
        {(["dispensing","inventory","drugs","transactions"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}>
            {t === "dispensing"    && "📋 Dispensing Queue"}
            {t === "inventory"     && "📦 Stock Inventory"}
            {t === "drugs"         && "💊 Drug Catalog"}
            {t === "transactions"  && "📊 Transactions"}
          </button>
        ))}
      </div>
      {tab === "dispensing"   && <DispensingQueue canDispense={hasPermission("pharmacy","dispensing","create")} />}
      {tab === "inventory"    && <InventoryView canManage={hasPermission("pharmacy","inventory","update")} />}
      {tab === "drugs"        && <DrugCatalogView canAdd={hasPermission("pharmacy","drugs","create")} />}
      {tab === "transactions" && <TransactionLog />}
    </div>
  );
}

// ─── Dispensing Queue ──────────────────────────────────────────────────────────
function DispensingQueue({ canDispense }: { canDispense: boolean }) {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [selected, setSelected] = useState<Prescription | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, DrugStock[]>>({});
  const [dispenseQty, setDispenseQty] = useState<Record<string, { qty: number; inventoryId: string }>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");
  const [isLoading, setIsLoading] = useState(false);

  const fetchPrescriptions = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<any>(`/prescriptions?status=${statusFilter}&pageSize=50`);
      setPrescriptions(res.rows ?? []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchPrescriptions(); }, [statusFilter]);

  const loadStock = async (rx: Prescription) => {
    setSelected(rx);
    setDispenseQty({});
    const stockData: Record<string, DrugStock[]> = {};
    for (const item of rx.items ?? []) {
      try {
        const res = await api.get<any>(`/pharmacy/stock?drugName=${encodeURIComponent(item.drug_name)}`);
        stockData[item.id] = res.stock ?? [];
        // Auto-select first available batch
        if (res.stock?.[0]) {
          setDispenseQty(prev => ({
            ...prev,
            [item.id]: { qty: item.quantity_prescribed ?? 1, inventoryId: res.stock[0].id },
          }));
        }
      } catch { stockData[item.id] = []; }
    }
    setStockMap(stockData);
  };

  const handleDispense = async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      const items = Object.entries(dispenseQty)
        .filter(([, v]) => v.qty > 0 && v.inventoryId)
        .map(([itemId, v]) => ({
          itemId,
          quantityDispensed: v.qty,
          inventoryId: v.inventoryId,
        }));
      if (!items.length) { alert("No items to dispense"); setIsSaving(false); return; }
      await api.post(`/prescriptions/${selected.id}/dispense`, { items });
      fetchPrescriptions();
      setSelected(null);
    } catch (err) {
      alert((err as Error).message);
    } finally { setIsSaving(false); }
  };

  return (
    <div style={s.splitLayout}>
      {/* Left: Queue */}
      <div style={s.listPanel}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {["active","partial","dispensed"].map(st => (
            <button key={st} onClick={() => setStatusFilter(st)} style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid", borderColor: statusFilter === st ? "#3b82f6" : "#e2e8f0", background: statusFilter === st ? "#eff6ff" : "#fff", color: statusFilter === st ? "#1d4ed8" : "#374151", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              {st}
            </button>
          ))}
          <button onClick={fetchPrescriptions} style={{ marginLeft: "auto", background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>⟳</button>
        </div>
        {isLoading ? <div style={s.loading}>Loading...</div> : prescriptions.length === 0 ? (
          <div style={s.empty}>No prescriptions in queue</div>
        ) : prescriptions.map(rx => {
          const sc = RX_STATUS_COLORS[rx.status] ?? RX_STATUS_COLORS.active;
          return (
            <div key={rx.id} onClick={() => loadStock(rx)} style={{ ...s.rxCard, ...(selected?.id === rx.id ? s.rxCardActive : {}) }}>
              <div style={s.rxTop}>
                <code style={s.rxNum}>{rx.prescription_number}</code>
                <span style={{ fontSize: 10, fontWeight: 700, color: sc.text, background: sc.bg, padding: "1px 8px", borderRadius: 8 }}>{rx.status}</span>
              </div>
              <div style={s.rxPatient}>{rx.patient_name}</div>
              <div style={s.rxMeta}>Dr. {rx.prescribed_by_name} · {new Date(rx.prescription_date).toLocaleDateString()}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                {(rx.items ?? []).length} item{(rx.items ?? []).length !== 1 ? "s" : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right: Dispensing detail */}
      <div style={s.detailPanel}>
        {!selected ? (
          <div style={s.detailEmpty}>
            <div style={{ fontSize: 48 }}>💊</div>
            <p style={{ color: "#94a3b8", marginTop: 12 }}>Select a prescription to dispense</p>
          </div>
        ) : (
          <div style={s.dispenseDetail}>
            <div style={s.dispenseHeader}>
              <div>
                <code style={s.rxNum}>{selected.prescription_number}</code>
                <h3 style={s.detailPatient}>{selected.patient_name}</h3>
                <p style={s.rxMeta}>Prescribed by Dr. {selected.prescribed_by_name}</p>
              </div>
              {canDispense && selected.status !== "dispensed" && (
                <button onClick={handleDispense} disabled={isSaving} style={s.dispenseBtn}>
                  {isSaving ? "Dispensing..." : "✓ Dispense Selected"}
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              {(selected.items ?? []).map(item => {
                const batches = stockMap[item.id] ?? [];
                const dq = dispenseQty[item.id];
                const totalStock = batches.reduce((sum, b) => sum + b.quantity_in_stock, 0);
                const isDispensd = !!item.is_dispensed;
                return (
                  <div key={item.id} style={{ ...s.itemCard, opacity: isDispensd ? 0.6 : 1 }}>
                    <div style={s.itemTop}>
                      <div>
                        <div style={s.drugName}>{item.drug_name}</div>
                        <div style={s.drugDosing}>{item.dose} · {item.frequency} · {item.route.toUpperCase()}{item.duration_days ? ` · ${item.duration_days} days` : ""}</div>
                        {item.instructions && <div style={s.drugInstr}>"{item.instructions}"</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {isDispensd ? (
                          <span style={{ fontSize: 11, color: "#10b981", fontWeight: 700 }}>✓ Dispensed ({item.quantity_dispensed})</span>
                        ) : (
                          <span style={{ fontSize: 11, color: totalStock < (item.quantity_prescribed ?? 0) ? "#ef4444" : "#374151" }}>
                            Rx: {item.quantity_prescribed ?? "PRN"} · Stock: {totalStock}
                          </span>
                        )}
                      </div>
                    </div>

                    {!isDispensd && batches.length > 0 && (
                      <div style={s.batchSelect}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Batch:</label>
                          <select
                            value={dq?.inventoryId ?? ""}
                            onChange={e => setDispenseQty(prev => ({ ...prev, [item.id]: { ...prev[item.id], inventoryId: e.target.value } }))}
                            style={s.batchSelectEl}
                          >
                            {batches.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.batch_number} · Qty: {b.quantity_in_stock} · Exp: {b.expiry_date}
                                {new Date(b.expiry_date) < new Date(Date.now() + 30*86400000) ? " ⚠️" : ""}
                              </option>
                            ))}
                          </select>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Qty:</label>
                          <input
                            type="number"
                            min="0"
                            max={dq?.inventoryId ? batches.find(b => b.id === dq.inventoryId)?.quantity_in_stock ?? 999 : 999}
                            value={dq?.qty ?? item.quantity_prescribed ?? 1}
                            onChange={e => setDispenseQty(prev => ({ ...prev, [item.id]: { ...prev[item.id], qty: Number(e.target.value) } }))}
                            style={s.qtyInput}
                          />
                        </div>
                      </div>
                    )}
                    {!isDispensd && batches.length === 0 && (
                      <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6, padding: "6px 10px", background: "#fef2f2", borderRadius: 6 }}>
                        ⚠️ No stock available for this drug
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inventory View ────────────────────────────────────────────────────────────
function InventoryView({ canManage }: { canManage: boolean }) {
  const [stock, setStock] = useState<DrugStock[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [q, setQ] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);

  // Summary
  const [summary, setSummary] = useState({ total: 0, lowStock: 0, expiring30d: 0, expired: 0 });

  const fetchStock = async (p = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p), pageSize: "30",
        ...(q ? { q } : {}),
        ...(expiryFilter ? { expiryBefore: expiryFilter } : {}),
        ...(showLowStock ? { lowStock: "1" } : {}),
      });
      const res = await api.get<any>(`/pharmacy/inventory?${params}`);
      setStock(res.rows ?? []);
      setTotal(res.total ?? 0);
      setSummary(res.summary ?? summary);
      setPage(p);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchStock(1); }, [q, showLowStock]);

  const getExpiryColor = (expiryDate: string) => {
    const daysLeft = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (daysLeft < 0) return "#ef4444";
    if (daysLeft <= 30) return "#f97316";
    if (daysLeft <= 90) return "#f59e0b";
    return "#10b981";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Total Items", value: summary.total, color: "#3b82f6", icon: "📦" },
          { label: "Low Stock", value: summary.lowStock, color: "#f59e0b", icon: "⚠️", alert: summary.lowStock > 0 },
          { label: "Expiring 30d", value: summary.expiring30d, color: "#f97316", icon: "⏰", alert: summary.expiring30d > 0 },
          { label: "Expired", value: summary.expired, color: "#ef4444", icon: "🗑", alert: summary.expired > 0 },
        ].map(c => (
          <div key={c.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 16px", borderLeft: `4px solid ${c.color}`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{c.icon}{c.alert ? " 🔴" : ""}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search drug name or batch..." style={s.searchInput} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={showLowStock} onChange={e => setShowLowStock(e.target.checked)} />
          Low stock only
        </label>
        {canManage && <button onClick={() => setShowAddStock(true)} style={s.primaryBtn}>+ Add Stock</button>}
      </div>

      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr style={s.thead}>
              <th style={s.th}>Drug</th>
              <th style={s.th}>Form / Strength</th>
              <th style={s.th}>Batch</th>
              <th style={s.th}>In Stock</th>
              <th style={s.th}>Reorder Level</th>
              <th style={s.th}>Price (KES)</th>
              <th style={s.th}>Expiry</th>
              <th style={s.th}>Location</th>
              {canManage && <th style={s.th}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Loading...</td></tr>
            ) : stock.map(item => {
              const expiryColor = getExpiryColor(item.expiry_date);
              const isLow = item.quantity_in_stock <= item.reorder_level;
              const isExpired = new Date(item.expiry_date) < new Date();
              return (
                <tr key={item.id} style={{ ...s.tr, background: isExpired ? "#fef2f2" : isLow ? "#fffbeb" : undefined }}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600 }}>{item.generic_name}</div>
                    {item.brand_name && <div style={{ fontSize: 11, color: "#94a3b8" }}>{item.brand_name}</div>}
                  </td>
                  <td style={s.td}>{item.formulation} · {item.strength}</td>
                  <td style={s.tdMono}>{item.batch_number}</td>
                  <td style={s.td}>
                    <span style={{ fontWeight: 700, color: isLow ? "#f59e0b" : "#10b981" }}>
                      {isLow && "⚠️ "}{item.quantity_in_stock}
                    </span>
                  </td>
                  <td style={s.td}>{item.reorder_level}</td>
                  <td style={s.td}>{item.selling_price.toLocaleString()}</td>
                  <td style={s.td}>
                    <span style={{ fontWeight: 600, color: expiryColor }}>
                      {isExpired ? "⛔ " : ""}{item.expiry_date}
                    </span>
                  </td>
                  <td style={s.td}>{item.location ?? "—"}</td>
                  {canManage && (
                    <td style={s.td}>
                      <button style={s.actionBtn} title="Adjust stock">📝</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {total > 30 && (
          <div style={s.pagination}>
            <button disabled={page <= 1} onClick={() => fetchStock(page-1)} style={s.pageBtn}>← Prev</button>
            <span style={s.pageInfo}>Page {page} · {total} items</span>
            <button onClick={() => fetchStock(page+1)} style={s.pageBtn}>Next →</button>
          </div>
        )}
      </div>

      {showAddStock && <AddStockModal onClose={() => setShowAddStock(false)} onAdded={() => { setShowAddStock(false); fetchStock(1); }} />}
    </div>
  );
}

// ─── Drug Catalog View ─────────────────────────────────────────────────────────
function DrugCatalogView({ canAdd }: { canAdd: boolean }) {
  const [drugs, setDrugs] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const CATEGORIES = ["analgesic","antibiotic","antiviral","antifungal","antihypertensive","antidiabetic","anticoagulant","anticonvulsant","antidepressant","antipsychotic","bronchodilator","cardiac","diuretic","hormone","nsaid","steroid","vaccine","vitamin","contraceptive","anaesthetic","other"];

  const fetchDrugs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ ...(q ? { q } : {}), ...(category ? { category } : {}) });
      const res = await api.get<any>(`/pharmacy/drugs?${params}`);
      setDrugs(res.drugs ?? []);
    } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchDrugs(); }, [q, category]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search generic or brand name..." style={{ ...s.searchInput, flex: 1 }} />
        <select value={category} onChange={e => setCategory(e.target.value)} style={s.selectEl}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {canAdd && <button style={s.primaryBtn}>+ Add Drug</button>}
      </div>
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr style={s.thead}>
              <th style={s.th}>Generic Name</th>
              <th style={s.th}>Brand Name</th>
              <th style={s.th}>Category</th>
              <th style={s.th}>Form / Strength</th>
              <th style={s.th}>Route</th>
              <th style={s.th}>Controlled</th>
              <th style={s.th}>Preg. Category</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Loading...</td></tr>
            ) : drugs.map(d => (
              <tr key={d.id} style={s.tr}>
                <td style={s.td}><strong>{d.generic_name}</strong></td>
                <td style={s.td}>{d.brand_name ?? "—"}</td>
                <td style={s.td}><span style={s.catBadge}>{d.category}</span></td>
                <td style={s.td}>{d.formulation} · {d.strength}</td>
                <td style={s.td}>{d.dosage_forms ?? "oral"}</td>
                <td style={s.td}>{d.controlled_substance ? <span style={{ color: "#dc2626", fontWeight: 700 }}>🔴 Yes</span> : "No"}</td>
                <td style={s.td}>{d.pregnancy_category ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Transaction Log ───────────────────────────────────────────────────────────
function TransactionLog() {
  const [txns, setTxns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const TXN_COLORS: Record<string, string> = { dispensing: "#3b82f6", purchase: "#10b981", wastage: "#ef4444", adjustment: "#f59e0b", transfer_out: "#8b5cf6", expired_disposal: "#94a3b8" };

  useEffect(() => {
    setIsLoading(true);
    api.get<any>("/pharmacy/transactions?pageSize=50").then(r => { setTxns(r.rows ?? []); }).catch(() => {}).finally(() => setIsLoading(false));
  }, []);

  return (
    <div style={s.tableCard}>
      <table style={s.table}>
        <thead>
          <tr style={s.thead}>
            <th style={s.th}>Date</th>
            <th style={s.th}>Drug</th>
            <th style={s.th}>Type</th>
            <th style={s.th}>Quantity</th>
            <th style={s.th}>Reference</th>
            <th style={s.th}>Performed By</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>Loading...</td></tr>
          ) : txns.map(t => (
            <tr key={t.id} style={s.tr}>
              <td style={s.tdMono}>{new Date(t.created_at).toLocaleString()}</td>
              <td style={s.td}>{t.drug_name}</td>
              <td style={s.td}>
                <span style={{ fontSize: 11, fontWeight: 700, color: TXN_COLORS[t.transaction_type] ?? "#374151", background: (TXN_COLORS[t.transaction_type] ?? "#94a3b8") + "18", padding: "2px 8px", borderRadius: 8 }}>
                  {t.transaction_type.replace(/_/g, " ")}
                </span>
              </td>
              <td style={{ ...s.td, fontWeight: 700, color: ["dispensing","wastage","transfer_out","expired_disposal"].includes(t.transaction_type) ? "#ef4444" : "#10b981" }}>
                {["dispensing","wastage","transfer_out","expired_disposal"].includes(t.transaction_type) ? "-" : "+"}{t.quantity}
              </td>
              <td style={s.tdMono}>{t.reference_type ? `${t.reference_type}` : "—"}</td>
              <td style={s.td}>{t.performed_by_name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Add Stock Modal ───────────────────────────────────────────────────────────
function AddStockModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ drugId: "", batchNumber: "", quantity: "", unitCost: "", sellingPrice: "", expiryDate: "", location: "", reorderLevel: "10" });
  const [drugs, setDrugs] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<any>("/pharmacy/drugs?pageSize=200").then(r => setDrugs(r.drugs ?? [])).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (!form.drugId || !form.batchNumber || !form.quantity || !form.expiryDate) return setError("Drug, batch number, quantity, and expiry are required");
    setIsSaving(true);
    try {
      await api.post("/pharmacy/inventory", { ...form, quantity: Number(form.quantity), unitCost: Number(form.unitCost), sellingPrice: Number(form.sellingPrice), reorderLevel: Number(form.reorderLevel) });
      onAdded();
    } catch (err) { setError((err as Error).message); setIsSaving(false); }
  };

  return (
    <div style={s.overlay}>
      <div style={{ ...s.modal, maxWidth: 520 }}>
        <div style={s.modalHeader}>
          <h3 style={s.modalTitle}>📦 Add Drug Stock</h3>
          <button onClick={onClose} style={s.closeBtn}>✕</button>
        </div>
        <div style={s.modalBody}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><label style={s.label}>Drug *</label>
              <select value={form.drugId} onChange={e => setForm({...form, drugId: e.target.value})} style={s.inp}>
                <option value="">Select drug...</option>
                {drugs.map(d => <option key={d.id} value={d.id}>{d.generic_name} {d.strength} ({d.formulation})</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label style={s.label}>Batch Number *</label><input value={form.batchNumber} onChange={e => setForm({...form, batchNumber: e.target.value})} style={s.inp} /></div>
              <div><label style={s.label}>Expiry Date *</label><input type="date" value={form.expiryDate} onChange={e => setForm({...form, expiryDate: e.target.value})} style={s.inp} /></div>
              <div><label style={s.label}>Quantity *</label><input type="number" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} style={s.inp} /></div>
              <div><label style={s.label}>Unit Cost (KES)</label><input type="number" value={form.unitCost} onChange={e => setForm({...form, unitCost: e.target.value})} style={s.inp} /></div>
              <div><label style={s.label}>Selling Price (KES) *</label><input type="number" value={form.sellingPrice} onChange={e => setForm({...form, sellingPrice: e.target.value})} style={s.inp} /></div>
              <div><label style={s.label}>Reorder Level</label><input type="number" value={form.reorderLevel} onChange={e => setForm({...form, reorderLevel: e.target.value})} style={s.inp} /></div>
            </div>
            <div><label style={s.label}>Storage Location</label><input value={form.location} onChange={e => setForm({...form, location: e.target.value})} style={s.inp} placeholder="e.g. Shelf A-3" /></div>
            {error && <div style={s.errorBox}>⚠️ {error}</div>}
          </div>
        </div>
        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSaving} style={s.primaryBtn}>{isSaving ? "Adding..." : "✓ Add Stock"}</button>
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
  splitLayout: { display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" },
  listPanel: { display: "flex", flexDirection: "column", gap: 0, maxHeight: "calc(100vh - 280px)", overflowY: "auto" },
  rxCard: { background: "#fff", borderRadius: 10, padding: "12px 14px", cursor: "pointer", border: "1.5px solid transparent", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", marginBottom: 8, transition: "all 0.15s" },
  rxCardActive: { border: "1.5px solid #3b82f6", boxShadow: "0 0 0 3px #bfdbfe" },
  rxTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  rxNum: { fontSize: 10, color: "#6b7280", background: "#f1f5f9", padding: "1px 5px", borderRadius: 3 },
  rxPatient: { fontWeight: 700, color: "#0f172a", fontSize: 14, marginBottom: 2 },
  rxMeta: { fontSize: 11, color: "#94a3b8" },
  detailPanel: { background: "#fff", borderRadius: 14, minHeight: 400, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  detailEmpty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, color: "#94a3b8" },
  dispenseDetail: { padding: 24 },
  dispenseHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 16, borderBottom: "1px solid #f1f5f9" },
  detailPatient: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: "4px 0 2px" },
  dispenseBtn: { background: "#10b981", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  itemCard: { background: "#f8fafc", borderRadius: 10, padding: "14px 16px", border: "1px solid #e2e8f0" },
  itemTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  drugName: { fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 2 },
  drugDosing: { fontSize: 12, color: "#374151" },
  drugInstr: { fontSize: 11, color: "#6b7280", fontStyle: "italic", marginTop: 2 },
  batchSelect: { borderTop: "1px solid #e2e8f0", paddingTop: 10, marginTop: 8 },
  batchSelectEl: { padding: "6px 10px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 12, background: "#fff", flex: 1 },
  qtyInput: { width: 70, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 7, fontSize: 14, fontWeight: 700, textAlign: "center" },
  searchInput: { padding: "9px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, outline: "none", background: "#fff" },
  selectEl: { padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#fff" },
  tableCard: { background: "#fff", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  thead: { background: "#f8fafc" },
  th: { padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#374151", textAlign: "left", borderBottom: "1px solid #e2e8f0" },
  tr: { borderBottom: "1px solid #f8fafc" },
  td: { padding: "10px 14px", fontSize: 13, color: "#374151", verticalAlign: "middle" },
  tdMono: { padding: "10px 14px", fontSize: 12, fontFamily: "monospace" },
  catBadge: { fontSize: 10, background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 8, fontWeight: 600 },
  actionBtn: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 14 },
  loading: { padding: 40, textAlign: "center", color: "#64748b" },
  empty: { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 },
  pagination: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderTop: "1px solid #f1f5f9" },
  pageBtn: { padding: "6px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 13 },
  pageInfo: { fontSize: 13, color: "#64748b" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 16, width: "90%", maxWidth: 520, maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.3)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #f1f5f9" },
  modalTitle: { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 },
  closeBtn: { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" },
  modalBody: { overflowY: "auto", padding: "20px 24px" },
  modalFooter: { display: "flex", gap: 10, justifyContent: "flex-end", padding: "16px 24px", borderTop: "1px solid #f1f5f9" },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 },
  inp: { width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#f8fafc", outline: "none", boxSizing: "border-box" as const },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#b91c1c" },
};
