import { lazy, Suspense, useEffect, useState } from "react";
import { createHashRouter, RouterProvider, Navigate, useLocation } from "react-router";
import { useAuthStore } from "./stores";
import ServerSetupWizard from "../setup/ServerSetupWizard";

// ── Lazy loaded modules ───────────────────────────────────────
const MainLayout         = lazy(() => import("./components/layout/MainLayout"));
const LoginPage          = lazy(() => import("./routes/login"));
const DashboardPage      = lazy(() => import("./routes/dashboard"));
const PatientsPage       = lazy(() => import("./routes/patients").then(m => ({ default: m.default })));
const RegisterPatient    = lazy(() => import("./routes/patients").then(m => ({ default: m.RegisterPatientPage })));
const VisitsPage         = lazy(() => import("./routes/visits"));
const AppointmentsPage   = lazy(() => import("./routes/appointments"));
const AdmissionsPage     = lazy(() => import("./routes/admissions"));
const LaboratoryPage     = lazy(() => import("./routes/laboratory"));
const PharmacyPage       = lazy(() => import("./routes/pharmacy"));
const BillingPage        = lazy(() => import("./routes/billing"));
const StaffPage          = lazy(() => import("./routes/staff"));
const AuditPage          = lazy(() => import("./routes/audit"));
const SettingsPage       = lazy(() => import("./routes/settings"));
const ReportsPage        = lazy(() => import("./routes/reports"));
const UsersPage          = lazy(() => import("./routes/users"));
const PayrollPage        = lazy(() => import("./routes/payroll"));
const InventoryPage      = lazy(() => import("./routes/inventory"));
const AttendancePage     = lazy(() => import("./routes/attendance"));

// ── Loading spinner ───────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "70vh", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 36, height: 36, border: "3px solid #1e293b", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <span style={{ color: "#475569", fontSize: 13 }}>Loading...</span>
    </div>
  );
}

// ── Auth guard ────────────────────────────────────────────────
function RequireAuth({ children, permission }: { children: React.ReactNode; permission?: string }) {
  const { user, hasPermission } = useAuthStore();
  const location = useLocation();

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/login" replace />;
  }

  if (permission) {
    const [mod, res, act] = permission.split(":");
    if (!hasPermission(mod, res, act)) {
      return (
        <div style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 48 }}>🚫</div>
          <h2 style={{ color: "#f8fafc", margin: "16px 0 8px" }}>Access Denied</h2>
          <p style={{ color: "#64748b" }}>You don't have permission to access this module.</p>
        </div>
      );
    }
  }
  return <>{children}</>;
}

function S({ children, permission }: { children: React.ReactNode; permission?: string }) {
  return (
    <RequireAuth permission={permission}>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </RequireAuth>
  );
}

// ── Setup guard ───────────────────────────────────────────────
// Redirects to /setup if the server has not been configured yet
function SetupGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking]     = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    // Check via API if setup is complete
    fetch("/api/system/setup-status")
      .then(r => r.json())
      .then(data => {
        setNeedsSetup(!data.setupComplete);
        setChecking(false);
      })
      .catch(() => {
        // If API is not reachable, assume setup needed
        setNeedsSetup(true);
        setChecking(false);
      });
  }, []);

  if (checking) return <PageLoader />;
  if (needsSetup) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

// ── Router (HashRouter for Electron file:// protocol) ─────────
const router = createHashRouter([
  // Setup wizard — shown before anything if hospital not configured
  {
    path: "/setup",
    element: (
      <Suspense fallback={<PageLoader />}>
        <ServerSetupWizard />
      </Suspense>
    ),
  },

  // Login
  {
    path: "/login",
    element: (
      <Suspense fallback={<PageLoader />}>
        <SetupGuard>
          <LoginPage />
        </SetupGuard>
      </Suspense>
    ),
  },

  // Main authenticated app
  {
    path: "/",
    element: (
      <SetupGuard>
        <RequireAuth>
          <Suspense fallback={<PageLoader />}>
            <MainLayout />
          </Suspense>
        </RequireAuth>
      </SetupGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard",       element: <S><DashboardPage /></S> },

      // Patients
      { path: "patients",          element: <S permission="patients:patients:read"><PatientsPage /></S> },
      { path: "patients/new",      element: <S permission="patients:patients:create"><RegisterPatient /></S> },
      { path: "patients/:id",      element: <S permission="patients:patients:read"><PatientsPage /></S> },
      { path: "patients/:id/edit", element: <S permission="patients:patients:update"><RegisterPatient /></S> },

      // Clinical
      { path: "visits",            element: <S permission="clinical:visits:read"><VisitsPage /></S> },
      { path: "visits/new",        element: <S permission="clinical:visits:create"><VisitsPage /></S> },
      { path: "appointments",      element: <S permission="clinical:appointments:read"><AppointmentsPage /></S> },
      { path: "appointments/new",  element: <S permission="clinical:appointments:create"><AppointmentsPage /></S> },
      { path: "admissions",        element: <S permission="clinical:admissions:read"><AdmissionsPage /></S> },
      { path: "admissions/new",    element: <S permission="clinical:admissions:create"><AdmissionsPage /></S> },
      { path: "emergency",         element: <S permission="clinical:emergency:read"><AdmissionsPage /></S> },

      // Diagnostics
      { path: "laboratory",        element: <S permission="laboratory:requests:read"><LaboratoryPage /></S> },
      { path: "radiology",         element: <S permission="radiology:requests:read"><LaboratoryPage /></S> },

      // Pharmacy
      { path: "prescriptions",     element: <S permission="pharmacy:prescriptions:read"><PharmacyPage /></S> },
      { path: "prescriptions/new", element: <S permission="pharmacy:prescriptions:create"><PharmacyPage /></S> },
      { path: "dispensing",        element: <S permission="pharmacy:dispensing:read"><PharmacyPage /></S> },
      { path: "pharmacy/inventory",element: <S permission="pharmacy:inventory:read"><PharmacyPage /></S> },

      // Finance
      { path: "billing",           element: <S permission="finance:invoices:read"><BillingPage /></S> },
      { path: "billing/new",       element: <S permission="finance:invoices:create"><BillingPage /></S> },
      { path: "payments",          element: <S permission="finance:payments:read"><BillingPage /></S> },
      { path: "insurance",         element: <S permission="finance:insurance:read"><BillingPage /></S> },
      { path: "payroll",           element: <S permission="finance:payroll:read"><PayrollPage /></S> },
      { path: "accounting",        element: <S permission="finance:accounts:read"><BillingPage /></S> },

      // HR
      { path: "staff",             element: <S permission="hr:users:read"><StaffPage /></S> },
      { path: "attendance",        element: <S permission="hr:attendance:read"><AttendancePage /></S> },
      { path: "leave",             element: <S permission="hr:leave:read"><StaffPage /></S> },
      { path: "shifts",            element: <S permission="hr:shifts:read"><StaffPage /></S> },

      // Inventory
      { path: "inventory",         element: <S permission="inventory:stock:read"><InventoryPage /></S> },
      { path: "procurement",       element: <S permission="inventory:po:read"><InventoryPage /></S> },
      { path: "suppliers",         element: <S permission="inventory:suppliers:read"><InventoryPage /></S> },
      { path: "assets",            element: <S permission="inventory:assets:read"><InventoryPage /></S> },

      // Analytics
      { path: "reports",           element: <S permission="analytics:reports:read"><ReportsPage /></S> },
      { path: "kpis",              element: <S permission="analytics:kpis:read"><ReportsPage /></S> },

      // Admin
      { path: "users",             element: <S permission="hr:users:read"><UsersPage /></S> },
      { path: "audit",             element: <S permission="admin:audit:read"><AuditPage /></S> },
      { path: "settings",          element: <S permission="admin:settings:read"><SettingsPage /></S> },
      { path: "branches",          element: <S permission="admin:branches:read"><SettingsPage /></S> },
      { path: "profile",           element: <S><SettingsPage /></S> },
      { path: "change-password",   element: <S><SettingsPage /></S> },

      // 404
      {
        path: "*",
        element: (
          <div style={{ padding: 60, textAlign: "center" }}>
            <div style={{ fontSize: 64 }}>🏥</div>
            <h2 style={{ color: "#f8fafc", margin: "16px 0 8px" }}>Page not found</h2>
            <a href="#/dashboard" style={{ color: "#3b82f6" }}>← Back to Dashboard</a>
          </div>
        ),
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
