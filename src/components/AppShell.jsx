/**
 * FILE: src/components/AppShell.jsx
 *
 * Root layout shell.
 * - Reads user from session
 * - Passes role to Sidebar so only permitted items render
 * - Redirects to /account/signin if not logged in
 * - Redirects to /onboarding if no facility_id
 */

import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import useUser from "@/utils/useUser";

export default function AppShell({ children }) {
  const { data: user, loading } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [isAuthPage, setIsAuthPage] = useState(false);
  const [fullUser, setFullUser] = useState(null);

  useEffect(() => {
    const path = window.location.pathname;
    setIsAuthPage(
      path.startsWith("/account") || path.startsWith("/onboarding")
    );
  }, []);

  useEffect(() => {
    if (user && !isAuthPage) {
      fetch("/api/user/profile", { credentials: "include" })
        .then((r) => r.json())
        .then((data) => {
          if (data.user) {
            setFullUser(data.user);
            if (
              !data.user.facility_id &&
              !window.location.pathname.startsWith("/onboarding")
            ) {
              window.location.href = "/onboarding";
            }
          }
        })
        .catch(() => {});
    }
  }, [user, isAuthPage]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#1A5276] border-t-transparent" />
          <p className="text-sm text-slate-500">Loading AfyaCore…</p>
        </div>
      </div>
    );
  }

  if (isAuthPage) return <>{children}</>;

  if (!user) {
    if (
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/account")
    ) {
      window.location.href = "/account/signin";
    }
    return null;
  }

  const activeUser = fullUser || user;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        userRole={activeUser?.role}
        branchName={activeUser?.branch_name}
        facilityName={activeUser?.facility_name}
      />
      <div
        className={`flex flex-1 flex-col transition-all duration-300 ${
          collapsed ? "ml-[72px]" : "ml-64"
        }`}
      >
        <Header user={activeUser} />
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}