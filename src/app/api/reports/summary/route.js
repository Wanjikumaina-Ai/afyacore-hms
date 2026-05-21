import sql from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [user] = await sql("SELECT facility_id FROM auth_users WHERE id = ?", [
      session.user.id,
    ]);
    const fid = user.facility_id;

    const revenueByMethod = await sql(
      `SELECT method, SUM(amount) as total FROM payments
       WHERE bill_id IN (SELECT id FROM bills WHERE visit_id IN (SELECT id FROM visits WHERE facility_id = ?))
       GROUP BY method`,
      [fid]
    );
    const visitsByCategory = await sql(
      `SELECT p.category, COUNT(v.id) as count FROM visits v JOIN patients p ON v.patient_id = p.id
       WHERE v.facility_id = ? GROUP BY p.category`,
      [fid]
    );
    const topServices = await sql(
      `SELECT description, COUNT(*) as usage, SUM(total_price) as revenue FROM bill_items
       WHERE bill_id IN (SELECT id FROM bills WHERE visit_id IN (SELECT id FROM visits WHERE facility_id = ?))
       GROUP BY description ORDER BY usage DESC LIMIT 5`,
      [fid]
    );
    const recentAudit = await sql(
      `SELECT a.*, u.name as staff_name FROM audit_logs a JOIN auth_users u ON a.user_id = u.id
       WHERE a.facility_id = ? ORDER BY a.created_at DESC LIMIT 10`,
      [fid]
    );

    return Response.json({
      revenueByMethod,
      visitsByCategory,
      topServices,
      recentAudit,
    });
  } catch (error) {
    console.error("GET /api/reports/summary error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
