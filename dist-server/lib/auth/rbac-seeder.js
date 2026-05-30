import {
  db
} from "../../chunk-6WJBJ4G3.js";

// src/lib/auth/rbac-seeder.ts
var ALL_PERMISSIONS = [
  // Patients
  { module: "patients", resource: "patients", action: "create" },
  { module: "patients", resource: "patients", action: "read" },
  { module: "patients", resource: "patients", action: "update" },
  { module: "patients", resource: "patients", action: "delete" },
  { module: "patients", resource: "patients", action: "export" },
  { module: "patients", resource: "vitals", action: "create" },
  { module: "patients", resource: "vitals", action: "read" },
  { module: "patients", resource: "vitals", action: "update" },
  // Clinical
  { module: "clinical", resource: "visits", action: "create" },
  { module: "clinical", resource: "visits", action: "read" },
  { module: "clinical", resource: "visits", action: "update" },
  { module: "clinical", resource: "notes", action: "create" },
  { module: "clinical", resource: "notes", action: "read" },
  { module: "clinical", resource: "notes", action: "update" },
  { module: "clinical", resource: "diagnoses", action: "create" },
  { module: "clinical", resource: "diagnoses", action: "read" },
  { module: "clinical", resource: "diagnoses", action: "update" },
  { module: "clinical", resource: "appointments", action: "create" },
  { module: "clinical", resource: "appointments", action: "read" },
  { module: "clinical", resource: "appointments", action: "update" },
  { module: "clinical", resource: "appointments", action: "delete" },
  { module: "clinical", resource: "admissions", action: "create" },
  { module: "clinical", resource: "admissions", action: "read" },
  { module: "clinical", resource: "admissions", action: "update" },
  { module: "clinical", resource: "beds", action: "read" },
  { module: "clinical", resource: "beds", action: "update" },
  { module: "clinical", resource: "surgery", action: "create" },
  { module: "clinical", resource: "surgery", action: "read" },
  { module: "clinical", resource: "surgery", action: "update" },
  { module: "clinical", resource: "emergency", action: "create" },
  { module: "clinical", resource: "emergency", action: "read" },
  // Laboratory
  { module: "laboratory", resource: "requests", action: "create" },
  { module: "laboratory", resource: "requests", action: "read" },
  { module: "laboratory", resource: "requests", action: "update" },
  { module: "laboratory", resource: "results", action: "create" },
  { module: "laboratory", resource: "results", action: "read" },
  { module: "laboratory", resource: "results", action: "approve" },
  { module: "laboratory", resource: "catalog", action: "read" },
  { module: "laboratory", resource: "catalog", action: "create" },
  { module: "laboratory", resource: "catalog", action: "update" },
  // Radiology
  { module: "radiology", resource: "requests", action: "create" },
  { module: "radiology", resource: "requests", action: "read" },
  { module: "radiology", resource: "requests", action: "update" },
  { module: "radiology", resource: "reports", action: "create" },
  { module: "radiology", resource: "reports", action: "read" },
  // Pharmacy
  { module: "pharmacy", resource: "prescriptions", action: "create" },
  { module: "pharmacy", resource: "prescriptions", action: "read" },
  { module: "pharmacy", resource: "prescriptions", action: "update" },
  { module: "pharmacy", resource: "prescriptions", action: "void" },
  { module: "pharmacy", resource: "dispensing", action: "create" },
  { module: "pharmacy", resource: "dispensing", action: "read" },
  { module: "pharmacy", resource: "inventory", action: "read" },
  { module: "pharmacy", resource: "inventory", action: "create" },
  { module: "pharmacy", resource: "inventory", action: "update" },
  { module: "pharmacy", resource: "drugs", action: "read" },
  { module: "pharmacy", resource: "drugs", action: "create" },
  { module: "pharmacy", resource: "drugs", action: "update" },
  // Finance
  { module: "finance", resource: "invoices", action: "create" },
  { module: "finance", resource: "invoices", action: "read" },
  { module: "finance", resource: "invoices", action: "update" },
  { module: "finance", resource: "invoices", action: "void" },
  { module: "finance", resource: "invoices", action: "approve" },
  { module: "finance", resource: "payments", action: "create" },
  { module: "finance", resource: "payments", action: "read" },
  { module: "finance", resource: "payments", action: "void" },
  { module: "finance", resource: "insurance", action: "create" },
  { module: "finance", resource: "insurance", action: "read" },
  { module: "finance", resource: "insurance", action: "update" },
  { module: "finance", resource: "accounts", action: "read" },
  { module: "finance", resource: "accounts", action: "create" },
  { module: "finance", resource: "accounts", action: "update" },
  { module: "finance", resource: "payroll", action: "read" },
  { module: "finance", resource: "payroll", action: "create" },
  { module: "finance", resource: "payroll", action: "approve" },
  // HR
  { module: "hr", resource: "users", action: "create" },
  { module: "hr", resource: "users", action: "read" },
  { module: "hr", resource: "users", action: "update" },
  { module: "hr", resource: "users", action: "delete" },
  { module: "hr", resource: "attendance", action: "create" },
  { module: "hr", resource: "attendance", action: "read" },
  { module: "hr", resource: "attendance", action: "update" },
  { module: "hr", resource: "leave", action: "create" },
  { module: "hr", resource: "leave", action: "read" },
  { module: "hr", resource: "leave", action: "approve" },
  { module: "hr", resource: "shifts", action: "create" },
  { module: "hr", resource: "shifts", action: "read" },
  { module: "hr", resource: "shifts", action: "update" },
  // Inventory
  { module: "inventory", resource: "stock", action: "read" },
  { module: "inventory", resource: "stock", action: "update" },
  { module: "inventory", resource: "po", action: "create" },
  { module: "inventory", resource: "po", action: "read" },
  { module: "inventory", resource: "po", action: "approve" },
  { module: "inventory", resource: "suppliers", action: "read" },
  { module: "inventory", resource: "suppliers", action: "create" },
  { module: "inventory", resource: "suppliers", action: "update" },
  { module: "inventory", resource: "assets", action: "read" },
  { module: "inventory", resource: "assets", action: "create" },
  { module: "inventory", resource: "assets", action: "update" },
  // Analytics
  { module: "analytics", resource: "dashboard", action: "read" },
  { module: "analytics", resource: "reports", action: "read" },
  { module: "analytics", resource: "reports", action: "export" },
  { module: "analytics", resource: "kpis", action: "read" },
  // Admin
  { module: "admin", resource: "audit", action: "read" },
  { module: "admin", resource: "audit", action: "export" },
  { module: "admin", resource: "settings", action: "read" },
  { module: "admin", resource: "settings", action: "update" },
  { module: "admin", resource: "branches", action: "read" },
  { module: "admin", resource: "branches", action: "create" },
  { module: "admin", resource: "branches", action: "update" },
  { module: "admin", resource: "license", action: "read" },
  { module: "admin", resource: "license", action: "update" },
  { module: "admin", resource: "system", action: "create" }
  // backups
];
var ROLE_PERMISSIONS = {
  super_admin: ["*:*:*"],
  // wildcard – computed as a special case
  hospital_director: [
    "patients:patients:read",
    "patients:patients:export",
    "clinical:visits:read",
    "clinical:admissions:read",
    "clinical:appointments:read",
    "laboratory:requests:read",
    "laboratory:results:read",
    "laboratory:catalog:read",
    "radiology:requests:read",
    "radiology:reports:read",
    "pharmacy:prescriptions:read",
    "pharmacy:inventory:read",
    "finance:invoices:read",
    "finance:payments:read",
    "finance:payroll:read",
    "finance:accounts:read",
    "finance:insurance:read",
    "hr:users:read",
    "hr:attendance:read",
    "hr:leave:read",
    "inventory:stock:read",
    "inventory:po:read",
    "inventory:assets:read",
    "analytics:dashboard:read",
    "analytics:reports:read",
    "analytics:reports:export",
    "analytics:kpis:read",
    "admin:audit:read",
    "admin:audit:export",
    "admin:settings:read",
    "admin:branches:read",
    "admin:license:read"
  ],
  branch_admin: [
    "patients:patients:create",
    "patients:patients:read",
    "patients:patients:update",
    "patients:vitals:read",
    "clinical:visits:read",
    "clinical:appointments:read",
    "clinical:appointments:create",
    "clinical:admissions:read",
    "clinical:beds:read",
    "laboratory:requests:read",
    "laboratory:results:read",
    "laboratory:catalog:read",
    "pharmacy:prescriptions:read",
    "pharmacy:inventory:read",
    "finance:invoices:read",
    "finance:payments:read",
    "finance:insurance:read",
    "hr:users:read",
    "hr:attendance:read",
    "hr:shifts:read",
    "inventory:stock:read",
    "inventory:po:read",
    "inventory:assets:read",
    "analytics:dashboard:read",
    "analytics:reports:read",
    "analytics:kpis:read",
    "admin:audit:read",
    "admin:settings:read",
    "admin:branches:read"
  ],
  doctor: [
    "patients:patients:create",
    "patients:patients:read",
    "patients:patients:update",
    "patients:vitals:create",
    "patients:vitals:read",
    "patients:vitals:update",
    "clinical:visits:create",
    "clinical:visits:read",
    "clinical:visits:update",
    "clinical:notes:create",
    "clinical:notes:read",
    "clinical:notes:update",
    "clinical:diagnoses:create",
    "clinical:diagnoses:read",
    "clinical:diagnoses:update",
    "clinical:appointments:create",
    "clinical:appointments:read",
    "clinical:appointments:update",
    "clinical:admissions:create",
    "clinical:admissions:read",
    "clinical:admissions:update",
    "clinical:beds:read",
    "laboratory:requests:create",
    "laboratory:requests:read",
    "laboratory:results:read",
    "laboratory:catalog:read",
    "radiology:requests:create",
    "radiology:requests:read",
    "radiology:reports:read",
    "pharmacy:prescriptions:create",
    "pharmacy:prescriptions:read",
    "pharmacy:prescriptions:update",
    "pharmacy:drugs:read",
    "finance:invoices:read",
    "finance:payments:read",
    "analytics:dashboard:read"
  ],
  specialist: [
    "patients:patients:create",
    "patients:patients:read",
    "patients:patients:update",
    "patients:vitals:create",
    "patients:vitals:read",
    "clinical:visits:create",
    "clinical:visits:read",
    "clinical:visits:update",
    "clinical:notes:create",
    "clinical:notes:read",
    "clinical:notes:update",
    "clinical:diagnoses:create",
    "clinical:diagnoses:read",
    "clinical:appointments:create",
    "clinical:appointments:read",
    "clinical:admissions:read",
    "laboratory:requests:create",
    "laboratory:requests:read",
    "laboratory:results:read",
    "radiology:requests:create",
    "radiology:requests:read",
    "radiology:reports:read",
    "pharmacy:prescriptions:create",
    "pharmacy:prescriptions:read",
    "pharmacy:drugs:read",
    "analytics:dashboard:read"
  ],
  surgeon: [
    "patients:patients:read",
    "patients:vitals:read",
    "clinical:visits:read",
    "clinical:notes:create",
    "clinical:notes:read",
    "clinical:diagnoses:create",
    "clinical:diagnoses:read",
    "clinical:admissions:read",
    "clinical:admissions:update",
    "clinical:surgery:create",
    "clinical:surgery:read",
    "clinical:surgery:update",
    "laboratory:requests:create",
    "laboratory:requests:read",
    "laboratory:results:read",
    "pharmacy:prescriptions:create",
    "pharmacy:prescriptions:read",
    "analytics:dashboard:read"
  ],
  nurse: [
    "patients:patients:read",
    "patients:patients:update",
    "patients:vitals:create",
    "patients:vitals:read",
    "clinical:visits:read",
    "clinical:visits:update",
    "clinical:notes:create",
    "clinical:notes:read",
    "clinical:admissions:read",
    "clinical:admissions:update",
    "clinical:beds:read",
    "clinical:beds:update",
    "clinical:appointments:read",
    "laboratory:results:read",
    "pharmacy:prescriptions:read",
    "pharmacy:dispensing:read",
    "analytics:dashboard:read"
  ],
  lab_technician: [
    "patients:patients:read",
    "laboratory:requests:read",
    "laboratory:requests:update",
    "laboratory:results:create",
    "laboratory:results:read",
    "laboratory:catalog:read",
    "analytics:dashboard:read"
  ],
  radiologist: [
    "patients:patients:read",
    "radiology:requests:read",
    "radiology:requests:update",
    "radiology:reports:create",
    "radiology:reports:read",
    "analytics:dashboard:read"
  ],
  pharmacist: [
    "patients:patients:read",
    "pharmacy:prescriptions:read",
    "pharmacy:prescriptions:update",
    "pharmacy:dispensing:create",
    "pharmacy:dispensing:read",
    "pharmacy:inventory:read",
    "pharmacy:inventory:create",
    "pharmacy:inventory:update",
    "pharmacy:drugs:read",
    "pharmacy:drugs:create",
    "pharmacy:drugs:update",
    "analytics:dashboard:read"
  ],
  receptionist: [
    "patients:patients:create",
    "patients:patients:read",
    "patients:patients:update",
    "clinical:appointments:create",
    "clinical:appointments:read",
    "clinical:appointments:update",
    "clinical:visits:create",
    "clinical:visits:read",
    "finance:invoices:read",
    "finance:payments:read",
    "analytics:dashboard:read"
  ],
  registration_staff: [
    "patients:patients:create",
    "patients:patients:read",
    "patients:patients:update",
    "clinical:appointments:read",
    "analytics:dashboard:read"
  ],
  appointment_officer: [
    "patients:patients:read",
    "clinical:appointments:create",
    "clinical:appointments:read",
    "clinical:appointments:update",
    "clinical:appointments:delete",
    "analytics:dashboard:read"
  ],
  billing_officer: [
    "patients:patients:read",
    "finance:invoices:create",
    "finance:invoices:read",
    "finance:invoices:update",
    "finance:payments:create",
    "finance:payments:read",
    "finance:insurance:read",
    "analytics:dashboard:read"
  ],
  insurance_officer: [
    "patients:patients:read",
    "finance:invoices:read",
    "finance:insurance:create",
    "finance:insurance:read",
    "finance:insurance:update",
    "analytics:dashboard:read"
  ],
  accountant: [
    "finance:invoices:read",
    "finance:payments:read",
    "finance:accounts:read",
    "finance:accounts:create",
    "finance:accounts:update",
    "finance:payroll:read",
    "analytics:dashboard:read",
    "analytics:reports:read"
  ],
  finance_manager: [
    "finance:invoices:read",
    "finance:invoices:approve",
    "finance:invoices:void",
    "finance:payments:read",
    "finance:payments:void",
    "finance:insurance:read",
    "finance:insurance:update",
    "finance:accounts:read",
    "finance:accounts:create",
    "finance:accounts:update",
    "finance:payroll:read",
    "finance:payroll:create",
    "finance:payroll:approve",
    "hr:users:read",
    "analytics:dashboard:read",
    "analytics:reports:read",
    "analytics:reports:export",
    "analytics:kpis:read",
    "admin:audit:read"
  ],
  payroll_officer: [
    "hr:users:read",
    "hr:attendance:read",
    "finance:payroll:read",
    "finance:payroll:create",
    "analytics:dashboard:read"
  ],
  hr_manager: [
    "hr:users:create",
    "hr:users:read",
    "hr:users:update",
    "hr:attendance:create",
    "hr:attendance:read",
    "hr:attendance:update",
    "hr:leave:create",
    "hr:leave:read",
    "hr:leave:approve",
    "hr:shifts:create",
    "hr:shifts:read",
    "hr:shifts:update",
    "finance:payroll:read",
    "analytics:dashboard:read",
    "analytics:reports:read"
  ],
  inventory_manager: [
    "inventory:stock:read",
    "inventory:stock:update",
    "inventory:po:create",
    "inventory:po:read",
    "inventory:suppliers:read",
    "inventory:suppliers:create",
    "inventory:assets:read",
    "inventory:assets:create",
    "inventory:assets:update",
    "analytics:dashboard:read"
  ],
  procurement_officer: [
    "inventory:stock:read",
    "inventory:po:create",
    "inventory:po:read",
    "inventory:suppliers:read",
    "inventory:suppliers:create",
    "inventory:suppliers:update",
    "analytics:dashboard:read"
  ],
  operations_manager: [
    "inventory:stock:read",
    "inventory:stock:update",
    "inventory:po:read",
    "inventory:po:approve",
    "inventory:suppliers:read",
    "inventory:assets:read",
    "hr:attendance:read",
    "hr:shifts:read",
    "analytics:dashboard:read",
    "analytics:reports:read",
    "analytics:kpis:read"
  ],
  it_admin: [
    "admin:audit:read",
    "admin:audit:export",
    "admin:settings:read",
    "admin:settings:update",
    "admin:branches:read",
    "admin:branches:create",
    "admin:branches:update",
    "admin:license:read",
    "admin:license:update",
    "admin:system:create",
    "hr:users:read",
    "hr:users:create",
    "hr:users:update",
    "analytics:dashboard:read"
  ],
  patient: [
    "patients:patients:read",
    // own records only – enforced at API level
    "clinical:appointments:create",
    "clinical:appointments:read",
    "finance:invoices:read"
  ],
  therapist: [
    "patients:patients:read",
    "patients:vitals:read",
    "clinical:visits:read",
    "clinical:notes:create",
    "clinical:notes:read",
    "clinical:admissions:read",
    "analytics:dashboard:read"
  ],
  nutritionist: [
    "patients:patients:read",
    "patients:vitals:read",
    "patients:vitals:create",
    "clinical:visits:read",
    "clinical:notes:create",
    "clinical:notes:read",
    "analytics:dashboard:read"
  ],
  dentist: [
    "patients:patients:create",
    "patients:patients:read",
    "patients:patients:update",
    "patients:vitals:create",
    "patients:vitals:read",
    "clinical:visits:create",
    "clinical:visits:read",
    "clinical:visits:update",
    "clinical:notes:create",
    "clinical:notes:read",
    "clinical:diagnoses:create",
    "clinical:diagnoses:read",
    "clinical:appointments:create",
    "clinical:appointments:read",
    "pharmacy:prescriptions:create",
    "pharmacy:prescriptions:read",
    "analytics:dashboard:read"
  ]
};
function seedPermissions() {
  console.log("[RBAC] Seeding permissions...");
  db.transaction(() => {
    for (const perm of ALL_PERMISSIONS) {
      db.run(
        `INSERT OR IGNORE INTO permissions (id, module, resource, action)
         VALUES (lower(hex(randomblob(16))), ?, ?, ?)`,
        [perm.module, perm.resource, perm.action]
      );
    }
    for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSIONS)) {
      const role = db.findOne(
        `SELECT id FROM roles WHERE name = ?`,
        [roleName]
      );
      if (!role) {
        console.warn(`[RBAC] Role not found: ${roleName}`);
        continue;
      }
      if (permKeys.includes("*:*:*")) {
        const allPerms = db.query(`SELECT id FROM permissions`).rows;
        for (const p of allPerms) {
          db.run(
            `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
            [role.id, p.id]
          );
        }
        continue;
      }
      for (const key of permKeys) {
        const [module, resource, action] = key.split(":");
        const perm = db.findOne(
          `SELECT id FROM permissions WHERE module = ? AND resource = ? AND action = ?`,
          [module, resource, action]
        );
        if (!perm) {
          console.warn(`[RBAC] Permission not found: ${key}`);
          continue;
        }
        db.run(
          `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
          [role.id, perm.id]
        );
      }
    }
  });
  const permCount = db.count("permissions");
  const rpCount = db.count("role_permissions");
  console.log(`[RBAC] \u2713 ${permCount} permissions, ${rpCount} role-permission assignments`);
}
async function createDefaultSuperAdmin() {
  const exists = db.exists("users", `role_id = 'role-superadmin' AND is_active = 1`);
  if (exists) return;
  const { authService } = await import("./auth-service.js");
  const result = await authService.createUser({
    username: "admin",
    email: "admin@afyacore.local",
    password: "AfyaCore@2024!",
    firstName: "System",
    lastName: "Administrator",
    roleId: "role-superadmin",
    createdBy: "system"
  });
  if (result.success) {
    db.run(`UPDATE users SET must_change_password = 1 WHERE id = ?`, [result.userId]);
    console.log("[Setup] \u2713 Default super admin created: admin / AfyaCore@2024!");
    console.log("[Setup] \u26A0\uFE0F  CHANGE DEFAULT PASSWORD IMMEDIATELY");
  }
}
export {
  createDefaultSuperAdmin,
  seedPermissions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vc3JjL2xpYi9hdXRoL3JiYWMtc2VlZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBkYiB9IGZyb20gJy4uL2RiL2RhdGFiYXNlJztcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIEFsbCBwZXJtaXNzaW9ucyBpbiB0aGUgc3lzdGVtIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuY29uc3QgQUxMX1BFUk1JU1NJT05TID0gW1xuICAvLyBQYXRpZW50c1xuICB7IG1vZHVsZTogJ3BhdGllbnRzJywgcmVzb3VyY2U6ICdwYXRpZW50cycsIGFjdGlvbjogJ2NyZWF0ZScgfSxcbiAgeyBtb2R1bGU6ICdwYXRpZW50cycsIHJlc291cmNlOiAncGF0aWVudHMnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ3BhdGllbnRzJywgcmVzb3VyY2U6ICdwYXRpZW50cycsIGFjdGlvbjogJ3VwZGF0ZScgfSxcbiAgeyBtb2R1bGU6ICdwYXRpZW50cycsIHJlc291cmNlOiAncGF0aWVudHMnLCBhY3Rpb246ICdkZWxldGUnIH0sXG4gIHsgbW9kdWxlOiAncGF0aWVudHMnLCByZXNvdXJjZTogJ3BhdGllbnRzJywgYWN0aW9uOiAnZXhwb3J0JyB9LFxuICB7IG1vZHVsZTogJ3BhdGllbnRzJywgcmVzb3VyY2U6ICd2aXRhbHMnLCBhY3Rpb246ICdjcmVhdGUnIH0sXG4gIHsgbW9kdWxlOiAncGF0aWVudHMnLCByZXNvdXJjZTogJ3ZpdGFscycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAncGF0aWVudHMnLCByZXNvdXJjZTogJ3ZpdGFscycsIGFjdGlvbjogJ3VwZGF0ZScgfSxcbiAgLy8gQ2xpbmljYWxcbiAgeyBtb2R1bGU6ICdjbGluaWNhbCcsIHJlc291cmNlOiAndmlzaXRzJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ2NsaW5pY2FsJywgcmVzb3VyY2U6ICd2aXNpdHMnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ2NsaW5pY2FsJywgcmVzb3VyY2U6ICd2aXNpdHMnLCBhY3Rpb246ICd1cGRhdGUnIH0sXG4gIHsgbW9kdWxlOiAnY2xpbmljYWwnLCByZXNvdXJjZTogJ25vdGVzJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ2NsaW5pY2FsJywgcmVzb3VyY2U6ICdub3RlcycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAnY2xpbmljYWwnLCByZXNvdXJjZTogJ25vdGVzJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICB7IG1vZHVsZTogJ2NsaW5pY2FsJywgcmVzb3VyY2U6ICdkaWFnbm9zZXMnLCBhY3Rpb246ICdjcmVhdGUnIH0sXG4gIHsgbW9kdWxlOiAnY2xpbmljYWwnLCByZXNvdXJjZTogJ2RpYWdub3NlcycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAnY2xpbmljYWwnLCByZXNvdXJjZTogJ2RpYWdub3NlcycsIGFjdGlvbjogJ3VwZGF0ZScgfSxcbiAgeyBtb2R1bGU6ICdjbGluaWNhbCcsIHJlc291cmNlOiAnYXBwb2ludG1lbnRzJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ2NsaW5pY2FsJywgcmVzb3VyY2U6ICdhcHBvaW50bWVudHMnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ2NsaW5pY2FsJywgcmVzb3VyY2U6ICdhcHBvaW50bWVudHMnLCBhY3Rpb246ICd1cGRhdGUnIH0sXG4gIHsgbW9kdWxlOiAnY2xpbmljYWwnLCByZXNvdXJjZTogJ2FwcG9pbnRtZW50cycsIGFjdGlvbjogJ2RlbGV0ZScgfSxcbiAgeyBtb2R1bGU6ICdjbGluaWNhbCcsIHJlc291cmNlOiAnYWRtaXNzaW9ucycsIGFjdGlvbjogJ2NyZWF0ZScgfSxcbiAgeyBtb2R1bGU6ICdjbGluaWNhbCcsIHJlc291cmNlOiAnYWRtaXNzaW9ucycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAnY2xpbmljYWwnLCByZXNvdXJjZTogJ2FkbWlzc2lvbnMnLCBhY3Rpb246ICd1cGRhdGUnIH0sXG4gIHsgbW9kdWxlOiAnY2xpbmljYWwnLCByZXNvdXJjZTogJ2JlZHMnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ2NsaW5pY2FsJywgcmVzb3VyY2U6ICdiZWRzJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICB7IG1vZHVsZTogJ2NsaW5pY2FsJywgcmVzb3VyY2U6ICdzdXJnZXJ5JywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ2NsaW5pY2FsJywgcmVzb3VyY2U6ICdzdXJnZXJ5JywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdjbGluaWNhbCcsIHJlc291cmNlOiAnc3VyZ2VyeScsIGFjdGlvbjogJ3VwZGF0ZScgfSxcbiAgeyBtb2R1bGU6ICdjbGluaWNhbCcsIHJlc291cmNlOiAnZW1lcmdlbmN5JywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ2NsaW5pY2FsJywgcmVzb3VyY2U6ICdlbWVyZ2VuY3knLCBhY3Rpb246ICdyZWFkJyB9LFxuICAvLyBMYWJvcmF0b3J5XG4gIHsgbW9kdWxlOiAnbGFib3JhdG9yeScsIHJlc291cmNlOiAncmVxdWVzdHMnLCBhY3Rpb246ICdjcmVhdGUnIH0sXG4gIHsgbW9kdWxlOiAnbGFib3JhdG9yeScsIHJlc291cmNlOiAncmVxdWVzdHMnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ2xhYm9yYXRvcnknLCByZXNvdXJjZTogJ3JlcXVlc3RzJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICB7IG1vZHVsZTogJ2xhYm9yYXRvcnknLCByZXNvdXJjZTogJ3Jlc3VsdHMnLCBhY3Rpb246ICdjcmVhdGUnIH0sXG4gIHsgbW9kdWxlOiAnbGFib3JhdG9yeScsIHJlc291cmNlOiAncmVzdWx0cycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAnbGFib3JhdG9yeScsIHJlc291cmNlOiAncmVzdWx0cycsIGFjdGlvbjogJ2FwcHJvdmUnIH0sXG4gIHsgbW9kdWxlOiAnbGFib3JhdG9yeScsIHJlc291cmNlOiAnY2F0YWxvZycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAnbGFib3JhdG9yeScsIHJlc291cmNlOiAnY2F0YWxvZycsIGFjdGlvbjogJ2NyZWF0ZScgfSxcbiAgeyBtb2R1bGU6ICdsYWJvcmF0b3J5JywgcmVzb3VyY2U6ICdjYXRhbG9nJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICAvLyBSYWRpb2xvZ3lcbiAgeyBtb2R1bGU6ICdyYWRpb2xvZ3knLCByZXNvdXJjZTogJ3JlcXVlc3RzJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ3JhZGlvbG9neScsIHJlc291cmNlOiAncmVxdWVzdHMnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ3JhZGlvbG9neScsIHJlc291cmNlOiAncmVxdWVzdHMnLCBhY3Rpb246ICd1cGRhdGUnIH0sXG4gIHsgbW9kdWxlOiAncmFkaW9sb2d5JywgcmVzb3VyY2U6ICdyZXBvcnRzJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ3JhZGlvbG9neScsIHJlc291cmNlOiAncmVwb3J0cycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIC8vIFBoYXJtYWN5XG4gIHsgbW9kdWxlOiAncGhhcm1hY3knLCByZXNvdXJjZTogJ3ByZXNjcmlwdGlvbnMnLCBhY3Rpb246ICdjcmVhdGUnIH0sXG4gIHsgbW9kdWxlOiAncGhhcm1hY3knLCByZXNvdXJjZTogJ3ByZXNjcmlwdGlvbnMnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ3BoYXJtYWN5JywgcmVzb3VyY2U6ICdwcmVzY3JpcHRpb25zJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICB7IG1vZHVsZTogJ3BoYXJtYWN5JywgcmVzb3VyY2U6ICdwcmVzY3JpcHRpb25zJywgYWN0aW9uOiAndm9pZCcgfSxcbiAgeyBtb2R1bGU6ICdwaGFybWFjeScsIHJlc291cmNlOiAnZGlzcGVuc2luZycsIGFjdGlvbjogJ2NyZWF0ZScgfSxcbiAgeyBtb2R1bGU6ICdwaGFybWFjeScsIHJlc291cmNlOiAnZGlzcGVuc2luZycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAncGhhcm1hY3knLCByZXNvdXJjZTogJ2ludmVudG9yeScsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAncGhhcm1hY3knLCByZXNvdXJjZTogJ2ludmVudG9yeScsIGFjdGlvbjogJ2NyZWF0ZScgfSxcbiAgeyBtb2R1bGU6ICdwaGFybWFjeScsIHJlc291cmNlOiAnaW52ZW50b3J5JywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICB7IG1vZHVsZTogJ3BoYXJtYWN5JywgcmVzb3VyY2U6ICdkcnVncycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAncGhhcm1hY3knLCByZXNvdXJjZTogJ2RydWdzJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ3BoYXJtYWN5JywgcmVzb3VyY2U6ICdkcnVncycsIGFjdGlvbjogJ3VwZGF0ZScgfSxcbiAgLy8gRmluYW5jZVxuICB7IG1vZHVsZTogJ2ZpbmFuY2UnLCByZXNvdXJjZTogJ2ludm9pY2VzJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ2ZpbmFuY2UnLCByZXNvdXJjZTogJ2ludm9pY2VzJywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdmaW5hbmNlJywgcmVzb3VyY2U6ICdpbnZvaWNlcycsIGFjdGlvbjogJ3VwZGF0ZScgfSxcbiAgeyBtb2R1bGU6ICdmaW5hbmNlJywgcmVzb3VyY2U6ICdpbnZvaWNlcycsIGFjdGlvbjogJ3ZvaWQnIH0sXG4gIHsgbW9kdWxlOiAnZmluYW5jZScsIHJlc291cmNlOiAnaW52b2ljZXMnLCBhY3Rpb246ICdhcHByb3ZlJyB9LFxuICB7IG1vZHVsZTogJ2ZpbmFuY2UnLCByZXNvdXJjZTogJ3BheW1lbnRzJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ2ZpbmFuY2UnLCByZXNvdXJjZTogJ3BheW1lbnRzJywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdmaW5hbmNlJywgcmVzb3VyY2U6ICdwYXltZW50cycsIGFjdGlvbjogJ3ZvaWQnIH0sXG4gIHsgbW9kdWxlOiAnZmluYW5jZScsIHJlc291cmNlOiAnaW5zdXJhbmNlJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ2ZpbmFuY2UnLCByZXNvdXJjZTogJ2luc3VyYW5jZScsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAnZmluYW5jZScsIHJlc291cmNlOiAnaW5zdXJhbmNlJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICB7IG1vZHVsZTogJ2ZpbmFuY2UnLCByZXNvdXJjZTogJ2FjY291bnRzJywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdmaW5hbmNlJywgcmVzb3VyY2U6ICdhY2NvdW50cycsIGFjdGlvbjogJ2NyZWF0ZScgfSxcbiAgeyBtb2R1bGU6ICdmaW5hbmNlJywgcmVzb3VyY2U6ICdhY2NvdW50cycsIGFjdGlvbjogJ3VwZGF0ZScgfSxcbiAgeyBtb2R1bGU6ICdmaW5hbmNlJywgcmVzb3VyY2U6ICdwYXlyb2xsJywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdmaW5hbmNlJywgcmVzb3VyY2U6ICdwYXlyb2xsJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ2ZpbmFuY2UnLCByZXNvdXJjZTogJ3BheXJvbGwnLCBhY3Rpb246ICdhcHByb3ZlJyB9LFxuICAvLyBIUlxuICB7IG1vZHVsZTogJ2hyJywgcmVzb3VyY2U6ICd1c2VycycsIGFjdGlvbjogJ2NyZWF0ZScgfSxcbiAgeyBtb2R1bGU6ICdocicsIHJlc291cmNlOiAndXNlcnMnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ2hyJywgcmVzb3VyY2U6ICd1c2VycycsIGFjdGlvbjogJ3VwZGF0ZScgfSxcbiAgeyBtb2R1bGU6ICdocicsIHJlc291cmNlOiAndXNlcnMnLCBhY3Rpb246ICdkZWxldGUnIH0sXG4gIHsgbW9kdWxlOiAnaHInLCByZXNvdXJjZTogJ2F0dGVuZGFuY2UnLCBhY3Rpb246ICdjcmVhdGUnIH0sXG4gIHsgbW9kdWxlOiAnaHInLCByZXNvdXJjZTogJ2F0dGVuZGFuY2UnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ2hyJywgcmVzb3VyY2U6ICdhdHRlbmRhbmNlJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICB7IG1vZHVsZTogJ2hyJywgcmVzb3VyY2U6ICdsZWF2ZScsIGFjdGlvbjogJ2NyZWF0ZScgfSxcbiAgeyBtb2R1bGU6ICdocicsIHJlc291cmNlOiAnbGVhdmUnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ2hyJywgcmVzb3VyY2U6ICdsZWF2ZScsIGFjdGlvbjogJ2FwcHJvdmUnIH0sXG4gIHsgbW9kdWxlOiAnaHInLCByZXNvdXJjZTogJ3NoaWZ0cycsIGFjdGlvbjogJ2NyZWF0ZScgfSxcbiAgeyBtb2R1bGU6ICdocicsIHJlc291cmNlOiAnc2hpZnRzJywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdocicsIHJlc291cmNlOiAnc2hpZnRzJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICAvLyBJbnZlbnRvcnlcbiAgeyBtb2R1bGU6ICdpbnZlbnRvcnknLCByZXNvdXJjZTogJ3N0b2NrJywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdpbnZlbnRvcnknLCByZXNvdXJjZTogJ3N0b2NrJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICB7IG1vZHVsZTogJ2ludmVudG9yeScsIHJlc291cmNlOiAncG8nLCBhY3Rpb246ICdjcmVhdGUnIH0sXG4gIHsgbW9kdWxlOiAnaW52ZW50b3J5JywgcmVzb3VyY2U6ICdwbycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAnaW52ZW50b3J5JywgcmVzb3VyY2U6ICdwbycsIGFjdGlvbjogJ2FwcHJvdmUnIH0sXG4gIHsgbW9kdWxlOiAnaW52ZW50b3J5JywgcmVzb3VyY2U6ICdzdXBwbGllcnMnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ2ludmVudG9yeScsIHJlc291cmNlOiAnc3VwcGxpZXJzJywgYWN0aW9uOiAnY3JlYXRlJyB9LFxuICB7IG1vZHVsZTogJ2ludmVudG9yeScsIHJlc291cmNlOiAnc3VwcGxpZXJzJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICB7IG1vZHVsZTogJ2ludmVudG9yeScsIHJlc291cmNlOiAnYXNzZXRzJywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdpbnZlbnRvcnknLCByZXNvdXJjZTogJ2Fzc2V0cycsIGFjdGlvbjogJ2NyZWF0ZScgfSxcbiAgeyBtb2R1bGU6ICdpbnZlbnRvcnknLCByZXNvdXJjZTogJ2Fzc2V0cycsIGFjdGlvbjogJ3VwZGF0ZScgfSxcbiAgLy8gQW5hbHl0aWNzXG4gIHsgbW9kdWxlOiAnYW5hbHl0aWNzJywgcmVzb3VyY2U6ICdkYXNoYm9hcmQnLCBhY3Rpb246ICdyZWFkJyB9LFxuICB7IG1vZHVsZTogJ2FuYWx5dGljcycsIHJlc291cmNlOiAncmVwb3J0cycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIHsgbW9kdWxlOiAnYW5hbHl0aWNzJywgcmVzb3VyY2U6ICdyZXBvcnRzJywgYWN0aW9uOiAnZXhwb3J0JyB9LFxuICB7IG1vZHVsZTogJ2FuYWx5dGljcycsIHJlc291cmNlOiAna3BpcycsIGFjdGlvbjogJ3JlYWQnIH0sXG4gIC8vIEFkbWluXG4gIHsgbW9kdWxlOiAnYWRtaW4nLCByZXNvdXJjZTogJ2F1ZGl0JywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdhZG1pbicsIHJlc291cmNlOiAnYXVkaXQnLCBhY3Rpb246ICdleHBvcnQnIH0sXG4gIHsgbW9kdWxlOiAnYWRtaW4nLCByZXNvdXJjZTogJ3NldHRpbmdzJywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdhZG1pbicsIHJlc291cmNlOiAnc2V0dGluZ3MnLCBhY3Rpb246ICd1cGRhdGUnIH0sXG4gIHsgbW9kdWxlOiAnYWRtaW4nLCByZXNvdXJjZTogJ2JyYW5jaGVzJywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdhZG1pbicsIHJlc291cmNlOiAnYnJhbmNoZXMnLCBhY3Rpb246ICdjcmVhdGUnIH0sXG4gIHsgbW9kdWxlOiAnYWRtaW4nLCByZXNvdXJjZTogJ2JyYW5jaGVzJywgYWN0aW9uOiAndXBkYXRlJyB9LFxuICB7IG1vZHVsZTogJ2FkbWluJywgcmVzb3VyY2U6ICdsaWNlbnNlJywgYWN0aW9uOiAncmVhZCcgfSxcbiAgeyBtb2R1bGU6ICdhZG1pbicsIHJlc291cmNlOiAnbGljZW5zZScsIGFjdGlvbjogJ3VwZGF0ZScgfSxcbiAgeyBtb2R1bGU6ICdhZG1pbicsIHJlc291cmNlOiAnc3lzdGVtJywgYWN0aW9uOiAnY3JlYXRlJyB9LCAvLyBiYWNrdXBzXG5dO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgUm9sZSBcdTIxOTIgcGVybWlzc2lvbnMgbWFwcGluZyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmNvbnN0IFJPTEVfUEVSTUlTU0lPTlM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgc3VwZXJfYWRtaW46IFsnKjoqOionXSwgLy8gd2lsZGNhcmQgXHUyMDEzIGNvbXB1dGVkIGFzIGEgc3BlY2lhbCBjYXNlXG5cbiAgaG9zcGl0YWxfZGlyZWN0b3I6IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6cmVhZCcsICdwYXRpZW50czpwYXRpZW50czpleHBvcnQnLFxuICAgICdjbGluaWNhbDp2aXNpdHM6cmVhZCcsICdjbGluaWNhbDphZG1pc3Npb25zOnJlYWQnLCAnY2xpbmljYWw6YXBwb2ludG1lbnRzOnJlYWQnLFxuICAgICdsYWJvcmF0b3J5OnJlcXVlc3RzOnJlYWQnLCAnbGFib3JhdG9yeTpyZXN1bHRzOnJlYWQnLCAnbGFib3JhdG9yeTpjYXRhbG9nOnJlYWQnLFxuICAgICdyYWRpb2xvZ3k6cmVxdWVzdHM6cmVhZCcsICdyYWRpb2xvZ3k6cmVwb3J0czpyZWFkJyxcbiAgICAncGhhcm1hY3k6cHJlc2NyaXB0aW9uczpyZWFkJywgJ3BoYXJtYWN5OmludmVudG9yeTpyZWFkJyxcbiAgICAnZmluYW5jZTppbnZvaWNlczpyZWFkJywgJ2ZpbmFuY2U6cGF5bWVudHM6cmVhZCcsICdmaW5hbmNlOnBheXJvbGw6cmVhZCcsXG4gICAgJ2ZpbmFuY2U6YWNjb3VudHM6cmVhZCcsICdmaW5hbmNlOmluc3VyYW5jZTpyZWFkJyxcbiAgICAnaHI6dXNlcnM6cmVhZCcsICdocjphdHRlbmRhbmNlOnJlYWQnLCAnaHI6bGVhdmU6cmVhZCcsXG4gICAgJ2ludmVudG9yeTpzdG9jazpyZWFkJywgJ2ludmVudG9yeTpwbzpyZWFkJywgJ2ludmVudG9yeTphc3NldHM6cmVhZCcsXG4gICAgJ2FuYWx5dGljczpkYXNoYm9hcmQ6cmVhZCcsICdhbmFseXRpY3M6cmVwb3J0czpyZWFkJywgJ2FuYWx5dGljczpyZXBvcnRzOmV4cG9ydCcsICdhbmFseXRpY3M6a3BpczpyZWFkJyxcbiAgICAnYWRtaW46YXVkaXQ6cmVhZCcsICdhZG1pbjphdWRpdDpleHBvcnQnLCAnYWRtaW46c2V0dGluZ3M6cmVhZCcsICdhZG1pbjpicmFuY2hlczpyZWFkJywgJ2FkbWluOmxpY2Vuc2U6cmVhZCcsXG4gIF0sXG5cbiAgYnJhbmNoX2FkbWluOiBbXG4gICAgJ3BhdGllbnRzOnBhdGllbnRzOmNyZWF0ZScsICdwYXRpZW50czpwYXRpZW50czpyZWFkJywgJ3BhdGllbnRzOnBhdGllbnRzOnVwZGF0ZScsXG4gICAgJ3BhdGllbnRzOnZpdGFsczpyZWFkJyxcbiAgICAnY2xpbmljYWw6dmlzaXRzOnJlYWQnLCAnY2xpbmljYWw6YXBwb2ludG1lbnRzOnJlYWQnLCAnY2xpbmljYWw6YXBwb2ludG1lbnRzOmNyZWF0ZScsXG4gICAgJ2NsaW5pY2FsOmFkbWlzc2lvbnM6cmVhZCcsICdjbGluaWNhbDpiZWRzOnJlYWQnLFxuICAgICdsYWJvcmF0b3J5OnJlcXVlc3RzOnJlYWQnLCAnbGFib3JhdG9yeTpyZXN1bHRzOnJlYWQnLCAnbGFib3JhdG9yeTpjYXRhbG9nOnJlYWQnLFxuICAgICdwaGFybWFjeTpwcmVzY3JpcHRpb25zOnJlYWQnLCAncGhhcm1hY3k6aW52ZW50b3J5OnJlYWQnLFxuICAgICdmaW5hbmNlOmludm9pY2VzOnJlYWQnLCAnZmluYW5jZTpwYXltZW50czpyZWFkJywgJ2ZpbmFuY2U6aW5zdXJhbmNlOnJlYWQnLFxuICAgICdocjp1c2VyczpyZWFkJywgJ2hyOmF0dGVuZGFuY2U6cmVhZCcsICdocjpzaGlmdHM6cmVhZCcsXG4gICAgJ2ludmVudG9yeTpzdG9jazpyZWFkJywgJ2ludmVudG9yeTpwbzpyZWFkJywgJ2ludmVudG9yeTphc3NldHM6cmVhZCcsXG4gICAgJ2FuYWx5dGljczpkYXNoYm9hcmQ6cmVhZCcsICdhbmFseXRpY3M6cmVwb3J0czpyZWFkJywgJ2FuYWx5dGljczprcGlzOnJlYWQnLFxuICAgICdhZG1pbjphdWRpdDpyZWFkJywgJ2FkbWluOnNldHRpbmdzOnJlYWQnLCAnYWRtaW46YnJhbmNoZXM6cmVhZCcsXG4gIF0sXG5cbiAgZG9jdG9yOiBbXG4gICAgJ3BhdGllbnRzOnBhdGllbnRzOmNyZWF0ZScsICdwYXRpZW50czpwYXRpZW50czpyZWFkJywgJ3BhdGllbnRzOnBhdGllbnRzOnVwZGF0ZScsXG4gICAgJ3BhdGllbnRzOnZpdGFsczpjcmVhdGUnLCAncGF0aWVudHM6dml0YWxzOnJlYWQnLCAncGF0aWVudHM6dml0YWxzOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOnZpc2l0czpjcmVhdGUnLCAnY2xpbmljYWw6dmlzaXRzOnJlYWQnLCAnY2xpbmljYWw6dmlzaXRzOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOm5vdGVzOmNyZWF0ZScsICdjbGluaWNhbDpub3RlczpyZWFkJywgJ2NsaW5pY2FsOm5vdGVzOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOmRpYWdub3NlczpjcmVhdGUnLCAnY2xpbmljYWw6ZGlhZ25vc2VzOnJlYWQnLCAnY2xpbmljYWw6ZGlhZ25vc2VzOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOmFwcG9pbnRtZW50czpjcmVhdGUnLCAnY2xpbmljYWw6YXBwb2ludG1lbnRzOnJlYWQnLCAnY2xpbmljYWw6YXBwb2ludG1lbnRzOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOmFkbWlzc2lvbnM6Y3JlYXRlJywgJ2NsaW5pY2FsOmFkbWlzc2lvbnM6cmVhZCcsICdjbGluaWNhbDphZG1pc3Npb25zOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOmJlZHM6cmVhZCcsXG4gICAgJ2xhYm9yYXRvcnk6cmVxdWVzdHM6Y3JlYXRlJywgJ2xhYm9yYXRvcnk6cmVxdWVzdHM6cmVhZCcsXG4gICAgJ2xhYm9yYXRvcnk6cmVzdWx0czpyZWFkJywgJ2xhYm9yYXRvcnk6Y2F0YWxvZzpyZWFkJyxcbiAgICAncmFkaW9sb2d5OnJlcXVlc3RzOmNyZWF0ZScsICdyYWRpb2xvZ3k6cmVxdWVzdHM6cmVhZCcsICdyYWRpb2xvZ3k6cmVwb3J0czpyZWFkJyxcbiAgICAncGhhcm1hY3k6cHJlc2NyaXB0aW9uczpjcmVhdGUnLCAncGhhcm1hY3k6cHJlc2NyaXB0aW9uczpyZWFkJywgJ3BoYXJtYWN5OnByZXNjcmlwdGlvbnM6dXBkYXRlJyxcbiAgICAncGhhcm1hY3k6ZHJ1Z3M6cmVhZCcsXG4gICAgJ2ZpbmFuY2U6aW52b2ljZXM6cmVhZCcsICdmaW5hbmNlOnBheW1lbnRzOnJlYWQnLFxuICAgICdhbmFseXRpY3M6ZGFzaGJvYXJkOnJlYWQnLFxuICBdLFxuXG4gIHNwZWNpYWxpc3Q6IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6Y3JlYXRlJywgJ3BhdGllbnRzOnBhdGllbnRzOnJlYWQnLCAncGF0aWVudHM6cGF0aWVudHM6dXBkYXRlJyxcbiAgICAncGF0aWVudHM6dml0YWxzOmNyZWF0ZScsICdwYXRpZW50czp2aXRhbHM6cmVhZCcsXG4gICAgJ2NsaW5pY2FsOnZpc2l0czpjcmVhdGUnLCAnY2xpbmljYWw6dmlzaXRzOnJlYWQnLCAnY2xpbmljYWw6dmlzaXRzOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOm5vdGVzOmNyZWF0ZScsICdjbGluaWNhbDpub3RlczpyZWFkJywgJ2NsaW5pY2FsOm5vdGVzOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOmRpYWdub3NlczpjcmVhdGUnLCAnY2xpbmljYWw6ZGlhZ25vc2VzOnJlYWQnLFxuICAgICdjbGluaWNhbDphcHBvaW50bWVudHM6Y3JlYXRlJywgJ2NsaW5pY2FsOmFwcG9pbnRtZW50czpyZWFkJyxcbiAgICAnY2xpbmljYWw6YWRtaXNzaW9uczpyZWFkJyxcbiAgICAnbGFib3JhdG9yeTpyZXF1ZXN0czpjcmVhdGUnLCAnbGFib3JhdG9yeTpyZXF1ZXN0czpyZWFkJywgJ2xhYm9yYXRvcnk6cmVzdWx0czpyZWFkJyxcbiAgICAncmFkaW9sb2d5OnJlcXVlc3RzOmNyZWF0ZScsICdyYWRpb2xvZ3k6cmVxdWVzdHM6cmVhZCcsICdyYWRpb2xvZ3k6cmVwb3J0czpyZWFkJyxcbiAgICAncGhhcm1hY3k6cHJlc2NyaXB0aW9uczpjcmVhdGUnLCAncGhhcm1hY3k6cHJlc2NyaXB0aW9uczpyZWFkJywgJ3BoYXJtYWN5OmRydWdzOnJlYWQnLFxuICAgICdhbmFseXRpY3M6ZGFzaGJvYXJkOnJlYWQnLFxuICBdLFxuXG4gIHN1cmdlb246IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6cmVhZCcsICdwYXRpZW50czp2aXRhbHM6cmVhZCcsXG4gICAgJ2NsaW5pY2FsOnZpc2l0czpyZWFkJywgJ2NsaW5pY2FsOm5vdGVzOmNyZWF0ZScsICdjbGluaWNhbDpub3RlczpyZWFkJyxcbiAgICAnY2xpbmljYWw6ZGlhZ25vc2VzOmNyZWF0ZScsICdjbGluaWNhbDpkaWFnbm9zZXM6cmVhZCcsXG4gICAgJ2NsaW5pY2FsOmFkbWlzc2lvbnM6cmVhZCcsICdjbGluaWNhbDphZG1pc3Npb25zOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOnN1cmdlcnk6Y3JlYXRlJywgJ2NsaW5pY2FsOnN1cmdlcnk6cmVhZCcsICdjbGluaWNhbDpzdXJnZXJ5OnVwZGF0ZScsXG4gICAgJ2xhYm9yYXRvcnk6cmVxdWVzdHM6Y3JlYXRlJywgJ2xhYm9yYXRvcnk6cmVxdWVzdHM6cmVhZCcsICdsYWJvcmF0b3J5OnJlc3VsdHM6cmVhZCcsXG4gICAgJ3BoYXJtYWN5OnByZXNjcmlwdGlvbnM6Y3JlYXRlJywgJ3BoYXJtYWN5OnByZXNjcmlwdGlvbnM6cmVhZCcsXG4gICAgJ2FuYWx5dGljczpkYXNoYm9hcmQ6cmVhZCcsXG4gIF0sXG5cbiAgbnVyc2U6IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6cmVhZCcsICdwYXRpZW50czpwYXRpZW50czp1cGRhdGUnLFxuICAgICdwYXRpZW50czp2aXRhbHM6Y3JlYXRlJywgJ3BhdGllbnRzOnZpdGFsczpyZWFkJyxcbiAgICAnY2xpbmljYWw6dmlzaXRzOnJlYWQnLCAnY2xpbmljYWw6dmlzaXRzOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOm5vdGVzOmNyZWF0ZScsICdjbGluaWNhbDpub3RlczpyZWFkJyxcbiAgICAnY2xpbmljYWw6YWRtaXNzaW9uczpyZWFkJywgJ2NsaW5pY2FsOmFkbWlzc2lvbnM6dXBkYXRlJyxcbiAgICAnY2xpbmljYWw6YmVkczpyZWFkJywgJ2NsaW5pY2FsOmJlZHM6dXBkYXRlJyxcbiAgICAnY2xpbmljYWw6YXBwb2ludG1lbnRzOnJlYWQnLFxuICAgICdsYWJvcmF0b3J5OnJlc3VsdHM6cmVhZCcsXG4gICAgJ3BoYXJtYWN5OnByZXNjcmlwdGlvbnM6cmVhZCcsXG4gICAgJ3BoYXJtYWN5OmRpc3BlbnNpbmc6cmVhZCcsXG4gICAgJ2FuYWx5dGljczpkYXNoYm9hcmQ6cmVhZCcsXG4gIF0sXG5cbiAgbGFiX3RlY2huaWNpYW46IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6cmVhZCcsXG4gICAgJ2xhYm9yYXRvcnk6cmVxdWVzdHM6cmVhZCcsICdsYWJvcmF0b3J5OnJlcXVlc3RzOnVwZGF0ZScsXG4gICAgJ2xhYm9yYXRvcnk6cmVzdWx0czpjcmVhdGUnLCAnbGFib3JhdG9yeTpyZXN1bHRzOnJlYWQnLFxuICAgICdsYWJvcmF0b3J5OmNhdGFsb2c6cmVhZCcsXG4gICAgJ2FuYWx5dGljczpkYXNoYm9hcmQ6cmVhZCcsXG4gIF0sXG5cbiAgcmFkaW9sb2dpc3Q6IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6cmVhZCcsXG4gICAgJ3JhZGlvbG9neTpyZXF1ZXN0czpyZWFkJywgJ3JhZGlvbG9neTpyZXF1ZXN0czp1cGRhdGUnLFxuICAgICdyYWRpb2xvZ3k6cmVwb3J0czpjcmVhdGUnLCAncmFkaW9sb2d5OnJlcG9ydHM6cmVhZCcsXG4gICAgJ2FuYWx5dGljczpkYXNoYm9hcmQ6cmVhZCcsXG4gIF0sXG5cbiAgcGhhcm1hY2lzdDogW1xuICAgICdwYXRpZW50czpwYXRpZW50czpyZWFkJyxcbiAgICAncGhhcm1hY3k6cHJlc2NyaXB0aW9uczpyZWFkJywgJ3BoYXJtYWN5OnByZXNjcmlwdGlvbnM6dXBkYXRlJyxcbiAgICAncGhhcm1hY3k6ZGlzcGVuc2luZzpjcmVhdGUnLCAncGhhcm1hY3k6ZGlzcGVuc2luZzpyZWFkJyxcbiAgICAncGhhcm1hY3k6aW52ZW50b3J5OnJlYWQnLCAncGhhcm1hY3k6aW52ZW50b3J5OmNyZWF0ZScsICdwaGFybWFjeTppbnZlbnRvcnk6dXBkYXRlJyxcbiAgICAncGhhcm1hY3k6ZHJ1Z3M6cmVhZCcsICdwaGFybWFjeTpkcnVnczpjcmVhdGUnLCAncGhhcm1hY3k6ZHJ1Z3M6dXBkYXRlJyxcbiAgICAnYW5hbHl0aWNzOmRhc2hib2FyZDpyZWFkJyxcbiAgXSxcblxuICByZWNlcHRpb25pc3Q6IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6Y3JlYXRlJywgJ3BhdGllbnRzOnBhdGllbnRzOnJlYWQnLCAncGF0aWVudHM6cGF0aWVudHM6dXBkYXRlJyxcbiAgICAnY2xpbmljYWw6YXBwb2ludG1lbnRzOmNyZWF0ZScsICdjbGluaWNhbDphcHBvaW50bWVudHM6cmVhZCcsICdjbGluaWNhbDphcHBvaW50bWVudHM6dXBkYXRlJyxcbiAgICAnY2xpbmljYWw6dmlzaXRzOmNyZWF0ZScsICdjbGluaWNhbDp2aXNpdHM6cmVhZCcsXG4gICAgJ2ZpbmFuY2U6aW52b2ljZXM6cmVhZCcsICdmaW5hbmNlOnBheW1lbnRzOnJlYWQnLFxuICAgICdhbmFseXRpY3M6ZGFzaGJvYXJkOnJlYWQnLFxuICBdLFxuXG4gIHJlZ2lzdHJhdGlvbl9zdGFmZjogW1xuICAgICdwYXRpZW50czpwYXRpZW50czpjcmVhdGUnLCAncGF0aWVudHM6cGF0aWVudHM6cmVhZCcsICdwYXRpZW50czpwYXRpZW50czp1cGRhdGUnLFxuICAgICdjbGluaWNhbDphcHBvaW50bWVudHM6cmVhZCcsXG4gICAgJ2FuYWx5dGljczpkYXNoYm9hcmQ6cmVhZCcsXG4gIF0sXG5cbiAgYXBwb2ludG1lbnRfb2ZmaWNlcjogW1xuICAgICdwYXRpZW50czpwYXRpZW50czpyZWFkJyxcbiAgICAnY2xpbmljYWw6YXBwb2ludG1lbnRzOmNyZWF0ZScsICdjbGluaWNhbDphcHBvaW50bWVudHM6cmVhZCcsXG4gICAgJ2NsaW5pY2FsOmFwcG9pbnRtZW50czp1cGRhdGUnLCAnY2xpbmljYWw6YXBwb2ludG1lbnRzOmRlbGV0ZScsXG4gICAgJ2FuYWx5dGljczpkYXNoYm9hcmQ6cmVhZCcsXG4gIF0sXG5cbiAgYmlsbGluZ19vZmZpY2VyOiBbXG4gICAgJ3BhdGllbnRzOnBhdGllbnRzOnJlYWQnLFxuICAgICdmaW5hbmNlOmludm9pY2VzOmNyZWF0ZScsICdmaW5hbmNlOmludm9pY2VzOnJlYWQnLCAnZmluYW5jZTppbnZvaWNlczp1cGRhdGUnLFxuICAgICdmaW5hbmNlOnBheW1lbnRzOmNyZWF0ZScsICdmaW5hbmNlOnBheW1lbnRzOnJlYWQnLFxuICAgICdmaW5hbmNlOmluc3VyYW5jZTpyZWFkJyxcbiAgICAnYW5hbHl0aWNzOmRhc2hib2FyZDpyZWFkJyxcbiAgXSxcblxuICBpbnN1cmFuY2Vfb2ZmaWNlcjogW1xuICAgICdwYXRpZW50czpwYXRpZW50czpyZWFkJyxcbiAgICAnZmluYW5jZTppbnZvaWNlczpyZWFkJyxcbiAgICAnZmluYW5jZTppbnN1cmFuY2U6Y3JlYXRlJywgJ2ZpbmFuY2U6aW5zdXJhbmNlOnJlYWQnLCAnZmluYW5jZTppbnN1cmFuY2U6dXBkYXRlJyxcbiAgICAnYW5hbHl0aWNzOmRhc2hib2FyZDpyZWFkJyxcbiAgXSxcblxuICBhY2NvdW50YW50OiBbXG4gICAgJ2ZpbmFuY2U6aW52b2ljZXM6cmVhZCcsXG4gICAgJ2ZpbmFuY2U6cGF5bWVudHM6cmVhZCcsXG4gICAgJ2ZpbmFuY2U6YWNjb3VudHM6cmVhZCcsICdmaW5hbmNlOmFjY291bnRzOmNyZWF0ZScsICdmaW5hbmNlOmFjY291bnRzOnVwZGF0ZScsXG4gICAgJ2ZpbmFuY2U6cGF5cm9sbDpyZWFkJyxcbiAgICAnYW5hbHl0aWNzOmRhc2hib2FyZDpyZWFkJywgJ2FuYWx5dGljczpyZXBvcnRzOnJlYWQnLFxuICBdLFxuXG4gIGZpbmFuY2VfbWFuYWdlcjogW1xuICAgICdmaW5hbmNlOmludm9pY2VzOnJlYWQnLCAnZmluYW5jZTppbnZvaWNlczphcHByb3ZlJywgJ2ZpbmFuY2U6aW52b2ljZXM6dm9pZCcsXG4gICAgJ2ZpbmFuY2U6cGF5bWVudHM6cmVhZCcsICdmaW5hbmNlOnBheW1lbnRzOnZvaWQnLFxuICAgICdmaW5hbmNlOmluc3VyYW5jZTpyZWFkJywgJ2ZpbmFuY2U6aW5zdXJhbmNlOnVwZGF0ZScsXG4gICAgJ2ZpbmFuY2U6YWNjb3VudHM6cmVhZCcsICdmaW5hbmNlOmFjY291bnRzOmNyZWF0ZScsICdmaW5hbmNlOmFjY291bnRzOnVwZGF0ZScsXG4gICAgJ2ZpbmFuY2U6cGF5cm9sbDpyZWFkJywgJ2ZpbmFuY2U6cGF5cm9sbDpjcmVhdGUnLCAnZmluYW5jZTpwYXlyb2xsOmFwcHJvdmUnLFxuICAgICdocjp1c2VyczpyZWFkJyxcbiAgICAnYW5hbHl0aWNzOmRhc2hib2FyZDpyZWFkJywgJ2FuYWx5dGljczpyZXBvcnRzOnJlYWQnLCAnYW5hbHl0aWNzOnJlcG9ydHM6ZXhwb3J0JywgJ2FuYWx5dGljczprcGlzOnJlYWQnLFxuICAgICdhZG1pbjphdWRpdDpyZWFkJyxcbiAgXSxcblxuICBwYXlyb2xsX29mZmljZXI6IFtcbiAgICAnaHI6dXNlcnM6cmVhZCcsICdocjphdHRlbmRhbmNlOnJlYWQnLFxuICAgICdmaW5hbmNlOnBheXJvbGw6cmVhZCcsICdmaW5hbmNlOnBheXJvbGw6Y3JlYXRlJyxcbiAgICAnYW5hbHl0aWNzOmRhc2hib2FyZDpyZWFkJyxcbiAgXSxcblxuICBocl9tYW5hZ2VyOiBbXG4gICAgJ2hyOnVzZXJzOmNyZWF0ZScsICdocjp1c2VyczpyZWFkJywgJ2hyOnVzZXJzOnVwZGF0ZScsXG4gICAgJ2hyOmF0dGVuZGFuY2U6Y3JlYXRlJywgJ2hyOmF0dGVuZGFuY2U6cmVhZCcsICdocjphdHRlbmRhbmNlOnVwZGF0ZScsXG4gICAgJ2hyOmxlYXZlOmNyZWF0ZScsICdocjpsZWF2ZTpyZWFkJywgJ2hyOmxlYXZlOmFwcHJvdmUnLFxuICAgICdocjpzaGlmdHM6Y3JlYXRlJywgJ2hyOnNoaWZ0czpyZWFkJywgJ2hyOnNoaWZ0czp1cGRhdGUnLFxuICAgICdmaW5hbmNlOnBheXJvbGw6cmVhZCcsXG4gICAgJ2FuYWx5dGljczpkYXNoYm9hcmQ6cmVhZCcsICdhbmFseXRpY3M6cmVwb3J0czpyZWFkJyxcbiAgXSxcblxuICBpbnZlbnRvcnlfbWFuYWdlcjogW1xuICAgICdpbnZlbnRvcnk6c3RvY2s6cmVhZCcsICdpbnZlbnRvcnk6c3RvY2s6dXBkYXRlJyxcbiAgICAnaW52ZW50b3J5OnBvOmNyZWF0ZScsICdpbnZlbnRvcnk6cG86cmVhZCcsXG4gICAgJ2ludmVudG9yeTpzdXBwbGllcnM6cmVhZCcsICdpbnZlbnRvcnk6c3VwcGxpZXJzOmNyZWF0ZScsXG4gICAgJ2ludmVudG9yeTphc3NldHM6cmVhZCcsICdpbnZlbnRvcnk6YXNzZXRzOmNyZWF0ZScsICdpbnZlbnRvcnk6YXNzZXRzOnVwZGF0ZScsXG4gICAgJ2FuYWx5dGljczpkYXNoYm9hcmQ6cmVhZCcsXG4gIF0sXG5cbiAgcHJvY3VyZW1lbnRfb2ZmaWNlcjogW1xuICAgICdpbnZlbnRvcnk6c3RvY2s6cmVhZCcsXG4gICAgJ2ludmVudG9yeTpwbzpjcmVhdGUnLCAnaW52ZW50b3J5OnBvOnJlYWQnLFxuICAgICdpbnZlbnRvcnk6c3VwcGxpZXJzOnJlYWQnLCAnaW52ZW50b3J5OnN1cHBsaWVyczpjcmVhdGUnLCAnaW52ZW50b3J5OnN1cHBsaWVyczp1cGRhdGUnLFxuICAgICdhbmFseXRpY3M6ZGFzaGJvYXJkOnJlYWQnLFxuICBdLFxuXG4gIG9wZXJhdGlvbnNfbWFuYWdlcjogW1xuICAgICdpbnZlbnRvcnk6c3RvY2s6cmVhZCcsICdpbnZlbnRvcnk6c3RvY2s6dXBkYXRlJyxcbiAgICAnaW52ZW50b3J5OnBvOnJlYWQnLCAnaW52ZW50b3J5OnBvOmFwcHJvdmUnLFxuICAgICdpbnZlbnRvcnk6c3VwcGxpZXJzOnJlYWQnLCAnaW52ZW50b3J5OmFzc2V0czpyZWFkJyxcbiAgICAnaHI6YXR0ZW5kYW5jZTpyZWFkJywgJ2hyOnNoaWZ0czpyZWFkJyxcbiAgICAnYW5hbHl0aWNzOmRhc2hib2FyZDpyZWFkJywgJ2FuYWx5dGljczpyZXBvcnRzOnJlYWQnLCAnYW5hbHl0aWNzOmtwaXM6cmVhZCcsXG4gIF0sXG5cbiAgaXRfYWRtaW46IFtcbiAgICAnYWRtaW46YXVkaXQ6cmVhZCcsICdhZG1pbjphdWRpdDpleHBvcnQnLFxuICAgICdhZG1pbjpzZXR0aW5nczpyZWFkJywgJ2FkbWluOnNldHRpbmdzOnVwZGF0ZScsXG4gICAgJ2FkbWluOmJyYW5jaGVzOnJlYWQnLCAnYWRtaW46YnJhbmNoZXM6Y3JlYXRlJywgJ2FkbWluOmJyYW5jaGVzOnVwZGF0ZScsXG4gICAgJ2FkbWluOmxpY2Vuc2U6cmVhZCcsICdhZG1pbjpsaWNlbnNlOnVwZGF0ZScsXG4gICAgJ2FkbWluOnN5c3RlbTpjcmVhdGUnLFxuICAgICdocjp1c2VyczpyZWFkJywgJ2hyOnVzZXJzOmNyZWF0ZScsICdocjp1c2Vyczp1cGRhdGUnLFxuICAgICdhbmFseXRpY3M6ZGFzaGJvYXJkOnJlYWQnLFxuICBdLFxuXG4gIHBhdGllbnQ6IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6cmVhZCcsIC8vIG93biByZWNvcmRzIG9ubHkgXHUyMDEzIGVuZm9yY2VkIGF0IEFQSSBsZXZlbFxuICAgICdjbGluaWNhbDphcHBvaW50bWVudHM6Y3JlYXRlJywgJ2NsaW5pY2FsOmFwcG9pbnRtZW50czpyZWFkJyxcbiAgICAnZmluYW5jZTppbnZvaWNlczpyZWFkJyxcbiAgXSxcblxuICB0aGVyYXBpc3Q6IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6cmVhZCcsICdwYXRpZW50czp2aXRhbHM6cmVhZCcsXG4gICAgJ2NsaW5pY2FsOnZpc2l0czpyZWFkJywgJ2NsaW5pY2FsOm5vdGVzOmNyZWF0ZScsICdjbGluaWNhbDpub3RlczpyZWFkJyxcbiAgICAnY2xpbmljYWw6YWRtaXNzaW9uczpyZWFkJyxcbiAgICAnYW5hbHl0aWNzOmRhc2hib2FyZDpyZWFkJyxcbiAgXSxcblxuICBudXRyaXRpb25pc3Q6IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6cmVhZCcsICdwYXRpZW50czp2aXRhbHM6cmVhZCcsICdwYXRpZW50czp2aXRhbHM6Y3JlYXRlJyxcbiAgICAnY2xpbmljYWw6dmlzaXRzOnJlYWQnLCAnY2xpbmljYWw6bm90ZXM6Y3JlYXRlJywgJ2NsaW5pY2FsOm5vdGVzOnJlYWQnLFxuICAgICdhbmFseXRpY3M6ZGFzaGJvYXJkOnJlYWQnLFxuICBdLFxuXG4gIGRlbnRpc3Q6IFtcbiAgICAncGF0aWVudHM6cGF0aWVudHM6Y3JlYXRlJywgJ3BhdGllbnRzOnBhdGllbnRzOnJlYWQnLCAncGF0aWVudHM6cGF0aWVudHM6dXBkYXRlJyxcbiAgICAncGF0aWVudHM6dml0YWxzOmNyZWF0ZScsICdwYXRpZW50czp2aXRhbHM6cmVhZCcsXG4gICAgJ2NsaW5pY2FsOnZpc2l0czpjcmVhdGUnLCAnY2xpbmljYWw6dmlzaXRzOnJlYWQnLCAnY2xpbmljYWw6dmlzaXRzOnVwZGF0ZScsXG4gICAgJ2NsaW5pY2FsOm5vdGVzOmNyZWF0ZScsICdjbGluaWNhbDpub3RlczpyZWFkJyxcbiAgICAnY2xpbmljYWw6ZGlhZ25vc2VzOmNyZWF0ZScsICdjbGluaWNhbDpkaWFnbm9zZXM6cmVhZCcsXG4gICAgJ2NsaW5pY2FsOmFwcG9pbnRtZW50czpjcmVhdGUnLCAnY2xpbmljYWw6YXBwb2ludG1lbnRzOnJlYWQnLFxuICAgICdwaGFybWFjeTpwcmVzY3JpcHRpb25zOmNyZWF0ZScsICdwaGFybWFjeTpwcmVzY3JpcHRpb25zOnJlYWQnLFxuICAgICdhbmFseXRpY3M6ZGFzaGJvYXJkOnJlYWQnLFxuICBdLFxufTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIFNlZWRlciBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmV4cG9ydCBmdW5jdGlvbiBzZWVkUGVybWlzc2lvbnMoKTogdm9pZCB7XG4gIGNvbnNvbGUubG9nKCdbUkJBQ10gU2VlZGluZyBwZXJtaXNzaW9ucy4uLicpO1xuXG4gIGRiLnRyYW5zYWN0aW9uKCgpID0+IHtcbiAgICAvLyAxLiBJbnNlcnQgYWxsIHBlcm1pc3Npb25zXG4gICAgZm9yIChjb25zdCBwZXJtIG9mIEFMTF9QRVJNSVNTSU9OUykge1xuICAgICAgZGIucnVuKFxuICAgICAgICBgSU5TRVJUIE9SIElHTk9SRSBJTlRPIHBlcm1pc3Npb25zIChpZCwgbW9kdWxlLCByZXNvdXJjZSwgYWN0aW9uKVxuICAgICAgICAgVkFMVUVTIChsb3dlcihoZXgocmFuZG9tYmxvYigxNikpKSwgPywgPywgPylgLFxuICAgICAgICBbcGVybS5tb2R1bGUsIHBlcm0ucmVzb3VyY2UsIHBlcm0uYWN0aW9uXSxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gMi4gQXNzaWduIHBlcm1pc3Npb25zIHRvIHJvbGVzXG4gICAgZm9yIChjb25zdCBbcm9sZU5hbWUsIHBlcm1LZXlzXSBvZiBPYmplY3QuZW50cmllcyhST0xFX1BFUk1JU1NJT05TKSkge1xuICAgICAgY29uc3Qgcm9sZSA9IGRiLmZpbmRPbmU8eyBpZDogc3RyaW5nIH0+KFxuICAgICAgICBgU0VMRUNUIGlkIEZST00gcm9sZXMgV0hFUkUgbmFtZSA9ID9gLCBbcm9sZU5hbWVdLFxuICAgICAgKTtcbiAgICAgIGlmICghcm9sZSkgeyBjb25zb2xlLndhcm4oYFtSQkFDXSBSb2xlIG5vdCBmb3VuZDogJHtyb2xlTmFtZX1gKTsgY29udGludWU7IH1cblxuICAgICAgLy8gSGFuZGxlIHdpbGRjYXJkIGZvciBzdXBlcl9hZG1pblxuICAgICAgaWYgKHBlcm1LZXlzLmluY2x1ZGVzKCcqOio6KicpKSB7XG4gICAgICAgIC8vIFN1cGVyIGFkbWluIGdldHMgYWxsIHBlcm1pc3Npb25zXG4gICAgICAgIGNvbnN0IGFsbFBlcm1zID0gZGIucXVlcnk8eyBpZDogc3RyaW5nIH0+KGBTRUxFQ1QgaWQgRlJPTSBwZXJtaXNzaW9uc2ApLnJvd3M7XG4gICAgICAgIGZvciAoY29uc3QgcCBvZiBhbGxQZXJtcykge1xuICAgICAgICAgIGRiLnJ1bihcbiAgICAgICAgICAgIGBJTlNFUlQgT1IgSUdOT1JFIElOVE8gcm9sZV9wZXJtaXNzaW9ucyAocm9sZV9pZCwgcGVybWlzc2lvbl9pZCkgVkFMVUVTICg/LCA/KWAsXG4gICAgICAgICAgICBbcm9sZS5pZCwgcC5pZF0sXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgZm9yIChjb25zdCBrZXkgb2YgcGVybUtleXMpIHtcbiAgICAgICAgY29uc3QgW21vZHVsZSwgcmVzb3VyY2UsIGFjdGlvbl0gPSBrZXkuc3BsaXQoJzonKTtcbiAgICAgICAgY29uc3QgcGVybSA9IGRiLmZpbmRPbmU8eyBpZDogc3RyaW5nIH0+KFxuICAgICAgICAgIGBTRUxFQ1QgaWQgRlJPTSBwZXJtaXNzaW9ucyBXSEVSRSBtb2R1bGUgPSA/IEFORCByZXNvdXJjZSA9ID8gQU5EIGFjdGlvbiA9ID9gLFxuICAgICAgICAgIFttb2R1bGUsIHJlc291cmNlLCBhY3Rpb25dLFxuICAgICAgICApO1xuICAgICAgICBpZiAoIXBlcm0pIHsgY29uc29sZS53YXJuKGBbUkJBQ10gUGVybWlzc2lvbiBub3QgZm91bmQ6ICR7a2V5fWApOyBjb250aW51ZTsgfVxuICAgICAgICBkYi5ydW4oXG4gICAgICAgICAgYElOU0VSVCBPUiBJR05PUkUgSU5UTyByb2xlX3Blcm1pc3Npb25zIChyb2xlX2lkLCBwZXJtaXNzaW9uX2lkKSBWQUxVRVMgKD8sID8pYCxcbiAgICAgICAgICBbcm9sZS5pZCwgcGVybS5pZF0sXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICBjb25zdCBwZXJtQ291bnQgPSBkYi5jb3VudCgncGVybWlzc2lvbnMnKTtcbiAgY29uc3QgcnBDb3VudCA9IGRiLmNvdW50KCdyb2xlX3Blcm1pc3Npb25zJyk7XG4gIGNvbnNvbGUubG9nKGBbUkJBQ10gXHUyNzEzICR7cGVybUNvdW50fSBwZXJtaXNzaW9ucywgJHtycENvdW50fSByb2xlLXBlcm1pc3Npb24gYXNzaWdubWVudHNgKTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwIENyZWF0ZSBkZWZhdWx0IHN1cGVyIGFkbWluIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZURlZmF1bHRTdXBlckFkbWluKCk6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCBleGlzdHMgPSBkYi5leGlzdHMoJ3VzZXJzJywgYHJvbGVfaWQgPSAncm9sZS1zdXBlcmFkbWluJyBBTkQgaXNfYWN0aXZlID0gMWApO1xuICBpZiAoZXhpc3RzKSByZXR1cm47XG5cbiAgY29uc3QgeyBhdXRoU2VydmljZSB9ID0gYXdhaXQgaW1wb3J0KCcuLi9hdXRoL2F1dGgtc2VydmljZScpO1xuICBjb25zdCByZXN1bHQgPSBhd2FpdCBhdXRoU2VydmljZS5jcmVhdGVVc2VyKHtcbiAgICB1c2VybmFtZTogJ2FkbWluJyxcbiAgICBlbWFpbDogJ2FkbWluQGFmeWFjb3JlLmxvY2FsJyxcbiAgICBwYXNzd29yZDogJ0FmeWFDb3JlQDIwMjQhJyxcbiAgICBmaXJzdE5hbWU6ICdTeXN0ZW0nLFxuICAgIGxhc3ROYW1lOiAnQWRtaW5pc3RyYXRvcicsXG4gICAgcm9sZUlkOiAncm9sZS1zdXBlcmFkbWluJyxcbiAgICBjcmVhdGVkQnk6ICdzeXN0ZW0nLFxuICB9KTtcblxuICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcbiAgICAvLyBGb3JjZSBwYXNzd29yZCBjaGFuZ2Ugb24gZmlyc3QgbG9naW5cbiAgICBkYi5ydW4oYFVQREFURSB1c2VycyBTRVQgbXVzdF9jaGFuZ2VfcGFzc3dvcmQgPSAxIFdIRVJFIGlkID0gP2AsIFtyZXN1bHQudXNlcklkIV0pO1xuICAgIGNvbnNvbGUubG9nKCdbU2V0dXBdIFx1MjcxMyBEZWZhdWx0IHN1cGVyIGFkbWluIGNyZWF0ZWQ6IGFkbWluIC8gQWZ5YUNvcmVAMjAyNCEnKTtcbiAgICBjb25zb2xlLmxvZygnW1NldHVwXSBcdTI2QTBcdUZFMEYgIENIQU5HRSBERUZBVUxUIFBBU1NXT1JEIElNTUVESUFURUxZJyk7XG4gIH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7O0FBR0EsSUFBTSxrQkFBa0I7QUFB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
