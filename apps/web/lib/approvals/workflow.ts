import "server-only";
import { runCalculation } from "../calculation/engine.ts";
import type { Tx } from "../db.ts";

// Approval flow (03_APP_FLOW.md §4.9; schema §9.5). Pulled forward into Phase 8 at the owner's request
// (.grill/phase-8-validation-engine-decisions.md, APP_FLOW_DEVIATIONS A10). Relative imports so the
// validation backlog script can load this with plain Node.

/**
 * A validated record enters the approval queue: `approvals` gets a system `submitted` row, the record goes
 * to `review_pending`, and the people who can approve it are told. Runs in the caller's transaction.
 */
export async function submitForApproval(tx: Tx, recordId: string): Promise<void> {
  // Calculate first, so an approver never sees a record without its trace (Phase 9). A missing factor
  // blocks the number, not the queue: the record still waits here and Approve stays disabled.
  await runCalculation(tx, recordId);

  const [record] = await tx<
    { org_unit_id: string; file_name: string | null; org_unit_name: string }[]
  >`
    select r.org_unit_id, d.file_name, o.name as org_unit_name
    from public.esg_records r
    join public.org_units o on o.id = r.org_unit_id
    left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
    left join public.documents d on d.id = erd.document_id
    where r.id = ${recordId}`;

  await tx`
    update public.esg_records set approval_status = 'review_pending' where id = ${recordId}`;
  await tx`
    insert into public.approvals (esg_record_id, action, decided_by) values (${recordId}, 'submitted', null)`;

  // Corporate ESG (non-Admin approvers) whose scope covers the record see it at /app/approvals (A1);
  // when nobody below Admin can approve it, Admins are told instead.
  const message = `${record.file_name ?? "A record"} (${record.org_unit_name}) is ready for approval.`;
  const scoped = await tx<{ id: string }[]>`
    with recursive ancestors as (
      select id, parent_id from public.org_units where id = ${record.org_unit_id}
      union all
      select o.id, o.parent_id from public.org_units o join ancestors a on o.id = a.parent_id
    )
    select distinct u.id
    from public.users u
    join public.user_org_assignments uoa on uoa.user_id = u.id and uoa.revoked_at is null
    join public.roles ro on ro.id = uoa.role_id and ro.code <> 'admin'
    join public.role_permissions rp on rp.role_id = ro.id
    join public.permissions p on p.id = rp.permission_id and p.code = 'approval.decide'
    where u.is_active and u.deleted_at is null
      and uoa.org_unit_id in (select id from ancestors)`;
  if (scoped.length > 0) {
    for (const approver of scoped) {
      await tx`
        insert into public.notifications
          (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
        values (${approver.id}, 'approval_needed', 'Approval needed', ${message}, 'esg_record',
                ${recordId}, '/app/approvals')`;
    }
  } else {
    await tx`
      insert into public.notifications
        (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
      select distinct u.id, 'approval_needed', 'Approval needed', ${message}, 'esg_record',
             ${recordId}::uuid, '/admin/approval-queue'
      from public.users u
      join public.user_org_assignments uoa on uoa.user_id = u.id and uoa.revoked_at is null
      join public.roles ro on ro.id = uoa.role_id and ro.code = 'admin'
      where u.is_active and u.deleted_at is null`;
  }
}
