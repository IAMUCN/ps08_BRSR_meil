// The owner's feedback list of 2026-11-01 through the running app (migration 0053;
// .grill/org-tree-users-notifications-periods-decisions.md): reporting periods that close by themselves,
// corrections to invited people, role code messages, notification pop-ups and the org-tree selector.
//
// Needs what invitations-sessions.mjs needs: a browser, and the app started with EMAIL_SMTP_HOST=127.0.0.1 and
// EMAIL_SMTP_PORT=55325 so its email reaches the local mail catcher. Screenshots go to E2E_SCREENSHOTS if set.
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  APP,
  RUN,
  WEB,
  check,
  env,
  finish,
  ok,
  one,
  orgId,
  rejected,
  roleId,
  section,
  Session,
  setup,
  sql,
  userId,
} from "./lib.mjs";

const puppeteer = createRequire(`${WEB}/package.json`)("puppeteer-core");
const MAIL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:55324";
const SHOTS = process.env.E2E_SCREENSHOTS;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { sessions, credentials } = await setup();
const { admin, pm } = sessions;
const PM = await roleId("project_manager");
const PRJ_X = await orgId("PRJ-X");
const sha = "a".repeat(64);

async function mailCount(address) {
  const list = await fetch(
    `${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
  ).then((r) => r.json());
  return (list.messages ?? []).length;
}

// --- Reporting periods ------------------------------------------------------------------------------------
section("Reporting periods close by themselves");

const [seeded] = await sql`
  select id, label, submission_closes_on::text as closes from public.reporting_periods where status = 'open'`;
check("a period is open to begin with", !!seeded);
const options = await pm.query("documents.uploadOptions");
check("before its deadline the period takes uploads", options.data?.openPeriod?.id === seeded.id);

// The deadline passes; the job has not run yet. Uploads check the date themselves.
await sql`
  update public.reporting_periods
  set submission_closes_on = (now() at time zone 'Asia/Kolkata')::date - 1
  where id = ${seeded.id}`;
const past = await pm.query("documents.uploadOptions");
check(
  "past its deadline, uploads see no period even before the job runs",
  past.data?.openPeriod === null,
);
const anyMetric = await one(
  sql`select id from public.esg_metrics where code = 'DIESEL_CONSUMPTION'`,
);
const refused = await pm.mutate("documents.prepareUpload", {
  orgUnitId: PRJ_X,
  metricId: anyMetric.id,
  fileName: "late.pdf",
  mimeType: "application/pdf",
  fileSize: 1000,
  sha256: sha,
});
check("a late upload is refused", rejected(refused), refused.error);

const someRecord = await one(sql`
  select r.id from public.esg_records r
  where r.reporting_period_id = ${seeded.id} and r.org_unit_id = ${PRJ_X}
    and r.approval_status::text <> 'approved' and r.data_quality_state::text <> 'rejected' limit 1`);
if (someRecord) {
  const evidence = await pm.mutate("documents.prepareSupporting", {
    recordId: someRecord.id,
    mimeType: "application/pdf",
    fileSize: 1000,
    sha256: sha,
  });
  check(
    "new evidence on a record of a closed period is refused",
    rejected(evidence, "closed"),
    evidence.error,
  );
}

await sql`select public.close_expired_reporting_periods()`;
const closed = await one(
  sql`select status::text from public.reporting_periods where id = ${seeded.id}`,
);
check("the job closes it", closed.status === "closed");
const audit = await one(sql`
  select new_value, user_id from public.audit_logs
  where entity_id = ${seeded.id} and event_type = 'reporting_period.closed_automatically'
  order by created_at desc limit 1`);
check("as a system event in the audit trail", audit && audit.user_id === null);
const told = await one(sql`
  select count(*)::int as n from public.notifications n
  where n.related_entity_id = ${seeded.id} and n.type = 'period_closed'
    and n.user_id = ${await userId(credentials.admin.email)}`);
check("a Super Admin is told", told.n >= 1);
const pmTold = await one(sql`
  select count(*)::int as n from public.notifications n
  where n.related_entity_id = ${seeded.id} and n.type = 'period_closed'
    and n.user_id = ${await userId(credentials.pm.email)}`);
check("a Project Manager is not", pmTold.n === 0);

const listed = await admin.query("reportingPeriods.list");
const row = listed.data?.find((p) => p.id === seeded.id);
check(
  "the list shows it closed with its deadline passed",
  row?.status === "closed" && row.deadlinePassed,
);

const noDate = await admin.mutate("reportingPeriods.transition", {
  id: seeded.id,
  to: "open",
  reason: "Late bills",
});
check(
  "reopening without a new close date is refused",
  rejected(noDate, "new submissions close date"),
  noDate.error,
);
const oldDate = await admin.mutate("reportingPeriods.transition", {
  id: seeded.id,
  to: "open",
  reason: "Late bills",
  newClosesOn: "2020-01-01",
});
check(
  "a new close date in the past is refused",
  rejected(oldDate, "today or later"),
  oldDate.error,
);
const reopened = await admin.mutate("reportingPeriods.transition", {
  id: seeded.id,
  to: "open",
  reason: "Late bills",
  newClosesOn: "2099-12-31",
});
check("reopening with a new close date works", ok(reopened), reopened.error);
await sql`select public.close_expired_reporting_periods()`;
const stays = await one(sql`
  select status::text, submission_closes_on::text as closes
  from public.reporting_periods where id = ${seeded.id}`);
check("and it stays open", stays.status === "open" && stays.closes === "2099-12-31");
const reopenAudit = await one(sql`
  select new_value, reason from public.audit_logs
  where entity_id = ${seeded.id} and event_type = 'reporting_period.reopened'
  order by created_at desc limit 1`);
check(
  "the audit trail holds the reason and the new date",
  reopenAudit?.reason === "Late bills" &&
    reopenAudit?.new_value?.submission_closes_on === "2099-12-31",
);

// --- Invited people ---------------------------------------------------------------------------------------
section("Correcting someone invited");

const typo = `fb.typo.${RUN}@traceesg.test`;
const fixed = `fb.fixed.${RUN}@traceesg.test`;
const invited = await admin.mutate("users.invite", {
  email: typo,
  displayName: "Tpyo Person",
  roleId: PM,
  orgUnitId: PRJ_X,
});
check("someone is invited", ok(invited), invited.error);
const id = invited.data?.id;
const liveLinks = () => sql`
  select id from public.user_invitations
  where user_id = ${id} and consumed_at is null and revoked_at is null`;
const [firstLink] = await liveLinks();

const nameOnly = await admin.mutate("users.updateInvited", {
  userId: id,
  displayName: "Typo Person",
  email: typo,
});
check(
  "the name can be corrected",
  ok(nameOnly) && nameOnly.data?.emailChanged === false,
  nameOnly.error,
);
const [sameLink] = await liveLinks();
check("a name change leaves the link alone", sameLink?.id === firstLink?.id);

const taken = await admin.mutate("users.updateInvited", {
  userId: id,
  displayName: "Typo Person",
  email: credentials.pm.email,
});
check("an address already in use is refused", rejected(taken, "already exists"), taken.error);

const changed = await admin.mutate("users.updateInvited", {
  userId: id,
  displayName: "Typo Person",
  email: fixed,
});
check(
  "the email can be corrected",
  ok(changed) && changed.data?.emailChanged === true,
  changed.error,
);
check("the new link's email was sent", changed.data?.emailSent === true, changed.data?.emailError);
check("a new link goes to the new address", (await mailCount(fixed)) === 1);
const links = await liveLinks();
check(
  "only one link is live, and it is a new one",
  links.length === 1 && links[0].id !== firstLink?.id,
);
const records = await one(sql`
  select u.email as profile, a.email as signin, u.display_name
  from public.users u join auth.users a on a.id = u.id where u.id = ${id}`);
check(
  "the profile and the sign-in record agree",
  records.profile === fixed && records.signin === fixed && records.display_name === "Typo Person",
);
const dupes = await one(
  sql`select count(*)::int as n from auth.users where email in (${typo}, ${fixed})`,
);
check("no second account appeared", dupes.n === 1);

const active = await admin.mutate("users.updateInvited", {
  userId: await userId(credentials.pm.email),
  displayName: "Changed",
  email: credentials.pm.email,
});
check("someone already active cannot be edited", rejected(active), active.error);
const denied = await pm.mutate("users.updateInvited", {
  userId: id,
  displayName: "Nope",
  email: fixed,
});
check("nor can someone without the right to manage users", rejected(denied), denied.error);

// --- Role codes -------------------------------------------------------------------------------------------
section("Role codes");

const roleCode = `fb_${RUN}`.toLowerCase();
const made = await admin.mutate("roles.create", {
  code: roleCode,
  name: "Feedback",
  description: "",
});
check("a good code is accepted", ok(made), made.error);
const twice = await admin.mutate("roles.create", {
  code: roleCode,
  name: "Feedback",
  description: "",
});
check("the same code twice is refused in words", rejected(twice, "This role code already exists."));
await admin.mutate("roles.delete", { roleId: made.data?.id });
const badCode = await admin.mutate("roles.create", { code: "Bad", name: "X", description: "" });
check("the server refuses a bad code", badCode.status === 400);

// --- Notifications ----------------------------------------------------------------------------------------
section("Notification pop-ups");

const pmId = await userId(credentials.pm.email);
const notify = (title) => sql`
  insert into public.notifications (user_id, type, title, message, deep_link_path)
  values (${pmId}, 'approved', ${title}, 'A short description.', '/app/submissions')`;
const poll = () => pm.mutate("notifications.poll", { sweep: false });

await poll();
const quiet = await poll();
check("nothing new, nothing pops up", quiet.data?.fresh.total === 0);
await notify("One");
const one1 = await poll();
check(
  "a new one pops up once",
  one1.data?.fresh.total === 1 && one1.data.fresh.items[0].title === "One",
);
const again = await poll();
check("and never again", again.data?.fresh.total === 0);
const elsewhere = new Session();
await elsewhere.login(credentials.pm);
const otherDevice = await elsewhere.mutate("notifications.poll", { sweep: false });
check("not on another device either", otherDevice.data?.fresh.total === 0);
for (const t of ["A", "B", "C", "D", "E"]) await notify(t);
const burst = await poll();
check("five waiting come as a count", burst.data?.fresh.total === 5);
await notify("Read already");
await sql`update public.notifications set is_read = true where user_id = ${pmId} and title = 'Read already'`;
const readOne = await poll();
check("a read one does not pop up", readOne.data?.fresh.total === 0);
const adminPoll = await admin.mutate("notifications.poll", { sweep: false });
check("each account has its own", !adminPoll.data?.fresh.items.some((i) => i.title === "One"));
const marked = await pm.mutate("notifications.markAllRead");
const after = await poll();
check("mark all read clears the dot", ok(marked) && after.data?.hasUnread === false);

// --- In a browser -----------------------------------------------------------------------------------------
section("In a browser");

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`) });
};
async function signedIn({ email, password }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP}/login`, { waitUntil: "networkidle0" });
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 30_000 });
  return page;
}
const clickText = (page, selector, text) =>
  page.evaluate(
    (s, t) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t));
      el?.click();
      return !!el;
    },
    selector,
    text,
  );
const hasText = (page, text) => page.evaluate((t) => document.body.innerText.includes(t), text);
const exists = (page, selector) =>
  page.evaluate((s) => document.querySelector(s) !== null, selector);
const POPOVER = '[data-slot="popover-content"], [role="dialog"]';
const popoverButtons = '[data-slot="popover-content"] button, [role="dialog"] button';

const adminPage = await signedIn(credentials.admin);
const errors = [];
adminPage.on("pageerror", (e) => errors.push(String(e)));

// A shared unit, for both views of the selection.
const stamp = RUN.toUpperCase();
const subB = await admin.mutate("organization.create", {
  parentId: await orgId("MEIL"),
  alsoUnder: [],
  unitType: "subsidiary",
  name: `FB Subsidiary ${stamp}`,
  code: "",
});
const sharedUnit = await admin.mutate("organization.create", {
  parentId: await orgId("SUB-A"),
  alsoUnder: [subB.data?.id],
  unitType: "project",
  name: `FB Shared ${stamp}`,
  code: "",
});
check("a shared unit exists for the check", ok(sharedUnit), sharedUnit.error);

await adminPage.goto(`${APP}/admin/organization`, { waitUntil: "networkidle0" });
const sharedName = `FB Shared ${stamp}`;
const tag = await adminPage.evaluate(() => {
  const el = [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "Shared",
  );
  return el ? getComputedStyle(el).boxShadow : null;
});
check("the Shared tag no longer glows", tag !== null && !/ [1-9]\d*(\.\d+)?px/.test(tag), tag);
const sharedRows = () =>
  adminPage.evaluate(
    (name) =>
      [...document.querySelectorAll('[id^="org-row-"]')]
        .filter((e) => e.textContent.includes(name))
        .map((e) => ({
          id: e.id,
          full: /(^|\s)bg-table-row-hover(\s|$)/.test(e.className),
          light: e.className.includes("bg-table-row-hover/50"),
        })),
    sharedName,
  );
const rows = await sharedRows();
check("the shared unit is drawn under both parents", rows.length === 2);
await adminPage.evaluate(
  (rowId, name) => {
    [...document.getElementById(rowId).querySelectorAll("button")]
      .find((b) => b.textContent.includes(name))
      .click();
  },
  rows[0].id,
  sharedName,
);
await adminPage.waitForFunction(
  (name) => document.getElementById("node-heading")?.textContent === name,
  { timeout: 15_000 },
  sharedName,
);
const looks = await sharedRows();
check(
  "selected, it is highlighted under both: one fully, one lightly",
  looks.filter((l) => l.full).length === 1 && looks.filter((l) => l.light).length === 1,
  JSON.stringify(looks),
);
await shot(adminPage, "org-shared-selected");

const nameShown = () =>
  adminPage.evaluate(() => document.getElementById("node-name")?.offsetParent !== null);
check("the rename boxes are hidden until Edit", !(await nameShown()));
await clickText(adminPage, "button", "Edit name and code");
await sleep(200);
check("Edit shows them, filled in", await nameShown());
await clickText(adminPage, "button", "Cancel");

check("Expected Submissions opens with a tree selector", await exists(adminPage, "#expected-unit"));
await adminPage.click("#expected-unit");
await sleep(300);
await shot(adminPage, "org-expected-tree");
const marks = await adminPage.evaluate(
  (s) => [...document.querySelectorAll(s)].filter((b) => b.getAttribute("aria-current")).length,
  popoverButtons,
);
check("it marks the shared unit in both places", marks === 2, String(marks));
await clickText(adminPage, popoverButtons, "Subsidiary A");
await adminPage.waitForFunction(
  () => document.getElementById("node-heading")?.textContent === "Subsidiary A",
  { timeout: 15_000 },
);
check("choosing from it moves the page to that unit", adminPage.url().includes("node="));

for (const path of ["/admin/data-explorer", "/admin/submissions"]) {
  await adminPage.goto(`${APP}${path}`, { waitUntil: "networkidle0" });
  check(`${path} has no organization dropdown`, !(await exists(adminPage, "select#f-org")));
  await adminPage.click("#f-org");
  await sleep(300);
  await shot(adminPage, `tree${path.replaceAll("/", "-")}`);
  // Project X sits inside Subsidiary A, whose branch starts closed.
  await adminPage.evaluate((s) => {
    [...document.querySelectorAll(s)]
      .find((b) => b.getAttribute("aria-label") === "Expand Subsidiary A")
      ?.click();
  }, popoverButtons);
  await sleep(150);
  check(
    `${path}: expanding a branch shows the units in it`,
    await clickText(adminPage, popoverButtons, "Project X"),
  );
  await adminPage.waitForFunction(() => location.search.includes("org="), { timeout: 15_000 });
  await sleep(500);
  check(
    `${path}: choosing one filters the page`,
    await adminPage.evaluate(() =>
      document.getElementById("f-org").textContent.includes("Project X"),
    ),
  );
}

// A scoped view: an Administrator of Subsidiary A.
const scopedEmail = `fb.scoped.${RUN}@traceesg.test`;
const scoped = await admin.mutate("users.invite", {
  email: scopedEmail,
  displayName: "FB Scoped",
  roleId: await roleId("org_admin"),
  orgUnitId: await orgId("SUB-A"),
});
check("an Administrator of Subsidiary A exists", ok(scoped), scoped.error);
const scopedPassword = `Fb-${RUN}-Scoped-Pass!9`;
await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${scoped.data?.id}`, {
  method: "PUT",
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ password: scopedPassword, email_confirm: true }),
});
const scopedPage = await signedIn({ email: scopedEmail, password: scopedPassword });
await scopedPage.goto(`${APP}/admin/data-explorer`, { waitUntil: "networkidle0" });
await scopedPage.click("#f-org");
await sleep(300);
const scopedTree = await scopedPage.evaluate(
  (s) => document.querySelector(s)?.innerText ?? "",
  POPOVER,
);
check(
  "the Administrator's tree starts at their unit",
  scopedTree.includes("Subsidiary A") && scopedTree.includes("Project X"),
);
check("MEIL above them is left out", !scopedTree.includes("MEIL"));
check("the sibling subsidiary is left out", !scopedTree.includes(`FB Subsidiary ${stamp}`));
await shot(scopedPage, "tree-scoped");

// Roles: the red message under the field.
await adminPage.goto(`${APP}/admin/roles`, { waitUntil: "networkidle0" });
await clickText(adminPage, "button", "Create role");
await adminPage.waitForSelector("#role-code");
await adminPage.type("#role-code", "BadCode");
await sleep(150);
check(
  "uppercase shows the message at once",
  await hasText(adminPage, "Uppercase letters are not allowed."),
);
const invalid = () =>
  adminPage.evaluate(() => {
    const e = document.getElementById("role-code");
    return e.getAttribute("aria-invalid") === "true" && e.className.includes("border-status-error");
  });
check("the field is marked invalid", await invalid());
await shot(adminPage, "role-code-error");
for (let i = 0; i < "BadCode".length; i++) await adminPage.keyboard.press("Backspace");
await adminPage.keyboard.type("good_code");
await sleep(150);
check("correcting it clears the mark", !(await invalid()));

// The pop-up.
await adminPage.goto(`${APP}/admin`, { waitUntil: "networkidle0" });
await sleep(1500); // the first check has claimed anything waiting
const adminId = await userId(credentials.admin.email);
const started = Date.now();
await sql`
  insert into public.notifications (user_id, type, title, message, deep_link_path)
  values (${adminId}, 'report_ready', ${`Pop-up ${stamp}`}, 'A short description.', '/admin/reports')`;
await adminPage.waitForFunction(
  (t) => document.body.innerText.includes(t),
  { timeout: 12_000 },
  `Pop-up ${stamp}`,
);
check(
  "a new notification pops up within the check interval",
  Date.now() - started < 8_000,
  `${Date.now() - started} ms`,
);
check("with its description", await hasText(adminPage, "A short description."));
await sleep(700);
await shot(adminPage, "toast");
const UNREAD = 'button[aria-label="Notifications, unread items"]';
check("the red dot still shows", await exists(adminPage, UNREAD));
await adminPage.reload({ waitUntil: "networkidle0" });
await sleep(1500);
const toastAfterReload = await adminPage.evaluate(
  (t) =>
    [...document.querySelectorAll("[data-sonner-toast]")].some((e) => e.textContent.includes(t)),
  `Pop-up ${stamp}`,
);
check("a reload does not bring it back", !toastAfterReload);

// While away: a hidden tab does not check; on return, what arrived pops up.
await adminPage.click(UNREAD);
await sleep(300);
check("the bell offers Mark all read", await hasText(adminPage, "Mark all read"));
await shot(adminPage, "bell");
await clickText(adminPage, "button", "Mark all read");
await adminPage.waitForSelector('button[aria-label="Notifications"]', { timeout: 10_000 });
check("marking them clears the dot at once", !(await exists(adminPage, UNREAD)));
const left = await one(
  sql`select count(*)::int as n from public.notifications where user_id = ${adminId} and not is_read`,
);
check("and it is saved", left.n === 0);
check("and the button goes", !(await hasText(adminPage, "Mark all read")));

check("no page error along the way", errors.length === 0, errors.join(" | ").slice(0, 300));

await browser.close();
await finish();
