import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ListOrdered,
  Clock,
  User,
  ArrowRight,
  Play,
  CheckCircle2,
} from "lucide-react";

export default function QueuePage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["queue"],
    queryFn: async () => {
      const res = await fetch("/api/visits");
      if (!res.ok) throw new Error("Failed to fetch queue");
      return res.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds for real-time feel
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      const res = await fetch("/api/visits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["queue"]);
    },
  });

  const getStatusStyle = (status) => {
    switch (status) {
      case "waiting":
        return "bg-slate-100 text-slate-700";
      case "triage":
        return "bg-blue-100 text-blue-700";
      case "doctor":
        return "bg-indigo-100 text-indigo-700";
      case "lab":
        return "bg-purple-100 text-purple-700";
      case "pharmacy":
        return "bg-emerald-100 text-emerald-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Patient Queue</h1>
          <p className="text-sm text-[#64748B]">
            Monitor and manage the flow of patients across departments
          </p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-lg bg-white border border-slate-200 px-4 py-2 text-center">
            <p className="text-[10px] font-bold uppercase text-slate-400">
              Waiting
            </p>
            <p className="text-xl font-bold text-[#0F172A]">
              {data?.visits?.filter((v) => v.status === "waiting").length || 0}
            </p>
          </div>
          <div className="rounded-lg bg-white border border-slate-200 px-4 py-2 text-center">
            <p className="text-[10px] font-bold uppercase text-slate-400">
              Total Today
            </p>
            <p className="text-xl font-bold text-[#0F172A]">
              {data?.visits?.length || 0}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Waiting List */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h3 className="flex items-center gap-2 font-bold text-[#0F172A]">
              <Clock size={18} className="text-slate-400" />
              Incoming / Waiting
            </h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {data?.visits?.filter((v) => v.status === "waiting").length ===
              0 && (
              <div className="p-8 text-center text-sm text-slate-400">
                No patients waiting
              </div>
            )}
            {data?.visits
              ?.filter((v) => v.status === "waiting")
              .map((visit) => (
                <div
                  key={visit.id}
                  className="p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono font-bold text-[#0F172A]">
                      #{visit.visit_number.slice(-4)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        visit.priority === "emergency"
                          ? "bg-red-100 text-red-600"
                          : "bg-blue-50 text-blue-600"
                      }`}
                    >
                      {visit.priority}
                    </span>
                  </div>
                  <h4 className="font-bold text-[#0F172A]">
                    {visit.first_name} {visit.last_name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {visit.gender} •{" "}
                    {new Date().getFullYear() -
                      new Date(visit.dob).getFullYear()}
                    Y
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      Registered{" "}
                      {new Date(visit.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      onClick={() =>
                        updateStatus.mutate({ id: visit.id, status: "triage" })
                      }
                      className="flex items-center gap-1.5 rounded-lg bg-[#0F172A] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1E293B]"
                    >
                      To Triage <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* In Progress List */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h3 className="flex items-center gap-2 font-bold text-[#0F172A]">
              <Play size={18} className="text-blue-500" />
              Active Processes
            </h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {data?.visits?.filter(
              (v) => !["waiting", "completed", "cancelled"].includes(v.status),
            ).length === 0 && (
              <div className="p-8 text-center text-sm text-slate-400">
                No active processes
              </div>
            )}
            {data?.visits
              ?.filter(
                (v) =>
                  !["waiting", "completed", "cancelled"].includes(v.status),
              )
              .map((visit) => (
                <div
                  key={visit.id}
                  className="p-4 hover:bg-slate-50 transition-colors border-l-4 border-blue-500"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getStatusStyle(visit.status)}`}
                    >
                      {visit.status}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      #{visit.visit_number.slice(-4)}
                    </span>
                  </div>
                  <h4 className="font-bold text-[#0F172A]">
                    {visit.first_name} {visit.last_name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {visit.gender} •{" "}
                    {new Date().getFullYear() -
                      new Date(visit.dob).getFullYear()}
                    Y
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      Wait:{" "}
                      {Math.floor(
                        (new Date() - new Date(visit.created_at)) / 60000,
                      )}
                      m
                    </span>
                    <div className="flex gap-2">
                      <button className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-[#0F172A]">
                        <User size={16} />
                      </button>
                      <button className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-[#0F172A]">
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Completed Today */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden opacity-80">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <h3 className="flex items-center gap-2 font-bold text-[#0F172A]">
              <CheckCircle2 size={18} className="text-emerald-500" />
              Completed Today
            </h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {data?.visits?.filter((v) => v.status === "completed").length ===
              0 && (
              <div className="p-8 text-center text-sm text-slate-400">
                No patients completed today
              </div>
            )}
            {data?.visits
              ?.filter((v) => v.status === "completed")
              .map((visit) => (
                <div key={visit.id} className="p-4 bg-slate-50/50">
                  <div className="flex justify-between items-center mb-1">
                    <h4 className="font-bold text-slate-400 line-through">
                      {visit.first_name} {visit.last_name}
                    </h4>
                    <CheckCircle2 size={14} className="text-emerald-500" />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Visit {visit.visit_number} • Completed{" "}
                    {new Date(
                      visit.completed_at || visit.created_at,
                    ).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
