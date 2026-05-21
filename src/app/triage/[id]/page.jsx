import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Save,
  Activity,
  Thermometer,
  Heart,
  Wind,
  Weight,
  Ruler,
} from "lucide-react";

export default function TriageCapture({ params }) {
  const { id } = params;
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    temp: "",
    bp_sys: "",
    bp_dia: "",
    pulse: "",
    rr: "",
    spo2: "",
    weight: "",
    height: "",
    bmi: "",
    notes: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["visit", id],
    queryFn: async () => {
      const res = await fetch(`/api/visits/${id}`);
      if (!res.ok) throw new Error("Failed to fetch visit");
      return res.json();
    },
  });

  useEffect(() => {
    if (formData.weight && formData.height) {
      const h = parseFloat(formData.height) / 100;
      const w = parseFloat(formData.weight);
      if (h > 0) {
        const bmiValue = (w / (h * h)).toFixed(1);
        setFormData((prev) => ({ ...prev, bmi: bmiValue }));
      }
    }
  }, [formData.weight, formData.height]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/visits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: "doctor", // Move to doctor queue
          triage_vitals: {
            temp: formData.temp,
            bp: `${formData.bp_sys}/${formData.bp_dia}`,
            pulse: formData.pulse,
            rr: formData.rr,
            spo2: formData.spo2,
            weight: formData.weight,
            height: formData.height,
            bmi: formData.bmi,
          },
          triage_notes: formData.notes,
        }),
      });

      if (!res.ok) throw new Error("Failed to save triage");
      window.location.href = "/triage";
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading)
    return <div className="p-20 text-center">Loading patient data...</div>;

  const visit = data?.visit;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a
            href="/triage"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-white hover:text-[#0F172A]"
          >
            <ArrowLeft size={20} />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">
              Vitals Assessment
            </h1>
            <p className="text-sm text-[#64748B]">
              Recording baseline clinical data for {visit?.first_name}{" "}
              {visit?.last_name}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Patient Summary Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Patient Summary
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-[#0F172A]">
                  {visit?.first_name} {visit?.last_name}
                </p>
                <p className="text-xs text-slate-500">
                  {visit?.patient_number} • {visit?.gender} •{" "}
                  {new Date().getFullYear() -
                    new Date(visit?.dob).getFullYear()}
                  Y
                </p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-[10px] font-bold uppercase text-red-600 mb-1">
                  Critical Allergies
                </p>
                <p className="text-xs font-medium text-red-800">
                  {visit?.allergies || "None recorded"}
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-[10px] font-bold uppercase text-amber-600 mb-1">
                  Chronic Conditions
                </p>
                <p className="text-xs font-medium text-amber-800">
                  {visit?.chronic_conditions || "None recorded"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Vitals Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Temperature */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <Thermometer size={14} className="text-red-500" />{" "}
                    Temperature (°C)
                  </label>
                  <input
                    required
                    type="number"
                    step="0.1"
                    name="temp"
                    value={formData.temp}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                    placeholder="36.5"
                  />
                </div>

                {/* Blood Pressure */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <Heart size={14} className="text-rose-500" /> Blood Pressure
                    (mmHg)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      required
                      type="number"
                      name="bp_sys"
                      value={formData.bp_sys}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                      placeholder="SYS"
                    />
                    <span className="text-slate-400">/</span>
                    <input
                      required
                      type="number"
                      name="bp_dia"
                      value={formData.bp_dia}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                      placeholder="DIA"
                    />
                  </div>
                </div>

                {/* Pulse Rate */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <Activity size={14} className="text-emerald-500" /> Pulse
                    Rate (bpm)
                  </label>
                  <input
                    required
                    type="number"
                    name="pulse"
                    value={formData.pulse}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                    placeholder="72"
                  />
                </div>

                {/* Respiration Rate */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <Wind size={14} className="text-sky-500" /> Resp. Rate (cpm)
                  </label>
                  <input
                    required
                    type="number"
                    name="rr"
                    value={formData.rr}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                    placeholder="16"
                  />
                </div>

                {/* SpO2 */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <Activity size={14} className="text-blue-500" /> SpO2 (%)
                  </label>
                  <input
                    required
                    type="number"
                    name="spo2"
                    value={formData.spo2}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                    placeholder="98"
                  />
                </div>

                {/* Weight/Height */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <Weight size={14} className="text-amber-500" /> Weight
                      (kg)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      name="weight"
                      value={formData.weight}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <Ruler size={14} className="text-amber-500" /> Height (cm)
                    </label>
                    <input
                      type="number"
                      name="height"
                      value={formData.height}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    BMI (Auto-calc)
                  </label>
                  <div className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-slate-100 px-4 text-sm font-bold text-[#0F172A]">
                    {formData.bmi || "--"}
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Nursing Notes / Observations
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                  placeholder="Patient appears calm, complaining of mild chest pain..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => (window.location.href = "/triage")}
                className="px-6 py-2 text-sm font-semibold text-slate-600 hover:text-[#0F172A]"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-[#0F172A] px-8 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#1E293B] disabled:opacity-50"
              >
                <Save size={18} />
                {loading ? "Saving..." : "Save & Send to Doctor"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
