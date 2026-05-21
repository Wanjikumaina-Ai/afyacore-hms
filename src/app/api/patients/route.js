/**
 * FILE: src/app/api/patients/route.js
 */

import sql from "@/app/api/utils/sql.js";
import { auditLog } from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const limit  = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    const [user] = await sql(
      "SELECT facility_id FROM auth_users WHERE id = ?",
      [session.user.id]
    );
    if (!user?.facility_id)
      return Response.json({ error: "No facility" }, { status: 400 });

    const like = `%${search}%`;
    const patients = await sql(
      `SELECT * FROM patients
       WHERE facility_id = ?
         AND (LOWER(first_name) LIKE LOWER(?) OR LOWER(last_name) LIKE LOWER(?)
              OR patient_number LIKE ? OR phone LIKE ?)
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [user.facility_id, like, like, like, like, limit, offset]
    );

    return Response.json({ patients });
  } catch (error) {
    console.error("GET /api/patients error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (!body.firstName || !body.lastName)
      return Response.json({ error: "First name and last name are required" }, { status: 400 });

    const [user] = await sql(
      "SELECT facility_id FROM auth_users WHERE id = ?",
      [session.user.id]
    );

    const [countRow] = await sql(
      "SELECT COUNT(*) as cnt FROM patients WHERE facility_id = ?",
      [user.facility_id]
    );
    const patientNumber = `AC-${String(parseInt(countRow.cnt) + 1).padStart(6, "0")}`;

    const [patient] = await sql(
      `INSERT INTO patients
         (facility_id, patient_number, first_name, middle_name, last_name,
          gender, dob, phone, email, address, category, allergies,
          chronic_conditions, next_of_kin_name, next_of_kin_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.facility_id, patientNumber,
        body.firstName, body.middleName || null, body.lastName,
        body.gender || null, body.dob || null, body.phone || null,
        body.email || null, body.address || null,
        body.category || "outpatient",
        body.allergies || null, body.chronicConditions || null,
        body.nextOfKinName || null, body.nextOfKinPhone || null,
      ]
    );

    await auditLog({
      facilityId: user.facility_id,
      userId: session.user.id,
      action: "PATIENT_REGISTERED",
      module: "PATIENTS",
      recordId: patient.id,
      newValue: { patientNumber, name: `${body.firstName} ${body.lastName}`, category: body.category },
      severity: "info",
      request,
    });

    return Response.json({ patient });
  } catch (error) {
    console.error("POST /api/patients error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}