/**
 * FILE: src/app/api/accounting/route.js
 *
 * GET  /api/accounting?action=accounts           → chart of accounts
 * GET  /api/accounting?action=journals           → journal entries
 * GET  /api/accounting?action=ledger&account=X  → general ledger for account
 * GET  /api/accounting?action=trial_balance      → trial balance
 * GET  /api/accounting?action=pl&from=&to=       → P&L
 * POST /api/accounting  { action:'init_coa' }    → seed chart of accounts
 * POST /api/accounting  { action:'journal', ... } → post journal entry
 */

import sql, { sqlTransaction } from '@/app/api/utils/sql.js';
import { requireAny, auditLog, ROLES } from '@/app/api/utils/rbac.js';

// ── Default Chart of Accounts for a hospital (Kenya context) ──────────────
const DEFAULT_COA = [
  // Assets
  { code: '1000', name: 'Current Assets',           type: 'asset',   parent: null },
  { code: '1001', name: 'Cash in Hand',              type: 'asset',   parent: '1000' },
  { code: '1002', name: 'Cash at Bank',              type: 'asset',   parent: '1000' },
  { code: '1003', name: 'M-Pesa Float',              type: 'asset',   parent: '1000' },
  { code: '1010', name: 'Accounts Receivable',       type: 'asset',   parent: '1000' },
  { code: '1011', name: 'Insurance Receivable (NHIF/SHA)', type: 'asset', parent: '1000' },
  { code: '1020', name: 'Drug Inventory',            type: 'asset',   parent: '1000' },
  { code: '1021', name: 'Medical Supplies Inventory',type: 'asset',   parent: '1000' },
  { code: '1030', name: 'Prepaid Expenses',          type: 'asset',   parent: '1000' },
  { code: '1100', name: 'Non-Current Assets',        type: 'asset',   parent: null  },
  { code: '1101', name: 'Medical Equipment',         type: 'asset',   parent: '1100' },
  { code: '1102', name: 'Furniture & Fittings',      type: 'asset',   parent: '1100' },
  { code: '1103', name: 'Vehicles / Ambulances',     type: 'asset',   parent: '1100' },
  { code: '1104', name: 'IT Equipment',              type: 'asset',   parent: '1100' },
  { code: '1105', name: 'Buildings & Leasehold',     type: 'asset',   parent: '1100' },
  { code: '1110', name: 'Accum. Depreciation',       type: 'asset',   parent: '1100' },
  // Liabilities
  { code: '2000', name: 'Current Liabilities',       type: 'liability', parent: null  },
  { code: '2001', name: 'Accounts Payable (Suppliers)', type: 'liability', parent: '2000' },
  { code: '2002', name: 'Salaries Payable',          type: 'liability', parent: '2000' },
  { code: '2003', name: 'PAYE Payable (KRA)',        type: 'liability', parent: '2000' },
  { code: '2004', name: 'NSSF Payable',              type: 'liability', parent: '2000' },
  { code: '2005', name: 'SHIF Payable',              type: 'liability', parent: '2000' },
  { code: '2006', name: 'VAT Payable',               type: 'liability', parent: '2000' },
  { code: '2007', name: 'Accrued Expenses',          type: 'liability', parent: '2000' },
  { code: '2008', name: 'Patient Deposits',          type: 'liability', parent: '2000' },
  // Equity
  { code: '3000', name: 'Equity',                    type: 'equity',  parent: null  },
  { code: '3001', name: 'Share Capital',             type: 'equity',  parent: '3000' },
  { code: '3002', name: 'Retained Earnings',         type: 'equity',  parent: '3000' },
  // Revenue
  { code: '4000', name: 'Revenue',                   type: 'revenue', parent: null  },
  { code: '4001', name: 'OPD Consultation Fees',     type: 'revenue', parent: '4000' },
  { code: '4002', name: 'IPD / Ward Fees',           type: 'revenue', parent: '4000' },
  { code: '4003', name: 'Laboratory Revenue',        type: 'revenue', parent: '4000' },
  { code: '4004', name: 'Pharmacy Revenue',          type: 'revenue', parent: '4000' },
  { code: '4005', name: 'Radiology Revenue',         type: 'revenue', parent: '4000' },
  { code: '4006', name: 'Theatre Revenue',           type: 'revenue', parent: '4000' },
  { code: '4007', name: 'Maternity Revenue',         type: 'revenue', parent: '4000' },
  { code: '4008', name: 'Other Clinical Revenue',    type: 'revenue', parent: '4000' },
  { code: '4009', name: 'Insurance Revenue (SHA/NHIF)', type: 'revenue', parent: '4000' },
  // Expenses
  { code: '5000', name: 'Expenses',                  type: 'expense', parent: null  },
  { code: '5001', name: 'Salaries & Wages',          type: 'expense', parent: '5000' },
  { code: '5002', name: 'NSSF Employer Contribution', type: 'expense', parent: '5000' },
  { code: '5003', name: 'Drug & Pharmacy Costs',     type: 'expense', parent: '5000' },
  { code: '5004', name: 'Medical Supplies',          type: 'expense', parent: '5000' },
  { code: '5005', name: 'Utilities (Electricity, Water)', type: 'expense', parent: '5000' },
  { code: '5006', name: 'Rent & Lease',              type: 'expense', parent: '5000' },
  { code: '5007', name: 'Equipment Maintenance',     type: 'expense', parent: '5000' },
  { code: '5008', name: 'Depreciation',              type: 'expense', parent: '5000' },
  { code: '5009', name: 'Stationery & Office',       type: 'expense', parent: '5000' },
  { code: '5010', name: 'Transport & Fuel',          type: 'expense', parent: '5000' },
  { code: '5011', name: 'Staff Training',            type: 'expense', parent: '5000' },
  { code: '5012', name: 'Marketing & Advertising',   type: 'expense', parent: '5000' },
  { code: '5013', name: 'Waste Disposal (Medical)',  type: 'expense', parent: '5000' },
  { code: '5014', name: 'Insurance Premiums',        type: 'expense', parent: '5000' },
  { code: '5099', name: 'Miscellaneous Expenses',    type: 'expense', parent: '5000' },
];

export async function GET(request) {
  const session = await requireAny(request, [
    ROLES.SUPER_ADMIN, ROLES.FACILITY_ADMIN, ROLES.BRANCH_ADMIN,
    ROLES.ACCOUNTANT, ROLES.AUDITOR,
  ]);
  if (session instanceof Response) return session;
  const { user } = session;

  const url    = new URL(request.url);
  const action = url.searchParams.get('action') || 'accounts';

  if (action === 'accounts') {
    const accounts = await sql(
      `SELECT a.*, p.name AS parent_name
       FROM accounts a
       LEFT JOIN accounts p ON a.parent_id = p.id
       WHERE a.facility_id = ?
       ORDER BY a.code`,
      [user.facility_id]
    );
    return Response.json({ accounts });
  }

  if (action === 'journals') {
    const from    = url.searchParams.get('from') || '';
    const to      = url.searchParams.get('to')   || '';
    const branchId = url.searchParams.get('branch_id') || '';

    const params = [user.facility_id];
    const filters = [];
    if (from)     { filters.push('j.entry_date >= ?'); params.push(from); }
    if (to)       { filters.push('j.entry_date <= ?'); params.push(to); }
    if (branchId) { filters.push('j.branch_id = ?');   params.push(branchId); }

    const journals = await sql(
      `SELECT j.*, u.name AS created_by_name
       FROM journal_entries j
       LEFT JOIN auth_users u ON j.created_by = u.id
       WHERE j.facility_id = ?
         ${filters.length ? 'AND ' + filters.join(' AND ') : ''}
       ORDER BY j.entry_date DESC, j.id DESC
       LIMIT 200`,
      params
    );
    return Response.json({ journals });
  }

  if (action === 'journal_lines') {
    const journalId = url.searchParams.get('journal_id');
    const lines = await sql(
      `SELECT jl.*, a.code AS account_code, a.name AS account_name
       FROM journal_lines jl
       JOIN accounts a ON jl.account_id = a.id
       WHERE jl.journal_id = ?`,
      [journalId]
    );
    return Response.json({ lines });
  }

  if (action === 'trial_balance') {
    const asOf = url.searchParams.get('as_of') || new Date().toISOString().slice(0, 10);
    const tb = await sql(
      `SELECT
         a.code, a.name, a.type,
         ROUND(SUM(jl.debit),  2) AS total_debit,
         ROUND(SUM(jl.credit), 2) AS total_credit,
         ROUND(SUM(jl.debit) - SUM(jl.credit), 2) AS balance
       FROM accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries j ON j.id = jl.journal_id
         AND j.entry_date <= ?
         AND j.status = 'posted'
         AND j.facility_id = ?
       WHERE a.facility_id = ? AND a.is_active = 1
       GROUP BY a.id
       ORDER BY a.code`,
      [asOf, user.facility_id, user.facility_id]
    );
    return Response.json({ trial_balance: tb });
  }

  if (action === 'pl') {
    const from = url.searchParams.get('from') || new Date().toISOString().slice(0, 8) + '01';
    const to   = url.searchParams.get('to')   || new Date().toISOString().slice(0, 10);

    const rows = await sql(
      `SELECT
         a.code, a.name, a.type,
         ROUND(SUM(jl.credit) - SUM(jl.debit), 2) AS amount
       FROM accounts a
       JOIN journal_lines jl ON jl.account_id = a.id
       JOIN journal_entries j ON j.id = jl.journal_id
         AND j.entry_date BETWEEN ? AND ?
         AND j.status = 'posted'
         AND j.facility_id = ?
       WHERE a.facility_id = ?
         AND a.type IN ('revenue','expense')
       GROUP BY a.id
       ORDER BY a.type DESC, a.code`,
      [from, to, user.facility_id, user.facility_id]
    );

    const revenue  = rows.filter((r) => r.type === 'revenue');
    const expenses = rows.filter((r) => r.type === 'expense');
    const totalRev = revenue.reduce((s, r) => s + (r.amount || 0), 0);
    const totalExp = expenses.reduce((s, r) => s + (r.amount || 0), 0);

    return Response.json({ revenue, expenses, total_revenue: totalRev, total_expenses: totalExp, net_profit: totalRev - totalExp });
  }

  if (action === 'ledger') {
    const accountId = url.searchParams.get('account_id');
    const from = url.searchParams.get('from') || '';
    const to   = url.searchParams.get('to')   || '';
    const params = [accountId];
    const filters = [];
    if (from) { filters.push('j.entry_date >= ?'); params.push(from); }
    if (to)   { filters.push('j.entry_date <= ?'); params.push(to); }

    const lines = await sql(
      `SELECT jl.*, j.entry_date, j.description, j.entry_number
       FROM journal_lines jl
       JOIN journal_entries j ON j.id = jl.journal_id
         AND j.status = 'posted'
       WHERE jl.account_id = ?
         ${filters.length ? 'AND ' + filters.join(' AND ') : ''}
       ORDER BY j.entry_date, j.id`,
      params
    );
    return Response.json({ lines });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
}

export async function POST(request) {
  const session = await requireAny(request, [
    ROLES.SUPER_ADMIN, ROLES.FACILITY_ADMIN, ROLES.BRANCH_ADMIN, ROLES.ACCOUNTANT,
  ]);
  if (session instanceof Response) return session;
  const { user } = session;

  try {
    const body = await request.json();

    // ── Seed chart of accounts ─────────────────────────────────────────────
    if (body.action === 'init_coa') {
      const existing = await sql(`SELECT COUNT(*) AS cnt FROM accounts WHERE facility_id = ?`, [user.facility_id]);
      if (existing[0]?.cnt > 0) {
        return Response.json({ error: 'Chart of accounts already exists' }, { status: 409 });
      }

      // Build parent code → id map as we insert
      const codeToId = {};
      for (const acct of DEFAULT_COA) {
        const parentId = acct.parent ? (codeToId[acct.parent] ?? null) : null;
        const [row] = await sql(
          `INSERT INTO accounts (facility_id, code, name, type, parent_id) VALUES (?,?,?,?,?)`,
          [user.facility_id, acct.code, acct.name, acct.type, parentId]
        );
        codeToId[acct.code] = row.id;
      }

      await auditLog({ user, action: 'CREATE', module: 'accounting', notes: 'Chart of accounts initialised', request });
      return Response.json({ ok: true, accounts_created: DEFAULT_COA.length });
    }

    // ── Post journal entry ─────────────────────────────────────────────────
    if (body.action === 'journal') {
      const { entry_date, description, lines, reference_type, reference_id, branch_id } = body;
      if (!entry_date || !description || !Array.isArray(lines) || lines.length < 2) {
        return Response.json({ error: 'entry_date, description, and at least 2 lines required' }, { status: 400 });
      }

      // Validate double-entry balance
      const totalDr = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
      const totalCr = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
      if (Math.abs(totalDr - totalCr) > 0.01) {
        return Response.json({ error: `Journal is not balanced. Dr=${totalDr.toFixed(2)}, Cr=${totalCr.toFixed(2)}` }, { status: 400 });
      }

      // Auto-generate entry number
      const [last] = await sql(
        `SELECT entry_number FROM journal_entries WHERE facility_id = ? ORDER BY id DESC LIMIT 1`,
        [user.facility_id]
      );
      const lastNum  = last ? parseInt(last.entry_number.replace('JE-', '')) : 0;
      const entryNum = `JE-${String(lastNum + 1).padStart(6, '0')}`;

      const result = await sqlTransaction(async (txSql) => {
        const [je] = await txSql(
          `INSERT INTO journal_entries
             (facility_id, branch_id, entry_number, entry_date, description,
              reference_type, reference_id, status, created_by)
           VALUES (?,?,?,?,?,?,?,'posted',?)`,
          [
            user.facility_id, branch_id || user.branch_id || null,
            entryNum, entry_date, description,
            reference_type || null, reference_id || null, user.id,
          ]
        );
        for (const line of lines) {
          await txSql(
            `INSERT INTO journal_lines (journal_id, account_id, debit, credit, description)
             VALUES (?,?,?,?,?)`,
            [je.id, line.account_id, parseFloat(line.debit) || 0, parseFloat(line.credit) || 0, line.description || null]
          );
        }
        return je;
      });

      await auditLog({ user, action: 'CREATE', module: 'accounting', recordId: result.id, recordType: 'journal_entries', request });
      return Response.json({ ok: true, journal: result }, { status: 201 });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/accounting:', err);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}