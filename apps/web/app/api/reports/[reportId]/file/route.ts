import { NextResponse } from "next/server";
import { z } from "zod";
import { scopedOrgUnitIds } from "@/lib/auth/scope";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { reportsBucket } from "@/lib/reports/generate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// A generated report's PDF (App Flow §2.2 "download report file"). Private like evidence: every request
// re-checks the session, the `report.generate` permission and the caller's org scope; never cached.

export async function GET(
  request: Request,
  { params }: RouteContext<"/api/reports/[reportId]/file">,
) {
  const { reportId } = await params;
  const session = await getSessionContext();
  if (session.status !== "active") {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!session.session.permissions.includes("report.generate")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!z.uuid().safeParse(reportId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const scope = await scopedOrgUnitIds(db(), session.session);
  const [run] = await db()<{ storage_path: string | null; org_unit_name: string }[]>`
    select rr.storage_path, o.name as org_unit_name
    from public.report_runs rr join public.org_units o on o.id = rr.org_unit_id
    where rr.id = ${reportId} and rr.status = 'completed'
      and (${scope}::uuid[] is null or rr.org_unit_id = any(${scope}::uuid[]))`;
  if (!run?.storage_path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await createSupabaseAdminClient()
    .storage.from(reportsBucket())
    .download(run.storage_path);
  if (error || !data) {
    return NextResponse.json({ error: "The stored report could not be read" }, { status: 502 });
  }
  const bytes = await data.arrayBuffer();
  const name = `BRSR report - ${run.org_unit_name}.pdf`.replace(/["\/]/g, "");
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
