/**
 * FILE: src/app/api/utils/rbac.js
 *
 * Role-Based Access Control for AfyaCore.
 *
 * Usage in any API route:
 *   import { requireRole, requireAny, ROLES } from '@/app/api/utils/rbac.js';
 *
 *   export async function GET(request) {
 *     const session = await requireAny(request, ['doctor','nurse','receptionist']);
 *     if (session instanceof Response) return session;   // 401/403 returned
 *     const { user } = session;
 *     // ... proceed with user.role, user.branch_id, user.department_id
 *   }
 *
 * Role hierarchy (highest → lowest):
 *   super_admin > facility_admin > branch_admin > [clinical/operational roles]
 */

import { auth } from '@/auth.js';
import sql from './sql.js';

// ── Canonical role list ────────────────────────────────────────────────────
export const ROLES = {
  SUPER_ADMIN:       'super_admin',
  FACILITY_ADMIN:    'facility_admin',
  BRANCH_ADMIN:      'branch_admin',
  DOCTOR:            'doctor',
  NURSE:             'nurse',
  CLINICAL_OFFICER:  'clinical_officer',
  RECEPTIONIST:      'receptionist',
  LAB_TECHNICIAN:    'lab_technician',
  RADIOLOGIST:       'radiologist',
  PHARMACIST:        'pharmacist',
  ACCOUNTANT:        'accountant',
  PAYROLL_OFFICER:   'payroll_officer',
  HR_OFFICER:        'hr_officer',
  INVENTORY_MANAGER: 'inventory_manager',
  CASHIER:           'cashier',
  AUDITOR:           'auditor',
};

// Roles that have admin-level access
const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.FACILITY_ADMIN, ROLES.BRANCH_ADMIN];

// Clinical roles that can create visits / read patient data
const CLINICAL_ROLES = [
  ROLES.DOCTOR, ROLES.NURSE, ROLES.CLINICAL_OFFICER,
  ROLES.RECEPTIONIST, ROLES.LAB_TECHNICIAN, ROLES.RADIOLOGIST, ROLES.PHARMACIST,
];

// ── Module permission map ──────────────────────────────────────────────────
// Format: { module: { role: { read, write, delete, approve } } }
// true = allowed, false = denied, undefined = inherit from ADMIN check
export const MODULE_PERMISSIONS = {

  // ── Patients ──────────────────────────────────────────────────────────
  patients: {
    receptionist:      { read: true,  write: true,  delete: false, approve: false },
    doctor:            { read: true,  write: false,  delete: false, approve: false },
    nurse:             { read: true,  write: true,  delete: false, approve: false },
    clinical_officer:  { read: true,  write: true,  delete: false, approve: false },
    lab_technician:    { read: true,  write: false, delete: false, approve: false },
    pharmacist:        { read: true,  write: false, delete: false, approve: false },
    radiologist:       { read: true,  write: false, delete: false, approve: false },
    cashier:           { read: true,  write: false, delete: false, approve: false },
    accountant:        { read: false, write: false, delete: false, approve: false },
    auditor:           { read: true,  write: false, delete: false, approve: false },
  },

  // ── Visits / Queue ────────────────────────────────────────────────────
  visits: {
    receptionist:      { read: true, write: true, delete: false, approve: false },
    doctor:            { read: true, write: true, delete: false, approve: false },
    nurse:             { read: true, write: true, delete: false, approve: false },
    clinical_officer:  { read: true, write: true, delete: false, approve: false },
    lab_technician:    { read: true, write: false, delete: false, approve: false },
    pharmacist:        { read: true, write: false, delete: false, approve: false },
    cashier:           { read: true, write: false, delete: false, approve: false },
  },

  // ── Triage ────────────────────────────────────────────────────────────
  triage: {
    nurse:            { read: true, write: true, delete: false, approve: false },
    clinical_officer: { read: true, write: true, delete: false, approve: false },
    doctor:           { read: true, write: false, delete: false, approve: false },
    receptionist:     { read: true, write: false, delete: false, approve: false },
  },

  // ── Consultations ─────────────────────────────────────────────────────
  consultations: {
    doctor:           { read: true, write: true, delete: false, approve: false },
    clinical_officer: { read: true, write: true, delete: false, approve: false },
    nurse:            { read: true, write: false, delete: false, approve: false },
    pharmacist:       { read: true, write: false, delete: false, approve: false },
  },

  // ── Lab ───────────────────────────────────────────────────────────────
  lab: {
    lab_technician:   { read: true, write: true, delete: false, approve: true },
    doctor:           { read: true, write: true, delete: false, approve: false },
    clinical_officer: { read: true, write: true, delete: false, approve: false },
    nurse:            { read: true, write: false, delete: false, approve: false },
  },

  // ── Radiology ─────────────────────────────────────────────────────────
  radiology: {
    radiologist:      { read: true, write: true, delete: false, approve: true },
    doctor:           { read: true, write: true, delete: false, approve: false },
    clinical_officer: { read: true, write: true, delete: false, approve: false },
  },

  // ── Pharmacy ──────────────────────────────────────────────────────────
  pharmacy: {
    pharmacist:       { read: true, write: true, delete: false, approve: true },
    doctor:           { read: true, write: true, delete: false, approve: false },
    clinical_officer: { read: true, write: true, delete: false, approve: false },
  },

  // ── Inpatient / Wards ─────────────────────────────────────────────────
  inpatient: {
    doctor:           { read: true, write: true, delete: false, approve: true },
    nurse:            { read: true, write: true, delete: false, approve: false },
    clinical_officer: { read: true, write: true, delete: false, approve: false },
    receptionist:     { read: true, write: false, delete: false, approve: false },
  },

  // ── Theatre ───────────────────────────────────────────────────────────
  theatre: {
    doctor:           { read: true, write: true, delete: false, approve: true },
    nurse:            { read: true, write: true, delete: false, approve: false },
  },

  // ── Maternity ─────────────────────────────────────────────────────────
  maternity: {
    doctor:           { read: true, write: true, delete: false, approve: true },
    nurse:            { read: true, write: true, delete: false, approve: false },
    clinical_officer: { read: true, write: true, delete: false, approve: false },
  },

  // ── Billing ───────────────────────────────────────────────────────────
  billing: {
    cashier:          { read: true, write: true, delete: false, approve: false },
    accountant:       { read: true, write: true, delete: false, approve: true },
    receptionist:     { read: true, write: false, delete: false, approve: false },
  },

  // ── Payments ──────────────────────────────────────────────────────────
  payments: {
    cashier:          { read: true, write: true, delete: false, approve: false },
    accountant:       { read: true, write: true, delete: false, approve: true },
  },

  // ── Accounting ────────────────────────────────────────────────────────
  accounting: {
    accountant:       { read: true, write: true, delete: false, approve: true },
  },

  // ── Inventory ─────────────────────────────────────────────────────────
  inventory: {
    inventory_manager: { read: true, write: true, delete: false, approve: true },
    pharmacist:        { read: true, write: true, delete: false, approve: false },
    accountant:        { read: true, write: false, delete: false, approve: false },
  },

  // ── Procurement ───────────────────────────────────────────────────────
  procurement: {
    inventory_manager: { read: true, write: true, delete: false, approve: false },
    accountant:        { read: true, write: false, delete: false, approve: true },
  },

  // ── HR ────────────────────────────────────────────────────────────────
  hr: {
    hr_officer:        { read: true, write: true, delete: false, approve: true },
    payroll_officer:   { read: true, write: false, delete: false, approve: false },
  },

  // ── Payroll ───────────────────────────────────────────────────────────
  payroll: {
    payroll_officer:   { read: true, write: true, delete: false, approve: false },
    accountant:        { read: true, write: false, delete: false, approve: true },
    hr_officer:        { read: true, write: false, delete: false, approve: false },
  },

  // ── Assets ────────────────────────────────────────────────────────────
  assets: {
    inventory_manager: { read: true, write: true, delete: false, approve: false },
    accountant:        { read: true, write: false, delete: false, approve: false },
  },

  // ── Staff management ──────────────────────────────────────────────────
  staff: {
    hr_officer:        { read: true, write: true, delete: false, approve: true },
    payroll_officer:   { read: true, write: false, delete: false, approve: false },
  },

  // ── Reports ───────────────────────────────────────────────────────────
  reports: {
    accountant:        { read: true, write: false, delete: false, approve: false },
    auditor:           { read: true, write: false, delete: false, approve: false },
    hr_officer:        { read: true, write: false, delete: false, approve: false },
    payroll_officer:   { read: true, write: false, delete: false, approve: false },
    inventory_manager: { read: true, write: false, delete: false, approve: false },
    doctor:            { read: true, write: false, delete: false, approve: false },
  },

  // ── Audit logs ────────────────────────────────────────────────────────
  audit: {
    auditor:           { read: true, write: false, delete: false, approve: false },
  },

  // ── Admin / Settings ──────────────────────────────────────────────────
  admin: {},  // admin roles only — checked separately
  settings: {},
};

// ── Core check functions ───────────────────────────────────────────────────

/** Returns true if the role is a system admin level */
export function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}

/**
 * Check if role has permission on a module.
 * Admin roles always have full access.
 */
export function hasPermission(role, module, action = 'read') {
  if (isAdmin(role)) return true;
  const modulePerms = MODULE_PERMISSIONS[module];
  if (!modulePerms) return false;
  const rolePerms = modulePerms[role];
  if (!rolePerms) return false;
  return rolePerms[action] === true;
}

// ── Route guard helpers ────────────────────────────────────────────────────

/**
 * requireAuth(request) → session | Response(401)
 * Just checks logged in.
 */
export async function requireAuth(request) {
  const session = await auth(request);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return session;
}

/**
 * requireRole(request, role | role[]) → session | Response(401|403)
 * Allows exact role(s) plus all admin roles.
 */
export async function requireRole(request, roles) {
  const session = await auth(request);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!isAdmin(session.user.role) && !allowed.includes(session.user.role)) {
    return Response.json(
      { error: `Access denied. Required role: ${allowed.join(' or ')}` },
      { status: 403 }
    );
  }
  return session;
}

/**
 * requireAny(request, roles[]) — alias for requireRole with array
 */
export async function requireAny(request, roles) {
  return requireRole(request, roles);
}

/**
 * requireModule(request, module, action?) → session | Response
 * Checks permission table.
 */
export async function requireModule(request, module, action = 'read') {
  const session = await auth(request);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasPermission(session.user.role, module, action)) {
    return Response.json(
      { error: `You do not have ${action} access to ${module}` },
      { status: 403 }
    );
  }
  return session;
}

/**
 * requireAdmin(request) → session | Response(403)
 * Only facility_admin, branch_admin, super_admin
 */
export async function requireAdmin(request) {
  const session = await auth(request);
  if (!session?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin(session.user.role)) {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }
  return session;
}

// ── Audit logger (call after any write) ───────────────────────────────────
export async function auditLog({
  user,
  action,
  module,
  recordId = null,
  recordType = null,
  oldValues = null,
  newValues = null,
  notes = null,
  request = null,
}) {
  try {
    const ip = request?.headers?.get('x-forwarded-for') ||
               request?.headers?.get('x-real-ip') || null;
    await sql(
      `INSERT INTO audit_logs
         (facility_id, branch_id, user_id, user_role, action, module,
          record_id, record_type, old_values, new_values, ip_address, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        user?.facility_id ?? null,
        user?.branch_id   ?? null,
        user?.id          ?? null,
        user?.role        ?? null,
        action,
        module,
        recordId   ? String(recordId) : null,
        recordType ?? null,
        oldValues  ? JSON.stringify(oldValues)  : null,
        newValues  ? JSON.stringify(newValues)  : null,
        ip ?? null,
        notes ?? null,
      ]
    );
  } catch (e) {
    console.error('auditLog error:', e);
  }
}

// ── Sidebar menu config (what each role sees) ──────────────────────────────
export const ROLE_MENU = {
  super_admin: ['dashboard','patients','appointments','queue','triage','consultations',
    'lab','radiology','pharmacy','inpatient','maternity','theatre','billing','payments',
    'accounting','inventory','procurement','assets','hr','payroll','staff','reports',
    'audit','settings','admin'],

  facility_admin: ['dashboard','patients','appointments','queue','triage','consultations',
    'lab','radiology','pharmacy','inpatient','maternity','theatre','billing','payments',
    'accounting','inventory','procurement','assets','hr','payroll','staff','reports',
    'audit','settings'],

  branch_admin: ['dashboard','patients','appointments','queue','triage','consultations',
    'lab','radiology','pharmacy','inpatient','maternity','theatre','billing','payments',
    'accounting','inventory','procurement','assets','hr','payroll','staff','reports',
    'audit','settings'],

  doctor:            ['dashboard','patients','queue','consultations','lab','radiology',
                      'pharmacy','inpatient','maternity','theatre','reports'],

  nurse:             ['dashboard','patients','queue','triage','consultations','lab',
                      'inpatient','maternity'],

  clinical_officer:  ['dashboard','patients','queue','triage','consultations','lab',
                      'radiology','pharmacy','inpatient','maternity'],

  receptionist:      ['dashboard','patients','appointments','queue','billing'],

  lab_technician:    ['dashboard','patients','lab'],

  radiologist:       ['dashboard','patients','radiology'],

  pharmacist:        ['dashboard','patients','pharmacy','inventory'],

  accountant:        ['dashboard','billing','payments','accounting','procurement',
                      'inventory','assets','reports'],

  payroll_officer:   ['dashboard','payroll','staff','reports'],

  hr_officer:        ['dashboard','staff','hr','payroll','reports'],

  inventory_manager: ['dashboard','inventory','procurement','assets','reports'],

  cashier:           ['dashboard','billing','payments'],

  auditor:           ['dashboard','reports','audit'],
};