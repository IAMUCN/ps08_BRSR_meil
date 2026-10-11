// Regression checks for the fixes of the 2026-10-12 audits (SECURITY_AUDIT, DATABASE_AUDIT, CHATBOT_AUDIT,
// DEPENDENCY_AUDIT; summary in VALIDATION_REPORT_2026-10-12.md). Everything goes through the running app
// over HTTP with real sessions, or straight at the database API with a real user token — nothing is mocked.
// Each fix is checked both ways: what must be refused, and what must still be allowed.
//
// Runs after the other scripts (it uses a document Scenario A uploaded when there is one). The password-reset
// code flow needs a browser and is skipped, and reported as skipped, without CHROMIUM_EXECUTABLE_PATH.
import { createHash, randomBytes } from "node:crypto";
import {
  APP,
  Session,
  check,
  ensureInvited,
  env,
  finish,
  ok,
  one,
  orgId,
  section,
  setup,
  sql,
  upload,
  userId,
} from "./lib.mjs";

const { sessions, credentials } = await setup();
const { admin, pm, approver, hr } = sessions;
const skipped = [];
const skip = (what, why) => (
  skipped.push(`${what} — ${why}`),
  console.log(`  SKIP ${what} — ${why}`)
);

const [period] = await sql`
  select id, start_date::text as start from public.reporting_periods where status = 'open' limit 1`;
const financialYear =
  Number(period.start.slice(0, 4)) - (Number(period.start.slice(5, 7)) < 4 ? 1 : 0);
const MEIL = await orgId("MEIL");
const SUB_A = await orgId("SUB-A");
const PRJ_X = await orgId("PRJ-X");
const PRJ_W = await orgId("PRJ-W");

// Someone whose only assignment is a sibling project: the "other project" in every cross-project check.
const outsiderAccount = {
  email: "e2e.outsider@traceesg.test",
  role: "project_manager",
  org: "PRJ-W",
  name: "E2E Outsider",
};
const outsiderCredentials = await ensureInvited(admin, outsiderAccount);
const outsider = new Session();
await outsider.login(outsiderCredentials);
const raw = (path, init = {}) => fetch(`${APP}${path}`, { redirect: "manual", ...init });

// ---------------------------------------------------------------------------------------------------------
section("F-01 Deadlines: Admin only");
check(
  "a Project Manager is refused the deadline list",
  (await pm.query("deadlines.list")).status === 403,
);
check("and the deadline figures", (await pm.query("deadlines.kpis")).status === 403);
const deadlines = await admin.query("deadlines.list");
check("an Admin still gets it", ok(deadlines) && Array.isArray(deadlines.data?.tasks));
check(
  "no staff email address reaches a non-Admin through it",
  !JSON.stringify(await pm.query("deadlines.list")).includes("@traceesg.test"),
);

section("F-03 Carbon credits: inside the caller's org scope");
const ownReconciliation = await pm.query("carbonCredits.reconciliation", { orgUnitId: PRJ_X });
check("a Project Manager reads the reconciliation of their own project", ok(ownReconciliation));
check(
  "but not a sibling project's",
  (await pm.query("carbonCredits.reconciliation", { orgUnitId: PRJ_W })).status === 403,
);
check(
  "nor the group's",
  (await pm.query("carbonCredits.reconciliation", { orgUnitId: MEIL })).status === 403,
);
check(
  "the integrity check is a computed result with a message, not a constant",
  typeof ownReconciliation.data?.doubleCountingIntegrityCheck?.passed === "boolean" &&
    /Ledger check/.test(ownReconciliation.data.doubleCountingIntegrityCheck.message),
);
const pmOptions = await pm.query("carbonCredits.options");
check(
  "the org-unit list offered to a Project Manager holds only units in scope",
  ok(pmOptions) && pmOptions.data.orgUnits.every((u) => u.id !== PRJ_W && u.id !== MEIL),
  JSON.stringify(pmOptions.data?.orgUnits?.map((u) => u.code)),
);
const batch = {
  projectName: "E2E audit batch",
  registry: "VERRA_VCS",
  registryProjectId: "E2E-1",
  serialNumberStart: "E2E-0001",
  serialNumberEnd: "E2E-0010",
  quantityTco2e: 10,
  vintageYear: 2024,
  methodologyCode: "E2E-M1",
  issuanceDate: "2025-01-01",
  verifierName: "E2E verifier",
};
check(
  "Corporate ESG at a subsidiary cannot register a batch for the group",
  (await approver.mutate("carbonCredits.mint", { ...batch, orgUnitId: MEIL })).status === 403,
);
const minted = await approver.mutate("carbonCredits.mint", { ...batch, orgUnitId: PRJ_X });
check("and can register one inside their own scope", ok(minted) && Boolean(minted.data?.id));
if (minted.data?.id) {
  check(
    "a Project Manager of another project does not see that batch",
    ok(await outsider.query("carbonCredits.list")) &&
      !JSON.stringify((await outsider.query("carbonCredits.list")).data).includes(minted.data.id),
  );
  check(
    "the Project Manager of its project does",
    JSON.stringify((await pm.query("carbonCredits.list")).data).includes(minted.data.id),
  );
  check(
    "someone outside its scope cannot retire it (it reads as missing)",
    (
      await outsider.mutate("carbonCredits.retire", {
        creditId: minted.data.id,
        quantityTco2e: 1,
        reportingPeriodId: period.id,
        beneficiaryOrgUnitId: PRJ_W,
        targetScope: "SCOPE_1",
        retirementReason: "cross-project attempt",
      })
    ).status >= 403,
  );
  check(
    "no transaction was recorded against it",
    (
      await one(
        sql`select count(*)::int as n from public.carbon_credit_transactions where credit_id = ${minted.data.id}`,
      )
    ).n === 0,
  );
  await sql`delete from public.carbon_credits where id = ${minted.data.id}`;
}

section("F-04 Control Tower figures: inside the caller's org scope");
check(
  "Corporate ESG at a subsidiary reads the figures of that subsidiary",
  ok(await approver.query("records.summary", { orgUnitId: SUB_A, periodId: period.id })),
);
check(
  "but not the group's",
  (await approver.query("records.summary", { orgUnitId: MEIL, periodId: period.id })).status ===
    403,
);
check(
  "nor the group's KPI trends",
  (await approver.query("records.kpiTrends", { orgUnitId: MEIL })).status === 403,
);
check("an Admin reads the group", ok(await admin.query("records.summary", { orgUnitId: MEIL })));

section("F-06 Evidence bundle: permission, scope, and it actually builds");
const bundleUrl = `/api/reports/bundle?orgUnitId=${PRJ_X}&financialYear=${financialYear}`;
check("anonymous: 401", (await raw(bundleUrl)).status === 401);
check(
  "a Project Manager, even for their own project: 403",
  (await pm.file(bundleUrl)).status === 403,
);
check(
  "the preview is refused to a Project Manager too",
  (await pm.query("reports.bundlePreview", { orgUnitId: PRJ_X, financialYear })).status === 403,
);
const bundle = await admin.file(
  `/api/reports/bundle?orgUnitId=${MEIL}&financialYear=${financialYear}`,
);
const bundleBytes = Buffer.from(await bundle.arrayBuffer());
check(
  "an Admin downloads a real ZIP for the group (the audit-trail query runs)",
  bundle.status === 200 && bundleBytes.subarray(0, 2).toString() === "PK",
  `status ${bundle.status}, ${bundleBytes.length} bytes, starts ${JSON.stringify(bundleBytes.subarray(0, 60).toString())}`,
);
check(
  "it is never cached",
  /no-store/.test(bundle.headers.get("cache-control") ?? ""),
  bundle.headers.get("cache-control"),
);
const badBundle = await admin.file(
  `/api/reports/bundle?orgUnitId=${randomUuid()}&financialYear=${financialYear}`,
);
const badBundleBody = await badBundle.text();
check(
  "a failing bundle answers with a fixed message, no database or stack text",
  badBundle.status >= 400 && !/relation|postgres|stack|at async|node_modules/i.test(badBundleBody),
  badBundleBody.slice(0, 160),
);

section("F-11 Reports: reading needs the permission");
check("a Project Manager cannot list reports", (await pm.query("reports.list")).status === 403);
check(
  "nor fetch a report file by a guessed id",
  [401, 403, 404].includes((await pm.file(`/api/reports/${randomUuid()}/file`)).status),
);
check("an Admin lists reports", ok(await admin.query("reports.list")));

section("D-02 Validation queue and D-03 settings");
check(
  "a Project Manager cannot read the validation queue",
  (await pm.query("validation.queue")).status === 403,
);
check("an Admin can", ok(await admin.query("validation.queue")));

// ---------------------------------------------------------------------------------------------------------
section("Sessions: cookie flags, sign-out, tampering");
// Signing out ends every session of the person, so this uses an account nothing else is signed in with.
const signOutCredentials = await ensureInvited(admin, {
  email: "e2e.signout@traceesg.test",
  role: "hr",
  org: "PRJ-W",
  name: "E2E Sign-out",
});
const fresh = new Session();
const loginPage = await fetch(`${APP}/login`);
check(
  "the landing and sign-in pages set no cookie before sign-in",
  loginPage.headers.getSetCookie().length === 0 &&
    (await fetch(APP)).headers.getSetCookie().length === 0,
);
const loginResponse = await signInRaw(fresh, signOutCredentials);
const sessionCookies = loginResponse.filter((c) => /^sb-.*auth-token/.test(c));
check(
  "the session cookie is HttpOnly and SameSite=Lax",
  sessionCookies.length > 0 &&
    sessionCookies.every((c) => /;\s*httponly/i.test(c) && /;\s*samesite=lax/i.test(c)),
  sessionCookies.map((c) => c.replace(/=[^;]*/, "=…")).join(" | "),
);
check(
  "and Secure in a production build",
  sessionCookies.every((c) => /;\s*secure/i.test(c)),
);
check("the new session works", ok(await fresh.query("session.me")));
const stolen = new Session();
stolen.jar = new Map(fresh.jar);
const elsewhere = new Session();
await elsewhere.login(signOutCredentials);
check("a second device is signed in at the same time", ok(await elsewhere.query("session.me")));
await fresh.get("/auth/signout");
check(
  "after sign-out the browser's own session is gone",
  (await fresh.query("session.me")).status === 401,
);
check(
  "and the person's other devices are signed out with it",
  (await elsewhere.query("session.me")).status === 401,
);
check(
  "and a copy of the old cookie no longer works either (the session is revoked, not just forgotten)",
  (await stolen.query("session.me")).status === 401,
);
const tampered = new Session();
tampered.jar = new Map([...pm.jar].map(([k, v]) => [k, v.slice(0, -6) + "AAAAAA"]));
check("a tampered session cookie is refused", (await tampered.query("session.me")).status === 401);
const garbage = new Session();
garbage.jar = new Map([[[...pm.jar.keys()][0], "base64-eyJhY2Nlc3NfdG9rZW4iOiJub3BlIn0"]]);
check("a made-up session cookie is refused", (await garbage.query("session.me")).status === 401);

section("F-09 Setting a password needs a fresh emailed link");
const plain = await hrSession();
const noMarker = await plain.get("/reset-password");
check(
  "a signed-in session without the link's marker is sent away from /reset-password",
  noMarker.status === 307 && /\/login\?reason=link_invalid/.test(noMarker.location ?? ""),
  `${noMarker.status} ${noMarker.location}`,
);
const link = await (
  await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: "recovery", email: outsiderCredentials.email }),
  })
).json();
const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
if (!tokenHash) skip("the emailed-link path", "the local auth server returned no link token");
else {
  const viaLink = new Session();
  const confirmed = await viaLink.get(`/auth/confirm?token_hash=${tokenHash}&type=recovery`);
  check(
    "a valid emailed link leads to /reset-password",
    confirmed.status === 307 && /\/reset-password$/.test(confirmed.location ?? ""),
    `${confirmed.status} ${confirmed.location}`,
  );
  check(
    "and the set-password page then opens",
    (await viaLink.get("/reset-password")).status === 200,
  );
  check(
    "the same link does not work twice",
    /link_invalid/.test(
      (await new Session().get(`/auth/confirm?token_hash=${tokenHash}&type=recovery`)).location ??
        "",
    ),
  );
  check(
    "a made-up link token is refused",
    /link_invalid/.test(
      (await new Session().get(`/auth/confirm?token_hash=${"0".repeat(56)}&type=recovery`))
        .location ?? "",
    ),
  );
  check(
    "a link type other than invite or recovery is refused",
    /link_invalid/.test(
      (await new Session().get(`/auth/confirm?token_hash=${tokenHash}&type=magiclink`)).location ??
        "",
    ),
  );
}

section("Unsafe redirects after sign-in");
for (const next of [
  "//evil.example",
  "/\\evil.example",
  "https://evil.example/app",
  "/app/../../evil",
  "javascript:alert(1)",
]) {
  const s = new Session();
  const r = await signInTo(s, credentials.hr, next);
  check(
    `next=${next} lands inside the app`,
    typeof r === "string" && r.startsWith("/app") && !r.includes("evil"),
    String(r),
  );
}
const deep = await signInTo(new Session(), credentials.hr, "/app/submissions");
check("a legitimate return path is honoured", deep === "/app/submissions", String(deep));
const elevated = await signInTo(new Session(), credentials.hr, "/admin/users");
check(
  "a return path the role may not open falls back to its own home",
  elevated === "/app",
  String(elevated),
);

// ---------------------------------------------------------------------------------------------------------
section("Injection and markup in input");
const hostile = `<img src=x onerror=alert(1)> E2E`;
const renamed = await hr.mutate(
  "profile.updateDisplayName",
  { displayName: hostile },
  { origin: APP },
);
check("a display name with markup is accepted as text", ok(renamed), renamed.error);
const page = await hr.get("/app/profile");
check(
  "and is rendered escaped, never as an element",
  !page.html.includes("<img src=x onerror") && /&lt;img src=x onerror/.test(page.html),
);
await hr.mutate("profile.updateDisplayName", { displayName: "E2E HR" }, { origin: APP });
for (const text of ["'; drop table public.users; --", "%_\\", '" or 1=1 --', "${7*7}{{7*7}}"]) {
  const r = await admin.query("records.search", { text });
  check(
    `a search for ${JSON.stringify(text)} is treated as words`,
    ok(r) && Array.isArray(r.data?.rows ?? r.data),
  );
}
check(
  "the users table is still there",
  (await one(sql`select count(*)::int as n from public.users`)).n > 0,
);
check(
  "an id that is not an id is refused before any query",
  (await admin.query("reports.get", { id: "1 or 1=1" })).status === 400,
);
const sqlLogin = await new Session().login({
  email: "admin'--@traceesg.test",
  password: "x' or '1'='1",
});
check("a sign-in with SQL in it is just a failed sign-in", !sqlLogin.location);

section("Cross-site requests");
check(
  "a change sent from another site is refused",
  (await pm.mutate("profile.setTheme", { theme: "theme-2" }, { origin: "https://evil.example" }))
    .status === 403,
);
check(
  "the same change from the app's own pages is accepted",
  ok(await pm.mutate("profile.setTheme", { theme: "theme-2" }, { origin: APP })),
);
check(
  "a change cannot be made with a GET request",
  (await pm.query("profile.setTheme", { theme: "theme-3" })).status === 405,
);
const preflight = await fetch(`${APP}/api/trpc/session.me`, {
  method: "OPTIONS",
  headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
});
check(
  "no other origin is granted access",
  preflight.headers.get("access-control-allow-origin") === null,
);

section("Uploads");
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
check(
  "a Project Manager cannot upload into another project",
  (await upload(pm, pdf, "bill.pdf", { orgCode: "PRJ-W" })).prepared.status === 403,
);
const exe = Buffer.concat([Buffer.from("MZ"), randomBytes(600)]);
const disguised = await upload(pm, exe, "invoice.pdf");
check(
  "a program renamed to .pdf is refused once the server reads its bytes",
  !disguised.documentId && disguised.completed?.status >= 400,
  disguised.completed?.error ?? JSON.stringify(disguised.prepared),
);
const before = (await one(sql`select count(*)::int as n from public.documents`)).n;
const traversal = await upload(pm, pdf, "../../../../etc/passwd.pdf");
const stored = traversal.documentId
  ? await one(
      sql`select storage_path, file_name from public.documents where id = ${traversal.documentId}`,
    )
  : null;
check(
  "a file name with ../ in it never reaches the storage path",
  !stored || (!stored.storage_path.includes("..") && !stored.storage_path.includes("passwd")),
  stored
    ? `${stored.storage_path} | ${stored.file_name}`
    : `refused: ${traversal.completed?.error}`,
);
check(
  "an oversized declared file is refused before a signed URL is issued",
  (
    await pm.mutate(
      "documents.prepareUpload",
      {
        orgUnitId: PRJ_X,
        metricId: (
          await one(sql`select id from public.esg_metrics where code = 'DIESEL_CONSUMPTION'`)
        ).id,
        mimeType: "application/pdf",
        acknowledgeDuplicates: true,
        fileSize: 60 * 1024 * 1024,
        sha256: "a".repeat(64),
      },
      { origin: APP },
    )
  ).status === 400,
);
console.log(
  `  (documents before ${before}, after ${(await one(sql`select count(*)::int as n from public.documents`)).n})`,
);

section("Evidence files across projects");
const document = await one(sql`
  select d.id from public.documents d where d.org_unit_id = ${PRJ_X} and d.deleted_at is null
  order by d.created_at desc limit 1`);
if (!document)
  skip("evidence file access", "no document exists at Project X (run Scenario A first)");
else {
  const path = `/api/documents/${document.id}/file`;
  check("anonymous: 401", (await raw(path)).status === 401);
  check(
    "a Project Manager of another project: 404, as if it did not exist",
    (await outsider.file(path)).status === 404,
  );
  const own = await pm.file(path);
  check(
    "the project's own Project Manager can open it",
    [200, 409, 502].includes(own.status),
    `status ${own.status}`,
  );
  if (own.status === 200) {
    check(
      "served sandboxed, not cached, with its type fixed",
      /sandbox/.test(own.headers.get("content-security-policy") ?? "") &&
        /no-store/.test(own.headers.get("cache-control") ?? "") &&
        own.headers.get("x-content-type-options") === "nosniff",
    );
  }
  check(
    "the verification screen gets nothing for the other project, as for a document that does not exist",
    !(await outsider.query("verification.load", { documentId: document.id })).data,
  );
  check(
    "while the document's own project gets its details",
    Boolean((await pm.query("verification.load", { documentId: document.id })).data?.documentId),
  );
  const stateBefore = await one(sql`
    select r.data_quality_state::text as q, d.document_type_id as t from public.documents d
    join public.esg_record_documents erd on erd.document_id = d.id
    join public.esg_records r on r.id = erd.esg_record_id where d.id = ${document.id}`);
  const rejectAttempt = await outsider.mutate(
    "verification.reject",
    { documentId: document.id, reason: "cross-project attempt to reject" },
    { origin: APP },
  );
  const retypeAttempt = await outsider.mutate(
    "verification.setDocumentType",
    { documentId: document.id, documentTypeId: randomUuid() },
    { origin: APP },
  );
  check(
    "someone from another project cannot reject it or change its document type",
    rejectAttempt.status >= 400 && retypeAttempt.status >= 400,
    `${rejectAttempt.status} ${retypeAttempt.status}`,
  );
  const stateAfter = await one(sql`
    select r.data_quality_state::text as q, d.document_type_id as t from public.documents d
    join public.esg_record_documents erd on erd.document_id = d.id
    join public.esg_records r on r.id = erd.esg_record_id where d.id = ${document.id}`);
  check(
    "and the record and document are exactly as they were",
    stateBefore.q === stateAfter.q && stateBefore.t === stateAfter.t,
  );
  check(
    "and its record evidence list comes back empty",
    JSON.stringify(
      (
        await outsider.query("documents.recordEvidence", {
          recordId: (
            await one(
              sql`select esg_record_id as id from public.esg_record_documents where document_id = ${document.id}`,
            )
          ).id,
        })
      ).data?.files ?? [],
    ) === "[]",
  );
}

section("Response headers and error bodies");
const home = await fetch(`${APP}/login`);
check("no X-Powered-By header", home.headers.get("x-powered-by") === null);
check(
  "HSTS, no framing, no sniffing on pages",
  /max-age=\d+/.test(home.headers.get("strict-transport-security") ?? "") &&
    home.headers.get("x-frame-options") === "DENY" &&
    home.headers.get("x-content-type-options") === "nosniff",
);
const api = await fetch(`${APP}/api/trpc/session.me`);
const apiBody = await api.text();
check("API answers are never stored", /no-store/.test(api.headers.get("cache-control") ?? ""));
check(
  "an API error carries a message and a code, no stack or file path",
  !/stack|node_modules|\.ts:|at async/.test(apiBody),
  apiBody.slice(0, 140),
);
for (const probe of [
  "/.env",
  "/.git/config",
  "/_next/static/chunks/main.js.map",
  "/__nextjs_original-stack-frame",
]) {
  check(`${probe} is not served`, (await raw(probe)).status === 404);
}
check(
  "robots.txt asks crawlers to stay out of the app",
  /Disallow: \/admin/.test(await (await fetch(`${APP}/robots.txt`)).text()),
);
const html = (await (await fetch(APP)).text()) + (await (await fetch(`${APP}/login`)).text());
const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
  .map((m) => new URL(m[1]).host)
  .filter((h) => h !== new URL(APP).host);
check(
  "the landing and sign-in pages load nothing from another host",
  external.length === 0,
  [...new Set(external)].join(", "),
);

section("Straight at the database API with a real user token");
const token = await (
  await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: credentials.pm.email, password: credentials.pm.password }),
  })
).json();
const rest = (path, init = {}, bearer = token.access_token) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
const json = async (r) => JSON.stringify(await r.json());
check(
  "settings (turnover, rate limits) are not readable by a Project Manager",
  (await json(await rest("org_settings?select=key"))) === "[]",
);
check(
  "other people's accounts are not readable",
  (await json(
    await rest(`users?select=email&email=neq.${encodeURIComponent(credentials.pm.email)}`),
  )) === "[]",
);
check(
  "carbon credits are closed to the browser role",
  (await rest("carbon_credits?select=id&limit=1")).status >= 400,
);
check(
  "conversations are closed to the browser role",
  (await rest("chat_messages?select=id&limit=1")).status >= 400,
);
const ownRecord = await one(
  sql`select id, org_unit_id from public.esg_records where org_unit_id = ${PRJ_X} limit 1`,
);
if (ownRecord) {
  const moved = await rest(`esg_records?id=eq.${ownRecord.id}`, {
    method: "PATCH",
    body: JSON.stringify({ org_unit_id: PRJ_W }),
    headers: { prefer: "return=representation" },
  });
  check(
    "a record cannot be moved to another project through the database API",
    moved.status >= 400 || (await moved.text()) === "[]",
  );
  check(
    "it is where it was",
    (await one(sql`select org_unit_id from public.esg_records where id = ${ownRecord.id}`))
      .org_unit_id === ownRecord.org_unit_id,
  );
}
check(
  "without a user token nothing is readable",
  (await rest("esg_records?select=id&limit=1", {}, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)).status >=
    400 ||
    (await json(
      await rest("esg_records?select=id&limit=1", {}, env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    )) === "[]",
);

section("Deleting an account");
const disposable = {
  email: `e2e.disposable.${Date.now().toString(36)}@traceesg.test`,
  role: "hr",
  org: "PRJ-W",
  name: "E2E Disposable",
};
await ensureInvited(admin, disposable);
const disposableId = await userId(disposable.email);
const deleted = await admin.mutate("users.delete", { userId: disposableId }, { origin: APP });
check("an account that left nothing behind is deleted", ok(deleted), deleted.error);
check("its profile row is gone", !(await userId(disposable.email)));
check(
  "and so is its sign-in",
  (await one(sql`select count(*)::int as n from auth.users where id = ${disposableId}`)).n === 0,
);
const used = await admin.mutate(
  "users.delete",
  { userId: await userId(credentials.pm.email) },
  { origin: APP },
);
check(
  "an account with submissions on record is not deleted",
  used.status === 400 && /deactivate/i.test(used.error ?? ""),
  used.error,
);
check(
  "a Project Manager cannot delete anyone",
  (await pm.mutate("users.delete", { userId: disposableId }, { origin: APP })).status === 403,
);

// ---------------------------------------------------------------------------------------------------------
section("F-07 Password-reset code (in a browser)");
const browserPath = process.env.CHROMIUM_EXECUTABLE_PATH ?? env.CHROMIUM_EXECUTABLE_PATH;
if (!browserPath) skip("the reset-code flow", "CHROMIUM_EXECUTABLE_PATH is not set");
else {
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({ executablePath: browserPath, headless: true });
  try {
    const target = outsiderCredentials.email;
    const targetId = await userId(target);
    const sha = (s) => createHash("sha256").update(s).digest("hex");
    const settle = (ms = 900) => new Promise((r) => setTimeout(r, ms));
    const tab = await browser.newPage();
    const request = async () => {
      await tab.goto(`${APP}/forgot-password`, { waitUntil: "networkidle2" });
      await tab.type('input[name="email"]', target);
      await tab.keyboard.press("Enter");
      await tab.waitForSelector('input[name="code"]', { timeout: 20000 });
      // The code went to an email nobody reads here: replace its stored fingerprint with a known one.
      await sql`update public.password_reset_otps set code_hash = ${sha("428913")} where user_id = ${targetId} and consumed_at is null`;
    };
    const attempt = async (code, password) => {
      for (const [name, value] of [
        ["code", code],
        ["password", password],
        ["confirmPassword", password],
      ]) {
        await tab.$eval(`input[name="${name}"]`, (el) => (el.value = ""));
        await tab.type(`input[name="${name}"]`, value);
      }
      await tab.keyboard.press("Enter");
      await settle(1500);
      return tab.url();
    };
    const newPassword = `E2e-${randomBytes(10).toString("hex")}-R!`;
    await request();
    check(
      "a code was stored as a fingerprint, with a ten-minute life",
      Boolean(
        await one(
          sql`select 1 as x from public.password_reset_otps where user_id = ${targetId} and consumed_at is null and expires_at <= now() + interval '10 minutes'`,
        ),
      ),
    );
    for (let i = 0; i < 5; i++) await attempt("000000", newPassword);
    const afterWrong = await one(
      sql`select attempts from public.password_reset_otps where user_id = ${targetId} and consumed_at is null`,
    );
    check(
      "five wrong codes use up the five attempts",
      afterWrong?.attempts === 5,
      `attempts ${afterWrong?.attempts}`,
    );
    const exhausted = await attempt("428913", newPassword);
    check("then even the right code is refused", !exhausted.includes("password_set"), exhausted);
    check(
      "and the old password still works",
      Boolean((await new Session().login(outsiderCredentials)).location),
    );
    await sql`delete from public.rate_limit_events`;
    await request();
    const done = await attempt("428913", newPassword);
    check(
      "a fresh code, entered correctly, sets the new password",
      done.includes("reason=password_set"),
      done,
    );
    check(
      "the new password signs in",
      Boolean((await new Session().login({ email: target, password: newPassword })).location),
    );
    check(
      "the old password no longer does",
      !(await new Session().login(outsiderCredentials)).location,
    );
    check(
      "the used code cannot be used again",
      !(await one(
        sql`select 1 as x from public.password_reset_otps where user_id = ${targetId} and consumed_at is null`,
      )),
    );
    check(
      "the reset is in the audit trail",
      (
        await one(
          sql`select count(*)::int as n from public.audit_logs where event_type = 'user.password_reset' and entity_id = ${targetId}`,
        )
      ).n > 0,
    );
  } finally {
    await browser.close();
    await sql`delete from public.rate_limit_events`;
  }
}

if (skipped.length) console.log(`\nSkipped: ${skipped.length}\n  ${skipped.join("\n  ")}`);
await finish();

// --- helpers ------------------------------------------------------------------------------------------------
function randomUuid() {
  return crypto.randomUUID();
}
async function hrSession() {
  const s = new Session();
  await s.login(credentials.hr);
  return s;
}
/** Signs in and returns the raw Set-Cookie lines of the response. */
async function signInRaw(session, who) {
  const formPage = await session.get("/login");
  const form = formPage.html.match(/<form[^>]*>([\s\S]*?)<\/form>/)[1];
  const body = new FormData();
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = m[0].match(/name="([^"]*)"/)?.[1];
    const value = m[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if (name) body.append(name, value.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  body.append("email", who.email);
  body.append("password", who.password);
  const r = await fetch(`${APP}/login`, {
    method: "POST",
    body,
    redirect: "manual",
    headers: { cookie: session.cookieHeader(), origin: APP },
  });
  session.store(r);
  return r.headers.getSetCookie();
}
/** Signs in from /login?next=… and returns where the app sends the person. */
async function signInTo(session, who, next) {
  const formPage = await session.get(`/login?next=${encodeURIComponent(next)}`);
  const form = formPage.html.match(/<form[^>]*>([\s\S]*?)<\/form>/)[1];
  const body = new FormData();
  for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = m[0].match(/name="([^"]*)"/)?.[1];
    const value = m[0].match(/value="([^"]*)"/)?.[1] ?? "";
    if (name) body.append(name, value.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  }
  body.append("email", who.email);
  body.append("password", who.password);
  const r = await fetch(`${APP}/login`, {
    method: "POST",
    body,
    redirect: "manual",
    headers: { cookie: session.cookieHeader(), origin: APP },
  });
  session.store(r);
  const location = r.headers.get("location");
  return location ? new URL(location, APP).pathname + new URL(location, APP).search : null;
}
