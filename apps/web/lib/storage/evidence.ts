// Evidence storage rules (05_BACKEND_SCHEMA.md §15; .grill/phase-5-document-ingestion-decisions.md).
// Pure — unit-testable; the bucket name is read lazily so tests don't need the environment.

/** 50 MB — also the bucket's file_size_limit (migration 0012). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Schema §6.4 default, used when a metric has no document type mapped yet. */
export const DEFAULT_ACCEPTED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
};

export function evidenceBucket(): string {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET_EVIDENCE;
  if (!bucket) throw new Error("SUPABASE_STORAGE_BUCKET_EVIDENCE is not set");
  return bucket;
}

/** `{org_unit_id}/{reporting_period_id}/{document_id}/original.{ext}` inside the evidence bucket. */
export function evidencePath(
  orgUnitId: string,
  reportingPeriodId: string,
  documentId: string,
  mimeType: string,
): string | null {
  const ext = EXTENSIONS[mimeType];
  return ext ? `${orgUnitId}/${reportingPeriodId}/${documentId}/original.${ext}` : null;
}

export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

export function acceptedTypesLabel(mimeTypes: readonly string[]): string {
  const labels = mimeTypes.map((m) => MIME_LABELS[m] ?? m);
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}` : labels[0];
}

export type FileCheck = { ok: true; mimeType: string } | { ok: false; reason: string };

const DAMAGED = "This file looks damaged or incomplete — export or scan it again and re-upload.";

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((b, i) => bytes[i] === b);
}

/** Index of `needle` in `haystack` from `from`, or -1. */
function indexOf(haystack: Uint8Array, needle: readonly number[], from = 0): number {
  outer: for (let i = Math.max(0, from); i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

/**
 * Structural check of the stored bytes: the real type comes from the content, never from the
 * browser's claim, and the file must be complete. Encrypted PDFs are rejected because OCR can't read
 * them. Deeper damage is left to the OCR worker, which fails the job (Phase 2B backstop).
 */
export function checkFileContent(bytes: Uint8Array): FileCheck {
  if (bytes.length === 0) return { ok: false, reason: "This file is empty." };
  const tail = bytes.length - 1024;

  if (startsWith(bytes, ascii("%PDF-"))) {
    if (indexOf(bytes, ascii("%%EOF"), tail) === -1) return { ok: false, reason: DAMAGED };
    if (indexOf(bytes, ascii("/Encrypt")) !== -1) {
      return {
        ok: false,
        reason: "This PDF is password-protected — upload a copy without a password.",
      };
    }
    return { ok: true, mimeType: "application/pdf" };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return indexOf(bytes, ascii("IEND"), bytes.length - 64) === -1
      ? { ok: false, reason: DAMAGED }
      : { ok: true, mimeType: "image/png" };
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return indexOf(bytes, [0xff, 0xd9], bytes.length - 64) === -1
      ? { ok: false, reason: DAMAGED }
      : { ok: true, mimeType: "image/jpeg" };
  }
  return { ok: false, reason: "This isn't a PDF, JPG or PNG file." };
}
