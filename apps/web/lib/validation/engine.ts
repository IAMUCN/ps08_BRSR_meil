import "server-only";
// Relative imports (with extensions) so scripts/validate-pending.ts can run this engine with plain Node.
import { submitForApproval } from "../approvals/workflow.ts";
import { writeAudit } from "../audit.ts";
import type { Tx } from "../db.ts";
import {
  aggregate,
  checkAllowedUnits,
  checkBillingPeriodOverlap,
  checkDuplicateInvoice,
  checkDuplicatePeriod,
  checkEvidence,
  checkFormat,
  checkHistoryRatio,
  checkOrganizational,
  checkNotGreaterThan,
  checkRange,
  outcomeOf,
  parseNumber,
  type Outcome,
  type RuleType,
  type Severity,
  type Verdict,
} from "./checks.ts";
import { activityKeyFor } from "../calculation/engine.ts";
import { activityFieldKeys } from "../verification/rules.ts";

// The validation engine (06_IMPLEMENTATION_PLAN.md Phase 8). Called inside the Confirm transaction
// (schema §20.3), so a record is never verified without its first validation results. Not exposed as a
// client-callable endpoint: running validation changes lifecycle state (SCHEMA_DEVIATIONS D1).

export type ValidationStatus = "validated" | "flagged" | "failed";
export type ValidationOutcome = { status: ValidationStatus; failures: string[]; flags: string[] };

type Rule = {
  id: string;
  rule_type: RuleType;
  rule_definition: Record<string, unknown> & { check?: string; field?: string };
  severity: Severity;
};

type Evaluated = { ruleId: string | null; ruleType: RuleType; outcome: Outcome; message: string };

export async function runValidation(tx: Tx, recordId: string): Promise<ValidationOutcome> {
  const [record] = await tx<
    {
      id: string;
      org_unit_id: string;
      org_unit_name: string;
      reporting_period_id: string;
      period_label: string;
      start_date: string;
      end_date: string;
      metric_id: string;
      metric_name: string;
      submitted_by: string;
      document_id: string | null;
      file_name: string | null;
      extraction_id: string | null;
      extraction_source: string | null;
    }[]
  >`
    select r.id, r.org_unit_id, o.name as org_unit_name, r.reporting_period_id, p.label as period_label,
           p.start_date::text, p.end_date::text, r.metric_id, m.name as metric_name, r.submitted_by,
           d.id as document_id, d.file_name, e.id as extraction_id,
           e.raw_output->>'source' as extraction_source
    from public.esg_records r
    join public.org_units o on o.id = r.org_unit_id
    join public.reporting_periods p on p.id = r.reporting_period_id
    join public.esg_metrics m on m.id = r.metric_id
    left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
    left join public.documents d on d.id = erd.document_id and d.deleted_at is null
    left join public.ocr_extractions e on e.document_id = d.id
    where r.id = ${recordId}`;

  const fields = await tx<
    { key: string; label: string; data_type: string; required: boolean; value: string | null }[]
  >`
    select req.field_key as key, req.field_label as label, req.data_type::text as data_type,
           req.is_required as required, f.verified_value as value
    from public.metric_field_requirements req
    left join public.ocr_fields f
      on f.field_key = req.field_key and f.ocr_extraction_id = ${record.extraction_id}
    where req.metric_id = ${record.metric_id}
    order by req.field_label`;

  const activity = activityFieldKeys(
    fields.map((f) => ({ key: f.key, dataType: f.data_type as never, required: f.required })),
    await activityKeyFor(tx, record.metric_id),
  );
  const valueOf = (key: string | undefined): string | null => {
    if (!key) return null;
    if (key === "activity_value") return activity.ok ? valueOf(activity.valueKey) : null;
    return fields.find((f) => f.key === key)?.value ?? null;
  };
  const labelOf = (key: string | undefined) =>
    fields.find(
      (f) => f.key === (key === "activity_value" && activity.ok ? activity.valueKey : key),
    )?.label ?? "Value";
  const where = `${record.org_unit_name} in ${record.period_label}`;
  const results: Evaluated[] = [];
  const builtIn = (ruleType: RuleType, verdict: Verdict) =>
    results.push({
      ruleId: null,
      ruleType,
      outcome: outcomeOf(verdict, "hard_fail"),
      message: verdict.message,
    });

  // --- Built-in structural checks (validation_rule_id null, schema §9.4) ---------------------------
  builtIn("format", checkFormat(fields.map((f) => ({ ...f, dataType: f.data_type }))));

  const [scope] = await tx<{ active: boolean; in_scope: boolean }[]>`
    with recursive ancestors as (
      select id, parent_id, status, deleted_at from public.org_units where id = ${record.org_unit_id}
      union all
      select o.id, o.parent_id, o.status, o.deleted_at
      from public.org_units o join ancestors a on o.id = a.parent_id
    )
    select
      bool_and(status = 'active' and deleted_at is null) as active,
      exists (
        select 1 from public.user_org_assignments uoa
        join public.users u on u.id = uoa.user_id and u.is_active
        where uoa.user_id = ${record.submitted_by} and uoa.revoked_at is null
          and uoa.org_unit_id in (select id from ancestors)
      ) as in_scope
    from ancestors`;
  builtIn(
    "organizational",
    checkOrganizational({
      orgUnitName: record.org_unit_name,
      active: scope.active,
      inSubmitterScope: scope.in_scope,
    }),
  );

  builtIn(
    "evidence",
    checkEvidence({
      attached: record.document_id !== null && record.extraction_id !== null,
      manualException: record.extraction_source === "manual_exception",
    }),
  );

  // --- Configured checks (validation_rules, migration 0015) ------------------------------------------
  const rules = await tx<Rule[]>`
    select id, rule_type, rule_definition, severity from public.validation_rules
    where is_active and (metric_id is null or metric_id = ${record.metric_id})
    order by rule_type, id`;

  let duplicateInvoice = false;
  for (const rule of rules) {
    const def = rule.rule_definition;
    let verdict: Verdict;
    switch (def.check) {
      case "range":
        verdict = checkRange(
          parseNumber(valueOf(def.field)),
          labelOf(def.field),
          def as { min?: number; min_exclusive?: number; max?: number },
        );
        break;
      case "not_greater_than":
        verdict = checkNotGreaterThan(
          { label: labelOf(def.field), value: parseNumber(valueOf(def.field)) },
          { label: labelOf(def.than as string), value: parseNumber(valueOf(def.than as string)) },
        );
        break;
      case "allowed_units":
        verdict = checkAllowedUnits(
          valueOf(def.field),
          (def.units as string[]) ?? [],
          record.metric_name,
        );
        break;
      case "billing_period_overlap":
        verdict = checkBillingPeriodOverlap(valueOf(def.field), {
          label: record.period_label,
          startDate: record.start_date,
          endDate: record.end_date,
        });
        break;
      case "duplicate_invoice": {
        const invoice = valueOf(def.field);
        const [row] = await tx<{ n: number }[]>`
          select count(*)::int as n
          from public.esg_records r
          join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
          join public.ocr_extractions e on e.document_id = erd.document_id
          join public.ocr_fields f on f.ocr_extraction_id = e.id and f.field_key = ${def.field ?? ""}
          where r.id <> ${record.id}
            and r.org_unit_id = ${record.org_unit_id}
            and r.reporting_period_id = ${record.reporting_period_id}
            and r.metric_id = ${record.metric_id}
            and r.verification_status = 'user_verified'
            and r.data_quality_state <> 'rejected'
            and upper(trim(coalesce(f.verified_value, ''))) = upper(trim(${invoice ?? ""}))`;
        verdict = checkDuplicateInvoice(invoice, row.n, where);
        duplicateInvoice ||= !verdict.ok;
        break;
      }
      case "duplicate_period": {
        const [row] = await tx<{ n: number }[]>`
          select count(*)::int as n from public.esg_records r
          where r.id <> ${record.id}
            and r.org_unit_id = ${record.org_unit_id}
            and r.reporting_period_id = ${record.reporting_period_id}
            and r.metric_id = ${record.metric_id}
            and r.verification_status = 'user_verified'
            and r.data_quality_state <> 'rejected'`;
        verdict = checkDuplicatePeriod(row.n, record.metric_name, where);
        break;
      }
      case "history_ratio": {
        const lookback = Number(def.lookback_periods ?? 12);
        const history = await tx<{ period_id: string; value: number }[]>`
          select r.reporting_period_id as period_id, r.activity_value_verified::float as value
          from public.esg_records r
          where r.org_unit_id = ${record.org_unit_id}
            and r.metric_id = ${record.metric_id}
            and r.id <> ${record.id}
            and r.validation_status = 'validated'
            and r.activity_value_verified is not null
            and r.reporting_period_id in (
              select id from public.reporting_periods
              where start_date < ${record.start_date}::date
              order by start_date desc limit ${lookback}
            )`;
        verdict = checkHistoryRatio(
          parseNumber(valueOf(def.field)),
          history.map((h) => ({ periodId: h.period_id, value: h.value })),
          { max_ratio: Number(def.max_ratio ?? 2), min_periods: Number(def.min_periods ?? 3) },
        );
        break;
      }
      default:
        // Configuration naming a check this build doesn't know: a person must look, never a silent pass.
        verdict = {
          ok: false,
          forceFlag: true,
          message: `Validation rule uses an unknown check "${String(def.check)}" — Admin must review.`,
        };
    }
    results.push({
      ruleId: rule.id,
      ruleType: rule.rule_type,
      outcome: outcomeOf(verdict, rule.severity),
      message: verdict.message,
    });
  }

  // --- Record the run -----------------------------------------------------------------------------
  for (const r of results) {
    await tx`
      insert into public.validation_results (esg_record_id, validation_rule_id, rule_type, result, message)
      values (${record.id}, ${r.ruleId}, ${r.ruleType}, ${r.outcome}, ${r.message})`;
  }
  const status = aggregate(results.map((r) => r.outcome));
  await tx`
    update public.esg_records
    set validation_status = ${status},
        data_quality_state = ${status === "failed" ? "verified" : status},
        approval_status = 'not_submitted',
        is_duplicate_flag = is_duplicate_flag or ${duplicateInvoice}
    where id = ${record.id}`;
  const failures = results.filter((r) => r.outcome === "fail").map((r) => r.message);
  const flags = results.filter((r) => r.outcome === "flagged").map((r) => r.message);
  await writeAudit(tx, {
    eventType: "validation.completed",
    entityType: "esg_record",
    entityId: record.id,
    userId: null, // a system evaluation (Master Approach §31)
    newValue: { validation_status: status, failures, flags, rules_evaluated: results.length },
  });
  // A clean pass goes straight to the approval queue (§4.9); flags wait for the Validation Queue first.
  // After the entry above, so the audit trail reads in the order things happened: validated, then queued.
  if (status === "validated") await submitForApproval(tx, record.id);

  // Notifications (.grill/phase-8-validation-engine-decisions.md): returns to the submitter, flags to Admins.
  const fileName = record.file_name ?? record.metric_name;
  if (status === "failed") {
    await tx`
      insert into public.notifications
        (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
      values (${record.submitted_by}, 'returned', 'Returned for correction',
              ${`${fileName}: ${failures[0]}${failures.length > 1 ? ` (+${failures.length - 1} more)` : ""}`},
              'esg_record', ${record.id}, ${`/app/verify/${record.document_id}`})`;
  } else if (status === "flagged") {
    await tx`
      insert into public.notifications
        (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
      select distinct u.id, 'validation_review', 'Validation review needed',
             ${`${fileName} (${record.org_unit_name}): ${flags[0]}`},
             'esg_record', ${record.id}::uuid, '/admin/validation-queue'
      from public.users u
      join public.user_org_assignments uoa on uoa.user_id = u.id and uoa.revoked_at is null
      join public.roles ro on ro.id = uoa.role_id and ro.code = 'admin'
      where u.is_active and u.deleted_at is null`;
  }

  return { status, failures, flags };
}
