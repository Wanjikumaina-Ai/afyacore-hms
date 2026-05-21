import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  CreditCard,
  Printer,
  CheckCircle2,
  User,
  FileText,
  Wallet,
  Smartphone,
  Banknote,
  Building,
  Save,
  Info,
} from "lucide-react";

export default function BillDetail({ params }) {
  const { id } = params;
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [refNumber, setRefNumber] = useState("");
  const [amountPaid, setAmountPaid] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["bill", id],
    queryFn: async () => {
      const res = await fetch(`/api/billing/${id}`);
      if (!res.ok) throw new Error("Failed to fetch bill");
      return res.json();
    },
  });

  const recordPayment = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billId: id,
          amount: amountPaid || data.bill.net_amount,
          method: paymentMethod,
          referenceNumber: refNumber,
        }),
      });
      if (!res.ok) throw new Error("Payment recording failed");
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        window.location.href = "/billing";
      }, 2000);
    },
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading)
    return <div className="p-20 text-center">Loading invoice details...</div>;

  const bill = data?.bill;
  const items = data?.items || [];

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 size={40} />
        </div>
        <h2 className="text-2xl font-bold text-[#0F172A]">Payment Confirmed</h2>
        <p className="mt-2 text-[#64748B]">
          Receipt generated and visit status updated. Redirecting...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-20">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-4">
          <a
            href="/billing"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-white hover:text-[#0F172A]"
          >
            <ArrowLeft size={20} />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">
              Invoice Processing
            </h1>
            <p className="text-sm text-[#64748B]">
              Verify bill items and record patient payment
            </p>
          </div>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Printer size={18} />
          Print Preview
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Invoice Area */}
        <div className="xl:col-span-8 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:border-none print:shadow-none">
            {/* Facility Header - Only for Print */}
            <div className="mb-8 flex justify-between border-b border-slate-100 pb-8">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter text-[#0F172A]">
                  AfyaCore Medical
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Enterprise Healthcare Operating System
                </p>
                <div className="mt-4 text-xs text-slate-500 space-y-1">
                  <p>123 Medical Center Way, Nairobi</p>
                  <p>Tel: +254 700 000 000</p>
                  <p>Email: billing@afyacore.com</p>
                </div>
              </div>
              <div className="text-right">
                <h3 className="text-lg font-bold text-[#0F172A]">
                  OFFICIAL INVOICE
                </h3>
                <p className="text-xs font-mono font-bold text-blue-600 mt-1">
                  INV-{bill.id.toString().padStart(6, "0")}
                </p>
                <p className="text-xs text-slate-400 mt-4">
                  Date: {new Date(bill.created_at).toLocaleDateString()}
                </p>
                <p className="text-xs text-slate-400">
                  Visit ID: {bill.visit_number}
                </p>
              </div>
            </div>

            {/* Patient Info */}
            <div className="mb-8 grid grid-cols-2 gap-8 rounded-lg bg-slate-50 p-6">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">
                  Billed To:
                </p>
                <p className="font-bold text-[#0F172A]">
                  {bill.first_name} {bill.last_name}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {bill.patient_number}
                </p>
                <p className="text-xs text-slate-500">
                  {bill.patient_address || "No address recorded"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase text-slate-400 mb-2">
                  Payment Status:
                </p>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                    bill.status === "unpaid"
                      ? "bg-red-100 text-red-600"
                      : "bg-emerald-100 text-emerald-600"
                  }`}
                >
                  {bill.status}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-8">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3">Description</th>
                    <th className="py-3 text-center">Qty</th>
                    <th className="py-3 text-right">Unit Price</th>
                    <th className="py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-4">
                        <p className="font-semibold text-[#0F172A]">
                          {item.description}
                        </p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                          {item.item_type}
                        </p>
                      </td>
                      <td className="py-4 text-center text-slate-500">
                        {item.quantity}
                      </td>
                      <td className="py-4 text-right text-slate-500">
                        {parseFloat(item.unit_price).toLocaleString()}
                      </td>
                      <td className="py-4 text-right font-bold text-[#0F172A]">
                        {parseFloat(item.total_price).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end pt-6 border-t-2 border-slate-100">
              <div className="w-64 space-y-3">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Subtotal</span>
                  <span>
                    KSh {parseFloat(bill.total_amount).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-red-500">
                  <span>Discount</span>
                  <span>
                    - KSh{" "}
                    {parseFloat(bill.discount_amount || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-3 text-lg font-black text-[#0F172A]">
                  <span>Total Due</span>
                  <span>
                    KSh {parseFloat(bill.net_amount).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-20 text-center text-[10px] text-slate-400 uppercase tracking-widest">
              <p>Thank you for choosing AfyaCore Medical Services</p>
              <p className="mt-1">
                Computer Generated Receipt • Valid without physical stamp
              </p>
            </div>
          </div>
        </div>

        {/* Payment Logic Column */}
        <div className="xl:col-span-4 space-y-6 no-print">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] mb-6">
              <Wallet size={18} className="text-emerald-500" /> Payment
              Recording
            </h3>

            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Select Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "Cash", icon: Banknote, color: "text-emerald-500" },
                    { id: "M-Pesa", icon: Smartphone, color: "text-green-600" },
                    { id: "Card", icon: CreditCard, color: "text-blue-500" },
                    {
                      id: "Insurance",
                      icon: Building,
                      color: "text-purple-500",
                    },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setPaymentMethod(m.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                        paymentMethod === m.id
                          ? "border-[#0F172A] bg-[#0F172A] text-white"
                          : "border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      <m.icon
                        size={20}
                        className={
                          paymentMethod === m.id ? "text-white" : m.color
                        }
                      />
                      <span className="text-[10px] font-bold uppercase">
                        {m.id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Amount to Receive
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                    KSh
                  </span>
                  <input
                    type="number"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder={parseFloat(bill.net_amount).toLocaleString()}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-lg font-black text-[#0F172A] outline-none focus:border-[#0F172A] focus:bg-white"
                  />
                </div>
              </div>

              {paymentMethod !== "Cash" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Reference / Auth Code
                  </label>
                  <input
                    type="text"
                    value={refNumber}
                    onChange={(e) => setRefNumber(e.target.value)}
                    placeholder="Enter M-Pesa or Auth Code"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-[#0F172A]"
                  />
                </div>
              )}

              <div className="rounded-xl bg-blue-50 p-4 border border-blue-100 flex gap-3">
                <Info size={18} className="text-blue-500 shrink-0" />
                <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
                  By clicking "Record Payment", you confirm that the above
                  amount has been received and verified physically or
                  electronically. This action is audited.
                </p>
              </div>

              <button
                onClick={() => recordPayment.mutate()}
                disabled={recordPayment.isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F172A] py-4 text-sm font-bold text-white shadow-lg shadow-slate-200 hover:bg-[#1E293B] disabled:opacity-50"
              >
                <Save size={18} />
                {recordPayment.isLoading
                  ? "Confirming..."
                  : "Complete & Close Visit"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .ml-20, .ml-64 { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}
