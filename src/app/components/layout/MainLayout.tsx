import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router";
import {
  useAuthStore,
  useUIStore,
  useNotificationStore,
  useDashboardStore,
} from "../stores";

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  {
    section: "Clinical",
    roles: ["super_admin","hospital_director","branch_admin","doctor","specialist","surgeon","dentist","nurse","receptionist","registration_staff","appointment_officer"],
    items: [
      { label: "Dashboard",       path: "/dashboard",      icon: "🏥", perm: null },
      { label: "Appointments",    path: "/appointments",   icon: "📅", perm: "clinical:appointments:read" },
      { label: "Patients",        path: "/patients",       icon: "👤", perm: "patients:patients:read" },
      { label: "OPD Visits",      path: "/visits",         icon: "🩺", perm: "clinical:visits:read" },
      { label: "Admissions (IPD)",path: "/admissions",     icon: "🛏",  perm: "clinical:admissions:read" },
      { label: "Theatre",         path: "/theatre",        icon: "🔬", perm: "clinical:surgery:read" },
      { label: "Emergency",       path: "/emergency",      icon: "🚨", perm: "clinical:emergency:read" },
    ],
  },
  {
    section: "Diagnostics",
    roles: ["super_admin","hospital_director","branch_admin","doctor","specialist","lab_technician","radiologist"],
    items: [
      { label: "Laboratory",   path: "/laboratory",  icon: "🧪", perm: "laboratory:requests:read" },
      { label: "Radiology",    path: "/radiology",   icon: "📡", perm: "radiology:requests:read" },
    ],
  },
  {
    section: "Pharmacy",
    roles: ["super_admin","hospital_director","branch_admin","pharmacist","doctor","specialist"],
    items: [
      { label: "Prescriptions", path: "/prescriptions", icon: "💊", perm: "pharmacy:prescriptions:read" },
      { label: "Dispensing",    path: "/dispensing",    icon: "🏪", perm: "pharmacy:dispensing:read" },
      { label: "Drug Inventory",path: "/pharmacy/inventory", icon: "📦", perm: "pharmacy:inventory:read" },
    ],
  },
  {
    section: "Finance",
    roles: ["super_admin","hospital_director","branch_admin","finance_manager","accountant","billing_officer","insurance_officer","payroll_officer"],
    items: [
      { label: "Billing",         path: "/billing",        icon: "🧾", perm: "finance:invoices:read" },
      { label: "Payments",        path: "/payments",       icon: "💰", perm: "finance:payments:read" },
      { label: "Insurance Claims",path: "/insurance",      icon: "🏦", perm: "finance:insurance:read" },
      { label: "Accounting",      path: "/accounting",     icon: "📊", perm: "finance:accounts:read" },
      { label: "Payroll",         path: "/payroll",        icon: "💵", perm: "finance:payroll:read" },
    ],
  },
  {
    section: "HR & Staff",
    roles: ["super_admin","hospital_director","branch_admin","hr_manager"],
    items: [
      { label: "Staff",       path: "/staff",       icon: "👥", perm: "hr:users:read" },
      { label: "Attendance",  path: "/attendance",  icon: "✅", perm: "hr:attendance:read" },
      { label: "Leave",       path: "/leave",       icon: "🌴", perm: "hr:leave:read" },
      { label: "Shifts",      path: "/shifts",      icon: "🔄", perm: "hr:shifts:read" },
    ],
  },
  {
    section: "Inventory",
    roles: ["super_admin","hospital_director","branch_admin","operations_manager","inventory_manager","procurement_officer"],
    items: [
      { label: "Stock",      path: "/inventory",   icon: "📋", perm: "inventory:stock:read" },
      { label: "Procurement",path: "/procurement", icon: "🛒", perm: "inventory:po:read" },
      { label: "Suppliers",  path: "/suppliers",   icon: "🏭", perm: "inventory:suppliers:read" },
      { label: "Assets",     path: "/assets",      icon: "🔧", perm: "inventory:assets:read" },
    ],
  },
  {
    section: "Analytics",
    roles: ["super_admin","hospital_director","branch_admin","finance_manager","operations_manager"],
    items: [
      { label: "Reports",    path: "/reports",    icon: "📈", perm: "analytics:reports:read" },
      { label: "KPIs",       path: "/kpis",       icon: "🎯", perm: "analytics:kpis:read" },
    ],
  },
  {
    section: "Administration",
    roles: ["super_admin","hospital_director","branch_admin","it_admin"],
    items: [
      { label: "Users",      path: "/users",      icon: "🔑", perm: "hr:users:read" },
      { label: "Branches",   path: "/branches",   icon: "🏢", perm: "admin:branches:read" },
      { label: "Audit Logs", path: "/audit",      icon: "📜", perm: "admin:audit:read" },
      { label: "Settings",   path: "/settings",   icon: "⚙️",  perm: "admin:settings:read" },
    ],
  },
];

// ─── MainLayout ───────────────────────────────────────────────────────────────
export default function MainLayout() {
  const { user, logout, hasPermission } = useAuthStore();
  const { sidebarCollapsed, theme, toggleSidebar, setTheme } = useUIStore();
  const { notifications, unreadCount, markRead, markAllRead, isConnected } = useNotificationStore();
  const { fetchDashboard } = useDashboardStore();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    fetchDashboard();
    // Refresh dashboard every 2 minutes
    const interval = setInterval(fetchDashboard, 120_000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const visibleSections = NAV_ITEMS.filter((section) =>
    user && (
      user.roleName === "super_admin" ||
      section.roles.includes(user.roleName) ||
      section.items.some((item) =>
        !item.perm || hasPermission(...(item.perm.split(":") as [string, string, string]))
      )
    )
  );

  return (
    <div className={`afya-layout ${theme}`} style={styles.layout}>
      {/* ─── Sidebar ─── */}
      <aside style={{ ...styles.sidebar, width: sidebarCollapsed ? 64 : 240 }}>
        {/* Logo */}
        <div style={styles.sidebarHeader}>
          <div style={styles.logo}>
            {sidebarCollapsed ? "⚕" : (
              <span style={styles.logoText}>
                <span style={{ color: "#10b981" }}>Afya</span>Core
              </span>
            )}
          </div>
          <button onClick={toggleSidebar} style={styles.collapseBtn} title="Toggle sidebar">
            {sidebarCollapsed ? "▶" : "◀"}
          </button>
        </div>

        {/* Nav */}
        <nav style={styles.nav}>
          {visibleSections.map((section) => (
            <div key={section.section} style={styles.navSection}>
              {!sidebarCollapsed && (
                <div style={styles.sectionLabel}>{section.section}</div>
              )}
              {section.items
                .filter((item) => !item.perm || hasPermission(...(item.perm.split(":") as [string, string, string])))
                .map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    style={({ isActive }) => ({
                      ...styles.navItem,
                      ...(isActive ? styles.navItemActive : {}),
                    })}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <span style={styles.navIcon}>{item.icon}</span>
                    {!sidebarCollapsed && <span style={styles.navLabel}>{item.label}</span>}
                  </NavLink>
                ))}
            </div>
          ))}
        </nav>

        {/* License indicator */}
        {!sidebarCollapsed && (
          <div style={styles.sidebarFooter}>
            <div style={styles.licenseTag}>AfyaCore HMS v1.0</div>
          </div>
        )}
      </aside>

      {/* ─── Main ─── */}
      <div style={styles.main}>
        {/* Topbar */}
        <header style={styles.topbar}>
          <div style={styles.topbarLeft}>
            <div style={styles.breadcrumb}>
              {user?.branchId && <span style={styles.branchBadge}>🏢 Branch</span>}
            </div>
          </div>
          <div style={styles.topbarRight}>
            {/* Connection indicator */}
            <div style={styles.connIndicator} title={isConnected ? "Live updates connected" : "Offline"}>
              <span style={{
                ...styles.connDot,
                backgroundColor: isConnected ? "#10b981" : "#ef4444",
              }} />
              {isConnected ? "Live" : "Offline"}
            </div>

            {/* Theme toggle */}
            <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} style={styles.iconBtn}>
              {theme === "light" ? "🌙" : "☀️"}
            </button>

            {/* Notifications */}
            <div style={styles.notifWrapper}>
              <button
                onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}
                style={styles.iconBtn}
              >
                🔔
                {unreadCount > 0 && (
                  <span style={styles.badge}>{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
              </button>

              {showNotifications && (
                <div style={styles.notifDropdown}>
                  <div style={styles.notifHeader}>
                    <span style={{ fontWeight: 700 }}>Notifications ({unreadCount} unread)</span>
                    <button onClick={markAllRead} style={styles.textBtn}>Mark all read</button>
                  </div>
                  <div style={styles.notifList}>
                    {notifications.length === 0 ? (
                      <div style={styles.notifEmpty}>No notifications</div>
                    ) : notifications.slice(0, 20).map((n) => (
                      <div
                        key={n.id}
                        onClick={() => markRead(n.id)}
                        style={{ ...styles.notifItem, ...(n.isRead ? {} : styles.notifUnread) }}
                      >
                        <div style={styles.notifTitle}>{n.title}</div>
                        <div style={styles.notifBody}>{n.body}</div>
                        <div style={styles.notifTime}>
                          {new Date(n.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User menu */}
            <div style={styles.userMenuWrapper}>
              <button
                onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
                style={styles.userBtn}
              >
                <div style={styles.avatar}>
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
                <div style={styles.userInfo}>
                  <span style={styles.userName}>{user?.firstName} {user?.lastName}</span>
                  <span style={styles.userRole}>{user?.roleName?.replace(/_/g, " ")}</span>
                </div>
                <span>▾</span>
              </button>

              {showUserMenu && (
                <div style={styles.userDropdown}>
                  <NavLink to="/profile" style={styles.dropdownItem} onClick={() => setShowUserMenu(false)}>
                    👤 My Profile
                  </NavLink>
                  <NavLink to="/change-password" style={styles.dropdownItem} onClick={() => setShowUserMenu(false)}>
                    🔑 Change Password
                  </NavLink>
                  <div style={styles.dropdownDivider} />
                  <button onClick={handleLogout} style={{ ...styles.dropdownItem, color: "#ef4444", border: "none", background: "none", cursor: "pointer", width: "100%", textAlign: "left" }}>
                    🚪 Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main style={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  layout: { display: "flex", height: "100vh", background: "#f1f5f9", fontFamily: "'Inter', system-ui, sans-serif", overflow: "hidden" },
  sidebar: { background: "#0f172a", color: "#e2e8f0", display: "flex", flexDirection: "column", transition: "width 0.2s ease", overflow: "hidden", flexShrink: 0, zIndex: 10 },
  sidebarHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 12px", borderBottom: "1px solid #1e293b", minHeight: 60 },
  logo: { fontSize: 20, fontWeight: 800, letterSpacing: -0.5 },
  logoText: { color: "#f8fafc" },
  collapseBtn: { background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12, padding: 4, borderRadius: 4 },
  nav: { flex: 1, overflowY: "auto", padding: "8px 0" },
  navSection: { marginBottom: 4 },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 1, padding: "8px 16px 4px" },
  navItem: { display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", color: "#94a3b8", textDecoration: "none", fontSize: 13, fontWeight: 500, borderRadius: 6, margin: "1px 8px", transition: "background 0.15s" },
  navItemActive: { background: "#1e40af", color: "#fff" },
  navIcon: { fontSize: 16, flexShrink: 0, width: 20, textAlign: "center" },
  navLabel: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  sidebarFooter: { padding: "12px 16px", borderTop: "1px solid #1e293b" },
  licenseTag: { fontSize: 10, color: "#475569", textAlign: "center" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar: { background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 60, flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
  topbarLeft: { display: "flex", alignItems: "center", gap: 12 },
  topbarRight: { display: "flex", alignItems: "center", gap: 8 },
  breadcrumb: { display: "flex", alignItems: "center", gap: 8 },
  branchBadge: { fontSize: 12, background: "#eff6ff", color: "#1d4ed8", padding: "2px 8px", borderRadius: 12, fontWeight: 600 },
  connIndicator: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#64748b", padding: "4px 8px", borderRadius: 12, background: "#f8fafc" },
  connDot: { width: 7, height: 7, borderRadius: "50%", display: "inline-block" },
  iconBtn: { background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontSize: 16, position: "relative", color: "#374151" },
  badge: { position: "absolute", top: -4, right: -4, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 8, padding: "1px 4px", minWidth: 16, textAlign: "center" },
  notifWrapper: { position: "relative" },
  notifDropdown: { position: "absolute", top: 44, right: 0, width: 360, background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", border: "1px solid #e2e8f0", zIndex: 100, overflow: "hidden" },
  notifHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 13 },
  notifList: { maxHeight: 360, overflowY: "auto" },
  notifEmpty: { padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 },
  notifItem: { padding: "12px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer" },
  notifUnread: { background: "#eff6ff" },
  notifTitle: { fontWeight: 600, fontSize: 13, color: "#0f172a", marginBottom: 2 },
  notifBody: { fontSize: 12, color: "#64748b", marginBottom: 4 },
  notifTime: { fontSize: 10, color: "#94a3b8" },
  textBtn: { background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: 12 },
  userMenuWrapper: { position: "relative" },
  userBtn: { display: "flex", alignItems: "center", gap: 8, background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 12px 4px 6px", cursor: "pointer", fontSize: 13 },
  avatar: { width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 },
  userInfo: { display: "flex", flexDirection: "column", textAlign: "left" },
  userName: { fontSize: 13, fontWeight: 600, color: "#0f172a" },
  userRole: { fontSize: 10, color: "#64748b", textTransform: "capitalize" },
  userDropdown: { position: "absolute", top: 48, right: 0, width: 200, background: "#fff", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", border: "1px solid #e2e8f0", zIndex: 100, overflow: "hidden", padding: "4px 0" },
  dropdownItem: { display: "block", padding: "10px 16px", fontSize: 13, color: "#374151", textDecoration: "none", fontWeight: 500 },
  dropdownDivider: { height: 1, background: "#f1f5f9", margin: "4px 0" },
  content: { flex: 1, overflowY: "auto", padding: 24 },
};
