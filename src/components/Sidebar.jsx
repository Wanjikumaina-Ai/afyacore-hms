/**
 * FILE: src/components/Sidebar.jsx
 */

import {
  LayoutDashboard,
  Users,
  Calendar,
  ListOrdered,
  Activity,
  Stethoscope,
  FlaskConical,
  Pill,
  FileText,
  CreditCard,
  Package,
  Bed,
  BarChart3,
  UsersRound,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Banknote,
} from "lucide-react";
import { useState, useEffect } from "react";

const menuItems = [
  { id: "dashboard",     label: "Dashboard",     icon: LayoutDashboard, path: "/" },
  { id: "patients",      label: "Patients",       icon: Users,           path: "/patients" },
  { id: "appointments",  label: "Appointments",   icon: Calendar,        path: "/appointments" },
  { id: "queue",         label: "Queue",          icon: ListOrdered,     path: "/queue" },
  { id: "triage",        label: "Triage",         icon: Activity,        path: "/triage" },
  { id: "consultations", label: "Consultations",  icon: Stethoscope,     path: "/consultations" },
  { id: "lab",           label: "Lab",            icon: FlaskConical,    path: "/lab" },
  { id: "pharmacy",      label: "Pharmacy",       icon: Pill,            path: "/pharmacy" },
  { id: "billing",       label: "Billing",        icon: FileText,        path: "/billing" },
  { id: "payments",      label: "Payments",       icon: CreditCard,      path: "/payments" },
  { id: "inventory",     label: "Inventory",      icon: Package,         path: "/inventory" },
  { id: "inpatient",     label: "Inpatient",      icon: Bed,             path: "/inpatient" },
  { id: "reports",       label: "Reports",        icon: BarChart3,       path: "/reports" },
  { id: "staff",         label: "Staff & Roles",  icon: UsersRound,      path: "/staff" },
  { id: "payroll",       label: "Payroll",        icon: Banknote,        path: "/payroll" },
  { id: "audit",         label: "Audit Logs",     icon: ShieldCheck,     path: "/audit" },
  { id: "settings",      label: "Settings",       icon: Settings,        path: "/settings" },
];

export default function Sidebar({ collapsed, setCollapsed }) {
  const [activeItem, setActiveItem] = useState("dashboard");

  useEffect(() => {
    const path = window.location.pathname;
    const item = menuItems.find(
      (i) =>
        i.path === path ||
        (path !== "/" && i.path !== "/" && path.startsWith(i.path))
    );
    if (item) setActiveItem(item.id);
  }, []);

  return (
    <div
      className={`fixed left-0 top-0 z-50 flex h-full flex-col border-r border-slate-200 bg-white transition-all duration-300 ${collapsed ? "w-20" : "w-64"}`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-6 border-b border-slate-100">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F172A] text-white">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="text-lg font-bold text-[#0F172A]">AfyaCore</span>
          </div>
        )}
        {collapsed && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F172A] text-white">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:text-slate-600 lg:absolute lg:-right-3 lg:top-8"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-hide">
        <nav className="space-y-0.5 px-3">
          {menuItems.map((item) => (
            <a
              key={item.id}
              href={item.path}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                activeItem === item.id
                  ? "bg-[#0F172A] text-white"
                  : "text-[#64748B] hover:bg-slate-50 hover:text-[#0F172A]"
              }`}
            >
              <item.icon
                size={20}
                className={
                  activeItem === item.id
                    ? "text-white"
                    : "text-[#94A3B8] group-hover:text-[#0F172A]"
                }
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && activeItem === item.id && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />
              )}
            </a>
          ))}
        </nav>
      </div>

      {/* Sign out */}
      <div className="mt-auto border-t border-slate-100 p-4">
        <a
          href="/account/logout"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-all"
        >
          <LogOut size={20} />
          {!collapsed && <span>Sign Out</span>}
        </a>
      </div>
    </div>
  );
}