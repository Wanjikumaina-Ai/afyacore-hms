/**
 * FILE: src/app/api/facility/onboard/route.js
 *
 * Called once during first-time setup to:
 *   1. Create the hospital facility record
 *   2. Seed default departments
 *   3. Assign the admin user to the facility
 *
 * POST { facilityName, role }
 */

import sql, { sqlTransaction } from '@/app/api/utils/sql.js';
import { auth } from '@/auth.js';

export async function POST(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { facilityName, role } = await request.json();
    const userId = session.user.id;

    const result = await sqlTransaction(async (txn) => {
      // 1. Create facility
      const facilities = await txn(
        'INSERT INTO facilities (name) VALUES (?)',
        [facilityName]
      );
      const facilityId = facilities[0]?.id;

      // 2. Seed default departments
      const depts = ['OPD', 'Triage', 'Consultation', 'Laboratory', 'Pharmacy', 'Billing'];
      for (const name of depts) {
        await txn(
          'INSERT INTO departments (facility_id, name) VALUES (?, ?)',
          [facilityId, name]
        );
      }

      // 3. Assign admin user to the facility
      await txn(
        'UPDATE auth_users SET role = ?, facility_id = ? WHERE id = ?',
        [role || 'admin', facilityId, userId]
      );

      return { facilityId };
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error('POST /api/facility/onboard error:', error);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
