import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  UserPlus,
  Filter,
  MoreVertical,
  FileText,
  Calendar,
  Clock,
} from "lucide-react";

export default function PatientsList() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["patients", search],
    queryFn: async () => {
      const res = await fetch(`/api/patients?search=${search}`);
      if (!res.ok) throw new Error("Failed to fetch patients");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Patients Registry
          </h1>
          <p className="text-sm text-[#64748B]">
            Manage patient records and clinical history
          </p>
        </div>
        <a
          href="/patients/register"
          className="flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#1E293B]"
        >
          <UserPlus size={18} />
          Register New Patient
        </a>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search by name, ID or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
          />
        </div>
        <button className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Filter size={18} />
          Filters
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Patient ID</th>
                <th className="px-6 py-3">Full Name</th>
                <th className="px-6 py-3">Gender/Age</th>
                <th className="px-6 py-3">Phone</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Registered</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    <td
                      colSpan="7"
                      className="px-6 py-4 animate-pulse bg-slate-50/50 h-16"
                    ></td>
                  </tr>
                ))
              ) : data?.patients?.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-6 py-12 text-center text-slate-400"
                  >
                    No patients found matching your search.
                  </td>
                </tr>
              ) : (
                data?.patients?.map((patient) => (
                  <tr
                    key={patient.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="whitespace-nowrap px-6 py-4 font-mono font-bold text-[#0F172A]">
                      {patient.patient_number}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[#0F172A]">
                          {patient.first_name} {patient.last_name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {patient.email || "No email"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {patient.gender} •{" "}
                      {new Date().getFullYear() -
                        new Date(patient.dob).getFullYear()}
                      Y
                    </td>
                    <td className="px-6 py-4">{patient.phone}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          patient.category === "cash"
                            ? "bg-emerald-100 text-emerald-700"
                            : patient.category === "insurance"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {patient.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[11px]">
                      {new Date(patient.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-white hover:text-[#0F172A]">
                          <FileText size={16} />
                        </button>
                        <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-white hover:text-[#0F172A]">
                          <Calendar size={16} />
                        </button>
                        <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-white hover:text-[#0F172A]">
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
