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
    if (!user?.facility_id)
      return Response.json({ error: "No facility assigned" }, { status: 400 });

    const fid = user.facility_id;
    const today = new Date().toISOString().split("T")[0];

    const [ptToday] = await sql(
      "SELECT COUNT(*) as cnt FROM visits WHERE facility_id = ? AND created_at >= ?",
      [fid, today]
    );
    const [ptWaiting] = await sql(
      "SELECT COUNT(*) as cnt FROM visits WHERE facility_id = ? AND status = 'waiting'",
      [fid]
    );
    const [ptConsult] = await sql(
      "SELECT COUNT(*) as cnt FROM visits WHERE facility_id = ? AND status = 'doctor'",
      [fid]
    );
    const [revToday] = await sql(
      "SELECT SUM(amount) as total FROM payments WHERE created_at >= ? AND bill_id IN (SELECT id FROM bills WHERE visit_id IN (SELECT id FROM visits WHERE facility_id = ?))",
      [today, fid]
    );
    const [lowStock] = await sql(
      "SELECT COUNT(*) as cnt FROM inventory WHERE facility_id = ? AND quantity <= reorder_level",
      [fid]
    );
    const [pendingLab] = await sql(
      "SELECT COUNT(*) as cnt FROM lab_requests WHERE visit_id IN (SELECT id FROM visits WHERE facility_id = ?) AND status = 'requested'",
      [fid]
    );

    const revenueTrend = await sql(
      `SELECT strftime('%b %d', created_at) as date, SUM(amount) as total
       FROM payments WHERE created_at >= date('now', '-7 days')
       GROUP BY strftime('%Y-%m-%d', created_at) ORDER BY MIN(created_at)`,
      []
    );

    return Response.json({
      stats: {
        patientsToday: parseInt(ptToday.cnt || 0),
        patientsWaiting: parseInt(ptWaiting.cnt || 0),
        patientsConsultation: parseInt(ptConsult.cnt || 0),
        revenueToday: parseFloat(revToday.total || 0),
        lowStock: parseInt(lowStock.cnt || 0),
        pendingLab: parseInt(pendingLab.cnt || 0),
      },
      revenueTrend,
    });
  } catch (error) {
    console.error("GET /api/dashboard/stats error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
