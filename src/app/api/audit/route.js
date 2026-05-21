/**
 * FILE: src/app/api/audit/route.js
 *
 * Audit log retrieval — tamper-proof read-only endpoint.
 * Supports filtering by module, user, date range, severity, action keyword.
 * Only admin can see all logs; other roles see their own logs only.
 */

import sql from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

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
    const module    = searchParams.get("module") || "";
    const severity  = searchParams.get("severity") || "";
    const userId    = searchParams.get("userId") || "";
    const action    = searchParams.get("action") || "";
    const dateFrom  = searchParams.get("from") || "";
    const dateTo    = searchParams.get("to") || "";
    const limit     = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const offset    = parseInt(searchParams.get("offset") || "0");

    const conditions = ["a.facility_id = ?"];
    const params = [user.facility_id];

    // Non-admins can only see their own logs
    if (user.role !== "admin") {
      conditions.push("a.user_id = ?");
      params.push(session.user.id);
    } else if (userId) {
      conditions.push("a.user_id = ?");
      params.push(userId);
    }

    if (module) {
      conditions.push("a.module = ?");
      params.push(module.toUpperCase());
    }
    if (severity) {
      conditions.push("a.severity = ?");
      params.push(severity);
    }
    if (action) {
      conditions.push("LOWER(a.action) LIKE LOWER(?)");
      params.push(`%${action}%`);
    }
    if (dateFrom) {
      conditions.push("a.created_at >= ?");
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push("a.created_at <= ?");
      params.push(`${dateTo}T23:59:59`);
    }

    const where = conditions.join(" AND ");

    const [{ total }] = await sql(
      `SELECT COUNT(*) AS total FROM audit_logs a WHERE ${where}`,
      params
    );

    const logs = await sql(
      `SELECT a.*, u.name AS staff_name, u.email AS staff_email, u.role AS staff_role
       FROM audit_logs a
       LEFT JOIN auth_users u ON a.user_id = u.id
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Summary stats for dashboard
    const moduleSummary = await sql(
      `SELECT module, COUNT(*) as cnt FROM audit_logs WHERE facility_id = ? AND created_at >= date('now', '-30 days')
       GROUP BY module ORDER BY cnt DESC`,
      [user.facility_id]
    );
    const severitySummary = await sql(
      `SELECT severity, COUNT(*) as cnt FROM audit_logs WHERE facility_id = ? AND created_at >= date('now', '-30 days')
       GROUP BY severity`,
      [user.facility_id]
    );
    const recentStaff = await sql(
      `SELECT u.name, u.role, COUNT(a.id) as actions, MAX(a.created_at) as last_action
       FROM audit_logs a JOIN auth_users u ON a.user_id = u.id
       WHERE a.facility_id = ? AND a.created_at >= date('now', '-7 days')
       GROUP BY a.user_id ORDER BY actions DESC LIMIT 10`,
      [user.facility_id]
    );

    return Response.json({
      logs,
      total: parseInt(total || 0),
      limit,
      offset,
      stats: { moduleSummary, severitySummary, recentStaff },
    });
  } catch (error) {
    console.error("GET /api/audit error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}