import { useEffect } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useDashboardStore, useAuthStore } from "../stores";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

export default function DashboardPage() {
  const { summary, charts, kpis, isLoading, lastUpdated, fetchDashboard, fetchKpis } = useDashboardStore();
  const { user } = useAuthStore();

  useEffect(() => {
    fetchDashboard();
    fetchKpis();
  }, [fetchDashboard, fetchKpis]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.title}>{greeting}, {user?.firstName} 👋</h1>
          <p style={s.sub}>
            {new Date().toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            {lastUpdated && <span style={s.lastUpdated}> · Updated {new Date(lastUpdated).toLocaleTimeString()}</span>}
          </p>
        </div>
        <button onClick={fetchDashboard} style={s.refreshBtn} disabled={isLoading}>
          {isLoading ? "⟳ Refreshing..." : "⟳ Refresh"}
        </button>
      </div>

      {/* KPI Cards */}
      <div style={s.kpiGrid}>
        <KpiCard icon="🩺" label="Today's Visits" value={summary.todayVisits ?? 0} color="#3b82f6" delta="+12%" />
        <KpiCard icon="🛏" label="Active Admissions" value={summary.activeAdmissions ?? 0} color="#8b5cf6" />
        <KpiCard icon="📅" label="Today's Appointments" value={summary.todayAppointments ?? 0} color="#10b981" />
        <KpiCard icon="🧪" label="Pending Lab Tests" value={summary.pendingLab ?? 0} color="#f59e0b" alert={summary.pendingLab > 20} />
        <KpiCard icon="🛏" label="Available Beds" value={summary.availableBeds ?? 0} color="#06b6d4" />
        <KpiCard icon="💰" label="Today's Revenue" value={`KES ${((summary.todayRevenue ?? 0) / 1000).toFixed(1)}K`} color="#10b981" />
        <KpiCard icon="💳" label="Pending Payments" value={`KES ${((summary.pendingPayments ?? 0) / 1000).toFixed(1)}K`} color="#ef4444" alert />
        <KpiCard icon="⚠️" label="Expiring Drugs (30d)" value={summary.expiringDrugs ?? 0} color="#f97316" alert={(summary.expiringDrugs ?? 0) > 0} />
      </div>

      {/* KPI Metrics row */}
      <div style={s.metricsRow}>
        <MetricBadge label="Bed Occupancy" value={`${kpis.bedOccupancyRate ?? "—"}%`} />
        <MetricBadge label="Avg. Length of Stay" value={`${kpis.averageLengthOfStay ?? "—"} days`} />
        <MetricBadge label="Collection Rate" value={`${kpis.collectionRate ?? "—"}%`} />
      </div>

      {/* Charts row */}
      <div style={s.chartsGrid}>
        {/* Visit trend */}
        <div style={s.chartCard}>
          <h3 style={s.chartTitle}>📈 Visit Trend (7 Days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={charts.visitTrend ?? []}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} width={30} />
              <Tooltip formatter={(v) => [v, "Visits"]} labelFormatter={(l) => `Date: ${l}`} />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by payment method */}
        <div style={s.chartCard}>
          <h3 style={s.chartTitle}>💰 Revenue by Payment Method (30d)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={charts.revenueByMethod ?? []}>
              <XAxis dataKey="payment_method" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v) => [`KES ${Number(v).toLocaleString()}`, "Revenue"]} />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {(charts.revenueByMethod ?? []).map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Department breakdown */}
        <div style={s.chartCard}>
          <h3 style={s.chartTitle}>🏥 Dept. Visits Today</h3>
          {(charts.deptBreakdown ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={charts.deptBreakdown ?? []}
                  dataKey="count"
                  nameKey="name"
                  cx="50%" cy="50%"
                  outerRadius={75}
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {(charts.deptBreakdown ?? []).map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={s.noData}>No visits recorded today</div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div style={s.quickActions}>
        <h3 style={s.chartTitle}>⚡ Quick Actions</h3>
        <div style={s.actionGrid}>
          <QuickAction href="/patients/new" icon="👤" label="Register Patient" color="#3b82f6" />
          <QuickAction href="/appointments/new" icon="📅" label="Book Appointment" color="#10b981" />
          <QuickAction href="/visits/new" icon="🩺" label="New Visit" color="#8b5cf6" />
          <QuickAction href="/billing/new" icon="🧾" label="Create Invoice" color="#f59e0b" />
          <QuickAction href="/lab/request" icon="🧪" label="Lab Request" color="#06b6d4" />
          <QuickAction href="/prescriptions/new" icon="💊" label="New Prescription" color="#ef4444" />
          <QuickAction href="/admissions/new" icon="🛏" label="Admit Patient" color="#7c3aed" />
          <QuickAction href="/emergency" icon="🚨" label="Emergency" color="#dc2626" />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, color, delta, alert }: {
  icon: string; label: string; value: string | number;
  color: string; delta?: string; alert?: boolean;
}) {
  return (
    <div style={{ ...s.kpiCard, borderLeft: `4px solid ${color}` }}>
      <div style={s.kpiTop}>
        <span style={s.kpiIcon}>{icon}</span>
        {alert && <span style={s.alertDot} />}
      </div>
      <div style={{ ...s.kpiValue, color }}>{value}</div>
      <div style={s.kpiLabel}>{label}</div>
      {delta && <div style={s.kpiDelta}>{delta}</div>}
    </div>
  );
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.metricBadge}>
      <span style={s.metricValue}>{value}</span>
      <span style={s.metricLabel}>{label}</span>
    </div>
  );
}

function QuickAction({ href, icon, label, color }: { href: string; icon: string; label: string; color: string }) {
  return (
    <a href={href} style={{ ...s.actionBtn, borderColor: color + "33" }}>
      <span style={{ ...s.actionIcon, background: color + "18", color }}>{icon}</span>
      <span style={s.actionLabel}>{label}</span>
    </a>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", gap: 24 },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 },
  sub: { fontSize: 13, color: "#64748b", marginTop: 4 },
  lastUpdated: { color: "#94a3b8" },
  refreshBtn: { background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", color: "#374151", fontWeight: 600 },
  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 },
  kpiCard: { background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", position: "relative" },
  kpiTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  kpiIcon: { fontSize: 22 },
  alertDot: { width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse 2s infinite" },
  kpiValue: { fontSize: 28, fontWeight: 800, lineHeight: 1 },
  kpiLabel: { fontSize: 12, color: "#64748b", marginTop: 4, fontWeight: 500 },
  kpiDelta: { fontSize: 11, color: "#10b981", fontWeight: 600, marginTop: 2 },
  metricsRow: { display: "flex", gap: 16, flexWrap: "wrap" },
  metricBadge: { background: "#fff", borderRadius: 10, padding: "12px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 140 },
  metricValue: { fontSize: 22, fontWeight: 800, color: "#1d4ed8" },
  metricLabel: { fontSize: 11, color: "#64748b", fontWeight: 500, marginTop: 2 },
  chartsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 },
  chartCard: { background: "#fff", borderRadius: 14, padding: "20px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  chartTitle: { fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 16px", padding: 0 },
  noData: { height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 },
  quickActions: { background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  actionGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginTop: 12 },
  actionBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 10px", border: "1.5px solid #e2e8f0", borderRadius: 12, textDecoration: "none", transition: "transform 0.15s, box-shadow 0.15s", cursor: "pointer" },
  actionIcon: { width: 42, height: 42, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 },
  actionLabel: { fontSize: 12, fontWeight: 600, color: "#374151", textAlign: "center" },
};
