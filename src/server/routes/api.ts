import { Hono } from 'hono';
import { db, generateId, generateSequentialNumber } from '../lib/db/database';
import { authService } from '../lib/auth/auth-service';
import { auditLogger, computeDiff } from '../lib/audit/audit-logger';
import { licenseService } from '../lib/license/license-service';

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function requireAuth(c: any, next: any) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const session = authService.validateSession(token);
  if (!session) return c.json({ error: 'Session expired. Please login again.' }, 401);

  c.set('session', session);
  return next();
}

function requirePermission(module: string, resource: string, action: string) {
  return async (c: any, next: any) => {
    const session = c.get('session');
    if (!authService.hasPermission(session.permissions, module, resource, action)) {
      await auditLogger.log({
        userId: session.userId, action: 'DATA_ACCESS',
        module, resource, status: 'blocked', riskLevel: 'medium',
        failureReason: `Insufficient permission: ${module}:${resource}:${action}`,
      });
      return c.json({ error: 'Access denied' }, 403);
    }
    return next();
  };
}

// ─── App ──────────────────────────────────────────────────────────────────────
export const apiRouter = new Hono();

// ─────────────────────────────────────────────────────────────────────────────
// AUTH ROUTES
// ─────────────────────────────────────────────────────────────────────────────
const auth = new Hono();

auth.post('/login', async (c) => {
  const { username, password, deviceFingerprint } = await c.req.json();
  const ip = c.req.header('X-Real-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';
  const ua = c.req.header('User-Agent') ?? 'unknown';

  if (!username || !password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const result = await authService.login(username, password, deviceFingerprint ?? 'unknown', ip, ua);
  if (!result.success && !result.requiresMfa) {
    return c.json({ error: result.error }, 401);
  }
  return c.json(result);
});

auth.post('/verify-mfa', async (c) => {
  const { tempToken, code } = await c.req.json();
  const ip = c.req.header('X-Real-IP') ?? 'unknown';
  const result = await authService.verifyMfa(tempToken, code, ip);
  if (!result.success) return c.json({ error: result.error }, 401);
  return c.json(result);
});

auth.post('/logout', requireAuth, async (c) => {
  const session = c.get('session');
  const token = c.req.header('Authorization')?.replace('Bearer ', '') ?? '';
  authService.revokeSession(token, 'logout');
  await auditLogger.log({
    userId: session.userId, action: 'LOGOUT',
    module: 'auth', resource: 'users', resourceId: session.userId,
    status: 'success', riskLevel: 'low',
  });
  return c.json({ success: true });
});

auth.post('/change-password', requireAuth, async (c) => {
  const session = c.get('session');
  const { currentPassword, newPassword } = await c.req.json();
  const result = await authService.changePassword(session.userId, currentPassword, newPassword);
  if (!result.success) return c.json({ error: result.error }, 400);
  await auditLogger.log({
    userId: session.userId, action: 'PASSWORD_CHANGED',
    module: 'auth', resource: 'users', resourceId: session.userId,
    status: 'success', riskLevel: 'medium',
  });
  return c.json({ success: true });
});

auth.get('/me', requireAuth, async (c) => {
  const session = c.get('session');
  const user = db.findOne(
    `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.profile_photo,
            u.branch_id, u.department_id, r.name as role_name, r.display_name as role_display,
            r.category as role_category
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
    [session.userId],
  );
  return c.json({ user, permissions: [...session.permissions] });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT ROUTES
// ─────────────────────────────────────────────────────────────────────────────
const patients = new Hono();
patients.use('*', requireAuth);

patients.get('/', requirePermission('patients', 'patients', 'read'), async (c) => {
  const session = c.get('session');
  const { q, page = '1', pageSize = '25', branchId } = c.req.query();
  const branch = branchId ?? session.branchId;

  let where = 'WHERE p.is_active = 1';
  const params: (string | number | null)[] = [];
  if (branch) { where += ' AND p.branch_id = ?'; params.push(branch); }
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
    parseInt(page), parseInt(pageSize),
  );

  await auditLogger.log({
    userId: session.userId, action: 'DATA_ACCESS', module: 'patients',
    resource: 'patients', status: 'success', riskLevel: 'low',
  });
  return c.json(result);
});

patients.get('/:id', requirePermission('patients', 'patients', 'read'), async (c) => {
  const session = c.get('session');
  const patient = db.findOne(
    `SELECT p.*, b.name as branch_name FROM patients p
     LEFT JOIN branches b ON b.id = p.branch_id WHERE p.id = ?`,
    [c.req.param('id')],
  );
  if (!patient) return c.json({ error: 'Patient not found' }, 404);

  await auditLogger.log({
    userId: session.userId, action: 'PATIENT_VIEWED', module: 'patients',
    resource: 'patients', resourceId: c.req.param('id'),
    status: 'success', riskLevel: 'low',
  });
  return c.json({ patient });
});

patients.post('/', requirePermission('patients', 'patients', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();
  const branchId = body.branchId ?? session.branchId;
  if (!branchId) return c.json({ error: 'Branch ID required' }, 400);

  const patientNumber = generateSequentialNumber(db, 'AFC', 'patients', 'patient_number');
  const id = generateId();

  db.run(
    `INSERT INTO patients (id, patient_number, branch_id, first_name, middle_name, last_name,
     date_of_birth, gender, blood_group, national_id, phone, email, marital_status,
     occupation, nationality, address, city, county, next_of_kin_name, next_of_kin_relation,
     next_of_kin_phone, nhif_number, nhif_card_number, insurance_provider,
     insurance_number, allergies, chronic_conditions, registered_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, patientNumber, branchId, body.firstName, body.middleName ?? null,
      body.lastName, body.dateOfBirth, body.gender, body.bloodGroup ?? null,
      body.nationalId ?? null, body.phone ?? null, body.email ?? null,
      body.maritalStatus ?? null, body.occupation ?? null,
      body.nationality ?? 'Kenyan', body.address ?? null, body.city ?? null,
      body.county ?? null, body.nextOfKinName ?? null, body.nextOfKinRelation ?? null,
      body.nextOfKinPhone ?? null, body.nhifNumber ?? null, body.nhifCardNumber ?? null,
      body.insuranceProvider ?? null, body.insuranceNumber ?? null,
      JSON.stringify(body.allergies ?? []),
      JSON.stringify(body.chronicConditions ?? []),
      session.userId,
    ],
  );

  await auditLogger.log({
    userId: session.userId, action: 'PATIENT_CREATED', module: 'patients',
    resource: 'patients', resourceId: id,
    newValues: { patientNumber, name: `${body.firstName} ${body.lastName}` },
    status: 'success', riskLevel: 'low',
  });
  return c.json({ id, patientNumber }, 201);
});

patients.put('/:id', requirePermission('patients', 'patients', 'update'), async (c) => {
  const session = c.get('session');
  const id = c.req.param('id');
  const body = await c.req.json();

  const before = db.findOne<Record<string, unknown>>(`SELECT * FROM patients WHERE id = ?`, [id]);
  if (!before) return c.json({ error: 'Patient not found' }, 404);

  db.update('patients', id, {
    first_name: body.firstName, middle_name: body.middleName,
    last_name: body.lastName, date_of_birth: body.dateOfBirth,
    gender: body.gender, blood_group: body.bloodGroup,
    national_id: body.nationalId, phone: body.phone, email: body.email,
    address: body.address, city: body.city, county: body.county,
    allergies: JSON.stringify(body.allergies ?? []),
    chronic_conditions: JSON.stringify(body.chronicConditions ?? []),
    nhif_number: body.nhifNumber, insurance_provider: body.insuranceProvider,
    insurance_number: body.insuranceNumber,
  });

  const after = db.findOne<Record<string, unknown>>(`SELECT * FROM patients WHERE id = ?`, [id]);
  const diff = computeDiff(before, after!);

  await auditLogger.log({
    userId: session.userId, action: 'PATIENT_UPDATED', module: 'patients',
    resource: 'patients', resourceId: id,
    previousValues: diff.previousValues, newValues: diff.newValues,
    changedFields: diff.changedFields, status: 'success', riskLevel: 'low',
  });
  return c.json({ success: true });
});

patients.get('/:id/vitals', requirePermission('patients', 'vitals', 'read'), async (c) => {
  const vitals = db.query(
    `SELECT pv.*, u.first_name || ' ' || u.last_name as recorded_by_name
     FROM patient_vitals pv LEFT JOIN users u ON u.id = pv.recorded_by
     WHERE pv.patient_id = ? ORDER BY pv.recorded_at DESC LIMIT 20`,
    [c.req.param('id')],
  );
  return c.json({ vitals: vitals.rows });
});

patients.post('/:id/vitals', requirePermission('patients', 'vitals', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();
  const patientId = c.req.param('id');

  const bmi = body.weight && body.height
    ? (body.weight / ((body.height / 100) ** 2)).toFixed(1)
    : null;

  const id = generateId();
  db.run(
    `INSERT INTO patient_vitals (id, patient_id, visit_id, branch_id, recorded_by,
     temperature, temperature_method, pulse_rate, respiratory_rate,
     blood_pressure_systolic, blood_pressure_diastolic, bp_position,
     oxygen_saturation, weight, height, bmi, blood_glucose, pain_scale, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, patientId, body.visitId ?? null, body.branchId ?? session.branchId,
      session.userId, body.temperature ?? null, body.temperatureMethod ?? null,
      body.pulseRate ?? null, body.respiratoryRate ?? null,
      body.bpSystolic ?? null, body.bpDiastolic ?? null, body.bpPosition ?? null,
      body.oxygenSaturation ?? null, body.weight ?? null, body.height ?? null,
      bmi, body.bloodGlucose ?? null, body.painScale ?? null, body.notes ?? null,
    ],
  );
  return c.json({ id }, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// VISITS / ENCOUNTERS
// ─────────────────────────────────────────────────────────────────────────────
const visits = new Hono();
visits.use('*', requireAuth);

visits.get('/', requirePermission('clinical', 'visits', 'read'), async (c) => {
  const session = c.get('session');
  const { patientId, status, doctorId, date, page = '1', pageSize = '25' } = c.req.query();

  let where = 'WHERE 1=1';
  const params: (string | number | null)[] = [];
  if (session.branchId) { where += ' AND v.branch_id = ?'; params.push(session.branchId); }
  if (patientId) { where += ' AND v.patient_id = ?'; params.push(patientId); }
  if (status) { where += ' AND v.status = ?'; params.push(status); }
  if (doctorId) { where += ' AND v.attending_doctor_id = ?'; params.push(doctorId); }
  if (date) { where += ' AND DATE(v.check_in_time) = ?'; params.push(date); }

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
    params, parseInt(page), parseInt(pageSize),
  );
  return c.json(result);
});

visits.post('/', requirePermission('clinical', 'visits', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();

  const visitNumber = generateSequentialNumber(db, 'VIS', 'visits', 'visit_number');
  const id = generateId();

  db.run(
    `INSERT INTO visits (id, visit_number, branch_id, patient_id, appointment_id,
     visit_type, department_id, attending_doctor_id, triage_level,
     chief_complaint, presenting_complaints, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, visitNumber, body.branchId ?? session.branchId, body.patientId,
      body.appointmentId ?? null, body.visitType ?? 'opd',
      body.departmentId ?? null, body.doctorId ?? session.userId,
      body.triageLevel ?? null, body.chiefComplaint ?? null,
      JSON.stringify(body.presentingComplaints ?? []), session.userId,
    ],
  );

  await auditLogger.log({
    userId: session.userId, action: 'VISIT_CREATED', module: 'clinical',
    resource: 'visits', resourceId: id,
    newValues: { visitNumber, patientId: body.patientId, type: body.visitType },
    status: 'success', riskLevel: 'low',
  });
  return c.json({ id, visitNumber }, 201);
});

visits.post('/:id/notes', requirePermission('clinical', 'notes', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();
  const visitId = c.req.param('id');

  const visit = db.findOne(`SELECT patient_id FROM visits WHERE id = ?`, [visitId]);
  if (!visit) return c.json({ error: 'Visit not found' }, 404);

  const id = generateId();
  db.run(
    `INSERT INTO clinical_notes (id, visit_id, patient_id, note_type, content, created_by)
     VALUES (?,?,?,?,?,?)`,
    [id, visitId, (visit as any).patient_id, body.noteType, body.content, session.userId],
  );
  return c.json({ id }, 201);
});

visits.post('/:id/diagnoses', requirePermission('clinical', 'diagnoses', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();
  const visitId = c.req.param('id');

  const visit = db.findOne(`SELECT patient_id FROM visits WHERE id = ?`, [visitId]);
  if (!visit) return c.json({ error: 'Visit not found' }, 404);

  const id = generateId();
  db.run(
    `INSERT INTO diagnoses (id, visit_id, patient_id, icd10_code, icd10_description,
     diagnosis_text, diagnosis_type, severity, is_primary, diagnosed_by, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, visitId, (visit as any).patient_id,
      body.icd10Code ?? null, body.icd10Description ?? null,
      body.diagnosisText, body.diagnosisType ?? 'working',
      body.severity ?? null, body.isPrimary ? 1 : 0, session.userId, body.notes ?? null,
    ],
  );
  return c.json({ id }, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// PRESCRIPTIONS
// ─────────────────────────────────────────────────────────────────────────────
const prescriptions = new Hono();
prescriptions.use('*', requireAuth);

prescriptions.post('/', requirePermission('pharmacy', 'prescriptions', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();

  const rxNumber = generateSequentialNumber(db, 'RX', 'prescriptions', 'prescription_number');
  const rxId = generateId();

  db.transaction(() => {
    db.run(
      `INSERT INTO prescriptions (id, prescription_number, branch_id, patient_id,
       visit_id, prescribed_by, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [
        rxId, rxNumber, body.branchId ?? session.branchId,
        body.patientId, body.visitId ?? null, session.userId, body.notes ?? null,
      ],
    );

    for (const item of body.items ?? []) {
      db.run(
        `INSERT INTO prescription_items (id, prescription_id, drug_id, drug_name,
         dose, frequency, route, duration_days, quantity_prescribed, instructions, indication)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          generateId(), rxId, item.drugId, item.drugName,
          item.dose, item.frequency, item.route,
          item.durationDays ?? null, item.quantity ?? null,
          item.instructions ?? null, item.indication ?? null,
        ],
      );
    }
  });

  await auditLogger.log({
    userId: session.userId, action: 'PRESCRIPTION_CREATED', module: 'pharmacy',
    resource: 'prescriptions', resourceId: rxId,
    newValues: { rxNumber, patientId: body.patientId, itemCount: body.items?.length ?? 0 },
    status: 'success', riskLevel: 'medium',
  });
  return c.json({ id: rxId, rxNumber }, 201);
});

prescriptions.post('/:id/dispense', requirePermission('pharmacy', 'dispensing', 'create'), async (c) => {
  const session = c.get('session');
  const rxId = c.req.param('id');
  const body = await c.req.json(); // { items: [{ itemId, quantityDispensed, inventoryId }] }

  db.transaction(() => {
    for (const item of body.items ?? []) {
      // Update prescription item
      db.run(
        `UPDATE prescription_items SET quantity_dispensed = ?, is_dispensed = 1,
         dispensed_by = ?, dispensed_at = datetime('now') WHERE id = ?`,
        [item.quantityDispensed, session.userId, item.itemId],
      );
      // Deduct from pharmacy inventory
      db.run(
        `UPDATE pharmacy_inventory SET quantity_in_stock = quantity_in_stock - ?,
         updated_at = datetime('now') WHERE id = ?`,
        [item.quantityDispensed, item.inventoryId],
      );
      // Record transaction
      db.run(
        `INSERT INTO pharmacy_transactions (id, branch_id, inventory_id, transaction_type,
         quantity, reference_id, reference_type, performed_by)
         VALUES (?,?,?,'dispensing',?,?,?,?)`,
        [
          generateId(), session.branchId, item.inventoryId,
          item.quantityDispensed, rxId, 'prescription', session.userId,
        ],
      );
    }
    // Check if fully dispensed
    const pending = db.count('prescription_items', 'prescription_id = ? AND is_dispensed = 0', [rxId]);
    db.run(
      `UPDATE prescriptions SET status = ? WHERE id = ?`,
      [pending === 0 ? 'dispensed' : 'partial', rxId],
    );
  });

  await auditLogger.log({
    userId: session.userId, action: 'PRESCRIPTION_DISPENSED', module: 'pharmacy',
    resource: 'prescriptions', resourceId: rxId, status: 'success', riskLevel: 'medium',
  });
  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// LABORATORY
// ─────────────────────────────────────────────────────────────────────────────
const lab = new Hono();
lab.use('*', requireAuth);

lab.get('/catalog', requirePermission('laboratory', 'catalog', 'read'), async (c) => {
  const { category, q } = c.req.query();
  let where = 'WHERE is_active = 1';
  const params: (string | number | null)[] = [];
  if (category) { where += ' AND category = ?'; params.push(category); }
  if (q) { where += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  const catalog = db.query(`SELECT * FROM lab_test_catalog ${where} ORDER BY name`, params);
  return c.json({ catalog: catalog.rows });
});

lab.post('/requests', requirePermission('laboratory', 'requests', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();

  const requestNumber = generateSequentialNumber(db, 'LAB', 'lab_requests', 'request_number');
  const requestId = generateId();

  db.transaction(() => {
    db.run(
      `INSERT INTO lab_requests (id, request_number, branch_id, patient_id,
       visit_id, requested_by, urgency, clinical_info)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        requestId, requestNumber, body.branchId ?? session.branchId,
        body.patientId, body.visitId ?? null, session.userId,
        body.urgency ?? 'routine', body.clinicalInfo ?? null,
      ],
    );
    for (const testId of body.testIds ?? []) {
      db.run(
        `INSERT INTO lab_request_items (id, request_id, test_id) VALUES (?,?,?)`,
        [generateId(), requestId, testId],
      );
    }
  });

  await auditLogger.log({
    userId: session.userId, action: 'LAB_REQUEST_CREATED', module: 'laboratory',
    resource: 'lab_requests', resourceId: requestId,
    newValues: { requestNumber, tests: body.testIds?.length ?? 0 },
    status: 'success', riskLevel: 'low',
  });
  return c.json({ id: requestId, requestNumber }, 201);
});

lab.post('/requests/:id/results', requirePermission('laboratory', 'results', 'create'), async (c) => {
  const session = c.get('session');
  const requestId = c.req.param('id');
  const body = await c.req.json(); // { results: [{ itemId, value, flag, notes }] }

  db.transaction(() => {
    for (const result of body.results ?? []) {
      db.run(
        `UPDATE lab_request_items SET result_value = ?, result_flag = ?,
         result_notes = ?, status = 'resulted', resulted_by = ?, resulted_at = datetime('now')
         WHERE id = ?`,
        [result.value, result.flag ?? 'normal', result.notes ?? null, session.userId, result.itemId],
      );
    }
    db.run(
      `UPDATE lab_requests SET status = 'resulted', resulted_at = datetime('now') WHERE id = ?`,
      [requestId],
    );
  });

  await auditLogger.log({
    userId: session.userId, action: 'LAB_RESULT_ENTERED', module: 'laboratory',
    resource: 'lab_requests', resourceId: requestId, status: 'success', riskLevel: 'medium',
  });
  return c.json({ success: true });
});

lab.post('/requests/:id/verify', requirePermission('laboratory', 'results', 'approve'), async (c) => {
  const session = c.get('session');
  const requestId = c.req.param('id');

  db.run(
    `UPDATE lab_requests SET status = 'verified', verified_by = ?, verified_at = datetime('now') WHERE id = ?`,
    [session.userId, requestId],
  );
  db.run(
    `UPDATE lab_request_items SET status = 'resulted' WHERE request_id = ? AND status = 'processing'`,
    [requestId],
  );

  await auditLogger.log({
    userId: session.userId, action: 'LAB_RESULT_VERIFIED', module: 'laboratory',
    resource: 'lab_requests', resourceId: requestId, status: 'success', riskLevel: 'medium',
  });
  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// BILLING
// ─────────────────────────────────────────────────────────────────────────────
const billing = new Hono();
billing.use('*', requireAuth);

billing.post('/invoices', requirePermission('finance', 'invoices', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();

  const invoiceNumber = generateSequentialNumber(db, 'INV', 'invoices', 'invoice_number');
  const invoiceId = generateId();

  let subtotal = 0;
  const processedItems: any[] = [];
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
        invoiceId, invoiceNumber, body.branchId ?? session.branchId,
        body.patientId, body.visitId ?? null, body.admissionId ?? null,
        body.paymentType ?? 'cash', body.insuranceProvider ?? null,
        subtotal, discountAmount, taxAmount, total, total,
        body.notes ?? null, session.userId,
        body.dueDate ?? null,
      ],
    );
    for (const item of processedItems) {
      db.run(
        `INSERT INTO invoice_items (id, invoice_id, catalog_item_id, description,
         category, quantity, unit_price, discount_amount, tax_amount, line_total,
         is_insurance_covered, insurance_amount, patient_amount, reference_id, reference_type)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          generateId(), invoiceId, item.catalogItemId ?? null,
          item.description, item.category, item.quantity, item.unitPrice,
          item.discountAmount ?? 0, item.taxAmount ?? 0, item.lineTotal,
          item.isInsuranceCovered ? 1 : 0, item.insuranceAmount ?? 0,
          item.patientAmount ?? item.lineTotal, item.referenceId ?? null, item.referenceType ?? null,
        ],
      );
    }
  });

  await auditLogger.log({
    userId: session.userId, action: 'INVOICE_CREATED', module: 'finance',
    resource: 'invoices', resourceId: invoiceId,
    newValues: { invoiceNumber, total, patientId: body.patientId },
    status: 'success', riskLevel: 'medium',
  });
  return c.json({ id: invoiceId, invoiceNumber, total }, 201);
});

billing.post('/invoices/:id/payment', requirePermission('finance', 'payments', 'create'), async (c) => {
  const session = c.get('session');
  const invoiceId = c.req.param('id');
  const body = await c.req.json();

  const invoice = db.findOne<{ patient_id: string; total_amount: number; balance_due: number }>(
    `SELECT patient_id, total_amount, balance_due FROM invoices WHERE id = ?`,
    [invoiceId],
  );
  if (!invoice) return c.json({ error: 'Invoice not found' }, 404);
  if (body.amount > invoice.balance_due + 0.01) {
    return c.json({ error: 'Payment exceeds balance due' }, 400);
  }

  const receiptNumber = generateSequentialNumber(db, 'RCP', 'payments', 'receipt_number');
  const paymentId = generateId();

  db.run(
    `INSERT INTO payments (id, payment_number, branch_id, invoice_id, patient_id,
     amount, payment_method, mpesa_transaction_id, card_last_four, bank_reference,
     receipt_number, cashier_id, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      paymentId, receiptNumber, session.branchId, invoiceId, invoice.patient_id,
      body.amount, body.paymentMethod, body.mpesaTransactionId ?? null,
      body.cardLastFour ?? null, body.bankReference ?? null,
      receiptNumber, session.userId, body.notes ?? null,
    ],
  );
  // Trigger handles invoice balance update

  await auditLogger.log({
    userId: session.userId, action: 'PAYMENT_RECEIVED', module: 'finance',
    resource: 'payments', resourceId: paymentId,
    newValues: { amount: body.amount, method: body.paymentMethod, receiptNumber },
    status: 'success', riskLevel: 'medium',
  });
  return c.json({ id: paymentId, receiptNumber }, 201);
});

billing.post('/invoices/:id/void', requirePermission('finance', 'invoices', 'void'), async (c) => {
  const session = c.get('session');
  const invoiceId = c.req.param('id');
  const { reason } = await c.req.json();

  const invoice = db.findOne(`SELECT * FROM invoices WHERE id = ?`, [invoiceId]);
  if (!invoice) return c.json({ error: 'Invoice not found' }, 404);
  if ((invoice as any).status === 'voided') return c.json({ error: 'Already voided' }, 400);

  db.run(
    `UPDATE invoices SET status = 'voided', voided_by = ?, void_reason = ?,
     updated_at = datetime('now') WHERE id = ?`,
    [session.userId, reason, invoiceId],
  );

  await auditLogger.log({
    userId: session.userId, action: 'INVOICE_VOIDED', module: 'finance',
    resource: 'invoices', resourceId: invoiceId,
    previousValues: { status: (invoice as any).status },
    newValues: { status: 'voided', reason },
    status: 'success', riskLevel: 'high',
  });
  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMISSIONS (IPD)
// ─────────────────────────────────────────────────────────────────────────────
const admissions = new Hono();
admissions.use('*', requireAuth);

admissions.get('/beds', requirePermission('clinical', 'beds', 'read'), async (c) => {
  const { wardId, status } = c.req.query();
  let where = 'WHERE 1=1';
  const params: (string | number | null)[] = [];
  if (wardId) { where += ' AND b.ward_id = ?'; params.push(wardId); }
  if (status) { where += ' AND b.status = ?'; params.push(status); }
  const beds = db.query(
    `SELECT b.*, w.name as ward_name, w.type as ward_type,
            p.first_name || ' ' || p.last_name as current_patient
     FROM beds b JOIN wards w ON w.id = b.ward_id
     LEFT JOIN admissions a ON a.bed_id = b.id AND a.status = 'active'
     LEFT JOIN patients p ON p.id = a.patient_id
     ${where} ORDER BY w.name, b.bed_number`,
    params,
  );
  return c.json({ beds: beds.rows });
});

admissions.post('/', requirePermission('clinical', 'admissions', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();

  const admissionNumber = generateSequentialNumber(db, 'ADM', 'admissions', 'admission_number');
  const id = generateId();

  // Verify bed is available
  const bed = db.findOne<{ status: string }>(
    `SELECT status FROM beds WHERE id = ?`, [body.bedId],
  );
  if (!bed || bed.status !== 'available') {
    return c.json({ error: 'Bed is not available' }, 400);
  }

  db.run(
    `INSERT INTO admissions (id, admission_number, branch_id, patient_id, visit_id,
     ward_id, bed_id, admitting_doctor_id, admitting_diagnosis, admission_type,
     expected_discharge, notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, admissionNumber, body.branchId ?? session.branchId,
      body.patientId, body.visitId, body.wardId, body.bedId,
      body.doctorId ?? session.userId, body.admittingDiagnosis,
      body.admissionType ?? 'elective', body.expectedDischarge ?? null, body.notes ?? null,
    ],
  );
  // Update visit status
  db.run(`UPDATE visits SET status = 'admitted', admission_id = ? WHERE id = ?`, [id, body.visitId]);

  await auditLogger.log({
    userId: session.userId, action: 'ADMISSION_CREATED', module: 'clinical',
    resource: 'admissions', resourceId: id,
    newValues: { admissionNumber, patientId: body.patientId, bedId: body.bedId },
    status: 'success', riskLevel: 'medium',
  });
  return c.json({ id, admissionNumber }, 201);
});

admissions.post('/:id/discharge', requirePermission('clinical', 'admissions', 'update'), async (c) => {
  const session = c.get('session');
  const admissionId = c.req.param('id');
  const body = await c.req.json();

  const admission = db.findOne(`SELECT * FROM admissions WHERE id = ?`, [admissionId]);
  if (!admission) return c.json({ error: 'Admission not found' }, 404);

  const los = Math.ceil(
    (Date.now() - new Date((admission as any).admission_datetime).getTime()) / 86_400_000,
  );

  db.run(
    `UPDATE admissions SET status = ?, actual_discharge = datetime('now'),
     discharge_doctor_id = ?, discharge_diagnosis = ?,
     discharge_condition = ?, discharge_summary = ?,
     length_of_stay = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      body.transferTo ? 'transferred' : 'discharged',
      session.userId, body.dischargeDiagnosis ?? null,
      body.dischargeCondition, body.dischargeSummary ?? null,
      los, admissionId,
    ],
  );
  db.run(
    `UPDATE visits SET status = 'discharged', check_out_time = datetime('now'),
     discharge_condition = ?, follow_up_date = ?, follow_up_instructions = ?
     WHERE id = ?`,
    [
      body.dischargeCondition, body.followUpDate ?? null,
      body.followUpInstructions ?? null, (admission as any).visit_id,
    ],
  );

  await auditLogger.log({
    userId: session.userId, action: 'PATIENT_DISCHARGED', module: 'clinical',
    resource: 'admissions', resourceId: admissionId,
    newValues: { condition: body.dischargeCondition, los },
    status: 'success', riskLevel: 'medium',
  });
  return c.json({ success: true, lengthOfStay: los });
});

// ─────────────────────────────────────────────────────────────────────────────
// APPOINTMENTS
// ─────────────────────────────────────────────────────────────────────────────
const appointments = new Hono();
appointments.use('*', requireAuth);

appointments.get('/', requirePermission('clinical', 'appointments', 'read'), async (c) => {
  const session = c.get('session');
  const { date, doctorId, status, page = '1', pageSize = '25' } = c.req.query();

  let where = 'WHERE 1=1';
  const params: (string | number | null)[] = [];
  if (session.branchId) { where += ' AND a.branch_id = ?'; params.push(session.branchId); }
  if (date) { where += ' AND a.appointment_date = ?'; params.push(date); }
  if (doctorId) { where += ' AND a.doctor_id = ?'; params.push(doctorId); }
  if (status) { where += ' AND a.status = ?'; params.push(status); }

  const result = db.paginate(
    `SELECT a.*, p.first_name || ' ' || p.last_name as patient_name, p.patient_number,
            p.phone as patient_phone,
            d.first_name || ' ' || d.last_name as doctor_name
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     LEFT JOIN users d ON d.id = a.doctor_id
     ${where} ORDER BY a.appointment_date, a.appointment_time`,
    `SELECT COUNT(*) as total FROM appointments a ${where}`,
    params, parseInt(page), parseInt(pageSize),
  );
  return c.json(result);
});

appointments.post('/', requirePermission('clinical', 'appointments', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();

  const apptNumber = generateSequentialNumber(db, 'APT', 'appointments', 'appointment_number');
  const id = generateId();

  db.run(
    `INSERT INTO appointments (id, appointment_number, branch_id, patient_id,
     doctor_id, department_id, appointment_date, appointment_time, end_time,
     type, reason, priority, notes, booked_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, apptNumber, body.branchId ?? session.branchId, body.patientId,
      body.doctorId, body.departmentId ?? null, body.date, body.time, body.endTime ?? null,
      body.type ?? 'opd', body.reason, body.priority ?? 'normal',
      body.notes ?? null, session.userId,
    ],
  );
  return c.json({ id, apptNumber }, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS / DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
const analytics = new Hono();
analytics.use('*', requireAuth);

analytics.get('/dashboard', requirePermission('analytics', 'dashboard', 'read'), async (c) => {
  const session = c.get('session');
  const branchFilter = session.branchId ? `AND branch_id = '${session.branchId}'` : '';
  const today = new Date().toISOString().split('T')[0];

  const [
    todayVisits, activeAdmissions, pendingLab, pendingPayments,
    availableBeds, todayRevenue, expiringDrugs, todayAppointments,
  ] = [
    db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM visits WHERE DATE(check_in_time) = ? ${branchFilter}`, [today],
    ).rows[0]?.count ?? 0,

    db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM admissions WHERE status = 'active' ${branchFilter}`,
    ).rows[0]?.count ?? 0,

    db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM lab_requests WHERE status IN ('pending','specimen_collected','processing') ${branchFilter}`,
    ).rows[0]?.count ?? 0,

    db.query<{ total: number }>(
      `SELECT COALESCE(SUM(balance_due), 0) as total FROM invoices WHERE status IN ('pending','partial') ${branchFilter}`,
    ).rows[0]?.total ?? 0,

    db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM beds WHERE status = 'available'`,
    ).rows[0]?.count ?? 0,

    db.query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE DATE(payment_date) = ? ${branchFilter}`, [today],
    ).rows[0]?.total ?? 0,

    db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM pharmacy_inventory WHERE expiry_date <= date('now', '+30 days') AND quantity_in_stock > 0 ${branchFilter}`,
    ).rows[0]?.count ?? 0,

    db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM appointments WHERE appointment_date = ? ${branchFilter}`, [today],
    ).rows[0]?.count ?? 0,
  ];

  // Weekly visit trend
  const visitTrend = db.query(
    `SELECT DATE(check_in_time) as date, COUNT(*) as count
     FROM visits WHERE check_in_time >= date('now', '-7 days') ${branchFilter}
     GROUP BY DATE(check_in_time) ORDER BY date`,
  ).rows;

  // Revenue by payment method (last 30 days)
  const revenueByMethod = db.query(
    `SELECT payment_method, SUM(amount) as total
     FROM payments WHERE payment_date >= date('now', '-30 days') ${branchFilter}
     GROUP BY payment_method`,
  ).rows;

  // Department visit breakdown today
  const deptBreakdown = db.query(
    `SELECT dep.name, COUNT(v.id) as count
     FROM visits v LEFT JOIN departments dep ON dep.id = v.department_id
     WHERE DATE(v.check_in_time) = ? ${branchFilter}
     GROUP BY dep.name ORDER BY count DESC LIMIT 10`,
    [today],
  ).rows;

  return c.json({
    summary: {
      todayVisits, activeAdmissions, pendingLab, pendingPayments,
      availableBeds, todayRevenue, expiringDrugs, todayAppointments,
    },
    charts: { visitTrend, revenueByMethod, deptBreakdown },
  });
});

analytics.get('/kpis', requirePermission('analytics', 'kpis', 'read'), async (c) => {
  const branchFilter = c.get('session').branchId ? `AND branch_id = '${c.get('session').branchId}'` : '';

  const bedOccupancy = db.query<{ occupied: number; total: number }>(
    `SELECT
       SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
       COUNT(*) as total FROM beds`,
  ).rows[0];

  const avgLos = db.query<{ avg_los: number }>(
    `SELECT AVG(length_of_stay) as avg_los FROM admissions
     WHERE status = 'discharged' AND length_of_stay IS NOT NULL ${branchFilter}`,
  ).rows[0]?.avg_los ?? 0;

  const collectionRate = db.query<{ collected: number; billed: number }>(
    `SELECT
       COALESCE(SUM(paid_amount), 0) as collected,
       COALESCE(SUM(total_amount), 0) as billed
     FROM invoices WHERE status != 'voided' ${branchFilter}`,
  ).rows[0];

  return c.json({
    bedOccupancyRate: bedOccupancy?.total
      ? ((bedOccupancy.occupied / bedOccupancy.total) * 100).toFixed(1)
      : '0',
    averageLengthOfStay: avgLos.toFixed(1),
    collectionRate: collectionRate?.billed
      ? ((collectionRate.collected / collectionRate.billed) * 100).toFixed(1)
      : '0',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// USERS & STAFF
// ─────────────────────────────────────────────────────────────────────────────
const users = new Hono();
users.use('*', requireAuth);

users.get('/', requirePermission('hr', 'users', 'read'), async (c) => {
  const { roleId, branchId, q, page = '1', pageSize = '25' } = c.req.query();
  let where = 'WHERE u.is_active = 1';
  const params: (string | number | null)[] = [];
  if (roleId) { where += ' AND u.role_id = ?'; params.push(roleId); }
  if (branchId) { where += ' AND u.branch_id = ?'; params.push(branchId); }
  if (q) {
    where += ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.username LIKE ?)';
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
    params, parseInt(page), parseInt(pageSize),
  );
  return c.json(result);
});

users.post('/', requirePermission('hr', 'users', 'create'), async (c) => {
  const session = c.get('session');
  const body = await c.req.json();

  if (!licenseService.canAddUser()) {
    return c.json({ error: 'User limit reached for your license. Please upgrade.' }, 403);
  }

  const result = await authService.createUser({
    username: body.username, email: body.email, password: body.password,
    firstName: body.firstName, lastName: body.lastName,
    roleId: body.roleId, branchId: body.branchId, departmentId: body.departmentId,
    createdBy: session.userId,
  });

  if (!result.success) return c.json({ error: result.error }, 400);
  await auditLogger.log({
    userId: session.userId, action: 'USER_CREATED', module: 'hr',
    resource: 'users', resourceId: result.userId,
    newValues: { username: body.username, role: body.roleId },
    status: 'success', riskLevel: 'medium',
  });
  return c.json({ id: result.userId }, 201);
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOGS
// ─────────────────────────────────────────────────────────────────────────────
const auditRoutes = new Hono();
auditRoutes.use('*', requireAuth, requirePermission('admin', 'audit', 'read'));

auditRoutes.get('/', async (c) => {
  const query = c.req.query();
  const result = auditLogger.search({
    userId: query.userId, module: query.module, action: query.action,
    branchId: query.branchId, startDate: query.startDate, endDate: query.endDate,
    riskLevel: query.riskLevel as any, status: query.status as any,
    page: parseInt(query.page ?? '1'), pageSize: parseInt(query.pageSize ?? '50'),
  });
  return c.json(result);
});

auditRoutes.get('/export', async (c) => {
  const query = c.req.query();
  const csv = auditLogger.exportToCsv({
    startDate: query.startDate, endDate: query.endDate,
    module: query.module, branchId: query.branchId,
  });
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="afyacore_audit_${Date.now()}.csv"`,
    },
  });
});

auditRoutes.get('/verify', async (c) => {
  const result = auditLogger.verifyIntegrity();
  return c.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM / LICENSE
// ─────────────────────────────────────────────────────────────────────────────
const system = new Hono();
system.use('*', requireAuth);

system.get('/license', async (c) => {
  const status = licenseService.validateLicense();
  return c.json({ license: status });
});

system.post('/license/activate', requirePermission('admin', 'license', 'update'), async (c) => {
  const { licenseKey } = await c.req.json();
  const result = await licenseService.activateLicense(licenseKey);
  if (!result.valid) return c.json({ error: result.error }, 400);
  return c.json({ success: true, license: result });
});

system.get('/license/fingerprint', async (c) => {
  const fp = licenseService.getHardwareFingerprint();
  return c.json({ fingerprint: fp.fingerprint, details: fp });
});

system.get('/health', async (c) => {
  const dbOk = db.ready;
  const licOk = licenseService.validateLicense().active;
  return c.json({
    status: dbOk && licOk ? 'healthy' : 'degraded',
    database: dbOk, license: licOk,
    timestamp: new Date().toISOString(),
  });
});

system.post('/backup', requirePermission('admin', 'system', 'create'), async (c) => {
  const session = c.get('session');
  const { destPath } = await c.req.json();
  try {
    db.backup(destPath);
    await auditLogger.log({
      userId: session.userId, action: 'BACKUP_CREATED', module: 'admin',
      resource: 'system', status: 'success', riskLevel: 'medium',
      newValues: { path: destPath },
    });
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MOUNT ALL ROUTES
// ─────────────────────────────────────────────────────────────────────────────
apiRouter.route('/auth', auth);
apiRouter.route('/patients', patients);
apiRouter.route('/visits', visits);
apiRouter.route('/prescriptions', prescriptions);
apiRouter.route('/lab', lab);
apiRouter.route('/billing', billing);
apiRouter.route('/admissions', admissions);
apiRouter.route('/appointments', appointments);
apiRouter.route('/analytics', analytics);
apiRouter.route('/users', users);
apiRouter.route('/audit', auditRoutes);
apiRouter.route('/system', system);
