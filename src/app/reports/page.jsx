/**
 * FILE: src/app/reports/page.jsx
 *
 * Reports & AI Intelligence dashboard.
 * - Offline: rule-based KPI analysis, anomaly detection, stock alerts
 * - Online:  competitive intelligence via Claude API (when internet available)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brain, TrendingUp, AlertTriangle, Package, Globe,
  BarChart3, Users, FlaskConical, Pill, Bed,
  Download, RefreshCw, Wifi, WifiOff,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4"];

const today    = () => new Date().toISOString().slice(0, 10);
const moStart  = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; };

function KPICard({ title, value, sub, icon: Icon, color, alert }) {
  return (
    <div className={`rounded-xl border bg-white p-5 shadow-sm ${alert ? "border-red-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color} text-white`}>
          <Icon size={20} />
        </div>
        {alert && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">⚠ Alert</span>}
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-sm font-medium text-slate-600 mt-0.5">{title}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState("revenue_summary");
  const [from, setFrom]             = useState(moStart());
  const [to, setTo]                 = useState(today());
  const [showIntel, setShowIntel]   = useState(false);

  // KPIs
  const { data: kpiData, isLoading: kpiLoading, refetch: refetchKpis } = useQuery({
    queryKey: ["kpis", from, to],
    queryFn: async () => {
      const r = await fetch(`/api/ai-insights?action=kpis&from=${from}&to=${to}`, { credentials: "include" });
      return r.json();
    },
  });

  // Offline summary
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ["ai-summary", from, to],
    queryFn: async () => {
      const r = await fetch(`/api/ai-insights?action=offline_summary&from=${from}&to=${to}`, { credentials: "include" });
      return r.json();
    },
  });

  // Anomalies
  const { data: anomalyData } = useQuery({
    queryKey: ["anomalies"],
    queryFn: async () => {
      const r = await fetch(`/api/ai-insights?action=anomalies`, { credentials: "include" });
      return r.json();
    },
  });

  // Stock alerts
  const { data: stockData } = useQuery({
    queryKey: ["stock-alerts"],
    queryFn: async () => {
      const r = await fetch(`/api/ai-insights?action=stock_alerts`, { credentials: "include" });
      return r.json();
    },
  });

  // Report data
  const { data: reportData, isLoading: reportLoading, refetch: runReport } = useQuery({
    queryKey: ["report", reportType, from, to],
    queryFn: async () => {
      const r = await fetch(`/api/reports?type=${reportType}&from=${from}&to=${to}`, { credentials: "include" });
      return r.json();
    },
  });

  // Online intel (lazy)
  const { data: intelData, isLoading: intelLoading, refetch: fetchIntel } = useQuery({
    queryKey: ["online-intel"],
    queryFn: async () => {
      const r = await fetch(`/api/ai-insights?action=online_intel`, { credentials: "include" });
      return r.json();
    },
    enabled: false,
  });

  const kpis     = kpiData?.kpis    || {};
  const flags    = summaryData?.flags    || [];
  const insights = summaryData?.insights || [];
  const anomalies = anomalyData?.anomalies || [];
  const stockAlerts = stockData?.alerts || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Brain size={24} className="text-purple-600" />
            Reports & AI Intelligence
          </h1>
          <p className="text-sm text-slate-500 mt-1">Offline analytics always available · Online competitive intel when connected</p>
        </div>
        <div className="flex gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input text-sm" />
          <span className="self-center text-slate-400">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input text-sm" />
          <button onClick={() => { refetchKpis(); refetchSummary(); }} className="btn-secondary flex items-center gap-1.5">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard title="Patients Seen"       value={kpis.total_visits?.toLocaleString() ?? "—"}      icon={Users}       color="bg-blue-600" />
        <KPICard title="Revenue Billed"      value={`KES ${Number(kpis.total_revenue ?? 0).toLocaleString()}`} icon={TrendingUp} color="bg-emerald-600" />
        <KPICard title="Unpaid Bills"        value={kpis.unpaid_bills ?? "—"}                         icon={AlertTriangle} color="bg-amber-500" alert={kpis.unpaid_bills > 10} />
        <KPICard title="Low Stock Items"     value={kpis.stockout_items ?? "—"}                       icon={Package}     color="bg-red-500"   alert={(kpis.stockout_items ?? 0) > 0} />
        <KPICard title="Lab Avg TAT"         value={`${kpis.avg_lab_tat_hours ?? 0}h`}               icon={FlaskConical} color="bg-purple-600" alert={(kpis.avg_lab_tat_hours ?? 0) > 4} sub="Target ≤ 2h" />
        <KPICard title="Rx Fill Rate"        value={kpis.total_prescriptions > 0 ? `${Math.round((kpis.dispensed_prescriptions/kpis.total_prescriptions)*100)}%` : "—"} icon={Pill} color="bg-teal-600" />
        <KPICard title="Bed Occupancy"       value={kpis.bed_occupancy_pct != null ? `${kpis.bed_occupancy_pct}%` : "—"} icon={Bed} color="bg-indigo-600" sub={`${kpis.occupied_beds ?? 0} / ${kpis.total_beds ?? 0} beds`} />
        <KPICard title="Revenue Collected"   value={`KES ${Number(kpis.collected_revenue ?? 0).toLocaleString()}`} icon={BarChart3} color="bg-cyan-600" />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* AI Flags & Insights */}
        <div className="col-span-2 rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2"><Brain size={18} className="text-purple-500" />Offline AI Analysis</h2>
            {summaryLoading && <RefreshCw size={14} className="animate-spin text-slate-400" />}
          </div>
          {flags.length === 0 && insights.length === 0 ? (
            <p className="text-slate-400 text-sm">No significant findings for this period.</p>
          ) : (
            <div className="space-y-2">
              {flags.map((f, i) => (
                <div key={i} className="flex gap-2 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">{f}</div>
              ))}
              {insights.map((ins, i) => (
                <div key={i} className="flex gap-2 rounded-lg bg-green-50 border border-green-100 p-3 text-sm text-green-700">{ins}</div>
              ))}
            </div>
          )}
        </div>

        {/* Anomalies */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-amber-500" />Anomalies
          </h2>
          {anomalies.length === 0 ? (
            <p className="text-slate-400 text-sm">No anomalies detected.</p>
          ) : (
            <div className="space-y-2">
              {anomalies.map((a, i) => (
                <div key={i} className={`rounded-lg p-3 text-xs ${a.severity === "high" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                  {a.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Revenue chart */}
      {reportData?.daily && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-slate-700 mb-4">Daily Revenue</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={reportData.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => `KES ${Number(v).toLocaleString()}`} />
              <Bar dataKey="collected" name="Collected" fill="#10b981" radius={[4,4,0,0]} />
              <Bar dataKey="billed"    name="Billed"    fill="#3b82f6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stock Alerts */}
      {stockAlerts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-white shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-red-700 flex items-center gap-2 mb-4">
            <Package size={18} />Stock Alerts ({stockAlerts.length} items)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {stockAlerts.slice(0, 12).map((a, i) => (
              <div key={i} className={`rounded-lg p-3 border text-sm ${a.alert_type === "out_of_stock" ? "bg-red-50 border-red-200" : a.alert_type === "expiring_soon" ? "bg-amber-50 border-amber-200" : "bg-yellow-50 border-yellow-200"}`}>
                <p className="font-medium text-slate-700 truncate">{a.item_name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Qty: {a.quantity} {a.unit} · Reorder: {a.reorder_level}
                </p>
                <span className="text-xs font-medium text-red-600 capitalize">{a.alert_type.replace(/_/g," ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report builder */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-700 flex items-center gap-2"><BarChart3 size={18} />Detailed Reports</h2>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { value: "revenue_summary",      label: "Revenue" },
            { value: "patient_statistics",   label: "Patients" },
            { value: "lab_performance",      label: "Laboratory" },
            { value: "pharmacy_dispensing",  label: "Pharmacy" },
            { value: "payroll_summary",      label: "Payroll" },
            { value: "inventory_valuation",  label: "Inventory" },
            { value: "inpatient_summary",    label: "Inpatient" },
            { value: "insurance_claims",     label: "Insurance" },
            { value: "audit_summary",        label: "Audit" },
          ].map((r) => (
            <button
              key={r.value}
              onClick={() => setReportType(r.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${reportType === r.value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {reportLoading ? (
          <div className="flex items-center justify-center h-24 text-slate-400">Generating report…</div>
        ) : reportData?.summary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(reportData.summary).filter(([k]) => !["id"].includes(k)).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400 capitalize">{k.replace(/_/g," ")}</p>
                <p className="text-lg font-bold text-slate-700 mt-0.5">
                  {typeof v === "number" && k.includes("amount") || k.includes("revenue") || k.includes("billed") || k.includes("collected")
                    ? `KES ${Number(v).toLocaleString()}`
                    : typeof v === "number" ? Number(v).toLocaleString()
                    : v ?? "—"}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {reportData?.by_type && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-600 mb-2">Revenue by Category</p>
            <div className="space-y-2">
              {reportData.by_type.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs w-28 text-slate-500 capitalize">{r.item_type || "Other"}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(100, (r.total / (reportData.summary?.total_billed || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-xs font-medium text-slate-700 w-28 text-right">KES {Number(r.total).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Online AI competitive intel */}
      <div className="rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-purple-800 flex items-center gap-2">
              <Globe size={18} />Competitive Intelligence
            </h2>
            <p className="text-xs text-purple-600 mt-0.5">Requires internet · No patient data is sent · Uses anonymised metrics only</p>
          </div>
          <button
            onClick={() => { setShowIntel(true); fetchIntel(); }}
            disabled={intelLoading}
            className="px-4 py-2 rounded-lg bg-purple-700 text-white text-sm font-medium hover:bg-purple-800 disabled:opacity-60 flex items-center gap-2"
          >
            {intelLoading ? <><RefreshCw size={14} className="animate-spin" />Fetching…</> : <><Globe size={14} />Get Insights</>}
          </button>
        </div>

        {showIntel && (
          intelData?.offline ? (
            <div className="flex items-center gap-2 rounded-lg bg-white/70 border border-purple-200 p-4 text-sm text-slate-600">
              <WifiOff size={18} className="text-slate-400" />
              {intelData.message}
            </div>
          ) : intelData?.intel ? (
            <div className="rounded-lg bg-white/80 border border-purple-200 p-4">
              <div className="flex items-center gap-2 mb-3 text-xs text-purple-600">
                <Wifi size={14} /><span>Online · Analysis based on anonymised hospital metrics</span>
              </div>
              <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{intelData.intel}</pre>
            </div>
          ) : intelData?.error ? (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{intelData.error}</div>
          ) : null
        )}
      </div>

      <style>{`
        .input { border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:0.875rem; outline:none; }
        .btn-secondary { border:1px solid #e2e8f0; border-radius:8px; padding:8px 14px; font-size:0.875rem; font-weight:500; cursor:pointer; background:#fff; }
      `}</style>
    </div>
  );
}