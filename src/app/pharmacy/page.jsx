import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Pill,
  Search,
  CheckCircle2,
  Clock,
  User,
  Package,
  ShoppingCart,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";

export default function PharmacyDashboard() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedRx, setSelectedRx] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["pharmacy-queue"],
    queryFn: async () => {
      const res = await fetch("/api/prescriptions?status=pending");
      if (!res.ok) throw new Error("Failed to fetch pharmacy queue");
      return res.json();
    },
  });

  const dispenseRx = useMutation({
    mutationFn: async (id) => {
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "dispensed" }),
      });
      if (!res.ok) throw new Error("Failed to dispense medication");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["pharmacy-queue"]);
      setSelectedRx(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Pharmacy Management
          </h1>
          <p className="text-sm text-[#64748B]">
            Dispense medications and monitor stock levels
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        {/* Pending Prescriptions */}
        <div className="xl:col-span-1 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h3 className="flex items-center gap-2 font-bold text-[#0F172A]">
                <Clock size={18} className="text-emerald-500" />
                Pending Orders
              </h3>
            </div>
            <div className="p-4">
              <div className="relative mb-4">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Patient name/ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-emerald-500"
                />
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {isLoading ? (
                  <div className="py-10 text-center text-slate-400 text-xs">
                    Loading...
                  </div>
                ) : data?.prescriptions?.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs italic">
                    No pending orders
                  </div>
                ) : (
                  data?.prescriptions
                    ?.filter(
                      (r) =>
                        r.first_name
                          .toLowerCase()
                          .includes(search.toLowerCase()) ||
                        r.last_name
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map((rx) => (
                      <button
                        key={rx.id}
                        onClick={() => setSelectedRx(rx)}
                        className={`w-full rounded-lg border p-3 text-left transition-all ${
                          selectedRx?.id === rx.id
                            ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500"
                            : "border-slate-100 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                            {rx.visit_number}
                          </span>
                          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></div>
                        </div>
                        <p className="text-sm font-bold text-[#0F172A]">
                          {rx.first_name} {rx.last_name}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1 font-medium">
                          {rx.drug_name} • {rx.dosage}
                        </p>
                      </button>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Dispensing Area */}
        <div className="xl:col-span-3">
          {selectedRx ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm h-full flex flex-col">
              <div className="border-b border-slate-100 p-6 bg-slate-50/50">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400">
                      <User size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#0F172A]">
                        {selectedRx.first_name} {selectedRx.last_name}
                      </h2>
                      <p className="text-xs text-slate-500">
                        #{selectedRx.patient_number} • Visit:{" "}
                        {selectedRx.visit_number}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase text-slate-400">
                      Order Placed
                    </p>
                    <p className="text-sm font-bold text-[#0F172A]">
                      {new Date(selectedRx.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-6 space-y-8">
                {/* Medication Details */}
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                        <Pill size={24} />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-emerald-900">
                          {selectedRx.drug_name}
                        </h3>
                        <p className="text-sm font-medium text-emerald-700">
                          {selectedRx.dosage} • {selectedRx.frequency} •{" "}
                          {selectedRx.duration}
                        </p>
                        <div className="mt-4 flex items-center gap-4 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                          <span className="flex items-center gap-1">
                            <Package size={14} /> Qty: {selectedRx.quantity}{" "}
                            Units
                          </span>
                          <span className="flex items-center gap-1">
                            <ShoppingCart size={14} /> Total: KSh 450.00
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                        <CheckCircle2 size={14} /> In Stock
                      </span>
                      <p className="text-[10px] text-emerald-600 font-medium">
                        Batch #B12-441 Exp: Dec 2026
                      </p>
                    </div>
                  </div>

                  {selectedRx.instructions && (
                    <div className="mt-6 rounded-lg bg-white/60 p-4 border border-emerald-100">
                      <p className="text-[10px] font-bold uppercase text-emerald-500 mb-1">
                        Clinical Instructions
                      </p>
                      <p className="text-sm text-emerald-900 font-medium italic">
                        "{selectedRx.instructions}"
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Pharmacist Verification
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-4 hover:bg-slate-50 transition-all cursor-pointer">
                      <div className="h-5 w-5 rounded-full border-2 border-emerald-500 flex items-center justify-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500"></div>
                      </div>
                      <span>Verify drug dosage matches prescription</span>
                    </div>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 p-4 hover:bg-slate-50 transition-all cursor-pointer">
                      <div className="h-5 w-5 rounded-full border-2 border-emerald-500 flex items-center justify-center">
                        <div className="h-2.5 w-2.5 rounded-full bg-emerald-500"></div>
                      </div>
                      <span>Counsel patient on usage/side effects</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg text-xs font-medium">
                  <AlertCircle size={14} />
                  System will deduct stock after dispensing
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => setSelectedRx(null)}
                    className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:text-[#0F172A]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => dispenseRx.mutate(selectedRx.id)}
                    disabled={dispenseRx.isLoading}
                    className="flex items-center gap-2 rounded-lg bg-[#0F172A] px-8 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-200 transition-all hover:bg-[#1E293B]"
                  >
                    {dispenseRx.isLoading
                      ? "Processing..."
                      : "Complete Dispensing"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-40 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
              <Pill size={60} className="text-slate-300 mb-4" />
              <h3 className="text-lg font-bold text-slate-400">
                Medication Fulfillment
              </h3>
              <p className="text-sm text-slate-400 max-w-xs text-center mt-1">
                Select an active prescription order to verify and dispense
                medication.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
