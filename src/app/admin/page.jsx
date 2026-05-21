/**
 * FILE: src/app/admin/page.jsx
 *
 * Admin Panel — Facility Admin and above only.
 * Manages: branches, departments, facility settings, license, backups, DB stats.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Plus, Settings, Database, Shield, RefreshCw,
  GitBranch, Layers, CheckCircle, AlertTriangle, HardDrive,
} from "lucide-react";

function Section({ title, icon: Icon, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm mb-6">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Icon size={18} className="text-slate-500" />
        <h2 className="font-semibold text-slate-700">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function AdminPage() {
  const qc = useQueryClient();
  const [newBranch, setNewBranch] = useState({ name: "", address: "", phone: "" });
  const [newDept,   setNewDept]   = useState({ branch_id: "", name: "", code: "", type: "clinical" });
  const [facilityForm, setFac]    = useState(null);
  const [msg, setMsg]             = useState("");

  const api = (action, opts = {}) =>
    fetch(`/api/admin?action=${action}`, { credentials: "include", ...opts });
  const post = (body) =>
    fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }).then((r) => r.json());

  const { data: facilityData } = useQuery({
    queryKey: ["facility"],
    queryFn: () => api("facility").then((r) => r.json()),
    onSuccess: (d) => { if (!facilityForm && d.facility) setFac(d.facility); },
  });

  const { data: branchData, refetch: refetchBranches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api("branches").then((r) => r.json()),
  });

  const { data: deptData, refetch: refetchDepts } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api("departments").then((r) => r.json()),
  });

  const { data: licenseData } = useQuery({
    queryKey: ["license"],
    queryFn: () => api("license").then((r) => r.json()),
  });

  const { data: dbData, refetch: refetchDb } = useQuery({
    queryKey: ["db-stats"],
    queryFn: () => api("db_stats").then((r) => r.json()),
  });

  const notice = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const createBranch = async () => {
    if (!newBranch.name) return;
    const r = await post({ action: "create_branch", ...newBranch });
    if (r.ok) { notice("Branch created ✓"); setNewBranch({ name:"",address:"",phone:"" }); refetchBranches(); }
    else notice("Error: " + r.error);
  };

  const createDept = async () => {
    if (!newDept.branch_id || !newDept.name) return;
    const r = await post({ action: "create_department", ...newDept });
    if (r.ok) { notice("Department created ✓"); setNewDept({ branch_id:"",name:"",code:"",type:"clinical" }); refetchDepts(); }
    else notice("Error: " + r.error);
  };

  const saveFacility = async () => {
    const r = await post({ action: "update_facility", ...facilityForm });
    if (r.ok) notice("Facility settings saved ✓");
    else notice("Error: " + r.error);
  };

  const triggerBackup = async () => {
    const r = await post({ action: "backup" });
    if (r.ok) { notice("Backup created ✓"); refetchDb(); }
    else notice("Error: " + r.error);
  };

  const lic = licenseData?.license || {};
  const branches = branchData?.branches || [];
  const depts    = deptData?.departments || [];
  const db       = dbData || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Building2 size={24} className="text-slate-600" />
          Admin Panel
        </h1>
        {msg && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-700">{msg}</div>
        )}
      </div>

      {/* License status */}
      <Section title="License" icon={Shield}>
        <div className={`flex items-center gap-3 rounded-lg p-4 ${lic.licensed ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          {lic.licensed
            ? <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
            : <AlertTriangle size={20} className="text-red-600 flex-shrink-0" />}
          <div>
            <p className="font-semibold text-slate-700">{lic.licensed ? "Licensed ✓" : "Not Licensed"}</p>
            {lic.facilityName && <p className="text-sm text-slate-500">Facility: {lic.facilityName}</p>}
            {lic.expiresAt    && <p className="text-sm text-slate-500">Expires: {lic.expiresAt?.slice(0,10)}</p>}
            {lic.maxBranches  && <p className="text-sm text-slate-500">Max branches: {lic.maxBranches}</p>}
            {lic.error        && <p className="text-sm text-red-600">{lic.error}</p>}
          </div>
        </div>
      </Section>

      {/* Facility settings */}
      <Section title="Facility Settings" icon={Settings}>
        {facilityForm && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Facility Name</label>
              <input className="input" value={facilityForm.name || ""} onChange={(e) => setFac({ ...facilityForm, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={facilityForm.phone || ""} onChange={(e) => setFac({ ...facilityForm, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" value={facilityForm.email || ""} onChange={(e) => setFac({ ...facilityForm, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={facilityForm.address || ""} onChange={(e) => setFac({ ...facilityForm, address: e.target.value })} />
            </div>
            <div className="col-span-2 flex justify-end">
              <button onClick={saveFacility} className="btn-primary">Save Settings</button>
            </div>
          </div>
        )}
      </Section>

      {/* Branches */}
      <Section title={`Branches (${branches.length} / ${lic.maxBranches ?? 1})`} icon={GitBranch}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {branches.map((b) => (
            <div key={b.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <p className="font-medium text-slate-700">{b.name}</p>
                {b.is_hq === 1 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">HQ</span>}
              </div>
              {b.address && <p className="text-xs text-slate-400 mt-1">{b.address}</p>}
              <p className="text-xs text-slate-500 mt-2">{b.staff_count} staff</p>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-600 mb-3">Add New Branch</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Branch Name *</label>
              <input className="input" value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} placeholder="Branch A" />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={newBranch.address} onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })} placeholder="Westlands, Nairobi" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={newBranch.phone} onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })} placeholder="+254 7xx" />
            </div>
          </div>
          <button onClick={createBranch} disabled={!newBranch.name} className="btn-primary mt-3 flex items-center gap-1.5">
            <Plus size={14} /> Create Branch
          </button>
        </div>
      </Section>

      {/* Departments */}
      <Section title={`Departments (${depts.length})`} icon={Layers}>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Department</th>
                <th className="th">Branch</th>
                <th className="th">Type</th>
                <th className="th">Code</th>
                <th className="th">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {depts.map((d) => (
                <tr key={d.id}>
                  <td className="td font-medium">{d.name}</td>
                  <td className="td text-slate-500">{d.branch_name}</td>
                  <td className="td"><span className="text-xs bg-slate-100 px-2 py-0.5 rounded">{d.type}</span></td>
                  <td className="td text-slate-400">{d.code || "—"}</td>
                  <td className="td">{d.staff_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-slate-600 mb-3">Add Department</p>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="label">Branch *</label>
              <select className="input" value={newDept.branch_id} onChange={(e) => setNewDept({ ...newDept, branch_id: e.target.value })}>
                <option value="">— Select —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Name *</label>
              <input className="input" value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })} placeholder="Eye Clinic" />
            </div>
            <div>
              <label className="label">Code</label>
              <input className="input" value={newDept.code} onChange={(e) => setNewDept({ ...newDept, code: e.target.value })} placeholder="EYE" />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={newDept.type} onChange={(e) => setNewDept({ ...newDept, type: e.target.value })}>
                <option value="clinical">Clinical</option>
                <option value="laboratory">Laboratory</option>
                <option value="radiology">Radiology</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="administration">Administration</option>
                <option value="finance">Finance</option>
                <option value="hr">HR</option>
              </select>
            </div>
          </div>
          <button onClick={createDept} disabled={!newDept.branch_id || !newDept.name} className="btn-primary mt-3 flex items-center gap-1.5">
            <Plus size={14} /> Add Department
          </button>
        </div>
      </Section>

      {/* Database & Backup */}
      <Section title="Database & Backups" icon={Database}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-slate-600">Database size: <strong>{db.db_size_kb ?? "—"} KB</strong></p>
            <p className="text-xs text-slate-400 mt-0.5">Location: data/afyacore.db</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => refetchDb()} className="btn-secondary flex items-center gap-1.5 text-sm"><RefreshCw size={14} />Refresh</button>
            <button onClick={triggerBackup} className="btn-primary flex items-center gap-1.5 text-sm"><HardDrive size={14} />Backup Now</button>
          </div>
        </div>

        {db.counts && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            {Object.entries(db.counts).map(([table, count]) => (
              <div key={table} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400 truncate">{table.replace(/_/g," ")}</p>
                <p className="text-lg font-bold text-slate-700">{Number(count).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}

        {db.backups?.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-600 mb-2">Recent Backups</p>
            <div className="space-y-1">
              {db.backups.map((b) => (
                <div key={b.file} className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-50 py-1.5">
                  <span>{b.file}</span>
                  <span>{b.size_kb} KB · {b.modified?.slice(0,10)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      <style>{`
        .label { display:block; font-size:0.75rem; font-weight:600; color:#475569; margin-bottom:4px; }
        .input { width:100%; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:0.875rem; outline:none; }
        .input:focus { border-color:#3b82f6; }
        .btn-primary { background:#1d4ed8; color:#fff; border-radius:8px; padding:8px 16px; font-size:0.875rem; font-weight:600; cursor:pointer; }
        .btn-primary:hover { background:#1e40af; }
        .btn-primary:disabled { opacity:.5; cursor:not-allowed; }
        .btn-secondary { border:1px solid #e2e8f0; border-radius:8px; padding:8px 14px; font-size:0.875rem; font-weight:500; cursor:pointer; background:#fff; }
        .th { padding:8px 12px; text-align:left; font-size:0.7rem; font-weight:600; color:#94a3b8; text-transform:uppercase; }
        .td { padding:10px 12px; color:#334155; }
      `}</style>
    </div>
  );
}