/**
 * FILE: src/app/api/prescriptions/route.js
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
    const visitId = searchParams.get("visitId");

    const [user] = await sql(
      "SELECT facility_id FROM auth_users WHERE id = ?",
      [session.user.id]
    );

    let prescriptions;
    if (visitId) {
      prescriptions = await sql(
        `SELECT rx.*, u.name AS requested_by_name
         FROM prescriptions rx
         LEFT JOIN auth_users u ON rx.requested_by = u.id
         WHERE rx.visit_id = ?
         ORDER BY rx.created_at ASC`,
        [visitId]
      );
    } else {
      prescriptions = await sql(
        `SELECT rx.*, p.first_name, p.last_name, p.patient_number, v.visit_number
         FROM prescriptions rx
         JOIN visits v ON rx.visit_id = v.id
         JOIN patients p ON v.patient_id = p.id
         WHERE v.facility_id = ? AND rx.dispensed = 0
         ORDER BY rx.created_at ASC`,
        [user.facility_id]
      );
    }

    return Response.json({ prescriptions });
  } catch (error) {
    console.error("GET /api/prescriptions error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    const [user] = await sql(
      "SELECT facility_id FROM auth_users WHERE id = ?",
      [session.user.id]
    );

    // Dispense existing prescription
    if (body.id && body.status === "dispensed") {
      const [before] = await sql("SELECT * FROM prescriptions WHERE id = ?", [body.id]);
      if (!before)
        return Response.json({ error: "Prescription not found" }, { status: 404 });

      await sql(
        "UPDATE prescriptions SET dispensed = 1, dispensed_by = ?, dispensed_at = datetime('now') WHERE id = ?",
        [session.user.id, body.id]
      );
      const [rx] = await sql("SELECT * FROM prescriptions WHERE id = ?", [body.id]);

      await auditLog({
        facilityId: user.facility_id,
        userId: session.user.id,
        action: "MEDICATION_DISPENSED",
        module: "PHARMACY",
        recordId: body.id,
        oldValue: { dispensed: 0, drugName: before.drug_name },
        newValue: { dispensed: 1, drugName: before.drug_name, quantity: before.quantity },
        severity: "info",
        request,
      });

      return Response.json({ prescription: rx });
    }

    // Create a new prescription (from consultation)
    const { visitId, drugName, dosage, frequency, duration, quantity } = body;
    if (!visitId || !drugName)
      return Response.json({ error: "visitId and drugName required" }, { status: 400 });

    const [rx] = await sql(
      `INSERT INTO prescriptions (visit_id, drug_name, dosage, frequency, duration, quantity, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [visitId, drugName, dosage || null, frequency || null, duration || null, quantity || null, session.user.id]
    );

    await auditLog({
      facilityId: user.facility_id,
      userId: session.user.id,
      action: "PRESCRIPTION_CREATED",
      module: "PHARMACY",
      recordId: rx.id,
      newValue: { drugName, dosage, frequency, quantity },
      severity: "info",
      request,
    });

    return Response.json({ prescription: rx });
  } catch (error) {
    console.error("POST /api/prescriptions error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}