import sql from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

export async function GET(request, { params }) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [bill] = await sql(
      `SELECT b.*, p.first_name, p.last_name, p.patient_number, v.visit_number
       FROM bills b JOIN patients p ON b.patient_id = p.id JOIN visits v ON b.visit_id = v.id
       WHERE b.id = ?`,
      [params.id]
    );
    if (!bill)
      return Response.json({ error: "Bill not found" }, { status: 404 });

    const items = await sql("SELECT * FROM bill_items WHERE bill_id = ?", [
      params.id,
    ]);
    const payments = await sql(
      "SELECT * FROM payments WHERE bill_id = ? ORDER BY created_at DESC",
      [params.id]
    );

    return Response.json({ bill, items, payments });
  } catch (error) {
    console.error("GET /api/billing/[id] error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}