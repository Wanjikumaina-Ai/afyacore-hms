import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, User, Search, RefreshCw } from "lucide-react";
import { useState } from "react";

export default function TriageList() {
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: async () => {
      const res = await fetch("/api/visits?status=triage");
      if (!res.ok) throw new Error("Failed to fetch triage queue");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Triage Station</h1>
          <p className="text-sm text-[#64748B]">
            Assess patient priority and capture vital signs
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className={`flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-[#0F172A] ${isRefetching ? "animate-spin" : ""}`}
        >
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Stats */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <Activity size={20} />
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Waiting for Vitals
              </p>
              <p className="text-3xl font-bold text-[#0F172A]">
                {data?.visits?.length || 0}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <h4 className="text-sm font-bold text-blue-900 mb-2">
              Instructions
            </h4>
            <ul className="space-y-2 text-xs text-blue-800">
              <li className="flex gap-2">
                <span>•</span> Select a patient from the queue to begin triage.
              </li>
              <li className="flex gap-2">
                <span>•</span> Ensure all vitals are recorded accurately.
              </li>
              <li className="flex gap-2">
                <span>•</span> Assign a priority level before sending to a
                doctor.
              </li>
            </ul>
          </div>
        </div>

        {/* Queue List */}
        <div className="lg:col-span-3 space-y-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search triage queue..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A]"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3">Patient</th>
                    <th className="px-6 py-3">Wait Time</th>
                    <th className="px-6 py-3">Priority</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {isLoading ? (
                    [...Array(3)].map((_, i) => (
                      <tr key={i}>
                        <td
                          colSpan="4"
                          className="px-6 py-8 animate-pulse bg-slate-50/30 h-16"
                        ></td>
                      </tr>
                    ))
                  ) : data?.visits?.length === 0 ? (
                    <tr>
                      <td
                        colSpan="4"
                        className="px-6 py-12 text-center text-slate-400 font-medium"
                      >
                        Triage queue is empty
                      </td>
                    </tr>
                  ) : (
                    data?.visits
                      ?.filter(
                        (v) =>
                          v.first_name
                            .toLowerCase()
                            .includes(search.toLowerCase()) ||
                          v.last_name
                            .toLowerCase()
                            .includes(search.toLowerCase()) ||
                          v.patient_number.includes(search),
                      )
                      .map((visit) => (
                        <tr
                          key={visit.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                <User size={20} />
                              </div>
                              <div>
                                <p className="font-bold text-[#0F172A]">
                                  {visit.first_name} {visit.last_name}
                                </p>
                                <p className="text-[10px] font-mono text-slate-400">
                                  {visit.patient_number}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-medium">
                            {Math.floor(
                              (new Date() - new Date(visit.created_at)) / 60000,
                            )}{" "}
                            mins
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                                visit.priority === "emergency"
                                  ? "bg-red-100 text-red-600"
                                  : "bg-blue-100 text-blue-600"
                              }`}
                            >
                              {visit.priority}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <a
                              href={`/triage/${visit.id}`}
                              className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-bold text-white hover:bg-[#1E293B]"
                            >
                              Capture Vitals <ArrowRight size={14} />
                            </a>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
