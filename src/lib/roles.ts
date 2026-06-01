/**
 * src/lib/roles.ts
 *
 * Single source of truth for every role and every module in AfyaCore HMS.
 * Server-side route guards call requireRole().
 * Client-side nav uses canAccess() to show/hide menu items.
 *
 * ROLES (13)
 * ──────────
 *  admin           Full access including user management and system settings
 *  doctor          Clinical: patients, EMR, appointments, lab, pharmacy, theatre
 *  nurse           Ward: patients, appointments, nursing, lab view, theatre
 *  theatre_staff   OT: theatre scheduling, surgical notes, ward
 *  receptionist    Front desk: patient check-in, registration, appointments
 *  pharmacist      Pharmacy: prescriptions, dispensing, stock
 *  lab_technician  Lab: requests, results, specimens
 *  radiographer    Radiology: scan requests, imaging, results
 *  accountant      Finance: billing, ledger, petty cash, insurance, reports
 *  procurement     Supply chain: LPOs, suppliers, inventory
 *  hr_payroll      HR: staff records, contracts, leave, salaries, payslips
 *  mortuary        Mortuary: deceased records, body release
 *  it_support      IT: system settings, audit log — NO clinical or financial data
 */

export type Role =
  | 'admin'
  | 'doctor'
  | 'nurse'
  | 'theatre_staff'
  | 'receptionist'
  | 'pharmacist'
  | 'lab_technician'
  | 'radiographer'
  | 'accountant'
  | 'procurement'
  | 'hr_payroll'
  | 'mortuary'
  | 'it_support';

export type Module =
  | 'dashboard'
  | 'patients'
  | 'appointments'
  | 'emr'
  | 'nursing'
  | 'theatre'
  | 'laboratory'
  | 'radiology'
  | 'pharmacy'
  | 'billing'
  | 'insurance'
  | 'inventory'
  | 'procurement'
  | 'accounts'
  | 'petty_cash'
  | 'payroll'
  | 'hr'
  | 'mortuary'
  | 'reports'
  | 'audit_log'
  | 'settings'
  | 'users';

/**
 * 'full'  — read + write
 * 'view'  — read only (server enforces, UI shows but disables edits)
 * false   — no access (route redirects to /403)
 */
export type Access = 'full' | 'view' | false;

export interface RoleDefinition {
  label: string;
  /** Tailwind colour token used for badge backgrounds in the UI */
  badgeClass: string;
  permissions: Partial<Record<Module, Access>>;
}

// Every role must be listed here. Every module that a role can access must be
// explicitly set. Anything omitted defaults to false (no access).
export const ROLES: Record<Role, RoleDefinition> = {

  admin: {
    label: 'Administrator',
    badgeClass: 'bg-purple-500',
    permissions: {
      dashboard: 'full', patients: 'full', appointments: 'full',
      emr: 'full', nursing: 'full', theatre: 'full',
      laboratory: 'full', radiology: 'full', pharmacy: 'full',
      billing: 'full', insurance: 'full', inventory: 'full',
      procurement: 'full', accounts: 'full', petty_cash: 'full',
      payroll: 'full', hr: 'full', mortuary: 'full',
      reports: 'full', audit_log: 'full', settings: 'full', users: 'full',
    },
  },

  doctor: {
    label: 'Doctor',
    badgeClass: 'bg-blue-500',
    permissions: {
      dashboard: 'full', patients: 'full', appointments: 'full',
      emr: 'full', theatre: 'full',
      laboratory: 'full', radiology: 'view', pharmacy: 'full',
    },
  },

  nurse: {
    label: 'Nurse',
    badgeClass: 'bg-teal-500',
    permissions: {
      dashboard: 'full', patients: 'full', appointments: 'full',
      emr: 'view', nursing: 'full', theatre: 'view',
      laboratory: 'view', radiology: 'view',
    },
  },

  theatre_staff: {
    label: 'Theatre Staff',
    badgeClass: 'bg-teal-700',
    permissions: {
      dashboard: 'full', patients: 'view', appointments: 'view',
      emr: 'view', nursing: 'view', theatre: 'full',
    },
  },

  receptionist: {
    label: 'Receptionist',
    badgeClass: 'bg-yellow-500',
    permissions: {
      dashboard: 'full', patients: 'full', appointments: 'full',
    },
  },

  pharmacist: {
    label: 'Pharmacist',
    badgeClass: 'bg-orange-500',
    permissions: {
      dashboard: 'full', pharmacy: 'full', inventory: 'view',
    },
  },

  lab_technician: {
    label: 'Lab Technician',
    badgeClass: 'bg-cyan-500',
    permissions: {
      dashboard: 'full', laboratory: 'full',
    },
  },

  radiographer: {
    label: 'Radiographer',
    badgeClass: 'bg-sky-500',
    permissions: {
      dashboard: 'full', radiology: 'full',
    },
  },

  accountant: {
    label: 'Accountant',
    badgeClass: 'bg-green-600',
    permissions: {
      dashboard: 'full', billing: 'full', insurance: 'full',
      accounts: 'full', petty_cash: 'full', payroll: 'view',
      reports: 'full',
    },
  },

  procurement: {
    label: 'Procurement Officer',
    badgeClass: 'bg-lime-600',
    permissions: {
      dashboard: 'full', inventory: 'full', procurement: 'full',
      accounts: 'view',
    },
  },

  hr_payroll: {
    label: 'HR / Payroll',
    badgeClass: 'bg-emerald-600',
    permissions: {
      dashboard: 'full', hr: 'full', payroll: 'full',
      reports: 'view',
    },
  },

  mortuary: {
    label: 'Mortuary Officer',
    badgeClass: 'bg-slate-500',
    permissions: {
      dashboard: 'full', mortuary: 'full', patients: 'view',
    },
  },

  it_support: {
    label: 'IT Support',
    badgeClass: 'bg-gray-500',
    permissions: {
      dashboard: 'full', audit_log: 'full', settings: 'full',
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getAccess(role: Role, module: Module): Access {
  return ROLES[role]?.permissions[module] ?? false;
}

export function canAccess(role: Role, module: Module): boolean {
  return getAccess(role, module) !== false;
}

export function canWrite(role: Role, module: Module): boolean {
  return getAccess(role, module) === 'full';
}

export function roleLabel(role: Role): string {
  return ROLES[role]?.label ?? role;
}

export const ALL_ROLES = Object.keys(ROLES) as Role[];
