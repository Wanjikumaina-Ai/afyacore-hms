import { useState } from "react";

export default function ActivatePage() {
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", licenseKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Activation failed");
      window.location.href = "/account/signin";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#F8FAFC] p-4 font-sans">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[#0F172A] text-white">
            <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#0F172A]">AfyaCore HMS</h1>
          <p className="mt-1 text-sm text-slate-500">Software Activation</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold text-[#0F172A]">Activate Your License</h2>
          <p className="mb-6 text-sm text-slate-500">
            Enter the license key provided by AfyaCore. The license is tied to this machine and your hospital name.
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                License Key
              </label>
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                required
                placeholder="AFYA-XXXX-XXXX-XXXX-XXXX"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-mono text-[#0F172A] placeholder-slate-400 outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#0F172A]/10"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-lg bg-[#0F172A] py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Activating..." : "Activate License"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          AfyaCore · Licensed Software · Contact support for your license key
        </p>
      </div>
    </div>
  );
}