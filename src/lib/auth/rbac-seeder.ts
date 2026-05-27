import { db } from '../lib/db/database';

// ─── All permissions in the system ────────────────────────────────────────────
const ALL_PERMISSIONS = [
  // Patients
  { module: 'patients', resource: 'patients', action: 'create' },
  { module: 'patients', resource: 'patients', action: 'read' },
  { module: 'patients', resource: 'patients', action: 'update' },
  { module: 'patients', resource: 'patients', action: 'delete' },
  { module: 'patients', resource: 'patients', action: 'export' },
  { module: 'patients', resource: 'vitals', action: 'create' },
  { module: 'patients', resource: 'vitals', action: 'read' },
  { module: 'patients', resource: 'vitals', action: 'update' },
  // Clinical
  { module: 'clinical', resource: 'visits', action: 'create' },
  { module: 'clinical', resource: 'visits', action: 'read' },
  { module: 'clinical', resource: 'visits', action: 'update' },
  { module: 'clinical', resource: 'notes', action: 'create' },
  { module: 'clinical', resource: 'notes', action: 'read' },
  { module: 'clinical', resource: 'notes', action: 'update' },
  { module: 'clinical', resource: 'diagnoses', action: 'create' },
  { module: 'clinical', resource: 'diagnoses', action: 'read' },
  { module: 'clinical', resource: 'diagnoses', action: 'update' },
  { module: 'clinical', resource: 'appointments', action: 'create' },
  { module: 'clinical', resource: 'appointments', action: 'read' },
  { module: 'clinical', resource: 'appointments', action: 'update' },
  { module: 'clinical', resource: 'appointments', action: 'delete' },
  { module: 'clinical', resource: 'admissions', action: 'create' },
  { module: 'clinical', resource: 'admissions', action: 'read' },
  { module: 'clinical', resource: 'admissions', action: 'update' },
  { module: 'clinical', resource: 'beds', action: 'read' },
  { module: 'clinical', resource: 'beds', action: 'update' },
  { module: 'clinical', resource: 'surgery', action: 'create' },
  { module: 'clinical', resource: 'surgery', action: 'read' },
  { module: 'clinical', resource: 'surgery', action: 'update' },
  { module: 'clinical', resource: 'emergency', action: 'create' },
  { module: 'clinical', resource: 'emergency', action: 'read' },
  // Laboratory
  { module: 'laboratory', resource: 'requests', action: 'create' },
  { module: 'laboratory', resource: 'requests', action: 'read' },
  { module: 'laboratory', resource: 'requests', action: 'update' },
  { module: 'laboratory', resource: 'results', action: 'create' },
  { module: 'laboratory', resource: 'results', action: 'read' },
  { module: 'laboratory', resource: 'results', action: 'approve' },
  { module: 'laboratory', resource: 'catalog', action: 'read' },
  { module: 'laboratory', resource: 'catalog', action: 'create' },
  { module: 'laboratory', resource: 'catalog', action: 'update' },
  // Radiology
  { module: 'radiology', resource: 'requests', action: 'create' },
  { module: 'radiology', resource: 'requests', action: 'read' },
  { module: 'radiology', resource: 'requests', action: 'update' },
  { module: 'radiology', resource: 'reports', action: 'create' },
  { module: 'radiology', resource: 'reports', action: 'read' },
  // Pharmacy
  { module: 'pharmacy', resource: 'prescriptions', action: 'create' },
  { module: 'pharmacy', resource: 'prescriptions', action: 'read' },
  { module: 'pharmacy', resource: 'prescriptions', action: 'update' },
  { module: 'pharmacy', resource: 'prescriptions', action: 'void' },
  { module: 'pharmacy', resource: 'dispensing', action: 'create' },
  { module: 'pharmacy', resource: 'dispensing', action: 'read' },
  { module: 'pharmacy', resource: 'inventory', action: 'read' },
  { module: 'pharmacy', resource: 'inventory', action: 'create' },
  { module: 'pharmacy', resource: 'inventory', action: 'update' },
  { module: 'pharmacy', resource: 'drugs', action: 'read' },
  { module: 'pharmacy', resource: 'drugs', action: 'create' },
  { module: 'pharmacy', resource: 'drugs', action: 'update' },
  // Finance
  { module: 'finance', resource: 'invoices', action: 'create' },
  { module: 'finance', resource: 'invoices', action: 'read' },
  { module: 'finance', resource: 'invoices', action: 'update' },
  { module: 'finance', resource: 'invoices', action: 'void' },
  { module: 'finance', resource: 'invoices', action: 'approve' },
  { module: 'finance', resource: 'payments', action: 'create' },
  { module: 'finance', resource: 'payments', action: 'read' },
  { module: 'finance', resource: 'payments', action: 'void' },
  { module: 'finance', resource: 'insurance', action: 'create' },
  { module: 'finance', resource: 'insurance', action: 'read' },
  { module: 'finance', resource: 'insurance', action: 'update' },
  { module: 'finance', resource: 'accounts', action: 'read' },
  { module: 'finance', resource: 'accounts', action: 'create' },
  { module: 'finance', resource: 'accounts', action: 'update' },
  { module: 'finance', resource: 'payroll', action: 'read' },
  { module: 'finance', resource: 'payroll', action: 'create' },
  { module: 'finance', resource: 'payroll', action: 'approve' },
  // HR
  { module: 'hr', resource: 'users', action: 'create' },
  { module: 'hr', resource: 'users', action: 'read' },
  { module: 'hr', resource: 'users', action: 'update' },
  { module: 'hr', resource: 'users', action: 'delete' },
  { module: 'hr', resource: 'attendance', action: 'create' },
  { module: 'hr', resource: 'attendance', action: 'read' },
  { module: 'hr', resource: 'attendance', action: 'update' },
  { module: 'hr', resource: 'leave', action: 'create' },
  { module: 'hr', resource: 'leave', action: 'read' },
  { module: 'hr', resource: 'leave', action: 'approve' },
  { module: 'hr', resource: 'shifts', action: 'create' },
  { module: 'hr', resource: 'shifts', action: 'read' },
  { module: 'hr', resource: 'shifts', action: 'update' },
  // Inventory
  { module: 'inventory', resource: 'stock', action: 'read' },
  { module: 'inventory', resource: 'stock', action: 'update' },
  { module: 'inventory', resource: 'po', action: 'create' },
  { module: 'inventory', resource: 'po', action: 'read' },
  { module: 'inventory', resource: 'po', action: 'approve' },
  { module: 'inventory', resource: 'suppliers', action: 'read' },
  { module: 'inventory', resource: 'suppliers', action: 'create' },
  { module: 'inventory', resource: 'suppliers', action: 'update' },
  { module: 'inventory', resource: 'assets', action: 'read' },
  { module: 'inventory', resource: 'assets', action: 'create' },
  { module: 'inventory', resource: 'assets', action: 'update' },
  // Analytics
  { module: 'analytics', resource: 'dashboard', action: 'read' },
  { module: 'analytics', resource: 'reports', action: 'read' },
  { module: 'analytics', resource: 'reports', action: 'export' },
  { module: 'analytics', resource: 'kpis', action: 'read' },
  // Admin
  { module: 'admin', resource: 'audit', action: 'read' },
  { module: 'admin', resource: 'audit', action: 'export' },
  { module: 'admin', resource: 'settings', action: 'read' },
  { module: 'admin', resource: 'settings', action: 'update' },
  { module: 'admin', resource: 'branches', action: 'read' },
  { module: 'admin', resource: 'branches', action: 'create' },
  { module: 'admin', resource: 'branches', action: 'update' },
  { module: 'admin', resource: 'license', action: 'read' },
  { module: 'admin', resource: 'license', action: 'update' },
  { module: 'admin', resource: 'system', action: 'create' }, // backups
];

// ─── Role → permissions mapping ────────────────────────────────────────────────
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*:*:*'], // wildcard – computed as a special case

  hospital_director: [
    'patients:patients:read', 'patients:patients:export',
    'clinical:visits:read', 'clinical:admissions:read', 'clinical:appointments:read',
    'laboratory:requests:read', 'laboratory:results:read', 'laboratory:catalog:read',
    'radiology:requests:read', 'radiology:reports:read',
    'pharmacy:prescriptions:read', 'pharmacy:inventory:read',
    'finance:invoices:read', 'finance:payments:read', 'finance:payroll:read',
    'finance:accounts:read', 'finance:insurance:read',
    'hr:users:read', 'hr:attendance:read', 'hr:leave:read',
    'inventory:stock:read', 'inventory:po:read', 'inventory:assets:read',
    'analytics:dashboard:read', 'analytics:reports:read', 'analytics:reports:export', 'analytics:kpis:read',
    'admin:audit:read', 'admin:audit:export', 'admin:settings:read', 'admin:branches:read', 'admin:license:read',
  ],

  branch_admin: [
    'patients:patients:create', 'patients:patients:read', 'patients:patients:update',
    'patients:vitals:read',
    'clinical:visits:read', 'clinical:appointments:read', 'clinical:appointments:create',
    'clinical:admissions:read', 'clinical:beds:read',
    'laboratory:requests:read', 'laboratory:results:read', 'laboratory:catalog:read',
    'pharmacy:prescriptions:read', 'pharmacy:inventory:read',
    'finance:invoices:read', 'finance:payments:read', 'finance:insurance:read',
    'hr:users:read', 'hr:attendance:read', 'hr:shifts:read',
    'inventory:stock:read', 'inventory:po:read', 'inventory:assets:read',
    'analytics:dashboard:read', 'analytics:reports:read', 'analytics:kpis:read',
    'admin:audit:read', 'admin:settings:read', 'admin:branches:read',
  ],

  doctor: [
    'patients:patients:create', 'patients:patients:read', 'patients:patients:update',
    'patients:vitals:create', 'patients:vitals:read', 'patients:vitals:update',
    'clinical:visits:create', 'clinical:visits:read', 'clinical:visits:update',
    'clinical:notes:create', 'clinical:notes:read', 'clinical:notes:update',
    'clinical:diagnoses:create', 'clinical:diagnoses:read', 'clinical:diagnoses:update',
    'clinical:appointments:create', 'clinical:appointments:read', 'clinical:appointments:update',
    'clinical:admissions:create', 'clinical:admissions:read', 'clinical:admissions:update',
    'clinical:beds:read',
    'laboratory:requests:create', 'laboratory:requests:read',
    'laboratory:results:read', 'laboratory:catalog:read',
    'radiology:requests:create', 'radiology:requests:read', 'radiology:reports:read',
    'pharmacy:prescriptions:create', 'pharmacy:prescriptions:read', 'pharmacy:prescriptions:update',
    'pharmacy:drugs:read',
    'finance:invoices:read', 'finance:payments:read',
    'analytics:dashboard:read',
  ],

  specialist: [
    'patients:patients:create', 'patients:patients:read', 'patients:patients:update',
    'patients:vitals:create', 'patients:vitals:read',
    'clinical:visits:create', 'clinical:visits:read', 'clinical:visits:update',
    'clinical:notes:create', 'clinical:notes:read', 'clinical:notes:update',
    'clinical:diagnoses:create', 'clinical:diagnoses:read',
    'clinical:appointments:create', 'clinical:appointments:read',
    'clinical:admissions:read',
    'laboratory:requests:create', 'laboratory:requests:read', 'laboratory:results:read',
    'radiology:requests:create', 'radiology:requests:read', 'radiology:reports:read',
    'pharmacy:prescriptions:create', 'pharmacy:prescriptions:read', 'pharmacy:drugs:read',
    'analytics:dashboard:read',
  ],

  surgeon: [
    'patients:patients:read', 'patients:vitals:read',
    'clinical:visits:read', 'clinical:notes:create', 'clinical:notes:read',
    'clinical:diagnoses:create', 'clinical:diagnoses:read',
    'clinical:admissions:read', 'clinical:admissions:update',
    'clinical:surgery:create', 'clinical:surgery:read', 'clinical:surgery:update',
    'laboratory:requests:create', 'laboratory:requests:read', 'laboratory:results:read',
    'pharmacy:prescriptions:create', 'pharmacy:prescriptions:read',
    'analytics:dashboard:read',
  ],

  nurse: [
    'patients:patients:read', 'patients:patients:update',
    'patients:vitals:create', 'patients:vitals:read',
    'clinical:visits:read', 'clinical:visits:update',
    'clinical:notes:create', 'clinical:notes:read',
    'clinical:admissions:read', 'clinical:admissions:update',
    'clinical:beds:read', 'clinical:beds:update',
    'clinical:appointments:read',
    'laboratory:results:read',
    'pharmacy:prescriptions:read',
    'pharmacy:dispensing:read',
    'analytics:dashboard:read',
  ],

  lab_technician: [
    'patients:patients:read',
    'laboratory:requests:read', 'laboratory:requests:update',
    'laboratory:results:create', 'laboratory:results:read',
    'laboratory:catalog:read',
    'analytics:dashboard:read',
  ],

  radiologist: [
    'patients:patients:read',
    'radiology:requests:read', 'radiology:requests:update',
    'radiology:reports:create', 'radiology:reports:read',
    'analytics:dashboard:read',
  ],

  pharmacist: [
    'patients:patients:read',
    'pharmacy:prescriptions:read', 'pharmacy:prescriptions:update',
    'pharmacy:dispensing:create', 'pharmacy:dispensing:read',
    'pharmacy:inventory:read', 'pharmacy:inventory:create', 'pharmacy:inventory:update',
    'pharmacy:drugs:read', 'pharmacy:drugs:create', 'pharmacy:drugs:update',
    'analytics:dashboard:read',
  ],

  receptionist: [
    'patients:patients:create', 'patients:patients:read', 'patients:patients:update',
    'clinical:appointments:create', 'clinical:appointments:read', 'clinical:appointments:update',
    'clinical:visits:create', 'clinical:visits:read',
    'finance:invoices:read', 'finance:payments:read',
    'analytics:dashboard:read',
  ],

  registration_staff: [
    'patients:patients:create', 'patients:patients:read', 'patients:patients:update',
    'clinical:appointments:read',
    'analytics:dashboard:read',
  ],

  appointment_officer: [
    'patients:patients:read',
    'clinical:appointments:create', 'clinical:appointments:read',
    'clinical:appointments:update', 'clinical:appointments:delete',
    'analytics:dashboard:read',
  ],

  billing_officer: [
    'patients:patients:read',
    'finance:invoices:create', 'finance:invoices:read', 'finance:invoices:update',
    'finance:payments:create', 'finance:payments:read',
    'finance:insurance:read',
    'analytics:dashboard:read',
  ],

  insurance_officer: [
    'patients:patients:read',
    'finance:invoices:read',
    'finance:insurance:create', 'finance:insurance:read', 'finance:insurance:update',
    'analytics:dashboard:read',
  ],

  accountant: [
    'finance:invoices:read',
    'finance:payments:read',
    'finance:accounts:read', 'finance:accounts:create', 'finance:accounts:update',
    'finance:payroll:read',
    'analytics:dashboard:read', 'analytics:reports:read',
  ],

  finance_manager: [
    'finance:invoices:read', 'finance:invoices:approve', 'finance:invoices:void',
    'finance:payments:read', 'finance:payments:void',
    'finance:insurance:read', 'finance:insurance:update',
    'finance:accounts:read', 'finance:accounts:create', 'finance:accounts:update',
    'finance:payroll:read', 'finance:payroll:create', 'finance:payroll:approve',
    'hr:users:read',
    'analytics:dashboard:read', 'analytics:reports:read', 'analytics:reports:export', 'analytics:kpis:read',
    'admin:audit:read',
  ],

  payroll_officer: [
    'hr:users:read', 'hr:attendance:read',
    'finance:payroll:read', 'finance:payroll:create',
    'analytics:dashboard:read',
  ],

  hr_manager: [
    'hr:users:create', 'hr:users:read', 'hr:users:update',
    'hr:attendance:create', 'hr:attendance:read', 'hr:attendance:update',
    'hr:leave:create', 'hr:leave:read', 'hr:leave:approve',
    'hr:shifts:create', 'hr:shifts:read', 'hr:shifts:update',
    'finance:payroll:read',
    'analytics:dashboard:read', 'analytics:reports:read',
  ],

  inventory_manager: [
    'inventory:stock:read', 'inventory:stock:update',
    'inventory:po:create', 'inventory:po:read',
    'inventory:suppliers:read', 'inventory:suppliers:create',
    'inventory:assets:read', 'inventory:assets:create', 'inventory:assets:update',
    'analytics:dashboard:read',
  ],

  procurement_officer: [
    'inventory:stock:read',
    'inventory:po:create', 'inventory:po:read',
    'inventory:suppliers:read', 'inventory:suppliers:create', 'inventory:suppliers:update',
    'analytics:dashboard:read',
  ],

  operations_manager: [
    'inventory:stock:read', 'inventory:stock:update',
    'inventory:po:read', 'inventory:po:approve',
    'inventory:suppliers:read', 'inventory:assets:read',
    'hr:attendance:read', 'hr:shifts:read',
    'analytics:dashboard:read', 'analytics:reports:read', 'analytics:kpis:read',
  ],

  it_admin: [
    'admin:audit:read', 'admin:audit:export',
    'admin:settings:read', 'admin:settings:update',
    'admin:branches:read', 'admin:branches:create', 'admin:branches:update',
    'admin:license:read', 'admin:license:update',
    'admin:system:create',
    'hr:users:read', 'hr:users:create', 'hr:users:update',
    'analytics:dashboard:read',
  ],

  patient: [
    'patients:patients:read', // own records only – enforced at API level
    'clinical:appointments:create', 'clinical:appointments:read',
    'finance:invoices:read',
  ],

  therapist: [
    'patients:patients:read', 'patients:vitals:read',
    'clinical:visits:read', 'clinical:notes:create', 'clinical:notes:read',
    'clinical:admissions:read',
    'analytics:dashboard:read',
  ],

  nutritionist: [
    'patients:patients:read', 'patients:vitals:read', 'patients:vitals:create',
    'clinical:visits:read', 'clinical:notes:create', 'clinical:notes:read',
    'analytics:dashboard:read',
  ],

  dentist: [
    'patients:patients:create', 'patients:patients:read', 'patients:patients:update',
    'patients:vitals:create', 'patients:vitals:read',
    'clinical:visits:create', 'clinical:visits:read', 'clinical:visits:update',
    'clinical:notes:create', 'clinical:notes:read',
    'clinical:diagnoses:create', 'clinical:diagnoses:read',
    'clinical:appointments:create', 'clinical:appointments:read',
    'pharmacy:prescriptions:create', 'pharmacy:prescriptions:read',
    'analytics:dashboard:read',
  ],
};

// ─── Seeder ────────────────────────────────────────────────────────────────────
export function seedPermissions(): void {
  console.log('[RBAC] Seeding permissions...');

  db.transaction(() => {
    // 1. Insert all permissions
    for (const perm of ALL_PERMISSIONS) {
      db.run(
        `INSERT OR IGNORE INTO permissions (id, module, resource, action)
         VALUES (lower(hex(randomblob(16))), ?, ?, ?)`,
        [perm.module, perm.resource, perm.action],
      );
    }

    // 2. Assign permissions to roles
    for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSIONS)) {
      const role = db.findOne<{ id: string }>(
        `SELECT id FROM roles WHERE name = ?`, [roleName],
      );
      if (!role) { console.warn(`[RBAC] Role not found: ${roleName}`); continue; }

      // Handle wildcard for super_admin
      if (permKeys.includes('*:*:*')) {
        // Super admin gets all permissions
        const allPerms = db.query<{ id: string }>(`SELECT id FROM permissions`).rows;
        for (const p of allPerms) {
          db.run(
            `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
            [role.id, p.id],
          );
        }
        continue;
      }

      for (const key of permKeys) {
        const [module, resource, action] = key.split(':');
        const perm = db.findOne<{ id: string }>(
          `SELECT id FROM permissions WHERE module = ? AND resource = ? AND action = ?`,
          [module, resource, action],
        );
        if (!perm) { console.warn(`[RBAC] Permission not found: ${key}`); continue; }
        db.run(
          `INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
          [role.id, perm.id],
        );
      }
    }
  });

  const permCount = db.count('permissions');
  const rpCount = db.count('role_permissions');
  console.log(`[RBAC] ✓ ${permCount} permissions, ${rpCount} role-permission assignments`);
}

// ─── Create default super admin ───────────────────────────────────────────────
export async function createDefaultSuperAdmin(): Promise<void> {
  const exists = db.exists('users', `role_id = 'role-superadmin' AND is_active = 1`);
  if (exists) return;

  const { authService } = await import('../lib/auth/auth-service');
  const result = await authService.createUser({
    username: 'admin',
    email: 'admin@afyacore.local',
    password: 'AfyaCore@2024!',
    firstName: 'System',
    lastName: 'Administrator',
    roleId: 'role-superadmin',
    createdBy: 'system',
  });

  if (result.success) {
    // Force password change on first login
    db.run(`UPDATE users SET must_change_password = 1 WHERE id = ?`, [result.userId!]);
    console.log('[Setup] ✓ Default super admin created: admin / AfyaCore@2024!');
    console.log('[Setup] ⚠️  CHANGE DEFAULT PASSWORD IMMEDIATELY');
  }
}
