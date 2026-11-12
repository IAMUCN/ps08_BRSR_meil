import { NextResponse } from "next/server";
import { z } from "zod";
import { scopedOrgUnitIds } from "@/lib/auth/scope";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { reportsBucket } from "@/lib/reports/generate";
import { isTemplate, TEMPLATE_INFO } from "@/lib/reports/templates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// A generated report's PDF (App Flow §2.2 "download report file"), or with ?format=xlsx its Excel workbook when
// its template has one (Phase 8, D52). Private like evidence: every request re-checks the session, the
// `report.generate` permission and the caller's org scope; never cached.

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
  const search = new URL(request.url).searchParams;
  const workbook = search.get("format") === "xlsx";
  const scope = await scopedOrgUnitIds(db(), session.session, "report.generate");
  const [run] = await db()<
    {
      storage_path: string | null;
      workbook_path: string | null;
      template: string;
      org_unit_name: string;
    }[]
  >`
    select rr.storage_path, rr.workbook_path, rr.template, o.name as org_unit_name
    from public.report_runs rr join public.org_units o on o.id = rr.org_unit_id
    where rr.id = ${reportId} and rr.status = 'completed'
      and (${scope}::uuid[] is null or rr.org_unit_id = any(${scope}::uuid[]))`;
  const path = workbook ? run?.workbook_path : run?.storage_path;
  if (!run || !path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await createSupabaseAdminClient()
    .storage.from(reportsBucket())
    .download(path);
  if (error || !data) {
    return NextResponse.json({ error: "The stored report could not be read" }, { status: 502 });
  }
  const bytes = await data.arrayBuffer();
  const stem = TEMPLATE_INFO[isTemplate(run.template) ? run.template : "brsr"].fileStem;
  const name = `${stem} - ${run.org_unit_name}.${workbook ? "xlsx" : "pdf"}`.replace(
    /["\/\\\r\n]/g,
    "",
  );
  const inline = !workbook && search.get("inline") === "1";
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": workbook ? XLSX : "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
