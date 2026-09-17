import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
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

  const [row] = await db()<{ storage_path: string; mime_type: string; file_name: string }[]>`
    select storage_path, mime_type, file_name from public.documents
    where id = ${documentId} and deleted_at is null`;
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
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${row.file_name.replace(/["\\]/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Opened directly, the file renders inert: no scripts, no same-origin access.
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
