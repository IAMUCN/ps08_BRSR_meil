// Super Admins and scoped Administrators through the running app (migration 0050;
// .grill/scoped-admin-onboarding-decisions.md). An Administrator of Subsidiary A and one of Project X sign in
// through the real form and use the real pages and procedures: what is about their own units opens, group-wide
// configuration and every other branch do not, roles are handed out only downwards, an administrator
// uploads any activity, nobody but a Super Admin approves their own record, and a Super Admin too many is
// refused by the database.
import {
  RUN,
  check,
  confirm,
  ensureInvited,
  finish,
  ok,
  one,
  orgId,
  recordOf,
  rejected,
  roleId,
  runWorker,
  sample,
  section,
  Session,
  setup,
  sql,
  upload,
  userId,
} from "./lib.mjs";

const { sessions } = await setup();
const { admin } = sessions;

// --- Fixtures: a sibling project under Subsidiary A and a sibling subsidiary, created through the app ---------
async function ensureUnit(code, name, parentCode, unitType) {
  const existing = await orgId(code);
  if (existing) return existing;
  const created = await admin.mutate("organization.create", {
    parentId: await orgId(parentCode),
    unitType,
    name,
    code,
  });
  if (!ok(created)) throw new Error(`could not create ${code}: ${created.error}`);
  return created.data.id;
}
const MEIL = await orgId("MEIL");
const SUB_A = await orgId("SUB-A");
const PRJ_X = await orgId("PRJ-X");
const PRJ_Z = await ensureUnit("E2E-PRJ-Z", "E2E Project Z", "SUB-A", "project");
const SUB_B = await ensureUnit("E2E-SUB-B", "E2E Subsidiary B", "MEIL", "subsidiary");
const ADMIN_ROLE = await roleId("admin");
const ORG_ADMIN = await roleId("org_admin");
const HR = await roleId("hr");

async function signIn(account) {
  const credentials = await ensureInvited(admin, account);
  // An interrupted earlier run may have left the account deactivated.
  await admin.mutate("users.reactivate", { userId: await userId(account.email) });
  const session = new Session();
  const login = await session.login(credentials);
  return { session, login };
}
const sub = await signIn({
  email: "e2e.subadmin@traceesg.test",
  role: "org_admin",
  org: "SUB-A",
  name: "E2E Subsidiary Administrator",
});
const prj = await signIn({
  email: "e2e.prjadmin@traceesg.test",
  role: "org_admin",
  org: "PRJ-X",
  name: "E2E Project Administrator",
});
const subAdmin = sub.session;
const prjAdmin = prj.session;
const subAdminId = await userId("e2e.subadmin@traceesg.test");
const prjAdminId = await userId("e2e.prjadmin@traceesg.test");

/** A page that sends the caller away (a 307, or — behind a streamed skeleton — a redirect in the payload). */
const sentAway = (page) =>
  !!page.location?.includes("notice=forbidden") || page.html.includes("notice=forbidden");
const opens = (page) => page.status === 200 && !sentAway(page);

section("An Administrator works in the admin area");
check("the subsidiary Administrator lands on /admin", sub.login.location?.endsWith("/admin"));
check("the project Administrator lands on /admin", prj.login.location?.endsWith("/admin"));
for (const path of [
  "/admin",
  "/admin/users",
  "/admin/organization",
  "/admin/submissions",
  "/admin/data-explorer",
  "/admin/validation-queue",
  "/admin/approval-queue",
  "/admin/scope-1",
  "/admin/reports",
  "/app/upload",
  "/app/submissions",
]) {
  check(`${path} opens for the project Administrator`, opens(await prjAdmin.get(path)));
}
const dashboard = await prjAdmin.get("/admin");
check(
  "their sidebar offers no group-wide configuration",
  !dashboard.html.includes("/admin/conversion-factors") &&
    !dashboard.html.includes("/admin/roles") &&
    dashboard.html.includes("/admin/users"),
);
check(
  "and the Audit Trail, scoped to their units (Phase 4)",
  dashboard.html.includes("/admin/audit-trail"),
);

section("Group-wide configuration stays with the Super Admin");
for (const path of [
  "/admin/conversion-factors",
  "/admin/roles",
  "/admin/reporting-periods",
  "/admin/brsr-mapping",
  "/admin/disclosures",
]) {
  check(`${path} sends the subsidiary Administrator away`, sentAway(await subAdmin.get(path)));
}
// Phase 4: an Administrator reads the audit log too, but only their own entries and their units'.
const subAudit = await subAdmin.query("audit.query", {});
check("the Administrator may open the audit log (scoped)", ok(subAudit), subAudit.error);
for (const path of ["roles.matrix", "ocr.jobs"]) {
  const input = undefined;
  check(`reading ${path} is refused`, (await subAdmin.query(path, input)).status === 403);
}
// Phase 3: OCR Monitoring is part of Submission Monitoring now; the old address sends everyone there.
const oldOcr = await subAdmin.get("/admin/ocr-monitoring");
check(
  "the old OCR Monitoring address opens Submission Monitoring's OCR filter",
  /\/admin\/submissions\?ocr=attention/.test(oldOcr.location ?? "") ||
    oldOcr.html.includes("NEXT_REDIRECT;replace;/admin/submissions?ocr=attention"),
  oldOcr.location,
);
check(
  "the yearly report inputs are refused",
  (await subAdmin.query("reports.inputs", { financialYear: 2026 })).status === 403,
);
check(
  "adding a hierarchy level is refused",
  (await subAdmin.mutate("organization.addLevel", { label: "E2E Level", afterCode: "project" }))
    .status === 403,
);
check(
  "entering a conversion factor is refused",
  (
    await subAdmin.mutate("factors.create", {
      activityType: "X",
      name: "xx",
      value: 1,
      inputUnit: "L",
      outputUnit: "kgCO2e",
      sourceReference: "x",
      effectiveFrom: "2026-01-01",
    })
  ).status === 403,
);

section("Figures stay inside what each administers");
const own = await prjAdmin.query("scope.getTotal", { scopeCode: "SCOPE_1" });
check(
  "the project Administrator's Scope 1 page opens on their project",
  ok(own) && own.data?.node?.id === PRJ_X,
  JSON.stringify(own.data?.node?.id ?? own.error),
);
for (const [label, unit] of [
  ["a sibling project", PRJ_Z],
  ["the subsidiary above", SUB_A],
  ["the group", MEIL],
]) {
  check(
    `the project Administrator is refused Scope 1 of ${label}`,
    (await prjAdmin.query("scope.getTotal", { scopeCode: "SCOPE_1", orgUnitId: unit })).status ===
      403,
  );
  check(
    `and the records of ${label}`,
    (await prjAdmin.query("records.search", { orgUnitId: unit })).status === 403,
  );
}
check(
  "the subsidiary Administrator reads a project beneath them",
  ok(await subAdmin.query("scope.getTotal", { scopeCode: "SCOPE_1", orgUnitId: PRJ_X })),
);
for (const [label, unit] of [
  ["a sibling subsidiary", SUB_B],
  ["the group", MEIL],
]) {
  check(
    `the subsidiary Administrator is refused ${label}`,
    (await subAdmin.query("records.search", { orgUnitId: unit })).status === 403,
  );
}
const explorer = await subAdmin.query("records.search", {});
check(
  "their Data Explorer offers their own branch only",
  ok(explorer) &&
    explorer.data.context.orgUnitId === SUB_A &&
    explorer.data.context.orgUnits.every((o) => o.id !== SUB_B && o.id !== MEIL),
  JSON.stringify(explorer.data?.context?.orgUnits?.map((o) => o.name)),
);
const tree = await subAdmin.query("organization.tree");
const unit = (id) => tree.data?.find((n) => n.id === id);
check(
  "the Organization tree shows their branch as theirs, the group by name only, and no sibling",
  unit(PRJ_X)?.manageable === true &&
    unit(SUB_A)?.manageable === false &&
    unit(SUB_A)?.ownable === true &&
    unit(MEIL)?.inScope === false &&
    !unit(SUB_B),
  JSON.stringify([unit(PRJ_X), unit(SUB_A), unit(MEIL)].map((n) => n && [n.name, n.manageable])),
);

section("Roles are handed out downwards only");
const invite = (who, role, org, tag) =>
  who.mutate("users.invite", {
    email: `e2e.sa.${tag}.${RUN}@traceesg.test`,
    displayName: `E2E scoped ${tag}`,
    roleId: role,
    orgUnitId: org,
  });
const hrInvite = await invite(prjAdmin, HR, PRJ_X, "hr");
check("the project Administrator invites HR for their project", ok(hrInvite), hrInvite.error);
const hrId = await userId(`e2e.sa.hr.${RUN}@traceesg.test`);
check("but not for a sibling project", (await invite(prjAdmin, HR, PRJ_Z, "hr-z")).status === 403);
check(
  "nor another Administrator of their own project",
  (await invite(prjAdmin, ORG_ADMIN, PRJ_X, "peer")).status === 403,
);
const deputy = await invite(subAdmin, ORG_ADMIN, PRJ_Z, "deputy");
check("the subsidiary Administrator appoints one for a project beneath", ok(deputy), deputy.error);
const deputyId = await userId(`e2e.sa.deputy.${RUN}@traceesg.test`);
check(
  "but not a peer at their own subsidiary",
  (await invite(subAdmin, ORG_ADMIN, SUB_A, "sub-peer")).status === 403,
);
check(
  "nor anyone at a sibling subsidiary",
  (await invite(subAdmin, HR, SUB_B, "hr-b")).status === 403,
);
check("nor a Super Admin", (await invite(subAdmin, ADMIN_ROLE, MEIL, "super")).status === 403);
check(
  "no account was left behind by a refused invitation",
  (
    await one(sql`
    select count(*)::int as n from public.users
    where email like ${`e2e.sa.%.${RUN}@traceesg.test`}`)
  ).n === 2,
);
const listed = await prjAdmin.query("users.list");
check(
  "the project Administrator's Users page lists their own people only",
  ok(listed) &&
    listed.data.some((u) => u.id === hrId) &&
    listed.data.every((u) => u.id !== deputyId) &&
    listed.data.every((u) => u.assignments.some((a) => a.orgUnitId === PRJ_X)),
  `${listed.data?.length} listed`,
);
check(
  "and marks the Administrator above them as out of reach",
  listed.data?.find((u) => u.id === prjAdminId)?.manageable === false,
);

section("An account is changed only by someone who administers all of it");
check(
  "the project Administrator cannot deactivate the subsidiary Administrator",
  rejected(await prjAdmin.mutate("users.deactivate", { userId: subAdminId })),
);
check(
  "nor the Super Admin",
  rejected(
    await prjAdmin.mutate("users.deactivate", { userId: await userId("e2e.admin@traceesg.test") }),
  ),
);
// The HR person also gets a role in the sibling project: now only part of them is the project's.
const second = await subAdmin.mutate("users.addAssignment", {
  userId: hrId,
  roleId: HR,
  orgUnitId: PRJ_Z,
});
check(
  "the subsidiary Administrator gives the HR person a second project",
  ok(second),
  second.error,
);
check(
  "the project Administrator can then no longer deactivate that account",
  (await prjAdmin.mutate("users.deactivate", { userId: hrId })).status === 403,
);
const hrRoles = await sql`
  select uoa.id, uoa.org_unit_id from public.user_org_assignments uoa
  where uoa.user_id = ${hrId} and uoa.revoked_at is null`;
check(
  "nor take away the role in the other project",
  (
    await prjAdmin.mutate("users.revokeAssignment", {
      assignmentId: hrRoles.find((a) => a.org_unit_id === PRJ_Z).id,
    })
  ).status === 403,
);
check(
  "but still takes away the role in their own",
  ok(
    await prjAdmin.mutate("users.revokeAssignment", {
      assignmentId: hrRoles.find((a) => a.org_unit_id === PRJ_X).id,
    }),
  ),
);
check(
  "the subsidiary Administrator, who administers both, deactivates the account",
  ok(await subAdmin.mutate("users.deactivate", { userId: hrId })),
);
check(
  "nobody changes their own roles",
  rejected(
    await subAdmin.mutate("users.addAssignment", {
      userId: subAdminId,
      roleId: HR,
      orgUnitId: PRJ_X,
    }),
  ),
);

section("The hierarchy is changed inside the branch, and one's own unit from above");
const child = await prjAdmin.mutate("organization.create", {
  parentId: PRJ_X,
  unitType: "site",
  name: `E2E scoped site ${RUN}`,
  code: `E2E-SA-${RUN}`.toUpperCase(),
});
check("the project Administrator adds a site under their project", ok(child), child.error);
check(
  "renames it",
  ok(
    await prjAdmin.mutate("organization.update", {
      id: child.data?.id,
      name: `E2E scoped site ${RUN} (renamed)`,
      code: `E2E-SA-${RUN}`.toUpperCase(),
    }),
  ),
);
check(
  "cannot rename their own project",
  (await prjAdmin.mutate("organization.update", { id: PRJ_X, name: "x", code: "PRJ-X" })).status ===
    403,
);
check(
  "cannot deactivate a sibling project",
  (await prjAdmin.mutate("organization.setStatus", { id: PRJ_Z, status: "inactive" })).status ===
    403,
);
check(
  "cannot add a unit under the subsidiary",
  (
    await prjAdmin.mutate("organization.create", {
      parentId: SUB_A,
      unitType: "project",
      name: "x",
      code: "",
    })
  ).status === 403,
);
check(
  "and deletes the unused site again",
  ok(await prjAdmin.mutate("organization.delete", { id: child.data?.id })),
);

section("An administrator uploads any activity; someone else approves it");
// Diesel belongs to the Project Manager role, which this Administrator does not hold.
const bytes = sample("diesel", { reference: `SA-${RUN}-1`.toUpperCase() });
const filed = await upload(prjAdmin, bytes, `scoped-admin-${RUN}.pdf`);
check(
  "the project Administrator files a diesel invoice for their project",
  ok(filed.completed) && !!filed.documentId,
  filed.completed?.error ?? filed.prepared?.error,
);
check(
  "but not for a sibling project",
  !ok(
    (await upload(prjAdmin, bytes, `scoped-admin-z-${RUN}.pdf`, { orgCode: "E2E-PRJ-Z" })).prepared,
  ),
);
await runWorker();
const verified = await confirm(prjAdmin, filed.documentId, { overrides: { quantity: "410" } });
check("and verifies what OCR read", ok(verified), verified.error);
async function awaitingApproval(documentId) {
  let record = await recordOf(documentId);
  if (record.validation_status === "flagged") {
    await admin.mutate("validation.review", {
      recordId: record.id,
      decision: "accept",
      reason: `Checked against the invoice (tests/e2e ${RUN}).`,
    });
    record = await recordOf(documentId);
  }
  return record;
}
const record = await awaitingApproval(filed.documentId);
check("the record waits for approval", record.approval_status === "review_pending");
check(
  "the Administrator cannot approve their own upload",
  (await prjAdmin.mutate("approvals.decide", { recordId: record.id, decision: "approve" }))
    .status === 403,
);
check(
  "the Administrator above them approves it",
  ok(await subAdmin.mutate("approvals.decide", { recordId: record.id, decision: "approve" })),
);

section("A Super Admin may approve their own upload, and it is marked");
const superBytes = sample("diesel", { reference: `SA-${RUN}-2`.toUpperCase() });
const superFiled = await upload(admin, superBytes, `super-admin-${RUN}.pdf`);
check(
  "the Super Admin files a diesel invoice",
  ok(superFiled.completed) && !!superFiled.documentId,
  superFiled.completed?.error ?? superFiled.prepared?.error,
);
await runWorker();
const superVerified = await confirm(admin, superFiled.documentId, {
  overrides: { quantity: "420" },
});
check("and verifies it", ok(superVerified), superVerified.error);
const superRecord = await awaitingApproval(superFiled.documentId);
const queued = (await admin.query("approvals.queue")).data?.find(
  (r) => r.recordId === superRecord.id,
);
check(
  "the approval queue tells them it is their own record",
  queued?.selfApproval === true && queued?.ownRecord === false,
  JSON.stringify(queued && [queued.selfApproval, queued.ownRecord]),
);
check(
  "they approve it",
  ok(await admin.mutate("approvals.decide", { recordId: superRecord.id, decision: "approve" })),
);
const mark = await one(sql`
  select reason, new_value from public.audit_logs
  where event_type = 'approval.approved' and entity_id = ${superRecord.id}`);
check(
  "the audit trail says the same person submitted and approved",
  mark?.new_value?.same_person_as_submitter_or_verifier === true && /same person/.test(mark.reason),
  JSON.stringify(mark),
);

section("At most two Super Admins");
// The limit is lowered to the number who hold the role now, so the next grant is one too many whatever
// this database already holds; it is put back afterwards.
const [{ holders }] = await sql`
  select count(distinct uoa.user_id)::int as holders
  from public.user_org_assignments uoa
  join public.roles r on r.id = uoa.role_id and r.code = 'admin'
  join public.users u on u.id = uoa.user_id
  where uoa.revoked_at is null and u.is_active and u.deleted_at is null`;
const [{ value: limitBefore }] = await sql`
  select value from public.org_settings where key = 'super_admin_limit'`;
await sql`update public.org_settings set value = ${sql.json(holders)} where key = 'super_admin_limit'`;
try {
  const tooMany = await admin.mutate("users.addAssignment", {
    userId: subAdminId,
    roleId: ADMIN_ROLE,
    orgUnitId: MEIL,
  });
  check(
    "the database refuses one more, in words",
    tooMany.status === 400 && /At most \d+ Super Admins/.test(tooMany.error ?? ""),
    JSON.stringify([tooMany.status, tooMany.error]),
  );
  // Two requests at the same moment for the last place: at most one may get it.
  await sql`update public.org_settings set value = ${sql.json(holders + 1)} where key = 'super_admin_limit'`;
  const race = await Promise.all(
    [subAdminId, prjAdminId].map((id) =>
      admin.mutate("users.addAssignment", { userId: id, roleId: ADMIN_ROLE, orgUnitId: MEIL }),
    ),
  );
  check(
    "two grants at once for one place: exactly one goes through",
    race.filter(ok).length === 1,
    JSON.stringify(race.map((r) => r.status)),
  );
} finally {
  await sql`
    update public.user_org_assignments uoa set revoked_at = now()
    from public.roles r
    where r.id = uoa.role_id and r.code = 'admin' and uoa.revoked_at is null
      and uoa.user_id in (${subAdminId}, ${prjAdminId})`;
  await sql`update public.org_settings set value = ${sql.json(limitBefore)} where key = 'super_admin_limit'`;
}
check(
  "the limit is back where it was",
  (await one(sql`select value from public.org_settings where key = 'super_admin_limit'`)).value ===
    limitBefore,
);

await finish();
