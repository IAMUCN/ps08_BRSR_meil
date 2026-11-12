import type { Sql } from "postgres";
import { generateEmbedding } from "./embeddings.ts";
import type { DataClassification } from "../ai-gateway/types.ts";

export type IndexerResult = {
  indexedRecords: number;
  indexedBrsrIndicators: number;
  indexedDocuments: number;
  totalChunks: number;
  latencyMs: number;
};

/**
 * Indexes verified ESG records into rag_knowledge_chunks with 768-dim embeddings.
 * Strictly consumes only records where verification_status = 'user_verified' and approval_status = 'approved'.
 */
export async function indexVerifiedRecords(
  sql: Sql,
  options?: { limit?: number; orgUnitId?: string },
): Promise<number> {
  const records = await sql`
    select
      r.id,
      r.org_unit_id,
      r.reporting_period_id,
      r.activity_value_verified,
      r.activity_value_normalized,
      r.activity_unit,
      r.normalized_unit,
      r.bill_number,
      r.data_quality_state,
      o.name as org_name,
      o.code as org_code,
      p.label as period_label,
      m.code as metric_code,
      m.name as metric_name,
      s.code as scope_code,
      s.name as scope_name
    from public.esg_records r
    join public.org_units o on o.id = r.org_unit_id
    join public.reporting_periods p on p.id = r.reporting_period_id
    join public.esg_metrics m on m.id = r.metric_id
    left join public.scopes s on s.id = r.scope_id
    where r.verification_status = 'user_verified'
      and r.approval_status = 'approved'
      ${options?.orgUnitId ? sql`and r.org_unit_id = ${options.orgUnitId}` : sql``}
    order by r.created_at desc
    limit ${options?.limit || 2000}
  `;

  for (const r of records) {
    const title = `${r.org_name} - ${r.metric_name} (${r.period_label})`;
    const content = [
      `Organization: ${r.org_name} (${r.org_code})`,
      `Reporting Period: ${r.period_label}`,
      `Metric: ${r.metric_name} (Code: ${r.metric_code})`,
      r.scope_code ? `Scope: ${r.scope_name} (${r.scope_code})` : null,
      `Verified Activity: ${r.activity_value_verified} ${r.activity_unit}`,
      r.activity_value_normalized
        ? `Normalized Quantity: ${r.activity_value_normalized} ${r.normalized_unit}`
        : null,
      r.bill_number ? `Bill / Reference Number: ${r.bill_number}` : null,
      `Verification State: user_verified (Approved)`,
      `Data Quality Score: ${r.data_quality_state || "SATISFACTORY"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const citationLabel = `[Record: ${r.metric_code} • ${r.period_label} • ${r.org_name} (ID: ${r.id})]`;
    const embedding = await generateEmbedding(`${title}\n${content}`);
    const embeddingStr = `[${embedding.join(",")}]`;

    const metadata = {
      record_id: r.id,
      metric_code: r.metric_code,
      period_label: r.period_label,
      org_code: r.org_code,
      scope_code: r.scope_code,
      bill_number: r.bill_number,
      verified_value: r.activity_value_verified,
      unit: r.activity_unit,
    };

    await sql`
      insert into public.rag_knowledge_chunks (
        source_type,
        source_id,
        org_unit_id,
        reporting_period_id,
        data_classification,
        title,
        content,
        citation_label,
        embedding,
        metadata,
        is_verified
      ) values (
        'esg_record',
        ${r.id},
        ${r.org_unit_id},
        ${r.reporting_period_id},
        'AGGREGATED_ESG_METRICS',
        ${title},
        ${content},
        ${citationLabel},
        ${embeddingStr}::vector(768),
        ${sql.json(metadata)},
        true
      )
      on conflict (source_type, source_id) do update set
        title = excluded.title,
        content = excluded.content,
        embedding = excluded.embedding,
        metadata = excluded.metadata,
        updated_at = clock_timestamp()
    `;
  }

  return records.length;
}

/**
 * Indexes statutory SEBI BRSR Indicators & Section Guidance.
 */
export async function indexBrsrIndicators(sql: Sql): Promise<number> {
  const indicators = await sql`
    select
      i.id,
      i.code as indicator_code,
      i.question_text,
      i.indicator_type,
      i.description,
      s.code as section_code,
      s.name as section_name
    from public.brsr_indicators i
    join public.brsr_sections s on s.id = i.section_id
    order by i.code asc
  `;

  for (const ind of indicators) {
    const title = `SEBI BRSR Indicator ${ind.indicator_code}: ${ind.section_name}`;
    const content = [
      `Statutory Framework: SEBI Business Responsibility and Sustainability Reporting (BRSR)`,
      `Section ${ind.section_code}: ${ind.section_name}`,
      `Indicator Code: ${ind.indicator_code}`,
      ind.indicator_type ? `Type: ${ind.indicator_type}` : null,
      `Statutory Disclosure Question: ${ind.question_text}`,
      ind.description ? `Guidance Notes: ${ind.description}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const citationLabel = `[BRSR: Indicator ${ind.indicator_code} • Section ${ind.section_code}]`;
    const embedding = await generateEmbedding(`${title}\n${content}`);
    const embeddingStr = `[${embedding.join(",")}]`;

    const metadata = {
      indicator_id: ind.id,
      indicator_code: ind.indicator_code,
      section_code: ind.section_code,
      indicator_type: ind.indicator_type,
    };

    await sql`
      insert into public.rag_knowledge_chunks (
        source_type,
        source_id,
        org_unit_id,
        reporting_period_id,
        data_classification,
        title,
        content,
        citation_label,
        embedding,
        metadata,
        is_verified
      ) values (
        'brsr_indicator',
        ${ind.id},
        null,
        null,
        'PUBLIC_BRSR_GUIDELINES',
        ${title},
        ${content},
        ${citationLabel},
        ${embeddingStr}::vector(768),
        ${sql.json(metadata)},
        true
      )
      on conflict (source_type, source_id) do update set
        title = excluded.title,
        content = excluded.content,
        embedding = excluded.embedding,
        metadata = excluded.metadata,
        updated_at = clock_timestamp()
    `;
  }

  return indicators.length;
}

/**
 * Indexes evidence documents following the Golden Rule:
 * Minimal field projection (file name, type, bill number, verified OCR metadata)
 * rather than raw multi-megabyte binary dumps.
 */
export async function indexEvidenceDocuments(
  sql: Sql,
  options?: { limit?: number; orgUnitId?: string },
): Promise<number> {
  const docs = await sql`
    select
      d.id,
      d.org_unit_id,
      d.reporting_period_id,
      d.file_name,
      d.mime_type,
      d.file_size_bytes,
      d.created_at,
      dt.name as doc_type_name,
      dt.code as doc_type_code,
      o.name as org_name,
      p.label as period_label,
      r.bill_number,
      r.activity_value_verified,
      r.activity_unit
    from public.documents d
    join public.org_units o on o.id = d.org_unit_id
    join public.reporting_periods p on p.id = d.reporting_period_id
    left join public.document_types dt on dt.id = d.document_type_id
    left join public.esg_record_documents rd on rd.document_id = d.id and rd.is_primary = true
    left join public.esg_records r on r.id = rd.esg_record_id
    where d.deleted_at is null
      ${options?.orgUnitId ? sql`and d.org_unit_id = ${options.orgUnitId}` : sql``}
    order by d.created_at desc
    limit ${options?.limit || 1500}
  `;

  for (const d of docs) {
    const title = `Evidence Document: ${d.file_name} (${d.org_name})`;
    const content = [
      `Document Name: ${d.file_name}`,
      `Document Type: ${d.doc_type_name || "Invoice / Log"} (${d.doc_type_code || "INVOICE"})`,
      `Facility / Unit: ${d.org_name}`,
      `Reporting Period: ${d.period_label}`,
      d.bill_number ? `Invoice / Bill Number: ${d.bill_number}` : null,
      d.activity_value_verified
        ? `Primary Activity Recorded: ${d.activity_value_verified} ${d.activity_unit}`
        : null,
      `MIME Type: ${d.mime_type}`,
      `File Size: ${(d.file_size_bytes / 1024).toFixed(1)} KB`,
    ]
      .filter(Boolean)
      .join("\n");

    const citationLabel = `[Evidence: ${d.file_name} • Bill #${d.bill_number || "N/A"} (Doc ID: ${d.id})]`;
    const embedding = await generateEmbedding(`${title}\n${content}`);
    const embeddingStr = `[${embedding.join(",")}]`;

    const metadata = {
      doc_id: d.id,
      file_name: d.file_name,
      doc_type_code: d.doc_type_code,
      bill_number: d.bill_number,
      org_unit_id: d.org_unit_id,
      period_id: d.reporting_period_id,
    };

    await sql`
      insert into public.rag_knowledge_chunks (
        source_type,
        source_id,
        org_unit_id,
        reporting_period_id,
        data_classification,
        title,
        content,
        citation_label,
        embedding,
        metadata,
        is_verified
      ) values (
        'document',
        ${d.id},
        ${d.org_unit_id},
        ${d.reporting_period_id},
        'CONFIDENTIAL_INVOICES',
        ${title},
        ${content},
        ${citationLabel},
        ${embeddingStr}::vector(768),
        ${sql.json(metadata)},
        true
      )
      on conflict (source_type, source_id) do update set
        title = excluded.title,
        content = excluded.content,
        embedding = excluded.embedding,
        metadata = excluded.metadata,
        updated_at = clock_timestamp()
    `;
  }

  return docs.length;
}

/**
 * Builds the complete unified RAG knowledge base.
 */
export async function buildCompleteRagIndex(
  sql: Sql,
  options?: { orgUnitId?: string; recordsLimit?: number; docsLimit?: number },
): Promise<IndexerResult> {
  const startTime = Date.now();

  const [indexedRecords, indexedBrsrIndicators, indexedDocuments] = await Promise.all([
    indexVerifiedRecords(sql, {
      limit: options?.recordsLimit || 500,
      orgUnitId: options?.orgUnitId,
    }),
    indexBrsrIndicators(sql),
    indexEvidenceDocuments(sql, {
      limit: options?.docsLimit || 500,
      orgUnitId: options?.orgUnitId,
    }),
  ]);

  return {
    indexedRecords,
    indexedBrsrIndicators,
    indexedDocuments,
    totalChunks: indexedRecords + indexedBrsrIndicators + indexedDocuments,
    latencyMs: Date.now() - startTime,
  };
}
