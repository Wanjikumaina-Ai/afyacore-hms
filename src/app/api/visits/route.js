import sql from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const today = new Date().toISOString().split("T")[0];
    const [user] = await sql("SELECT facility_id FROM auth_users WHERE id = ?", [
      session.user.id,
    ]);

    let query = `SELECT v.*, p.first_name, p.last_name, p.patient_number, p.gender, p.dob
                  FROM visits v JOIN patients p ON v.patient_id = p.id
                  WHERE v.facility_id = ? AND v.created_at >= ?`;
    const args = [user.facility_id, today];

    if (status) {
      query += " AND v.status = ?";
      args.push(status);
    }
    query += " ORDER BY v.created_at ASC";

    const visits = await sql(query, args);
    return Response.json({ visits });
  } catch (error) {
    console.error("GET /api/visits error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { patientId, priority, departmentId } = await request.json();
    const [user] = await sql("SELECT facility_id FROM auth_users WHERE id = ?", [
      session.user.id,
    ]);

    const [countRow] = await sql(
      "SELECT COUNT(*) as cnt FROM visits WHERE facility_id = ?",
      [user.facility_id]
    );
    const visitNumber = `VST-${String(parseInt(countRow.cnt) + 1).padStart(
      8,
      "0"
    )}`;

    const [visit] = await sql(
      "INSERT INTO visits (patient_id, facility_id, visit_number, priority, department_id, status) VALUES (?, ?, ?, ?, ?, 'waiting')",
      [
        patientId,
        user.facility_id,
        visitNumber,
        priority || "normal",
        departmentId,
      ]
    );

    return Response.json({ visit });
  } catch (error) {
    console.error("POST /api/visits error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { id, status, triage_vitals, triage_notes } = await request.json();

    // Build dynamic UPDATE
    const sets = [];
    const args = [];
    if (status) {
      sets.push("status = ?");
      args.push(status);
    }
    if (triage_vitals) {
      sets.push("triage_vitals = ?");
      args.push(triage_vitals);
    }
    if (triage_notes) {
      sets.push("triage_notes = ?");
      args.push(triage_notes);
    }
    args.push(id);

    const [visit] = await sql(
      `UPDATE visits SET ${sets.join(", ")} WHERE id = ?`,
      args
    );
    return Response.json({ visit: visit || { id } });
  } catch (error) {
    console.error("PUT /api/visits error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
