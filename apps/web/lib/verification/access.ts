import "server-only";
import type postgres from "postgres";
import type { ActiveSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Who may see and verify a document (.grill/phase-7-ocr-verification-decisions.md): visibility is RLS
// (org scope or Admin); verifying additionally needs to be the uploader or to hold `record.verify`.

export type DocumentAccess = { uploadedBy: string; canVerify: boolean };

/** Null when the document doesn't exist or RLS hides it — callers must not distinguish the two (§4.4). */
export async function documentAccess(
  session: ActiveSession,
  documentId: string,
): Promise<DocumentAccess | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, uploaded_by")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    uploadedBy: data.uploaded_by,
    canVerify:
      data.uploaded_by === session.userId ||
      session.isAdmin ||
      session.permissions.includes("record.verify"),
  };
}

/** The single configured OCR confidence threshold (migration 0014), or null if it was removed. */
export async function confidenceThreshold(
  sql: postgres.Sql | postgres.TransactionSql,
): Promise<number | null> {
  const [row] = await sql<{ threshold: number | null }[]>`
    select (value #>> '{}')::float as threshold from public.org_settings
    where key = 'ocr_confidence_threshold'`;
  return row?.threshold ?? null;
}
