// Verify Extraction rules (.grill/phase-7-ocr-verification-decisions.md). Pure, so the screen and the
// server procedure enforce exactly the same guard rail (06_IMPLEMENTATION_PLAN.md Phase 7).

export type FieldDataType = "text" | "number" | "date" | "unit";

export type VerifyField = {
  id: string;
  key: string;
  label: string;
  dataType: FieldDataType;
  required: boolean;
  critical: boolean;
  extractedValue: string | null;
  confidence: number | null;
  /** The last confirmed value; a returned record reopens with it (03_APP_FLOW.md §4.8). */
  verifiedValue?: string | null;
  /**
   * What the person typed for this field on the Upload page (migration 0077), with how it compares to what
   * OCR read: a mismatch must be dealt with before Confirm, like a low-confidence value.
   */
  typed?: { value: string; unit: string | null; status: "match" | "mismatch" | "not_read" } | null;
};

/** What the user currently has in the screen for one field. */
export type FieldEntry = { value: string; acknowledged: boolean };

export const MANUAL_JUSTIFICATION_MIN = 20;
export const REJECT_REASON_MIN = 10;

/**
 * A field the user must explicitly deal with before Confirm (03_APP_FLOW.md §4.6): below the configured
 * threshold, or critical regardless of confidence, or no threshold configured to judge it by. A field OCR
 * never found isn't "flagged" — it simply has to be filled in.
 */
export function isFlagged(field: VerifyField, threshold: number | null): boolean {
  if (field.critical) return true;
  // Typed at upload and read differently: the person chooses which is right.
  if (field.typed?.status === "mismatch") return true;
  if (field.extractedValue === null) return false;
  return threshold === null || field.confidence === null || field.confidence < threshold;
}

/** Numbers as people type them ("1,250.00"); negatives are refused (esg_records forbids them). */
export function parseDecimal(
  text: string,
): { ok: true; value: number } | { ok: false; reason: string } {
  const cleaned = text.replace(/[\s,]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned))
    return { ok: false, reason: "Enter a number, e.g. 1250.00" };
  const value = Number(cleaned);
  if (value < 0) return { ok: false, reason: "Enter a positive number." };
  return { ok: true, value };
}

export function fieldError(field: VerifyField, entry: FieldEntry): string | null {
  const value = entry.value.trim();
  if (!value) return field.required ? "This field is required — read it off the document." : null;
  if (field.dataType === "number") {
    const parsed = parseDecimal(value);
    if (!parsed.ok) return parsed.reason;
  }
  return null;
}

/** A flagged field is resolved once it has been edited or explicitly marked correct. */
export function isResolved(
  field: VerifyField,
  entry: FieldEntry,
  threshold: number | null,
): boolean {
  if (!isFlagged(field, threshold)) return true;
  return entry.acknowledged || entry.value.trim() !== (field.extractedValue ?? "").trim();
}

export type ConfirmCheck = {
  errors: Record<string, string>;
  unresolved: string[];
  /** Why Confirm is disabled, in one sentence; null when it may proceed. */
  blockedReason: string | null;
};

export function checkConfirm(
  fields: VerifyField[],
  entries: Record<string, FieldEntry>,
  threshold: number | null,
  options: { documentTypeSelected: boolean; duplicateAcknowledged?: boolean; duplicates?: number },
): ConfirmCheck {
  const errors: Record<string, string> = {};
  const unresolved: string[] = [];
  for (const field of fields) {
    const entry = entries[field.id] ?? { value: field.extractedValue ?? "", acknowledged: false };
    const error = fieldError(field, entry);
    if (error) errors[field.id] = error;
    else if (!isResolved(field, entry, threshold)) unresolved.push(field.label);
  }

  const errorCount = Object.keys(errors).length;
  let blockedReason: string | null = null;
  if (!options.documentTypeSelected) blockedReason = "Select the document type first.";
  else if (errorCount > 0) {
    blockedReason =
      errorCount === 1
        ? "Fix the field marked in red."
        : `Fix the ${errorCount} fields marked in red.`;
  } else if (unresolved.length > 0) {
    blockedReason =
      unresolved.length === 1
        ? `Review ${unresolved[0]} — edit it or mark it correct.`
        : `Review ${unresolved.length} flagged fields — edit each or mark it correct.`;
  } else if ((options.duplicates ?? 0) > 0 && !options.duplicateAcknowledged) {
    blockedReason = "Acknowledge the possible duplicate first.";
  }
  return { errors, unresolved, blockedReason };
}

/**
 * Which extracted field carries the activity value and its unit. Convention over configuration: a metric
 * declares exactly one required `number` field (quantity, consumption) and at most one `unit` field.
 */
export function activityFieldKeys(
  fields: Pick<VerifyField, "key" | "dataType" | "required">[],
  /**
   * A multi-input formula names its activity field (lib/calculation/formulas.ts activityInput); a product
   * formula names the fields multiplied into it (travel: distance and passengers, migration 0077).
   */
  formulaKey: string | readonly string[] | null = null,
):
  | { ok: true; valueKey: string; unitKey: string | null; productKeys?: string[] }
  | { ok: false; reason: string } {
  const unit = fields.find((f) => f.dataType === "unit");
  if (Array.isArray(formulaKey)) {
    const keys = formulaKey as readonly string[];
    if (keys.every((k) => fields.some((f) => f.key === k && f.dataType === "number"))) {
      return { ok: true, valueKey: keys[0], unitKey: unit?.key ?? null, productKeys: [...keys] };
    }
    // Read before the product formula: the one number typed then (passenger-km) is the activity value.
    const legacy = fields.find((f) => f.key === "quantity" && f.dataType === "number");
    if (legacy) return { ok: true, valueKey: legacy.key, unitKey: unit?.key ?? null };
    return {
      ok: false,
      reason: `This activity needs ${keys.join(" and ")} — contact your Admin.`,
    };
  }
  const named = fields.find(
    (f) => f.key === (formulaKey as string | null) && f.dataType === "number" && f.required,
  );
  if (named) return { ok: true, valueKey: named.key, unitKey: unit?.key ?? null };
  const numbers = fields.filter((f) => f.dataType === "number" && f.required);
  if (numbers.length !== 1) {
    return {
      ok: false,
      reason:
        "This activity isn't configured for verification yet — it needs exactly one required number field. Contact your Admin.",
    };
  }
  return { ok: true, valueKey: numbers[0].key, unitKey: unit?.key ?? null };
}

export type VerifyState = "processing" | "ready" | "failed" | "verified" | "returned" | "rejected";

/** What the Verify Extraction page shows for this record/job combination. */
export function verifyState(input: {
  verificationStatus: "draft" | "document_uploaded" | "ocr_completed" | "user_verified";
  dataQualityState: string;
  jobStatus: "pending" | "processing" | "completed" | "failed" | null;
  validationStatus?: string;
  approvalStatus?: string;
}): VerifyState {
  if (input.dataQualityState === "rejected") return "rejected";
  if (input.verificationStatus === "user_verified") {
    // A failed validation or an Admin return sends the record back for correction (§4.7/§4.8).
    return input.validationStatus === "failed" ||
      input.validationStatus === "returned" ||
      input.approvalStatus === "returned"
      ? "returned"
      : "verified";
  }
  if (input.verificationStatus === "ocr_completed") return "ready";
  if (input.jobStatus === "failed") return "failed";
  return "processing";
}
