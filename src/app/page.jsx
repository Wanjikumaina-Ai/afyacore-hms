import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Clock,
  Stethoscope,
  CreditCard,
  AlertTriangle,
  FlaskConical,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";

const StatCard = ({ title, value, icon: Icon, color, trend, trendValue }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
    <div className="flex items-start justify-between">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-lg ${color} text-white`}
      >
        <Icon size={24} />
      </div>
      {trend && (
        <div
          className={`flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-medium ${trend === "up" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}
        >
          {trend === "up" ? (
            <ArrowUpRight size={14} />
          ) : (
            <ArrowDownRight size={14} />
          )}
          {trendValue}%
        </div>
      )}
    </div>
    <div className="mt-4">
      <h3 className="text-sm font-medium text-[#64748B]">{title}</h3>
      <p className="mt-1 text-2xl font-bold text-[#0F172A]">{value}</p>
    </div>
  </div>
);

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-slate-100"
            ></div>
          ))}
        </div>
        <div className="h-[400px] animate-pulse rounded-xl bg-slate-100"></div>
      </div>
    );
  }

  const stats = data?.stats || {};

  return (
    <div className="space-y-8">
      {/* Header section */}
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">Facility Overview</h1>
        <p className="text-sm text-[#64748B]">
          Real-time operational visibility for today,{" "}
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Patients Today"
          value={stats.patientsToday}
          icon={Users}
          color="bg-blue-600"
          trend="up"
          trendValue="12"
        />
        <StatCard
          title="In Queue"
          value={stats.patientsWaiting}
          icon={Clock}
          color="bg-amber-500"
        />
        <StatCard
          title="Consultations"
          value={stats.patientsConsultation}
          icon={Stethoscope}
          color="bg-indigo-600"
        />
        <StatCard
          title="Revenue Today"
          value={`KSh ${stats.revenueToday.toLocaleString()}`}
          icon={CreditCard}
          color="bg-emerald-600"
          trend="up"
          trendValue="8.4"
        />
        <StatCard
          title="Low Stock"
          value={stats.lowStock}
          icon={AlertTriangle}
          color={stats.lowStock > 0 ? "bg-red-500" : "bg-slate-400"}
        />
        <StatCard
          title="Lab Pending"
          value={stats.pendingLab}
          icon={FlaskConical}
          color="bg-purple-600"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue Trend Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#0F172A]">
              Revenue Trend
            </h3>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-600">
              <TrendingUp size={14} />
              <span>+14.2% from last week</span>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.revenueTrend || []}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E2E8F0"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748B" }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748B" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#0F172A"
                  strokeWidth={3}
                  dot={{
                    r: 4,
                    fill: "#0F172A",
                    strokeWidth: 2,
                    stroke: "#fff",
                  }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Patients by Department Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-lg font-semibold text-[#0F172A]">
            Patients by Department
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "OPD", value: 45 },
                  { name: "Lab", value: 32 },
                  { name: "Pharmacy", value: 28 },
                  { name: "Dental", value: 12 },
                  { name: "Physio", value: 8 },
                ]}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E2E8F0"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748B" }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748B" }}
                />
                <Tooltip
                  cursor={{ fill: "#F8FAFC" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {[...Array(5)].map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        ["#0F172A", "#334155", "#475569", "#64748B", "#94A3B8"][
                          index
                        ]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <h3 className="text-lg font-semibold text-[#0F172A]">
            Today's Active Queue
          </h3>
          <button className="text-sm font-semibold text-[#0F172A] hover:underline">
            View All
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Queue #</th>
                <th className="px-6 py-3">Patient Name</th>
                <th className="px-6 py-3">Department</th>
                <th className="px-6 py-3">Wait Time</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
              {[
                {
                  q: "001",
                  name: "Faith Mutua",
                  dept: "OPD",
                  wait: "12 min",
                  status: "In Triage",
                  statusColor: "bg-blue-100 text-blue-700",
                },
                {
                  q: "002",
                  name: "John Onyango",
                  dept: "Lab",
                  wait: "45 min",
                  status: "Waiting",
                  statusColor: "bg-amber-100 text-amber-700",
                },
                {
                  q: "003",
                  name: "Sarah Wambui",
                  dept: "Consultation",
                  wait: "8 min",
                  status: "With Doctor",
                  statusColor: "bg-indigo-100 text-indigo-700",
                },
                {
                  q: "004",
                  name: "Peter Kamau",
                  dept: "Pharmacy",
                  wait: "22 min",
                  status: "Waiting",
                  statusColor: "bg-amber-100 text-amber-700",
                },
              ].map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="whitespace-nowrap px-6 py-4 font-mono font-bold text-[#0F172A]">
                    #{row.q}
                  </td>
                  <td className="px-6 py-4 font-medium text-[#0F172A]">
                    {row.name}
                  </td>
                  <td className="px-6 py-4">{row.dept}</td>
                  <td className="px-6 py-4">{row.wait}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${row.statusColor}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50">
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
