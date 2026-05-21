import { useQuery } from "@tanstack/react-query";
import {
  Stethoscope,
  ArrowRight,
  User,
  Search,
  RefreshCw,
  Clock,
} from "lucide-react";
import { useState } from "react";

export default function ConsultationList() {
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["doctor-queue"],
    queryFn: async () => {
      const res = await fetch("/api/visits?status=doctor");
      if (!res.ok) throw new Error("Failed to fetch doctor queue");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Consultation Room
          </h1>
          <p className="text-sm text-[#64748B]">
            Active clinical queue for attending doctors
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <Stethoscope size={20} />
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Waiting for Doctor
              </p>
              <p className="text-3xl font-bold text-[#0F172A]">
                {data?.visits?.length || 0}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-800">
            <h4 className="font-bold mb-2">Doctor's Note</h4>
            <p>
              Ensure you review patient vitals and clinical history before
              finalizing the diagnosis.
            </p>
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
              placeholder="Search patient in queue..."
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
                    <th className="px-6 py-3">Department</th>
                    <th className="px-6 py-3">Wait Time</th>
                    <th className="px-6 py-3">Vitals Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {isLoading ? (
                    [...Array(3)].map((_, i) => (
                      <tr key={i}>
                        <td
                          colSpan="5"
                          className="px-6 py-8 animate-pulse bg-slate-50/30 h-16"
                        ></td>
                      </tr>
                    ))
                  ) : data?.visits?.length === 0 ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="px-6 py-12 text-center text-slate-400 font-medium"
                      >
                        No patients currently in your queue
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
                            .includes(search.toLowerCase()),
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
                          <td className="px-6 py-4 text-slate-500">OPD</td>
                          <td className="px-6 py-4 text-slate-500 font-medium">
                            <div className="flex items-center gap-1.5">
                              <Clock size={14} className="text-slate-400" />
                              {Math.floor(
                                (new Date() - new Date(visit.created_at)) /
                                  60000,
                              )}{" "}
                              mins
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600">
                              Captured
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <a
                              href={`/consultations/${visit.id}`}
                              className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-bold text-white hover:bg-[#1E293B]"
                            >
                              Start Consult <ArrowRight size={14} />
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
