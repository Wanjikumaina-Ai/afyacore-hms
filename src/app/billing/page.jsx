import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Search,
  CreditCard,
  Clock,
  User,
  ArrowRight,
  Printer,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";

export default function BillingList() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["billing-queue"],
    queryFn: async () => {
      const res = await fetch("/api/billing?status=unpaid");
      if (!res.ok) throw new Error("Failed to fetch billing queue");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">
            Revenue & Billing
          </h1>
          <p className="text-sm text-[#64748B]">
            Manage patient invoices and process payments
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Billing Overview */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <CreditCard size={20} />
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Unpaid Invoices
              </p>
              <p className="text-3xl font-bold text-[#0F172A]">
                {data?.bills?.length || 0}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-800">
            <h4 className="font-bold mb-2">Cashier's Portal</h4>
            <p>
              Ensure M-Pesa reference numbers are verified before completing
              transactions.
            </p>
          </div>
        </div>

        {/* Bill Queue */}
        <div className="lg:col-span-3 space-y-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search invoices by patient name or ID..."
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
                    <th className="px-6 py-3">Invoice #</th>
                    <th className="px-6 py-3">Patient</th>
                    <th className="px-6 py-3">Amount Due</th>
                    <th className="px-6 py-3">Date</th>
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
                  ) : data?.bills?.length === 0 ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="px-6 py-12 text-center text-slate-400 font-medium"
                      >
                        No pending invoices
                      </td>
                    </tr>
                  ) : (
                    data?.bills
                      ?.filter(
                        (b) =>
                          b.first_name
                            .toLowerCase()
                            .includes(search.toLowerCase()) ||
                          b.last_name
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((bill) => (
                        <tr
                          key={bill.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <FileText size={16} className="text-slate-400" />
                              <span className="font-mono font-bold text-[#0F172A]">
                                INV-{bill.id.toString().padStart(5, "0")}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                <User size={16} />
                              </div>
                              <div>
                                <p className="font-bold text-[#0F172A]">
                                  {bill.first_name} {bill.last_name}
                                </p>
                                <p className="text-[10px] font-mono text-slate-400">
                                  {bill.patient_number}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-[#0F172A]">
                              KSh {parseFloat(bill.net_amount).toLocaleString()}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-medium">
                            {new Date(bill.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <a
                              href={`/billing/${bill.id}`}
                              className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-bold text-white hover:bg-[#1E293B]"
                            >
                              Receive Payment <ArrowRight size={14} />
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
