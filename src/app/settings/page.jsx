import { useQuery } from "@tanstack/react-query";
import {
  Settings as SettingsIcon,
  Building,
  Shield,
  Bell,
  Globe,
  Save,
  HelpCircle,
} from "lucide-react";
import { useState } from "react";

export default function SettingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const res = await fetch("/api/user/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
  });

  const [activeTab, setActiveTab] = useState("facility");

  const tabs = [
    { id: "facility", label: "Facility Profile", icon: Building },
    { id: "security", label: "Security & RBAC", icon: Shield },
    { id: "notifications", label: "Alerts & SMS", icon: Bell },
    { id: "system", label: "System Config", icon: Globe },
  ];

  if (isLoading)
    return <div className="p-20 text-center">Loading settings...</div>;

  const user = data?.user;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">System Settings</h1>
        <p className="text-sm text-[#64748B]">
          Configure facility details, user permissions, and global preferences
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Sidebar Tabs */}
        <div className="lg:col-span-1 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-[#0F172A] text-white shadow-lg shadow-slate-200"
                  : "text-slate-600 hover:bg-white hover:text-[#0F172A]"
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
          <div className="mt-8 rounded-xl bg-blue-50 p-4 border border-blue-100">
            <div className="flex gap-2 text-blue-700 mb-2">
              <HelpCircle size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">
                Need Help?
              </span>
            </div>
            <p className="text-[10px] text-blue-600 font-medium">
              Contact AfyaCore Support for multi-branch configuration or custom
              lab machine integrations.
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            {activeTab === "facility" && (
              <div className="space-y-8">
                <div className="flex items-center gap-6 border-b border-slate-100 pb-8">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100 border-2 border-dashed border-slate-300 text-slate-400">
                    <Building size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0F172A]">
                      {user?.facility_name || "Facility Profile"}
                    </h3>
                    <p className="text-sm text-slate-500">
                      Update your hospital logo and contact information
                    </p>
                    <button className="mt-2 text-xs font-bold text-blue-600 hover:underline">
                      Change Hospital Logo
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Official Name
                    </label>
                    <input
                      type="text"
                      defaultValue={user?.facility_name}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Registration Number
                    </label>
                    <input
                      type="text"
                      placeholder="HOSP/2026/001"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Primary Phone
                    </label>
                    <input
                      type="text"
                      placeholder="+254 700 000 000"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Billing Currency
                    </label>
                    <select className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none focus:bg-white">
                      <option>Kenyan Shilling (KSh)</option>
                      <option>US Dollar ($)</option>
                      <option>Euro (€)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100">
                  <button className="flex items-center gap-2 rounded-lg bg-[#0F172A] px-6 py-2 text-sm font-semibold text-white hover:bg-[#1E293B]">
                    <Save size={18} />
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {activeTab !== "facility" && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <SettingsIcon
                  size={48}
                  className="text-slate-200 mb-4 animate-spin-slow"
                />
                <h3 className="text-lg font-bold text-slate-400 uppercase tracking-widest">
                  Module Restricted
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  This module is currently being optimized for your enterprise
                  plan.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 10s linear infinite;
        }
      `}</style>
    </div>
  );
}
