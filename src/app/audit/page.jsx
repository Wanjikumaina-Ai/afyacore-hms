/**
 * FILE: src/app/audit/page.jsx
 *
 * Audit Logs & Compliance — tamper-evident log viewer
 * Shows every action taken in the system with who, when, what changed.
 * Critical for spotting theft, errors, and policy violations.
 */

import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck, Search, Filter, Download, AlertTriangle,
  Info, AlertCircle, Clock, User, Database, RefreshCw,
  ChevronLeft, ChevronRight, Eye,
} from "lucide-react";
import { useState } from "react";

const MODULES = ["PATIENTS", "BILLING", "PAYMENTS", "PHARMACY", "LAB", "INVENTORY", "STAFF", "PAYROLL", "CONSULTATIONS", "VISITS"];
const SEVERITIES = ["info", "warning", "critical"];

const SEV_STYLES = {
  info:     { cls: "bg-blue-100 text-blue-700",   icon: Info,          label: "Info" },
  warning:  { cls: "bg-amber-100 text-amber-700", icon: AlertTriangle, label: "Warning" },
  critical: { cls: "bg-red-100 text-red-700",     icon: AlertCircle,   label: "Critical" },
};

const MODULE_COLORS = {
  PATIENTS:      "bg-blue-50 text-blue-700 border-blue-100",
  BILLING:       "bg-emerald-50 text-emerald-700 border-emerald-100",
  PAYMENTS:      "bg-cyan-50 text-cyan-700 border-cyan-100",
  PHARMACY:      "bg-purple-50 text-purple-700 border-purple-100",
  LAB:           "bg-amber-50 text-amber-700 border-amber-100",
  INVENTORY:     "bg-orange-50 text-orange-700 border-orange-100",
  STAFF:         "bg-indigo-50 text-indigo-700 border-indigo-100",
  PAYROLL:       "bg-pink-50 text-pink-700 border-pink-100",
  CONSULTATIONS: "bg-teal-50 text-teal-700 border-teal-100",
  VISITS:        "bg-slate-100 text-slate-700 border-slate-200",
};

function formatDateTime(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-KE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function LogDetailModal({ log, onClose }) {
  if (!log) return null;
  const sev = SEV_STYLES[log.severity] || SEV_STYLES.info;
  const SevIcon = sev.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${sev.cls}`}>
                <SevIcon size={12} /> {sev.label}
              </span>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${MODULE_COLORS[log.module] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                {log.module}
              </span>
            </div>
            <h3 className="mt-2 font-mono text-base font-bold text-[#0F172A]">{log.action}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <Row label="Timestamp"   value={formatDateTime(log.created_at)} />
          <Row label="Staff"       value={`${log.staff_name || "System"} (${log.staff_email || ""})`} />
          <Row label="Role"        value={log.staff_role} />
          <Row label="Record ID"   value={log.record_id || "—"} />
          {log.ip_address && <Row label="IP Address" value={log.ip_address} mono />}
          {log.old_value && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Before</p>
              <pre className="rounded-lg bg-red-50 border border-red-100 p-3 text-xs font-mono text-red-800 overflow-auto">
                {JSON.stringify(JSON.parse(log.old_value), null, 2)}
              </pre>
            </div>
          )}
          {log.new_value && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">After</p>
              <pre className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-xs font-mono text-emerald-800 overflow-auto">
                {JSON.stringify(JSON.parse(log.new_value), null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-right text-[#0F172A] ${mono ? "font-mono" : "font-medium"}`}>{value || "—"}</span>
    </div>
  );
}

export default function AuditPage() {
  const [filters, setFilters] = useState({ module: "", severity: "", action: "", from: "", to: "", userId: "" });
  const [page, setPage]       = useState(0);
  const [selectedLog, setSelectedLog] = useState(null);
  const LIMIT = 50;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs", filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: LIMIT, offset: page * LIMIT,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      });
      const res = await fetch(`/api/audit?${params}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const logs    = data?.logs || [];
  const total   = data?.total || 0;
  const stats   = data?.stats || {};
  const pages   = Math.ceil(total / LIMIT);

  const setFilter = (k, v) => { setFilters(p => ({...p, [k]: v})); setPage(0); };

  function exportCSV() {
    const headers = ["Timestamp","Staff","Role","Module","Action","Record ID","Severity","IP"];
    const rows = logs.map(l => [
      formatDateTime(l.created_at), l.staff_name, l.staff_role,
      l.module, l.action, l.record_id || "", l.severity, l.ip_address || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Audit Logs & Compliance</h1>
          <p className="text-sm text-[#64748B]">Tamper-evident record of every system action — who did what, when, and what changed</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <RefreshCw size={15} /> Refresh
          </button>
          <button onClick={exportCSV} className="flex items-center gap-2 rounded-xl bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E293B]">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Total Events (30d)</p>
          <p className="mt-1 text-2xl font-bold text-[#0F172A]">
            {(stats.moduleSummary || []).reduce((a,b) => a + parseInt(b.cnt||0), 0).toLocaleString()}
          </p>
        </div>
        {(stats.severitySummary || []).map(s => {
          const style = SEV_STYLES[s.severity] || SEV_STYLES.info;
          const Icon = style.icon;
          return (
            <div key={s.severity} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={s.severity === "critical" ? "text-red-500" : s.severity === "warning" ? "text-amber-500" : "text-blue-500"} />
                <p className="text-xs text-slate-500 capitalize">{s.severity}</p>
              </div>
              <p className="text-2xl font-bold text-[#0F172A]">{parseInt(s.cnt||0).toLocaleString()}</p>
            </div>
          );
        })}
      </div>

      {/* Top modules */}
      {(stats.moduleSummary || []).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Activity by Module (Last 30 Days)</p>
          <div className="flex flex-wrap gap-2">
            {(stats.moduleSummary || []).slice(0, 8).map(m => (
              <button key={m.module} onClick={() => setFilter("module", filters.module === m.module ? "" : m.module)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${filters.module === m.module ? "ring-2 ring-offset-1 ring-[#0F172A]" : ""} ${MODULE_COLORS[m.module] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                {m.module} <span className="ml-1 opacity-70">{parseInt(m.cnt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <div className="relative xl:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input type="text" placeholder="Search action…"
              value={filters.action} onChange={e => setFilter("action", e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-slate-400" />
          </div>
          <select value={filters.module} onChange={e => setFilter("module", e.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400">
            <option value="">All Modules</option>
            {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filters.severity} onChange={e => setFilter("severity", e.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400">
            <option value="">All Severity</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
          <input type="date" value={filters.from} onChange={e => setFilter("from", e.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" placeholder="From" />
          <input type="date" value={filters.to} onChange={e => setFilter("to", e.target.value)}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" placeholder="To" />
        </div>
      </div>

      {/* Log table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20">
          <ShieldCheck size={48} className="text-slate-200 mb-4" />
          <p className="font-bold text-slate-400">No audit events match your filters</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Severity", "Timestamp", "Staff", "Module", "Action", "Record", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map((log) => {
                  const sev = SEV_STYLES[log.severity] || SEV_STYLES.info;
                  const SevIcon = sev.icon;
                  return (
                    <tr key={log.id} className={`transition-colors hover:bg-slate-50 ${log.severity === "critical" ? "bg-red-50/30" : log.severity === "warning" ? "bg-amber-50/20" : ""}`}>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${sev.cls}`}>
                          <SevIcon size={10} /> {sev.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0F172A] text-xs">{log.staff_name || "System"}</div>
                        <div className="text-[10px] text-slate-400">{log.staff_role}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${MODULE_COLORS[log.module] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                          {log.module}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-[#0F172A]">{log.action}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.record_id || "—"}</td>
                      <td className="px-4 py-3">
                        {(log.old_value || log.new_value) && (
                          <button onClick={() => setSelectedLog(log)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600" title="View changes">
                            <Eye size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total.toLocaleString()} events
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-[#0F172A] disabled:opacity-30">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs text-slate-600 px-2">Page {page + 1} / {pages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= pages - 1}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-[#0F172A] disabled:opacity-30">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent active staff */}
      {(stats.recentStaff || []).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Most Active Staff (Last 7 Days)</p>
          <div className="divide-y divide-slate-50">
            {(stats.recentStaff || []).map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="text-sm font-semibold text-[#0F172A]">{s.name}</span>
                  <span className="ml-2 text-xs text-slate-400">{s.role}</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-[#0F172A]">{parseInt(s.actions)} actions</span>
                  <div className="text-[10px] text-slate-400">last: {formatDateTime(s.last_action)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedLog && <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}