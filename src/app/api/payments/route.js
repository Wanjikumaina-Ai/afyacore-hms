/**
 * FILE: src/app/api/payments/route.js
 */

import sql from "@/app/api/utils/sql.js";
import { sqlTransaction, auditLog } from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

export async function POST(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { billId, amount, method, referenceNumber } = await request.json();

    if (!billId || !amount || amount <= 0)
      return Response.json({ error: "billId and a positive amount are required" }, { status: 400 });

    const [actor] = await sql(
      "SELECT facility_id FROM auth_users WHERE id = ?",
      [session.user.id]
    );

    const result = await sqlTransaction(async (txn) => {
      const [bill] = await txn("SELECT * FROM bills WHERE id = ?", [billId]);
      if (!bill) throw new Error("Bill not found");

      const [payment] = await txn(
        "INSERT INTO payments (bill_id, patient_id, amount, method, reference_number, cashier_id) VALUES (?, ?, ?, ?, ?, ?)",
        [billId, bill.patient_id, amount, method, referenceNumber || null, session.user.id]
      );

      const [totalRow] = await txn(
        "SELECT SUM(amount) as total FROM payments WHERE bill_id = ?",
        [billId]
      );
      const totalPaid = parseFloat(totalRow.total || 0);
      const netAmount = parseFloat(bill.net_amount);

      const nextStatus =
        totalPaid >= netAmount ? "paid" : totalPaid > 0 ? "partial" : "unpaid";
      await txn("UPDATE bills SET status = ? WHERE id = ?", [nextStatus, billId]);

      if (nextStatus === "paid") {
        await txn(
          "UPDATE visits SET status = 'completed' WHERE id = ? AND status != 'completed'",
          [bill.visit_id]
        );
      }

      return { payment, nextStatus, totalPaid, netAmount };
    });

    await auditLog({
      facilityId: actor?.facility_id,
      userId: session.user.id,
      action: "PAYMENT_RECEIVED",
      module: "PAYMENTS",
      recordId: billId,
      newValue: { amount, method, referenceNumber, status: result.nextStatus, totalPaid: result.totalPaid },
      severity: "info",
      request,
    });

    return Response.json({ payment: result.payment, status: result.nextStatus });
  } catch (error) {
    console.error("POST /api/payments error:", error);
    return Response.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [user] = await sql(
      "SELECT facility_id FROM auth_users WHERE id = ?",
      [session.user.id]
    );

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || "";
    const to   = searchParams.get("to") || "";

    let query = `
      SELECT pay.*, b.net_amount, b.total_amount,
             p.first_name, p.last_name, p.patient_number,
             u.name AS cashier_name
      FROM payments pay
      JOIN bills b ON pay.bill_id = b.id
      JOIN patients p ON pay.patient_id = p.id
      LEFT JOIN auth_users u ON pay.cashier_id = u.id
      WHERE b.visit_id IN (SELECT id FROM visits WHERE facility_id = ?)
    `;
    const params = [user.facility_id];

    if (from) { query += " AND pay.created_at >= ?"; params.push(from); }
    if (to)   { query += " AND pay.created_at <= ?"; params.push(`${to}T23:59:59`); }

    query += " ORDER BY pay.created_at DESC LIMIT 200";

    const payments = await sql(query, params);
    return Response.json({ payments });
  } catch (error) {
    console.error("GET /api/payments error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}