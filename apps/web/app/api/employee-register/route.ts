import { NextResponse } from "next/server";
import { z } from "zod";
import { assertOrgScope } from "@/lib/auth/scope";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ingestRegister } from "@/lib/register/service";
import { sameOriginRequest } from "@/lib/security/origin";

// Upload an employee register (migration 0083). The file is read once on the server; only the totals are kept
// and the original is stored privately. Same-origin only, like every state-changing request.

const form = z.object({
  orgUnitId: z.uuid(),
  financialYear: z.coerce.number().int().min(2000).max(2100),
});

export async function POST(request: Request) {
  const sameOrigin = sameOriginRequest({
    method: request.method,
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
  });
  if (!sameOrigin)
    return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
  const session = await getSessionContext();
  if (session.status !== "active") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const who = session.session;
  if (!who.isAdmin && !who.permissions.includes("employee_register.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await request.formData().catch(() => null);
  const file = data?.get("file");
  const parsed = form.safeParse({
    orgUnitId: data?.get("orgUnitId"),
    financialYear: data?.get("financialYear"),
  });
  if (!parsed.success || !(file instanceof File)) {
    return NextResponse.json({ error: "Choose a unit, a year and a file." }, { status: 400 });
  }
  try {
    await assertOrgScope(db(), who, parsed.data.orgUnitId, "employee_register.manage");
  } catch {
    return NextResponse.json({ error: "That unit is not in your scope." }, { status: 403 });
  }

  const result = await ingestRegister({ file, ...parsed.data, uploadedBy: who.userId });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
