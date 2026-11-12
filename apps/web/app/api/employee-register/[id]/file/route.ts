import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { inOrgScope } from "@/lib/auth/scope";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { downloadRegister } from "@/lib/register/service";

// Open an uploaded employee register (migration 0070): the Super Admin and HR, inside the units where their
// role holds employee_register.view. The file holds personal data, so every opening is audited.

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (session.status !== "active") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const who = session.session;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!who.isAdmin && !who.permissions.includes("employee_register.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sql = db();
  const [r] = await sql<{ org_unit_id: string; storage_path: string; file_name: string }[]>`
    select org_unit_id, storage_path, file_name from public.employee_registers where id = ${id.data}`;
  // Out of scope and missing read the same.
  if (!r || !(await inOrgScope(sql, who, r.org_unit_id, "employee_register.view"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const blob = await downloadRegister(r.storage_path);
  if (!blob) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sql.begin(async (tx) => {
    await writeAudit(tx, {
      eventType: "employee_register.file_downloaded",
      entityType: "employee_register",
      entityId: id.data,
      userId: who.userId,
      newValue: { file_name: r.file_name },
    });
  });
  const name = r.file_name.replace(/[^A-Za-z0-9._-]+/g, "_") || "register";
  return new NextResponse(blob, {
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
