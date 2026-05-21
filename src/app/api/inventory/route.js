/**
 * FILE: src/app/api/inventory/route.js
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
    const category = searchParams.get("category");
    const search   = searchParams.get("search") || "";

    const [user] = await sql(
      "SELECT facility_id FROM auth_users WHERE id = ?",
      [session.user.id]
    );

    const like = `%${search}%`;
    let query = "SELECT * FROM inventory WHERE facility_id = ? AND (LOWER(item_name) LIKE LOWER(?) OR sku LIKE ?)";
    const args = [user.facility_id, like, like];

    if (category) { query += " AND category = ?"; args.push(category); }
    query += " ORDER BY item_name ASC";

    const items = await sql(query, args);
    return Response.json({ items });
  } catch (error) {
    console.error("GET /api/inventory error:", error);
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

    const [item] = await sql(
      `INSERT INTO inventory
         (facility_id, item_name, category, sku, quantity, unit, buying_price, selling_price, reorder_level, expiry_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.facility_id,
        body.itemName,
        body.category    || null,
        body.sku         || null,
        body.quantity    || 0,
        body.unit        || null,
        body.buyingPrice  || null,
        body.sellingPrice || null,
        body.reorderLevel || 10,
        body.expiryDate   || null,
      ]
    );

    await auditLog({
      facilityId: user.facility_id,
      userId: session.user.id,
      action: "INVENTORY_ADDED",
      module: "INVENTORY",
      recordId: item.id,
      newValue: { itemName: body.itemName, quantity: body.quantity, category: body.category },
      severity: "info",
      request,
    });

    return Response.json({ item });
  } catch (error) {
    console.error("POST /api/inventory error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await auth(request);
    if (!session?.user?.id)
      return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    if (!body.id)
      return Response.json({ error: "id required" }, { status: 400 });

    const [user] = await sql(
      "SELECT facility_id FROM auth_users WHERE id = ?",
      [session.user.id]
    );

    const [before] = await sql("SELECT * FROM inventory WHERE id = ? AND facility_id = ?", [body.id, user.facility_id]);
    if (!before)
      return Response.json({ error: "Item not found" }, { status: 404 });

    await sql(
      `UPDATE inventory SET item_name=?, category=?, sku=?, quantity=?, unit=?,
         buying_price=?, selling_price=?, reorder_level=?, expiry_date=?, updated_at=datetime('now')
       WHERE id = ?`,
      [
        body.itemName    ?? before.item_name,
        body.category    ?? before.category,
        body.sku         ?? before.sku,
        body.quantity    ?? before.quantity,
        body.unit        ?? before.unit,
        body.buyingPrice  ?? before.buying_price,
        body.sellingPrice ?? before.selling_price,
        body.reorderLevel ?? before.reorder_level,
        body.expiryDate   ?? before.expiry_date,
        body.id,
      ]
    );

    const severity = body.quantity !== undefined && body.quantity < (before.reorder_level || 10)
      ? "warning" : "info";

    await auditLog({
      facilityId: user.facility_id,
      userId: session.user.id,
      action: "INVENTORY_UPDATED",
      module: "INVENTORY",
      recordId: body.id,
      oldValue: { quantity: before.quantity, itemName: before.item_name },
      newValue: { quantity: body.quantity, itemName: body.itemName },
      severity,
      request,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("PUT /api/inventory error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}