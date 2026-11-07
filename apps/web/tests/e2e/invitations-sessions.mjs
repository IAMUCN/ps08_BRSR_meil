// Invitation links and session time limits through the running app (migrations 0051 and 0052;
// .grill/scoped-admin-onboarding-decisions.md, stages 2 and 3).
//
// Invitations: the real procedures over HTTP, the real email read back from the local mail catcher, and the
// real page in a browser (the token travels after the "#", so only a browser can follow a link).
// Sessions: real sign-ins; time is moved by changing the session's own row, never the app's code.
//
// Besides what the suite always needs: a browser (CHROMIUM_EXECUTABLE_PATH in the env file), and the app
// started with EMAIL_SMTP_HOST=127.0.0.1 and EMAIL_SMTP_PORT=55325 so its email reaches the local mail
// catcher (http://127.0.0.1:55324; E2E_MAILPIT_URL overrides).
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  APP,
  RUN,
  WEB,
  check,
  ensureInvited,
  env,
  finish,
  ok,
  one,
  orgId,
  rejected,
  roleId,
  section,
  Session,
  TAKEOVER_QUESTION,
  setup,
  sql,
  userId,
} from "./lib.mjs";

const puppeteer = createRequire(`${WEB}/package.json`)("puppeteer-core");
const MAIL = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:55324";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const GOOD_PASSWORD = `Chosen-${RUN}-Pass!9`;

const { sessions, credentials } = await setup();
const { admin } = sessions;
const PM = await roleId("project_manager");
const PRJ_X = await orgId("PRJ-X");
const SUB_A = await orgId("SUB-A");

// --- Helpers ----------------------------------------------------------------------------------------------

/** The newest email to this address, waited for; null when none arrives. */
async function mailTo(address, { after = 0 } = {}) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const list = await fetch(
      `${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
    ).then((r) => r.json());
    const newest = (list.messages ?? [])
      .filter((m) => new Date(m.Created).getTime() > after)
      .sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
    if (newest) return fetch(`${MAIL}/api/v1/message/${newest.ID}`).then((r) => r.json());
    await sleep(250);
  }
  return null;
}
const linkIn = (mail) =>
  `${mail?.HTML ?? ""} ${mail?.Text ?? ""}`.match(
    /https?:\/\/[^\s"<]+\/invite#[A-Za-z0-9_-]{43}/,
  )?.[0];
const tokenOf = (link) => link?.split("#")[1];
// The stored hash of an account's password: it changes when, and only when, a password is set.
const passwordHash = async (id) =>
  (await one(sql`select encrypted_password from auth.users where id = ${id}`))?.encrypted_password;

const invitationsOf = (id) =>
  sql`select id, token_hash, expires_at, consumed_at, revoked_at, created_by, created_at
      from public.user_invitations where user_id = ${id} order by created_at`;
const rowOf = async (email) =>
  (await admin.query("users.list")).data.find((u) => u.email === email);

async function invite(label, { org = PRJ_X, by = admin } = {}) {
  const email = `e2e.invite.${label}.${RUN}@traceesg.test`;
  const sentAfter = Date.now() - 1000;
  const result = await by.mutate("users.invite", {
    email,
    displayName: `E2E Invitee ${label}`,
    roleId: PM,
    orgUnitId: org,
  });
  if (!ok(result)) return { email, result };
  const mail = await mailTo(email, { after: sentAfter });
  const link = linkIn(mail);
  const id = result.data.id;
  return { email, result, id, mail, link, token: tokenOf(link), hash: await passwordHash(id) };
}

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
/** A page in a context of its own: no cookies shared with any other. */
async function freshPage() {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  return page;
}
const textOf = (page) => page.evaluate(() => document.body.innerText);
async function openLink(page, link) {
  await page.goto("about:blank");
  await page.goto(link, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !document.body.innerText.includes("Checking your link"), {
    timeout: 15_000,
  });
}
async function submitPassword(page, password, confirmation = password) {
  for (const [selector, value] of [
    ["#invite-password", password],
    ["#invite-confirm-password", confirmation],
  ]) {
    await page.$eval(selector, (el) => (el.value = ""));
    await page.click(selector, { clickCount: 3 });
    await page.keyboard.press("Backspace");
    await page.type(selector, value);
  }
  await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((b) => /set password/i.test(b.textContent))
      .click(),
  );
}
const authCookies = async (page) =>
  (await page.browserContext().cookies()).filter((c) => /^sb-.*auth-token/.test(c.name));

await fetch(`${MAIL}/api/v1/messages`, { method: "DELETE" });
await sql`delete from public.rate_limit_events`;

// ============================================================================================================
section("An invitation is a link, not a password");
// ============================================================================================================
const first = await invite("first");
check("Invite user creates the account", ok(first.result), first.result.error);
check(
  "the answer carries no password and no token",
  JSON.stringify(Object.keys(first.result.data ?? {}).sort()) ===
    JSON.stringify(["emailSent", "id"].sort()) ||
    JSON.stringify(Object.keys(first.result.data ?? {}).sort()) ===
      JSON.stringify(["emailError", "emailSent", "id"].sort()),
  JSON.stringify(Object.keys(first.result.data ?? {})),
);
check("the invitation was emailed", first.result.data?.emailSent === true && Boolean(first.mail));
check("the email holds a link of the form /invite#token", Boolean(first.link), first.mail?.Text);
check(
  "the link points at this app",
  first.link?.startsWith(`${env.NEXT_PUBLIC_APP_URL ?? APP}/invite#`),
  first.link?.split("#")[0],
);
check(
  "the email contains no password",
  !/temporary password|password:/i.test(`${first.mail?.HTML} ${first.mail?.Text}`),
);

let rows = await invitationsOf(first.id);
check("one invitation is stored", rows.length === 1);
check(
  "what is stored is the SHA-256 of the token, not the token",
  rows[0]?.token_hash === sha256(first.token ?? "") && rows[0]?.token_hash !== first.token,
);
const hours = (new Date(rows[0]?.expires_at) - new Date(rows[0]?.created_at)) / 3_600_000;
check("it is valid for 24 hours", Math.abs(hours - 24) < 0.01, `${hours}`);
check(
  "it records who issued it",
  rows[0]?.created_by === (await userId("e2e.admin@traceesg.test")),
);
const audit = await one(sql`
  select new_value::text as v from public.audit_logs
  where event_type = 'user.invited' and entity_id = ${first.id}`);
check(
  "the audit entry holds neither the token nor its hash",
  Boolean(audit) && !audit.v.includes(first.token) && !audit.v.includes(rows[0].token_hash),
);
const guess = await new Session().login({ email: first.email, password: GOOD_PASSWORD });
check("nobody can sign in to it before a password is chosen", !guess.location?.includes("/app"));
let listed = await rowOf(first.email);
check(
  "Users shows it as Invited with a link pending",
  listed?.status === "invited" && listed?.invitation?.state === "pending",
  JSON.stringify(listed?.invitation),
);

// ============================================================================================================
section("Opening the link changes nothing");
// ============================================================================================================
for (const path of ["/invite", `/invite?token=${first.token}`, `/invite/${first.token}`]) {
  await fetch(`${APP}${path}`, { redirect: "manual" });
}
rows = await invitationsOf(first.id);
check(
  "a plain request for the page (a mail scanner, a link preview) uses nothing up",
  rows.length === 1 && !rows[0].consumed_at && !rows[0].revoked_at,
);
const page = await freshPage();
await openLink(page, first.link);
check(
  "the page shows the form for the invited address",
  (await textOf(page)).includes(first.email),
);
check(
  "it has exactly the two password fields",
  (await page.$$eval('input[type="password"], #invite-password, #invite-confirm-password', (els) =>
    [...new Set(els.map((e) => e.id))].sort().join(","),
  )) === "invite-confirm-password,invite-password",
);
check("the token has left the address bar", !page.url().includes(first.token), page.url());
check(
  "the page does not send a referrer",
  (await page.$eval('meta[name="referrer"]', (m) => m.content).catch(() => "")) === "no-referrer",
);
rows = await invitationsOf(first.id);
check("showing the form does not use the link up either", !rows[0].consumed_at);
check("and signs nobody in", (await authCookies(page)).length === 0);

// ============================================================================================================
section("The password is checked on the server; a refused one does not spend the link");
// ============================================================================================================
await submitPassword(page, "short");
await page.waitForSelector("#invite-error");
check(
  "a weak password is refused",
  /at least|character|uppercase|number/i.test(await textOf(page)),
);
await submitPassword(page, GOOD_PASSWORD, `${GOOD_PASSWORD}x`);
await page.waitForFunction(() => /do not match/i.test(document.body.innerText));
check("two different entries are refused", true);
rows = await invitationsOf(first.id);
check("the link is still unused after both", !rows[0].consumed_at);

// ============================================================================================================
section("Resend replaces the link; the old one is dead");
// ============================================================================================================
const resentAfter = Date.now() - 1000;
const resend = await admin.mutate("users.resendInvite", { userId: first.id });
check("Resend invitation works for an account not yet set up", ok(resend), resend.error);
const secondMail = await mailTo(first.email, { after: resentAfter });
const secondLink = linkIn(secondMail);
check("a new link is emailed", Boolean(secondLink) && secondLink !== first.link);
rows = await invitationsOf(first.id);
check(
  "the earlier link is revoked, the new one is open",
  rows.length === 2 && Boolean(rows[0].revoked_at) && !rows[1].revoked_at && !rows[1].consumed_at,
);
// The form opened from the first link is still on screen: submitting it must fail.
await submitPassword(page, GOOD_PASSWORD);
await page.waitForFunction(() => /not valid any more/i.test(document.body.innerText));
check("a form opened from the replaced link is refused when submitted", true);
const stale = await freshPage();
await openLink(stale, first.link);
check(
  "the replaced link opens to one plain message",
  /not valid any more/i.test(await textOf(stale)),
);
check("which shows no form", (await stale.$("#invite-password")) === null);
check("no password was set through the dead link", (await passwordHash(first.id)) === first.hash);

// ============================================================================================================
section("Accepting: once, then sign in the ordinary way");
// ============================================================================================================
const accept = await freshPage();
await openLink(accept, secondLink);
await submitPassword(accept, GOOD_PASSWORD);
await accept.waitForFunction(() => location.pathname === "/login", { timeout: 20_000 });
check(
  "after choosing a password the person is sent to sign in",
  accept.url().includes("reason=password_set"),
);
check("they are not signed in by the link", (await authCookies(accept)).length === 0);
rows = await invitationsOf(first.id);
check("the link is used", Boolean(rows[1].consumed_at));
check("a password was set, once", (await passwordHash(first.id)) !== first.hash);
check(
  "the acceptance is in the audit trail, in the person's own name",
  Boolean(
    await one(sql`select 1 from public.audit_logs
                  where event_type = 'user.invitation_accepted' and user_id = ${first.id}`),
  ),
);
const again = await freshPage();
await openLink(again, secondLink);
check("the same link a second time is refused", /not valid any more/i.test(await textOf(again)));
const invitee = new Session();
const signedIn = await invitee.login({ email: first.email, password: GOOD_PASSWORD });
check("the chosen password signs in", signedIn.location?.includes("/app"), signedIn.location);
listed = await rowOf(first.email);
check(
  "Users shows the account as Active",
  listed?.status === "active" && listed?.invitation === null,
);
check(
  "an account that is set up cannot be sent another link",
  rejected(await admin.mutate("users.resendInvite", { userId: first.id }), "already set up"),
);
check(
  "nor have a link revoked",
  rejected(await admin.mutate("users.revokeInvite", { userId: first.id }), "already set up"),
);

// ============================================================================================================
section("Two submissions of one link at the same moment");
// ============================================================================================================
const raced = await invite("race");
const [a, b] = [await freshPage(), await freshPage()];
await openLink(a, raced.link);
await openLink(b, raced.link);
const passwords = [`Race-${RUN}-First!1a`, `Race-${RUN}-Second!2b`];
// Fill both forms first, then press both buttons together.
for (const [p, password] of [
  [a, passwords[0]],
  [b, passwords[1]],
]) {
  await p.type("#invite-password", password);
  await p.type("#invite-confirm-password", password);
}
const press = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll("button")]
      .find((x) => /set password/i.test(x.textContent))
      .click(),
  );
await Promise.all([press(a), press(b)]);
const settled = (p) =>
  p.waitForFunction(
    () => location.pathname === "/login" || /not valid any more/i.test(document.body.innerText),
    { timeout: 20_000 },
  );
await Promise.all([settled(a), settled(b)]);
const outcomes = [a, b].map((p) => new URL(p.url()).pathname === "/login");
check("exactly one of the two goes through", outcomes.filter(Boolean).length === 1, `${outcomes}`);
rows = await invitationsOf(raced.id);
check("the link is used once", rows.length === 1 && Boolean(rows[0].consumed_at));
const winner = passwords[outcomes.indexOf(true)];
const loser = passwords[outcomes.indexOf(false)];
check(
  "the password that works is the winner's",
  (await new Session().login({ email: raced.email, password: winner })).location?.includes("/app"),
);
check(
  "the other one does not",
  !(await new Session().login({ email: raced.email, password: loser })).location?.includes("/app"),
);

// ============================================================================================================
section("Revoked, expired, deactivated: one and the same answer");
// ============================================================================================================
const revoked = await invite("revoked");
const revoke = await admin.mutate("users.revokeInvite", { userId: revoked.id });
check("Revoke link works", ok(revoke), revoke.error);
check(
  "a second revoke has nothing to revoke",
  rejected(await admin.mutate("users.revokeInvite", { userId: revoked.id }), "no open invitation"),
);
check(
  "Users shows the link as revoked",
  (await rowOf(revoked.email))?.invitation?.state === "revoked",
);
const expired = await invite("expired");
await sql.begin(async (tx) => {
  // The table refuses a changed expiry; only a test that switches its guard off can move time.
  await tx`set local session_replication_role = replica`;
  await tx`update public.user_invitations set expires_at = now() - interval '1 minute'
           where user_id = ${expired.id}`;
});
check(
  "Users shows the link as expired",
  (await rowOf(expired.email))?.invitation?.state === "expired",
);
const deactivated = await invite("deactivated");
await admin.mutate("users.deactivate", { userId: deactivated.id });
const unknown = `${APP}/invite#${"A".repeat(43)}`;
const messages = [];
for (const link of [
  revoked.link,
  expired.link,
  deactivated.link,
  unknown,
  `${APP}/invite#nonsense`,
]) {
  const p = await freshPage();
  await openLink(p, link);
  messages.push((await textOf(p)).replace(/\s+/g, " ").trim());
  await p.close();
}
check(
  "each is refused",
  messages.every((m) => /not valid any more/i.test(m)),
);
check(
  "with exactly the same words",
  new Set(messages).size === 1,
  [...new Set(messages)].join(" | "),
);
const untouched = await Promise.all(
  [revoked, expired, deactivated].map(async (who) => (await passwordHash(who.id)) === who.hash),
);
check("none of the three accounts had a password set", untouched.every(Boolean), `${untouched}`);
const renewAfter = Date.now() - 1000;
check(
  "a revoked account can be sent a new link",
  ok(await admin.mutate("users.resendInvite", { userId: revoked.id })),
);
const renewed = linkIn(await mailTo(revoked.email, { after: renewAfter }));
const renewedPage = await freshPage();
await openLink(renewedPage, renewed);
check("and that one opens the form", (await renewedPage.$("#invite-password")) !== null);

// ============================================================================================================
section("No other way to a first password");
// ============================================================================================================
const forgot = await freshPage();
await forgot.goto(`${APP}/forgot-password`, { waitUntil: "networkidle0" });
await forgot.type('input[name="email"]', expired.email);
await forgot.evaluate(() => document.querySelector('form button[type="submit"]').click());
await forgot.waitForFunction(() => /code/i.test(document.body.innerText), { timeout: 15_000 });
await sleep(500);
check("the reset-by-code form answers as for any address", /code/i.test(await textOf(forgot)));
check(
  "but sends no code to an account that was never set up",
  (await sql`select 1 from public.password_reset_otps where user_id = ${expired.id}`).length === 0,
);

// ============================================================================================================
section("Who may resend and revoke");
// ============================================================================================================
const prjAdmin = new Session();
await prjAdmin.login(
  await ensureInvited(admin, {
    email: "e2e.prjadmin@traceesg.test",
    role: "org_admin",
    org: "PRJ-X",
    name: "E2E Project Administrator",
  }),
);
const outside = await invite("outside", { org: SUB_A });
check(
  "an Administrator cannot resend the invitation of someone outside their units",
  (await prjAdmin.mutate("users.resendInvite", { userId: outside.id })).status === 403,
);
check(
  "nor revoke it",
  (await prjAdmin.mutate("users.revokeInvite", { userId: outside.id })).status === 403,
);
check(
  "the link outside is untouched",
  (await invitationsOf(outside.id)).every((r) => !r.revoked_at),
);
const inside = await invite("inside", { by: prjAdmin });
check("an Administrator invites inside their own unit", ok(inside.result) && Boolean(inside.link));
check(
  "and revokes that invitation",
  ok(await prjAdmin.mutate("users.revokeInvite", { userId: inside.id })),
);
check(
  "someone without user management can do neither",
  (await sessions.pm.mutate("users.resendInvite", { userId: outside.id })).status === 403 &&
    (await sessions.pm.mutate("users.revokeInvite", { userId: outside.id })).status === 403,
);

// ============================================================================================================
section("Bulk import sends links too");
// ============================================================================================================
const bulkEmail = `e2e.invite.bulk.${RUN}@traceesg.test`;
const bulkAfter = Date.now() - 1000;
const bulk = await admin.mutate("users.bulkImport", {
  rows: [
    {
      employeeId: `E2E-${RUN}`.toUpperCase(),
      displayName: "E2E Bulk Invitee",
      email: bulkEmail,
      roleCode: "project_manager",
      orgUnitCode: "PRJ-X",
    },
  ],
});
const bulkRow = bulk.data?.results?.[0];
check("a bulk-import row creates the account", bulkRow?.ok === true, bulkRow?.error);
check("its result holds no password", bulkRow && !("password" in bulkRow), JSON.stringify(bulkRow));
const bulkMail = await mailTo(bulkEmail, { after: bulkAfter });
check("the person is emailed a link", bulkRow?.emailSent === true && Boolean(linkIn(bulkMail)));
check(
  "and no password",
  !/temporary password|password:/i.test(`${bulkMail?.HTML} ${bulkMail?.Text}`),
);
check(
  "nobody can sign in to the new account before a password is chosen",
  !(await new Session().login({ email: bulkEmail, password: GOOD_PASSWORD })).location?.includes(
    "/app",
  ),
);

// ============================================================================================================
section("Guessing links is slowed down");
// ============================================================================================================
await sql`delete from public.rate_limit_events`;
const guesser = await freshPage();
let limitedAt = null;
for (let attempt = 1; attempt <= 34 && limitedAt === null; attempt++) {
  await openLink(guesser, `${APP}/invite#${String(attempt).padStart(43, "B")}`);
  if (/too many attempts/i.test(await textOf(guesser))) limitedAt = attempt;
}
check(
  "after 30 wrong links from one address the next is refused outright",
  limitedAt === 31,
  `${limitedAt}`,
);
await openLink(guesser, renewed);
check(
  "while limited, even a good link is not confirmed to that address",
  /too many attempts/i.test(await textOf(guesser)),
);
await sql`delete from public.rate_limit_events`;

// ============================================================================================================
section("Sessions: every sign-in has a clock");
// ============================================================================================================
const person = await ensureInvited(admin, {
  email: "e2e.sessions@traceesg.test",
  role: "project_manager",
  org: "PRJ-X",
  name: "E2E Session Holder",
});
const personId = await userId(person.email);
await admin.mutate("users.reactivate", { userId: personId });
await sql`delete from public.user_sessions where user_id = ${personId}`;
const sessionRows = () =>
  sql`select session_id, started_at, last_activity_at, ended_at, ended_reason
      from public.user_sessions where user_id = ${personId} order by started_at`;
const move = (sessionId, { idle, age }) => sql`
  update public.user_sessions
  set last_activity_at = coalesce(now() - make_interval(mins => ${idle ?? null}::int), last_activity_at),
      started_at = coalesce(now() - make_interval(mins => ${age ?? null}::int), started_at)
  where session_id = ${sessionId}`;

const one1 = new Session();
await one1.login(person);
let clocks = await sessionRows();
check("signing in starts a clock", clocks.length === 1 && !clocks[0].ended_at);
check("it starts now", Math.abs(Date.now() - new Date(clocks[0]?.started_at).getTime()) < 60_000);

section("Sessions: the page's own requests are not activity");
await move(clocks[0].session_id, { idle: 120 });
check(
  "a procedure call still works after two idle hours",
  ok(await one1.query("notifications.list", { limit: 5 })),
);
check("and a page", (await one1.get("/app")).status === 200);
clocks = await sessionRows();
check(
  "neither moved the idle clock",
  Date.now() - new Date(clocks[0].last_activity_at).getTime() > 119 * 60_000,
);

section("Sessions: three hours without activity");
await move(clocks[0].session_id, { idle: 181 });
const afterIdle = await one1.query("notifications.list", { limit: 5 });
check("a procedure call is refused", afterIdle.status === 401, `${afterIdle.status}`);
check(
  "an evidence file request is refused",
  (await one1.file(`/api/documents/${PRJ_X}/file`)).status === 401,
);
const idlePage = await one1.get("/app");
// The root loading.tsx (ui, 2026-11) streams pages, so the redirect may come inside the page.
check(
  "a page goes to the sign-out route with the reason",
  idlePage.location?.includes("/auth/signout?reason=expired") ||
    idlePage.html.includes("NEXT_REDIRECT;replace;/auth/signout?reason=expired"),
  idlePage.location,
);
clocks = await sessionRows();
check("the clock says it ended for being idle", clocks[0].ended_reason === "idle");

section("Sessions: one device ending does not end another");
const two = new Session();
await two.login(person);
const out = await one1.get("/auth/signout?reason=expired&next=%2Fapp%2Fsubmissions");
check(
  "the expired device lands on sign-in with the reason and its page",
  out.location?.includes("/login?reason=expired") &&
    out.location?.includes("next=%2Fapp%2Fsubmissions"),
  out.location,
);
check(
  "an outside address is never accepted as the page to return to",
  !(
    await new Session().get("/auth/signout?reason=expired&next=https%3A%2F%2Fevil.test")
  ).location?.includes("evil"),
);
check("its session cookies are gone", ![...one1.jar.keys()].some((k) => /auth-token/.test(k)));
check("the other device keeps working", (await two.get("/app")).status === 200);
check("an ended session stays ended", (await one1.get("/app")).location?.includes("/login"));

section("Sessions: 72 hours after sign-in, however busy (0054)");
clocks = await sessionRows();
const live = clocks.find((c) => !c.ended_at);
await move(live.session_id, { idle: 0, age: 4321 });
const afterAbsolute = await two.query("notifications.list", { limit: 5 });
check("the session is refused", afterAbsolute.status === 401, `${afterAbsolute.status}`);
clocks = await sessionRows();
check(
  "the clock says it reached the absolute limit",
  clocks.find((c) => c.session_id === live.session_id)?.ended_reason === "absolute",
);
const fresh = new Session();
check("signing in again works", (await fresh.login(person)).location?.includes("/app"));
clocks = await sessionRows();
check(
  "and starts a new clock",
  clocks.filter((c) => !c.ended_at).length === 1 && clocks.length === 3,
);

// ============================================================================================================
section("Sessions: one account, one device (migration 0055)");
// ============================================================================================================
const second = new Session();
const asked = await second.login(person);
check(
  "a second device is asked first",
  !asked.location && asked.text.includes(TAKEOVER_QUESTION),
  asked.location,
);
check("the first device is untouched meanwhile", (await fresh.get("/app")).status === 200);
clocks = await sessionRows();
check("and no second clock was started", clocks.filter((c) => !c.ended_at).length === 1);
const firstClock = clocks.find((c) => !c.ended_at);
const took = await second.login(person, { takeover: true });
check("confirming signs in here", took.location?.includes("/app"), took.location);
check("the new device works", (await second.get("/app")).status === 200);
const refused = await fresh.query("notifications.list", { limit: 5 });
check("the first device is refused at once", refused.status === 401, `${refused.status}`);
clocks = await sessionRows();
check(
  "its clock ended as replaced",
  clocks.find((c) => c.session_id === firstClock.session_id)?.ended_reason === "replaced",
);
const firstPage = await fresh.get("/app");
const toLogin = firstPage.location?.includes("/login") ? firstPage.location : "/login";
const notice = await fresh.get(toLogin.replace(APP, ""));
check(
  "it is told another device signed in, and when",
  /signed in on another device at \d{1,2}:\d{2} [ap]m on/.test(notice.html),
  firstPage.location,
);
const takeoverAudit = await one(sql`
  select old_value, new_value from public.audit_logs
  where event_type = 'auth.session_replaced' and entity_id = ${personId}
  order by created_at desc limit 1`);
check(
  "the takeover is audited with both devices",
  takeoverAudit?.old_value?.sessions?.[0]?.session_id === firstClock.session_id &&
    takeoverAudit?.new_value?.via === "sign_in" &&
    Boolean(takeoverAudit?.new_value?.session_id),
);

// ============================================================================================================
section("Sessions in the browser: activity, warning, sign-out");
// ============================================================================================================
clocks = await sessionRows();
const tab = await freshPage();
await tab.goto(`${APP}/login`, { waitUntil: "networkidle0" });
await tab.type('input[name="email"]', person.email);
await tab.type('input[name="password"]', person.password);
// Waits for the button (a dialog's content mounts a moment after its frame), then clicks it.
const clickIn = async (scope, label) => {
  const found = await tab
    .waitForFunction(
      (selector, text) =>
        [...document.querySelectorAll(selector)].some((x) => x.textContent.trim() === text),
      { timeout: 20_000 },
      scope,
      label,
    )
    .then(() => true)
    .catch(() => false);
  if (!found) {
    const seen = await tab.evaluate(
      (selector) => [...document.querySelectorAll(selector)].map((x) => x.textContent.trim()),
      scope,
    );
    throw new Error(`no "${label}" in ${scope}; found: ${JSON.stringify(seen)}`);
  }
  await tab.evaluate(
    (selector, text) =>
      [...document.querySelectorAll(selector)].find((x) => x.textContent.trim() === text).click(),
    scope,
    label,
  );
};
const dialogOpen = () =>
  tab.waitForFunction(() => document.querySelector('[role="dialog"]'), { timeout: 20_000 });
await clickIn("button", "Sign in");
await dialogOpen();
check(
  "the browser asks before taking over the other device",
  /signed in on another device/i.test(
    await tab.evaluate(() => document.querySelector('[role="dialog"]').innerText),
  ),
);
await clickIn('[role="dialog"] button', "Cancel");
await tab.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 10_000 });
check(
  "Cancel signs in nowhere",
  new URL(tab.url()).pathname === "/login" && (await second.get("/app")).status === 200,
);
await tab.type('input[name="password"]', person.password);
await clickIn("button", "Sign in");
await dialogOpen();
await Promise.all([
  tab.waitForNavigation({ waitUntil: "networkidle0" }),
  clickIn('[role="dialog"] button', "Sign out there and continue here"),
]);
check("the browser is signed in", new URL(tab.url()).pathname.startsWith("/app"), tab.url());
check(
  "and the other device is signed out",
  (await second.query("notifications.list", { limit: 5 })).status === 401,
);
const tabCookie = (await authCookies(tab)).map((c) => c.value).join("");
const browserSession = async () => {
  const known = new Set(clocks.map((c) => c.session_id));
  return (await sessionRows()).find((c) => !known.has(c.session_id));
};
let mine = await browserSession();
check("the browser's sign-in has a clock of its own", Boolean(mine) && Boolean(tabCookie));

await move(mine.session_id, { idle: 120 });
await sleep(36_000); // long enough for the notification bell to poll at least once
mine = await browserSession();
check(
  "36 seconds of an open page (the bell polls meanwhile) is not activity",
  Date.now() - new Date(mine.last_activity_at).getTime() > 119 * 60_000,
);
await tab.mouse.move(300, 300);
await tab.keyboard.press("Shift");
await sleep(3_000);
mine = await browserSession();
check("a click on the page is", Date.now() - new Date(mine.last_activity_at).getTime() < 60_000);

// The page keeps the times the server last told it, which in real use are right. Here the test has moved
// the clock behind its back, so the tab is told to look again, as it does when a laptop wakes up.
const lookAgain = () => tab.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
await move(mine.session_id, { idle: 177 });
await lookAgain();
await tab.waitForFunction(() => /you will be signed out at/i.test(document.body.innerText), {
  timeout: 40_000,
});
check("three minutes before the idle limit the page warns", true);
await tab.evaluate(() =>
  [...document.querySelectorAll("button")]
    .find((x) => /stay signed in/i.test(x.textContent))
    .click(),
);
await tab.waitForFunction(() => !/you will be signed out at/i.test(document.body.innerText), {
  timeout: 20_000,
});
mine = await browserSession();
check(
  "Stay signed in starts the idle clock again and the warning goes",
  Date.now() - new Date(mine.last_activity_at).getTime() < 60_000,
);

await move(mine.session_id, { idle: 181 });
await lookAgain();
await tab.waitForFunction(() => location.pathname === "/login", { timeout: 60_000 });
check(
  "past the limit the open page leaves for sign-in by itself",
  tab.url().includes("reason=expired"),
);
check("with the page to come back to", tab.url().includes("next="), tab.url());
// Waited for, not read once: the page may still be settling after the sign-out route's redirects.
check(
  "and says why",
  await tab
    .waitForFunction(() => /session expired/i.test(document.body.innerText), { timeout: 20_000 })
    .then(() => true)
    .catch(() => false),
  tab.url(),
);
check("the browser holds no session any more", (await authCookies(tab)).length === 0);

section("Sessions: signing out closes the clock");
const last = new Session();
await last.login(person);
check("a live session before sign-out", (await last.get("/app")).status === 200);
await last.get("/auth/signout");
clocks = await sessionRows();
check(
  "every clock of the person is closed",
  clocks.every((c) => c.ended_at) && clocks.some((c) => c.ended_reason === "signed_out"),
);

// ============================================================================================================
section("Sessions: a Super Admin's takeover is emailed to them (0055)");
// ============================================================================================================
const emailedAfter = Date.now() - 1_000;
const adminAgain = await new Session().login(credentials.admin, { takeover: true });
check("the Super Admin signs in on a second device", adminAgain.location?.endsWith("/admin"));
const warning = await mailTo(credentials.admin.email, { after: emailedAfter });
check(
  "and gets an email naming the new device",
  /signed in on another device/i.test(warning?.Subject ?? "") &&
    /New device:/.test(warning?.HTML ?? ""),
  warning?.Subject,
);

await browser.close();
await finish();
