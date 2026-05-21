/**
 * FILE: src/app/staff/page.jsx
 *
 * Staff & HR Management
 * Full CRUD: add staff, update roles/salaries, deactivate, view profiles.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Search, Shield, DollarSign, Edit3,
  UserX, Phone, Mail, Building, ChevronDown, X, Save,
  CheckCircle2, AlertCircle, Briefcase, Hash,
} from "lucide-react";
import { useState } from "react";

const ROLES = ["admin", "doctor", "nurse", "pharmacist", "lab", "billing", "receptionist", "hr", "staff"];
const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "locum"];
const ROLE_COLORS = {
  admin:        "bg-red-100 text-red-700",
  doctor:       "bg-blue-100 text-blue-700",
  nurse:        "bg-emerald-100 text-emerald-700",
  pharmacist:   "bg-purple-100 text-purple-700",
  lab:          "bg-amber-100 text-amber-700",
  billing:      "bg-cyan-100 text-cyan-700",
  receptionist: "bg-pink-100 text-pink-700",
  hr:           "bg-indigo-100 text-indigo-700",
  staff:        "bg-slate-100 text-slate-600",
};

function fmt(n) {
  return `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;
}

// ── Add/Edit Modal ──────────────────────────────────────────────────────────
function StaffModal({ staff, departments, onClose }) {
  const qc = useQueryClient();
  const isEdit = !!staff;

  const [form, setForm] = useState({
    name:           staff?.name || "",
    email:          staff?.email || "",
    role:           staff?.role || "staff",
    departmentId:   staff?.department_id || "",
    jobTitle:       staff?.job_title || "",
    employmentType: staff?.employment_type || "full_time",
    basicSalary:    staff?.basic_salary || "",
    allowances:     staff?.allowances || "",
    bankName:       staff?.bank_name || "",
    bankAccount:    staff?.bank_account || "",
    kraPin:         staff?.kra_pin || "",
    nssfNumber:     staff?.nssf_number || "",
    shifNumber:     staff?.shif_number || "",
    nationalId:     staff?.national_id || "",
    dateOfBirth:    staff?.date_of_birth || "",
    hireDate:       staff?.hire_date || "",
  });

  const mutation = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/staff", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { ...data, userId: staff.id } : data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries(["staff"]);
      onClose();
    },
  });

  const [activeTab, setActiveTab] = useState("basic");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-[#0F172A]">
              {isEdit ? `Edit: ${staff.name}` : "Add New Staff Member"}
            </h2>
            {isEdit && staff.staff_number && (
              <p className="text-xs text-slate-500 font-mono">{staff.staff_number}</p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 bg-white px-6">
          {[["basic", "Basic Info"], ["payroll", "Salary & Payroll"], ["compliance", "Compliance"]].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all ${activeTab === id ? "border-[#0F172A] text-[#0F172A]" : "border-transparent text-slate-500 hover:text-[#0F172A]"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {mutation.isError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <AlertCircle size={16} /> {mutation.error.message}
            </div>
          )}

          {activeTab === "basic" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Full Name *" value={form.name} onChange={v => setForm(p => ({...p, name: v}))} />
              <Field label="Email Address *" type="email" value={form.email} onChange={v => setForm(p => ({...p, email: v}))} disabled={isEdit} />
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Role *</label>
                <select value={form.role} onChange={e => setForm(p => ({...p, role: e.target.value}))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:bg-white focus:border-slate-400">
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Department</label>
                <select value={form.departmentId} onChange={e => setForm(p => ({...p, departmentId: e.target.value}))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:bg-white">
                  <option value="">— None —</option>
                  {departments?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <Field label="Job Title" value={form.jobTitle} onChange={v => setForm(p => ({...p, jobTitle: v}))} />
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Employment Type</label>
                <select value={form.employmentType} onChange={e => setForm(p => ({...p, employmentType: e.target.value}))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:bg-white">
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
              <Field label="Hire Date" type="date" value={form.hireDate} onChange={v => setForm(p => ({...p, hireDate: v}))} />
              <Field label="Date of Birth" type="date" value={form.dateOfBirth} onChange={v => setForm(p => ({...p, dateOfBirth: v}))} />
              {!isEdit && (
                <div className="col-span-2">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
                    <strong>Default password:</strong> <code className="font-mono bg-amber-100 px-1 rounded">AfyaCore@2026</code> — staff must change on first login.
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "payroll" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Basic Salary (KES)" type="number" value={form.basicSalary} onChange={v => setForm(p => ({...p, basicSalary: v}))} placeholder="e.g. 60000" />
              <Field label="Total Allowances (KES)" type="number" value={form.allowances} onChange={v => setForm(p => ({...p, allowances: v}))} placeholder="e.g. 10000" />
              <Field label="Bank Name" value={form.bankName} onChange={v => setForm(p => ({...p, bankName: v}))} placeholder="e.g. Equity Bank" />
              <Field label="Bank Account Number" value={form.bankAccount} onChange={v => setForm(p => ({...p, bankAccount: v}))} />
              {(form.basicSalary || form.allowances) && (
                <div className="col-span-2">
                  <PayrollPreview basic={parseFloat(form.basicSalary)||0} allowances={parseFloat(form.allowances)||0} />
                </div>
              )}
            </div>
          )}

          {activeTab === "compliance" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="KRA PIN" value={form.kraPin} onChange={v => setForm(p => ({...p, kraPin: v}))} placeholder="A000000000X" />
              <Field label="National ID" value={form.nationalId} onChange={v => setForm(p => ({...p, nationalId: v}))} />
              <Field label="NSSF Number" value={form.nssfNumber} onChange={v => setForm(p => ({...p, nssfNumber: v}))} />
              <Field label="SHIF Number" value={form.shifNumber} onChange={v => setForm(p => ({...p, shifNumber: v}))} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={() => mutation.mutate(form)}
            disabled={mutation.isPending || !form.name || !form.email}
            className="flex items-center gap-2 rounded-lg bg-[#0F172A] px-6 py-2 text-sm font-semibold text-white hover:bg-[#1E293B] disabled:opacity-50">
            {mutation.isPending ? "Saving..." : <><Save size={16} /> {isEdit ? "Save Changes" : "Add Staff"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, disabled }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:bg-white focus:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed" />
    </div>
  );
}

function PayrollPreview({ basic, allowances }) {
  // Quick inline PAYE approximation for preview
  const gross = basic + allowances;
  const nssf = Math.min(gross * 0.06, 2160);
  const housing = gross * 0.015;
  const shif = Math.max(gross * 0.0275, 300);
  const taxable = Math.max(gross - nssf, 0);
  const paye = Math.max(calcPAYE(taxable) - 2400, 0);
  const net = gross - nssf - housing - shif - paye;

  return (
    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-3">Payroll Preview (2026)</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        {[["Gross Pay", gross], ["NSSF (Employee)", nssf], ["SHIF", shif], ["Housing Levy", housing], ["PAYE", paye]].map(([l, v]) => (
          <div key={l} className="flex justify-between"><span className="text-slate-600">{l}</span><span className="font-mono font-semibold text-slate-800">{fmt(v)}</span></div>
        ))}
        <div className="col-span-2 mt-2 pt-2 border-t border-emerald-300 flex justify-between">
          <span className="font-bold text-emerald-800">Est. Net Pay</span>
          <span className="font-mono font-bold text-emerald-800">{fmt(net)}</span>
        </div>
      </div>
    </div>
  );
}

function calcPAYE(taxable) {
  const bands = [[24000,0.10],[32333,0.25],[500000,0.30],[800000,0.325],[Infinity,0.35]];
  let tax = 0, prev = 0;
  for (const [top, rate] of bands) {
    if (taxable <= prev) break;
    tax += Math.min(taxable - prev, top - prev) * rate;
    prev = top;
  }
  return tax;
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function StaffPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editStaff, setEditStaff] = useState(null);
  const [filterRole, setFilterRole] = useState("");
  const [deactivating, setDeactivating] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["staff", search],
    queryFn: async () => {
      const res = await fetch(`/api/staff?search=${encodeURIComponent(search)}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const deactivate = useMutation({
    mutationFn: async (userId) => {
      const res = await fetch(`/api/staff?userId=${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to deactivate");
    },
    onSuccess: () => { qc.invalidateQueries(["staff"]); setDeactivating(null); },
  });

  const staff = (data?.staff || []).filter(s =>
    !filterRole || s.role === filterRole
  );
  const depts = data?.departments || [];

  const activeCount   = staff.filter(s => s.is_active !== 0).length;
  const totalSalary   = staff.reduce((a, s) => a + (s.basic_salary || 0) + (s.allowances || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Staff & HR Management</h1>
          <p className="text-sm text-[#64748B]">Manage staff profiles, roles, and payroll data</p>
        </div>
        <button onClick={() => { setEditStaff(null); setShowModal(true); }}
          className="flex items-center gap-2 rounded-xl bg-[#0F172A] px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#1E293B]">
          <Plus size={18} /> Add Staff Member
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Staff", value: staff.length, icon: Users, color: "bg-blue-500" },
          { label: "Active", value: activeCount, icon: CheckCircle2, color: "bg-emerald-500" },
          { label: "Departments", value: depts.length, icon: Building, color: "bg-purple-500" },
          { label: "Total Payroll", value: fmt(totalSalary), icon: DollarSign, color: "bg-amber-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${color} text-white`}>
              <Icon size={20} />
            </div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-bold text-[#0F172A]">{value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input type="text" placeholder="Search by name, email, or staff number…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-4 text-sm outline-none focus:border-slate-400" />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-slate-400">
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center">
          <Users size={48} className="text-slate-200 mb-4" />
          <p className="font-bold text-slate-400 text-lg">No staff found</p>
          <p className="text-sm text-slate-400">Add your first staff member to get started</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {["Staff #", "Name & Role", "Department", "Salary", "Employment", "Status", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {staff.map((s) => (
                  <tr key={s.id} className={`transition-colors hover:bg-slate-50 ${s.is_active === 0 ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.staff_number || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#0F172A]">{s.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ROLE_COLORS[s.role] || "bg-slate-100 text-slate-600"}`}>
                          {s.role}
                        </span>
                        {s.job_title && <span className="text-xs text-slate-400">{s.job_title}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.department_name || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#0F172A]">{fmt(s.basic_salary)}</div>
                      {s.allowances > 0 && <div className="text-xs text-slate-400">+{fmt(s.allowances)} allowances</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                        {(s.employment_type || "").replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.is_active !== 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.is_active !== 0 ? "bg-emerald-500" : "bg-red-500"}`} />
                        {s.is_active !== 0 ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditStaff(s); setShowModal(true); }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600" title="Edit">
                          <Edit3 size={15} />
                        </button>
                        {s.is_active !== 0 && (
                          <button onClick={() => setDeactivating(s)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Deactivate">
                            <UserX size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deactivate confirm */}
      {deactivating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100">
              <UserX className="text-red-600" size={24} />
            </div>
            <h3 className="text-lg font-bold text-[#0F172A]">Deactivate {deactivating.name}?</h3>
            <p className="mt-2 text-sm text-slate-500">Their account will be locked. All audit history is preserved. This action is reversible by an admin.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeactivating(null)} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => deactivate.mutate(deactivating.id)} disabled={deactivate.isPending}
                className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {deactivate.isPending ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <StaffModal staff={editStaff} departments={depts} onClose={() => { setShowModal(false); setEditStaff(null); }} />
      )}
    </div>
  );
}