import sql from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "requested";
    const [user] = await sql("SELECT facility_id FROM auth_users WHERE id = ?", [
      session.user.id,
    ]);

    const requests = await sql(
      `SELECT lr.*, p.first_name, p.last_name, p.patient_number, p.gender, v.visit_number
       FROM lab_requests lr JOIN visits v ON lr.visit_id = v.id JOIN patients p ON v.patient_id = p.id
       WHERE v.facility_id = ? AND lr.status = ? ORDER BY lr.created_at ASC`,
      [user.facility_id, status]
    );

    return Response.json({ requests });
  } catch (error) {
    console.error("GET /api/lab-requests error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id, results, status, clinicalNotes } = await request.json();

    const sets = [];
    const args = [];
    if (results !== undefined) {
      sets.push("result = ?");
      args.push(results);
    }
    if (status) {
      sets.push("status = ?");
      args.push(status);
    }
    if (clinicalNotes !== undefined) {
      sets.push("result_notes = ?");
      args.push(clinicalNotes);
    }
    args.push(id);

    sql(`UPDATE lab_requests SET ${sets.join(", ")} WHERE id = ?`, args);
    const [req] = await sql("SELECT * FROM lab_requests WHERE id = ?", [id]);

    return Response.json({ request: req });
  } catch (error) {
    console.error("PUT /api/lab-requests error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
