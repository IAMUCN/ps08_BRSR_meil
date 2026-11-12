import "server-only";
import type postgres from "postgres";

// No "@/" imports: the validation engine, which uses this, also runs under plain Node.
type Sql = postgres.Sql | postgres.TransactionSql;

/** What OCR thinks the document is, when that is clearly another activity's document (Phase 3). */
export type ActivityMismatch = {
  /** The detected document type, lower case for a sentence ("electricity bill"). */
  typeName: string;
  /** The activities that document type is used for: the likely right category. */
  activities: { id: string; name: string }[];
};

/**
 * The OCR worker stores a clear mismatch in `raw_output.classification.mismatch.document_type`
 * (`detect_mismatch`). Null when there is none, or when a mapping added since the upload makes the
 * detected type one of this activity's own.
 */
export async function activityMismatch(
  sql: Sql,
  mismatchCode: string | null,
  metricId: string | null,
): Promise<ActivityMismatch | null> {
  if (!mismatchCode || !metricId) return null;
  const [type] = await sql<{ name: string; activities: { id: string; name: string }[] | null }[]>`
    select dt.name,
           json_agg(json_build_object('id', m.id, 'name', m.name) order by m.name)
             filter (where m.id is not null) as activities
    from public.document_types dt
    left join public.document_type_metric_mappings map on map.document_type_id = dt.id
    left join public.esg_metrics m on m.id = map.metric_id and m.deleted_at is null
    where dt.code = ${mismatchCode}
      and not exists (select 1 from public.document_type_metric_mappings own
                      where own.document_type_id = dt.id and own.metric_id = ${metricId})
    group by dt.name`;
  if (!type) return null;
  return { typeName: type.name.toLowerCase(), activities: type.activities ?? [] };
}
