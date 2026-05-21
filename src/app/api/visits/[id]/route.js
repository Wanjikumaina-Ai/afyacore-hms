import sql from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

export async function GET(request, { params }) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [visit] = await sql(
      `SELECT v.*, p.first_name, p.last_name, p.patient_number, p.gender, p.dob, p.phone, p.allergies, p.chronic_conditions
       FROM visits v JOIN patients p ON v.patient_id = p.id WHERE v.id = ?`,
      [params.id]
    );
    if (!visit)
      return Response.json({ error: "Visit not found" }, { status: 404 });

    const labRequests = await sql(
      "SELECT * FROM lab_requests WHERE visit_id = ? ORDER BY created_at ASC",
      [params.id]
    );
    const prescriptions = await sql(
      "SELECT * FROM prescriptions WHERE visit_id = ? ORDER BY created_at ASC",
      [params.id]
    );
    const [consultation] = await sql(
      "SELECT * FROM consultations WHERE visit_id = ? LIMIT 1",
      [params.id]
    );

    return Response.json({
      visit,
      labRequests,
      prescriptions,
      consultation: consultation || null,
    });
  } catch (error) {
    console.error("GET /api/visits/[id] error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}