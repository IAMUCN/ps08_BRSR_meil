// End-to-end test library (Phase 20, .grill/phase-20-testing-decisions.md). Real sessions against the running
// app, real tRPC procedures over HTTP (the same ones the UI calls), real uploads to local Storage and the real
// OCR worker. Synthetic documents only. Never prints keys or passwords.
//
// Local only: refuses to run unless DATABASE_URL points at this machine.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const HERE = dirname(fileURLToPath(import.meta.url));
export const WEB = join(HERE, "..", "..");
export const REPO = join(WEB, "..", "..");
const WORKER = join(REPO, "apps", "ocr-worker");

// E2E_ENV_FILE points the suite (and the worker it starts) at another env file, e.g. a local-only copy
// when .env.local points at a hosted project.
export const env = Object.fromEntries(
  readFileSync(process.env.E2E_ENV_FILE ?? join(WEB, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l
        .slice(l.indexOf("=") + 1)
        .trim()
        .replace(/^"|"$/g, ""),
    ]),
);
for (const key of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[key]) throw new Error(`apps/web/.env.local has no ${key}`);
}
const dbHost = new URL(env.DATABASE_URL).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
  throw new Error(`Refusing to run: DATABASE_URL points at ${dbHost}, not a local database.`);
}

export const APP = process.env.E2E_APP_URL ?? "http://localhost:3000";
export const RUN = Date.now().toString(36);
export const sql = postgres(env.DATABASE_URL, { prepare: false, max: 2, onnotice: () => {} });

// --- Results --------------------------------------------------------------------------------------------

let passed = 0;
let failed = 0;
export function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
export const section = (title) => console.log(`\n# ${title}`);
export async function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  await sql.end();
  process.exit(failed ? 1 : 0);
}
export const close = (a, b, eps = 1e-6) => Math.abs((a ?? NaN) - (b ?? NaN)) < eps;

// --- Lookups --------------------------------------------------------------------------------------------

export const one = async (query) => (await query)[0];
export const orgId = async (code) =>
  (await one(sql`select id from public.org_units where code = ${code}`))?.id;
export const metricId = async (code) =>
  (await one(sql`select id from public.esg_metrics where code = ${code}`))?.id;
export const roleId = async (code) =>
  (await one(sql`select id from public.roles where code = ${code}`))?.id;
export const userId = async (email) =>
  (await one(sql`select id from public.users where email = ${email}`))?.id;
export const openPeriodId = async () =>
  (
    await one(
      sql`select id from public.reporting_periods where status = 'open' order by start_date limit 1`,
    )
  )?.id;
export const auditCount = async (event, entityId) =>
  (
    await one(
      sql`select count(*)::int as n from public.audit_logs where event_type = ${event} and entity_id = ${entityId}`,
    )
  ).n;
/** The ESG record created for an uploaded document. */
export const recordOf = async (documentId) =>
  one(sql`select r.* from public.esg_records r
          join public.esg_record_documents e on e.esg_record_id = r.id
          where e.document_id = ${documentId}`);
export const currentCalculation = async (recordId) =>
  one(sql`select * from public.calculations where esg_record_id = ${recordId} and is_current`);
/** The latest validation run as "rule_type:result" strings. */
export async function validationResults(recordId) {
  const rows = await sql`
    select rule_type || ':' || result as r from public.validation_results
    where esg_record_id = ${recordId}
      and evaluated_at = (select max(evaluated_at) from public.validation_results where esg_record_id = ${recordId})
    order by 1`;
  return rows.map((row) => row.r);
}

// --- Sessions -------------------------------------------------------------------------------------------

export const ok = (r) => r?.status === 200;
/** What the login form says when the account is already signed in elsewhere (migration 0055). */
export const TAKEOVER_QUESTION = "This account is signed in on another device";
export const rejected = (r, includes) =>
  !!r && r.status >= 400 && (!includes || !!r.error?.includes(includes));

/** A signed-in browser session: cookies kept between requests, like the real app. */
export class Session {
  jar = new Map();
  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  store(response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (attrs.some((a) => /max-age=0/i.test(a.trim())) || value === "") this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
  async get(path) {
    const r = await fetch(`${APP}${path}`, {
      redirect: "manual",
      headers: { cookie: this.cookieHeader() },
    });
    this.store(r);
    return { status: r.status, location: r.headers.get("location"), html: await r.text() };
  }
  /**
   * Signs in through the real login form (a Server Action). Returns where the app sends the user. With
   * `takeover`, answers yes to "signed in on another device" (migration 0055): the other sign-in ends.
   */
  async login({ email, password }, { takeover = false } = {}) {
    const page = await this.get("/login");
    const form = page.html.match(/<form[^>]*>([\s\S]*?)<\/form>/)[1];
    const body = new FormData();
    for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = m[0].match(/name="([^"]*)"/)?.[1];
      const value = m[0].match(/value="([^"]*)"/)?.[1] ?? "";
      if (name) body.append(name, value.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    }
    body.append("email", email);
    body.append("password", password);
    if (takeover) body.append("takeover", "confirm");
    const r = await fetch(`${APP}/login`, {
      method: "POST",
      body,
      redirect: "manual",
      headers: { cookie: this.cookieHeader(), origin: APP },
    });
    this.store(r);
    return { status: r.status, location: r.headers.get("location"), text: await r.text() };
  }
  async query(path, input) {
    const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
    const r = await fetch(`${APP}/api/trpc/${path}${qs}`, {
      headers: { cookie: this.cookieHeader() },
    });
    this.store(r);
    const json = await r.json().catch(() => ({}));
    return { status: r.status, data: json.result?.data, error: json.error?.message };
  }
  async mutate(path, input, headers = {}) {
    const r = await fetch(`${APP}/api/trpc/${path}`, {
      method: "POST",
      headers: { cookie: this.cookieHeader(), "content-type": "application/json", ...headers },
      body: JSON.stringify(input),
    });
    this.store(r);
    const json = await r.json().catch(() => ({}));
    return { status: r.status, data: json.result?.data, error: json.error?.message };
  }
  async file(path) {
    return fetch(`${APP}${path}`, { headers: { cookie: this.cookieHeader() } });
  }
}

// --- Test accounts --------------------------------------------------------------------------------------

const authAdmin = (path, init = {}) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
  });
// Meets the password policy (lib/auth/password-policy.ts): 12+ characters, upper, lower, digit, symbol.
const newPassword = () => `E2e-${randomBytes(12).toString("hex")}-x!`;
async function setPassword(id, password) {
  const r = await authAdmin(`users/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      password,
      email_confirm: true,
      app_metadata: { must_change_password: false },
    }),
  });
  if (!r.ok) throw new Error(`could not set a test password (${r.status})`);
}

export const ACCOUNTS = {
  admin: { email: "e2e.admin@traceesg.test", role: "admin", org: "MEIL", name: "E2E Admin" },
  pm: {
    email: "e2e.pm@traceesg.test",
    role: "project_manager",
    org: "PRJ-X",
    name: "E2E Project Manager",
  },
  hr: { email: "e2e.hr@traceesg.test", role: "hr", org: "PRJ-X", name: "E2E HR" },
  ehs: { email: "e2e.ehs@traceesg.test", role: "ehs", org: "PRJ-X", name: "E2E EHS" },
  approver: {
    email: "e2e.approver@traceesg.test",
    role: "corporate_esg",
    org: "SUB-A",
    name: "E2E Approver",
  },
};

/**
 * The E2E Admin, provisioned the way scripts/provision-user.ts does it (auth user, users row, root
 * assignment, audit entry) but with a password instead of an invite. Idempotent; a fresh password per run.
 */
async function ensureAdmin() {
  const a = ACCOUNTS.admin;
  const password = newPassword();
  let id = await userId(a.email);
  if (!id) {
    const r = await authAdmin("users", {
      method: "POST",
      body: JSON.stringify({
        email: a.email,
        password,
        email_confirm: true,
        user_metadata: { display_name: a.name },
      }),
    });
    const created = await r.json();
    if (!r.ok) throw new Error(`could not create the E2E Admin (${r.status})`);
    id = created.id;
    await sql.begin(async (tx) => {
      await tx`insert into public.users (id, display_name, email) values (${id}, ${a.name}, ${a.email})`;
      await tx`insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
               select ${id}, o.id, r.id, ${id} from public.org_units o, public.roles r
               where o.code = ${a.org} and r.code = 'admin'`;
      await tx`insert into public.audit_logs (event_type, entity_type, entity_id, user_id, new_value)
               values ('user.provisioned', 'user', ${id}, null,
                       ${tx.json({ email: a.email, role: "admin", org_unit_code: a.org, via: "apps/web/tests/e2e" })})`;
    });
  } else {
    await setPassword(id, password);
  }
  return { ...a, password };
}

/** Everyone else is invited by the E2E Admin through the real procedure, then given a password. */
export async function ensureInvited(admin, account) {
  const password = newPassword();
  let id = await userId(account.email);
  if (!id) {
    const invited = await admin.mutate("users.invite", {
      email: account.email,
      displayName: account.name,
      roleId: await roleId(account.role),
      orgUnitId: await orgId(account.org),
    });
    if (!ok(invited)) throw new Error(`could not invite ${account.email}: ${invited.error}`);
    id = await userId(account.email);
  }
  await setPassword(id, password);
  return { ...account, password };
}

/** Signs in every test account; `sessions.admin` etc. are ready to use, `credentials` for login tests. */
export async function setup() {
  await sql`delete from public.rate_limit_events`; // counters from earlier scripts would skew this one
  const credentials = { admin: await ensureAdmin() };
  const sessions = { admin: new Session() };
  const adminLogin = await sessions.admin.login(credentials.admin);
  if (!adminLogin.location?.endsWith("/admin")) throw new Error("the E2E Admin could not sign in");
  for (const key of ["pm", "hr", "ehs", "approver"]) {
    credentials[key] = await ensureInvited(sessions.admin, ACCOUNTS[key]);
    sessions[key] = new Session();
    const login = await sessions[key].login(credentials[key]);
    if (!login.location?.includes("/app"))
      throw new Error(`${ACCOUNTS[key].email} could not sign in`);
  }
  await ensureFactors(sessions.admin);
  return { sessions, credentials };
}

/**
 * Conversion factors are never seeded (Phase 9): the suite enters labelled synthetic values through the
 * real Admin procedure, only where an activity has no factor at all.
 */
export const SYNTHETIC_FACTORS = [
  ["DIESEL_CONSUMPTION", "Diesel", 2.68, "L"],
  ["GRID_ELECTRICITY", "Grid electricity", 0.71, "kWh"],
  ["RENEWABLE_ELECTRICITY", "Renewable electricity (market-based)", 0, "kWh"],
  ["WASTE_DISPOSED", "Waste disposed", 0.45, "kg"],
  ["BUSINESS_TRAVEL_SPEND", "Business travel spend", 0.00018, "INR"],
];
async function ensureFactors(admin) {
  for (const [activityType, name, value, inputUnit] of SYNTHETIC_FACTORS) {
    const exists = await one(
      sql`select id from public.conversion_factors where activity_type = ${activityType}`,
    );
    if (exists) continue;
    const created = await admin.mutate("factors.create", {
      activityType,
      name: `${name} (synthetic, tests/e2e)`,
      value,
      inputUnit,
      outputUnit: "kgCO2e",
      sourceReference: "SYNTHETIC TEST VALUE — apps/web/tests/e2e, not an authoritative factor",
      effectiveFrom: "2026-01-01",
    });
    if (!ok(created))
      throw new Error(`could not enter the synthetic ${activityType} factor: ${created.error}`);
    await approveSyntheticFactor(admin, created.data.versionId);
  }
}

/**
 * A new factor version is a draft until a Super Admin approves it (migration 0060). The suite's Admin approves its
 * own synthetic value when it is the only Super Admin; where another Super Admin exists (a local database with a
 * second one), the fixture is marked self-approved directly, labelled as the synthetic test value it is.
 */
export async function approveSyntheticFactor(admin, versionId) {
  const approved = await admin.mutate("factors.approve", {
    versionId,
    note: "Synthetic test value (tests/e2e)",
  });
  if (ok(approved)) return;
  if (approved.status !== 403)
    throw new Error(`could not approve a synthetic factor: ${approved.error}`);
  await sql.begin(async (tx) => {
    await tx`
      update public.conversion_factor_versions v
      set status = 'superseded', effective_to = n.effective_from - 1
      from public.conversion_factor_versions n
      where n.id = ${versionId} and v.conversion_factor_id = n.conversion_factor_id and v.status = 'active'
        and v.effective_from < n.effective_from`;
    await tx`
      update public.conversion_factor_versions
      set status = 'active', approved_by = created_by, approved_at = now(), self_approved = true,
          review_note = 'Synthetic test value (tests/e2e fixture)'
      where id = ${versionId} and status = 'draft'`;
  });
}

// --- Documents and the OCR worker -----------------------------------------------------------------------

const PYTHON =
  process.env.E2E_PYTHON ??
  join(WORKER, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
let counter = 0;

/** A synthetic document from apps/ocr-worker/scripts/make_sample_invoice.py. */
export function sample(kind, { reference = `E2E-${RUN}-${++counter}`.toUpperCase(), period } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "traceesg-e2e-"));
  const out = join(dir, "sample.pdf");
  const args = ["scripts/make_sample_invoice.py", "--invoice", reference, "--out", out];
  if (kind !== "diesel") args.push("--kind", kind);
  if (period) args.push("--period", period);
  try {
    execFileSync(PYTHON, args, { cwd: WORKER, stdio: "ignore" });
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A PDF with a valid envelope and no readable content: accepted by upload, fails OCR. */
export const unreadablePdf = (label) =>
  Buffer.from(
    `%PDF-1.4\n% synthetic unreadable ${label} ${RUN}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`,
  );

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** The browser's upload flow: prepare → PUT the bytes to the signed URL → complete. */
export async function upload(
  who,
  bytes,
  fileName,
  {
    orgCode = "PRJ-X",
    metric = "DIESEL_CONSUMPTION",
    mimeType = "application/pdf",
    periodId,
    replacesDocumentId,
  } = {},
) {
  const base = {
    // Omitted = the newest period that takes uploads (migration 0056: several may be open).
    ...(periodId ? { reportingPeriodId: periodId } : {}),
    ...(replacesDocumentId ? { replacesDocumentId } : {}),
    orgUnitId: await orgId(orgCode),
    metricId: await metricId(metric),
    mimeType,
    acknowledgeDuplicates: true,
  };
  const prepared = await who.mutate("documents.prepareUpload", {
    ...base,
    fileSize: bytes.length,
    sha256: sha(bytes),
  });
  if (!ok(prepared) || prepared.data?.status !== "ready") return { prepared };
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([bytes], { type: mimeType }), "upload");
  await fetch(prepared.data.signedUrl, {
    method: "PUT",
    body: form,
    headers: { "x-upsert": "false" },
  });
  const completed = await who.mutate("documents.completeUpload", {
    ...base,
    documentId: prepared.data.documentId,
    reportingPeriodId: prepared.data.reportingPeriodId,
    fileName,
  });
  return { prepared, completed, documentId: ok(completed) ? prepared.data.documentId : undefined };
}

/** One synthetic PDF of several different bills, one page each (ocr-worker/scripts/make_sample_bundle.py). */
export function sampleBundle(kinds, { reference = `E2E-${RUN}-${++counter}`.toUpperCase() } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "traceesg-e2e-"));
  const out = join(dir, "bundle.pdf");
  const args = [
    "scripts/make_sample_bundle.py",
    "--kinds",
    kinds.join(","),
    "--reference",
    reference,
    "--out",
    out,
  ];
  try {
    // PDFium has crashed the generator now and then on a memory-starved Windows machine: try again.
    for (let attempt = 1; ; attempt++) {
      try {
        execFileSync(PYTHON, args, { cwd: WORKER, stdio: "ignore" });
        break;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The browser's flow for a PDF with several bills: prepare, PUT the bytes, complete. */
export async function uploadBundle(who, bytes, fileName, { orgCode = "PRJ-X" } = {}) {
  const base = { orgUnitId: await orgId(orgCode), acknowledgeDuplicates: true };
  const prepared = await who.mutate("bundles.prepareUpload", {
    ...base,
    fileSize: bytes.length,
    sha256: sha(bytes),
  });
  if (!ok(prepared) || prepared.data?.status !== "ready") return { prepared };
  const form = new FormData();
  form.append("cacheControl", "3600");
  form.append("", new Blob([bytes], { type: "application/pdf" }), "upload");
  await fetch(prepared.data.signedUrl, {
    method: "PUT",
    body: form,
    headers: { "x-upsert": "false" },
  });
  const completed = await who.mutate("bundles.completeUpload", {
    ...base,
    documentId: prepared.data.documentId,
    reportingPeriodId: prepared.data.reportingPeriodId,
    fileName,
  });
  return { prepared, completed, documentId: ok(completed) ? prepared.data.documentId : undefined };
}

/**
 * Processes every pending OCR job: the worker image by default (the deployed artefact), or the venv with
 * E2E_WORKER=local.
 */
export async function runWorker() {
  for (let i = 0; i < 20; i++) {
    const { n } = await one(
      sql`select count(*)::int as n from public.ocr_jobs where status = 'pending'`,
    );
    if (n === 0) return;
    runWorkerOnce();
  }
  throw new Error("the OCR queue did not drain");
}
function runWorkerOnce() {
  if (process.env.E2E_WORKER === "local") {
    execFileSync(PYTHON, ["-m", "worker", "--once"], {
      cwd: WORKER,
      stdio: "ignore",
      timeout: 900_000,
    });
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "traceesg-worker-"));
  const envFile = join(dir, "worker.env");
  const api = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  const db = new URL(env.DATABASE_URL);
  api.hostname = "host.docker.internal";
  db.hostname = "host.docker.internal";
  writeFileSync(
    envFile,
    [
      `NEXT_PUBLIC_SUPABASE_URL=${api.origin}`,
      `SUPABASE_SERVICE_ROLE_KEY=${env.SUPABASE_SERVICE_ROLE_KEY}`,
      `SUPABASE_STORAGE_BUCKET_EVIDENCE=${env.SUPABASE_STORAGE_BUCKET_EVIDENCE ?? "evidence"}`,
      `DATABASE_URL=${db.toString()}`,
    ].join("\n"),
  );
  try {
    execFileSync(
      "docker",
      [
        "run",
        "--rm",
        "--env-file",
        envFile,
        process.env.E2E_WORKER_IMAGE ?? "traceesg-ocr-worker",
        "python",
        "-m",
        "worker",
        "--once",
      ],
      { stdio: "ignore", timeout: 900_000 },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Confirms a document's extracted values, choosing a document type first if OCR couldn't. */
export async function confirm(
  who,
  documentId,
  { overrides = {}, acknowledge = [], acknowledgeDuplicate = true } = {},
) {
  let doc = (await who.query("verification.load", { documentId })).data;
  if (!doc) return { status: 404, error: "not loaded" };
  if (!doc.documentTypeId && doc.documentTypeOptions?.length) {
    await who.mutate("verification.setDocumentType", {
      documentId,
      documentTypeId: doc.documentTypeOptions[0].id,
    });
    doc = (await who.query("verification.load", { documentId })).data;
  }
  return who.mutate("verification.confirm", {
    documentId,
    fields: doc.fields.map((f) => ({
      id: f.id,
      value: overrides[f.key] ?? f.verifiedValue ?? f.extractedValue ?? "",
      acknowledged: acknowledge.includes(f.key),
    })),
    acknowledgeDuplicate,
  });
}
