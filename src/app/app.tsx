import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate, useLocation } from "react-router";
import { useAuthStore } from "./stores";
import MainLayout from "./components/layout/MainLayout";
import LoginPage from "./routes/login";
import DashboardPage from "./routes/dashboard";
import PatientsPage, { RegisterPatientPage } from "./routes/patients";

// ─── Lazy-loaded routes ───────────────────────────────────────────────────────
const VisitsPage = lazy(() => import("./routes/visits"));
const AppointmentsPage = lazy(() => import("./routes/appointments"));
const AdmissionsPage = lazy(() => import("./routes/admissions"));
const LaboratoryPage = lazy(() => import("./routes/laboratory"));
const PharmacyPage = lazy(() => import("./routes/pharmacy"));
const BillingPage = lazy(() => import("./routes/billing"));
const PayrollPage = lazy(() => import("./routes/payroll"));
const StaffPage = lazy(() => import("./routes/staff"));
const AttendancePage = lazy(() => import("./routes/attendance"));
const InventoryPage = lazy(() => import("./routes/inventory"));
const AuditPage = lazy(() => import("./routes/audit"));
const SettingsPage = lazy(() => import("./routes/settings"));
const ReportsPage = lazy(() => import("./routes/reports"));
const UsersPage = lazy(() => import("./routes/users"));
const PatientDetailPage = lazy(() => import("./routes/patient-detail"));
const LicensePage = lazy(() => import("./routes/license"));

// ─── Loading fallback ─────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
      <div style={{ width: 40, height: 40, border: "3px solid #e2e8f0", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <span style={{ color: "#64748b", fontSize: 14 }}>Loading module...</span>
    </div>
  );
}

// ─── Auth guard ───────────────────────────────────────────────────────────────
function RequireAuth({ children, permission }: { children: React.ReactNode; permission?: string }) {
  const { user, hasPermission } = useAuthStore();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/login" replace />;
  }

  if (permission) {
    const [module, resource, action] = permission.split(":");
    if (!hasPermission(module, resource, action)) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h2 style={{ color: "#0f172a", marginBottom: 8 }}>Access Denied</h2>
          <p style={{ color: "#64748b" }}>You don't have permission to access this module.</p>
          <p style={{ color: "#94a3b8", fontSize: 13 }}>Required: <code>{permission}</code></p>
        </div>
      );
    }
  }

  return <>{children}</>;
}

// ─── Suspense wrapper ─────────────────────────────────────────────────────────
function S({ children, permission }: { children: React.ReactNode; permission?: string }) {
  return (
    <RequireAuth permission={permission}>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </RequireAuth>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────
const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "dashboard", element: <S><DashboardPage /></S> },

      // Patients
      { path: "patients", element: <S permission="patients:patients:read"><PatientsPage /></S> },
      { path: "patients/new", element: <S permission="patients:patients:create"><RegisterPatientPage /></S> },
      { path: "patients/:id", element: <S permission="patients:patients:read"><PatientDetailPage /></S> },
      { path: "patients/:id/edit", element: <S permission="patients:patients:update"><RegisterPatientPage /></S> },

      // Clinical
      { path: "visits", element: <S permission="clinical:visits:read"><VisitsPage /></S> },
      { path: "visits/new", element: <S permission="clinical:visits:create"><VisitsPage /></S> },
      { path: "appointments", element: <S permission="clinical:appointments:read"><AppointmentsPage /></S> },
      { path: "appointments/new", element: <S permission="clinical:appointments:create"><AppointmentsPage /></S> },
      { path: "admissions", element: <S permission="clinical:admissions:read"><AdmissionsPage /></S> },
      { path: "admissions/new", element: <S permission="clinical:admissions:create"><AdmissionsPage /></S> },
      { path: "emergency", element: <S permission="clinical:emergency:read"><AdmissionsPage /></S> },

      // Diagnostics
      { path: "laboratory", element: <S permission="laboratory:requests:read"><LaboratoryPage /></S> },
      { path: "lab/request", element: <S permission="laboratory:requests:create"><LaboratoryPage /></S> },
      { path: "radiology", element: <S permission="radiology:requests:read"><LaboratoryPage /></S> },

      // Pharmacy
      { path: "prescriptions", element: <S permission="pharmacy:prescriptions:read"><PharmacyPage /></S> },
      { path: "prescriptions/new", element: <S permission="pharmacy:prescriptions:create"><PharmacyPage /></S> },
      { path: "dispensing", element: <S permission="pharmacy:dispensing:read"><PharmacyPage /></S> },
      { path: "pharmacy/inventory", element: <S permission="pharmacy:inventory:read"><PharmacyPage /></S> },

      // Finance
      { path: "billing", element: <S permission="finance:invoices:read"><BillingPage /></S> },
      { path: "billing/new", element: <S permission="finance:invoices:create"><BillingPage /></S> },
      { path: "payments", element: <S permission="finance:payments:read"><BillingPage /></S> },
      { path: "insurance", element: <S permission="finance:insurance:read"><BillingPage /></S> },
      { path: "accounting", element: <S permission="finance:accounts:read"><BillingPage /></S> },
      { path: "payroll", element: <S permission="finance:payroll:read"><PayrollPage /></S> },

      // HR
      { path: "staff", element: <S permission="hr:users:read"><StaffPage /></S> },
      { path: "attendance", element: <S permission="hr:attendance:read"><AttendancePage /></S> },
      { path: "leave", element: <S permission="hr:leave:read"><StaffPage /></S> },
      { path: "shifts", element: <S permission="hr:shifts:read"><StaffPage /></S> },

      // Inventory
      { path: "inventory", element: <S permission="inventory:stock:read"><InventoryPage /></S> },
      { path: "procurement", element: <S permission="inventory:po:read"><InventoryPage /></S> },
      { path: "suppliers", element: <S permission="inventory:suppliers:read"><InventoryPage /></S> },
      { path: "assets", element: <S permission="inventory:assets:read"><InventoryPage /></S> },

      // Analytics
      { path: "reports", element: <S permission="analytics:reports:read"><ReportsPage /></S> },
      { path: "kpis", element: <S permission="analytics:kpis:read"><ReportsPage /></S> },

      // Admin
      { path: "users", element: <S permission="hr:users:read"><UsersPage /></S> },
      { path: "branches", element: <S permission="admin:branches:read"><SettingsPage /></S> },
      { path: "audit", element: <S permission="admin:audit:read"><AuditPage /></S> },
      { path: "settings", element: <S permission="admin:settings:read"><SettingsPage /></S> },
      { path: "license", element: <S permission="admin:license:read"><LicensePage /></S> },

      // Profile
      { path: "profile", element: <S><SettingsPage /></S> },
      { path: "change-password", element: <S><SettingsPage /></S> },

      // 404
      { path: "*", element: <NotFound /> },
    ],
  },
]);

function NotFound() {
  return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🏥</div>
      <h2 style={{ fontSize: 24, color: "#0f172a", marginBottom: 8 }}>Page not found</h2>
      <p style={{ color: "#64748b", marginBottom: 24 }}>The module you're looking for doesn't exist.</p>
      <a href="/dashboard" style={{ color: "#3b82f6", textDecoration: "none", fontWeight: 600 }}>← Back to Dashboard</a>
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────
export default function App() {
  return <RouterProvider router={router} />;
}
