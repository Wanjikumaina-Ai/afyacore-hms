import {
  authService
} from "../../chunk-UF4OLAU6.js";
import {
  licenseService
} from "../../chunk-ZHENYHXE.js";
import {
  auditLogger,
  computeDiff
} from "../../chunk-FXZ3HZPC.js";
import {
  db,
  generateId,
  generateSequentialNumber
} from "../../chunk-6WJBJ4G3.js";

// src/server/routes/api.ts
import { Hono } from "hono";
function requireAuth(c, next) {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  const session = authService.validateSession(token);
  if (!session) return c.json({ error: "Session expired. Please login again." }, 401);
  c.set("session", session);
  return next();
}
function requirePermission(module, resource, action) {
  return async (c, next) => {
    const session = c.get("session");
    if (!authService.hasPermission(session.permissions, module, resource, action)) {
      await auditLogger.log({
        userId: session.userId,
        action: "DATA_ACCESS",
        module,
        resource,
        status: "blocked",
        riskLevel: "medium",
        failureReason: `Insufficient permission: ${module}:${resource}:${action}`
      });
      return c.json({ error: "Access denied" }, 403);
    }
    return next();
  };
}
var apiRouter = new Hono();
var auth = new Hono();
auth.post("/login", async (c) => {
  const { username, password, deviceFingerprint } = await c.req.json();
  const ip = c.req.header("X-Real-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
  const ua = c.req.header("User-Agent") ?? "unknown";
  if (!username || !password) {
    return c.json({ error: "Username and password are required" }, 400);
  }
  const result = await authService.login(username, password, deviceFingerprint ?? "unknown", ip, ua);
  if (!result.success && !result.requiresMfa) {
    return c.json({ error: result.error }, 401);
  }
  return c.json(result);
});
auth.post("/verify-mfa", async (c) => {
  const { tempToken, code } = await c.req.json();
  const ip = c.req.header("X-Real-IP") ?? "unknown";
  const result = await authService.verifyMfa(tempToken, code, ip);
  if (!result.success) return c.json({ error: result.error }, 401);
  return c.json(result);
});
auth.post("/logout", requireAuth, async (c) => {
  const session = c.get("session");
  const token = c.req.header("Authorization")?.replace("Bearer ", "") ?? "";
  authService.revokeSession(token, "logout");
  await auditLogger.log({
    userId: session.userId,
    action: "LOGOUT",
    module: "auth",
    resource: "users",
    resourceId: session.userId,
    status: "success",
    riskLevel: "low"
  });
  return c.json({ success: true });
});
auth.post("/change-password", requireAuth, async (c) => {
  const session = c.get("session");
  const { currentPassword, newPassword } = await c.req.json();
  const result = await authService.changePassword(session.userId, currentPassword, newPassword);
  if (!result.success) return c.json({ error: result.error }, 400);
  await auditLogger.log({
    userId: session.userId,
    action: "PASSWORD_CHANGED",
    module: "auth",
    resource: "users",
    resourceId: session.userId,
    status: "success",
    riskLevel: "medium"
  });
  return c.json({ success: true });
});
auth.get("/me", requireAuth, async (c) => {
  const session = c.get("session");
  const user = db.findOne(
    `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.profile_photo,
            u.branch_id, u.department_id, r.name as role_name, r.display_name as role_display,
            r.category as role_category
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [session.userId]
  );
  return c.json({ user, permissions: [...session.permissions] });
});
var patients = new Hono();
patients.use("*", requireAuth);
patients.get("/", requirePermission("patients", "patients", "read"), async (c) => {
  const session = c.get("session");
  const { q, page = "1", pageSize = "25", branchId } = c.req.query();
  const branch = branchId ?? session.branchId;
  let where = "WHERE p.is_active = 1";
  const params = [];
  if (branch) {
    where += " AND p.branch_id = ?";
    params.push(branch);
  }
  if (q) {
    where += ` AND (p.first_name LIKE ? OR p.last_name LIKE ? OR p.patient_number LIKE ? OR p.phone LIKE ?)`;
    const term = `%${q}%`;
    params.push(term, term, term, term);
  }
  const result = db.paginate(
    `SELECT p.id, p.patient_number, p.first_name, p.middle_name, p.last_name,
            p.date_of_birth, p.gender, p.phone, p.email, p.national_id,
            p.blood_group, p.nhif_number, p.insurance_provider,
            p.created_at, b.name as branch_name
     FROM patients p LEFT JOIN branches b ON b.id = p.branch_id ${where}
     ORDER BY p.created_at DESC`,
    `SELECT COUNT(*) as total FROM patients p ${where}`,
    params,
    parseInt(page),
    parseInt(pageSize)
  );
  await auditLogger.log({
    userId: session.userId,
    action: "DATA_ACCESS",
    module: "patients",
    resource: "patients",
    status: "success",
    riskLevel: "low"
  });
  return c.json(result);
});
patients.get("/:id", requirePermission("patients", "patients", "read"), async (c) => {
  const session = c.get("session");
  const patient = db.findOne(
    `SELECT p.*, b.name as branch_name FROM patients p
     LEFT JOIN branches b ON b.id = p.branch_id WHERE p.id = ?`,
    [c.req.param("id")]
  );
  if (!patient) return c.json({ error: "Patient not found" }, 404);
  await auditLogger.log({
    userId: session.userId,
    action: "PATIENT_VIEWED",
    module: "patients",
    resource: "patients",
    resourceId: c.req.param("id"),
    status: "success",
    riskLevel: "low"
  });
  return c.json({ patient });
});
patients.post("/", requirePermission("patients", "patients", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const branchId = body.branchId ?? session.branchId;
  if (!branchId) return c.json({ error: "Branch ID required" }, 400);
  const patientNumber = generateSequentialNumber(db, "AFC", "patients", "patient_number");
  const id = generateId();
  db.run(
    `INSERT INTO patients (id, patient_number, branch_id, first_name, middle_name, last_name,
     date_of_birth, gender, blood_group, national_id, phone, email, marital_status,
     occupation, nationality, address, city, county, next_of_kin_name, next_of_kin_relation,
     next_of_kin_phone, nhif_number, nhif_card_number, insurance_provider,
     insurance_number, allergies, chronic_conditions, registered_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      patientNumber,
      branchId,
      body.firstName,
      body.middleName ?? null,
      body.lastName,
      body.dateOfBirth,
      body.gender,
      body.bloodGroup ?? null,
      body.nationalId ?? null,
      body.phone ?? null,
      body.email ?? null,
      body.maritalStatus ?? null,
      body.occupation ?? null,
      body.nationality ?? "Kenyan",
      body.address ?? null,
      body.city ?? null,
      body.county ?? null,
      body.nextOfKinName ?? null,
      body.nextOfKinRelation ?? null,
      body.nextOfKinPhone ?? null,
      body.nhifNumber ?? null,
      body.nhifCardNumber ?? null,
      body.insuranceProvider ?? null,
      body.insuranceNumber ?? null,
      JSON.stringify(body.allergies ?? []),
      JSON.stringify(body.chronicConditions ?? []),
      session.userId
    ]
  );
  await auditLogger.log({
    userId: session.userId,
    action: "PATIENT_CREATED",
    module: "patients",
    resource: "patients",
    resourceId: id,
    newValues: { patientNumber, name: `${body.firstName} ${body.lastName}` },
    status: "success",
    riskLevel: "low"
  });
  return c.json({ id, patientNumber }, 201);
});
patients.put("/:id", requirePermission("patients", "patients", "update"), async (c) => {
  const session = c.get("session");
  const id = c.req.param("id");
  const body = await c.req.json();
  const before = db.findOne(`SELECT * FROM patients WHERE id = ?`, [id]);
  if (!before) return c.json({ error: "Patient not found" }, 404);
  db.update("patients", id, {
    first_name: body.firstName,
    middle_name: body.middleName,
    last_name: body.lastName,
    date_of_birth: body.dateOfBirth,
    gender: body.gender,
    blood_group: body.bloodGroup,
    national_id: body.nationalId,
    phone: body.phone,
    email: body.email,
    address: body.address,
    city: body.city,
    county: body.county,
    allergies: JSON.stringify(body.allergies ?? []),
    chronic_conditions: JSON.stringify(body.chronicConditions ?? []),
    nhif_number: body.nhifNumber,
    insurance_provider: body.insuranceProvider,
    insurance_number: body.insuranceNumber
  });
  const after = db.findOne(`SELECT * FROM patients WHERE id = ?`, [id]);
  const diff = computeDiff(before, after);
  await auditLogger.log({
    userId: session.userId,
    action: "PATIENT_UPDATED",
    module: "patients",
    resource: "patients",
    resourceId: id,
    previousValues: diff.previousValues,
    newValues: diff.newValues,
    changedFields: diff.changedFields,
    status: "success",
    riskLevel: "low"
  });
  return c.json({ success: true });
});
patients.get("/:id/vitals", requirePermission("patients", "vitals", "read"), async (c) => {
  const vitals = db.query(
    `SELECT pv.*, u.first_name || ' ' || u.last_name as recorded_by_name
     FROM patient_vitals pv LEFT JOIN users u ON u.id = pv.recorded_by
     WHERE pv.patient_id = ? ORDER BY pv.recorded_at DESC LIMIT 20`,
    [c.req.param("id")]
  );
  return c.json({ vitals: vitals.rows });
});
patients.post("/:id/vitals", requirePermission("patients", "vitals", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const patientId = c.req.param("id");
  const bmi = body.weight && body.height ? (body.weight / (body.height / 100) ** 2).toFixed(1) : null;
  const id = generateId();
  db.run(
    `INSERT INTO patient_vitals (id, patient_id, visit_id, branch_id, recorded_by,
     temperature, temperature_method, pulse_rate, respiratory_rate,
     blood_pressure_systolic, blood_pressure_diastolic, bp_position,
     oxygen_saturation, weight, height, bmi, blood_glucose, pain_scale, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      patientId,
      body.visitId ?? null,
      body.branchId ?? session.branchId,
      session.userId,
      body.temperature ?? null,
      body.temperatureMethod ?? null,
      body.pulseRate ?? null,
      body.respiratoryRate ?? null,
      body.bpSystolic ?? null,
      body.bpDiastolic ?? null,
      body.bpPosition ?? null,
      body.oxygenSaturation ?? null,
      body.weight ?? null,
      body.height ?? null,
      bmi,
      body.bloodGlucose ?? null,
      body.painScale ?? null,
      body.notes ?? null
    ]
  );
  return c.json({ id }, 201);
});
var visits = new Hono();
visits.use("*", requireAuth);
visits.get("/", requirePermission("clinical", "visits", "read"), async (c) => {
  const session = c.get("session");
  const { patientId, status, doctorId, date, page = "1", pageSize = "25" } = c.req.query();
  let where = "WHERE 1=1";
  const params = [];
  if (session.branchId) {
    where += " AND v.branch_id = ?";
    params.push(session.branchId);
  }
  if (patientId) {
    where += " AND v.patient_id = ?";
    params.push(patientId);
  }
  if (status) {
    where += " AND v.status = ?";
    params.push(status);
  }
  if (doctorId) {
    where += " AND v.attending_doctor_id = ?";
    params.push(doctorId);
  }
  if (date) {
    where += " AND DATE(v.check_in_time) = ?";
    params.push(date);
  }
  const result = db.paginate(
    `SELECT v.*, p.first_name || ' ' || p.last_name as patient_name,
            p.patient_number, d.first_name || ' ' || d.last_name as doctor_name,
            dep.name as department_name
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     LEFT JOIN users d ON d.id = v.attending_doctor_id
     LEFT JOIN departments dep ON dep.id = v.department_id
     ${where} ORDER BY v.check_in_time DESC`,
    `SELECT COUNT(*) as total FROM visits v ${where}`,
    params,
    parseInt(page),
    parseInt(pageSize)
  );
  return c.json(result);
});
visits.post("/", requirePermission("clinical", "visits", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const visitNumber = generateSequentialNumber(db, "VIS", "visits", "visit_number");
  const id = generateId();
  db.run(
    `INSERT INTO visits (id, visit_number, branch_id, patient_id, appointment_id,
     visit_type, department_id, attending_doctor_id, triage_level,
     chief_complaint, presenting_complaints, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      visitNumber,
      body.branchId ?? session.branchId,
      body.patientId,
      body.appointmentId ?? null,
      body.visitType ?? "opd",
      body.departmentId ?? null,
      body.doctorId ?? session.userId,
      body.triageLevel ?? null,
      body.chiefComplaint ?? null,
      JSON.stringify(body.presentingComplaints ?? []),
      session.userId
    ]
  );
  await auditLogger.log({
    userId: session.userId,
    action: "VISIT_CREATED",
    module: "clinical",
    resource: "visits",
    resourceId: id,
    newValues: { visitNumber, patientId: body.patientId, type: body.visitType },
    status: "success",
    riskLevel: "low"
  });
  return c.json({ id, visitNumber }, 201);
});
visits.post("/:id/notes", requirePermission("clinical", "notes", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const visitId = c.req.param("id");
  const visit = db.findOne(`SELECT patient_id FROM visits WHERE id = ?`, [visitId]);
  if (!visit) return c.json({ error: "Visit not found" }, 404);
  const id = generateId();
  db.run(
    `INSERT INTO clinical_notes (id, visit_id, patient_id, note_type, content, created_by)
     VALUES (?,?,?,?,?,?)`,
    [id, visitId, visit.patient_id, body.noteType, body.content, session.userId]
  );
  return c.json({ id }, 201);
});
visits.post("/:id/diagnoses", requirePermission("clinical", "diagnoses", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const visitId = c.req.param("id");
  const visit = db.findOne(`SELECT patient_id FROM visits WHERE id = ?`, [visitId]);
  if (!visit) return c.json({ error: "Visit not found" }, 404);
  const id = generateId();
  db.run(
    `INSERT INTO diagnoses (id, visit_id, patient_id, icd10_code, icd10_description,
     diagnosis_text, diagnosis_type, severity, is_primary, diagnosed_by, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      visitId,
      visit.patient_id,
      body.icd10Code ?? null,
      body.icd10Description ?? null,
      body.diagnosisText,
      body.diagnosisType ?? "working",
      body.severity ?? null,
      body.isPrimary ? 1 : 0,
      session.userId,
      body.notes ?? null
    ]
  );
  return c.json({ id }, 201);
});
var prescriptions = new Hono();
prescriptions.use("*", requireAuth);
prescriptions.post("/", requirePermission("pharmacy", "prescriptions", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const rxNumber = generateSequentialNumber(db, "RX", "prescriptions", "prescription_number");
  const rxId = generateId();
  db.transaction(() => {
    db.run(
      `INSERT INTO prescriptions (id, prescription_number, branch_id, patient_id,
       visit_id, prescribed_by, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [
        rxId,
        rxNumber,
        body.branchId ?? session.branchId,
        body.patientId,
        body.visitId ?? null,
        session.userId,
        body.notes ?? null
      ]
    );
    for (const item of body.items ?? []) {
      db.run(
        `INSERT INTO prescription_items (id, prescription_id, drug_id, drug_name,
         dose, frequency, route, duration_days, quantity_prescribed, instructions, indication)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          generateId(),
          rxId,
          item.drugId,
          item.drugName,
          item.dose,
          item.frequency,
          item.route,
          item.durationDays ?? null,
          item.quantity ?? null,
          item.instructions ?? null,
          item.indication ?? null
        ]
      );
    }
  });
  await auditLogger.log({
    userId: session.userId,
    action: "PRESCRIPTION_CREATED",
    module: "pharmacy",
    resource: "prescriptions",
    resourceId: rxId,
    newValues: { rxNumber, patientId: body.patientId, itemCount: body.items?.length ?? 0 },
    status: "success",
    riskLevel: "medium"
  });
  return c.json({ id: rxId, rxNumber }, 201);
});
prescriptions.post("/:id/dispense", requirePermission("pharmacy", "dispensing", "create"), async (c) => {
  const session = c.get("session");
  const rxId = c.req.param("id");
  const body = await c.req.json();
  db.transaction(() => {
    for (const item of body.items ?? []) {
      db.run(
        `UPDATE prescription_items SET quantity_dispensed = ?, is_dispensed = 1,
         dispensed_by = ?, dispensed_at = datetime('now') WHERE id = ?`,
        [item.quantityDispensed, session.userId, item.itemId]
      );
      db.run(
        `UPDATE pharmacy_inventory SET quantity_in_stock = quantity_in_stock - ?,
         updated_at = datetime('now') WHERE id = ?`,
        [item.quantityDispensed, item.inventoryId]
      );
      db.run(
        `INSERT INTO pharmacy_transactions (id, branch_id, inventory_id, transaction_type,
         quantity, reference_id, reference_type, performed_by)
         VALUES (?,?,?,'dispensing',?,?,?,?)`,
        [
          generateId(),
          session.branchId,
          item.inventoryId,
          item.quantityDispensed,
          rxId,
          "prescription",
          session.userId
        ]
      );
    }
    const pending = db.count("prescription_items", "prescription_id = ? AND is_dispensed = 0", [rxId]);
    db.run(
      `UPDATE prescriptions SET status = ? WHERE id = ?`,
      [pending === 0 ? "dispensed" : "partial", rxId]
    );
  });
  await auditLogger.log({
    userId: session.userId,
    action: "PRESCRIPTION_DISPENSED",
    module: "pharmacy",
    resource: "prescriptions",
    resourceId: rxId,
    status: "success",
    riskLevel: "medium"
  });
  return c.json({ success: true });
});
var lab = new Hono();
lab.use("*", requireAuth);
lab.get("/catalog", requirePermission("laboratory", "catalog", "read"), async (c) => {
  const { category, q } = c.req.query();
  let where = "WHERE is_active = 1";
  const params = [];
  if (category) {
    where += " AND category = ?";
    params.push(category);
  }
  if (q) {
    where += " AND (name LIKE ? OR code LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  const catalog = db.query(`SELECT * FROM lab_test_catalog ${where} ORDER BY name`, params);
  return c.json({ catalog: catalog.rows });
});
lab.post("/requests", requirePermission("laboratory", "requests", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const requestNumber = generateSequentialNumber(db, "LAB", "lab_requests", "request_number");
  const requestId = generateId();
  db.transaction(() => {
    db.run(
      `INSERT INTO lab_requests (id, request_number, branch_id, patient_id,
       visit_id, requested_by, urgency, clinical_info)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        requestId,
        requestNumber,
        body.branchId ?? session.branchId,
        body.patientId,
        body.visitId ?? null,
        session.userId,
        body.urgency ?? "routine",
        body.clinicalInfo ?? null
      ]
    );
    for (const testId of body.testIds ?? []) {
      db.run(
        `INSERT INTO lab_request_items (id, request_id, test_id) VALUES (?,?,?)`,
        [generateId(), requestId, testId]
      );
    }
  });
  await auditLogger.log({
    userId: session.userId,
    action: "LAB_REQUEST_CREATED",
    module: "laboratory",
    resource: "lab_requests",
    resourceId: requestId,
    newValues: { requestNumber, tests: body.testIds?.length ?? 0 },
    status: "success",
    riskLevel: "low"
  });
  return c.json({ id: requestId, requestNumber }, 201);
});
lab.post("/requests/:id/results", requirePermission("laboratory", "results", "create"), async (c) => {
  const session = c.get("session");
  const requestId = c.req.param("id");
  const body = await c.req.json();
  db.transaction(() => {
    for (const result of body.results ?? []) {
      db.run(
        `UPDATE lab_request_items SET result_value = ?, result_flag = ?,
         result_notes = ?, status = 'resulted', resulted_by = ?, resulted_at = datetime('now')
         WHERE id = ?`,
        [result.value, result.flag ?? "normal", result.notes ?? null, session.userId, result.itemId]
      );
    }
    db.run(
      `UPDATE lab_requests SET status = 'resulted', resulted_at = datetime('now') WHERE id = ?`,
      [requestId]
    );
  });
  await auditLogger.log({
    userId: session.userId,
    action: "LAB_RESULT_ENTERED",
    module: "laboratory",
    resource: "lab_requests",
    resourceId: requestId,
    status: "success",
    riskLevel: "medium"
  });
  return c.json({ success: true });
});
lab.post("/requests/:id/verify", requirePermission("laboratory", "results", "approve"), async (c) => {
  const session = c.get("session");
  const requestId = c.req.param("id");
  db.run(
    `UPDATE lab_requests SET status = 'verified', verified_by = ?, verified_at = datetime('now') WHERE id = ?`,
    [session.userId, requestId]
  );
  db.run(
    `UPDATE lab_request_items SET status = 'resulted' WHERE request_id = ? AND status = 'processing'`,
    [requestId]
  );
  await auditLogger.log({
    userId: session.userId,
    action: "LAB_RESULT_VERIFIED",
    module: "laboratory",
    resource: "lab_requests",
    resourceId: requestId,
    status: "success",
    riskLevel: "medium"
  });
  return c.json({ success: true });
});
var billing = new Hono();
billing.use("*", requireAuth);
billing.post("/invoices", requirePermission("finance", "invoices", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const invoiceNumber = generateSequentialNumber(db, "INV", "invoices", "invoice_number");
  const invoiceId = generateId();
  let subtotal = 0;
  const processedItems = [];
  for (const item of body.items ?? []) {
    const lineTotal = item.quantity * item.unitPrice - (item.discountAmount ?? 0);
    subtotal += lineTotal;
    processedItems.push({ ...item, lineTotal });
  }
  const discountAmount = body.discountAmount ?? 0;
  const taxAmount = (subtotal - discountAmount) * (body.taxRate ?? 0);
  const total = subtotal - discountAmount + taxAmount;
  db.transaction(() => {
    db.run(
      `INSERT INTO invoices (id, invoice_number, branch_id, patient_id,
       visit_id, admission_id, payment_type, insurance_provider,
       subtotal, discount_amount, tax_amount, total_amount, balance_due,
       notes, created_by, due_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        invoiceId,
        invoiceNumber,
        body.branchId ?? session.branchId,
        body.patientId,
        body.visitId ?? null,
        body.admissionId ?? null,
        body.paymentType ?? "cash",
        body.insuranceProvider ?? null,
        subtotal,
        discountAmount,
        taxAmount,
        total,
        total,
        body.notes ?? null,
        session.userId,
        body.dueDate ?? null
      ]
    );
    for (const item of processedItems) {
      db.run(
        `INSERT INTO invoice_items (id, invoice_id, catalog_item_id, description,
         category, quantity, unit_price, discount_amount, tax_amount, line_total,
         is_insurance_covered, insurance_amount, patient_amount, reference_id, reference_type)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          generateId(),
          invoiceId,
          item.catalogItemId ?? null,
          item.description,
          item.category,
          item.quantity,
          item.unitPrice,
          item.discountAmount ?? 0,
          item.taxAmount ?? 0,
          item.lineTotal,
          item.isInsuranceCovered ? 1 : 0,
          item.insuranceAmount ?? 0,
          item.patientAmount ?? item.lineTotal,
          item.referenceId ?? null,
          item.referenceType ?? null
        ]
      );
    }
  });
  await auditLogger.log({
    userId: session.userId,
    action: "INVOICE_CREATED",
    module: "finance",
    resource: "invoices",
    resourceId: invoiceId,
    newValues: { invoiceNumber, total, patientId: body.patientId },
    status: "success",
    riskLevel: "medium"
  });
  return c.json({ id: invoiceId, invoiceNumber, total }, 201);
});
billing.post("/invoices/:id/payment", requirePermission("finance", "payments", "create"), async (c) => {
  const session = c.get("session");
  const invoiceId = c.req.param("id");
  const body = await c.req.json();
  const invoice = db.findOne(
    `SELECT patient_id, total_amount, balance_due FROM invoices WHERE id = ?`,
    [invoiceId]
  );
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);
  if (body.amount > invoice.balance_due + 0.01) {
    return c.json({ error: "Payment exceeds balance due" }, 400);
  }
  const receiptNumber = generateSequentialNumber(db, "RCP", "payments", "receipt_number");
  const paymentId = generateId();
  db.run(
    `INSERT INTO payments (id, payment_number, branch_id, invoice_id, patient_id,
     amount, payment_method, mpesa_transaction_id, card_last_four, bank_reference,
     receipt_number, cashier_id, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      paymentId,
      receiptNumber,
      session.branchId,
      invoiceId,
      invoice.patient_id,
      body.amount,
      body.paymentMethod,
      body.mpesaTransactionId ?? null,
      body.cardLastFour ?? null,
      body.bankReference ?? null,
      receiptNumber,
      session.userId,
      body.notes ?? null
    ]
  );
  await auditLogger.log({
    userId: session.userId,
    action: "PAYMENT_RECEIVED",
    module: "finance",
    resource: "payments",
    resourceId: paymentId,
    newValues: { amount: body.amount, method: body.paymentMethod, receiptNumber },
    status: "success",
    riskLevel: "medium"
  });
  return c.json({ id: paymentId, receiptNumber }, 201);
});
billing.post("/invoices/:id/void", requirePermission("finance", "invoices", "void"), async (c) => {
  const session = c.get("session");
  const invoiceId = c.req.param("id");
  const { reason } = await c.req.json();
  const invoice = db.findOne(`SELECT * FROM invoices WHERE id = ?`, [invoiceId]);
  if (!invoice) return c.json({ error: "Invoice not found" }, 404);
  if (invoice.status === "voided") return c.json({ error: "Already voided" }, 400);
  db.run(
    `UPDATE invoices SET status = 'voided', voided_by = ?, void_reason = ?,
     updated_at = datetime('now') WHERE id = ?`,
    [session.userId, reason, invoiceId]
  );
  await auditLogger.log({
    userId: session.userId,
    action: "INVOICE_VOIDED",
    module: "finance",
    resource: "invoices",
    resourceId: invoiceId,
    previousValues: { status: invoice.status },
    newValues: { status: "voided", reason },
    status: "success",
    riskLevel: "high"
  });
  return c.json({ success: true });
});
var admissions = new Hono();
admissions.use("*", requireAuth);
admissions.get("/beds", requirePermission("clinical", "beds", "read"), async (c) => {
  const { wardId, status } = c.req.query();
  let where = "WHERE 1=1";
  const params = [];
  if (wardId) {
    where += " AND b.ward_id = ?";
    params.push(wardId);
  }
  if (status) {
    where += " AND b.status = ?";
    params.push(status);
  }
  const beds = db.query(
    `SELECT b.*, w.name as ward_name, w.type as ward_type,
            p.first_name || ' ' || p.last_name as current_patient
     FROM beds b JOIN wards w ON w.id = b.ward_id
     LEFT JOIN admissions a ON a.bed_id = b.id AND a.status = 'active'
     LEFT JOIN patients p ON p.id = a.patient_id
     ${where} ORDER BY w.name, b.bed_number`,
    params
  );
  return c.json({ beds: beds.rows });
});
admissions.post("/", requirePermission("clinical", "admissions", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const admissionNumber = generateSequentialNumber(db, "ADM", "admissions", "admission_number");
  const id = generateId();
  const bed = db.findOne(
    `SELECT status FROM beds WHERE id = ?`,
    [body.bedId]
  );
  if (!bed || bed.status !== "available") {
    return c.json({ error: "Bed is not available" }, 400);
  }
  db.run(
    `INSERT INTO admissions (id, admission_number, branch_id, patient_id, visit_id,
     ward_id, bed_id, admitting_doctor_id, admitting_diagnosis, admission_type,
     expected_discharge, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      admissionNumber,
      body.branchId ?? session.branchId,
      body.patientId,
      body.visitId,
      body.wardId,
      body.bedId,
      body.doctorId ?? session.userId,
      body.admittingDiagnosis,
      body.admissionType ?? "elective",
      body.expectedDischarge ?? null,
      body.notes ?? null
    ]
  );
  db.run(`UPDATE visits SET status = 'admitted', admission_id = ? WHERE id = ?`, [id, body.visitId]);
  await auditLogger.log({
    userId: session.userId,
    action: "ADMISSION_CREATED",
    module: "clinical",
    resource: "admissions",
    resourceId: id,
    newValues: { admissionNumber, patientId: body.patientId, bedId: body.bedId },
    status: "success",
    riskLevel: "medium"
  });
  return c.json({ id, admissionNumber }, 201);
});
admissions.post("/:id/discharge", requirePermission("clinical", "admissions", "update"), async (c) => {
  const session = c.get("session");
  const admissionId = c.req.param("id");
  const body = await c.req.json();
  const admission = db.findOne(`SELECT * FROM admissions WHERE id = ?`, [admissionId]);
  if (!admission) return c.json({ error: "Admission not found" }, 404);
  const los = Math.ceil(
    (Date.now() - new Date(admission.admission_datetime).getTime()) / 864e5
  );
  db.run(
    `UPDATE admissions SET status = ?, actual_discharge = datetime('now'),
     discharge_doctor_id = ?, discharge_diagnosis = ?,
     discharge_condition = ?, discharge_summary = ?,
     length_of_stay = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      body.transferTo ? "transferred" : "discharged",
      session.userId,
      body.dischargeDiagnosis ?? null,
      body.dischargeCondition,
      body.dischargeSummary ?? null,
      los,
      admissionId
    ]
  );
  db.run(
    `UPDATE visits SET status = 'discharged', check_out_time = datetime('now'),
     discharge_condition = ?, follow_up_date = ?, follow_up_instructions = ?
     WHERE id = ?`,
    [
      body.dischargeCondition,
      body.followUpDate ?? null,
      body.followUpInstructions ?? null,
      admission.visit_id
    ]
  );
  await auditLogger.log({
    userId: session.userId,
    action: "PATIENT_DISCHARGED",
    module: "clinical",
    resource: "admissions",
    resourceId: admissionId,
    newValues: { condition: body.dischargeCondition, los },
    status: "success",
    riskLevel: "medium"
  });
  return c.json({ success: true, lengthOfStay: los });
});
var appointments = new Hono();
appointments.use("*", requireAuth);
appointments.get("/", requirePermission("clinical", "appointments", "read"), async (c) => {
  const session = c.get("session");
  const { date, doctorId, status, page = "1", pageSize = "25" } = c.req.query();
  let where = "WHERE 1=1";
  const params = [];
  if (session.branchId) {
    where += " AND a.branch_id = ?";
    params.push(session.branchId);
  }
  if (date) {
    where += " AND a.appointment_date = ?";
    params.push(date);
  }
  if (doctorId) {
    where += " AND a.doctor_id = ?";
    params.push(doctorId);
  }
  if (status) {
    where += " AND a.status = ?";
    params.push(status);
  }
  const result = db.paginate(
    `SELECT a.*, p.first_name || ' ' || p.last_name as patient_name, p.patient_number,
            p.phone as patient_phone,
            d.first_name || ' ' || d.last_name as doctor_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     LEFT JOIN users d ON d.id = a.doctor_id
     ${where} ORDER BY a.appointment_date, a.appointment_time`,
    `SELECT COUNT(*) as total FROM appointments a ${where}`,
    params,
    parseInt(page),
    parseInt(pageSize)
  );
  return c.json(result);
});
appointments.post("/", requirePermission("clinical", "appointments", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const apptNumber = generateSequentialNumber(db, "APT", "appointments", "appointment_number");
  const id = generateId();
  db.run(
    `INSERT INTO appointments (id, appointment_number, branch_id, patient_id,
     doctor_id, department_id, appointment_date, appointment_time, end_time,
     type, reason, priority, notes, booked_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      apptNumber,
      body.branchId ?? session.branchId,
      body.patientId,
      body.doctorId,
      body.departmentId ?? null,
      body.date,
      body.time,
      body.endTime ?? null,
      body.type ?? "opd",
      body.reason,
      body.priority ?? "normal",
      body.notes ?? null,
      session.userId
    ]
  );
  return c.json({ id, apptNumber }, 201);
});
var analytics = new Hono();
analytics.use("*", requireAuth);
analytics.get("/dashboard", requirePermission("analytics", "dashboard", "read"), async (c) => {
  const session = c.get("session");
  const branchFilter = session.branchId ? `AND branch_id = '${session.branchId}'` : "";
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const [
    todayVisits,
    activeAdmissions,
    pendingLab,
    pendingPayments,
    availableBeds,
    todayRevenue,
    expiringDrugs,
    todayAppointments
  ] = [
    db.query(
      `SELECT COUNT(*) as count FROM visits WHERE DATE(check_in_time) = ? ${branchFilter}`,
      [today]
    ).rows[0]?.count ?? 0,
    db.query(
      `SELECT COUNT(*) as count FROM admissions WHERE status = 'active' ${branchFilter}`
    ).rows[0]?.count ?? 0,
    db.query(
      `SELECT COUNT(*) as count FROM lab_requests WHERE status IN ('pending','specimen_collected','processing') ${branchFilter}`
    ).rows[0]?.count ?? 0,
    db.query(
      `SELECT COALESCE(SUM(balance_due), 0) as total FROM invoices WHERE status IN ('pending','partial') ${branchFilter}`
    ).rows[0]?.total ?? 0,
    db.query(
      `SELECT COUNT(*) as count FROM beds WHERE status = 'available'`
    ).rows[0]?.count ?? 0,
    db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE DATE(payment_date) = ? ${branchFilter}`,
      [today]
    ).rows[0]?.total ?? 0,
    db.query(
      `SELECT COUNT(*) as count FROM pharmacy_inventory WHERE expiry_date <= date('now', '+30 days') AND quantity_in_stock > 0 ${branchFilter}`
    ).rows[0]?.count ?? 0,
    db.query(
      `SELECT COUNT(*) as count FROM appointments WHERE appointment_date = ? ${branchFilter}`,
      [today]
    ).rows[0]?.count ?? 0
  ];
  const visitTrend = db.query(
    `SELECT DATE(check_in_time) as date, COUNT(*) as count
     FROM visits WHERE check_in_time >= date('now', '-7 days') ${branchFilter}
     GROUP BY DATE(check_in_time) ORDER BY date`
  ).rows;
  const revenueByMethod = db.query(
    `SELECT payment_method, SUM(amount) as total
     FROM payments WHERE payment_date >= date('now', '-30 days') ${branchFilter}
     GROUP BY payment_method`
  ).rows;
  const deptBreakdown = db.query(
    `SELECT dep.name, COUNT(v.id) as count
     FROM visits v LEFT JOIN departments dep ON dep.id = v.department_id
     WHERE DATE(v.check_in_time) = ? ${branchFilter}
     GROUP BY dep.name ORDER BY count DESC LIMIT 10`,
    [today]
  ).rows;
  return c.json({
    summary: {
      todayVisits,
      activeAdmissions,
      pendingLab,
      pendingPayments,
      availableBeds,
      todayRevenue,
      expiringDrugs,
      todayAppointments
    },
    charts: { visitTrend, revenueByMethod, deptBreakdown }
  });
});
analytics.get("/kpis", requirePermission("analytics", "kpis", "read"), async (c) => {
  const branchFilter = c.get("session").branchId ? `AND branch_id = '${c.get("session").branchId}'` : "";
  const bedOccupancy = db.query(
    `SELECT
       SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
       COUNT(*) as total FROM beds`
  ).rows[0];
  const avgLos = db.query(
    `SELECT AVG(length_of_stay) as avg_los FROM admissions
     WHERE status = 'discharged' AND length_of_stay IS NOT NULL ${branchFilter}`
  ).rows[0]?.avg_los ?? 0;
  const collectionRate = db.query(
    `SELECT
       COALESCE(SUM(paid_amount), 0) as collected,
       COALESCE(SUM(total_amount), 0) as billed
     FROM invoices WHERE status != 'voided' ${branchFilter}`
  ).rows[0];
  return c.json({
    bedOccupancyRate: bedOccupancy?.total ? (bedOccupancy.occupied / bedOccupancy.total * 100).toFixed(1) : "0",
    averageLengthOfStay: avgLos.toFixed(1),
    collectionRate: collectionRate?.billed ? (collectionRate.collected / collectionRate.billed * 100).toFixed(1) : "0"
  });
});
var users = new Hono();
users.use("*", requireAuth);
users.get("/", requirePermission("hr", "users", "read"), async (c) => {
  const { roleId, branchId, q, page = "1", pageSize = "25" } = c.req.query();
  let where = "WHERE u.is_active = 1";
  const params = [];
  if (roleId) {
    where += " AND u.role_id = ?";
    params.push(roleId);
  }
  if (branchId) {
    where += " AND u.branch_id = ?";
    params.push(branchId);
  }
  if (q) {
    where += " AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.username LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const result = db.paginate(
    `SELECT u.id, u.username, u.email, u.first_name, u.last_name,
            u.is_active, u.is_locked, u.last_login, u.created_at,
            r.name as role_name, r.display_name as role_display,
            b.name as branch_name, d.name as department_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN branches b ON b.id = u.branch_id
     LEFT JOIN departments d ON d.id = u.department_id
     ${where} ORDER BY u.first_name`,
    `SELECT COUNT(*) as total FROM users u ${where}`,
    params,
    parseInt(page),
    parseInt(pageSize)
  );
  return c.json(result);
});
users.post("/", requirePermission("hr", "users", "create"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  if (!licenseService.canAddUser()) {
    return c.json({ error: "User limit reached for your license. Please upgrade." }, 403);
  }
  const result = await authService.createUser({
    username: body.username,
    email: body.email,
    password: body.password,
    firstName: body.firstName,
    lastName: body.lastName,
    roleId: body.roleId,
    branchId: body.branchId,
    departmentId: body.departmentId,
    createdBy: session.userId
  });
  if (!result.success) return c.json({ error: result.error }, 400);
  await auditLogger.log({
    userId: session.userId,
    action: "USER_CREATED",
    module: "hr",
    resource: "users",
    resourceId: result.userId,
    newValues: { username: body.username, role: body.roleId },
    status: "success",
    riskLevel: "medium"
  });
  return c.json({ id: result.userId }, 201);
});
var auditRoutes = new Hono();
auditRoutes.use("*", requireAuth, requirePermission("admin", "audit", "read"));
auditRoutes.get("/", async (c) => {
  const query = c.req.query();
  const result = auditLogger.search({
    userId: query.userId,
    module: query.module,
    action: query.action,
    branchId: query.branchId,
    startDate: query.startDate,
    endDate: query.endDate,
    riskLevel: query.riskLevel,
    status: query.status,
    page: parseInt(query.page ?? "1"),
    pageSize: parseInt(query.pageSize ?? "50")
  });
  return c.json(result);
});
auditRoutes.get("/export", async (c) => {
  const query = c.req.query();
  const csv = auditLogger.exportToCsv({
    startDate: query.startDate,
    endDate: query.endDate,
    module: query.module,
    branchId: query.branchId
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="afyacore_audit_${Date.now()}.csv"`
    }
  });
});
auditRoutes.get("/verify", async (c) => {
  const result = auditLogger.verifyIntegrity();
  return c.json(result);
});
var system = new Hono();
system.use("*", requireAuth);
system.get("/license", async (c) => {
  const status = licenseService.validateLicense();
  return c.json({ license: status });
});
system.post("/license/activate", requirePermission("admin", "license", "update"), async (c) => {
  const { licenseKey } = await c.req.json();
  const result = await licenseService.activateLicense(licenseKey);
  if (!result.valid) return c.json({ error: result.error }, 400);
  return c.json({ success: true, license: result });
});
system.get("/license/fingerprint", async (c) => {
  const fp = licenseService.getHardwareFingerprint();
  return c.json({ fingerprint: fp.fingerprint, details: fp });
});
system.get("/health", async (c) => {
  const dbOk = db.ready;
  const licOk = licenseService.validateLicense().active;
  return c.json({
    status: dbOk && licOk ? "healthy" : "degraded",
    database: dbOk,
    license: licOk,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
system.post("/backup", requirePermission("admin", "system", "create"), async (c) => {
  const session = c.get("session");
  const { destPath } = await c.req.json();
  try {
    db.backup(destPath);
    await auditLogger.log({
      userId: session.userId,
      action: "BACKUP_CREATED",
      module: "admin",
      resource: "system",
      status: "success",
      riskLevel: "medium",
      newValues: { path: destPath }
    });
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});
apiRouter.route("/auth", auth);
apiRouter.route("/patients", patients);
apiRouter.route("/visits", visits);
apiRouter.route("/prescriptions", prescriptions);
apiRouter.route("/lab", lab);
apiRouter.route("/billing", billing);
apiRouter.route("/admissions", admissions);
apiRouter.route("/appointments", appointments);
apiRouter.route("/analytics", analytics);
apiRouter.route("/users", users);
apiRouter.route("/audit", auditRoutes);
apiRouter.route("/system", system);
export {
  apiRouter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vc3JjL3NlcnZlci9yb3V0ZXMvYXBpLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgeyBIb25vIH0gZnJvbSAnaG9ubyc7XG5pbXBvcnQgeyBkYiwgZ2VuZXJhdGVJZCwgZ2VuZXJhdGVTZXF1ZW50aWFsTnVtYmVyIH0gZnJvbSAnLi4vLi4vbGliL2RiL2RhdGFiYXNlJztcbmltcG9ydCB7IGF1dGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGliL2F1dGgvYXV0aC1zZXJ2aWNlJztcbmltcG9ydCB7IGF1ZGl0TG9nZ2VyLCBjb21wdXRlRGlmZiB9IGZyb20gJy4uLy4uL2xpYi9hdWRpdC9hdWRpdC1sb2dnZXInO1xuaW1wb3J0IHsgbGljZW5zZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9saWIvbGljZW5zZS9saWNlbnNlLXNlcnZpY2UnO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgQXV0aCBNaWRkbGV3YXJlIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZnVuY3Rpb24gcmVxdWlyZUF1dGgoYzogYW55LCBuZXh0OiBhbnkpIHtcbiAgY29uc3QgdG9rZW4gPSBjLnJlcS5oZWFkZXIoJ0F1dGhvcml6YXRpb24nKT8ucmVwbGFjZSgnQmVhcmVyICcsICcnKTtcbiAgaWYgKCF0b2tlbikgcmV0dXJuIGMuanNvbih7IGVycm9yOiAnVW5hdXRob3JpemVkJyB9LCA0MDEpO1xuXG4gIGNvbnN0IHNlc3Npb24gPSBhdXRoU2VydmljZS52YWxpZGF0ZVNlc3Npb24odG9rZW4pO1xuICBpZiAoIXNlc3Npb24pIHJldHVybiBjLmpzb24oeyBlcnJvcjogJ1Nlc3Npb24gZXhwaXJlZC4gUGxlYXNlIGxvZ2luIGFnYWluLicgfSwgNDAxKTtcblxuICBjLnNldCgnc2Vzc2lvbicsIHNlc3Npb24pO1xuICByZXR1cm4gbmV4dCgpO1xufVxuXG5mdW5jdGlvbiByZXF1aXJlUGVybWlzc2lvbihtb2R1bGU6IHN0cmluZywgcmVzb3VyY2U6IHN0cmluZywgYWN0aW9uOiBzdHJpbmcpIHtcbiAgcmV0dXJuIGFzeW5jIChjOiBhbnksIG5leHQ6IGFueSkgPT4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICAgIGlmICghYXV0aFNlcnZpY2UuaGFzUGVybWlzc2lvbihzZXNzaW9uLnBlcm1pc3Npb25zLCBtb2R1bGUsIHJlc291cmNlLCBhY3Rpb24pKSB7XG4gICAgICBhd2FpdCBhdWRpdExvZ2dlci5sb2coe1xuICAgICAgICB1c2VySWQ6IHNlc3Npb24udXNlcklkLCBhY3Rpb246ICdEQVRBX0FDQ0VTUycsXG4gICAgICAgIG1vZHVsZSwgcmVzb3VyY2UsIHN0YXR1czogJ2Jsb2NrZWQnLCByaXNrTGV2ZWw6ICdtZWRpdW0nLFxuICAgICAgICBmYWlsdXJlUmVhc29uOiBgSW5zdWZmaWNpZW50IHBlcm1pc3Npb246ICR7bW9kdWxlfToke3Jlc291cmNlfToke2FjdGlvbn1gLFxuICAgICAgfSk7XG4gICAgICByZXR1cm4gYy5qc29uKHsgZXJyb3I6ICdBY2Nlc3MgZGVuaWVkJyB9LCA0MDMpO1xuICAgIH1cbiAgICByZXR1cm4gbmV4dCgpO1xuICB9O1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDAgQXBwIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuZXhwb3J0IGNvbnN0IGFwaVJvdXRlciA9IG5ldyBIb25vKCk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gQVVUSCBST1VURVNcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuY29uc3QgYXV0aCA9IG5ldyBIb25vKCk7XG5cbmF1dGgucG9zdCgnL2xvZ2luJywgYXN5bmMgKGMpID0+IHtcbiAgY29uc3QgeyB1c2VybmFtZSwgcGFzc3dvcmQsIGRldmljZUZpbmdlcnByaW50IH0gPSBhd2FpdCBjLnJlcS5qc29uKCk7XG4gIGNvbnN0IGlwID0gYy5yZXEuaGVhZGVyKCdYLVJlYWwtSVAnKSA/PyBjLnJlcS5oZWFkZXIoJ1gtRm9yd2FyZGVkLUZvcicpID8/ICd1bmtub3duJztcbiAgY29uc3QgdWEgPSBjLnJlcS5oZWFkZXIoJ1VzZXItQWdlbnQnKSA/PyAndW5rbm93bic7XG5cbiAgaWYgKCF1c2VybmFtZSB8fCAhcGFzc3dvcmQpIHtcbiAgICByZXR1cm4gYy5qc29uKHsgZXJyb3I6ICdVc2VybmFtZSBhbmQgcGFzc3dvcmQgYXJlIHJlcXVpcmVkJyB9LCA0MDApO1xuICB9XG5cbiAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXV0aFNlcnZpY2UubG9naW4odXNlcm5hbWUsIHBhc3N3b3JkLCBkZXZpY2VGaW5nZXJwcmludCA/PyAndW5rbm93bicsIGlwLCB1YSk7XG4gIGlmICghcmVzdWx0LnN1Y2Nlc3MgJiYgIXJlc3VsdC5yZXF1aXJlc01mYSkge1xuICAgIHJldHVybiBjLmpzb24oeyBlcnJvcjogcmVzdWx0LmVycm9yIH0sIDQwMSk7XG4gIH1cbiAgcmV0dXJuIGMuanNvbihyZXN1bHQpO1xufSk7XG5cbmF1dGgucG9zdCgnL3ZlcmlmeS1tZmEnLCBhc3luYyAoYykgPT4ge1xuICBjb25zdCB7IHRlbXBUb2tlbiwgY29kZSB9ID0gYXdhaXQgYy5yZXEuanNvbigpO1xuICBjb25zdCBpcCA9IGMucmVxLmhlYWRlcignWC1SZWFsLUlQJykgPz8gJ3Vua25vd24nO1xuICBjb25zdCByZXN1bHQgPSBhd2FpdCBhdXRoU2VydmljZS52ZXJpZnlNZmEodGVtcFRva2VuLCBjb2RlLCBpcCk7XG4gIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjLmpzb24oeyBlcnJvcjogcmVzdWx0LmVycm9yIH0sIDQwMSk7XG4gIHJldHVybiBjLmpzb24ocmVzdWx0KTtcbn0pO1xuXG5hdXRoLnBvc3QoJy9sb2dvdXQnLCByZXF1aXJlQXV0aCwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IHRva2VuID0gYy5yZXEuaGVhZGVyKCdBdXRob3JpemF0aW9uJyk/LnJlcGxhY2UoJ0JlYXJlciAnLCAnJykgPz8gJyc7XG4gIGF1dGhTZXJ2aWNlLnJldm9rZVNlc3Npb24odG9rZW4sICdsb2dvdXQnKTtcbiAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICB1c2VySWQ6IHNlc3Npb24udXNlcklkLCBhY3Rpb246ICdMT0dPVVQnLFxuICAgIG1vZHVsZTogJ2F1dGgnLCByZXNvdXJjZTogJ3VzZXJzJywgcmVzb3VyY2VJZDogc2Vzc2lvbi51c2VySWQsXG4gICAgc3RhdHVzOiAnc3VjY2VzcycsIHJpc2tMZXZlbDogJ2xvdycsXG4gIH0pO1xuICByZXR1cm4gYy5qc29uKHsgc3VjY2VzczogdHJ1ZSB9KTtcbn0pO1xuXG5hdXRoLnBvc3QoJy9jaGFuZ2UtcGFzc3dvcmQnLCByZXF1aXJlQXV0aCwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IHsgY3VycmVudFBhc3N3b3JkLCBuZXdQYXNzd29yZCB9ID0gYXdhaXQgYy5yZXEuanNvbigpO1xuICBjb25zdCByZXN1bHQgPSBhd2FpdCBhdXRoU2VydmljZS5jaGFuZ2VQYXNzd29yZChzZXNzaW9uLnVzZXJJZCwgY3VycmVudFBhc3N3b3JkLCBuZXdQYXNzd29yZCk7XG4gIGlmICghcmVzdWx0LnN1Y2Nlc3MpIHJldHVybiBjLmpzb24oeyBlcnJvcjogcmVzdWx0LmVycm9yIH0sIDQwMCk7XG4gIGF3YWl0IGF1ZGl0TG9nZ2VyLmxvZyh7XG4gICAgdXNlcklkOiBzZXNzaW9uLnVzZXJJZCwgYWN0aW9uOiAnUEFTU1dPUkRfQ0hBTkdFRCcsXG4gICAgbW9kdWxlOiAnYXV0aCcsIHJlc291cmNlOiAndXNlcnMnLCByZXNvdXJjZUlkOiBzZXNzaW9uLnVzZXJJZCxcbiAgICBzdGF0dXM6ICdzdWNjZXNzJywgcmlza0xldmVsOiAnbWVkaXVtJyxcbiAgfSk7XG4gIHJldHVybiBjLmpzb24oeyBzdWNjZXNzOiB0cnVlIH0pO1xufSk7XG5cbmF1dGguZ2V0KCcvbWUnLCByZXF1aXJlQXV0aCwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IHVzZXIgPSBkYi5maW5kT25lKFxuICAgIGBTRUxFQ1QgdS5pZCwgdS51c2VybmFtZSwgdS5lbWFpbCwgdS5maXJzdF9uYW1lLCB1Lmxhc3RfbmFtZSwgdS5wcm9maWxlX3Bob3RvLFxuICAgICAgICAgICAgdS5icmFuY2hfaWQsIHUuZGVwYXJ0bWVudF9pZCwgci5uYW1lIGFzIHJvbGVfbmFtZSwgci5kaXNwbGF5X25hbWUgYXMgcm9sZV9kaXNwbGF5LFxuICAgICAgICAgICAgci5jYXRlZ29yeSBhcyByb2xlX2NhdGVnb3J5XG4gICAgIEZST00gdXNlcnMgdSBKT0lOIHJvbGVzIHIgT04gci5pZCA9IHUucm9sZV9pZCBXSEVSRSB1LmlkID0gP2AsXG4gICAgW3Nlc3Npb24udXNlcklkXSxcbiAgKTtcbiAgcmV0dXJuIGMuanNvbih7IHVzZXIsIHBlcm1pc3Npb25zOiBbLi4uc2Vzc2lvbi5wZXJtaXNzaW9uc10gfSk7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBQQVRJRU5UIFJPVVRFU1xuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5jb25zdCBwYXRpZW50cyA9IG5ldyBIb25vKCk7XG5wYXRpZW50cy51c2UoJyonLCByZXF1aXJlQXV0aCk7XG5cbnBhdGllbnRzLmdldCgnLycsIHJlcXVpcmVQZXJtaXNzaW9uKCdwYXRpZW50cycsICdwYXRpZW50cycsICdyZWFkJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCB7IHEsIHBhZ2UgPSAnMScsIHBhZ2VTaXplID0gJzI1JywgYnJhbmNoSWQgfSA9IGMucmVxLnF1ZXJ5KCk7XG4gIGNvbnN0IGJyYW5jaCA9IGJyYW5jaElkID8/IHNlc3Npb24uYnJhbmNoSWQ7XG5cbiAgbGV0IHdoZXJlID0gJ1dIRVJFIHAuaXNfYWN0aXZlID0gMSc7XG4gIGNvbnN0IHBhcmFtczogKHN0cmluZyB8IG51bWJlciB8IG51bGwpW10gPSBbXTtcbiAgaWYgKGJyYW5jaCkgeyB3aGVyZSArPSAnIEFORCBwLmJyYW5jaF9pZCA9ID8nOyBwYXJhbXMucHVzaChicmFuY2gpOyB9XG4gIGlmIChxKSB7XG4gICAgd2hlcmUgKz0gYCBBTkQgKHAuZmlyc3RfbmFtZSBMSUtFID8gT1IgcC5sYXN0X25hbWUgTElLRSA/IE9SIHAucGF0aWVudF9udW1iZXIgTElLRSA/IE9SIHAucGhvbmUgTElLRSA/KWA7XG4gICAgY29uc3QgdGVybSA9IGAlJHtxfSVgO1xuICAgIHBhcmFtcy5wdXNoKHRlcm0sIHRlcm0sIHRlcm0sIHRlcm0pO1xuICB9XG5cbiAgY29uc3QgcmVzdWx0ID0gZGIucGFnaW5hdGUoXG4gICAgYFNFTEVDVCBwLmlkLCBwLnBhdGllbnRfbnVtYmVyLCBwLmZpcnN0X25hbWUsIHAubWlkZGxlX25hbWUsIHAubGFzdF9uYW1lLFxuICAgICAgICAgICAgcC5kYXRlX29mX2JpcnRoLCBwLmdlbmRlciwgcC5waG9uZSwgcC5lbWFpbCwgcC5uYXRpb25hbF9pZCxcbiAgICAgICAgICAgIHAuYmxvb2RfZ3JvdXAsIHAubmhpZl9udW1iZXIsIHAuaW5zdXJhbmNlX3Byb3ZpZGVyLFxuICAgICAgICAgICAgcC5jcmVhdGVkX2F0LCBiLm5hbWUgYXMgYnJhbmNoX25hbWVcbiAgICAgRlJPTSBwYXRpZW50cyBwIExFRlQgSk9JTiBicmFuY2hlcyBiIE9OIGIuaWQgPSBwLmJyYW5jaF9pZCAke3doZXJlfVxuICAgICBPUkRFUiBCWSBwLmNyZWF0ZWRfYXQgREVTQ2AsXG4gICAgYFNFTEVDVCBDT1VOVCgqKSBhcyB0b3RhbCBGUk9NIHBhdGllbnRzIHAgJHt3aGVyZX1gLFxuICAgIHBhcmFtcyxcbiAgICBwYXJzZUludChwYWdlKSwgcGFyc2VJbnQocGFnZVNpemUpLFxuICApO1xuXG4gIGF3YWl0IGF1ZGl0TG9nZ2VyLmxvZyh7XG4gICAgdXNlcklkOiBzZXNzaW9uLnVzZXJJZCwgYWN0aW9uOiAnREFUQV9BQ0NFU1MnLCBtb2R1bGU6ICdwYXRpZW50cycsXG4gICAgcmVzb3VyY2U6ICdwYXRpZW50cycsIHN0YXR1czogJ3N1Y2Nlc3MnLCByaXNrTGV2ZWw6ICdsb3cnLFxuICB9KTtcbiAgcmV0dXJuIGMuanNvbihyZXN1bHQpO1xufSk7XG5cbnBhdGllbnRzLmdldCgnLzppZCcsIHJlcXVpcmVQZXJtaXNzaW9uKCdwYXRpZW50cycsICdwYXRpZW50cycsICdyZWFkJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCBwYXRpZW50ID0gZGIuZmluZE9uZShcbiAgICBgU0VMRUNUIHAuKiwgYi5uYW1lIGFzIGJyYW5jaF9uYW1lIEZST00gcGF0aWVudHMgcFxuICAgICBMRUZUIEpPSU4gYnJhbmNoZXMgYiBPTiBiLmlkID0gcC5icmFuY2hfaWQgV0hFUkUgcC5pZCA9ID9gLFxuICAgIFtjLnJlcS5wYXJhbSgnaWQnKV0sXG4gICk7XG4gIGlmICghcGF0aWVudCkgcmV0dXJuIGMuanNvbih7IGVycm9yOiAnUGF0aWVudCBub3QgZm91bmQnIH0sIDQwNCk7XG5cbiAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICB1c2VySWQ6IHNlc3Npb24udXNlcklkLCBhY3Rpb246ICdQQVRJRU5UX1ZJRVdFRCcsIG1vZHVsZTogJ3BhdGllbnRzJyxcbiAgICByZXNvdXJjZTogJ3BhdGllbnRzJywgcmVzb3VyY2VJZDogYy5yZXEucGFyYW0oJ2lkJyksXG4gICAgc3RhdHVzOiAnc3VjY2VzcycsIHJpc2tMZXZlbDogJ2xvdycsXG4gIH0pO1xuICByZXR1cm4gYy5qc29uKHsgcGF0aWVudCB9KTtcbn0pO1xuXG5wYXRpZW50cy5wb3N0KCcvJywgcmVxdWlyZVBlcm1pc3Npb24oJ3BhdGllbnRzJywgJ3BhdGllbnRzJywgJ2NyZWF0ZScpLCBhc3luYyAoYykgPT4ge1xuICBjb25zdCBzZXNzaW9uID0gYy5nZXQoJ3Nlc3Npb24nKTtcbiAgY29uc3QgYm9keSA9IGF3YWl0IGMucmVxLmpzb24oKTtcbiAgY29uc3QgYnJhbmNoSWQgPSBib2R5LmJyYW5jaElkID8/IHNlc3Npb24uYnJhbmNoSWQ7XG4gIGlmICghYnJhbmNoSWQpIHJldHVybiBjLmpzb24oeyBlcnJvcjogJ0JyYW5jaCBJRCByZXF1aXJlZCcgfSwgNDAwKTtcblxuICBjb25zdCBwYXRpZW50TnVtYmVyID0gZ2VuZXJhdGVTZXF1ZW50aWFsTnVtYmVyKGRiLCAnQUZDJywgJ3BhdGllbnRzJywgJ3BhdGllbnRfbnVtYmVyJyk7XG4gIGNvbnN0IGlkID0gZ2VuZXJhdGVJZCgpO1xuXG4gIGRiLnJ1bihcbiAgICBgSU5TRVJUIElOVE8gcGF0aWVudHMgKGlkLCBwYXRpZW50X251bWJlciwgYnJhbmNoX2lkLCBmaXJzdF9uYW1lLCBtaWRkbGVfbmFtZSwgbGFzdF9uYW1lLFxuICAgICBkYXRlX29mX2JpcnRoLCBnZW5kZXIsIGJsb29kX2dyb3VwLCBuYXRpb25hbF9pZCwgcGhvbmUsIGVtYWlsLCBtYXJpdGFsX3N0YXR1cyxcbiAgICAgb2NjdXBhdGlvbiwgbmF0aW9uYWxpdHksIGFkZHJlc3MsIGNpdHksIGNvdW50eSwgbmV4dF9vZl9raW5fbmFtZSwgbmV4dF9vZl9raW5fcmVsYXRpb24sXG4gICAgIG5leHRfb2Zfa2luX3Bob25lLCBuaGlmX251bWJlciwgbmhpZl9jYXJkX251bWJlciwgaW5zdXJhbmNlX3Byb3ZpZGVyLFxuICAgICBpbnN1cmFuY2VfbnVtYmVyLCBhbGxlcmdpZXMsIGNocm9uaWNfY29uZGl0aW9ucywgcmVnaXN0ZXJlZF9ieSlcbiAgICAgVkFMVUVTICg/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/KWAsXG4gICAgW1xuICAgICAgaWQsIHBhdGllbnROdW1iZXIsIGJyYW5jaElkLCBib2R5LmZpcnN0TmFtZSwgYm9keS5taWRkbGVOYW1lID8/IG51bGwsXG4gICAgICBib2R5Lmxhc3ROYW1lLCBib2R5LmRhdGVPZkJpcnRoLCBib2R5LmdlbmRlciwgYm9keS5ibG9vZEdyb3VwID8/IG51bGwsXG4gICAgICBib2R5Lm5hdGlvbmFsSWQgPz8gbnVsbCwgYm9keS5waG9uZSA/PyBudWxsLCBib2R5LmVtYWlsID8/IG51bGwsXG4gICAgICBib2R5Lm1hcml0YWxTdGF0dXMgPz8gbnVsbCwgYm9keS5vY2N1cGF0aW9uID8/IG51bGwsXG4gICAgICBib2R5Lm5hdGlvbmFsaXR5ID8/ICdLZW55YW4nLCBib2R5LmFkZHJlc3MgPz8gbnVsbCwgYm9keS5jaXR5ID8/IG51bGwsXG4gICAgICBib2R5LmNvdW50eSA/PyBudWxsLCBib2R5Lm5leHRPZktpbk5hbWUgPz8gbnVsbCwgYm9keS5uZXh0T2ZLaW5SZWxhdGlvbiA/PyBudWxsLFxuICAgICAgYm9keS5uZXh0T2ZLaW5QaG9uZSA/PyBudWxsLCBib2R5Lm5oaWZOdW1iZXIgPz8gbnVsbCwgYm9keS5uaGlmQ2FyZE51bWJlciA/PyBudWxsLFxuICAgICAgYm9keS5pbnN1cmFuY2VQcm92aWRlciA/PyBudWxsLCBib2R5Lmluc3VyYW5jZU51bWJlciA/PyBudWxsLFxuICAgICAgSlNPTi5zdHJpbmdpZnkoYm9keS5hbGxlcmdpZXMgPz8gW10pLFxuICAgICAgSlNPTi5zdHJpbmdpZnkoYm9keS5jaHJvbmljQ29uZGl0aW9ucyA/PyBbXSksXG4gICAgICBzZXNzaW9uLnVzZXJJZCxcbiAgICBdLFxuICApO1xuXG4gIGF3YWl0IGF1ZGl0TG9nZ2VyLmxvZyh7XG4gICAgdXNlcklkOiBzZXNzaW9uLnVzZXJJZCwgYWN0aW9uOiAnUEFUSUVOVF9DUkVBVEVEJywgbW9kdWxlOiAncGF0aWVudHMnLFxuICAgIHJlc291cmNlOiAncGF0aWVudHMnLCByZXNvdXJjZUlkOiBpZCxcbiAgICBuZXdWYWx1ZXM6IHsgcGF0aWVudE51bWJlciwgbmFtZTogYCR7Ym9keS5maXJzdE5hbWV9ICR7Ym9keS5sYXN0TmFtZX1gIH0sXG4gICAgc3RhdHVzOiAnc3VjY2VzcycsIHJpc2tMZXZlbDogJ2xvdycsXG4gIH0pO1xuICByZXR1cm4gYy5qc29uKHsgaWQsIHBhdGllbnROdW1iZXIgfSwgMjAxKTtcbn0pO1xuXG5wYXRpZW50cy5wdXQoJy86aWQnLCByZXF1aXJlUGVybWlzc2lvbigncGF0aWVudHMnLCAncGF0aWVudHMnLCAndXBkYXRlJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCBpZCA9IGMucmVxLnBhcmFtKCdpZCcpO1xuICBjb25zdCBib2R5ID0gYXdhaXQgYy5yZXEuanNvbigpO1xuXG4gIGNvbnN0IGJlZm9yZSA9IGRiLmZpbmRPbmU8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+KGBTRUxFQ1QgKiBGUk9NIHBhdGllbnRzIFdIRVJFIGlkID0gP2AsIFtpZF0pO1xuICBpZiAoIWJlZm9yZSkgcmV0dXJuIGMuanNvbih7IGVycm9yOiAnUGF0aWVudCBub3QgZm91bmQnIH0sIDQwNCk7XG5cbiAgZGIudXBkYXRlKCdwYXRpZW50cycsIGlkLCB7XG4gICAgZmlyc3RfbmFtZTogYm9keS5maXJzdE5hbWUsIG1pZGRsZV9uYW1lOiBib2R5Lm1pZGRsZU5hbWUsXG4gICAgbGFzdF9uYW1lOiBib2R5Lmxhc3ROYW1lLCBkYXRlX29mX2JpcnRoOiBib2R5LmRhdGVPZkJpcnRoLFxuICAgIGdlbmRlcjogYm9keS5nZW5kZXIsIGJsb29kX2dyb3VwOiBib2R5LmJsb29kR3JvdXAsXG4gICAgbmF0aW9uYWxfaWQ6IGJvZHkubmF0aW9uYWxJZCwgcGhvbmU6IGJvZHkucGhvbmUsIGVtYWlsOiBib2R5LmVtYWlsLFxuICAgIGFkZHJlc3M6IGJvZHkuYWRkcmVzcywgY2l0eTogYm9keS5jaXR5LCBjb3VudHk6IGJvZHkuY291bnR5LFxuICAgIGFsbGVyZ2llczogSlNPTi5zdHJpbmdpZnkoYm9keS5hbGxlcmdpZXMgPz8gW10pLFxuICAgIGNocm9uaWNfY29uZGl0aW9uczogSlNPTi5zdHJpbmdpZnkoYm9keS5jaHJvbmljQ29uZGl0aW9ucyA/PyBbXSksXG4gICAgbmhpZl9udW1iZXI6IGJvZHkubmhpZk51bWJlciwgaW5zdXJhbmNlX3Byb3ZpZGVyOiBib2R5Lmluc3VyYW5jZVByb3ZpZGVyLFxuICAgIGluc3VyYW5jZV9udW1iZXI6IGJvZHkuaW5zdXJhbmNlTnVtYmVyLFxuICB9KTtcblxuICBjb25zdCBhZnRlciA9IGRiLmZpbmRPbmU8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+KGBTRUxFQ1QgKiBGUk9NIHBhdGllbnRzIFdIRVJFIGlkID0gP2AsIFtpZF0pO1xuICBjb25zdCBkaWZmID0gY29tcHV0ZURpZmYoYmVmb3JlLCBhZnRlciEpO1xuXG4gIGF3YWl0IGF1ZGl0TG9nZ2VyLmxvZyh7XG4gICAgdXNlcklkOiBzZXNzaW9uLnVzZXJJZCwgYWN0aW9uOiAnUEFUSUVOVF9VUERBVEVEJywgbW9kdWxlOiAncGF0aWVudHMnLFxuICAgIHJlc291cmNlOiAncGF0aWVudHMnLCByZXNvdXJjZUlkOiBpZCxcbiAgICBwcmV2aW91c1ZhbHVlczogZGlmZi5wcmV2aW91c1ZhbHVlcywgbmV3VmFsdWVzOiBkaWZmLm5ld1ZhbHVlcyxcbiAgICBjaGFuZ2VkRmllbGRzOiBkaWZmLmNoYW5nZWRGaWVsZHMsIHN0YXR1czogJ3N1Y2Nlc3MnLCByaXNrTGV2ZWw6ICdsb3cnLFxuICB9KTtcbiAgcmV0dXJuIGMuanNvbih7IHN1Y2Nlc3M6IHRydWUgfSk7XG59KTtcblxucGF0aWVudHMuZ2V0KCcvOmlkL3ZpdGFscycsIHJlcXVpcmVQZXJtaXNzaW9uKCdwYXRpZW50cycsICd2aXRhbHMnLCAncmVhZCcpLCBhc3luYyAoYykgPT4ge1xuICBjb25zdCB2aXRhbHMgPSBkYi5xdWVyeShcbiAgICBgU0VMRUNUIHB2LiosIHUuZmlyc3RfbmFtZSB8fCAnICcgfHwgdS5sYXN0X25hbWUgYXMgcmVjb3JkZWRfYnlfbmFtZVxuICAgICBGUk9NIHBhdGllbnRfdml0YWxzIHB2IExFRlQgSk9JTiB1c2VycyB1IE9OIHUuaWQgPSBwdi5yZWNvcmRlZF9ieVxuICAgICBXSEVSRSBwdi5wYXRpZW50X2lkID0gPyBPUkRFUiBCWSBwdi5yZWNvcmRlZF9hdCBERVNDIExJTUlUIDIwYCxcbiAgICBbYy5yZXEucGFyYW0oJ2lkJyldLFxuICApO1xuICByZXR1cm4gYy5qc29uKHsgdml0YWxzOiB2aXRhbHMucm93cyB9KTtcbn0pO1xuXG5wYXRpZW50cy5wb3N0KCcvOmlkL3ZpdGFscycsIHJlcXVpcmVQZXJtaXNzaW9uKCdwYXRpZW50cycsICd2aXRhbHMnLCAnY3JlYXRlJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCBib2R5ID0gYXdhaXQgYy5yZXEuanNvbigpO1xuICBjb25zdCBwYXRpZW50SWQgPSBjLnJlcS5wYXJhbSgnaWQnKTtcblxuICBjb25zdCBibWkgPSBib2R5LndlaWdodCAmJiBib2R5LmhlaWdodFxuICAgID8gKGJvZHkud2VpZ2h0IC8gKChib2R5LmhlaWdodCAvIDEwMCkgKiogMikpLnRvRml4ZWQoMSlcbiAgICA6IG51bGw7XG5cbiAgY29uc3QgaWQgPSBnZW5lcmF0ZUlkKCk7XG4gIGRiLnJ1bihcbiAgICBgSU5TRVJUIElOVE8gcGF0aWVudF92aXRhbHMgKGlkLCBwYXRpZW50X2lkLCB2aXNpdF9pZCwgYnJhbmNoX2lkLCByZWNvcmRlZF9ieSxcbiAgICAgdGVtcGVyYXR1cmUsIHRlbXBlcmF0dXJlX21ldGhvZCwgcHVsc2VfcmF0ZSwgcmVzcGlyYXRvcnlfcmF0ZSxcbiAgICAgYmxvb2RfcHJlc3N1cmVfc3lzdG9saWMsIGJsb29kX3ByZXNzdXJlX2RpYXN0b2xpYywgYnBfcG9zaXRpb24sXG4gICAgIG94eWdlbl9zYXR1cmF0aW9uLCB3ZWlnaHQsIGhlaWdodCwgYm1pLCBibG9vZF9nbHVjb3NlLCBwYWluX3NjYWxlLCBub3RlcylcbiAgICAgVkFMVUVTICg/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/KWAsXG4gICAgW1xuICAgICAgaWQsIHBhdGllbnRJZCwgYm9keS52aXNpdElkID8/IG51bGwsIGJvZHkuYnJhbmNoSWQgPz8gc2Vzc2lvbi5icmFuY2hJZCxcbiAgICAgIHNlc3Npb24udXNlcklkLCBib2R5LnRlbXBlcmF0dXJlID8/IG51bGwsIGJvZHkudGVtcGVyYXR1cmVNZXRob2QgPz8gbnVsbCxcbiAgICAgIGJvZHkucHVsc2VSYXRlID8/IG51bGwsIGJvZHkucmVzcGlyYXRvcnlSYXRlID8/IG51bGwsXG4gICAgICBib2R5LmJwU3lzdG9saWMgPz8gbnVsbCwgYm9keS5icERpYXN0b2xpYyA/PyBudWxsLCBib2R5LmJwUG9zaXRpb24gPz8gbnVsbCxcbiAgICAgIGJvZHkub3h5Z2VuU2F0dXJhdGlvbiA/PyBudWxsLCBib2R5LndlaWdodCA/PyBudWxsLCBib2R5LmhlaWdodCA/PyBudWxsLFxuICAgICAgYm1pLCBib2R5LmJsb29kR2x1Y29zZSA/PyBudWxsLCBib2R5LnBhaW5TY2FsZSA/PyBudWxsLCBib2R5Lm5vdGVzID8/IG51bGwsXG4gICAgXSxcbiAgKTtcbiAgcmV0dXJuIGMuanNvbih7IGlkIH0sIDIwMSk7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBWSVNJVFMgLyBFTkNPVU5URVJTXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmNvbnN0IHZpc2l0cyA9IG5ldyBIb25vKCk7XG52aXNpdHMudXNlKCcqJywgcmVxdWlyZUF1dGgpO1xuXG52aXNpdHMuZ2V0KCcvJywgcmVxdWlyZVBlcm1pc3Npb24oJ2NsaW5pY2FsJywgJ3Zpc2l0cycsICdyZWFkJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCB7IHBhdGllbnRJZCwgc3RhdHVzLCBkb2N0b3JJZCwgZGF0ZSwgcGFnZSA9ICcxJywgcGFnZVNpemUgPSAnMjUnIH0gPSBjLnJlcS5xdWVyeSgpO1xuXG4gIGxldCB3aGVyZSA9ICdXSEVSRSAxPTEnO1xuICBjb25zdCBwYXJhbXM6IChzdHJpbmcgfCBudW1iZXIgfCBudWxsKVtdID0gW107XG4gIGlmIChzZXNzaW9uLmJyYW5jaElkKSB7IHdoZXJlICs9ICcgQU5EIHYuYnJhbmNoX2lkID0gPyc7IHBhcmFtcy5wdXNoKHNlc3Npb24uYnJhbmNoSWQpOyB9XG4gIGlmIChwYXRpZW50SWQpIHsgd2hlcmUgKz0gJyBBTkQgdi5wYXRpZW50X2lkID0gPyc7IHBhcmFtcy5wdXNoKHBhdGllbnRJZCk7IH1cbiAgaWYgKHN0YXR1cykgeyB3aGVyZSArPSAnIEFORCB2LnN0YXR1cyA9ID8nOyBwYXJhbXMucHVzaChzdGF0dXMpOyB9XG4gIGlmIChkb2N0b3JJZCkgeyB3aGVyZSArPSAnIEFORCB2LmF0dGVuZGluZ19kb2N0b3JfaWQgPSA/JzsgcGFyYW1zLnB1c2goZG9jdG9ySWQpOyB9XG4gIGlmIChkYXRlKSB7IHdoZXJlICs9ICcgQU5EIERBVEUodi5jaGVja19pbl90aW1lKSA9ID8nOyBwYXJhbXMucHVzaChkYXRlKTsgfVxuXG4gIGNvbnN0IHJlc3VsdCA9IGRiLnBhZ2luYXRlKFxuICAgIGBTRUxFQ1Qgdi4qLCBwLmZpcnN0X25hbWUgfHwgJyAnIHx8IHAubGFzdF9uYW1lIGFzIHBhdGllbnRfbmFtZSxcbiAgICAgICAgICAgIHAucGF0aWVudF9udW1iZXIsIGQuZmlyc3RfbmFtZSB8fCAnICcgfHwgZC5sYXN0X25hbWUgYXMgZG9jdG9yX25hbWUsXG4gICAgICAgICAgICBkZXAubmFtZSBhcyBkZXBhcnRtZW50X25hbWVcbiAgICAgRlJPTSB2aXNpdHMgdlxuICAgICBKT0lOIHBhdGllbnRzIHAgT04gcC5pZCA9IHYucGF0aWVudF9pZFxuICAgICBMRUZUIEpPSU4gdXNlcnMgZCBPTiBkLmlkID0gdi5hdHRlbmRpbmdfZG9jdG9yX2lkXG4gICAgIExFRlQgSk9JTiBkZXBhcnRtZW50cyBkZXAgT04gZGVwLmlkID0gdi5kZXBhcnRtZW50X2lkXG4gICAgICR7d2hlcmV9IE9SREVSIEJZIHYuY2hlY2tfaW5fdGltZSBERVNDYCxcbiAgICBgU0VMRUNUIENPVU5UKCopIGFzIHRvdGFsIEZST00gdmlzaXRzIHYgJHt3aGVyZX1gLFxuICAgIHBhcmFtcywgcGFyc2VJbnQocGFnZSksIHBhcnNlSW50KHBhZ2VTaXplKSxcbiAgKTtcbiAgcmV0dXJuIGMuanNvbihyZXN1bHQpO1xufSk7XG5cbnZpc2l0cy5wb3N0KCcvJywgcmVxdWlyZVBlcm1pc3Npb24oJ2NsaW5pY2FsJywgJ3Zpc2l0cycsICdjcmVhdGUnKSwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IGJvZHkgPSBhd2FpdCBjLnJlcS5qc29uKCk7XG5cbiAgY29uc3QgdmlzaXROdW1iZXIgPSBnZW5lcmF0ZVNlcXVlbnRpYWxOdW1iZXIoZGIsICdWSVMnLCAndmlzaXRzJywgJ3Zpc2l0X251bWJlcicpO1xuICBjb25zdCBpZCA9IGdlbmVyYXRlSWQoKTtcblxuICBkYi5ydW4oXG4gICAgYElOU0VSVCBJTlRPIHZpc2l0cyAoaWQsIHZpc2l0X251bWJlciwgYnJhbmNoX2lkLCBwYXRpZW50X2lkLCBhcHBvaW50bWVudF9pZCxcbiAgICAgdmlzaXRfdHlwZSwgZGVwYXJ0bWVudF9pZCwgYXR0ZW5kaW5nX2RvY3Rvcl9pZCwgdHJpYWdlX2xldmVsLFxuICAgICBjaGllZl9jb21wbGFpbnQsIHByZXNlbnRpbmdfY29tcGxhaW50cywgY3JlYXRlZF9ieSlcbiAgICAgVkFMVUVTICg/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPylgLFxuICAgIFtcbiAgICAgIGlkLCB2aXNpdE51bWJlciwgYm9keS5icmFuY2hJZCA/PyBzZXNzaW9uLmJyYW5jaElkLCBib2R5LnBhdGllbnRJZCxcbiAgICAgIGJvZHkuYXBwb2ludG1lbnRJZCA/PyBudWxsLCBib2R5LnZpc2l0VHlwZSA/PyAnb3BkJyxcbiAgICAgIGJvZHkuZGVwYXJ0bWVudElkID8/IG51bGwsIGJvZHkuZG9jdG9ySWQgPz8gc2Vzc2lvbi51c2VySWQsXG4gICAgICBib2R5LnRyaWFnZUxldmVsID8/IG51bGwsIGJvZHkuY2hpZWZDb21wbGFpbnQgPz8gbnVsbCxcbiAgICAgIEpTT04uc3RyaW5naWZ5KGJvZHkucHJlc2VudGluZ0NvbXBsYWludHMgPz8gW10pLCBzZXNzaW9uLnVzZXJJZCxcbiAgICBdLFxuICApO1xuXG4gIGF3YWl0IGF1ZGl0TG9nZ2VyLmxvZyh7XG4gICAgdXNlcklkOiBzZXNzaW9uLnVzZXJJZCwgYWN0aW9uOiAnVklTSVRfQ1JFQVRFRCcsIG1vZHVsZTogJ2NsaW5pY2FsJyxcbiAgICByZXNvdXJjZTogJ3Zpc2l0cycsIHJlc291cmNlSWQ6IGlkLFxuICAgIG5ld1ZhbHVlczogeyB2aXNpdE51bWJlciwgcGF0aWVudElkOiBib2R5LnBhdGllbnRJZCwgdHlwZTogYm9keS52aXNpdFR5cGUgfSxcbiAgICBzdGF0dXM6ICdzdWNjZXNzJywgcmlza0xldmVsOiAnbG93JyxcbiAgfSk7XG4gIHJldHVybiBjLmpzb24oeyBpZCwgdmlzaXROdW1iZXIgfSwgMjAxKTtcbn0pO1xuXG52aXNpdHMucG9zdCgnLzppZC9ub3RlcycsIHJlcXVpcmVQZXJtaXNzaW9uKCdjbGluaWNhbCcsICdub3RlcycsICdjcmVhdGUnKSwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IGJvZHkgPSBhd2FpdCBjLnJlcS5qc29uKCk7XG4gIGNvbnN0IHZpc2l0SWQgPSBjLnJlcS5wYXJhbSgnaWQnKTtcblxuICBjb25zdCB2aXNpdCA9IGRiLmZpbmRPbmUoYFNFTEVDVCBwYXRpZW50X2lkIEZST00gdmlzaXRzIFdIRVJFIGlkID0gP2AsIFt2aXNpdElkXSk7XG4gIGlmICghdmlzaXQpIHJldHVybiBjLmpzb24oeyBlcnJvcjogJ1Zpc2l0IG5vdCBmb3VuZCcgfSwgNDA0KTtcblxuICBjb25zdCBpZCA9IGdlbmVyYXRlSWQoKTtcbiAgZGIucnVuKFxuICAgIGBJTlNFUlQgSU5UTyBjbGluaWNhbF9ub3RlcyAoaWQsIHZpc2l0X2lkLCBwYXRpZW50X2lkLCBub3RlX3R5cGUsIGNvbnRlbnQsIGNyZWF0ZWRfYnkpXG4gICAgIFZBTFVFUyAoPyw/LD8sPyw/LD8pYCxcbiAgICBbaWQsIHZpc2l0SWQsICh2aXNpdCBhcyBhbnkpLnBhdGllbnRfaWQsIGJvZHkubm90ZVR5cGUsIGJvZHkuY29udGVudCwgc2Vzc2lvbi51c2VySWRdLFxuICApO1xuICByZXR1cm4gYy5qc29uKHsgaWQgfSwgMjAxKTtcbn0pO1xuXG52aXNpdHMucG9zdCgnLzppZC9kaWFnbm9zZXMnLCByZXF1aXJlUGVybWlzc2lvbignY2xpbmljYWwnLCAnZGlhZ25vc2VzJywgJ2NyZWF0ZScpLCBhc3luYyAoYykgPT4ge1xuICBjb25zdCBzZXNzaW9uID0gYy5nZXQoJ3Nlc3Npb24nKTtcbiAgY29uc3QgYm9keSA9IGF3YWl0IGMucmVxLmpzb24oKTtcbiAgY29uc3QgdmlzaXRJZCA9IGMucmVxLnBhcmFtKCdpZCcpO1xuXG4gIGNvbnN0IHZpc2l0ID0gZGIuZmluZE9uZShgU0VMRUNUIHBhdGllbnRfaWQgRlJPTSB2aXNpdHMgV0hFUkUgaWQgPSA/YCwgW3Zpc2l0SWRdKTtcbiAgaWYgKCF2aXNpdCkgcmV0dXJuIGMuanNvbih7IGVycm9yOiAnVmlzaXQgbm90IGZvdW5kJyB9LCA0MDQpO1xuXG4gIGNvbnN0IGlkID0gZ2VuZXJhdGVJZCgpO1xuICBkYi5ydW4oXG4gICAgYElOU0VSVCBJTlRPIGRpYWdub3NlcyAoaWQsIHZpc2l0X2lkLCBwYXRpZW50X2lkLCBpY2QxMF9jb2RlLCBpY2QxMF9kZXNjcmlwdGlvbixcbiAgICAgZGlhZ25vc2lzX3RleHQsIGRpYWdub3Npc190eXBlLCBzZXZlcml0eSwgaXNfcHJpbWFyeSwgZGlhZ25vc2VkX2J5LCBub3RlcylcbiAgICAgVkFMVUVTICg/LD8sPyw/LD8sPyw/LD8sPyw/LD8pYCxcbiAgICBbXG4gICAgICBpZCwgdmlzaXRJZCwgKHZpc2l0IGFzIGFueSkucGF0aWVudF9pZCxcbiAgICAgIGJvZHkuaWNkMTBDb2RlID8/IG51bGwsIGJvZHkuaWNkMTBEZXNjcmlwdGlvbiA/PyBudWxsLFxuICAgICAgYm9keS5kaWFnbm9zaXNUZXh0LCBib2R5LmRpYWdub3Npc1R5cGUgPz8gJ3dvcmtpbmcnLFxuICAgICAgYm9keS5zZXZlcml0eSA/PyBudWxsLCBib2R5LmlzUHJpbWFyeSA/IDEgOiAwLCBzZXNzaW9uLnVzZXJJZCwgYm9keS5ub3RlcyA/PyBudWxsLFxuICAgIF0sXG4gICk7XG4gIHJldHVybiBjLmpzb24oeyBpZCB9LCAyMDEpO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gUFJFU0NSSVBUSU9OU1xuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5jb25zdCBwcmVzY3JpcHRpb25zID0gbmV3IEhvbm8oKTtcbnByZXNjcmlwdGlvbnMudXNlKCcqJywgcmVxdWlyZUF1dGgpO1xuXG5wcmVzY3JpcHRpb25zLnBvc3QoJy8nLCByZXF1aXJlUGVybWlzc2lvbigncGhhcm1hY3knLCAncHJlc2NyaXB0aW9ucycsICdjcmVhdGUnKSwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IGJvZHkgPSBhd2FpdCBjLnJlcS5qc29uKCk7XG5cbiAgY29uc3QgcnhOdW1iZXIgPSBnZW5lcmF0ZVNlcXVlbnRpYWxOdW1iZXIoZGIsICdSWCcsICdwcmVzY3JpcHRpb25zJywgJ3ByZXNjcmlwdGlvbl9udW1iZXInKTtcbiAgY29uc3QgcnhJZCA9IGdlbmVyYXRlSWQoKTtcblxuICBkYi50cmFuc2FjdGlvbigoKSA9PiB7XG4gICAgZGIucnVuKFxuICAgICAgYElOU0VSVCBJTlRPIHByZXNjcmlwdGlvbnMgKGlkLCBwcmVzY3JpcHRpb25fbnVtYmVyLCBicmFuY2hfaWQsIHBhdGllbnRfaWQsXG4gICAgICAgdmlzaXRfaWQsIHByZXNjcmliZWRfYnksIG5vdGVzKVxuICAgICAgIFZBTFVFUyAoPyw/LD8sPyw/LD8sPylgLFxuICAgICAgW1xuICAgICAgICByeElkLCByeE51bWJlciwgYm9keS5icmFuY2hJZCA/PyBzZXNzaW9uLmJyYW5jaElkLFxuICAgICAgICBib2R5LnBhdGllbnRJZCwgYm9keS52aXNpdElkID8/IG51bGwsIHNlc3Npb24udXNlcklkLCBib2R5Lm5vdGVzID8/IG51bGwsXG4gICAgICBdLFxuICAgICk7XG5cbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgYm9keS5pdGVtcyA/PyBbXSkge1xuICAgICAgZGIucnVuKFxuICAgICAgICBgSU5TRVJUIElOVE8gcHJlc2NyaXB0aW9uX2l0ZW1zIChpZCwgcHJlc2NyaXB0aW9uX2lkLCBkcnVnX2lkLCBkcnVnX25hbWUsXG4gICAgICAgICBkb3NlLCBmcmVxdWVuY3ksIHJvdXRlLCBkdXJhdGlvbl9kYXlzLCBxdWFudGl0eV9wcmVzY3JpYmVkLCBpbnN0cnVjdGlvbnMsIGluZGljYXRpb24pXG4gICAgICAgICBWQUxVRVMgKD8sPyw/LD8sPyw/LD8sPyw/LD8sPylgLFxuICAgICAgICBbXG4gICAgICAgICAgZ2VuZXJhdGVJZCgpLCByeElkLCBpdGVtLmRydWdJZCwgaXRlbS5kcnVnTmFtZSxcbiAgICAgICAgICBpdGVtLmRvc2UsIGl0ZW0uZnJlcXVlbmN5LCBpdGVtLnJvdXRlLFxuICAgICAgICAgIGl0ZW0uZHVyYXRpb25EYXlzID8/IG51bGwsIGl0ZW0ucXVhbnRpdHkgPz8gbnVsbCxcbiAgICAgICAgICBpdGVtLmluc3RydWN0aW9ucyA/PyBudWxsLCBpdGVtLmluZGljYXRpb24gPz8gbnVsbCxcbiAgICAgICAgXSxcbiAgICAgICk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBhdWRpdExvZ2dlci5sb2coe1xuICAgIHVzZXJJZDogc2Vzc2lvbi51c2VySWQsIGFjdGlvbjogJ1BSRVNDUklQVElPTl9DUkVBVEVEJywgbW9kdWxlOiAncGhhcm1hY3knLFxuICAgIHJlc291cmNlOiAncHJlc2NyaXB0aW9ucycsIHJlc291cmNlSWQ6IHJ4SWQsXG4gICAgbmV3VmFsdWVzOiB7IHJ4TnVtYmVyLCBwYXRpZW50SWQ6IGJvZHkucGF0aWVudElkLCBpdGVtQ291bnQ6IGJvZHkuaXRlbXM/Lmxlbmd0aCA/PyAwIH0sXG4gICAgc3RhdHVzOiAnc3VjY2VzcycsIHJpc2tMZXZlbDogJ21lZGl1bScsXG4gIH0pO1xuICByZXR1cm4gYy5qc29uKHsgaWQ6IHJ4SWQsIHJ4TnVtYmVyIH0sIDIwMSk7XG59KTtcblxucHJlc2NyaXB0aW9ucy5wb3N0KCcvOmlkL2Rpc3BlbnNlJywgcmVxdWlyZVBlcm1pc3Npb24oJ3BoYXJtYWN5JywgJ2Rpc3BlbnNpbmcnLCAnY3JlYXRlJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCByeElkID0gYy5yZXEucGFyYW0oJ2lkJyk7XG4gIGNvbnN0IGJvZHkgPSBhd2FpdCBjLnJlcS5qc29uKCk7IC8vIHsgaXRlbXM6IFt7IGl0ZW1JZCwgcXVhbnRpdHlEaXNwZW5zZWQsIGludmVudG9yeUlkIH1dIH1cblxuICBkYi50cmFuc2FjdGlvbigoKSA9PiB7XG4gICAgZm9yIChjb25zdCBpdGVtIG9mIGJvZHkuaXRlbXMgPz8gW10pIHtcbiAgICAgIC8vIFVwZGF0ZSBwcmVzY3JpcHRpb24gaXRlbVxuICAgICAgZGIucnVuKFxuICAgICAgICBgVVBEQVRFIHByZXNjcmlwdGlvbl9pdGVtcyBTRVQgcXVhbnRpdHlfZGlzcGVuc2VkID0gPywgaXNfZGlzcGVuc2VkID0gMSxcbiAgICAgICAgIGRpc3BlbnNlZF9ieSA9ID8sIGRpc3BlbnNlZF9hdCA9IGRhdGV0aW1lKCdub3cnKSBXSEVSRSBpZCA9ID9gLFxuICAgICAgICBbaXRlbS5xdWFudGl0eURpc3BlbnNlZCwgc2Vzc2lvbi51c2VySWQsIGl0ZW0uaXRlbUlkXSxcbiAgICAgICk7XG4gICAgICAvLyBEZWR1Y3QgZnJvbSBwaGFybWFjeSBpbnZlbnRvcnlcbiAgICAgIGRiLnJ1bihcbiAgICAgICAgYFVQREFURSBwaGFybWFjeV9pbnZlbnRvcnkgU0VUIHF1YW50aXR5X2luX3N0b2NrID0gcXVhbnRpdHlfaW5fc3RvY2sgLSA/LFxuICAgICAgICAgdXBkYXRlZF9hdCA9IGRhdGV0aW1lKCdub3cnKSBXSEVSRSBpZCA9ID9gLFxuICAgICAgICBbaXRlbS5xdWFudGl0eURpc3BlbnNlZCwgaXRlbS5pbnZlbnRvcnlJZF0sXG4gICAgICApO1xuICAgICAgLy8gUmVjb3JkIHRyYW5zYWN0aW9uXG4gICAgICBkYi5ydW4oXG4gICAgICAgIGBJTlNFUlQgSU5UTyBwaGFybWFjeV90cmFuc2FjdGlvbnMgKGlkLCBicmFuY2hfaWQsIGludmVudG9yeV9pZCwgdHJhbnNhY3Rpb25fdHlwZSxcbiAgICAgICAgIHF1YW50aXR5LCByZWZlcmVuY2VfaWQsIHJlZmVyZW5jZV90eXBlLCBwZXJmb3JtZWRfYnkpXG4gICAgICAgICBWQUxVRVMgKD8sPyw/LCdkaXNwZW5zaW5nJyw/LD8sPyw/KWAsXG4gICAgICAgIFtcbiAgICAgICAgICBnZW5lcmF0ZUlkKCksIHNlc3Npb24uYnJhbmNoSWQsIGl0ZW0uaW52ZW50b3J5SWQsXG4gICAgICAgICAgaXRlbS5xdWFudGl0eURpc3BlbnNlZCwgcnhJZCwgJ3ByZXNjcmlwdGlvbicsIHNlc3Npb24udXNlcklkLFxuICAgICAgICBdLFxuICAgICAgKTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgaWYgZnVsbHkgZGlzcGVuc2VkXG4gICAgY29uc3QgcGVuZGluZyA9IGRiLmNvdW50KCdwcmVzY3JpcHRpb25faXRlbXMnLCAncHJlc2NyaXB0aW9uX2lkID0gPyBBTkQgaXNfZGlzcGVuc2VkID0gMCcsIFtyeElkXSk7XG4gICAgZGIucnVuKFxuICAgICAgYFVQREFURSBwcmVzY3JpcHRpb25zIFNFVCBzdGF0dXMgPSA/IFdIRVJFIGlkID0gP2AsXG4gICAgICBbcGVuZGluZyA9PT0gMCA/ICdkaXNwZW5zZWQnIDogJ3BhcnRpYWwnLCByeElkXSxcbiAgICApO1xuICB9KTtcblxuICBhd2FpdCBhdWRpdExvZ2dlci5sb2coe1xuICAgIHVzZXJJZDogc2Vzc2lvbi51c2VySWQsIGFjdGlvbjogJ1BSRVNDUklQVElPTl9ESVNQRU5TRUQnLCBtb2R1bGU6ICdwaGFybWFjeScsXG4gICAgcmVzb3VyY2U6ICdwcmVzY3JpcHRpb25zJywgcmVzb3VyY2VJZDogcnhJZCwgc3RhdHVzOiAnc3VjY2VzcycsIHJpc2tMZXZlbDogJ21lZGl1bScsXG4gIH0pO1xuICByZXR1cm4gYy5qc29uKHsgc3VjY2VzczogdHJ1ZSB9KTtcbn0pO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIExBQk9SQVRPUllcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuY29uc3QgbGFiID0gbmV3IEhvbm8oKTtcbmxhYi51c2UoJyonLCByZXF1aXJlQXV0aCk7XG5cbmxhYi5nZXQoJy9jYXRhbG9nJywgcmVxdWlyZVBlcm1pc3Npb24oJ2xhYm9yYXRvcnknLCAnY2F0YWxvZycsICdyZWFkJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHsgY2F0ZWdvcnksIHEgfSA9IGMucmVxLnF1ZXJ5KCk7XG4gIGxldCB3aGVyZSA9ICdXSEVSRSBpc19hY3RpdmUgPSAxJztcbiAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyIHwgbnVsbClbXSA9IFtdO1xuICBpZiAoY2F0ZWdvcnkpIHsgd2hlcmUgKz0gJyBBTkQgY2F0ZWdvcnkgPSA/JzsgcGFyYW1zLnB1c2goY2F0ZWdvcnkpOyB9XG4gIGlmIChxKSB7IHdoZXJlICs9ICcgQU5EIChuYW1lIExJS0UgPyBPUiBjb2RlIExJS0UgPyknOyBwYXJhbXMucHVzaChgJSR7cX0lYCwgYCUke3F9JWApOyB9XG4gIGNvbnN0IGNhdGFsb2cgPSBkYi5xdWVyeShgU0VMRUNUICogRlJPTSBsYWJfdGVzdF9jYXRhbG9nICR7d2hlcmV9IE9SREVSIEJZIG5hbWVgLCBwYXJhbXMpO1xuICByZXR1cm4gYy5qc29uKHsgY2F0YWxvZzogY2F0YWxvZy5yb3dzIH0pO1xufSk7XG5cbmxhYi5wb3N0KCcvcmVxdWVzdHMnLCByZXF1aXJlUGVybWlzc2lvbignbGFib3JhdG9yeScsICdyZXF1ZXN0cycsICdjcmVhdGUnKSwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IGJvZHkgPSBhd2FpdCBjLnJlcS5qc29uKCk7XG5cbiAgY29uc3QgcmVxdWVzdE51bWJlciA9IGdlbmVyYXRlU2VxdWVudGlhbE51bWJlcihkYiwgJ0xBQicsICdsYWJfcmVxdWVzdHMnLCAncmVxdWVzdF9udW1iZXInKTtcbiAgY29uc3QgcmVxdWVzdElkID0gZ2VuZXJhdGVJZCgpO1xuXG4gIGRiLnRyYW5zYWN0aW9uKCgpID0+IHtcbiAgICBkYi5ydW4oXG4gICAgICBgSU5TRVJUIElOVE8gbGFiX3JlcXVlc3RzIChpZCwgcmVxdWVzdF9udW1iZXIsIGJyYW5jaF9pZCwgcGF0aWVudF9pZCxcbiAgICAgICB2aXNpdF9pZCwgcmVxdWVzdGVkX2J5LCB1cmdlbmN5LCBjbGluaWNhbF9pbmZvKVxuICAgICAgIFZBTFVFUyAoPyw/LD8sPyw/LD8sPyw/KWAsXG4gICAgICBbXG4gICAgICAgIHJlcXVlc3RJZCwgcmVxdWVzdE51bWJlciwgYm9keS5icmFuY2hJZCA/PyBzZXNzaW9uLmJyYW5jaElkLFxuICAgICAgICBib2R5LnBhdGllbnRJZCwgYm9keS52aXNpdElkID8/IG51bGwsIHNlc3Npb24udXNlcklkLFxuICAgICAgICBib2R5LnVyZ2VuY3kgPz8gJ3JvdXRpbmUnLCBib2R5LmNsaW5pY2FsSW5mbyA/PyBudWxsLFxuICAgICAgXSxcbiAgICApO1xuICAgIGZvciAoY29uc3QgdGVzdElkIG9mIGJvZHkudGVzdElkcyA/PyBbXSkge1xuICAgICAgZGIucnVuKFxuICAgICAgICBgSU5TRVJUIElOVE8gbGFiX3JlcXVlc3RfaXRlbXMgKGlkLCByZXF1ZXN0X2lkLCB0ZXN0X2lkKSBWQUxVRVMgKD8sPyw/KWAsXG4gICAgICAgIFtnZW5lcmF0ZUlkKCksIHJlcXVlc3RJZCwgdGVzdElkXSxcbiAgICAgICk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBhdWRpdExvZ2dlci5sb2coe1xuICAgIHVzZXJJZDogc2Vzc2lvbi51c2VySWQsIGFjdGlvbjogJ0xBQl9SRVFVRVNUX0NSRUFURUQnLCBtb2R1bGU6ICdsYWJvcmF0b3J5JyxcbiAgICByZXNvdXJjZTogJ2xhYl9yZXF1ZXN0cycsIHJlc291cmNlSWQ6IHJlcXVlc3RJZCxcbiAgICBuZXdWYWx1ZXM6IHsgcmVxdWVzdE51bWJlciwgdGVzdHM6IGJvZHkudGVzdElkcz8ubGVuZ3RoID8/IDAgfSxcbiAgICBzdGF0dXM6ICdzdWNjZXNzJywgcmlza0xldmVsOiAnbG93JyxcbiAgfSk7XG4gIHJldHVybiBjLmpzb24oeyBpZDogcmVxdWVzdElkLCByZXF1ZXN0TnVtYmVyIH0sIDIwMSk7XG59KTtcblxubGFiLnBvc3QoJy9yZXF1ZXN0cy86aWQvcmVzdWx0cycsIHJlcXVpcmVQZXJtaXNzaW9uKCdsYWJvcmF0b3J5JywgJ3Jlc3VsdHMnLCAnY3JlYXRlJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCByZXF1ZXN0SWQgPSBjLnJlcS5wYXJhbSgnaWQnKTtcbiAgY29uc3QgYm9keSA9IGF3YWl0IGMucmVxLmpzb24oKTsgLy8geyByZXN1bHRzOiBbeyBpdGVtSWQsIHZhbHVlLCBmbGFnLCBub3RlcyB9XSB9XG5cbiAgZGIudHJhbnNhY3Rpb24oKCkgPT4ge1xuICAgIGZvciAoY29uc3QgcmVzdWx0IG9mIGJvZHkucmVzdWx0cyA/PyBbXSkge1xuICAgICAgZGIucnVuKFxuICAgICAgICBgVVBEQVRFIGxhYl9yZXF1ZXN0X2l0ZW1zIFNFVCByZXN1bHRfdmFsdWUgPSA/LCByZXN1bHRfZmxhZyA9ID8sXG4gICAgICAgICByZXN1bHRfbm90ZXMgPSA/LCBzdGF0dXMgPSAncmVzdWx0ZWQnLCByZXN1bHRlZF9ieSA9ID8sIHJlc3VsdGVkX2F0ID0gZGF0ZXRpbWUoJ25vdycpXG4gICAgICAgICBXSEVSRSBpZCA9ID9gLFxuICAgICAgICBbcmVzdWx0LnZhbHVlLCByZXN1bHQuZmxhZyA/PyAnbm9ybWFsJywgcmVzdWx0Lm5vdGVzID8/IG51bGwsIHNlc3Npb24udXNlcklkLCByZXN1bHQuaXRlbUlkXSxcbiAgICAgICk7XG4gICAgfVxuICAgIGRiLnJ1bihcbiAgICAgIGBVUERBVEUgbGFiX3JlcXVlc3RzIFNFVCBzdGF0dXMgPSAncmVzdWx0ZWQnLCByZXN1bHRlZF9hdCA9IGRhdGV0aW1lKCdub3cnKSBXSEVSRSBpZCA9ID9gLFxuICAgICAgW3JlcXVlc3RJZF0sXG4gICAgKTtcbiAgfSk7XG5cbiAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICB1c2VySWQ6IHNlc3Npb24udXNlcklkLCBhY3Rpb246ICdMQUJfUkVTVUxUX0VOVEVSRUQnLCBtb2R1bGU6ICdsYWJvcmF0b3J5JyxcbiAgICByZXNvdXJjZTogJ2xhYl9yZXF1ZXN0cycsIHJlc291cmNlSWQ6IHJlcXVlc3RJZCwgc3RhdHVzOiAnc3VjY2VzcycsIHJpc2tMZXZlbDogJ21lZGl1bScsXG4gIH0pO1xuICByZXR1cm4gYy5qc29uKHsgc3VjY2VzczogdHJ1ZSB9KTtcbn0pO1xuXG5sYWIucG9zdCgnL3JlcXVlc3RzLzppZC92ZXJpZnknLCByZXF1aXJlUGVybWlzc2lvbignbGFib3JhdG9yeScsICdyZXN1bHRzJywgJ2FwcHJvdmUnKSwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IHJlcXVlc3RJZCA9IGMucmVxLnBhcmFtKCdpZCcpO1xuXG4gIGRiLnJ1bihcbiAgICBgVVBEQVRFIGxhYl9yZXF1ZXN0cyBTRVQgc3RhdHVzID0gJ3ZlcmlmaWVkJywgdmVyaWZpZWRfYnkgPSA/LCB2ZXJpZmllZF9hdCA9IGRhdGV0aW1lKCdub3cnKSBXSEVSRSBpZCA9ID9gLFxuICAgIFtzZXNzaW9uLnVzZXJJZCwgcmVxdWVzdElkXSxcbiAgKTtcbiAgZGIucnVuKFxuICAgIGBVUERBVEUgbGFiX3JlcXVlc3RfaXRlbXMgU0VUIHN0YXR1cyA9ICdyZXN1bHRlZCcgV0hFUkUgcmVxdWVzdF9pZCA9ID8gQU5EIHN0YXR1cyA9ICdwcm9jZXNzaW5nJ2AsXG4gICAgW3JlcXVlc3RJZF0sXG4gICk7XG5cbiAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICB1c2VySWQ6IHNlc3Npb24udXNlcklkLCBhY3Rpb246ICdMQUJfUkVTVUxUX1ZFUklGSUVEJywgbW9kdWxlOiAnbGFib3JhdG9yeScsXG4gICAgcmVzb3VyY2U6ICdsYWJfcmVxdWVzdHMnLCByZXNvdXJjZUlkOiByZXF1ZXN0SWQsIHN0YXR1czogJ3N1Y2Nlc3MnLCByaXNrTGV2ZWw6ICdtZWRpdW0nLFxuICB9KTtcbiAgcmV0dXJuIGMuanNvbih7IHN1Y2Nlc3M6IHRydWUgfSk7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBCSUxMSU5HXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmNvbnN0IGJpbGxpbmcgPSBuZXcgSG9ubygpO1xuYmlsbGluZy51c2UoJyonLCByZXF1aXJlQXV0aCk7XG5cbmJpbGxpbmcucG9zdCgnL2ludm9pY2VzJywgcmVxdWlyZVBlcm1pc3Npb24oJ2ZpbmFuY2UnLCAnaW52b2ljZXMnLCAnY3JlYXRlJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCBib2R5ID0gYXdhaXQgYy5yZXEuanNvbigpO1xuXG4gIGNvbnN0IGludm9pY2VOdW1iZXIgPSBnZW5lcmF0ZVNlcXVlbnRpYWxOdW1iZXIoZGIsICdJTlYnLCAnaW52b2ljZXMnLCAnaW52b2ljZV9udW1iZXInKTtcbiAgY29uc3QgaW52b2ljZUlkID0gZ2VuZXJhdGVJZCgpO1xuXG4gIGxldCBzdWJ0b3RhbCA9IDA7XG4gIGNvbnN0IHByb2Nlc3NlZEl0ZW1zOiBhbnlbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGl0ZW0gb2YgYm9keS5pdGVtcyA/PyBbXSkge1xuICAgIGNvbnN0IGxpbmVUb3RhbCA9IGl0ZW0ucXVhbnRpdHkgKiBpdGVtLnVuaXRQcmljZSAtIChpdGVtLmRpc2NvdW50QW1vdW50ID8/IDApO1xuICAgIHN1YnRvdGFsICs9IGxpbmVUb3RhbDtcbiAgICBwcm9jZXNzZWRJdGVtcy5wdXNoKHsgLi4uaXRlbSwgbGluZVRvdGFsIH0pO1xuICB9XG5cbiAgY29uc3QgZGlzY291bnRBbW91bnQgPSBib2R5LmRpc2NvdW50QW1vdW50ID8/IDA7XG4gIGNvbnN0IHRheEFtb3VudCA9IChzdWJ0b3RhbCAtIGRpc2NvdW50QW1vdW50KSAqIChib2R5LnRheFJhdGUgPz8gMCk7XG4gIGNvbnN0IHRvdGFsID0gc3VidG90YWwgLSBkaXNjb3VudEFtb3VudCArIHRheEFtb3VudDtcblxuICBkYi50cmFuc2FjdGlvbigoKSA9PiB7XG4gICAgZGIucnVuKFxuICAgICAgYElOU0VSVCBJTlRPIGludm9pY2VzIChpZCwgaW52b2ljZV9udW1iZXIsIGJyYW5jaF9pZCwgcGF0aWVudF9pZCxcbiAgICAgICB2aXNpdF9pZCwgYWRtaXNzaW9uX2lkLCBwYXltZW50X3R5cGUsIGluc3VyYW5jZV9wcm92aWRlcixcbiAgICAgICBzdWJ0b3RhbCwgZGlzY291bnRfYW1vdW50LCB0YXhfYW1vdW50LCB0b3RhbF9hbW91bnQsIGJhbGFuY2VfZHVlLFxuICAgICAgIG5vdGVzLCBjcmVhdGVkX2J5LCBkdWVfZGF0ZSlcbiAgICAgICBWQUxVRVMgKD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8pYCxcbiAgICAgIFtcbiAgICAgICAgaW52b2ljZUlkLCBpbnZvaWNlTnVtYmVyLCBib2R5LmJyYW5jaElkID8/IHNlc3Npb24uYnJhbmNoSWQsXG4gICAgICAgIGJvZHkucGF0aWVudElkLCBib2R5LnZpc2l0SWQgPz8gbnVsbCwgYm9keS5hZG1pc3Npb25JZCA/PyBudWxsLFxuICAgICAgICBib2R5LnBheW1lbnRUeXBlID8/ICdjYXNoJywgYm9keS5pbnN1cmFuY2VQcm92aWRlciA/PyBudWxsLFxuICAgICAgICBzdWJ0b3RhbCwgZGlzY291bnRBbW91bnQsIHRheEFtb3VudCwgdG90YWwsIHRvdGFsLFxuICAgICAgICBib2R5Lm5vdGVzID8/IG51bGwsIHNlc3Npb24udXNlcklkLFxuICAgICAgICBib2R5LmR1ZURhdGUgPz8gbnVsbCxcbiAgICAgIF0sXG4gICAgKTtcbiAgICBmb3IgKGNvbnN0IGl0ZW0gb2YgcHJvY2Vzc2VkSXRlbXMpIHtcbiAgICAgIGRiLnJ1bihcbiAgICAgICAgYElOU0VSVCBJTlRPIGludm9pY2VfaXRlbXMgKGlkLCBpbnZvaWNlX2lkLCBjYXRhbG9nX2l0ZW1faWQsIGRlc2NyaXB0aW9uLFxuICAgICAgICAgY2F0ZWdvcnksIHF1YW50aXR5LCB1bml0X3ByaWNlLCBkaXNjb3VudF9hbW91bnQsIHRheF9hbW91bnQsIGxpbmVfdG90YWwsXG4gICAgICAgICBpc19pbnN1cmFuY2VfY292ZXJlZCwgaW5zdXJhbmNlX2Ftb3VudCwgcGF0aWVudF9hbW91bnQsIHJlZmVyZW5jZV9pZCwgcmVmZXJlbmNlX3R5cGUpXG4gICAgICAgICBWQUxVRVMgKD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/KWAsXG4gICAgICAgIFtcbiAgICAgICAgICBnZW5lcmF0ZUlkKCksIGludm9pY2VJZCwgaXRlbS5jYXRhbG9nSXRlbUlkID8/IG51bGwsXG4gICAgICAgICAgaXRlbS5kZXNjcmlwdGlvbiwgaXRlbS5jYXRlZ29yeSwgaXRlbS5xdWFudGl0eSwgaXRlbS51bml0UHJpY2UsXG4gICAgICAgICAgaXRlbS5kaXNjb3VudEFtb3VudCA/PyAwLCBpdGVtLnRheEFtb3VudCA/PyAwLCBpdGVtLmxpbmVUb3RhbCxcbiAgICAgICAgICBpdGVtLmlzSW5zdXJhbmNlQ292ZXJlZCA/IDEgOiAwLCBpdGVtLmluc3VyYW5jZUFtb3VudCA/PyAwLFxuICAgICAgICAgIGl0ZW0ucGF0aWVudEFtb3VudCA/PyBpdGVtLmxpbmVUb3RhbCwgaXRlbS5yZWZlcmVuY2VJZCA/PyBudWxsLCBpdGVtLnJlZmVyZW5jZVR5cGUgPz8gbnVsbCxcbiAgICAgICAgXSxcbiAgICAgICk7XG4gICAgfVxuICB9KTtcblxuICBhd2FpdCBhdWRpdExvZ2dlci5sb2coe1xuICAgIHVzZXJJZDogc2Vzc2lvbi51c2VySWQsIGFjdGlvbjogJ0lOVk9JQ0VfQ1JFQVRFRCcsIG1vZHVsZTogJ2ZpbmFuY2UnLFxuICAgIHJlc291cmNlOiAnaW52b2ljZXMnLCByZXNvdXJjZUlkOiBpbnZvaWNlSWQsXG4gICAgbmV3VmFsdWVzOiB7IGludm9pY2VOdW1iZXIsIHRvdGFsLCBwYXRpZW50SWQ6IGJvZHkucGF0aWVudElkIH0sXG4gICAgc3RhdHVzOiAnc3VjY2VzcycsIHJpc2tMZXZlbDogJ21lZGl1bScsXG4gIH0pO1xuICByZXR1cm4gYy5qc29uKHsgaWQ6IGludm9pY2VJZCwgaW52b2ljZU51bWJlciwgdG90YWwgfSwgMjAxKTtcbn0pO1xuXG5iaWxsaW5nLnBvc3QoJy9pbnZvaWNlcy86aWQvcGF5bWVudCcsIHJlcXVpcmVQZXJtaXNzaW9uKCdmaW5hbmNlJywgJ3BheW1lbnRzJywgJ2NyZWF0ZScpLCBhc3luYyAoYykgPT4ge1xuICBjb25zdCBzZXNzaW9uID0gYy5nZXQoJ3Nlc3Npb24nKTtcbiAgY29uc3QgaW52b2ljZUlkID0gYy5yZXEucGFyYW0oJ2lkJyk7XG4gIGNvbnN0IGJvZHkgPSBhd2FpdCBjLnJlcS5qc29uKCk7XG5cbiAgY29uc3QgaW52b2ljZSA9IGRiLmZpbmRPbmU8eyBwYXRpZW50X2lkOiBzdHJpbmc7IHRvdGFsX2Ftb3VudDogbnVtYmVyOyBiYWxhbmNlX2R1ZTogbnVtYmVyIH0+KFxuICAgIGBTRUxFQ1QgcGF0aWVudF9pZCwgdG90YWxfYW1vdW50LCBiYWxhbmNlX2R1ZSBGUk9NIGludm9pY2VzIFdIRVJFIGlkID0gP2AsXG4gICAgW2ludm9pY2VJZF0sXG4gICk7XG4gIGlmICghaW52b2ljZSkgcmV0dXJuIGMuanNvbih7IGVycm9yOiAnSW52b2ljZSBub3QgZm91bmQnIH0sIDQwNCk7XG4gIGlmIChib2R5LmFtb3VudCA+IGludm9pY2UuYmFsYW5jZV9kdWUgKyAwLjAxKSB7XG4gICAgcmV0dXJuIGMuanNvbih7IGVycm9yOiAnUGF5bWVudCBleGNlZWRzIGJhbGFuY2UgZHVlJyB9LCA0MDApO1xuICB9XG5cbiAgY29uc3QgcmVjZWlwdE51bWJlciA9IGdlbmVyYXRlU2VxdWVudGlhbE51bWJlcihkYiwgJ1JDUCcsICdwYXltZW50cycsICdyZWNlaXB0X251bWJlcicpO1xuICBjb25zdCBwYXltZW50SWQgPSBnZW5lcmF0ZUlkKCk7XG5cbiAgZGIucnVuKFxuICAgIGBJTlNFUlQgSU5UTyBwYXltZW50cyAoaWQsIHBheW1lbnRfbnVtYmVyLCBicmFuY2hfaWQsIGludm9pY2VfaWQsIHBhdGllbnRfaWQsXG4gICAgIGFtb3VudCwgcGF5bWVudF9tZXRob2QsIG1wZXNhX3RyYW5zYWN0aW9uX2lkLCBjYXJkX2xhc3RfZm91ciwgYmFua19yZWZlcmVuY2UsXG4gICAgIHJlY2VpcHRfbnVtYmVyLCBjYXNoaWVyX2lkLCBub3RlcylcbiAgICAgVkFMVUVTICg/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/KWAsXG4gICAgW1xuICAgICAgcGF5bWVudElkLCByZWNlaXB0TnVtYmVyLCBzZXNzaW9uLmJyYW5jaElkLCBpbnZvaWNlSWQsIGludm9pY2UucGF0aWVudF9pZCxcbiAgICAgIGJvZHkuYW1vdW50LCBib2R5LnBheW1lbnRNZXRob2QsIGJvZHkubXBlc2FUcmFuc2FjdGlvbklkID8/IG51bGwsXG4gICAgICBib2R5LmNhcmRMYXN0Rm91ciA/PyBudWxsLCBib2R5LmJhbmtSZWZlcmVuY2UgPz8gbnVsbCxcbiAgICAgIHJlY2VpcHROdW1iZXIsIHNlc3Npb24udXNlcklkLCBib2R5Lm5vdGVzID8/IG51bGwsXG4gICAgXSxcbiAgKTtcbiAgLy8gVHJpZ2dlciBoYW5kbGVzIGludm9pY2UgYmFsYW5jZSB1cGRhdGVcblxuICBhd2FpdCBhdWRpdExvZ2dlci5sb2coe1xuICAgIHVzZXJJZDogc2Vzc2lvbi51c2VySWQsIGFjdGlvbjogJ1BBWU1FTlRfUkVDRUlWRUQnLCBtb2R1bGU6ICdmaW5hbmNlJyxcbiAgICByZXNvdXJjZTogJ3BheW1lbnRzJywgcmVzb3VyY2VJZDogcGF5bWVudElkLFxuICAgIG5ld1ZhbHVlczogeyBhbW91bnQ6IGJvZHkuYW1vdW50LCBtZXRob2Q6IGJvZHkucGF5bWVudE1ldGhvZCwgcmVjZWlwdE51bWJlciB9LFxuICAgIHN0YXR1czogJ3N1Y2Nlc3MnLCByaXNrTGV2ZWw6ICdtZWRpdW0nLFxuICB9KTtcbiAgcmV0dXJuIGMuanNvbih7IGlkOiBwYXltZW50SWQsIHJlY2VpcHROdW1iZXIgfSwgMjAxKTtcbn0pO1xuXG5iaWxsaW5nLnBvc3QoJy9pbnZvaWNlcy86aWQvdm9pZCcsIHJlcXVpcmVQZXJtaXNzaW9uKCdmaW5hbmNlJywgJ2ludm9pY2VzJywgJ3ZvaWQnKSwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IGludm9pY2VJZCA9IGMucmVxLnBhcmFtKCdpZCcpO1xuICBjb25zdCB7IHJlYXNvbiB9ID0gYXdhaXQgYy5yZXEuanNvbigpO1xuXG4gIGNvbnN0IGludm9pY2UgPSBkYi5maW5kT25lKGBTRUxFQ1QgKiBGUk9NIGludm9pY2VzIFdIRVJFIGlkID0gP2AsIFtpbnZvaWNlSWRdKTtcbiAgaWYgKCFpbnZvaWNlKSByZXR1cm4gYy5qc29uKHsgZXJyb3I6ICdJbnZvaWNlIG5vdCBmb3VuZCcgfSwgNDA0KTtcbiAgaWYgKChpbnZvaWNlIGFzIGFueSkuc3RhdHVzID09PSAndm9pZGVkJykgcmV0dXJuIGMuanNvbih7IGVycm9yOiAnQWxyZWFkeSB2b2lkZWQnIH0sIDQwMCk7XG5cbiAgZGIucnVuKFxuICAgIGBVUERBVEUgaW52b2ljZXMgU0VUIHN0YXR1cyA9ICd2b2lkZWQnLCB2b2lkZWRfYnkgPSA/LCB2b2lkX3JlYXNvbiA9ID8sXG4gICAgIHVwZGF0ZWRfYXQgPSBkYXRldGltZSgnbm93JykgV0hFUkUgaWQgPSA/YCxcbiAgICBbc2Vzc2lvbi51c2VySWQsIHJlYXNvbiwgaW52b2ljZUlkXSxcbiAgKTtcblxuICBhd2FpdCBhdWRpdExvZ2dlci5sb2coe1xuICAgIHVzZXJJZDogc2Vzc2lvbi51c2VySWQsIGFjdGlvbjogJ0lOVk9JQ0VfVk9JREVEJywgbW9kdWxlOiAnZmluYW5jZScsXG4gICAgcmVzb3VyY2U6ICdpbnZvaWNlcycsIHJlc291cmNlSWQ6IGludm9pY2VJZCxcbiAgICBwcmV2aW91c1ZhbHVlczogeyBzdGF0dXM6IChpbnZvaWNlIGFzIGFueSkuc3RhdHVzIH0sXG4gICAgbmV3VmFsdWVzOiB7IHN0YXR1czogJ3ZvaWRlZCcsIHJlYXNvbiB9LFxuICAgIHN0YXR1czogJ3N1Y2Nlc3MnLCByaXNrTGV2ZWw6ICdoaWdoJyxcbiAgfSk7XG4gIHJldHVybiBjLmpzb24oeyBzdWNjZXNzOiB0cnVlIH0pO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gQURNSVNTSU9OUyAoSVBEKVxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5jb25zdCBhZG1pc3Npb25zID0gbmV3IEhvbm8oKTtcbmFkbWlzc2lvbnMudXNlKCcqJywgcmVxdWlyZUF1dGgpO1xuXG5hZG1pc3Npb25zLmdldCgnL2JlZHMnLCByZXF1aXJlUGVybWlzc2lvbignY2xpbmljYWwnLCAnYmVkcycsICdyZWFkJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHsgd2FyZElkLCBzdGF0dXMgfSA9IGMucmVxLnF1ZXJ5KCk7XG4gIGxldCB3aGVyZSA9ICdXSEVSRSAxPTEnO1xuICBjb25zdCBwYXJhbXM6IChzdHJpbmcgfCBudW1iZXIgfCBudWxsKVtdID0gW107XG4gIGlmICh3YXJkSWQpIHsgd2hlcmUgKz0gJyBBTkQgYi53YXJkX2lkID0gPyc7IHBhcmFtcy5wdXNoKHdhcmRJZCk7IH1cbiAgaWYgKHN0YXR1cykgeyB3aGVyZSArPSAnIEFORCBiLnN0YXR1cyA9ID8nOyBwYXJhbXMucHVzaChzdGF0dXMpOyB9XG4gIGNvbnN0IGJlZHMgPSBkYi5xdWVyeShcbiAgICBgU0VMRUNUIGIuKiwgdy5uYW1lIGFzIHdhcmRfbmFtZSwgdy50eXBlIGFzIHdhcmRfdHlwZSxcbiAgICAgICAgICAgIHAuZmlyc3RfbmFtZSB8fCAnICcgfHwgcC5sYXN0X25hbWUgYXMgY3VycmVudF9wYXRpZW50XG4gICAgIEZST00gYmVkcyBiIEpPSU4gd2FyZHMgdyBPTiB3LmlkID0gYi53YXJkX2lkXG4gICAgIExFRlQgSk9JTiBhZG1pc3Npb25zIGEgT04gYS5iZWRfaWQgPSBiLmlkIEFORCBhLnN0YXR1cyA9ICdhY3RpdmUnXG4gICAgIExFRlQgSk9JTiBwYXRpZW50cyBwIE9OIHAuaWQgPSBhLnBhdGllbnRfaWRcbiAgICAgJHt3aGVyZX0gT1JERVIgQlkgdy5uYW1lLCBiLmJlZF9udW1iZXJgLFxuICAgIHBhcmFtcyxcbiAgKTtcbiAgcmV0dXJuIGMuanNvbih7IGJlZHM6IGJlZHMucm93cyB9KTtcbn0pO1xuXG5hZG1pc3Npb25zLnBvc3QoJy8nLCByZXF1aXJlUGVybWlzc2lvbignY2xpbmljYWwnLCAnYWRtaXNzaW9ucycsICdjcmVhdGUnKSwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IGJvZHkgPSBhd2FpdCBjLnJlcS5qc29uKCk7XG5cbiAgY29uc3QgYWRtaXNzaW9uTnVtYmVyID0gZ2VuZXJhdGVTZXF1ZW50aWFsTnVtYmVyKGRiLCAnQURNJywgJ2FkbWlzc2lvbnMnLCAnYWRtaXNzaW9uX251bWJlcicpO1xuICBjb25zdCBpZCA9IGdlbmVyYXRlSWQoKTtcblxuICAvLyBWZXJpZnkgYmVkIGlzIGF2YWlsYWJsZVxuICBjb25zdCBiZWQgPSBkYi5maW5kT25lPHsgc3RhdHVzOiBzdHJpbmcgfT4oXG4gICAgYFNFTEVDVCBzdGF0dXMgRlJPTSBiZWRzIFdIRVJFIGlkID0gP2AsIFtib2R5LmJlZElkXSxcbiAgKTtcbiAgaWYgKCFiZWQgfHwgYmVkLnN0YXR1cyAhPT0gJ2F2YWlsYWJsZScpIHtcbiAgICByZXR1cm4gYy5qc29uKHsgZXJyb3I6ICdCZWQgaXMgbm90IGF2YWlsYWJsZScgfSwgNDAwKTtcbiAgfVxuXG4gIGRiLnJ1bihcbiAgICBgSU5TRVJUIElOVE8gYWRtaXNzaW9ucyAoaWQsIGFkbWlzc2lvbl9udW1iZXIsIGJyYW5jaF9pZCwgcGF0aWVudF9pZCwgdmlzaXRfaWQsXG4gICAgIHdhcmRfaWQsIGJlZF9pZCwgYWRtaXR0aW5nX2RvY3Rvcl9pZCwgYWRtaXR0aW5nX2RpYWdub3NpcywgYWRtaXNzaW9uX3R5cGUsXG4gICAgIGV4cGVjdGVkX2Rpc2NoYXJnZSwgbm90ZXMpXG4gICAgIFZBTFVFUyAoPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8pYCxcbiAgICBbXG4gICAgICBpZCwgYWRtaXNzaW9uTnVtYmVyLCBib2R5LmJyYW5jaElkID8/IHNlc3Npb24uYnJhbmNoSWQsXG4gICAgICBib2R5LnBhdGllbnRJZCwgYm9keS52aXNpdElkLCBib2R5LndhcmRJZCwgYm9keS5iZWRJZCxcbiAgICAgIGJvZHkuZG9jdG9ySWQgPz8gc2Vzc2lvbi51c2VySWQsIGJvZHkuYWRtaXR0aW5nRGlhZ25vc2lzLFxuICAgICAgYm9keS5hZG1pc3Npb25UeXBlID8/ICdlbGVjdGl2ZScsIGJvZHkuZXhwZWN0ZWREaXNjaGFyZ2UgPz8gbnVsbCwgYm9keS5ub3RlcyA/PyBudWxsLFxuICAgIF0sXG4gICk7XG4gIC8vIFVwZGF0ZSB2aXNpdCBzdGF0dXNcbiAgZGIucnVuKGBVUERBVEUgdmlzaXRzIFNFVCBzdGF0dXMgPSAnYWRtaXR0ZWQnLCBhZG1pc3Npb25faWQgPSA/IFdIRVJFIGlkID0gP2AsIFtpZCwgYm9keS52aXNpdElkXSk7XG5cbiAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICB1c2VySWQ6IHNlc3Npb24udXNlcklkLCBhY3Rpb246ICdBRE1JU1NJT05fQ1JFQVRFRCcsIG1vZHVsZTogJ2NsaW5pY2FsJyxcbiAgICByZXNvdXJjZTogJ2FkbWlzc2lvbnMnLCByZXNvdXJjZUlkOiBpZCxcbiAgICBuZXdWYWx1ZXM6IHsgYWRtaXNzaW9uTnVtYmVyLCBwYXRpZW50SWQ6IGJvZHkucGF0aWVudElkLCBiZWRJZDogYm9keS5iZWRJZCB9LFxuICAgIHN0YXR1czogJ3N1Y2Nlc3MnLCByaXNrTGV2ZWw6ICdtZWRpdW0nLFxuICB9KTtcbiAgcmV0dXJuIGMuanNvbih7IGlkLCBhZG1pc3Npb25OdW1iZXIgfSwgMjAxKTtcbn0pO1xuXG5hZG1pc3Npb25zLnBvc3QoJy86aWQvZGlzY2hhcmdlJywgcmVxdWlyZVBlcm1pc3Npb24oJ2NsaW5pY2FsJywgJ2FkbWlzc2lvbnMnLCAndXBkYXRlJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCBhZG1pc3Npb25JZCA9IGMucmVxLnBhcmFtKCdpZCcpO1xuICBjb25zdCBib2R5ID0gYXdhaXQgYy5yZXEuanNvbigpO1xuXG4gIGNvbnN0IGFkbWlzc2lvbiA9IGRiLmZpbmRPbmUoYFNFTEVDVCAqIEZST00gYWRtaXNzaW9ucyBXSEVSRSBpZCA9ID9gLCBbYWRtaXNzaW9uSWRdKTtcbiAgaWYgKCFhZG1pc3Npb24pIHJldHVybiBjLmpzb24oeyBlcnJvcjogJ0FkbWlzc2lvbiBub3QgZm91bmQnIH0sIDQwNCk7XG5cbiAgY29uc3QgbG9zID0gTWF0aC5jZWlsKFxuICAgIChEYXRlLm5vdygpIC0gbmV3IERhdGUoKGFkbWlzc2lvbiBhcyBhbnkpLmFkbWlzc2lvbl9kYXRldGltZSkuZ2V0VGltZSgpKSAvIDg2XzQwMF8wMDAsXG4gICk7XG5cbiAgZGIucnVuKFxuICAgIGBVUERBVEUgYWRtaXNzaW9ucyBTRVQgc3RhdHVzID0gPywgYWN0dWFsX2Rpc2NoYXJnZSA9IGRhdGV0aW1lKCdub3cnKSxcbiAgICAgZGlzY2hhcmdlX2RvY3Rvcl9pZCA9ID8sIGRpc2NoYXJnZV9kaWFnbm9zaXMgPSA/LFxuICAgICBkaXNjaGFyZ2VfY29uZGl0aW9uID0gPywgZGlzY2hhcmdlX3N1bW1hcnkgPSA/LFxuICAgICBsZW5ndGhfb2Zfc3RheSA9ID8sIHVwZGF0ZWRfYXQgPSBkYXRldGltZSgnbm93JylcbiAgICAgV0hFUkUgaWQgPSA/YCxcbiAgICBbXG4gICAgICBib2R5LnRyYW5zZmVyVG8gPyAndHJhbnNmZXJyZWQnIDogJ2Rpc2NoYXJnZWQnLFxuICAgICAgc2Vzc2lvbi51c2VySWQsIGJvZHkuZGlzY2hhcmdlRGlhZ25vc2lzID8/IG51bGwsXG4gICAgICBib2R5LmRpc2NoYXJnZUNvbmRpdGlvbiwgYm9keS5kaXNjaGFyZ2VTdW1tYXJ5ID8/IG51bGwsXG4gICAgICBsb3MsIGFkbWlzc2lvbklkLFxuICAgIF0sXG4gICk7XG4gIGRiLnJ1bihcbiAgICBgVVBEQVRFIHZpc2l0cyBTRVQgc3RhdHVzID0gJ2Rpc2NoYXJnZWQnLCBjaGVja19vdXRfdGltZSA9IGRhdGV0aW1lKCdub3cnKSxcbiAgICAgZGlzY2hhcmdlX2NvbmRpdGlvbiA9ID8sIGZvbGxvd191cF9kYXRlID0gPywgZm9sbG93X3VwX2luc3RydWN0aW9ucyA9ID9cbiAgICAgV0hFUkUgaWQgPSA/YCxcbiAgICBbXG4gICAgICBib2R5LmRpc2NoYXJnZUNvbmRpdGlvbiwgYm9keS5mb2xsb3dVcERhdGUgPz8gbnVsbCxcbiAgICAgIGJvZHkuZm9sbG93VXBJbnN0cnVjdGlvbnMgPz8gbnVsbCwgKGFkbWlzc2lvbiBhcyBhbnkpLnZpc2l0X2lkLFxuICAgIF0sXG4gICk7XG5cbiAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICB1c2VySWQ6IHNlc3Npb24udXNlcklkLCBhY3Rpb246ICdQQVRJRU5UX0RJU0NIQVJHRUQnLCBtb2R1bGU6ICdjbGluaWNhbCcsXG4gICAgcmVzb3VyY2U6ICdhZG1pc3Npb25zJywgcmVzb3VyY2VJZDogYWRtaXNzaW9uSWQsXG4gICAgbmV3VmFsdWVzOiB7IGNvbmRpdGlvbjogYm9keS5kaXNjaGFyZ2VDb25kaXRpb24sIGxvcyB9LFxuICAgIHN0YXR1czogJ3N1Y2Nlc3MnLCByaXNrTGV2ZWw6ICdtZWRpdW0nLFxuICB9KTtcbiAgcmV0dXJuIGMuanNvbih7IHN1Y2Nlc3M6IHRydWUsIGxlbmd0aE9mU3RheTogbG9zIH0pO1xufSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gQVBQT0lOVE1FTlRTXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmNvbnN0IGFwcG9pbnRtZW50cyA9IG5ldyBIb25vKCk7XG5hcHBvaW50bWVudHMudXNlKCcqJywgcmVxdWlyZUF1dGgpO1xuXG5hcHBvaW50bWVudHMuZ2V0KCcvJywgcmVxdWlyZVBlcm1pc3Npb24oJ2NsaW5pY2FsJywgJ2FwcG9pbnRtZW50cycsICdyZWFkJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCB7IGRhdGUsIGRvY3RvcklkLCBzdGF0dXMsIHBhZ2UgPSAnMScsIHBhZ2VTaXplID0gJzI1JyB9ID0gYy5yZXEucXVlcnkoKTtcblxuICBsZXQgd2hlcmUgPSAnV0hFUkUgMT0xJztcbiAgY29uc3QgcGFyYW1zOiAoc3RyaW5nIHwgbnVtYmVyIHwgbnVsbClbXSA9IFtdO1xuICBpZiAoc2Vzc2lvbi5icmFuY2hJZCkgeyB3aGVyZSArPSAnIEFORCBhLmJyYW5jaF9pZCA9ID8nOyBwYXJhbXMucHVzaChzZXNzaW9uLmJyYW5jaElkKTsgfVxuICBpZiAoZGF0ZSkgeyB3aGVyZSArPSAnIEFORCBhLmFwcG9pbnRtZW50X2RhdGUgPSA/JzsgcGFyYW1zLnB1c2goZGF0ZSk7IH1cbiAgaWYgKGRvY3RvcklkKSB7IHdoZXJlICs9ICcgQU5EIGEuZG9jdG9yX2lkID0gPyc7IHBhcmFtcy5wdXNoKGRvY3RvcklkKTsgfVxuICBpZiAoc3RhdHVzKSB7IHdoZXJlICs9ICcgQU5EIGEuc3RhdHVzID0gPyc7IHBhcmFtcy5wdXNoKHN0YXR1cyk7IH1cblxuICBjb25zdCByZXN1bHQgPSBkYi5wYWdpbmF0ZShcbiAgICBgU0VMRUNUIGEuKiwgcC5maXJzdF9uYW1lIHx8ICcgJyB8fCBwLmxhc3RfbmFtZSBhcyBwYXRpZW50X25hbWUsIHAucGF0aWVudF9udW1iZXIsXG4gICAgICAgICAgICBwLnBob25lIGFzIHBhdGllbnRfcGhvbmUsXG4gICAgICAgICAgICBkLmZpcnN0X25hbWUgfHwgJyAnIHx8IGQubGFzdF9uYW1lIGFzIGRvY3Rvcl9uYW1lXG4gICAgIEZST00gYXBwb2ludG1lbnRzIGFcbiAgICAgSk9JTiBwYXRpZW50cyBwIE9OIHAuaWQgPSBhLnBhdGllbnRfaWRcbiAgICAgTEVGVCBKT0lOIHVzZXJzIGQgT04gZC5pZCA9IGEuZG9jdG9yX2lkXG4gICAgICR7d2hlcmV9IE9SREVSIEJZIGEuYXBwb2ludG1lbnRfZGF0ZSwgYS5hcHBvaW50bWVudF90aW1lYCxcbiAgICBgU0VMRUNUIENPVU5UKCopIGFzIHRvdGFsIEZST00gYXBwb2ludG1lbnRzIGEgJHt3aGVyZX1gLFxuICAgIHBhcmFtcywgcGFyc2VJbnQocGFnZSksIHBhcnNlSW50KHBhZ2VTaXplKSxcbiAgKTtcbiAgcmV0dXJuIGMuanNvbihyZXN1bHQpO1xufSk7XG5cbmFwcG9pbnRtZW50cy5wb3N0KCcvJywgcmVxdWlyZVBlcm1pc3Npb24oJ2NsaW5pY2FsJywgJ2FwcG9pbnRtZW50cycsICdjcmVhdGUnKSwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IGJvZHkgPSBhd2FpdCBjLnJlcS5qc29uKCk7XG5cbiAgY29uc3QgYXBwdE51bWJlciA9IGdlbmVyYXRlU2VxdWVudGlhbE51bWJlcihkYiwgJ0FQVCcsICdhcHBvaW50bWVudHMnLCAnYXBwb2ludG1lbnRfbnVtYmVyJyk7XG4gIGNvbnN0IGlkID0gZ2VuZXJhdGVJZCgpO1xuXG4gIGRiLnJ1bihcbiAgICBgSU5TRVJUIElOVE8gYXBwb2ludG1lbnRzIChpZCwgYXBwb2ludG1lbnRfbnVtYmVyLCBicmFuY2hfaWQsIHBhdGllbnRfaWQsXG4gICAgIGRvY3Rvcl9pZCwgZGVwYXJ0bWVudF9pZCwgYXBwb2ludG1lbnRfZGF0ZSwgYXBwb2ludG1lbnRfdGltZSwgZW5kX3RpbWUsXG4gICAgIHR5cGUsIHJlYXNvbiwgcHJpb3JpdHksIG5vdGVzLCBib29rZWRfYnkpXG4gICAgIFZBTFVFUyAoPyw/LD8sPyw/LD8sPyw/LD8sPyw/LD8sPyw/KWAsXG4gICAgW1xuICAgICAgaWQsIGFwcHROdW1iZXIsIGJvZHkuYnJhbmNoSWQgPz8gc2Vzc2lvbi5icmFuY2hJZCwgYm9keS5wYXRpZW50SWQsXG4gICAgICBib2R5LmRvY3RvcklkLCBib2R5LmRlcGFydG1lbnRJZCA/PyBudWxsLCBib2R5LmRhdGUsIGJvZHkudGltZSwgYm9keS5lbmRUaW1lID8/IG51bGwsXG4gICAgICBib2R5LnR5cGUgPz8gJ29wZCcsIGJvZHkucmVhc29uLCBib2R5LnByaW9yaXR5ID8/ICdub3JtYWwnLFxuICAgICAgYm9keS5ub3RlcyA/PyBudWxsLCBzZXNzaW9uLnVzZXJJZCxcbiAgICBdLFxuICApO1xuICByZXR1cm4gYy5qc29uKHsgaWQsIGFwcHROdW1iZXIgfSwgMjAxKTtcbn0pO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIEFOQUxZVElDUyAvIERBU0hCT0FSRFxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5jb25zdCBhbmFseXRpY3MgPSBuZXcgSG9ubygpO1xuYW5hbHl0aWNzLnVzZSgnKicsIHJlcXVpcmVBdXRoKTtcblxuYW5hbHl0aWNzLmdldCgnL2Rhc2hib2FyZCcsIHJlcXVpcmVQZXJtaXNzaW9uKCdhbmFseXRpY3MnLCAnZGFzaGJvYXJkJywgJ3JlYWQnKSwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc2Vzc2lvbiA9IGMuZ2V0KCdzZXNzaW9uJyk7XG4gIGNvbnN0IGJyYW5jaEZpbHRlciA9IHNlc3Npb24uYnJhbmNoSWQgPyBgQU5EIGJyYW5jaF9pZCA9ICcke3Nlc3Npb24uYnJhbmNoSWR9J2AgOiAnJztcbiAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXTtcblxuICBjb25zdCBbXG4gICAgdG9kYXlWaXNpdHMsIGFjdGl2ZUFkbWlzc2lvbnMsIHBlbmRpbmdMYWIsIHBlbmRpbmdQYXltZW50cyxcbiAgICBhdmFpbGFibGVCZWRzLCB0b2RheVJldmVudWUsIGV4cGlyaW5nRHJ1Z3MsIHRvZGF5QXBwb2ludG1lbnRzLFxuICBdID0gW1xuICAgIGRiLnF1ZXJ5PHsgY291bnQ6IG51bWJlciB9PihcbiAgICAgIGBTRUxFQ1QgQ09VTlQoKikgYXMgY291bnQgRlJPTSB2aXNpdHMgV0hFUkUgREFURShjaGVja19pbl90aW1lKSA9ID8gJHticmFuY2hGaWx0ZXJ9YCwgW3RvZGF5XSxcbiAgICApLnJvd3NbMF0/LmNvdW50ID8/IDAsXG5cbiAgICBkYi5xdWVyeTx7IGNvdW50OiBudW1iZXIgfT4oXG4gICAgICBgU0VMRUNUIENPVU5UKCopIGFzIGNvdW50IEZST00gYWRtaXNzaW9ucyBXSEVSRSBzdGF0dXMgPSAnYWN0aXZlJyAke2JyYW5jaEZpbHRlcn1gLFxuICAgICkucm93c1swXT8uY291bnQgPz8gMCxcblxuICAgIGRiLnF1ZXJ5PHsgY291bnQ6IG51bWJlciB9PihcbiAgICAgIGBTRUxFQ1QgQ09VTlQoKikgYXMgY291bnQgRlJPTSBsYWJfcmVxdWVzdHMgV0hFUkUgc3RhdHVzIElOICgncGVuZGluZycsJ3NwZWNpbWVuX2NvbGxlY3RlZCcsJ3Byb2Nlc3NpbmcnKSAke2JyYW5jaEZpbHRlcn1gLFxuICAgICkucm93c1swXT8uY291bnQgPz8gMCxcblxuICAgIGRiLnF1ZXJ5PHsgdG90YWw6IG51bWJlciB9PihcbiAgICAgIGBTRUxFQ1QgQ09BTEVTQ0UoU1VNKGJhbGFuY2VfZHVlKSwgMCkgYXMgdG90YWwgRlJPTSBpbnZvaWNlcyBXSEVSRSBzdGF0dXMgSU4gKCdwZW5kaW5nJywncGFydGlhbCcpICR7YnJhbmNoRmlsdGVyfWAsXG4gICAgKS5yb3dzWzBdPy50b3RhbCA/PyAwLFxuXG4gICAgZGIucXVlcnk8eyBjb3VudDogbnVtYmVyIH0+KFxuICAgICAgYFNFTEVDVCBDT1VOVCgqKSBhcyBjb3VudCBGUk9NIGJlZHMgV0hFUkUgc3RhdHVzID0gJ2F2YWlsYWJsZSdgLFxuICAgICkucm93c1swXT8uY291bnQgPz8gMCxcblxuICAgIGRiLnF1ZXJ5PHsgdG90YWw6IG51bWJlciB9PihcbiAgICAgIGBTRUxFQ1QgQ09BTEVTQ0UoU1VNKGFtb3VudCksIDApIGFzIHRvdGFsIEZST00gcGF5bWVudHMgV0hFUkUgREFURShwYXltZW50X2RhdGUpID0gPyAke2JyYW5jaEZpbHRlcn1gLCBbdG9kYXldLFxuICAgICkucm93c1swXT8udG90YWwgPz8gMCxcblxuICAgIGRiLnF1ZXJ5PHsgY291bnQ6IG51bWJlciB9PihcbiAgICAgIGBTRUxFQ1QgQ09VTlQoKikgYXMgY291bnQgRlJPTSBwaGFybWFjeV9pbnZlbnRvcnkgV0hFUkUgZXhwaXJ5X2RhdGUgPD0gZGF0ZSgnbm93JywgJyszMCBkYXlzJykgQU5EIHF1YW50aXR5X2luX3N0b2NrID4gMCAke2JyYW5jaEZpbHRlcn1gLFxuICAgICkucm93c1swXT8uY291bnQgPz8gMCxcblxuICAgIGRiLnF1ZXJ5PHsgY291bnQ6IG51bWJlciB9PihcbiAgICAgIGBTRUxFQ1QgQ09VTlQoKikgYXMgY291bnQgRlJPTSBhcHBvaW50bWVudHMgV0hFUkUgYXBwb2ludG1lbnRfZGF0ZSA9ID8gJHticmFuY2hGaWx0ZXJ9YCwgW3RvZGF5XSxcbiAgICApLnJvd3NbMF0/LmNvdW50ID8/IDAsXG4gIF07XG5cbiAgLy8gV2Vla2x5IHZpc2l0IHRyZW5kXG4gIGNvbnN0IHZpc2l0VHJlbmQgPSBkYi5xdWVyeShcbiAgICBgU0VMRUNUIERBVEUoY2hlY2tfaW5fdGltZSkgYXMgZGF0ZSwgQ09VTlQoKikgYXMgY291bnRcbiAgICAgRlJPTSB2aXNpdHMgV0hFUkUgY2hlY2tfaW5fdGltZSA+PSBkYXRlKCdub3cnLCAnLTcgZGF5cycpICR7YnJhbmNoRmlsdGVyfVxuICAgICBHUk9VUCBCWSBEQVRFKGNoZWNrX2luX3RpbWUpIE9SREVSIEJZIGRhdGVgLFxuICApLnJvd3M7XG5cbiAgLy8gUmV2ZW51ZSBieSBwYXltZW50IG1ldGhvZCAobGFzdCAzMCBkYXlzKVxuICBjb25zdCByZXZlbnVlQnlNZXRob2QgPSBkYi5xdWVyeShcbiAgICBgU0VMRUNUIHBheW1lbnRfbWV0aG9kLCBTVU0oYW1vdW50KSBhcyB0b3RhbFxuICAgICBGUk9NIHBheW1lbnRzIFdIRVJFIHBheW1lbnRfZGF0ZSA+PSBkYXRlKCdub3cnLCAnLTMwIGRheXMnKSAke2JyYW5jaEZpbHRlcn1cbiAgICAgR1JPVVAgQlkgcGF5bWVudF9tZXRob2RgLFxuICApLnJvd3M7XG5cbiAgLy8gRGVwYXJ0bWVudCB2aXNpdCBicmVha2Rvd24gdG9kYXlcbiAgY29uc3QgZGVwdEJyZWFrZG93biA9IGRiLnF1ZXJ5KFxuICAgIGBTRUxFQ1QgZGVwLm5hbWUsIENPVU5UKHYuaWQpIGFzIGNvdW50XG4gICAgIEZST00gdmlzaXRzIHYgTEVGVCBKT0lOIGRlcGFydG1lbnRzIGRlcCBPTiBkZXAuaWQgPSB2LmRlcGFydG1lbnRfaWRcbiAgICAgV0hFUkUgREFURSh2LmNoZWNrX2luX3RpbWUpID0gPyAke2JyYW5jaEZpbHRlcn1cbiAgICAgR1JPVVAgQlkgZGVwLm5hbWUgT1JERVIgQlkgY291bnQgREVTQyBMSU1JVCAxMGAsXG4gICAgW3RvZGF5XSxcbiAgKS5yb3dzO1xuXG4gIHJldHVybiBjLmpzb24oe1xuICAgIHN1bW1hcnk6IHtcbiAgICAgIHRvZGF5VmlzaXRzLCBhY3RpdmVBZG1pc3Npb25zLCBwZW5kaW5nTGFiLCBwZW5kaW5nUGF5bWVudHMsXG4gICAgICBhdmFpbGFibGVCZWRzLCB0b2RheVJldmVudWUsIGV4cGlyaW5nRHJ1Z3MsIHRvZGF5QXBwb2ludG1lbnRzLFxuICAgIH0sXG4gICAgY2hhcnRzOiB7IHZpc2l0VHJlbmQsIHJldmVudWVCeU1ldGhvZCwgZGVwdEJyZWFrZG93biB9LFxuICB9KTtcbn0pO1xuXG5hbmFseXRpY3MuZ2V0KCcva3BpcycsIHJlcXVpcmVQZXJtaXNzaW9uKCdhbmFseXRpY3MnLCAna3BpcycsICdyZWFkJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IGJyYW5jaEZpbHRlciA9IGMuZ2V0KCdzZXNzaW9uJykuYnJhbmNoSWQgPyBgQU5EIGJyYW5jaF9pZCA9ICcke2MuZ2V0KCdzZXNzaW9uJykuYnJhbmNoSWR9J2AgOiAnJztcblxuICBjb25zdCBiZWRPY2N1cGFuY3kgPSBkYi5xdWVyeTx7IG9jY3VwaWVkOiBudW1iZXI7IHRvdGFsOiBudW1iZXIgfT4oXG4gICAgYFNFTEVDVFxuICAgICAgIFNVTShDQVNFIFdIRU4gc3RhdHVzID0gJ29jY3VwaWVkJyBUSEVOIDEgRUxTRSAwIEVORCkgYXMgb2NjdXBpZWQsXG4gICAgICAgQ09VTlQoKikgYXMgdG90YWwgRlJPTSBiZWRzYCxcbiAgKS5yb3dzWzBdO1xuXG4gIGNvbnN0IGF2Z0xvcyA9IGRiLnF1ZXJ5PHsgYXZnX2xvczogbnVtYmVyIH0+KFxuICAgIGBTRUxFQ1QgQVZHKGxlbmd0aF9vZl9zdGF5KSBhcyBhdmdfbG9zIEZST00gYWRtaXNzaW9uc1xuICAgICBXSEVSRSBzdGF0dXMgPSAnZGlzY2hhcmdlZCcgQU5EIGxlbmd0aF9vZl9zdGF5IElTIE5PVCBOVUxMICR7YnJhbmNoRmlsdGVyfWAsXG4gICkucm93c1swXT8uYXZnX2xvcyA/PyAwO1xuXG4gIGNvbnN0IGNvbGxlY3Rpb25SYXRlID0gZGIucXVlcnk8eyBjb2xsZWN0ZWQ6IG51bWJlcjsgYmlsbGVkOiBudW1iZXIgfT4oXG4gICAgYFNFTEVDVFxuICAgICAgIENPQUxFU0NFKFNVTShwYWlkX2Ftb3VudCksIDApIGFzIGNvbGxlY3RlZCxcbiAgICAgICBDT0FMRVNDRShTVU0odG90YWxfYW1vdW50KSwgMCkgYXMgYmlsbGVkXG4gICAgIEZST00gaW52b2ljZXMgV0hFUkUgc3RhdHVzICE9ICd2b2lkZWQnICR7YnJhbmNoRmlsdGVyfWAsXG4gICkucm93c1swXTtcblxuICByZXR1cm4gYy5qc29uKHtcbiAgICBiZWRPY2N1cGFuY3lSYXRlOiBiZWRPY2N1cGFuY3k/LnRvdGFsXG4gICAgICA/ICgoYmVkT2NjdXBhbmN5Lm9jY3VwaWVkIC8gYmVkT2NjdXBhbmN5LnRvdGFsKSAqIDEwMCkudG9GaXhlZCgxKVxuICAgICAgOiAnMCcsXG4gICAgYXZlcmFnZUxlbmd0aE9mU3RheTogYXZnTG9zLnRvRml4ZWQoMSksXG4gICAgY29sbGVjdGlvblJhdGU6IGNvbGxlY3Rpb25SYXRlPy5iaWxsZWRcbiAgICAgID8gKChjb2xsZWN0aW9uUmF0ZS5jb2xsZWN0ZWQgLyBjb2xsZWN0aW9uUmF0ZS5iaWxsZWQpICogMTAwKS50b0ZpeGVkKDEpXG4gICAgICA6ICcwJyxcbiAgfSk7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBVU0VSUyAmIFNUQUZGXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmNvbnN0IHVzZXJzID0gbmV3IEhvbm8oKTtcbnVzZXJzLnVzZSgnKicsIHJlcXVpcmVBdXRoKTtcblxudXNlcnMuZ2V0KCcvJywgcmVxdWlyZVBlcm1pc3Npb24oJ2hyJywgJ3VzZXJzJywgJ3JlYWQnKSwgYXN5bmMgKGMpID0+IHtcbiAgY29uc3QgeyByb2xlSWQsIGJyYW5jaElkLCBxLCBwYWdlID0gJzEnLCBwYWdlU2l6ZSA9ICcyNScgfSA9IGMucmVxLnF1ZXJ5KCk7XG4gIGxldCB3aGVyZSA9ICdXSEVSRSB1LmlzX2FjdGl2ZSA9IDEnO1xuICBjb25zdCBwYXJhbXM6IChzdHJpbmcgfCBudW1iZXIgfCBudWxsKVtdID0gW107XG4gIGlmIChyb2xlSWQpIHsgd2hlcmUgKz0gJyBBTkQgdS5yb2xlX2lkID0gPyc7IHBhcmFtcy5wdXNoKHJvbGVJZCk7IH1cbiAgaWYgKGJyYW5jaElkKSB7IHdoZXJlICs9ICcgQU5EIHUuYnJhbmNoX2lkID0gPyc7IHBhcmFtcy5wdXNoKGJyYW5jaElkKTsgfVxuICBpZiAocSkge1xuICAgIHdoZXJlICs9ICcgQU5EICh1LmZpcnN0X25hbWUgTElLRSA/IE9SIHUubGFzdF9uYW1lIExJS0UgPyBPUiB1LnVzZXJuYW1lIExJS0UgPyknO1xuICAgIHBhcmFtcy5wdXNoKGAlJHtxfSVgLCBgJSR7cX0lYCwgYCUke3F9JWApO1xuICB9XG4gIGNvbnN0IHJlc3VsdCA9IGRiLnBhZ2luYXRlKFxuICAgIGBTRUxFQ1QgdS5pZCwgdS51c2VybmFtZSwgdS5lbWFpbCwgdS5maXJzdF9uYW1lLCB1Lmxhc3RfbmFtZSxcbiAgICAgICAgICAgIHUuaXNfYWN0aXZlLCB1LmlzX2xvY2tlZCwgdS5sYXN0X2xvZ2luLCB1LmNyZWF0ZWRfYXQsXG4gICAgICAgICAgICByLm5hbWUgYXMgcm9sZV9uYW1lLCByLmRpc3BsYXlfbmFtZSBhcyByb2xlX2Rpc3BsYXksXG4gICAgICAgICAgICBiLm5hbWUgYXMgYnJhbmNoX25hbWUsIGQubmFtZSBhcyBkZXBhcnRtZW50X25hbWVcbiAgICAgRlJPTSB1c2VycyB1XG4gICAgIEpPSU4gcm9sZXMgciBPTiByLmlkID0gdS5yb2xlX2lkXG4gICAgIExFRlQgSk9JTiBicmFuY2hlcyBiIE9OIGIuaWQgPSB1LmJyYW5jaF9pZFxuICAgICBMRUZUIEpPSU4gZGVwYXJ0bWVudHMgZCBPTiBkLmlkID0gdS5kZXBhcnRtZW50X2lkXG4gICAgICR7d2hlcmV9IE9SREVSIEJZIHUuZmlyc3RfbmFtZWAsXG4gICAgYFNFTEVDVCBDT1VOVCgqKSBhcyB0b3RhbCBGUk9NIHVzZXJzIHUgJHt3aGVyZX1gLFxuICAgIHBhcmFtcywgcGFyc2VJbnQocGFnZSksIHBhcnNlSW50KHBhZ2VTaXplKSxcbiAgKTtcbiAgcmV0dXJuIGMuanNvbihyZXN1bHQpO1xufSk7XG5cbnVzZXJzLnBvc3QoJy8nLCByZXF1aXJlUGVybWlzc2lvbignaHInLCAndXNlcnMnLCAnY3JlYXRlJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHNlc3Npb24gPSBjLmdldCgnc2Vzc2lvbicpO1xuICBjb25zdCBib2R5ID0gYXdhaXQgYy5yZXEuanNvbigpO1xuXG4gIGlmICghbGljZW5zZVNlcnZpY2UuY2FuQWRkVXNlcigpKSB7XG4gICAgcmV0dXJuIGMuanNvbih7IGVycm9yOiAnVXNlciBsaW1pdCByZWFjaGVkIGZvciB5b3VyIGxpY2Vuc2UuIFBsZWFzZSB1cGdyYWRlLicgfSwgNDAzKTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGF1dGhTZXJ2aWNlLmNyZWF0ZVVzZXIoe1xuICAgIHVzZXJuYW1lOiBib2R5LnVzZXJuYW1lLCBlbWFpbDogYm9keS5lbWFpbCwgcGFzc3dvcmQ6IGJvZHkucGFzc3dvcmQsXG4gICAgZmlyc3ROYW1lOiBib2R5LmZpcnN0TmFtZSwgbGFzdE5hbWU6IGJvZHkubGFzdE5hbWUsXG4gICAgcm9sZUlkOiBib2R5LnJvbGVJZCwgYnJhbmNoSWQ6IGJvZHkuYnJhbmNoSWQsIGRlcGFydG1lbnRJZDogYm9keS5kZXBhcnRtZW50SWQsXG4gICAgY3JlYXRlZEJ5OiBzZXNzaW9uLnVzZXJJZCxcbiAgfSk7XG5cbiAgaWYgKCFyZXN1bHQuc3VjY2VzcykgcmV0dXJuIGMuanNvbih7IGVycm9yOiByZXN1bHQuZXJyb3IgfSwgNDAwKTtcbiAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICB1c2VySWQ6IHNlc3Npb24udXNlcklkLCBhY3Rpb246ICdVU0VSX0NSRUFURUQnLCBtb2R1bGU6ICdocicsXG4gICAgcmVzb3VyY2U6ICd1c2VycycsIHJlc291cmNlSWQ6IHJlc3VsdC51c2VySWQsXG4gICAgbmV3VmFsdWVzOiB7IHVzZXJuYW1lOiBib2R5LnVzZXJuYW1lLCByb2xlOiBib2R5LnJvbGVJZCB9LFxuICAgIHN0YXR1czogJ3N1Y2Nlc3MnLCByaXNrTGV2ZWw6ICdtZWRpdW0nLFxuICB9KTtcbiAgcmV0dXJuIGMuanNvbih7IGlkOiByZXN1bHQudXNlcklkIH0sIDIwMSk7XG59KTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4vLyBBVURJVCBMT0dTXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbmNvbnN0IGF1ZGl0Um91dGVzID0gbmV3IEhvbm8oKTtcbmF1ZGl0Um91dGVzLnVzZSgnKicsIHJlcXVpcmVBdXRoLCByZXF1aXJlUGVybWlzc2lvbignYWRtaW4nLCAnYXVkaXQnLCAncmVhZCcpKTtcblxuYXVkaXRSb3V0ZXMuZ2V0KCcvJywgYXN5bmMgKGMpID0+IHtcbiAgY29uc3QgcXVlcnkgPSBjLnJlcS5xdWVyeSgpO1xuICBjb25zdCByZXN1bHQgPSBhdWRpdExvZ2dlci5zZWFyY2goe1xuICAgIHVzZXJJZDogcXVlcnkudXNlcklkLCBtb2R1bGU6IHF1ZXJ5Lm1vZHVsZSwgYWN0aW9uOiBxdWVyeS5hY3Rpb24sXG4gICAgYnJhbmNoSWQ6IHF1ZXJ5LmJyYW5jaElkLCBzdGFydERhdGU6IHF1ZXJ5LnN0YXJ0RGF0ZSwgZW5kRGF0ZTogcXVlcnkuZW5kRGF0ZSxcbiAgICByaXNrTGV2ZWw6IHF1ZXJ5LnJpc2tMZXZlbCBhcyBhbnksIHN0YXR1czogcXVlcnkuc3RhdHVzIGFzIGFueSxcbiAgICBwYWdlOiBwYXJzZUludChxdWVyeS5wYWdlID8/ICcxJyksIHBhZ2VTaXplOiBwYXJzZUludChxdWVyeS5wYWdlU2l6ZSA/PyAnNTAnKSxcbiAgfSk7XG4gIHJldHVybiBjLmpzb24ocmVzdWx0KTtcbn0pO1xuXG5hdWRpdFJvdXRlcy5nZXQoJy9leHBvcnQnLCBhc3luYyAoYykgPT4ge1xuICBjb25zdCBxdWVyeSA9IGMucmVxLnF1ZXJ5KCk7XG4gIGNvbnN0IGNzdiA9IGF1ZGl0TG9nZ2VyLmV4cG9ydFRvQ3N2KHtcbiAgICBzdGFydERhdGU6IHF1ZXJ5LnN0YXJ0RGF0ZSwgZW5kRGF0ZTogcXVlcnkuZW5kRGF0ZSxcbiAgICBtb2R1bGU6IHF1ZXJ5Lm1vZHVsZSwgYnJhbmNoSWQ6IHF1ZXJ5LmJyYW5jaElkLFxuICB9KTtcbiAgcmV0dXJuIG5ldyBSZXNwb25zZShjc3YsIHtcbiAgICBoZWFkZXJzOiB7XG4gICAgICAnQ29udGVudC1UeXBlJzogJ3RleHQvY3N2JyxcbiAgICAgICdDb250ZW50LURpc3Bvc2l0aW9uJzogYGF0dGFjaG1lbnQ7IGZpbGVuYW1lPVwiYWZ5YWNvcmVfYXVkaXRfJHtEYXRlLm5vdygpfS5jc3ZcImAsXG4gICAgfSxcbiAgfSk7XG59KTtcblxuYXVkaXRSb3V0ZXMuZ2V0KCcvdmVyaWZ5JywgYXN5bmMgKGMpID0+IHtcbiAgY29uc3QgcmVzdWx0ID0gYXVkaXRMb2dnZXIudmVyaWZ5SW50ZWdyaXR5KCk7XG4gIHJldHVybiBjLmpzb24ocmVzdWx0KTtcbn0pO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcbi8vIFNZU1RFTSAvIExJQ0VOU0Vcbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuY29uc3Qgc3lzdGVtID0gbmV3IEhvbm8oKTtcbnN5c3RlbS51c2UoJyonLCByZXF1aXJlQXV0aCk7XG5cbnN5c3RlbS5nZXQoJy9saWNlbnNlJywgYXN5bmMgKGMpID0+IHtcbiAgY29uc3Qgc3RhdHVzID0gbGljZW5zZVNlcnZpY2UudmFsaWRhdGVMaWNlbnNlKCk7XG4gIHJldHVybiBjLmpzb24oeyBsaWNlbnNlOiBzdGF0dXMgfSk7XG59KTtcblxuc3lzdGVtLnBvc3QoJy9saWNlbnNlL2FjdGl2YXRlJywgcmVxdWlyZVBlcm1pc3Npb24oJ2FkbWluJywgJ2xpY2Vuc2UnLCAndXBkYXRlJyksIGFzeW5jIChjKSA9PiB7XG4gIGNvbnN0IHsgbGljZW5zZUtleSB9ID0gYXdhaXQgYy5yZXEuanNvbigpO1xuICBjb25zdCByZXN1bHQgPSBhd2FpdCBsaWNlbnNlU2VydmljZS5hY3RpdmF0ZUxpY2Vuc2UobGljZW5zZUtleSk7XG4gIGlmICghcmVzdWx0LnZhbGlkKSByZXR1cm4gYy5qc29uKHsgZXJyb3I6IHJlc3VsdC5lcnJvciB9LCA0MDApO1xuICByZXR1cm4gYy5qc29uKHsgc3VjY2VzczogdHJ1ZSwgbGljZW5zZTogcmVzdWx0IH0pO1xufSk7XG5cbnN5c3RlbS5nZXQoJy9saWNlbnNlL2ZpbmdlcnByaW50JywgYXN5bmMgKGMpID0+IHtcbiAgY29uc3QgZnAgPSBsaWNlbnNlU2VydmljZS5nZXRIYXJkd2FyZUZpbmdlcnByaW50KCk7XG4gIHJldHVybiBjLmpzb24oeyBmaW5nZXJwcmludDogZnAuZmluZ2VycHJpbnQsIGRldGFpbHM6IGZwIH0pO1xufSk7XG5cbnN5c3RlbS5nZXQoJy9oZWFsdGgnLCBhc3luYyAoYykgPT4ge1xuICBjb25zdCBkYk9rID0gZGIucmVhZHk7XG4gIGNvbnN0IGxpY09rID0gbGljZW5zZVNlcnZpY2UudmFsaWRhdGVMaWNlbnNlKCkuYWN0aXZlO1xuICByZXR1cm4gYy5qc29uKHtcbiAgICBzdGF0dXM6IGRiT2sgJiYgbGljT2sgPyAnaGVhbHRoeScgOiAnZGVncmFkZWQnLFxuICAgIGRhdGFiYXNlOiBkYk9rLCBsaWNlbnNlOiBsaWNPayxcbiAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgfSk7XG59KTtcblxuc3lzdGVtLnBvc3QoJy9iYWNrdXAnLCByZXF1aXJlUGVybWlzc2lvbignYWRtaW4nLCAnc3lzdGVtJywgJ2NyZWF0ZScpLCBhc3luYyAoYykgPT4ge1xuICBjb25zdCBzZXNzaW9uID0gYy5nZXQoJ3Nlc3Npb24nKTtcbiAgY29uc3QgeyBkZXN0UGF0aCB9ID0gYXdhaXQgYy5yZXEuanNvbigpO1xuICB0cnkge1xuICAgIGRiLmJhY2t1cChkZXN0UGF0aCk7XG4gICAgYXdhaXQgYXVkaXRMb2dnZXIubG9nKHtcbiAgICAgIHVzZXJJZDogc2Vzc2lvbi51c2VySWQsIGFjdGlvbjogJ0JBQ0tVUF9DUkVBVEVEJywgbW9kdWxlOiAnYWRtaW4nLFxuICAgICAgcmVzb3VyY2U6ICdzeXN0ZW0nLCBzdGF0dXM6ICdzdWNjZXNzJywgcmlza0xldmVsOiAnbWVkaXVtJyxcbiAgICAgIG5ld1ZhbHVlczogeyBwYXRoOiBkZXN0UGF0aCB9LFxuICAgIH0pO1xuICAgIHJldHVybiBjLmpzb24oeyBzdWNjZXNzOiB0cnVlIH0pO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gYy5qc29uKHsgZXJyb3I6IChlcnIgYXMgRXJyb3IpLm1lc3NhZ2UgfSwgNTAwKTtcbiAgfVxufSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuLy8gTU9VTlQgQUxMIFJPVVRFU1xuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5hcGlSb3V0ZXIucm91dGUoJy9hdXRoJywgYXV0aCk7XG5hcGlSb3V0ZXIucm91dGUoJy9wYXRpZW50cycsIHBhdGllbnRzKTtcbmFwaVJvdXRlci5yb3V0ZSgnL3Zpc2l0cycsIHZpc2l0cyk7XG5hcGlSb3V0ZXIucm91dGUoJy9wcmVzY3JpcHRpb25zJywgcHJlc2NyaXB0aW9ucyk7XG5hcGlSb3V0ZXIucm91dGUoJy9sYWInLCBsYWIpO1xuYXBpUm91dGVyLnJvdXRlKCcvYmlsbGluZycsIGJpbGxpbmcpO1xuYXBpUm91dGVyLnJvdXRlKCcvYWRtaXNzaW9ucycsIGFkbWlzc2lvbnMpO1xuYXBpUm91dGVyLnJvdXRlKCcvYXBwb2ludG1lbnRzJywgYXBwb2ludG1lbnRzKTtcbmFwaVJvdXRlci5yb3V0ZSgnL2FuYWx5dGljcycsIGFuYWx5dGljcyk7XG5hcGlSb3V0ZXIucm91dGUoJy91c2VycycsIHVzZXJzKTtcbmFwaVJvdXRlci5yb3V0ZSgnL2F1ZGl0JywgYXVkaXRSb3V0ZXMpO1xuYXBpUm91dGVyLnJvdXRlKCcvc3lzdGVtJywgc3lzdGVtKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsU0FBUyxZQUFZO0FBT3JCLFNBQVMsWUFBWSxHQUFRLE1BQVc7QUFDdEMsUUFBTSxRQUFRLEVBQUUsSUFBSSxPQUFPLGVBQWUsR0FBRyxRQUFRLFdBQVcsRUFBRTtBQUNsRSxNQUFJLENBQUMsTUFBTyxRQUFPLEVBQUUsS0FBSyxFQUFFLE9BQU8sZUFBZSxHQUFHLEdBQUc7QUFFeEQsUUFBTSxVQUFVLFlBQVksZ0JBQWdCLEtBQUs7QUFDakQsTUFBSSxDQUFDLFFBQVMsUUFBTyxFQUFFLEtBQUssRUFBRSxPQUFPLHVDQUF1QyxHQUFHLEdBQUc7QUFFbEYsSUFBRSxJQUFJLFdBQVcsT0FBTztBQUN4QixTQUFPLEtBQUs7QUFDZDtBQUVBLFNBQVMsa0JBQWtCLFFBQWdCLFVBQWtCLFFBQWdCO0FBQzNFLFNBQU8sT0FBTyxHQUFRLFNBQWM7QUFDbEMsVUFBTSxVQUFVLEVBQUUsSUFBSSxTQUFTO0FBQy9CLFFBQUksQ0FBQyxZQUFZLGNBQWMsUUFBUSxhQUFhLFFBQVEsVUFBVSxNQUFNLEdBQUc7QUFDN0UsWUFBTSxZQUFZLElBQUk7QUFBQSxRQUNwQixRQUFRLFFBQVE7QUFBQSxRQUFRLFFBQVE7QUFBQSxRQUNoQztBQUFBLFFBQVE7QUFBQSxRQUFVLFFBQVE7QUFBQSxRQUFXLFdBQVc7QUFBQSxRQUNoRCxlQUFlLDRCQUE0QixNQUFNLElBQUksUUFBUSxJQUFJLE1BQU07QUFBQSxNQUN6RSxDQUFDO0FBQ0QsYUFBTyxFQUFFLEtBQUssRUFBRSxPQUFP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
