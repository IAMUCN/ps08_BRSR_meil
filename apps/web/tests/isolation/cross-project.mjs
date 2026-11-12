// Cross-project access check through the app's real tRPC procedures (DATABASE_AUDIT_2026-10-12.md).
// Someone scoped to Project X calls every id-taking procedure with ids that belong to a sibling project
// ("IDOR Project Q"): once as a Project Manager, once holding every scoped permission a custom role could be
// given, and once as the Administrator of Project X (migration 0050), who manages people and the hierarchy —
// but only there. Each call must be refused or return nothing of Project Q, and Project Q must be unchanged
// at the end.
//
// Local database only (the address is fixed below); needs `npx supabase db start` and the seed data.
// Fixtures are committed for the run and removed afterwards. Procedures that read through the signed-in
// user's own RLS client (verification, record evidence, the file routes) cannot run outside a request and
// are covered by supabase/tests/database/audit_3_data_isolation.test.sql instead.
// Run: pnpm --filter web test:isolation
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
process.env.DATABASE_URL = LOCAL;
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "placeholder-not-a-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-not-a-key";
process.env.SUPABASE_STORAGE_BUCKET_EVIDENCE = "evidence";
process.env.SUPABASE_STORAGE_BUCKET_REPORTS = "reports";

const WEB = fileURLToPath(new URL("../../", import.meta.url)).replaceAll("\\", "/");
const require = createRequire(WEB + "package.json");
const postgres = require("postgres");
const sql = postgres(LOCAL, { prepare: false, max: 2, onnotice() {} });

const { appRouter } = await import(pathToFileURL(WEB + "lib/trpc/root.ts").href);
const { createCallerFactory } = await import(pathToFileURL(WEB + "lib/trpc/init.ts").href);
const callerFor = (session) =>
  createCallerFactory(appRouter)({ session: { status: "active", session } });

const ID = (n) => `1d0e1d0e-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = ID(1),
  B = ID(2),
  C = ID(3),
  QUNIT = ID(10),
  QDOC = ID(20),
  QREC = ID(30),
  QRUN = ID(40),
  QNOTE = ID(50),
  QBATCH = ID(60),
  QCHAT = ID(70),
  QBUNDLE = ID(80);
const MARKERS = [
  QUNIT,
  QDOC,
  QREC,
  QRUN,
  QBATCH,
  "IDOR Project Q",
  "idor-secret",
  "idor.b@traceesg.test",
  "idor.c@traceesg.test",
  "IDOR User B",
  "IDOR private",
];
const started = new Date();

async function cleanup() {
  await sql`delete from public.rate_limit_events where created_at >= ${started}`;
  await sql`delete from public.chat_conversations where id = ${QCHAT}`;
  await sql`delete from public.carbon_credits where id = ${QBATCH}`;
  await sql`delete from public.notifications where id = ${QNOTE}`;
  await sql`delete from public.report_runs where id = ${QRUN}`;
  await sql`delete from public.ocr_jobs where document_id in (${QDOC}, ${QBUNDLE})`;
  await sql`delete from public.esg_record_documents where esg_record_id = ${QREC}`;
  await sql`delete from public.esg_records where id = ${QREC}`;
  await sql`delete from public.documents where id in (${QDOC}, ${QBUNDLE})`;
  await sql`delete from public.user_org_assignments where user_id in (${A}, ${B}, ${C})`;
  await sql`delete from public.users where id in (${A}, ${B}, ${C})`;
  await sql`delete from auth.users where id in (${A}, ${B}, ${C})`;
  await sql`delete from public.org_units where id = ${QUNIT}`;
}

let pass = 0,
  fail = 0,
  skipped = 0;
const lines = [];
const note = (status, name, detail) => {
  if (status === "PASS") pass++;
  else if (status === "FAIL") fail++;
  else skipped++;
  lines.push(`${status}  ${name}  — ${detail}`);
};

/** Expect the call to be refused, or to return nothing that belongs to Project Q. */
async function probe(name, call) {
  try {
    const result = await call();
    const text = JSON.stringify(result ?? null);
    const leaked = MARKERS.filter((m) => text.includes(m));
    if (leaked.length) note("FAIL", name, `returned Project Q data: ${leaked.join(", ")}`);
    else note("PASS", name, `returned nothing of Project Q (${text.length} bytes)`);
  } catch (error) {
    if (
      error?.name === "TRPCError" &&
      ["FORBIDDEN", "NOT_FOUND", "BAD_REQUEST", "UNAUTHORIZED"].includes(error.code)
    ) {
      note("PASS", name, `refused: ${error.code}`);
    } else if (String(error?.message).startsWith("LEAK")) {
      note("FAIL", name, error.message);
    } else {
      note(
        "SKIP",
        name,
        `could not run outside the app: ${String(error?.message ?? error).slice(0, 90)}`,
      );
    }
  }
}

try {
  await cleanup();
  const [sub] = await sql`select id from public.org_units where code = 'SUB-A'`;
  const [prjX] = await sql`select id, name, unit_type from public.org_units where code = 'PRJ-X'`;
  const [period] = await sql`select id from public.reporting_periods where status = 'open' limit 1`;
  const [metric] =
    await sql`select id, scope_id from public.esg_metrics where code = 'DIESEL_CONSUMPTION'`;
  const [pmRole] = await sql`select id from public.roles where code = 'project_manager'`;
  const [adminRole] = await sql`select id from public.roles where code = 'org_admin'`;
  const [esgRole] = await sql`select id from public.roles where code = 'corporate_esg'`;
  if (!sub || !prjX || !period || !metric || !adminRole || !esgRole)
    throw new Error("local seed data missing");
  const [{ n: levelsBefore }] = await sql`select count(*)::int as n from public.org_levels`;

  await sql`insert into public.org_units (id, parent_id, unit_type, name, code) values (${QUNIT}, ${sub.id}, 'project', 'IDOR Project Q', 'IDOR-Q')`;
  for (const [id, mail, name] of [
    [A, "idor.a@traceesg.test", "IDOR User A"],
    [B, "idor.b@traceesg.test", "IDOR User B"],
    [C, "idor.c@traceesg.test", "IDOR User C"],
  ]) {
    await sql`insert into auth.users (id, email, aud, role) values (${id}, ${mail}, 'authenticated', 'authenticated')`;
    await sql`insert into public.users (id, display_name, email) values (${id}, ${name}, ${mail})`;
  }
  await sql`insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by) values
    (${A}, ${prjX.id}, ${pmRole.id}, ${A}), (${B}, ${QUNIT}, ${pmRole.id}, ${B}),
    (${A}, ${prjX.id}, ${adminRole.id}, ${A}),
    (${C}, ${prjX.id}, ${esgRole.id}, ${C}), (${C}, ${QUNIT}, ${pmRole.id}, ${C})`;
  const [bAssignment] = await sql`
    select id from public.user_org_assignments where user_id = ${B} and org_unit_id = ${QUNIT}`;
  for (const [id, file] of [
    [QDOC, "idor-secret.pdf"],
    [QBUNDLE, "idor-secret-bundle.pdf"],
  ]) {
    await sql`insert into public.documents (id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type, file_size_bytes, file_hash, uploaded_by)
      values (${id}, ${QUNIT}, ${period.id}, ${"idor/" + file}, ${file}, 'application/pdf', 1, ${"idor-hash-" + id}, ${B})`;
    await sql`insert into public.ocr_jobs (document_id, status) values (${id}, 'completed')`;
  }
  await sql`insert into public.esg_records (id, org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by,
      verified_by, activity_value_verified, activity_unit, verification_status, validation_status, approval_status, data_quality_state)
    values (${QREC}, ${QUNIT}, ${period.id}, ${metric.id}, ${metric.scope_id}, ${B}, ${B}, 4242, 'L',
      'user_verified', 'flagged', 'review_pending', 'verified')`;
  await sql`insert into public.esg_record_documents (esg_record_id, document_id, added_by) values (${QREC}, ${QDOC}, ${B})`;
  await sql`insert into public.report_runs (id, requested_by, org_unit_id, report_type, financial_year, status, storage_path, completed_at)
    values (${QRUN}, ${B}, ${QUNIT}, 'brsr', 2026, 'completed', 'idor/idor-secret-report.pdf', now())`;
  await sql`insert into public.notifications (id, user_id, type, title, message, deep_link_path)
    values (${QNOTE}, ${B}, 'verification_needed', 'IDOR private', 'IDOR private', '/app')`;
  await sql`insert into public.carbon_credits (id, org_unit_id, project_name, registry, registry_project_id, serial_number_start,
      serial_number_end, quantity_tco2e, vintage_year, methodology_code, issuance_date, verifier_name)
    values (${QBATCH}, ${QUNIT}, 'idor-secret batch', 'VERRA_VCS', 'IDOR', 'S1', 'S9', 10, 2024, 'M1', '2025-01-01', 'idor verifier')`;
  await sql`insert into public.chat_conversations (id, user_id, title) values (${QCHAT}, ${B}, 'IDOR private')`;

  const pmPermissions = (
    await sql`
    select p.code from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
    where rp.role_id = ${pmRole.id}`
  ).map((r) => r.code);
  const base = {
    userId: A,
    email: "idor.a@traceesg.test",
    displayName: "IDOR User A",
    theme: "theme-2",
    isAdmin: false,
    isOrgAdmin: false,
    adminOrgUnitIds: [],
    roleCodes: ["project_manager"],
    assignments: [
      {
        orgUnitId: prjX.id,
        orgUnitName: prjX.name,
        orgUnitType: prjX.unit_type,
        roleCode: "project_manager",
        roleName: "Project Manager",
      },
    ],
  };
  const personas = {
    "Project Manager (seeded permissions)": { ...base, permissions: pmPermissions },
    // The hard case: every scoped permission a custom role could be given, still assigned to Project X only.
    "Custom role with every scoped permission": {
      ...base,
      permissions: [
        "document.upload",
        "record.verify",
        "approval.decide",
        "monitoring.view",
        "validation.review",
        "report.generate",
        "carbon_credit.view",
        "carbon_credit.manage",
        "icp.manage",
        "chat.use",
        "user.bulk_import",
        "org.bulk_import",
        // Held without an administrator role: the permission alone must open nothing outside Project X.
        "user.manage",
        "org.manage",
      ],
    },
    // The person who really does manage people and units — inside Project X only.
    "Administrator of Project X": {
      ...base,
      isOrgAdmin: true,
      adminOrgUnitIds: [prjX.id],
      roleCodes: ["project_manager", "org_admin"],
      assignments: [
        ...base.assignments,
        { ...base.assignments[0], roleCode: "org_admin", roleName: "Administrator" },
      ],
      permissions: (
        await sql`
        select p.code from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
        where rp.role_id = ${adminRole.id}`
      ).map((r) => r.code),
    },
  };

  for (const [label, session] of Object.entries(personas)) {
    lines.push(`\n### ${label}`);
    const c = callerFor(session);
    const p = (name, call) => probe(name, call);

    await p("scope.recordTrace(record of Q)", () => c.scope.recordTrace({ recordId: QREC }));
    await p("scope.myTotal(org unit Q)", () =>
      c.scope.myTotal({ scopeCode: "SCOPE_1", orgUnitId: QUNIT }),
    );
    await p("scope.getTotal(org unit Q)", () =>
      c.scope.getTotal({ scopeCode: "SCOPE_1", orgUnitId: QUNIT }),
    );
    await p("consolidation.query(org unit Q)", () => c.consolidation.query({ orgUnitId: QUNIT }));
    await p("consolidation.query(parent SUB-A)", () =>
      c.consolidation.query({ orgUnitId: sub.id }),
    );
    await p("forecast.options()", () => c.forecast.options());
    await p("forecast.getForecast(org unit Q)", () => c.forecast.getForecast({ orgUnitId: QUNIT }));
    await p("simulator.options()", () => c.simulator.options());
    await p("simulator.baseline(org unit Q)", () =>
      c.simulator.baseline({ orgUnitId: QUNIT, periodId: period.id }),
    );
    await p("records.summary(org unit Q)", () =>
      c.records.summary({ orgUnitId: QUNIT, periodId: period.id }),
    );
    await p("records.kpiTrends(org unit Q)", () => c.records.kpiTrends({ orgUnitId: QUNIT }));
    await p("records.search()", () => c.records.search({}));
    await p("records.detail(record of Q)", () => c.records.detail({ recordId: QREC }));
    await p("reports.list()", () => c.reports.list());
    await p("reports.get(report of Q)", () => c.reports.get({ id: QRUN }));
    await p("reports.reportedRecord(record of Q)", async () => {
      const r = await c.reports.reportedRecord({ recordId: QREC, calculationId: null });
      if (r.available) throw new Error("LEAK: record reported as available");
      return r;
    });
    await p("reports.bundlePreview(org unit Q)", () =>
      c.reports.bundlePreview({ orgUnitId: QUNIT, financialYear: 2026 }),
    );
    await p("reports.generate(org unit Q)", () =>
      c.reports.generate({ orgUnitId: QUNIT, periodId: period.id }),
    );
    await p("reports.evidence(FY)", () => c.reports.evidence({ financialYear: 2026 }));
    await p("approvals.queue()", () => c.approvals.queue());
    await p("approvals.decide(record of Q)", () =>
      c.approvals.decide({ recordId: QREC, decision: "approve" }),
    );
    await p("validation.queue()", () => c.validation.queue());
    await p("validation.review(record of Q)", () =>
      c.validation.review({ recordId: QREC, decision: "accept", reason: "cross-project attempt" }),
    );
    await p("documents.prepareUpload(into org unit Q)", () =>
      c.documents.prepareUpload({
        orgUnitId: QUNIT,
        metricId: metric.id,
        mimeType: "application/pdf",
        fileSize: 10,
        sha256: "a".repeat(64),
      }),
    );
    await p("documents.uploadOptions()", () => c.documents.uploadOptions());
    await p("bundles.pending()", () => c.bundles.pending());
    await p("bundles.review(PDF of Q)", () => c.bundles.review({ documentId: QBUNDLE }));
    await p("bundles.discard(PDF of Q)", () => c.bundles.discard({ documentId: QBUNDLE }));
    await p("ocr.submissions()", () => c.ocr.submissions({}));
    await p("dashboard.tiles()", () => c.dashboard.tiles());
    await p("dashboard.tiles(org unit Q)", () => c.dashboard.tiles({ orgUnitId: QUNIT }));
    await p("ocr.jobs()", () => c.ocr.jobs({}));
    await p("notifications.list()", () => c.notifications.list({}));
    await p("notifications.markRead(B's notification)", async () => {
      await c.notifications.markRead({ id: QNOTE });
      const [n] = await sql`select is_read from public.notifications where id = ${QNOTE}`;
      if (n.is_read) throw new Error("LEAK: another user's notification was changed");
      return null;
    });
    await p("chat.conversation(B's conversation)", () => c.chat.conversation({ id: QCHAT }));
    await p("chat.delete(B's conversation)", () => c.chat.delete({ id: QCHAT }));
    await p("audit.query()", () => c.audit.query({}));
    await p("deadlines.list()", () => c.deadlines.list());
    await p("carbonCredits.options()", () => c.carbonCredits.options());
    await p("carbonCredits.list()", () => c.carbonCredits.list());
    await p("carbonCredits.list(org unit Q)", () => c.carbonCredits.list({ orgUnitId: QUNIT }));
    await p("carbonCredits.summary(org unit Q)", async () => {
      const s = await c.carbonCredits.summary({ orgUnitId: QUNIT });
      if (s.totalMintedTco2e !== 0) throw new Error("LEAK: Q's batch counted in the summary");
      return s;
    });
    await p("carbonCredits.reconciliation(org unit Q)", () =>
      c.carbonCredits.reconciliation({ orgUnitId: QUNIT }),
    );
    await p("carbonCredits.icpList(org unit Q)", () =>
      c.carbonCredits.icpList({ orgUnitId: QUNIT }),
    );
    await p("carbonCredits.mint(into org unit Q)", () =>
      c.carbonCredits.mint({
        orgUnitId: QUNIT,
        projectName: "attempt",
        registry: "VERRA_VCS",
        registryProjectId: "X1",
        serialNumberStart: "AAA",
        serialNumberEnd: "BBB",
        quantityTco2e: 1,
        vintageYear: 2024,
        methodologyCode: "M1",
        issuanceDate: "2025-01-01",
        verifierName: "nobody",
      }),
    );
    await p("carbonCredits.retire(batch of Q)", () =>
      c.carbonCredits.retire({
        creditId: QBATCH,
        quantityTco2e: 1,
        reportingPeriodId: period.id,
        beneficiaryOrgUnitId: prjX.id,
        targetScope: "SCOPE_1",
        retirementReason: "cross-project attempt",
      }),
    );
    await p("carbonCredits.transfer(batch of Q)", () =>
      c.carbonCredits.transfer({
        creditId: QBATCH,
        quantityTco2e: 1,
        counterpartyName: "attempt",
        counterpartyRegistryAccount: "ACC-1",
      }),
    );
    await p("carbonCredits.icpCreate(org unit Q)", () =>
      c.carbonCredits.icpCreate({
        orgUnitId: QUNIT,
        effectiveFrom: "2026-04-01",
        shadowPricePerTco2e: 1,
        sourceRational: "cross-project attempt",
      }),
    );
    await p("carbonCredits.evaluateCapex(org unit Q)", () =>
      c.carbonCredits.evaluateCapex({
        orgUnitId: QUNIT,
        projectName: "attempt",
        baselineAnnualEmissionsTco2e: 10,
        projectedAnnualEmissionsTco2e: 5,
        capexAmount: 100,
        operationalAnnualSavings: 1,
        projectLifespanYears: 5,
      }),
    );
    await p("users.list()", () => c.users.list());
    await p("users.bulkImportOptions()", () => c.users.bulkImportOptions());
    await p("users.bulkImport(a row into org unit Q)", async () => {
      const r = await c.users.bulkImport({
        rows: [
          {
            employeeId: "IDOR-E1",
            displayName: "Idor Attempt",
            email: "idor.attempt@traceesg.test",
            roleCode: "hr",
            orgUnitCode: "IDOR-Q",
          },
        ],
      });
      if (r.results.some((row) => row.ok))
        throw new Error("LEAK: an account was created in Project Q");
      return r.results.map((row) => row.error);
    });
    await p("organization.tree()", () => c.organization.tree());
    await p("organization.bulkImportOptions()", () => c.organization.bulkImportOptions());
    await p("organization.setStatus(org unit Q)", () =>
      c.organization.setStatus({ id: QUNIT, status: "inactive" }),
    );

    // --- The /admin area (migration 0050): figures, people and the hierarchy of a sibling project -------
    await p("records.search(org unit Q)", () => c.records.search({ orgUnitId: QUNIT }));
    await p("records.search(everything, by text)", () => c.records.search({ text: "IDOR" }));
    await p("records.missing(org unit Q)", () => c.records.missing({ orgUnitId: QUNIT }));
    await p("records.detail(record of Q)", () => c.records.detail({ recordId: QREC }));
    await p("records.remindMissing(org unit Q)", () =>
      c.records.remindMissing({ orgUnitId: QUNIT }),
    );
    await p("records.summary(org unit Q)", () => c.records.summary({ orgUnitId: QUNIT }));
    await p("scope.getTotal(org unit Q)", () =>
      c.scope.getTotal({ scopeCode: "SCOPE_1", orgUnitId: QUNIT }),
    );
    await p("scope.getTotal(no org unit named)", () => c.scope.getTotal({ scopeCode: "SCOPE_1" }));
    await p("reports.evidence(the year)", () => c.reports.evidence({ financialYear: 2026 }));
    await p("reports.options()", () => c.reports.options());
    await p("reports.inputs(group-wide configuration)", async () => {
      await c.reports.inputs({ financialYear: 2026 });
      throw new Error("LEAK: the yearly report inputs were readable");
    });

    await p("users.options()", async () => {
      const { roles } = await c.users.options();
      if (roles.some((r) => r.code === "admin"))
        throw new Error("LEAK: the Super Admin role is offered");
      return roles.length;
    });
    await p("users.addAssignment(self, a role at org unit Q)", () =>
      c.users.addAssignment({ userId: A, roleId: pmRole.id, orgUnitId: QUNIT }),
    );
    await p("users.addAssignment(user B of Q, a role at Project X)", () =>
      c.users.addAssignment({ userId: B, roleId: pmRole.id, orgUnitId: prjX.id }),
    );
    await p("users.addAssignment(user B, Administrator at Q)", () =>
      c.users.addAssignment({ userId: B, roleId: adminRole.id, orgUnitId: QUNIT }),
    );
    await p("users.revokeAssignment(user B's role at Q)", () =>
      c.users.revokeAssignment({ assignmentId: bAssignment.id }),
    );
    await p("users.deactivate(user B)", () => c.users.deactivate({ userId: B }));
    await p("users.delete(user B)", () => c.users.delete({ userId: B }));
    await p("users.resendInvite(user B)", () => c.users.resendInvite({ userId: B }));
    await p("users.invite(someone into org unit Q)", () =>
      c.users.invite({
        email: "idor.attempt@traceesg.test",
        displayName: "Idor Attempt",
        roleId: pmRole.id,
        orgUnitId: QUNIT,
      }),
    );

    await p("organization.create(a unit under Q)", () =>
      c.organization.create({ parentId: QUNIT, unitType: "site", name: "IDOR child", code: "" }),
    );
    await p("organization.create(under Project X, also under Q)", () =>
      c.organization.create({
        parentId: prjX.id,
        alsoUnder: [QUNIT],
        unitType: "site",
        name: "IDOR child",
        code: "",
      }),
    );
    await p("organization.update(org unit Q)", () =>
      c.organization.update({ id: QUNIT, name: "IDOR renamed", code: "" }),
    );
    await p("organization.move(org unit Q under Project X's parent)", () =>
      c.organization.move({ id: QUNIT, newParentId: prjX.id }),
    );
    await p("organization.addParent(org unit Q, Project X)", () =>
      c.organization.addParent({ id: QUNIT, parentId: prjX.id }),
    );
    await p("organization.setParents(org unit Q)", () =>
      c.organization.setParents({ id: QUNIT, alsoUnder: [prjX.id] }),
    );
    await p("organization.delete(org unit Q)", () => c.organization.delete({ id: QUNIT }));
    await p("organization.deleteCheck(org unit Q)", () =>
      c.organization.deleteCheck({ id: QUNIT }),
    );
    await p("organization.impact(org unit Q)", () => c.organization.impact({ id: QUNIT }));
    await p("organization.expectations(org unit Q)", () =>
      c.organization.expectations({ orgUnitId: QUNIT }),
    );
    await p("organization.setExpectation(org unit Q)", () =>
      c.organization.setExpectation({ orgUnitId: QUNIT, metricId: metric.id, expected: true }),
    );
    // Its own unit is changed from above, never by its own Administrator.
    await p("organization.update(own unit, Project X)", async () => {
      await c.organization.update({ id: prjX.id, name: "IDOR renamed X", code: "PRJ-X" });
      throw new Error("LEAK: an Administrator renamed their own unit");
    });
    await p("organization.setStatus(own unit, Project X)", async () => {
      await c.organization.setStatus({ id: prjX.id, status: "inactive" });
      throw new Error("LEAK: an Administrator deactivated their own unit");
    });
    await p("organization.addLevel(group-wide configuration)", async () => {
      await c.organization.addLevel({ label: "Idor Level", afterCode: "project" });
      throw new Error("LEAK: a hierarchy level was added");
    });
  }

  // What the Administrator of Project X is given: their own unit, inside their scope, and nothing wider.
  {
    const c = callerFor(personas["Administrator of Project X"]);
    const tree = await c.organization.tree();
    const own = tree.find((n) => n.id === prjX.id);
    note(
      own && own.ownable && !own.manageable && own.inScope ? "PASS" : "FAIL",
      "Administrator: the tree shows their own unit as theirs to add under, not to change",
      JSON.stringify(own && { ownable: own.ownable, manageable: own.manageable }),
    );
    const above = tree.filter((n) => !n.inScope);
    note(
      above.length > 0 &&
        above.every((n) => !n.ownable && !n.manageable && n.activeAssignments === 0)
        ? "PASS"
        : "FAIL",
      "Administrator: units above are listed by name only",
      `${above.length} unit(s) above`,
    );
    const search = await c.records.search({});
    note(
      search.context.orgUnitId === prjX.id && search.context.orgUnits.every((o) => o.id !== QUNIT)
        ? "PASS"
        : "FAIL",
      "Administrator: the Data Explorer opens on their own unit and offers no other branch",
      `${search.context.orgUnits.length} unit(s) offered`,
    );
    const expectations = await c.organization.expectations({ orgUnitId: prjX.id });
    note(
      expectations.length > 0 ? "PASS" : "FAIL",
      "Administrator: reads the expected submissions of their own unit",
      `${expectations.length} activities`,
    );
  }

  // Corporate ESG at Project X who is also a Project Manager at Project Q (role-wise dashboard, Phase 0).
  // Q is among this person's assignments, but the role that holds monitoring.view and report.generate is held
  // at Project X only: the read-only monitoring pages and Reports must stop at Project X, and the actions on
  // those pages stay refused even there. Not part of the loop above, which assumes no tie to Q at all.
  {
    const permissionsOf = async (roleId) =>
      (
        await sql`
        select p.code from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
        where rp.role_id = ${roleId}`
      ).map((r) => r.code);
    const session = {
      ...base,
      userId: C,
      email: "idor.c@traceesg.test",
      displayName: "IDOR User C",
      roleCodes: ["corporate_esg", "project_manager"],
      assignments: [
        { ...base.assignments[0], roleCode: "corporate_esg", roleName: "Corporate ESG" },
        {
          orgUnitId: QUNIT,
          orgUnitName: "IDOR Project Q",
          orgUnitType: "project",
          roleCode: "project_manager",
          roleName: "Project Manager",
        },
      ],
      permissions: [
        ...new Set([...(await permissionsOf(esgRole.id)), ...(await permissionsOf(pmRole.id))]),
      ].sort(),
    };
    const c = callerFor(session);
    lines.push("\n### Corporate ESG at Project X, Project Manager at Project Q");
    const expectRefused = async (name, call) => {
      try {
        await call();
        note("FAIL", name, "was allowed");
      } catch (error) {
        if (error?.name === "TRPCError" && ["FORBIDDEN", "NOT_FOUND"].includes(error.code))
          note("PASS", name, `refused: ${error.code}`);
        else note("FAIL", name, `unexpected error: ${String(error?.message).slice(0, 90)}`);
      }
    };
    // Where they hold the permission: refused for Q although Q is one of their assignments.
    await probe("records.detail(record of Q)", () => c.records.detail({ recordId: QREC }));
    await probe("records.search(org unit Q)", () => c.records.search({ orgUnitId: QUNIT }));
    await probe("records.missing(org unit Q)", () => c.records.missing({ orgUnitId: QUNIT }));
    await probe("records.summary(org unit Q)", () => c.records.summary({ orgUnitId: QUNIT }));
    await probe("records.kpiTrends(org unit Q)", () => c.records.kpiTrends({ orgUnitId: QUNIT }));
    await probe("scope.getTotal(org unit Q)", () =>
      c.scope.getTotal({ scopeCode: "SCOPE_1", orgUnitId: QUNIT }),
    );
    await probe("analytics.overview(org unit Q)", () => c.analytics.overview({ orgUnitId: QUNIT }));
    await probe("analytics.alerts(org unit Q)", () => c.analytics.alerts({ orgUnitId: QUNIT }));
    await probe("reports.get(report of Q)", () => c.reports.get({ id: QRUN }));
    await probe("reports.generate(org unit Q)", () =>
      c.reports.generate({ orgUnitId: QUNIT, periodId: period.id }),
    );
    await probe("reports.bundlePreview(org unit Q)", () =>
      c.reports.bundlePreview({ orgUnitId: QUNIT, financialYear: 2026 }),
    );
    // Where they do hold it: Project X works.
    const own = await c.records.summary({ orgUnitId: prjX.id, periodId: period.id });
    note(
      own.context.orgUnitId === prjX.id && own.context.orgUnits.every((o) => o.id !== QUNIT)
        ? "PASS"
        : "FAIL",
      "records.summary(own project) opens, and the picker offers no unit of Q",
      `${own.context.orgUnits.length} unit(s) offered`,
    );
    const totals = await c.scope.getTotal({ scopeCode: "SCOPE_1", orgUnitId: prjX.id });
    note(
      totals !== null && totals.node.id === prjX.id ? "PASS" : "FAIL",
      "scope.getTotal(own project) opens",
      totals ? totals.node.name : "null",
    );
    const units = await c.analytics.units();
    note(
      units.some((u) => u.id === prjX.id) && !units.some((u) => u.id === QUNIT) ? "PASS" : "FAIL",
      "analytics.units() lists Project X and not Project Q",
      `${units.length} unit(s)`,
    );
    const tiles = await c.dashboard.tiles();
    const all = tiles.band.concat(tiles.grid);
    // Role tiles (the Project Manager's own work) rightly cover Project Q, where that role is assigned; every
    // tile that depends on a permission must not.
    const ROLE_TILES = ["my-area", "my-missing", "unit-emissions", "certificates"];
    const named = JSON.stringify(all.filter((t) => !ROLE_TILES.includes(t.id)));
    note(
      all.some((t) => ROLE_TILES.includes(t.id)) ? "PASS" : "FAIL",
      "dashboard.tiles() offers the Project Manager's own-work tiles, from the role assigned at Project Q",
      "",
    );
    note(
      !named.includes("IDOR Project Q") && !named.includes(QUNIT) ? "PASS" : "FAIL",
      "dashboard.tiles() never covers Project Q through a permission tile, where the role holding the permissions is not assigned",
      `${tiles.band.length + tiles.grid.length} tile(s)`,
    );
    note(
      tiles.band.concat(tiles.grid).some((t) => t.id === "approval-queue") ? "PASS" : "FAIL",
      "dashboard.tiles() offers the approval tile, from the Corporate ESG role at Project X",
      "",
    );
    // Read only: the actions on those pages stay an administrator's, even inside Project X.
    await expectRefused("records.remindMissing(own project)", () =>
      c.records.remindMissing({ orgUnitId: prjX.id, periodId: period.id }),
    );
    await expectRefused("analytics.alertSettings()", () => c.analytics.alertSettings());
    await expectRefused("analytics.acknowledge(any alert)", () =>
      c.analytics.acknowledge({ id: ID(99), note: "attempt" }),
    );
    const detail = await c.records.detail({ recordId: QREC }).catch(() => null);
    note(detail === null ? "PASS" : "FAIL", "records.detail(record of Q) returns nothing", "");
  }

  // Nothing may have changed in Project Q.
  const [state] = await sql`
    select (select approval_status::text || '/' || validation_status::text from public.esg_records where id = ${QREC}) as record,
           (select status::text from public.org_units where id = ${QUNIT}) as unit,
           (select count(*)::int from public.carbon_credit_transactions where credit_id = ${QBATCH}) as tx,
           (select count(*)::int from public.carbon_credits where org_unit_id = ${QUNIT}) as batches,
           (select count(*)::int from public.internal_carbon_prices where org_unit_id = ${QUNIT}) as prices,
           (select count(*)::int from public.chat_conversations where id = ${QCHAT}) as chat,
           (select count(*)::int from public.documents where id = ${QBUNDLE} and deleted_at is null) as bundle,
           (select count(*)::int from public.report_runs where org_unit_id = ${QUNIT}) as runs,
           (select count(*)::int from public.users where email = 'idor.attempt@traceesg.test') as created,
           (select name from public.org_units where id = ${QUNIT}) as unit_name,
           (select parent_id::text from public.org_units where id = ${QUNIT}) as unit_parent,
           (select count(*)::int from public.org_units where parent_id = ${QUNIT}) as children,
           (select count(*)::int from public.org_unit_parents
             where org_unit_id = ${QUNIT} or parent_id = ${QUNIT}) as shared,
           (select count(*)::int from public.submission_expectations where org_unit_id = ${QUNIT}) as expected,
           (select count(*)::int from public.user_org_assignments
             where org_unit_id = ${QUNIT} and revoked_at is null) as people,
           (select count(*)::int from public.user_org_assignments
             where user_id = ${B} and revoked_at is null) as b_roles,
           (select is_active from public.users where id = ${B}) as b_active,
           (select name from public.org_units where id = ${prjX.id}) as x_name,
           (select status::text from public.org_units where id = ${prjX.id}) as x_status,
           (select count(*)::int from public.org_levels) as levels`;
  const untouched =
    state.record === "review_pending/flagged" &&
    state.unit === "active" &&
    state.tx === 0 &&
    state.batches === 1 &&
    state.prices === 0 &&
    state.chat === 1 &&
    state.bundle === 1 &&
    state.runs === 1 &&
    state.created === 0 &&
    state.unit_name === "IDOR Project Q" &&
    state.unit_parent === sub.id &&
    state.children === 0 &&
    state.shared === 0 &&
    state.expected === 0 &&
    state.people === 1 &&
    state.b_roles === 1 &&
    state.b_active === true &&
    state.x_name === prjX.name &&
    state.x_status === "active" &&
    state.levels === levelsBefore;
  note(untouched ? "PASS" : "FAIL", "Project Q after all attempts", JSON.stringify(state));
} catch (error) {
  fail++;
  lines.push("ERROR " + (error?.stack ?? error));
} finally {
  try {
    await cleanup();
    lines.push("\nfixtures removed");
  } catch (error) {
    lines.push("\nCLEANUP FAILED: " + error.message);
  }
  await sql.end();
  console.log(lines.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed, ${skipped} could not run outside the app`);
  process.exit(fail ? 1 : 0);
}
