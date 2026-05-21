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

    const appointments = await sql(
      `SELECT a.*, p.first_name, p.last_name, p.patient_number
       FROM visits a JOIN patients p ON a.patient_id = p.id
       WHERE a.facility_id = ? AND a.status = 'waiting'
       ORDER BY a.created_at ASC`,
      [user.facility_id]
    );

    return Response.json({ appointments });
  } catch (error) {
    console.error("GET /api/appointments error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
