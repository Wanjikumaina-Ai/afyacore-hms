import sql from "@/app/api/utils/sql.js";
import { auth } from "@/auth.js";

export async function GET(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [user] = await sql(
      `SELECT u.id, u.name, u.email, u.role, u.facility_id, u.department_id, f.name as facility_name
       FROM auth_users u LEFT JOIN facilities f ON u.facility_id = f.id WHERE u.id = ?`,
      [session.user.id]
    );

    if (!user)
      return Response.json({ error: "User not found" }, { status: 404 });
    return Response.json({ user });
  } catch (error) {
    console.error("GET /api/user/profile error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
