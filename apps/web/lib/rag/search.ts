import type { Sql } from "postgres";
import { generateEmbedding } from "./embeddings.ts";
import type { DataClassification } from "../ai-gateway/types.ts";
import type { HybridSearchResult } from "./types.ts";

export type HybridSearchOptions = {
  authorizedOrgUnits?: string[];
  allowedClassifications?: DataClassification[];
  limit?: number;
  minSimilarity?: number;
};

/**
 * Executes permission-aware hybrid search across verified records, documents, and BRSR indicators.
 * Combines 768-dim dense vector cosine similarity with full-text lexical ranking.
 */
export async function performHybridSearch(
  sql: Sql,
  query: string,
  options?: HybridSearchOptions,
): Promise<HybridSearchResult[]> {
  const queryText = query.trim();
  if (!queryText) return [];

  const limit = options?.limit || 6;
  const minSimilarity = options?.minSimilarity || 0.15;
  const queryEmbedding = await generateEmbedding(queryText);

  const orgUnitsParam =
    options?.authorizedOrgUnits && options.authorizedOrgUnits.length > 0
      ? options.authorizedOrgUnits
      : null;

  const classificationsParam =
    options?.allowedClassifications && options.allowedClassifications.length > 0
      ? options.allowedClassifications
      : null;

  const queryVectorStr = `[${queryEmbedding.join(",")}]`;

  const rows = await sql`
    select
      id,
      source_type,
      source_id,
      org_unit_id,
      reporting_period_id,
      data_classification,
      title,
      content,
      citation_label,
      metadata,
      is_verified,
      similarity,
      text_rank,
      combined_score
    from public.hybrid_search_rag_chunks(
      ${queryText},
      ${queryVectorStr}::vector(768),
      ${limit},
      ${orgUnitsParam && orgUnitsParam.length > 0 ? orgUnitsParam : null}::uuid[],
      ${classificationsParam && classificationsParam.length > 0 ? classificationsParam : null}::text[],
      ${minSimilarity}
    )
  `;

  return rows.map((r) => ({
    id: r.id,
    sourceType: r.source_type,
    sourceId: r.source_id,
    orgUnitId: r.org_unit_id,
    reportingPeriodId: r.reporting_period_id,
    dataClassification: r.data_classification,
    title: r.title,
    content: r.content,
    citationLabel: r.citation_label,
    metadata: r.metadata,
    isVerified: Boolean(r.is_verified),
    similarity: Number(r.similarity),
    textRank: Number(r.text_rank),
    combinedScore: Number(r.combined_score),
  }));
}
