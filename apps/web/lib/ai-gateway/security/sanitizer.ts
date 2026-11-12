/**
 * Corporate Privacy & Data Sanitization Module
 *
 * Implements:
 * 1. Confidential invoice masking (account numbers, IFSC, GSTIN, phone numbers).
 * 2. Employee personal identifier exclusion (PAN, Aadhaar, personal emails, names).
 * 3. Minimal Field Projection (The Golden Rule: Do not send entire PDFs or database records
 *    to an LLM just because the user asks a question about one field).
 */

// Regex patterns for Indian financial & corporate identifiers
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g;
const AADHAAR_REGEX = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const GSTIN_REGEX = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b/g;
const IFSC_REGEX = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
const BANK_ACCOUNT_REGEX = /\b\d{9,18}\b/g;
const PHONE_REGEX = /\b(?:\+91[\s-]?)?[6-9]\d{9}\b/g;
const PERSONAL_EMAIL_REGEX =
  /\b[A-Za-z0-9._%+-]+@(?!meil\.in|megagroup\.in)[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi;

/**
 * Masks confidential invoice details according to corporate privacy policies.
 * Redacts bank accounts, IFSC, GSTIN, and personal phone numbers.
 */
export function maskConfidentialInvoice(text: string, options?: { maskAmounts?: boolean }): string {
  let masked = text
    .replace(GSTIN_REGEX, "[REDACTED_GSTIN]")
    .replace(IFSC_REGEX, "[REDACTED_IFSC]")
    .replace(PHONE_REGEX, "[REDACTED_PHONE]")
    .replace(BANK_ACCOUNT_REGEX, "[REDACTED_BANK_ACCOUNT]");

  if (options?.maskAmounts) {
    // Masks currency figures like ₹12,34,567.00 or Rs. 50,000 or INR 100000
    masked = masked.replace(/(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?/gi, "[REDACTED_AMOUNT]");
  }

  return masked;
}

/**
 * Excludes personal identifiers from employee data records.
 * Strips PAN, Aadhaar, personal emails, and phone numbers.
 */
export function excludeEmployeePii(text: string): string {
  return text
    .replace(PAN_REGEX, "[REDACTED_PAN]")
    .replace(AADHAAR_REGEX, "[REDACTED_AADHAAR]")
    .replace(PERSONAL_EMAIL_REGEX, "[REDACTED_PERSONAL_EMAIL]")
    .replace(PHONE_REGEX, "[REDACTED_PHONE]");
}

/**
 * THE GOLDEN RULE ENFORCER:
 * "Do not send an entire PDF or database record to an LLM just because the user asks a question about one field."
 *
 * Given a database record, projection extracts ONLY the specifically requested fields,
 * completely stripping system columns, binary payloads, OCR transcripts, foreign key UUIDs,
 * and internal calculation cache objects.
 */
export function projectMinimalContext<T extends Record<string, unknown>>(
  record: T,
  requestedFields: (keyof T)[],
): Record<string, unknown> {
  const projected: Record<string, unknown> = {};

  // Disallowed internal columns that must NEVER be sent to LLM context
  const forbiddenKeys = new Set([
    "id",
    "created_at",
    "updated_at",
    "deleted_at",
    "raw_ocr_payload",
    "ocr_bounding_boxes",
    "file_bytes",
    "sha256_checksum",
    "uploaded_by",
    "token",
    "password_hash",
  ]);

  for (const field of requestedFields) {
    const key = String(field);
    if (forbiddenKeys.has(key)) {
      continue;
    }
    if (key in record && record[key] !== undefined) {
      projected[key] = record[key];
    }
  }

  return projected;
}

/**
 * Convenience sanitizer that routes text through the appropriate privacy cleaner
 * based on the active DataClassification tier.
 */
export function sanitizeContextByClassification(
  text: string,
  classification:
    | "PUBLIC_BRSR_GUIDELINES"
    | "SYNTHETIC_ESG_DATA"
    | "AGGREGATED_ESG_METRICS"
    | "CONFIDENTIAL_INVOICES"
    | "EMPLOYEE_INFORMATION"
    | "FINANCIAL_RECORDS",
): { sanitized: string; piiMasked: boolean } {
  switch (classification) {
    case "CONFIDENTIAL_INVOICES":
      return { sanitized: maskConfidentialInvoice(text), piiMasked: true };

    case "EMPLOYEE_INFORMATION":
      return { sanitized: excludeEmployeePii(text), piiMasked: true };

    case "FINANCIAL_RECORDS":
      // Restricted processing: aggressively mask amounts, bank details, and identifiers
      return {
        sanitized: maskConfidentialInvoice(excludeEmployeePii(text), { maskAmounts: true }),
        piiMasked: true,
      };

    case "PUBLIC_BRSR_GUIDELINES":
    case "SYNTHETIC_ESG_DATA":
    case "AGGREGATED_ESG_METRICS":
    default:
      return { sanitized: text, piiMasked: false };
  }
}
