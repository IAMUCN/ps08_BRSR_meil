// Loads the monthly test data (`test data/<Month Year>/bills.json`, made by apps/ocr-worker/scripts/
// make_monthly_data.py) into the app that the env file names, through the app's own screens' procedures.
//
//   node scripts/feed-monthly-data.mjs prepare --env <env file> --app <url> --creds <file>
//   node scripts/feed-monthly-data.mjs feed    --env <env file> --app <url> --creds <file> --months "April 2025,May 2025" --extract synthetic|ocr
//   node scripts/feed-monthly-data.mjs close   --env <env file> --months "April 2025,..."
//
// `prepare` adds what is missing: the two projects the bills are filed under, one account per role and unit
// (a random password each, kept in --creds, which must stay out of git), and one reporting period per month.
// `feed` uploads every bill as its own document by the account that owns it, lets OCR read it (`ocr`: the
// worker running against this database; `synthetic`: values loaded directly, see synthetic_extraction.py),
// confirms the values as that person would, and has the Corporate ESG account approve what calculates.
// `close` closes the fed months' periods. Everything is idempotent: bills already on record are skipped.
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const args = process.argv.slice(3);
const command = process.argv[2];
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const ENV_FILE = opt("env");
const APP = opt("app", "http://localhost:3000");
const CREDS = opt("creds");
const DATA = resolve(opt("data", join(REPO, "test data")));
const EXTRACT = opt("extract", "synthetic");
const IMAGE = opt("image", "traceesg-ocr-worker:latest");
const SCRATCH = opt("scratch", join(REPO, "test data", "_backup"));
const MONTHS = (opt("months", "") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!command || !ENV_FILE)
  throw new Error("usage: feed-monthly-data.mjs <prepare|feed|close> --env <file> ...");

const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
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
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 4, onnotice: () => {} });
console.log(
  `database: ${new URL(env.DATABASE_URL).hostname} | auth: ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host} | app: ${APP}`,
);

// --- The people ---------------------------------------------------------------------------------------

const ROLE_CODE = {
  "Project Manager": "project_manager",
  "EHS - Environment": "ehs",
  HR: "hr",
  Procurement: "procurement",
  "Finance - CSR": "finance_csr",
};
// The generator spells Telangana; the app's own units were typed Telengana. Either is found.
const unitNames = (name) => [
  ...new Set([
    name,
    name.replace("Telangana", "Telengana"),
    name.replace("Telengana", "Telangana"),
  ]),
];
const PROJECTS = [
  { name: "MSRTC e-bus order", parent: "OLECTRA", roles: Object.keys(ROLE_CODE) },
  { name: "BEST Mumbai e-buses", parent: "OLECTRA", roles: Object.keys(ROLE_CODE) },
  { name: "Seetharampur plant, Telengana", parent: "OLECTRA", roles: Object.keys(ROLE_CODE) },
  { name: "TGSRTC Telengana", parent: "EVEY", roles: ["Project Manager"] },
];
const PEOPLE = [
  "Anil Kumar Rao",
  "Sunita Reddy",
  "Mohammed Irfan",
  "Lakshmi Narayanan",
  "Rajesh Varma",
  "Priya Deshmukh",
  "Suresh Babu",
  "Kavitha Menon",
  "Arjun Singh",
  "Deepa Iyer",
  "Vikram Chauhan",
  "Meena Kumari",
  "Naveen Goud",
  "Farida Begum",
  "Sandeep Patil",
  "Anjali Sharma",
  "Ramesh Naidu",
];
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
const newPassword = () => `Feed-${randomBytes(12).toString("hex")}-x!`;

const authAdmin = (path, init = {}) =>
  fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
  });

const readCreds = () => (CREDS && existsSync(CREDS) ? JSON.parse(readFileSync(CREDS, "utf8")) : {});
const writeCreds = (c) => {
  mkdirSync(dirname(CREDS), { recursive: true });
  writeFileSync(CREDS, JSON.stringify(c, null, 2));
};

async function unitId(name) {
  for (const n of unitNames(name)) {
    const [row] =
      await sql`select id from public.org_units where deleted_at is null and lower(name) = lower(${n})`;
    if (row) return { id: row.id, name: n };
  }
  return null;
}

async function prepare() {
  const [boss] = await sql`select u.id from public.users u
     join public.user_org_assignments a on a.user_id = u.id and a.revoked_at is null
     join public.roles r on r.id = a.role_id and r.code = 'admin' where u.deleted_at is null order by u.created_at limit 1`;
  // 1. The projects the bills are filed under.
  for (const p of PROJECTS) {
    if (await unitId(p.name)) continue;
    const [parent] =
      await sql`select id from public.org_units where code = ${p.parent} and deleted_at is null`;
    await sql.begin(async (tx) => {
      const [made] =
        await tx`insert into public.org_units (parent_id, unit_type, name) values (${parent.id}, 'project', ${p.name}) returning id`;
      await tx`insert into public.audit_logs (event_type, entity_type, entity_id, user_id, new_value)
        values ('org_unit.created', 'org_unit', ${made.id}, null, ${tx.json({ name: p.name, parent: p.parent, via: "scripts/feed-monthly-data.mjs (test data)" })})`;
    });
    console.log(`created org unit: ${p.name}`);
  }
  // 2. One account per role and unit, and the approver.
  const creds = readCreds();
  const seats = [
    ...PROJECTS.flatMap((p) => p.roles.map((role) => ({ unit: p.name, role }))),
    { unit: "MEIL", role: "Corporate ESG" },
  ];
  let n = 0;
  for (const seat of seats) {
    const key = `${seat.role}|${seat.unit}`;
    const roleCode = seat.role === "Corporate ESG" ? "corporate_esg" : ROLE_CODE[seat.role];
    const email = `${slug(seat.role)}.${slug(seat.unit === "MEIL" ? "meil" : seat.unit)}@emeilsg.test`;
    const name = seat.role === "Corporate ESG" ? "Anita Verma" : PEOPLE[n++ % PEOPLE.length];
    const password = newPassword();
    let [user] = await sql`select id from public.users where lower(email) = ${email}`;
    if (!user) {
      const r = await authAdmin("users", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { display_name: name },
          app_metadata: { must_change_password: false },
        }),
      });
      const body = await r.json();
      if (!r.ok)
        throw new Error(
          `could not create ${email}: ${r.status} ${JSON.stringify(body).slice(0, 200)}`,
        );
      const unit =
        seat.unit === "MEIL"
          ? {
              id: (
                await sql`select id from public.org_units where code = 'MEIL' and deleted_at is null`
              )[0].id,
            }
          : await unitId(seat.unit);
      await sql.begin(async (tx) => {
        await tx`insert into public.users (id, display_name, email) values (${body.id}, ${name}, ${email})`;
        await tx`insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
                 select ${body.id}, ${unit.id}, r.id, ${boss.id} from public.roles r where r.code = ${roleCode}`;
        await tx`insert into public.audit_logs (event_type, entity_type, entity_id, user_id, new_value)
                 values ('user.provisioned', 'user', ${body.id}, null, ${tx.json({ email, role: roleCode, org_unit: seat.unit, via: "scripts/feed-monthly-data.mjs (test data)" })})`;
      });
      user = { id: body.id };
      console.log(`created account: ${email}`);
    } else if (!creds[key]) {
      const r = await authAdmin(`users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          password,
          email_confirm: true,
          app_metadata: { must_change_password: false },
        }),
      });
      if (!r.ok) throw new Error(`could not set a password for ${email}`);
    } else continue;
    creds[key] = { email, password, userId: user.id };
    writeCreds(creds);
  }
  // 3. One period per month with a folder. Dates are wide while the months are loaded (nothing is late);
  // `close` then sets the real ones.
  for (const dir of monthFolders()) {
    const { label, start, end } = dir;
    const [have] = await sql`select id from public.reporting_periods where label = ${label}`;
    if (have) continue;
    const demo = label === "October 2026";
    await sql`insert into public.reporting_periods
      (label, period_type, start_date, end_date, status, opened_at, submission_opens_on, submission_closes_on, late_uploads_until)
      values (${label}, 'monthly', ${start}, ${end}, 'open', now(), ${start}, ${demo ? "2027-01-31" : "2028-01-31"}, ${demo ? "2027-03-15" : "2028-03-15"})`;
    console.log(`created period: ${label}`);
  }
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
function monthFolders() {
  const out = [];
  const from = [2025, 3];
  for (let i = 0; i < 19; i++) {
    const m = (from[1] + i) % 12;
    const y = from[0] + Math.floor((from[1] + i) / 12);
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const mm = String(m + 1).padStart(2, "0");
    out.push({
      label: `${MONTH_NAMES[m]} ${y}`,
      start: `${y}-${mm}-01`,
      end: `${y}-${mm}-${last}`,
      year: y,
      month: m + 1,
    });
  }
  return out;
}

// --- A signed-in browser session, as the e2e suite's ---------------------------------------------------

class Session {
  jar = new Map();
  constructor(cred) {
    this.cred = cred;
  }
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
  async login() {
    this.jar.clear();
    const page = await this.get("/login");
    const form = page.html.match(/<form[^>]*>([\s\S]*?)<\/form>/)[1];
    const body = new FormData();
    for (const m of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
      const name = m[0].match(/name="([^"]*)"/)?.[1];
      const value = m[0].match(/value="([^"]*)"/)?.[1] ?? "";
      if (name) body.append(name, value.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
    }
    body.append("email", this.cred.email);
    body.append("password", this.cred.password);
    body.append("takeover", "confirm");
    const r = await fetch(`${APP}/login`, {
      method: "POST",
      body,
      redirect: "manual",
      headers: { cookie: this.cookieHeader(), origin: APP },
    });
    this.store(r);
    const loc = r.headers.get("location") ?? "";
    if (!/\/app|\/admin/.test(loc))
      throw new Error(`${this.cred.email} could not sign in (${r.status} ${loc})`);
  }
  async call(method, path, input) {
    for (let attempt = 0; attempt < 3; attempt++) {
      // One sign-in at a time per account: a second concurrent sign-in would end the first (one session each).
      if (!this.jar.size)
        await (this.signingIn ??= this.login().finally(() => (this.signingIn = null)));
      let r;
      if (method === "GET") {
        const qs = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
        r = await fetch(`${APP}/api/trpc/${path}${qs}`, {
          headers: { cookie: this.cookieHeader() },
        });
      } else {
        r = await fetch(`${APP}/api/trpc/${path}`, {
          method: "POST",
          headers: { cookie: this.cookieHeader(), "content-type": "application/json" },
          body: JSON.stringify(input),
        });
      }
      this.store(r);
      const json = await r.json().catch(() => ({}));
      if (r.status === 401) {
        if (this.jar.size) this.jar.clear();
        continue;
      }
      return { status: r.status, data: json.result?.data, error: json.error?.message };
    }
    return { status: 401, error: "could not stay signed in" };
  }
  query(path, input) {
    return this.call("GET", path, input);
  }
  mutate(path, input) {
    return this.call("POST", path, input);
  }
}

const pool = async (items, size, fn) => {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
};

// --- Feeding --------------------------------------------------------------------------------------------

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sessions = new Map();
const sessionFor = (creds, key) => {
  if (!creds[key]) throw new Error(`no account for ${key}; run prepare first`);
  if (!sessions.has(key)) sessions.set(key, new Session(creds[key]));
  return sessions.get(key);
};

async function feedMonth(label, creds) {
  const bills = JSON.parse(readFileSync(join(DATA, label, "bills.json"), "utf8"));
  const [period] = await sql`select id from public.reporting_periods where label = ${label}`;
  if (!period) throw new Error(`no period "${label}"; run prepare first`);
  const metrics = Object.fromEntries(
    (await sql`select id, code from public.esg_metrics`).map((m) => [m.code, m.id]),
  );
  console.log(`\n== ${label}: ${bills.length} bills`);

  // 1. Upload every bill not yet on record.
  const todo = [];
  for (const bill of bills) {
    const unit = await unitId(bill.unit);
    if (!unit) throw new Error(`org unit not found: ${bill.unit}`);
    bill.unitId = unit.id;
    const [have] =
      await sql`select 1 from public.esg_records where reporting_period_id = ${period.id} and org_unit_id = ${unit.id}
      and metric_id = ${metrics[bill.metric]}`;
    if (!have) todo.push(bill);
  }
  console.log(`   ${bills.length - todo.length} already on record, ${todo.length} to upload`);
  const uploaded = [];
  await pool(todo, 6, async (bill) => {
    const session = sessionFor(
      creds,
      `${bill.role}|${bill.unit.replace("Telangana", "Telengana")}`,
    );
    const bytes = readFileSync(join(DATA, bill.feed_file));
    const base = {
      reportingPeriodId: period.id,
      orgUnitId: bill.unitId,
      metricId: metrics[bill.metric],
      mimeType: bill.mime,
      acknowledgeDuplicates: true,
    };
    let prepared;
    for (let wait = 0; wait < 30; wait++) {
      prepared = await session.mutate("documents.prepareUpload", {
        ...base,
        fileSize: bytes.length,
        sha256: sha(bytes),
      });
      // The upload limit (60 per person per 10 minutes) is a real control; wait for the window instead of changing it.
      if (!prepared.error?.includes("Upload limit reached")) break;
      await new Promise((r) => setTimeout(r, 45_000));
    }
    if (prepared.status !== 200 || prepared.data?.status !== "ready") {
      console.log(
        `   ! ${bill.metric} (${bill.unit}): prepare failed: ${prepared.error ?? JSON.stringify(prepared.data).slice(0, 120)}`,
      );
      return;
    }
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", new Blob([bytes], { type: bill.mime }), "upload");
    const put = await fetch(prepared.data.signedUrl, {
      method: "PUT",
      body: form,
      headers: { "x-upsert": "false" },
    });
    if (!put.ok) {
      console.log(`   ! ${bill.metric}: storage ${put.status}`);
      return;
    }
    const fileName = bill.feed_file.split("/").pop();
    const done = await session.mutate("documents.completeUpload", {
      ...base,
      documentId: prepared.data.documentId,
      reportingPeriodId: prepared.data.reportingPeriodId,
      fileName,
    });
    if (done.status !== 200) {
      console.log(`   ! ${bill.metric}: complete failed: ${done.error}`);
      return;
    }
    uploaded.push({ ...bill, documentId: prepared.data.documentId });
  });
  console.log(`   uploaded ${uploaded.length}`);

  // 2. Documents of this month still waiting for an extraction: this run's, and any left by an earlier run.
  const billOf = new Map(bills.map((b) => [`${b.unitId}|${metrics[b.metric]}`, b]));
  const open =
    await sql`select d.id, r.org_unit_id, r.metric_id, r.verification_status::text status from public.documents d
    join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
    join public.esg_records r on r.id = erd.esg_record_id
    where r.reporting_period_id = ${period.id} and r.verification_status in ('document_uploaded', 'ocr_completed') and d.deleted_at is null`;
  const known = open
    .map((o) => ({
      ...billOf.get(`${o.org_unit_id}|${o.metric_id}`),
      documentId: o.id,
      status: o.status,
    }))
    .filter((o) => o.metric);
  const pending = known.filter((o) => o.status === "document_uploaded");
  if (EXTRACT === "synthetic" && pending.length) {
    const dir = join(SCRATCH, "synthetic-job");
    mkdirSync(dir, { recursive: true });
    copyFileSync(
      join(REPO, "apps", "ocr-worker", "scripts", "synthetic_extraction.py"),
      join(dir, "synthetic_extraction.py"),
    );
    writeFileSync(
      join(dir, "jobs.json"),
      JSON.stringify(
        pending.map((p) => ({
          document_id: p.documentId,
          document_type: p.document_type,
          fields: p.fields,
        })),
      ),
    );
    const dbUrl = env.DATABASE_URL.replace(/@(127\.0\.0\.1|localhost)/, "@host.docker.internal");
    const run = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${dir.replace(/\\/g, "/")}:/jobs`,
        "-e",
        `DATABASE_URL=${dbUrl}`,
        "-e",
        "JOBS_FILE=/jobs/jobs.json",
        "--entrypoint",
        "python",
        IMAGE,
        "/jobs/synthetic_extraction.py",
      ],
      { encoding: "utf8", timeout: 600_000 },
    );
    console.log(`   extraction (direct): ${(run.stdout || run.stderr || "").trim().slice(0, 200)}`);
  } else if (EXTRACT === "ocr" && pending.length) {
    const ids = pending.map((p) => p.documentId);
    const started = Date.now();
    for (;;) {
      const [left] =
        await sql`select count(*)::int n from public.ocr_jobs where document_id = any(${ids}) and status in ('pending', 'processing')`;
      process.stdout.write(
        `\r   OCR: ${ids.length - left.n}/${ids.length} read (${Math.round((Date.now() - started) / 60000)} min)   `,
      );
      if (left.n === 0) break;
      if (Date.now() - started > 4 * 3600_000) throw new Error("OCR did not finish in 4 hours");
      await new Promise((r) => setTimeout(r, 15_000));
    }
    console.log();
  }

  // 3. Confirm what each person would confirm: the values printed on the bill.
  const byDoc = new Map(known.map((u) => [u.documentId, u]));
  const confirmSet = new Set(known.map((o) => o.documentId));
  const readyToConfirm = new Set(
    (
      await sql`select d.id from public.documents d
    join public.esg_record_documents erd on erd.document_id = d.id and erd.is_primary
    join public.esg_records r on r.id = erd.esg_record_id
    where r.reporting_period_id = ${period.id} and r.verification_status = 'ocr_completed' and d.deleted_at is null`
    ).map((x) => x.id),
  );
  const stats = { confirmed: 0, failed: 0 };
  await pool(
    [...confirmSet].filter((id) => readyToConfirm.has(id) && byDoc.has(id)),
    6,
    async (documentId) => {
      const bill = byDoc.get(documentId);
      const session = sessionFor(
        creds,
        `${bill.role}|${bill.unit.replace("Telangana", "Telengana")}`,
      );
      let doc = (await session.query("verification.load", { documentId })).data;
      if (!doc) {
        stats.failed++;
        console.log(`   ! ${bill.metric}: could not load the verify screen`);
        return;
      }
      if (!doc.documentTypeId && doc.documentTypeOptions?.length) {
        const wanted =
          doc.documentTypeOptions.find((o) => o.code === bill.document_type) ??
          doc.documentTypeOptions[0];
        await session.mutate("verification.setDocumentType", {
          documentId,
          documentTypeId: wanted.id,
        });
        doc = (await session.query("verification.load", { documentId })).data;
      }
      const result = await session.mutate("verification.confirm", {
        documentId,
        fields: doc.fields.map((f) => ({
          id: f.id,
          value: bill.fields[f.key] ?? f.verifiedValue ?? f.extractedValue ?? "",
          acknowledged: true,
        })),
        acknowledgeDuplicate: true,
      });
      if (result.status === 200) stats.confirmed++;
      else {
        stats.failed++;
        console.log(`   ! ${bill.metric} (${bill.unit}): confirm failed: ${result.error}`);
      }
    },
  );
  console.log(`   confirmed ${stats.confirmed}, failed ${stats.failed}`);

  // 4. The Corporate ESG account approves what is waiting in this period and has a number.
  const approver = sessionFor(creds, "Corporate ESG|MEIL");
  const queue = (await approver.query("approvals.queue")).data ?? [];
  const mine = new Set(
    (await sql`select id from public.esg_records where reporting_period_id = ${period.id}`).map(
      (r) => r.id,
    ),
  );
  const ready = queue.filter(
    (q) =>
      mine.has(q.recordId) && !q.selfApproval && (!q.requiresCalculation || q.calculation?.trace),
  );
  let approved = 0;
  await pool(ready, 4, async (row) => {
    const r = await approver.mutate("approvals.decide", {
      recordId: row.recordId,
      decision: "approve",
    });
    if (r.status === 200) approved++;
    else console.log(`   ! approve ${row.metricName}: ${r.error}`);
  });
  const byStatus =
    await sql`select approval_status::text s, data_quality_state::text q, count(*)::int n from public.esg_records where reporting_period_id = ${period.id} group by 1, 2 order by 1, 2`;
  console.log(
    `   approved ${approved}; ${label} now: ${byStatus.map((b) => `${b.s}/${b.q} ${b.n}`).join(", ")}`,
  );
}

async function close() {
  const all = monthFolders();
  for (const label of MONTHS) {
    const m = all.find((x) => x.label === label);
    const [due] = [new Date(Date.UTC(m.year, m.month - 1 + 1, 15)).toISOString().slice(0, 10)];
    const late = new Date(Date.UTC(m.year, m.month - 1 + 2, 15)).toISOString().slice(0, 10);
    await sql.begin(async (tx) => {
      await tx`update public.reporting_periods set status = 'closed', closed_at = now() where label = ${label} and status = 'open'`;
      await tx`update public.reporting_periods set submission_closes_on = ${due}, late_uploads_until = ${late} where label = ${label}`;
      await tx`insert into public.audit_logs (event_type, entity_type, entity_id, user_id, new_value)
               select 'period.closed', 'reporting_period', id, null, ${tx.json({ label, via: "scripts/feed-monthly-data.mjs (test data)" })}
               from public.reporting_periods where label = ${label}`;
    });
    console.log(`closed ${label} (due ${due}, late until ${late})`);
  }
}

try {
  if (command === "prepare") await prepare();
  else if (command === "feed") {
    const creds = readCreds();
    for (const label of MONTHS) await feedMonth(label, creds);
  } else if (command === "close") await close();
  else throw new Error(`unknown command ${command}`);
} finally {
  await sql.end();
}
