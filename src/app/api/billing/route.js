/**
 * FILE: src/app/api/billing/route.js
 */

import sql from "@/app/api/utils/sql.js";
import { sqlTransaction, auditLog } from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "unpaid";

    const [user] = await sql(
      "SELECT facility_id FROM auth_users WHERE id = ?",
      [session.user.id]
    );

    const bills = await sql(
      `SELECT b.*, p.first_name, p.last_name, p.patient_number, v.visit_number
       FROM bills b
       JOIN patients p ON b.patient_id = p.id
       JOIN visits v ON b.visit_id = v.id
       WHERE v.facility_id = ? AND b.status = ?
       ORDER BY b.created_at DESC`,
      [user.facility_id, status]
    );

    return Response.json({ bills });
  } catch (error) {
    console.error("GET /api/billing error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { visitId, patientId, items } = await request.json();

    if (!visitId || !patientId || !items?.length)
      return Response.json({ error: "visitId, patientId, and items are required" }, { status: 400 });

    const [actor] = await sql(
      "SELECT facility_id FROM auth_users WHERE id = ?",
      [session.user.id]
    );

    const bill = await sqlTransaction(async (txn) => {
      const totalAmount = items.reduce(
        (sum, item) => sum + parseFloat(item.total_price || 0),
        0
      );
      const [bill] = await txn(
        "INSERT INTO bills (visit_id, patient_id, total_amount, net_amount, created_by) VALUES (?, ?, ?, ?, ?)",
        [visitId, patientId, totalAmount, totalAmount, session.user.id]
      );
      for (const item of items) {
        await txn(
          "INSERT INTO bill_items (bill_id, item_type, description, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?, ?)",
          [bill.id, item.type, item.description, item.quantity, item.unit_price, item.total_price]
        );
      }
      return bill;
    });

    await auditLog({
      facilityId: actor?.facility_id,
      userId: session.user.id,
      action: "BILL_CREATED",
      module: "BILLING",
      recordId: bill.id,
      newValue: { visitId, patientId, totalAmount: bill.net_amount, itemCount: items.length },
      severity: "info",
      request,
    });

    return Response.json({ bill });
  } catch (error) {
    console.error("POST /api/billing error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}