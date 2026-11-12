import "server-only";
// Relative imports: the validation engine, which uses this, also runs under plain Node.
import type postgres from "postgres";
import {
  confirmedProblem,
  totalStatus,
  typedStatus,
  type DeclarationMode,
  type Reading,
  type TypedStatus,
} from "./compare.ts";

type Sql = postgres.Sql | postgres.TransactionSql;

export type RecordDeclaration = {
  id: string;
  mode: DeclarationMode;
  /** As typed, by field key; the unit under the activity's unit field key (when it has one). */
  values: Record<string, string>;
  declaredAt: string;
};

/** What was typed on the Upload page for this record's bill, or null (uploaded before migration 0077). */
export async function declarationOf(sql: Sql, recordId: string): Promise<RecordDeclaration | null> {
  const [row] = await sql<
    { id: string; mode: DeclarationMode; values: Record<string, string>; declared_at: Date }[]
  >`
    select d.id, d.mode, d.declared_values as values, d.declared_at
    from public.esg_records r
    join public.upload_declarations d on d.id = r.upload_declaration_id
    where r.id = ${recordId}`;
  return row
    ? { id: row.id, mode: row.mode, values: row.values, declaredAt: row.declared_at.toISOString() }
    : null;
}

/** One bill of a typed total: its document and its best value so far per field (confirmed, else read). */
export type GroupBill = {
  recordId: string;
  documentId: string | null;
  fileName: string | null;
  verified: boolean;
  /** Field key -> value; null = not read and not confirmed yet. */
  values: Record<string, Reading | null>;
};

/** Every bill recorded under a typed total, in upload order. */
export async function groupBills(
  sql: Sql,
  declarationId: string,
  keys: string[],
  unitKey: string | null,
): Promise<GroupBill[]> {
  const rows = await sql<
    {
      record_id: string;
      document_id: string | null;
      file_name: string | null;
      verified: boolean;
      fields: { key: string; value: string | null }[] | null;
    }[]
  >`
    select r.id as record_id, d.id as document_id, d.file_name,
           r.verification_status = 'user_verified' as verified,
           (select json_agg(json_build_object(
                     'key', f.field_key,
                     'value', case when r.verification_status = 'user_verified'
                                   then f.verified_value else coalesce(f.verified_value, f.extracted_value) end))
              from public.ocr_extractions e join public.ocr_fields f on f.ocr_extraction_id = e.id
              where e.document_id = d.id) as fields
    from public.esg_records r
    left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
    left join public.documents d on d.id = erd.document_id
    where r.upload_declaration_id = ${declarationId} and r.data_quality_state <> 'rejected'
    order by d.created_at, d.file_name`;
  return rows.map((row) => {
    const fields = row.fields ?? [];
    const valueOf = (k: string) => fields.find((f) => f.key === k)?.value?.trim() || null;
    const unit = unitKey ? valueOf(unitKey) : null;
    return {
      recordId: row.record_id,
      documentId: row.document_id,
      fileName: row.file_name,
      verified: row.verified,
      values: Object.fromEntries(
        keys.map((k) => {
          const text = valueOf(k);
          return [k, text ? { text, unit } : null];
        }),
      ),
    };
  });
}

/** Per field: what was typed and how it compares to what OCR read (a bill typed on its own). */
export function typedFields(
  declaration: RecordDeclaration,
  fields: { key: string; dataType: string; extractedValue: string | null }[],
  unitKey: string | null,
): Map<string, { value: string; unit: string | null; status: TypedStatus }> {
  const out = new Map<string, { value: string; unit: string | null; status: TypedStatus }>();
  if (declaration.mode === "total") return out;
  const typedUnit = unitKey ? (declaration.values[unitKey]?.trim() ?? null) : null;
  const readUnit = unitKey
    ? (fields.find((f) => f.key === unitKey)?.extractedValue?.trim() ?? null)
    : null;
  for (const field of fields) {
    const typed = declaration.values[field.key];
    if (field.dataType !== "number" || typed === undefined) continue;
    const typedReading = { text: typed, unit: typedUnit };
    const read = field.extractedValue ? { text: field.extractedValue, unit: readUnit } : null;
    out.set(field.key, { value: typed, unit: typedUnit, status: typedStatus(typedReading, read) });
  }
  return out;
}

/** The validation problems with a confirmed bill against what was typed for it. Empty = none. */
export async function declarationProblems(
  sql: Sql,
  recordId: string,
  fields: {
    key: string;
    label: string;
    dataType: string;
    extracted: string | null;
    value: string | null;
  }[],
  unitKey: string | null,
): Promise<{ declared: boolean; problems: string[]; waiting: string | null }> {
  const declaration = await declarationOf(sql, recordId);
  if (!declaration) return { declared: false, problems: [], waiting: null };
  const typedUnit = unitKey ? (declaration.values[unitKey]?.trim() ?? null) : null;
  const unitOf = (pick: "extracted" | "value") =>
    unitKey ? (fields.find((f) => f.key === unitKey)?.[pick]?.trim() ?? null) : null;
  const keys = Object.keys(declaration.values).filter((k) =>
    fields.some((f) => f.key === k && f.dataType === "number"),
  );
  const problems: string[] = [];

  if (declaration.mode !== "total") {
    for (const key of keys) {
      const field = fields.find((f) => f.key === key)!;
      if (!field.value) continue; // the format check reports a missing value
      const problem = confirmedProblem({
        label: field.label,
        typed: { text: declaration.values[key], unit: typedUnit },
        read: field.extracted ? { text: field.extracted, unit: unitOf("extracted") } : null,
        confirmed: { text: field.value, unit: unitOf("value") },
      });
      if (problem) problems.push(problem);
    }
    return { declared: true, problems, waiting: null };
  }

  // A typed total: the bills recorded under it, added up, field by field.
  const bills = await groupBills(sql, declaration.id, keys, unitKey);
  let waiting: string | null = null;
  for (const key of keys) {
    const label = fields.find((f) => f.key === key)!.label;
    const typed = { text: declaration.values[key], unit: typedUnit };
    const status = totalStatus(
      typed,
      bills.map((b) => b.values[key]),
    );
    if (status.status === "waiting") {
      waiting = `The total typed at upload is checked once all ${bills.length} bills have been read.`;
      continue;
    }
    if (status.status === "mismatch") {
      const sum = Number.isNaN(status.sum)
        ? "a total in units that cannot be added"
        : status.sum.toLocaleString("en-IN", { maximumFractionDigits: 6 });
      problems.push(
        `${label}: ${typed.text}${typedUnit ? ` ${typedUnit}` : ""} was typed at upload as the total of ${bills.length} bills, but they add up to ${sum}${typedUnit ? ` ${typedUnit}` : ""}.`,
      );
    }
  }
  return { declared: true, problems, waiting };
}
