import "server-only";
// Relative imports (with extensions) so scripts/validate-pending.ts can run this engine with plain Node.
import { submitForApproval } from "../approvals/workflow.ts";
import { writeAudit } from "../audit.ts";
import type { Tx } from "../db.ts";
import { activityMismatch } from "../verification/mismatch.ts";
import {
  aggregate,
  checkAllowedUnits,
  checkBillingPeriodOverlap,
  checkDocumentKind,
  checkLate,
  checkSameBill,
  checkSameFile,
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
import { productOf } from "../calculation/formulas.ts";
import { declarationProblems } from "../declarations/load.ts";
import { sebiGroupProblems } from "./sebi-groups.ts";
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
      submitted_late: boolean;
      mismatch_code: string | null;
      due_on: string;
      uploaded_on: string | null;
      file_hash: string | null;
      replaces_document_id: string | null;
    }[]
  >`
    select r.id, r.org_unit_id, o.name as org_unit_name, r.reporting_period_id, p.label as period_label,
           p.start_date::text, p.end_date::text, r.metric_id, m.name as metric_name, r.submitted_by,
           d.id as document_id, d.file_name, e.id as extraction_id,
           e.raw_output->>'source' as extraction_source,
           r.submitted_late,
           e.raw_output #>> '{classification,mismatch,document_type}' as mismatch_code,
           to_char(coalesce(p.submission_closes_on, p.end_date), 'DD Mon YYYY') as due_on,
           to_char(d.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') as uploaded_on,
           d.file_hash, d.related_document_id as replaces_document_id
    from public.esg_records r
    join public.org_units o on o.id = r.org_unit_id
    join public.reporting_periods p on p.id = r.reporting_period_id
    join public.esg_metrics m on m.id = r.metric_id
    left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
    left join public.documents d on d.id = erd.document_id and d.deleted_at is null
    left join public.ocr_extractions e on e.document_id = d.id
    where r.id = ${recordId}`;

  const fields = await tx<
    {
      key: string;
      label: string;
      data_type: string;
      required: boolean;
      value: string | null;
      extracted: string | null;
    }[]
  >`
    select req.field_key as key, req.field_label as label, req.data_type::text as data_type,
           req.is_required as required, f.verified_value as value, f.extracted_value as extracted
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
    if (key === "activity_value") {
      if (!activity.ok) return null;
      // Travel: the activity value is distance x passengers (migration 0077).
      if (activity.productKeys) {
        const product = productOf(activity.productKeys.map((k) => parseNumber(valueOf(k))));
        return product === null ? null : String(product);
      }
      return valueOf(activity.valueKey);
    }
    return fields.find((f) => f.key === key)?.value ?? null;
  };
  const labelOf = (key: string | undefined) =>
    (key === "activity_value" && activity.ok && activity.productKeys
      ? "Passenger-km"
      : undefined) ??
    fields.find(
      (f) => f.key === (key === "activity_value" && activity.ok ? activity.valueKey : key),
    )?.label ??
    "Value";
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

  // --- Typed at upload against the document (migration 0077) ------------------------------------------
  // A bill whose typed value disagrees with what was confirmed goes to a reviewer, with both values named.
  const typed = await declarationProblems(
    tx,
    record.id,
    fields.map((f) => ({
      key: f.key,
      label: f.label,
      dataType: f.data_type,
      extracted: f.extracted,
      value: f.value,
    })),
    activity.ok ? activity.unitKey : null,
  );
  if (typed.declared) {
    builtIn(
      "evidence",
      typed.problems.length
        ? { ok: false, forceFlag: true, message: typed.problems.join(" ") }
        : {
            ok: true,
            message: typed.waiting ?? "The values typed at upload agree with the confirmed values.",
          },
    );
  }

  // --- SEBI's table groups (2026-11-13): text that would land in "not stated" goes to a reviewer ------
  const metricCode = (
    await tx<{ code: string }[]>`select code from public.esg_metrics where id = ${record.metric_id}`
  )[0]?.code;
  if (metricCode === "WATER_CONSUMPTION" || metricCode === "WASTE_DISPOSED") {
    const grouping = sebiGroupProblems(metricCode, valueOf, parseNumber(valueOf("discharge")));
    builtIn(
      "logical",
      grouping.length
        ? {
            ok: false,
            forceFlag: true,
            message: `${grouping.join(" ")} The report would show it as "not stated".`,
          }
        : { ok: true, message: "SEBI's tables can place this record." },
    );
  }

  // --- The document's kind (Phase 3): OCR thinks it is another activity's document ------------------
  const mismatch = await activityMismatch(tx, record.mismatch_code, record.metric_id);
  const suggestion = mismatch
    ? { typeName: mismatch.typeName, activities: mismatch.activities.map((a) => a.name) }
    : null;
  builtIn("evidence", checkDocumentKind(suggestion, record.metric_name));

  // --- Late and duplicate checks (feature_enhancement.md Phase 2, migration 0056) ---------------------
  builtIn(
    "period",
    checkLate({
      late: record.submitted_late,
      dueOn: record.due_on,
      uploadedOn: record.uploaded_on ?? "an unknown date",
    }),
  );

  // Live records elsewhere: not this one, not rejected, and not the record this upload replaces (or one
  // that replaced it) — a corrected re-upload is a new version, not a duplicate.
  const otherRecords = (where: ReturnType<typeof tx>) => tx<
    {
      metric_name: string;
      org_unit_name: string;
      period_label: string;
      submitted_by: string;
      uploaded_on: string;
    }[]
  >`
    select m.name as metric_name, o.name as org_unit_name, p.label as period_label,
           u.display_name as submitted_by,
           to_char(d.created_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') as uploaded_on
    from public.esg_records r
    join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
    join public.documents d on d.id = erd.document_id and d.deleted_at is null
    join public.esg_metrics m on m.id = r.metric_id
    join public.org_units o on o.id = r.org_unit_id
    join public.reporting_periods p on p.id = r.reporting_period_id
    join public.users u on u.id = r.submitted_by
    where r.id <> ${record.id}
      and r.data_quality_state <> 'rejected'
      and d.id is distinct from ${record.replaces_document_id}::uuid
      and d.related_document_id is distinct from ${record.document_id}::uuid
      and ${where}
    order by d.created_at`;
  const named = (rows: Awaited<ReturnType<typeof otherRecords>>) =>
    rows.map((row) => ({
      metricName: row.metric_name,
      orgUnitName: row.org_unit_name,
      periodLabel: row.period_label,
      submittedBy: row.submitted_by,
      uploadedOn: row.uploaded_on,
    }));

  const sameFile = record.file_hash
    ? named(await otherRecords(tx`d.file_hash = ${record.file_hash}`))
    : [];
  const sameFileVerdict = checkSameFile(sameFile);
  builtIn("evidence", sameFileVerdict);

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
          def as { min?: number; min_exclusive?: number; max?: number; flag_zero?: boolean },
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
        // Same bill = same activity, same bill number and, where both have one, the same billing
        // period, in any unit and any period (owner's rule of 2026-11-07). No supplier is captured for
        // most activities yet, so the activity stands in for it.
        const invoice = valueOf(def.field)?.trim() || null;
        const billingPeriod = valueOf("billing_period")?.trim() || null;
        const others = invoice
          ? named(
              await otherRecords(tx`
                r.metric_id = ${record.metric_id}
                and r.verification_status = 'user_verified'
                and upper(trim(coalesce(r.bill_number, ''))) = upper(${invoice})
                and (
                  ${billingPeriod}::text is null
                  or not exists (
                    select 1 from public.ocr_extractions e2
                    join public.ocr_fields f2
                      on f2.ocr_extraction_id = e2.id and f2.field_key = 'billing_period'
                    where e2.document_id = d.id
                      and nullif(trim(f2.verified_value), '') is not null
                      and upper(trim(f2.verified_value)) <> upper(${billingPeriod})
                  )
                )`),
            )
          : [];
        verdict = checkSameBill(invoice, others);
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
        is_duplicate_flag = ${duplicateInvoice || !sameFileVerdict.ok},
        bill_number = ${valueOf("invoice_number")?.trim() || null}
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
