import "server-only";
import { db, type Tx } from "@/lib/db";
import { getEsgFeaturesForUnit } from "@/lib/features/service";
import { evaluateAndAuditDecisionRules } from "@/lib/rules/service";
import {
  generateDecarbonizationSuggestions,
  enrichRoadmapWithAi,
  type StrategicRoadmap,
  type DecarbonizationSuggestion,
  type SuggestionCategory,
  type SuggestionPriority,
  type InvestmentTier,
  type PaybackHorizon,
} from "./engine";
import { readConfig, createModelCaller } from "@/lib/chat/nim";

type Sql = Tx | ReturnType<typeof db>;

export type SuggestionStatus = "OPEN" | "IN_REVIEW" | "ACCEPTED" | "IMPLEMENTED" | "DISMISSED";

export type DecarbonizationSuggestionRow = {
  id: string;
  org_unit_id: string;
  reporting_period_id: string;
  suggestion_id: string;
  title: string;
  summary: string;
  category: string;
  priority: string;
  triggered_by_rule_code: string | null;
  target_feature: string;
  observed_value: number | null;
  threshold_value: number | null;
  potential_reduction_tco2e: number;
  potential_reduction_pct: number;
  investment_tier: string;
  payback_years: number | null;
  carbon_adjusted_payback_years: number | null;
  payback_horizon: string;
  action_steps: string[];
  technical_prerequisites: string[];
  regulatory_disclaimer: string;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DecarbonizationRoadmapRow = {
  id: string;
  org_unit_id: string;
  reporting_period_id: string;
  total_potential_reduction_tco2e: number;
  overall_reduction_pct: number;
  total_suggestions: number;
  executive_summary: string;
  ai_rationale: string | null;
  ai_enriched: boolean;
  model_used: string | null;
  features_snapshot: any;
  created_at: string;
  updated_at: string;
};

function mapRowToSuggestion(row: DecarbonizationSuggestionRow): DecarbonizationSuggestion & {
  dbId: string;
  status: SuggestionStatus;
  assignedTo?: string;
  notes?: string;
} {
  return {
    dbId: row.id,
    id: row.suggestion_id,
    title: row.title,
    summary: row.summary,
    category: row.category as SuggestionCategory,
    priority: row.priority as SuggestionPriority,
    triggeredByRuleCode: row.triggered_by_rule_code,
    targetFeature: row.target_feature,
    observedValue: row.observed_value !== null ? Number(row.observed_value) : null,
    thresholdValue: row.threshold_value !== null ? Number(row.threshold_value) : null,
    potentialEmissionSavingsTco2e: Number(row.potential_reduction_tco2e),
    potentialPercentageReduction: Number(row.potential_reduction_pct),
    investmentTier: row.investment_tier as InvestmentTier,
    estimatedPaybackYears: row.payback_years !== null ? Number(row.payback_years) : null,
    carbonAdjustedPaybackYears:
      row.carbon_adjusted_payback_years !== null ? Number(row.carbon_adjusted_payback_years) : null,
    paybackHorizon: row.payback_horizon as PaybackHorizon,
    actionSteps: Array.isArray(row.action_steps) ? row.action_steps : [],
    technicalPrerequisites: Array.isArray(row.technical_prerequisites)
      ? row.technical_prerequisites
      : [],
    regulatoryDisclaimer: row.regulatory_disclaimer,
    status: row.status as SuggestionStatus,
    assignedTo: row.assigned_to ?? undefined,
    notes: row.notes ?? undefined,
  };
}

/**
 * Evaluates verified features and rules, produces the strategic roadmap,
 * and enriches with Groq / OpenAI LLM if configured.
 */
export async function generateAndSaveRoadmap(
  sql: Sql,
  params: {
    orgUnitId: string;
    reportingPeriodId: string;
    useAi?: boolean;
    shadowPricePerTco2e?: number;
  },
): Promise<StrategicRoadmap> {
  const { orgUnitId, reportingPeriodId, useAi = true, shadowPricePerTco2e } = params;

  // 1. Compute features strictly from verified data
  const features = await getEsgFeaturesForUnit(sql, { orgUnitId, reportingPeriodId });

  // 2. Evaluate operational rules
  const ruleSummary = await evaluateAndAuditDecisionRules(sql, { orgUnitId, reportingPeriodId });

  // 3. Generate pure suggestions
  let roadmap = generateDecarbonizationSuggestions(features, ruleSummary.results, {
    shadowPricePerTco2e,
  });

  let modelUsed: string | null = null;

  // 4. Optionally enrich with LLM narrative
  if (useAi) {
    const chatConfig = readConfig(process.env);
    if (chatConfig) {
      try {
        const caller = createModelCaller({
          config: chatConfig,
          tools: [],
          timeoutMs: 15_000,
        });

        const abortCtrl = new AbortController();
        const callWrap = async (
          msgs: { role: "system" | "user"; content: string }[],
          sig: AbortSignal,
          allowTools: boolean,
        ) => {
          const res = await caller(msgs, sig, allowTools);
          modelUsed = res.model;
          return { content: res.content, model: res.model };
        };

        roadmap = await enrichRoadmapWithAi(roadmap, features, callWrap, abortCtrl.signal);
      } catch (e) {
        // Fallback gracefully without breaking transaction
      }
    }
  }

  // 5. Persist roadmap snapshot (upsert)
  const featuresJson = JSON.stringify(features);
  await sql`
    insert into public.decarbonization_roadmaps (
      org_unit_id, reporting_period_id, total_potential_reduction_tco2e,
      overall_reduction_pct, total_suggestions, executive_summary,
      ai_rationale, ai_enriched, model_used, features_snapshot, updated_at
    ) values (
      ${orgUnitId}, ${reportingPeriodId}, ${roadmap.totalPotentialReductionTco2e},
      ${roadmap.overallReductionPotentialPct}, ${roadmap.totalSuggestions}, ${roadmap.executiveSummary},
      ${roadmap.aiRationale ?? null}, ${roadmap.aiEnriched}, ${modelUsed}, ${featuresJson}::jsonb, now()
    )
    on conflict (org_unit_id, reporting_period_id) do update set
      total_potential_reduction_tco2e = excluded.total_potential_reduction_tco2e,
      overall_reduction_pct = excluded.overall_reduction_pct,
      total_suggestions = excluded.total_suggestions,
      executive_summary = excluded.executive_summary,
      ai_rationale = excluded.ai_rationale,
      ai_enriched = excluded.ai_enriched,
      model_used = excluded.model_used,
      features_snapshot = excluded.features_snapshot,
      updated_at = now()
  `;

  // 6. Upsert suggestions preserving existing workflow statuses
  const savedSuggestions: (DecarbonizationSuggestion & {
    dbId: string;
    status: SuggestionStatus;
  })[] = [];
  for (const item of roadmap.suggestions) {
    const actionStepsJson = JSON.stringify(item.actionSteps);
    const techPrereqsJson = JSON.stringify(item.technicalPrerequisites);

    const rows = await sql<DecarbonizationSuggestionRow[]>`
      insert into public.decarbonization_suggestions (
        org_unit_id, reporting_period_id, suggestion_id, title, summary,
        category, priority, triggered_by_rule_code, target_feature,
        observed_value, threshold_value, potential_reduction_tco2e,
        potential_reduction_pct, investment_tier, payback_years,
        carbon_adjusted_payback_years, payback_horizon, action_steps,
        technical_prerequisites, regulatory_disclaimer
      ) values (
        ${orgUnitId}, ${reportingPeriodId}, ${item.id}, ${item.title}, ${item.summary},
        ${item.category}, ${item.priority}, ${item.triggeredByRuleCode}, ${item.targetFeature},
        ${item.observedValue}, ${item.thresholdValue}, ${item.potentialEmissionSavingsTco2e},
        ${item.potentialPercentageReduction}, ${item.investmentTier}, ${item.estimatedPaybackYears},
        ${item.carbonAdjustedPaybackYears}, ${item.paybackHorizon}, ${actionStepsJson}::jsonb,
        ${techPrereqsJson}::jsonb, ${item.regulatoryDisclaimer}
      )
      on conflict (org_unit_id, reporting_period_id, suggestion_id) do update set
        title = excluded.title,
        summary = excluded.summary,
        category = excluded.category,
        priority = excluded.priority,
        triggered_by_rule_code = excluded.triggered_by_rule_code,
        target_feature = excluded.target_feature,
        observed_value = excluded.observed_value,
        threshold_value = excluded.threshold_value,
        potential_reduction_tco2e = excluded.potential_reduction_tco2e,
        potential_reduction_pct = excluded.potential_reduction_pct,
        investment_tier = excluded.investment_tier,
        payback_years = excluded.payback_years,
        carbon_adjusted_payback_years = excluded.carbon_adjusted_payback_years,
        payback_horizon = excluded.payback_horizon,
        action_steps = excluded.action_steps,
        technical_prerequisites = excluded.technical_prerequisites,
        regulatory_disclaimer = excluded.regulatory_disclaimer,
        updated_at = now()
      returning *
    `;

    if (rows[0]) {
      savedSuggestions.push(mapRowToSuggestion(rows[0]));
    }
  }

  return {
    ...roadmap,
    suggestions: savedSuggestions,
  };
}

/**
 * Loads an existing roadmap or dynamically generates and saves one if none exists.
 */
export async function getDecarbonizationRoadmap(
  sql: Sql,
  params: { orgUnitId: string; reportingPeriodId: string },
): Promise<StrategicRoadmap> {
  const { orgUnitId, reportingPeriodId } = params;

  const roadmapRows = await sql<DecarbonizationRoadmapRow[]>`
    select * from public.decarbonization_roadmaps
    where org_unit_id = ${orgUnitId} and reporting_period_id = ${reportingPeriodId}
    limit 1
  `;

  if (roadmapRows.length === 0) {
    return generateAndSaveRoadmap(sql, { orgUnitId, reportingPeriodId });
  }

  const rm = roadmapRows[0];
  const suggestionRows = await sql<DecarbonizationSuggestionRow[]>`
    select * from public.decarbonization_suggestions
    where org_unit_id = ${orgUnitId} and reporting_period_id = ${reportingPeriodId}
    order by
      case priority
        when 'CRITICAL' then 1
        when 'HIGH' then 2
        when 'MEDIUM' then 3
        when 'LOW' then 4
        else 5
      end,
      potential_reduction_tco2e desc
  `;

  const suggestions = suggestionRows.map(mapRowToSuggestion);

  const byPriority: Record<SuggestionPriority, number> = {
    CRITICAL: suggestions.filter((s) => s.priority === "CRITICAL").length,
    HIGH: suggestions.filter((s) => s.priority === "HIGH").length,
    MEDIUM: suggestions.filter((s) => s.priority === "MEDIUM").length,
    LOW: suggestions.filter((s) => s.priority === "LOW").length,
  };

  const byCategory: Record<SuggestionCategory, number> = {
    RENEWABLE_POWER: suggestions.filter((s) => s.category === "RENEWABLE_POWER").length,
    ENERGY_EFFICIENCY: suggestions.filter((s) => s.category === "ENERGY_EFFICIENCY").length,
    FLEET_AND_FUELS: suggestions.filter((s) => s.category === "FLEET_AND_FUELS").length,
    PROCESS_AND_MATERIALS: suggestions.filter((s) => s.category === "PROCESS_AND_MATERIALS").length,
    WATER_CONSERVATION: suggestions.filter((s) => s.category === "WATER_CONSERVATION").length,
    CIRCULAR_WASTE: suggestions.filter((s) => s.category === "CIRCULAR_WASTE").length,
    GOVERNANCE_DATA_QUALITY: suggestions.filter((s) => s.category === "GOVERNANCE_DATA_QUALITY")
      .length,
  };

  return {
    reportingPeriod: rm.features_snapshot?.reportingPeriod ?? "Current Period",
    orgUnitId,
    orgUnitName: rm.features_snapshot?.orgUnitName ?? "Selected Unit",
    totalPotentialReductionTco2e: Number(rm.total_potential_reduction_tco2e),
    overallReductionPotentialPct: Number(rm.overall_reduction_pct),
    totalSuggestions: suggestions.length,
    byPriority,
    byCategory,
    suggestions,
    executiveSummary: rm.executive_summary,
    aiRationale: rm.ai_rationale ?? undefined,
    aiEnriched: rm.ai_enriched,
    generatedAt: rm.updated_at,
  };
}

/**
 * Updates a suggestion's status (OPEN, IN_REVIEW, ACCEPTED, IMPLEMENTED, DISMISSED) and audit notes.
 */
export async function updateSuggestionStatus(
  sql: Sql,
  params: {
    suggestionDbId: string;
    status: SuggestionStatus;
    notes?: string;
    assignedTo?: string;
  },
): Promise<DecarbonizationSuggestion & { dbId: string; status: SuggestionStatus }> {
  const rows = await sql<DecarbonizationSuggestionRow[]>`
    update public.decarbonization_suggestions
    set
      status = ${params.status},
      notes = coalesce(${params.notes ?? null}, notes),
      assigned_to = coalesce(${params.assignedTo ?? null}, assigned_to),
      updated_at = now()
    where id = ${params.suggestionDbId}
    returning *
  `;

  if (rows.length === 0) {
    throw new Error(`Suggestion not found: ${params.suggestionDbId}`);
  }

  return mapRowToSuggestion(rows[0]);
}
