/**
 * FILE: src/app/api/payroll/route.js
 *
 * Payroll management:
 *   GET    ?month=&year=   → list payroll runs / get items for a run
 *   POST                   → generate a new payroll run (draft)
 *   PUT                    → approve a run (admin only)
 */

import sql from "@/app/api/utils/sql.js";
import { sqlTransaction, auditLog } from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";
import { calculatePayroll } from "@/app/api/utils/payroll.js";

// ── GET /api/payroll ───────────────────────────────────────────────────────
export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [user] = await sql(
      "SELECT facility_id, role FROM auth_users WHERE id = ?",
      [session.user.id]
    );
    if (!user?.facility_id)
      return Response.json({ error: "No facility" }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");

    if (runId) {
      // Return line items for a specific run
      const [run] = await sql(
        "SELECT * FROM payroll_runs WHERE id = ? AND facility_id = ?",
        [runId, user.facility_id]
      );
      if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

      const items = await sql(
        `SELECT pi.*, u.name, u.email, u.role, d.name AS department_name
         FROM payroll_items pi
         JOIN auth_users u ON pi.user_id = u.id
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE pi.run_id = ?
         ORDER BY u.name ASC`,
        [runId]
      );

      return Response.json({ run, items });
    }

    // List all runs for facility
    const runs = await sql(
      `SELECT pr.*, u.name AS created_by_name, a.name AS approved_by_name
       FROM payroll_runs pr
       LEFT JOIN auth_users u ON pr.created_by = u.id
       LEFT JOIN auth_users a ON pr.approved_by = a.id
       WHERE pr.facility_id = ?
       ORDER BY pr.period_year DESC, pr.period_month DESC`,
      [user.facility_id]
    );

    return Response.json({ runs });
  } catch (error) {
    console.error("GET /api/payroll error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ── POST /api/payroll — Generate a payroll run ─────────────────────────────
export async function POST(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [actor] = await sql(
      "SELECT facility_id, role FROM auth_users WHERE id = ?",
      [session.user.id]
    );
    if (!["admin", "hr"].includes(actor?.role))
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { month, year } = body;  // month 1–12, year e.g. 2026

    if (!month || !year || month < 1 || month > 12)
      return Response.json({ error: "Valid month (1–12) and year required" }, { status: 400 });

    // Check if run already exists
    const [existing] = await sql(
      "SELECT id, status FROM payroll_runs WHERE facility_id = ? AND period_month = ? AND period_year = ?",
      [actor.facility_id, month, year]
    );
    if (existing?.status === "approved" || existing?.status === "paid")
      return Response.json({ error: "Payroll for this period is already locked" }, { status: 409 });

    // Fetch all active staff with salary info
    const staffList = await sql(
      `SELECT u.id AS user_id, u.name, u.email, u.role,
              sp.staff_number, sp.basic_salary, sp.allowances, sp.employment_type
       FROM auth_users u
       JOIN staff_profiles sp ON sp.user_id = u.id
       WHERE u.facility_id = ? AND sp.is_active = 1 AND sp.basic_salary > 0`,
      [actor.facility_id]
    );

    if (staffList.length === 0)
      return Response.json({ error: "No active staff with salary configured" }, { status: 400 });

    // Calculate payroll for each staff member
    const calculated = staffList.map((s) => {
      const result = calculatePayroll({
        basicSalary: parseFloat(s.basic_salary || 0),
        allowances:  parseFloat(s.allowances || 0),
        otherDeductions: 0,
      });
      return { ...s, ...result };
    });

    // Aggregate totals
    const totals = calculated.reduce(
      (acc, c) => ({
        gross:   acc.gross   + c.grossPay,
        net:     acc.net     + c.netPay,
        paye:    acc.paye    + c.paye,
        nssf:    acc.nssf    + c.nssfEmployee,
        shif:    acc.shif    + c.shif,
        housing: acc.housing + c.housingLevyEmployee,
      }),
      { gross: 0, net: 0, paye: 0, nssf: 0, shif: 0, housing: 0 }
    );

    const result = await sqlTransaction(async (txn) => {
      let runId;

      if (existing) {
        // Replace draft
        await txn("UPDATE payroll_runs SET total_gross=?, total_net=?, total_paye=?, total_nssf=?, total_shif=?, total_housing=?, created_by=?, status='draft', created_at=datetime('now') WHERE id=?",
          [totals.gross, totals.net, totals.paye, totals.nssf, totals.shif, totals.housing, session.user.id, existing.id]);
        await txn("DELETE FROM payroll_items WHERE run_id = ?", [existing.id]);
        runId = existing.id;
      } else {
        const [run] = await txn(
          `INSERT INTO payroll_runs (facility_id, period_month, period_year, status, total_gross, total_net, total_paye, total_nssf, total_shif, total_housing, created_by)
           VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
          [actor.facility_id, month, year, totals.gross, totals.net, totals.paye, totals.nssf, totals.shif, totals.housing, session.user.id]
        );
        runId = run.id;
      }

      for (const c of calculated) {
        await txn(
          `INSERT INTO payroll_items (
             run_id, user_id, staff_number, basic_salary, allowances, gross_pay,
             nssf_employee, nssf_employer, shif_deduction, housing_levy_emp, housing_levy_er,
             taxable_pay, paye_before_relief, personal_relief, paye, other_deductions, net_pay
           ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            runId, c.user_id, c.staff_number, c.basicSalary, c.allowances, c.grossPay,
            c.nssfEmployee, c.nssfEmployer, c.shif, c.housingLevyEmployee, c.housingLevyEmployer,
            c.taxablePay, c.payeBeforeRelief, c.personalRelief, c.paye, c.otherDeductions, c.netPay,
          ]
        );
      }

      return { runId, staffCount: calculated.length, totals };
    });

    await auditLog({
      facilityId: actor.facility_id,
      userId: session.user.id,
      action: "PAYROLL_GENERATED",
      module: "PAYROLL",
      recordId: result.runId,
      newValue: { month, year, staffCount: result.staffCount, totalNet: totals.net },
      severity: "info",
      request,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("POST /api/payroll error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ── PUT /api/payroll — Approve a run ──────────────────────────────────────
export async function PUT(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [actor] = await sql(
      "SELECT facility_id, role FROM auth_users WHERE id = ?",
      [session.user.id]
    );
    if (actor?.role !== "admin")
      return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const { runId, action } = await request.json();  // action: 'approve' | 'mark_paid'
    if (!runId) return Response.json({ error: "runId required" }, { status: 400 });

    const [run] = await sql(
      "SELECT * FROM payroll_runs WHERE id = ? AND facility_id = ?",
      [runId, actor.facility_id]
    );
    if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

    if (action === "approve") {
      if (run.status !== "draft")
        return Response.json({ error: "Only draft runs can be approved" }, { status: 400 });
      await sql(
        "UPDATE payroll_runs SET status='approved', approved_by=?, approved_at=datetime('now') WHERE id=?",
        [session.user.id, runId]
      );
    } else if (action === "mark_paid") {
      if (run.status !== "approved")
        return Response.json({ error: "Run must be approved before marking paid" }, { status: 400 });
      await sql("UPDATE payroll_runs SET status='paid' WHERE id=?", [runId]);
    } else {
      return Response.json({ error: "action must be 'approve' or 'mark_paid'" }, { status: 400 });
    }

    await auditLog({
      facilityId: actor.facility_id,
      userId: session.user.id,
      action: action === "approve" ? "PAYROLL_APPROVED" : "PAYROLL_PAID",
      module: "PAYROLL",
      recordId: runId,
      severity: "warning",
      request,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("PUT /api/payroll error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}