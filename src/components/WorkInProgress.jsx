import { Construction, ArrowLeft } from "lucide-react";

export default function WorkInProgress({ title = "Module" }) {
  return (
    <div className="flex flex-col items-center justify-center py-40 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Construction size={48} />
      </div>
      <h2 className="text-2xl font-bold text-[#0F172A]">
        {title} Under Construction
      </h2>
      <p className="mt-2 max-w-md text-slate-500">
        We are currently optimizing this module for the AfyaCore Enterprise
        suite. Please check back later or contact your system administrator.
      </p>
      <button
        onClick={() => window.history.back()}
        className="mt-8 flex items-center gap-2 rounded-lg bg-[#0F172A] px-6 py-2 text-sm font-semibold text-white hover:bg-[#1E293B]"
      >
        <ArrowLeft size={18} />
        Go Back
      </button>
    </div>
  );
}
