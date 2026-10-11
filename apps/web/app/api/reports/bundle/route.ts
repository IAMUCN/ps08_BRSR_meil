import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { inOrgScope } from "@/lib/auth/scope";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { generateAuditEvidenceBundle } from "@/lib/reports/bundle";

const querySchema = z
  .object({
    orgUnitId: z.string().uuid("Invalid organization unit ID"),
    periodId: z.string().uuid("Invalid reporting period ID").optional(),
    financialYear: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .refine((data) => data.periodId !== undefined || data.financialYear !== undefined, {
    message: "Either periodId or financialYear must be specified.",
  });

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (session.status !== "active") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    orgUnitId: searchParams.get("orgUnitId") ?? undefined,
    periodId: searchParams.get("periodId") ?? undefined,
    financialYear: searchParams.get("financialYear") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { orgUnitId, periodId, financialYear } = parsed.data;
  const sql = db();

  // The bundle carries audit entries and people's names, so it needs the reporting permission as well as
  // org scope: Admins reach every org unit, anyone else only their assigned tree.
  const { isAdmin, permissions } = session.session;
  if (
    (!isAdmin && !permissions.includes("report.generate")) ||
    !(await inOrgScope(sql, session.session, orgUnitId))
  ) {
    return NextResponse.json(
      { error: "Forbidden: You are not authorized to export evidence for this organization." },
      { status: 403 },
    );
  }

  try {
    const result = await generateAuditEvidenceBundle(
      { orgUnitId, periodId, financialYear },
      {
        id: session.session.userId,
        displayName: session.session.displayName,
        role: session.session.roleCodes[0] ?? (session.session.isAdmin ? "admin" : "user"),
      },
    );

    // Audit log the export
    await sql.begin(async (tx) => {
      await writeAudit(tx, {
        eventType: "report.evidence_bundle_exported",
        entityType: "report_bundle",
        entityId: result.manifest.bundleId as string,
        userId: session.session.userId,
        newValue: {
          org_unit_id: orgUnitId,
          period_id: periodId ?? null,
          financial_year: financialYear ?? null,
          record_count: result.recordCount,
          document_count: result.documentCount,
          file_name: result.filename,
        },
      });
    });

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(result.buffer.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // The cause stays in the server log: database and storage error text is not for the browser.
    console.error("Bundle generation failed:", error);
    return NextResponse.json({ error: "Failed to generate evidence bundle" }, { status: 500 });
  }
}
