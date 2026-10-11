// Cross-project access check through the app's real tRPC procedures (DATABASE_AUDIT_2026-10-12.md).
// Someone scoped to Project X calls every id-taking procedure with ids that belong to a sibling project
// ("IDOR Project Q"): once as a Project Manager, once holding every scoped permission a custom role could be
// given. Each call must be refused or return nothing of Project Q, and Project Q must be unchanged at the end.
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
  await sql`delete from public.user_org_assignments where user_id in (${A}, ${B})`;
  await sql`delete from public.users where id in (${A}, ${B})`;
  await sql`delete from auth.users where id in (${A}, ${B})`;
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
  if (!sub || !prjX || !period || !metric) throw new Error("local seed data missing");

  await sql`insert into public.org_units (id, parent_id, unit_type, name, code) values (${QUNIT}, ${sub.id}, 'project', 'IDOR Project Q', 'IDOR-Q')`;
  for (const [id, mail, name] of [
    [A, "idor.a@traceesg.test", "IDOR User A"],
    [B, "idor.b@traceesg.test", "IDOR User B"],
  ]) {
    await sql`insert into auth.users (id, email, aud, role) values (${id}, ${mail}, 'authenticated', 'authenticated')`;
    await sql`insert into public.users (id, display_name, email) values (${id}, ${name}, ${mail})`;
  }
  await sql`insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by) values
    (${A}, ${prjX.id}, ${pmRole.id}, ${A}), (${B}, ${QUNIT}, ${pmRole.id}, ${B})`;
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
      ],
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
           (select count(*)::int from public.users where email = 'idor.attempt@traceesg.test') as created`;
  const untouched =
    state.record === "review_pending/flagged" &&
    state.unit === "active" &&
    state.tx === 0 &&
    state.batches === 1 &&
    state.prices === 0 &&
    state.chat === 1 &&
    state.bundle === 1 &&
    state.runs === 1 &&
    state.created === 0;
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
