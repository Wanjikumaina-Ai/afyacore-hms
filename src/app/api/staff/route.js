/**
 * FILE: src/app/api/staff/route.js
 *
 * Staff management: list staff, create staff member, update role/salary.
 * Requires admin or hr role.
 */

import sql from "@/app/api/utils/sql.js";
import { auditLog } from "@/app/api/utils/sql.js";
import { auth, hashPassword } from "@/auth.js";

// ── GET /api/staff ─────────────────────────────────────────────────────────
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
    const search = searchParams.get("search") || "";
    const like = `%${search}%`;

    const staff = await sql(
      `SELECT
         u.id, u.name, u.email, u.role, u.department_id, u.created_at,
         d.name AS department_name,
         sp.staff_number, sp.job_title, sp.employment_type,
         sp.basic_salary, sp.allowances, sp.hire_date, sp.is_active,
         sp.kra_pin, sp.nssf_number, sp.shif_number, sp.national_id,
         sp.bank_name, sp.bank_account, sp.date_of_birth
       FROM auth_users u
       LEFT JOIN departments d ON u.department_id = d.id
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       WHERE u.facility_id = ?
         AND (LOWER(u.name) LIKE LOWER(?) OR LOWER(u.email) LIKE LOWER(?) OR sp.staff_number LIKE ?)
       ORDER BY u.name ASC`,
      [user.facility_id, like, like, like]
    );

    const departments = await sql(
      "SELECT * FROM departments WHERE facility_id = ? ORDER BY name",
      [user.facility_id]
    );

    return Response.json({ staff, departments });
  } catch (error) {
    console.error("GET /api/staff error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ── POST /api/staff ────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [actor] = await sql(
      "SELECT facility_id, role FROM auth_users WHERE id = ?",
      [session.user.id]
    );
    if (!["admin", "hr"].includes(actor?.role))
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const {
      name, email, role = "staff", departmentId,
      jobTitle, employmentType = "full_time", basicSalary = 0, allowances = 0,
      bankName, bankAccount, kraPin, nssfNumber, shifNumber,
      nationalId, dateOfBirth, hireDate,
      password = "AfyaCore@2026",  // default password — staff must change on first login
    } = body;

    if (!name || !email)
      return Response.json({ error: "Name and email are required" }, { status: 400 });

    // Check for duplicate email
    const [existing] = await sql(
      "SELECT id FROM auth_users WHERE email = ? COLLATE NOCASE",
      [email]
    );
    if (existing)
      return Response.json({ error: "Email already registered" }, { status: 409 });

    const passwordHash = await hashPassword(password);

    // Generate staff number
    const [countRow] = await sql(
      "SELECT COUNT(*) as cnt FROM auth_users WHERE facility_id = ?",
      [actor.facility_id]
    );
    const staffNumber = `STF-${String(parseInt(countRow.cnt) + 1).padStart(4, "0")}`;

    // Create user
    const [newUser] = await sql(
      `INSERT INTO auth_users (name, email, password_hash, role, facility_id, department_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, email, passwordHash, role, actor.facility_id, departmentId || null]
    );

    // Create staff profile
    await sql(
      `INSERT INTO staff_profiles (
         user_id, staff_number, job_title, employment_type, basic_salary, allowances,
         bank_name, bank_account, kra_pin, nssf_number, shif_number,
         national_id, date_of_birth, hire_date
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newUser.id, staffNumber, jobTitle || null, employmentType,
        basicSalary, allowances, bankName || null, bankAccount || null,
        kraPin || null, nssfNumber || null, shifNumber || null,
        nationalId || null, dateOfBirth || null, hireDate || null,
      ]
    );

    await auditLog({
      facilityId: actor.facility_id,
      userId: session.user.id,
      action: "STAFF_CREATED",
      module: "STAFF",
      recordId: newUser.id,
      newValue: { name, email, role, staffNumber },
      severity: "info",
      request,
    });

    return Response.json({ success: true, staffNumber, userId: newUser.id });
  } catch (error) {
    console.error("POST /api/staff error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ── PUT /api/staff ─────────────────────────────────────────────────────────
export async function PUT(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [actor] = await sql(
      "SELECT facility_id, role FROM auth_users WHERE id = ?",
      [session.user.id]
    );
    if (!["admin", "hr"].includes(actor?.role))
      return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { userId, role, departmentId, basicSalary, allowances, jobTitle,
            bankName, bankAccount, kraPin, nssfNumber, shifNumber,
            isActive, employmentType } = body;

    if (!userId)
      return Response.json({ error: "userId required" }, { status: 400 });

    // Ensure the target user belongs to same facility
    const [target] = await sql(
      "SELECT id, name, role FROM auth_users WHERE id = ? AND facility_id = ?",
      [userId, actor.facility_id]
    );
    if (!target)
      return Response.json({ error: "Staff member not found" }, { status: 404 });

    const oldValues = { role: target.role };

    if (role !== undefined) {
      await sql("UPDATE auth_users SET role = ? WHERE id = ?", [role, userId]);
    }
    if (departmentId !== undefined) {
      await sql("UPDATE auth_users SET department_id = ? WHERE id = ?", [departmentId, userId]);
    }

    // Update staff profile fields
    const profileUpdates = {};
    if (basicSalary !== undefined)    profileUpdates.basic_salary     = basicSalary;
    if (allowances !== undefined)     profileUpdates.allowances        = allowances;
    if (jobTitle !== undefined)       profileUpdates.job_title         = jobTitle;
    if (bankName !== undefined)       profileUpdates.bank_name         = bankName;
    if (bankAccount !== undefined)    profileUpdates.bank_account      = bankAccount;
    if (kraPin !== undefined)         profileUpdates.kra_pin           = kraPin;
    if (nssfNumber !== undefined)     profileUpdates.nssf_number       = nssfNumber;
    if (shifNumber !== undefined)     profileUpdates.shif_number       = shifNumber;
    if (isActive !== undefined)       profileUpdates.is_active         = isActive ? 1 : 0;
    if (employmentType !== undefined) profileUpdates.employment_type   = employmentType;

    if (Object.keys(profileUpdates).length > 0) {
      const sets = Object.keys(profileUpdates).map(k => `${k} = ?`).join(", ");
      const vals = [...Object.values(profileUpdates), userId];
      await sql(`UPDATE staff_profiles SET ${sets} WHERE user_id = ?`, vals);
    }

    await auditLog({
      facilityId: actor.facility_id,
      userId: session.user.id,
      action: "STAFF_UPDATED",
      module: "STAFF",
      recordId: userId,
      oldValue: oldValues,
      newValue: { role, basicSalary, allowances, isActive },
      severity: role !== oldValues.role ? "warning" : "info",
      request,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("PUT /api/staff error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ── DELETE /api/staff ──────────────────────────────────────────────────────
export async function DELETE(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [actor] = await sql(
      "SELECT facility_id, role FROM auth_users WHERE id = ?",
      [session.user.id]
    );
    if (actor?.role !== "admin")
      return Response.json({ error: "Forbidden — admin only" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId)
      return Response.json({ error: "userId required" }, { status: 400 });

    if (parseInt(userId) === session.user.id)
      return Response.json({ error: "Cannot deactivate yourself" }, { status: 400 });

    // Soft-delete: mark inactive & set termination date
    await sql(
      `UPDATE staff_profiles SET is_active = 0, termination_date = datetime('now') WHERE user_id = ?`,
      [userId]
    );

    await auditLog({
      facilityId: actor.facility_id,
      userId: session.user.id,
      action: "STAFF_DEACTIVATED",
      module: "STAFF",
      recordId: userId,
      severity: "warning",
      request,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/staff error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}