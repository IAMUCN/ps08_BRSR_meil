// Phase 4 of feature_enhancement.md: forwarding a report up the organisation for verification (migration
// 0058) and the audit trail scoped by role and hierarchy, with its search bar. Local stack only.
import {
  Session,
  check,
  ensureInvited,
  finish,
  ok,
  one,
  openPeriodId,
  orgId,
  rejected,
  section,
  setup,
  sql,
} from "./lib.mjs";

const { sessions } = await setup();
const { admin, pm } = sessions;

// Administrators of Project X and of Subsidiary A (Project X sits under Subsidiary A, under MEIL).
const signIn = async (account) => {
  const who = await ensureInvited(admin, account);
  const session = new Session();
  await session.login(who, { takeover: true });
  return {
    session,
    id: (await one(sql`select id from public.users where email = ${who.email}`)).id,
  };
};
const prjAdmin = await signIn({
  email: "e2e.prjx.admin@traceesg.test",
  role: "org_admin",
  org: "PRJ-X",
  name: "E2E Project X Administrator",
});
const subAdmin = await signIn({
  email: "e2e.suba.admin@traceesg.test",
  role: "org_admin",
  org: "SUB-A",
  name: "E2E Subsidiary A Administrator",
});
// No Administrator at MEIL: the step above Subsidiary A goes to the Super Admins.
const meilAdmins = await one(sql`
  select count(*)::int as n from public.user_org_assignments uoa
  join public.roles r on r.id = uoa.role_id and r.code = 'org_admin'
  where uoa.org_unit_id = (select id from public.org_units where code = 'MEIL') and uoa.revoked_at is null`);

async function waitForRun(runId) {
  for (let i = 0; i < 120; i++) {
    const run = await one(
      sql`select status::text as status, error_message from public.report_runs where id = ${runId}`,
    );
    if (run?.status === "completed" || run?.status === "failed") return run;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { status: "timeout" };
}
const projectX = await orgId("PRJ-X");
const periodId = await openPeriodId();
const generate = async () => {
  const gen = await prjAdmin.session.mutate("reports.generate", { orgUnitId: projectX, periodId });
  const run = await waitForRun(gen.data?.runId);
  return { runId: gen.data?.runId, run };
};

// ============================================================================================================
section("Forwarding a report up for verification");
// ============================================================================================================
const first = await generate();
check(
  "the Project X Administrator generates a report",
  first.run.status === "completed",
  JSON.stringify(first.run),
);
check(
  "a Project Manager cannot forward it",
  (await pm.mutate("reportForwarding.forward", { reportRunId: first.runId })).status === 403,
);
const forwarded = await prjAdmin.session.mutate("reportForwarding.forward", {
  reportRunId: first.runId,
  note: "September figures for review.",
});
check(
  "its Administrator forwards it",
  ok(forwarded) && forwarded.data?.sent === 1,
  forwarded.error,
);
const step1 = await one(sql`
  select f.id, o.code as to_code, f.status from public.report_forwards f
  join public.org_units o on o.id = f.to_org_unit_id
  where f.report_run_id = ${first.runId}`);
check(
  "it goes to the next unit up with an Administrator: Subsidiary A",
  step1?.to_code === "SUB-A",
);
check(
  "Subsidiary A's Administrator is notified",
  Boolean(
    await one(sql`
      select 1 as x from public.notifications
      where user_id = ${subAdmin.id} and type = 'report_forwarded' and related_entity_id = ${first.runId}`),
  ),
);
check(
  "forwarding it again while it waits is refused",
  rejected(
    await prjAdmin.session.mutate("reportForwarding.forward", { reportRunId: first.runId }),
    "already waiting",
  ),
);
check(
  "the sender cannot verify it",
  (
    await prjAdmin.session.mutate("reportForwarding.decide", {
      forwardId: step1.id,
      decision: "verify",
    })
  ).status !== 200,
);
const inbox = (await subAdmin.session.query("reportForwarding.inbox")).data ?? [];
check(
  "it is in Subsidiary A's inbox",
  inbox.some((i) => i.id === step1.id && i.canDecide),
);
check(
  "a Project Manager has nothing to verify",
  ((await pm.query("reportForwarding.inbox")).data ?? []).length === 0,
);
const verified = await subAdmin.session.mutate("reportForwarding.decide", {
  forwardId: step1.id,
  decision: "verify",
});
check("Subsidiary A's Administrator verifies it", ok(verified), verified.error);
check(
  "the sender is told",
  Boolean(
    await one(sql`
      select 1 as x from public.notifications
      where user_id = ${prjAdmin.id} and type = 'report_verified' and related_entity_id = ${first.runId}`),
  ),
);
const onward = await subAdmin.session.mutate("reportForwarding.forward", {
  reportRunId: first.runId,
  fromForwardId: step1.id,
});
check("and sends it on to the next level", ok(onward), onward.error);
const step2 = await one(sql`
  select id, to_org_unit_id, previous_forward_id from public.report_forwards
  where report_run_id = ${first.runId} and id <> ${step1.id}`);
check(
  meilAdmins.n === 0
    ? "with no Administrator above, it goes to the Super Admins"
    : "it goes to MEIL's Administrators",
  meilAdmins.n === 0 ? step2?.to_org_unit_id === null : step2?.to_org_unit_id !== null,
);
check("linked to the step before it", step2?.previous_forward_id === step1.id);
check(
  "sending it on twice is refused",
  rejected(
    await subAdmin.session.mutate("reportForwarding.forward", {
      reportRunId: first.runId,
      fromForwardId: step1.id,
    }),
  ),
);
if (meilAdmins.n === 0) {
  check(
    "Subsidiary A's Administrator cannot decide a step for the Super Admins",
    (
      await subAdmin.session.mutate("reportForwarding.decide", {
        forwardId: step2.id,
        decision: "verify",
      })
    ).status !== 200,
  );
  const top = await admin.mutate("reportForwarding.decide", {
    forwardId: step2.id,
    decision: "verify",
  });
  check("a Super Admin verifies it at the top", ok(top), top.error);
}
const trail = (await prjAdmin.session.query("reportForwarding.trail", { reportRunId: first.runId }))
  .data;
check(
  "the report shows its whole trail",
  trail?.length === 2 && trail[0].toUnit === "Subsidiary A" && trail[0].status === "verified",
  JSON.stringify(trail?.map((t) => [t.toUnit, t.status])),
);
const forwardAudit = await one(sql`
  select count(*)::int as n from public.audit_logs
  where entity_id = ${first.runId} and event_type in ('report.forwarded', 'report.verified')`);
check("every step is in the audit log", forwardAudit.n >= 3, `${forwardAudit.n} entries`);

section("Returning a report for correction");
const second = await generate();
await prjAdmin.session.mutate("reportForwarding.forward", { reportRunId: second.runId });
const step3 = await one(
  sql`select id from public.report_forwards where report_run_id = ${second.runId}`,
);
check(
  "returning needs a reason",
  rejected(
    await subAdmin.session.mutate("reportForwarding.decide", {
      forwardId: step3.id,
      decision: "return",
      reason: "no",
    }),
    "at least 10",
  ),
);
const returned = await subAdmin.session.mutate("reportForwarding.decide", {
  forwardId: step3.id,
  decision: "return",
  reason: "Diesel figure for the site looks doubled.",
});
check("the receiver returns it with a reason", ok(returned), returned.error);
check(
  "the sender is told why",
  (
    await one(sql`
      select message from public.notifications
      where user_id = ${prjAdmin.id} and type = 'report_returned' and related_entity_id = ${second.runId}`)
  )?.message?.includes("looks doubled"),
);
check(
  "a returned step cannot be decided again",
  rejected(
    await subAdmin.session.mutate("reportForwarding.decide", {
      forwardId: step3.id,
      decision: "verify",
    }),
  ),
);

// ============================================================================================================
section("The audit trail, scoped by role and hierarchy");
// ============================================================================================================
const pmMine = await pm.query("audit.query", {});
const pmIds = (pmMine.data?.events ?? []).map((e) => e.id);
check(
  "a Project Manager sees only their own entries",
  ok(pmMine) &&
    (
      await one(sql`
      select count(*)::int as n from public.audit_logs
      where id = any(${pmIds}::uuid[]) and user_id is distinct from
        (select id from public.users where email = 'e2e.pm@traceesg.test')`)
    ).n === 0,
);
const subView = await subAdmin.session.query("audit.query", {});
const subIds = (subView.data?.events ?? []).map((e) => e.id);
check("Subsidiary A's Administrator sees their unit's entries", subIds.length > 0, subView.error);
check(
  "including the Project X Administrator's forwarding",
  (subView.data?.events ?? []).some(
    (e) => e.event === "report.forwarded" && e.who === "E2E Project X Administrator",
  ),
);
// Nothing outside Subsidiary A: every entry that is not their own is about something inside it.
const outside = await one(sql`
  with scope as (select descendant_id as id from public.org_unit_tree
                 where ancestor_id = (select id from public.org_units where code = 'SUB-A'))
  select count(*)::int as n from public.audit_logs a
  where a.id = any(${subIds}::uuid[]) and a.user_id is distinct from ${subAdmin.id}
    and not (
         (a.entity_type = 'esg_record' and exists (select 1 from public.esg_records x where x.id = a.entity_id and x.org_unit_id in (select id from scope)))
      or (a.entity_type = 'document' and exists (select 1 from public.documents x where x.id = a.entity_id and x.org_unit_id in (select id from scope)))
      or (a.entity_type = 'ocr_job' and exists (select 1 from public.ocr_jobs x join public.documents d on d.id = x.document_id where x.id = a.entity_id and d.org_unit_id in (select id from scope)))
      or (a.entity_type = 'report_run' and exists (select 1 from public.report_runs x where x.id = a.entity_id and x.org_unit_id in (select id from scope)))
      or (a.entity_type = 'org_unit' and a.entity_id in (select id from scope))
      or (a.entity_type = 'user' and exists (select 1 from public.user_org_assignments x where x.user_id = a.entity_id and x.org_unit_id in (select id from scope))))`);
check(
  "and nothing about another subsidiary or the group's configuration",
  outside.n === 0,
  `${outside.n} outside`,
);
const roles = (subView.data?.events ?? []).find(
  (e) => e.who === "E2E Project X Administrator",
)?.whoRoles;
check("each person's role is shown beside their entries", roles?.includes("Administrator"), roles);
const searched = await subAdmin.session.query("audit.query", { q: "report.returned" });
check(
  "the search bar finds by action",
  (searched.data?.events ?? []).length > 0 &&
    searched.data.events.every(
      (e) =>
        e.event.includes("report.returned") ||
        JSON.stringify(e).toLowerCase().includes("report.returned"),
    ),
);
const byWord = await subAdmin.session.query("audit.query", { q: "doubled" });
check(
  "and by words in a reason",
  (byWord.data?.events ?? []).some((e) => e.reason?.includes("doubled")),
);
const injected = await subAdmin.session.query("audit.query", { q: "%' or 1=1 --" });
check(
  "a hostile search is read as text, nothing more",
  ok(injected) && (injected.data?.events ?? []).length === 0,
);
const mineOnly = await subAdmin.session.query("audit.query", { mine: true });
check(
  "Only my activity keeps their own entries",
  (mineOnly.data?.events ?? []).every((e) => e.who === "E2E Subsidiary A Administrator"),
);
const superAll = await admin.query("audit.query", {});
check(
  "the Super Admin still sees everything",
  ok(superAll) && (superAll.data?.events ?? []).length > 0,
);

// A record's full history: open to the record's own Administrators, refused outside.
const xRecord = await one(
  sql`select id from public.esg_records where org_unit_id = ${projectX} limit 1`,
);
const farRecord = await one(sql`
  select r.id from public.esg_records r join public.org_units o on o.id = r.org_unit_id
  where o.code like 'E2E-FAR%' limit 1`);
if (xRecord) {
  check(
    "Subsidiary A's Administrator opens a Project X record's history",
    ok(await subAdmin.session.query("audit.record", { recordId: xRecord.id })),
  );
}
if (farRecord) {
  check(
    "but not another subsidiary's record's history",
    (await subAdmin.session.query("audit.record", { recordId: farRecord.id })).status !== 200,
  );
}
const activity = await pm.get("/app/activity");
check(
  "everyone has a My Activity page",
  activity.status === 200 && activity.html.includes("My Activity"),
);

await finish();
