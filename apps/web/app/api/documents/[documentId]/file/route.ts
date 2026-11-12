import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { downloadName } from "@/lib/documents/download-name";
import { evidenceBucket } from "@/lib/storage/evidence";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { documentAccess } from "@/lib/verification/access";

// Evidence bytes for the document viewer (UI brief §12.2/§12.3). Every request re-checks the session and
// the caller's scope; nothing that works without a session ever reaches the browser
// (.grill/phase-7-ocr-verification-decisions.md). Never cached, never executed as a page.

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/documents/[documentId]/file">,
) {
  const { documentId } = await params;
  const session = await getSessionContext();
  if (session.status !== "active") {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!z.uuid().safeParse(documentId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Visibility only (org scope or Admin): viewing evidence is not verifying it.
  const access = await documentAccess(session.session, documentId);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [row] = await db()<
    {
      storage_path: string;
      mime_type: string;
      file_name: string;
      file_hash: string;
      metric_name: string | null;
      bill_number: string | null;
      period_label: string | null;
    }[]
  >`
    select d.storage_path, d.mime_type, d.file_name, d.file_hash,
           m.name as metric_name, r.bill_number, p.label as period_label
    from public.documents d
    left join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
    left join public.esg_records r on r.id = erd.esg_record_id
    left join public.esg_metrics m on m.id = r.metric_id
    left join public.reporting_periods p on p.id = r.reporting_period_id
    where d.id = ${documentId} and d.deleted_at is null`;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await createSupabaseAdminClient()
    .storage.from(evidenceBucket())
    .download(row.storage_path);
  if (error || !data) {
    return NextResponse.json({ error: "The stored file could not be read" }, { status: 502 });
  }

  // Sent as bytes rather than a stream: an aborted stream (the viewer unmounting mid-download) can
  // leave the keep-alive connection unusable, which breaks the next client-side navigation. Evidence
  // files are capped at 50 MB by the upload rules.
  const bytes = await data.arrayBuffer();
  // The fingerprint recorded at upload must still describe the stored file: evidence that changed in
  // storage is never shown as if it were the original (audit fix P2).
  if (createHash("sha256").update(Buffer.from(bytes)).digest("hex") !== row.file_hash) {
    console.error("evidence fingerprint mismatch", documentId);
    return NextResponse.json(
      { error: "The stored file no longer matches the fingerprint recorded when it was uploaded" },
      { status: 409 },
    );
  }
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Length": String(bytes.byteLength),
      // Phase 2: a readable name from the record (activity, bill number, period); storage stays by id.
      // Non-ASCII characters are replaced so the header stays valid.
      "Content-Disposition": `inline; filename="${downloadName({
        fileName: row.file_name,
        mimeType: row.mime_type,
        metricName: row.metric_name,
        billNumber: row.bill_number,
        periodLabel: row.period_label,
      }).replace(/[^\x20-\x7e]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Opened directly, the file renders inert: no scripts, no same-origin access.
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
