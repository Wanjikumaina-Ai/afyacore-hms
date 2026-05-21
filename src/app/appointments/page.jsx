import { useQuery } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon,
  Clock,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  User,
} from "lucide-react";
import { useState } from "react";

export default function AppointmentsPage() {
  const [view, setView] = useState("list");

  const { data, isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const res = await fetch("/api/appointments");
      if (!res.ok) throw new Error("Failed to fetch appointments");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Appointments Scheduler
          </h1>
          <p className="text-sm text-[#64748B]">
            Manage patient bookings and doctor availability
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView("list")}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === "list" ? "bg-[#0F172A] text-white" : "text-slate-400 hover:text-[#0F172A]"}`}
            >
              List
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === "calendar" ? "bg-[#0F172A] text-white" : "text-slate-400 hover:text-[#0F172A]"}`}
            >
              Calendar
            </button>
          </div>
          <button className="flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-[#1E293B]">
            <Plus size={18} />
            Book Appointment
          </button>
        </div>
      </div>

      {view === "list" ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3">Scheduled Time</th>
                  <th className="px-6 py-3">Patient</th>
                  <th className="px-6 py-3">Service</th>
                  <th className="px-6 py-3">Doctor</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i}>
                      <td
                        colSpan="6"
                        className="px-6 py-8 animate-pulse bg-slate-50/30 h-16"
                      ></td>
                    </tr>
                  ))
                ) : data?.appointments?.length === 0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-6 py-20 text-center text-slate-400 font-medium"
                    >
                      No appointments scheduled for today
                    </td>
                  </tr>
                ) : (
                  data?.appointments?.map((apt) => (
                    <tr
                      key={apt.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-[#0F172A] font-bold">
                          <Clock size={14} className="text-blue-500" />
                          {new Date(apt.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <p className="text-[10px] text-slate-400 ml-5">
                          Today, {new Date(apt.created_at).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400 font-bold text-[10px]">
                            {apt.first_name[0]}
                            {apt.last_name[0]}
                          </div>
                          <div>
                            <p className="font-bold text-[#0F172A]">
                              {apt.first_name} {apt.last_name}
                            </p>
                            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                              {apt.patient_number}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-600">
                        General Consultation
                      </td>
                      <td className="px-6 py-4 text-slate-500 italic">
                        Dr. Any Available
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-blue-600">
                          Confirmed
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#0F172A] hover:bg-slate-50">
                          Check In
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-20 text-center shadow-sm">
          <CalendarIcon size={64} className="mx-auto text-slate-200 mb-4" />
          <h3 className="text-lg font-bold text-slate-400 uppercase tracking-widest">
            Calendar View
          </h3>
          <p className="text-sm text-slate-400 mt-1 max-w-xs mx-auto">
            The interactive calendar module is being prepared for your facility.
          </p>
        </div>
      )}
    </div>
  );
}
