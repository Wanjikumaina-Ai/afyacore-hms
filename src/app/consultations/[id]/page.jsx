import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Save,
  Activity,
  FlaskConical,
  Pill,
  History,
  ClipboardCheck,
  Plus,
  Trash2,
  AlertCircle,
} from "lucide-react";

export default function ConsultationWorkspace({ params }) {
  const { id } = params;
  const [loading, setLoading] = useState(false);

  // Clinical Notes
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [clinicalHistory, setClinicalHistory] = useState("");
  const [examination, setExamination] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");

  // Lab Requests
  const [labTests, setLabTests] = useState([]);
  const [currentLab, setCurrentLab] = useState("");

  // Prescriptions
  const [prescriptions, setPrescriptions] = useState([]);
  const [currentRx, setCurrentRx] = useState({
    drugName: "",
    dosage: "",
    frequency: "BD",
    duration: "5 days",
    quantity: 10,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["visit", id],
    queryFn: async () => {
      const res = await fetch(`/api/visits/${id}`);
      if (!res.ok) throw new Error("Failed to fetch visit");
      return res.json();
    },
  });

  const addLabTest = () => {
    if (currentLab) {
      setLabTests([...labTests, currentLab]);
      setCurrentLab("");
    }
  };

  const addPrescription = () => {
    if (currentRx.drugName) {
      setPrescriptions([...prescriptions, currentRx]);
      setCurrentRx({
        drugName: "",
        dosage: "",
        frequency: "BD",
        duration: "5 days",
        quantity: 10,
      });
    }
  };

  const removeLab = (index) =>
    setLabTests(labTests.filter((_, i) => i !== index));
  const removeRx = (index) =>
    setPrescriptions(prescriptions.filter((_, i) => i !== index));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitId: id,
          chiefComplaint,
          history: clinicalHistory,
          examination,
          diagnosis,
          plan,
          labRequests: labTests,
          prescriptions,
        }),
      });

      if (!res.ok) throw new Error("Failed to save consultation");
      window.location.href = "/consultations";
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading)
    return <div className="p-20 text-center">Loading patient workspace...</div>;

  const visit = data?.visit;
  const vitals = visit?.triage_vitals || {};

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a
            href="/consultations"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-white hover:text-[#0F172A]"
          >
            <ArrowLeft size={20} />
          </a>
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">
              Clinical Workspace
            </h1>
            <p className="text-sm text-[#64748B]">
              Active Consultation: {visit?.first_name} {visit?.last_name}
            </p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-[#0F172A] px-8 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#1E293B] disabled:opacity-50"
        >
          <Save size={18} />
          {loading ? "Completing..." : "Complete Consultation"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Column: Vitals & History */}
        <div className="xl:col-span-3 space-y-6">
          {/* Vitals Summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              <Activity size={14} /> Latest Vitals
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400">Temp</p>
                <p className="text-sm font-bold text-[#0F172A]">
                  {vitals.temp || "--"}°C
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400">BP</p>
                <p className="text-sm font-bold text-[#0F172A]">
                  {vitals.bp || "--"}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400">Pulse</p>
                <p className="text-sm font-bold text-[#0F172A]">
                  {vitals.pulse || "--"} bpm
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400">SpO2</p>
                <p className="text-sm font-bold text-[#0F172A]">
                  {vitals.spo2 || "--"}%
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400">BMI</p>
                <p className="text-sm font-bold text-blue-600">
                  {vitals.bmi || "--"}
                </p>
              </div>
            </div>
            {visit?.triage_notes && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Nursing Notes
                </p>
                <p className="text-xs text-slate-600 italic">
                  "{visit.triage_notes}"
                </p>
              </div>
            )}
          </div>

          {/* Medical Alerts */}
          {(visit?.allergies || visit?.chronic_conditions) && (
            <div className="rounded-xl border border-red-100 bg-red-50/50 p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-600 mb-4">
                <AlertCircle size={14} /> Medical Alerts
              </h3>
              {visit.allergies && (
                <div className="mb-3">
                  <p className="text-[10px] font-bold text-red-400 uppercase">
                    Allergies
                  </p>
                  <p className="text-sm font-semibold text-red-800">
                    {visit.allergies}
                  </p>
                </div>
              )}
              {visit.chronic_conditions && (
                <div>
                  <p className="text-[10px] font-bold text-red-400 uppercase">
                    Chronic Conditions
                  </p>
                  <p className="text-sm font-semibold text-red-800">
                    {visit.chronic_conditions}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              <History size={14} /> Visit History
            </h3>
            <div className="space-y-3">
              <div className="relative border-l-2 border-slate-100 pl-4 pb-4">
                <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-2 border-white bg-slate-200"></div>
                <p className="text-[10px] text-slate-400">
                  Last Visit: 12 Oct 2025
                </p>
                <p className="text-xs font-bold text-[#0F172A]">
                  Acute Tonsillitis
                </p>
              </div>
              <p className="text-[10px] text-center text-slate-400">
                No more records found
              </p>
            </div>
          </div>
        </div>

        {/* Middle Column: Clinical Notes */}
        <div className="xl:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] mb-6 border-b border-slate-100 pb-4">
              <ClipboardCheck size={18} className="text-blue-500" /> Clinical
              Assessment
            </h3>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">
                  Chief Complaint
                </label>
                <textarea
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                  rows={2}
                  placeholder="Reason for visit..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">
                  History of Presenting Illness
                </label>
                <textarea
                  value={clinicalHistory}
                  onChange={(e) => setClinicalHistory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                  rows={3}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500">
                  Physical Examination
                </label>
                <textarea
                  value={examination}
                  onChange={(e) => setExamination(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#0F172A]">
                    Clinical Diagnosis
                  </label>
                  <textarea
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 outline-none focus:border-[#0F172A] focus:ring-1 focus:ring-[#0F172A]"
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500">
                    Treatment Plan
                  </label>
                  <textarea
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Lab & Pharmacy */}
        <div className="xl:col-span-4 space-y-6">
          {/* Lab Builder */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] mb-4">
              <FlaskConical size={18} className="text-purple-500" /> Lab
              Investigations
            </h3>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={currentLab}
                onChange={(e) => setCurrentLab(e.target.value)}
                placeholder="Search or type test..."
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white focus:ring-1 focus:ring-[#0F172A]"
              />
              <button
                onClick={addLabTest}
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-[#0F172A] hover:text-white"
              >
                <Plus size={20} />
              </button>
            </div>
            <div className="space-y-2">
              {labTests.map((test, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700"
                >
                  {test}
                  <button
                    onClick={() => removeLab(i)}
                    className="text-purple-400 hover:text-purple-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {labTests.length === 0 && (
                <p className="text-center py-4 text-xs text-slate-400 italic">
                  No lab tests requested
                </p>
              )}
            </div>
          </div>

          {/* Prescription Builder */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] mb-4">
              <Pill size={18} className="text-emerald-500" /> Medication /
              Pharmacy
            </h3>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={currentRx.drugName}
                onChange={(e) =>
                  setCurrentRx({ ...currentRx, drugName: e.target.value })
                }
                placeholder="Drug name..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:border-[#0F172A] focus:bg-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={currentRx.dosage}
                  onChange={(e) =>
                    setCurrentRx({ ...currentRx, dosage: e.target.value })
                  }
                  placeholder="Dosage (e.g. 500mg)"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#0F172A]"
                />
                <select
                  value={currentRx.frequency}
                  onChange={(e) =>
                    setCurrentRx({ ...currentRx, frequency: e.target.value })
                  }
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-[#0F172A]"
                >
                  <option>OD (Daily)</option>
                  <option>BD (Twice Daily)</option>
                  <option>TDS (Three Times)</option>
                  <option>QID (Four Times)</option>
                  <option>STAT (Immediately)</option>
                  <option>PRN (When needed)</option>
                </select>
              </div>
              <button
                onClick={addPrescription}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <Plus size={16} /> Add to Prescription
              </button>
            </div>
            <div className="space-y-2">
              {prescriptions.map((rx, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-bold text-emerald-800">
                      {rx.drugName}
                    </p>
                    <p className="text-[10px] text-emerald-600">
                      {rx.dosage} • {rx.frequency} • {rx.duration}
                    </p>
                  </div>
                  <button
                    onClick={() => removeRx(i)}
                    className="text-emerald-400 hover:text-emerald-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {prescriptions.length === 0 && (
                <p className="text-center py-4 text-xs text-slate-400 italic">
                  No prescriptions added
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
