// Authorization boundaries (Phase 20, cross-referencing SECURITY_REVIEW.md): anonymous requests, scope,
// Admin-only procedures, self-approval, deactivated users and CSRF through the app — and the same boundaries
// straight at the database API with a real user token, as if the application code were bypassed.
import {
  RUN,
  Session,
  TAKEOVER_QUESTION,
  check,
  confirm,
  ensureInvited,
  env,
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
  setup,
  sql,
  upload,
  userId,
} from "./lib.mjs";
import { createHash } from "node:crypto";

const { sessions, credentials } = await setup();
const { admin, pm, approver } = sessions;

// A subsidiary outside the approver's reach and a project outside the PM's, created once.
async function ensureUnit(parentCode, unitType, name, code) {
  if (await orgId(code)) return;
  const r = await admin.mutate("organization.create", {
    parentId: await orgId(parentCode),
    unitType,
    name,
    code,
  });
  if (!ok(r)) throw new Error(`could not create ${code}: ${r.error}`);
}
await ensureUnit("MEIL", "subsidiary", "E2E Far Subsidiary", "E2E-FAR");
await ensureUnit("E2E-FAR", "project", "E2E Far Project", "E2E-FAR-P");
const far = await ensureInvited(admin, {
  email: "e2e.farpm@traceesg.test",
  role: "project_manager",
  org: "E2E-FAR-P",
  name: "E2E Far PM",
});
const farPmId = await userId(far.email);
// The far PM is also an approver for their own subsidiary — so self-approval is refused by rule, not by role.
const hasApprover = await one(sql`
  select 1 from public.user_org_assignments a join public.roles r on r.id = a.role_id
  where a.user_id = ${farPmId} and r.code = 'corporate_esg' and a.revoked_at is null`);
if (!hasApprover) {
  await admin.mutate("users.addAssignment", {
    userId: farPmId,
    roleId: await roleId("corporate_esg"),
    orgUnitId: await orgId("E2E-FAR"),
  });
}
const farPm = new Session();
await farPm.login(far);
const farUpload = await upload(farPm, sample("diesel"), `auth-far-${RUN}.pdf`, {
  orgCode: "E2E-FAR-P",
});
await runWorker();
check(
  "setup: the far PM's invoice is verified and awaiting approval",
  ok(await confirm(farPm, farUpload.documentId)) &&
    (await recordOf(farUpload.documentId)).approval_status === "review_pending",
);
const farRecord = await recordOf(farUpload.documentId);

section("Anonymous requests");
const anon = new Session();
check(
  "a procedure refuses an anonymous caller",
  (await anon.query("records.search", {})).status === 401,
);
check("a page sends them to sign-in", (await anon.get("/app")).location?.includes("/login"));
check(
  "evidence is not served",
  (await anon.file(`/api/documents/${farUpload.documentId}/file`)).status === 401,
);

section("Scope: a PM sees only their own project");
const outside = await pm.query("verification.load", { documentId: farUpload.documentId });
check(
  "cannot open a document outside their project (nothing returned, not even whether it exists)",
  outside.status === 200 && outside.data === null,
);
check(
  "cannot download its evidence",
  (await pm.file(`/api/documents/${farUpload.documentId}/file`)).status === 404,
);
check(
  "cannot read its calculation trace",
  rejected(await pm.query("scope.recordTrace", { recordId: farRecord.id })),
);
check(
  "cannot upload into it",
  rejected(
    await pm.mutate("documents.prepareUpload", {
      orgUnitId: await orgId("E2E-FAR-P"),
      metricId: farRecord.metric_id,
      mimeType: "application/pdf",
      fileSize: 1000,
      sha256: "0".repeat(64),
      acknowledgeDuplicates: true,
    }),
  ),
);
// The page streams behind a skeleton, so its redirect travels in the payload rather than as a 307.
const verifyPage = await pm.get(`/app/verify/${farUpload.documentId}`);
check(
  "is sent back from its verify page, with nothing of the document shown",
  verifyPage.html.includes("NEXT_REDIRECT") &&
    verifyPage.html.includes("notice=forbidden") &&
    !verifyPage.html.includes(`auth-far-${RUN}`),
);

section("Admin-only procedures refuse everyone else");
const adminOnly = [
  [
    "users.invite",
    {
      email: `x.${RUN}@traceesg.test`,
      displayName: "x",
      roleId: await roleId("hr"),
      orgUnitId: await orgId("PRJ-X"),
    },
  ],
  [
    "factors.create",
    {
      activityType: "X",
      name: "xx",
      value: 1,
      inputUnit: "L",
      outputUnit: "kgCO2e",
      sourceReference: "x",
      effectiveFrom: "2026-01-01",
    },
  ],
  [
    "organization.create",
    { parentId: await orgId("MEIL"), unitType: "project", name: "x", code: `X-${RUN}` },
  ],
  [
    "validation.review",
    { recordId: farRecord.id, decision: "accept", reason: "an attempt from a PM" },
  ],
  ["reports.generate", { orgUnitId: await orgId("MEIL"), financialYear: 2026 }],
];
for (const [path, input] of adminOnly)
  check(`a PM calling ${path} is refused`, (await pm.mutate(path, input)).status === 403);
// Phase 4: the audit log is open to everyone, scoped; a PM gets only their own entries.
const pmAudit = await pm.query("audit.query", {});
const pmEventIds = (pmAudit.data?.events ?? []).map((e) => e.id);
const notPms = pmEventIds.length
  ? (
      await one(sql`
        select count(*)::int as n from public.audit_logs
        where id = any(${pmEventIds}::uuid[])
          and user_id is distinct from (select id from public.users where email = ${credentials.pm.email})`)
    ).n
  : 0;
check(
  "a PM reading audit.query gets their own entries and nobody else's",
  ok(pmAudit) && pmEventIds.length > 0 && notPms === 0,
  `${pmEventIds.length} entries, ${notPms} not theirs`,
);
for (const path of ["records.search", "users.list"]) {
  check(
    `a PM reading ${path} is refused`,
    (await pm.query(path, path === "users.list" ? undefined : {})).status === 403,
  );
}
// The root loading.tsx (ui, 2026-11) streams every page, so the refusal may arrive as a streamed redirect
// instead of a 307; either way no Admin content may be in the answer.
const pmOnAdmin = await pm.get("/admin/users");
check(
  "an Admin page redirects a PM",
  (pmOnAdmin.location?.includes("notice=forbidden") ||
    pmOnAdmin.html.includes("NEXT_REDIRECT;replace;/app?notice=forbidden")) &&
    !pmOnAdmin.html.includes("Invite user"),
);

section("Approval: in scope, and never your own record");
check(
  "the far PM, though an approver there, cannot approve their own record",
  rejected(await farPm.mutate("approvals.decide", { recordId: farRecord.id, decision: "approve" })),
);
check(
  "an approver for another subsidiary cannot approve it",
  rejected(
    await approver.mutate("approvals.decide", { recordId: farRecord.id, decision: "approve" }),
  ),
);
check(
  "nothing was written by either attempt",
  (await recordOf(farUpload.documentId)).approval_status === "review_pending",
);
check(
  "an Admin can",
  ok(await admin.mutate("approvals.decide", { recordId: farRecord.id, decision: "approve" })),
);

section("A deactivated user loses access at once");
const gone = await ensureInvited(admin, {
  email: "e2e.deactivated@traceesg.test",
  role: "project_manager",
  org: "PRJ-X",
  name: "E2E Deactivated",
});
const goneId = await userId(gone.email);
// An interrupted earlier run may have left them deactivated; the real procedure puts that right (no-op otherwise).
await admin.mutate("users.reactivate", { userId: goneId });
const goneSession = new Session();
check("setup: they can sign in", (await goneSession.login(gone)).location?.includes("/app"));
check("the Admin deactivates them", ok(await admin.mutate("users.deactivate", { userId: goneId })));
check(
  "their open session is refused",
  (await goneSession.query("documents.uploadOptions")).status >= 400,
);
const retry = await new Session().login(gone);
check("and they cannot sign in again", !retry.location && /deactivated/i.test(retry.text));
check(
  "the Admin reactivates them (cleanup)",
  ok(await admin.mutate("users.reactivate", { userId: goneId })),
);

section("Cross-site requests");
const csrf = await pm.mutate("notifications.markAllRead", {}, { origin: "https://evil.example" });
check("a mutation from another origin is refused", csrf.status === 403);

section("Abuse limits (SECURITY_REVIEW.md F1, F4)");
const bucketOf = (kind, value) =>
  `${kind}:${createHash("sha256").update(value.trim().toLowerCase()).digest("hex")}`;
const locked = await ensureInvited(admin, {
  email: "e2e.lockout@traceesg.test",
  role: "project_manager",
  org: "PRJ-X",
  name: "E2E Lockout",
});
for (let i = 1; i <= 5; i++)
  await new Session().login({ email: locked.email, password: `wrong-password-${i}` });
const lockedOut = await new Session().login(locked);
check(
  "after five wrong passwords even the right one is refused, saying why",
  !lockedOut.location && lockedOut.text.includes("Too many sign-in attempts"),
);
check(
  "no email address is stored in the counters",
  (
    await one(
      sql`select count(*)::int as n from public.rate_limit_events where bucket like ${"%@%"}`,
    )
  ).n === 0,
);
// The PM is signed in elsewhere, so the password being accepted shows as the takeover question.
check(
  "another account is unaffected",
  (await new Session().login(credentials.pm)).text.includes(TAKEOVER_QUESTION),
);
await sql`delete from public.rate_limit_events where bucket = ${bucketOf("login-account", locked.email)}`;
check(
  "once the window passes (cleared here) they sign in",
  (await new Session().login(locked)).location?.includes("/app"),
);
const uploads = bucketOf("upload-user", await userId(credentials.pm.email));
await sql`insert into public.rate_limit_events (bucket) select ${uploads} from generate_series(1, 60)`;
const quota = await upload(pm, sample("diesel"), `auth-quota-${RUN}.pdf`);
check(
  "the 61st upload in 10 minutes is refused (429)",
  quota.prepared.status === 429 && quota.prepared.error?.includes("Upload limit reached"),
);
await sql`delete from public.rate_limit_events where bucket = ${uploads}`;

section("Straight at the database API, bypassing the app (RLS)");
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
check("setup: the PM holds a real database token", typeof token.access_token === "string");
check(
  "reading another project's records returns nothing",
  JSON.stringify(
    await (await rest(`esg_records?select=id&org_unit_id=eq.${await orgId("E2E-FAR-P")}`)).json(),
  ) === "[]",
);
check(
  "reading its documents returns nothing",
  JSON.stringify(await (await rest(`documents?select=id&id=eq.${farUpload.documentId}`)).json()) ===
    "[]",
);
check(
  "reading the audit log returns nothing",
  JSON.stringify(await (await rest("audit_logs?select=id&limit=1")).json()) === "[]",
);
const ownRecord = (
  await one(sql`
  select r.id from public.esg_records r join public.users u on u.id = r.submitted_by
  where u.email = ${credentials.pm.email} limit 1`)
)?.id;
check(
  "setting an approval status directly is refused",
  (
    await rest(`esg_records?id=eq.${ownRecord}`, {
      method: "PATCH",
      body: JSON.stringify({ approval_status: "approved" }),
    })
  ).status >= 400,
);
check(
  "inserting an approval directly is refused",
  (
    await rest("approvals", {
      method: "POST",
      body: JSON.stringify({ esg_record_id: ownRecord, action: "approved" }),
    })
  ).status >= 400,
);
check(
  "writing the audit log directly is refused",
  (
    await rest("audit_logs", {
      method: "POST",
      body: JSON.stringify({ event_type: "x", entity_type: "x", entity_id: ownRecord }),
    })
  ).status >= 400,
);
const farPath = (
  await one(sql`select storage_path from public.documents where id = ${farUpload.documentId}`)
).storage_path;
const stored = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/authenticated/evidence/${farPath}`,
  {
    headers: {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      authorization: `Bearer ${token.access_token}`,
    },
  },
);
check("evidence cannot be fetched from Storage directly", stored.status >= 400);
check(
  "an anonymous database call reads nothing",
  (await rest("esg_records?select=id&limit=1", {}, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)).status >=
    400 ||
    JSON.stringify(
      await (
        await rest("esg_records?select=id&limit=1", {}, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      ).json(),
    ) === "[]",
);

await finish();
