import sql from "@/app/api/utils/sql.js";
import { sqlTransaction } from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

export async function POST(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const {
      visitId,
      chiefComplaint,
      history,
      examination,
      diagnosis,
      plan,
      followUpDate,
      labRequests,
      prescriptions,
    } = await request.json();

    const result = sqlTransaction((txn) => {
      txn(
        "INSERT INTO consultations (visit_id, doctor_id, chief_complaint, history, examination, diagnosis, plan, follow_up_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          visitId,
          session.user.id,
          chiefComplaint,
          history,
          examination,
          diagnosis,
          plan,
          followUpDate,
        ]
      );

      if (labRequests?.length > 0) {
        for (const test of labRequests) {
          txn(
            "INSERT INTO lab_requests (visit_id, test_name, requested_by, status) VALUES (?, ?, ?, 'requested')",
            [visitId, test, session.user.id]
          );
        }
      }
      if (prescriptions?.length > 0) {
        for (const rx of prescriptions) {
          txn(
            "INSERT INTO prescriptions (visit_id, drug_name, dosage, frequency, duration, quantity, requested_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
              visitId,
              rx.drugName,
              rx.dosage,
              rx.frequency,
              rx.duration,
              rx.quantity,
              session.user.id,
            ]
          );
        }
      }

      const nextStatus =
        labRequests?.length > 0
          ? "lab"
          : prescriptions?.length > 0
          ? "pharmacy"
          : "completed";
      txn("UPDATE visits SET status = ? WHERE id = ?", [nextStatus, visitId]);

      return { nextStatus };
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("POST /api/consultations error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const visitId = searchParams.get("visitId");
    const patientId = searchParams.get("patientId");

    let rows;
    if (visitId) {
      rows = await sql("SELECT * FROM consultations WHERE visit_id = ? LIMIT 1", [
        visitId,
      ]);
    } else if (patientId) {
      rows = await sql(
        `SELECT c.*, v.created_at as visit_date FROM consultations c
         JOIN visits v ON c.visit_id = v.id WHERE v.patient_id = ? ORDER BY v.created_at DESC`,
        [patientId]
      );
    }

    return Response.json({ consultations: rows || [] });
  } catch (error) {
    console.error("GET /api/consultations error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
