// Phase 4 screens in a real browser (Edge, headless): the "Reports to verify" list and a report's
// Verification trail for the receiving Administrator, the Audit Trail with its search bar for an Administrator,
// and My Activity for a Project Manager. No console or page error anywhere. Local stack only.
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  APP,
  Session,
  WEB,
  check,
  ensureInvited,
  env,
  finish,
  one,
  openPeriodId,
  orgId,
  section,
  setup,
  sql,
} from "./lib.mjs";

const puppeteer = createRequire(`${WEB}/package.json`)("puppeteer-core");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const { admin, pm } = sessions;
const signIn = async (account) => {
  const who = await ensureInvited(admin, account);
  const session = new Session();
  await session.login(who, { takeover: true });
  return session;
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

// A report waiting for Subsidiary A's verification.
const gen = await prjAdmin.mutate("reports.generate", {
  orgUnitId: await orgId("PRJ-X"),
  periodId: await openPeriodId(),
});
for (let i = 0; i < 120; i++) {
  const run = await one(
    sql`select status::text as s from public.report_runs where id = ${gen.data?.runId}`,
  );
  if (run?.s === "completed" || run?.s === "failed") break;
  await new Promise((r) => setTimeout(r, 1000));
}
await prjAdmin.mutate("reportForwarding.forward", { reportRunId: gen.data?.runId });

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const problems = [];
async function pageAs(session) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await context.setCookie(
    ...[...session.jar].map(([name, value]) => ({
      name,
      value,
      domain: new URL(APP).hostname,
      path: "/",
    })),
  );
  page.on("console", (m) => m.type() === "error" && problems.push(`${page.url()}: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`${page.url()}: ${e.message}`));
  return page;
}
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `phase4-${name}.png`) });
};
const text = (page) => page.evaluate(() => document.body.innerText);
const go = async (page, path, waitFor) => {
  await page.goto(`${APP}${path}`, { waitUntil: "networkidle0" });
  await page.waitForFunction(
    (t) => document.body.innerText.includes(t),
    { timeout: 20_000 },
    waitFor,
  );
};

section("The receiving Administrator");
const sub = await pageAs(subAdmin);
await go(sub, "/admin/reports", "Reports to verify");
const reportsText = await text(sub);
check(
  "Reports lists what is waiting for their verification",
  /Reports to verify \(\d+\)/.test(reportsText),
);
check(
  "with Verify and Return on it",
  await sub.evaluate(() =>
    ["Verify", "Return"].every((label) =>
      [...document.querySelectorAll("section button")].some((b) => b.textContent?.trim() === label),
    ),
  ),
);
await shot(sub, "reports-to-verify");
await go(sub, `/admin/reports/${gen.data?.runId}`, "Verification");
check(
  "the report's page shows its trail",
  /Project X → Subsidiary A/.test(await text(sub)) && /waiting/i.test(await text(sub)),
);
await shot(sub, "report-trail");
await go(sub, "/admin/audit-trail", "Audit Trail");
check(
  "the Audit Trail opens for an Administrator, scoped to their units",
  /inside the units you administer/.test(await text(sub)),
);
check(
  "with a search bar and Only my activity",
  await sub.evaluate(
    () =>
      Boolean(document.querySelector('input[type="search"]')) &&
      [...document.querySelectorAll("option")].some((o) => o.textContent === "Only my activity"),
  ),
);
// No Apply button any more (owner's page feedback, 2026-11-11): the search applies after typing stops.
await sub.type('input[type="search"]', "report.forwarded");
await sub.waitForFunction(
  () => new URL(location.href).searchParams.get("q") === "report.forwarded",
  {
    timeout: 10000,
  },
);
await sub.waitForNetworkIdle({ idleTime: 500 });
check("searching filters the entries", (await text(sub)).includes("report.forwarded"));
await shot(sub, "audit-trail");

section("A Project Manager");
const pmPage = await pageAs(pm);
await go(pmPage, "/app/activity", "My Activity");
check(
  "My Activity is in their menu",
  await pmPage.evaluate(() =>
    [...document.querySelectorAll("nav a")].some((a) => a.textContent?.includes("My Activity")),
  ),
);
check(
  "it shows only search, action and dates",
  await pmPage.evaluate(
    () =>
      Boolean(document.querySelector('input[type="search"]')) &&
      ![...document.querySelectorAll("label")].some((l) => l.textContent?.startsWith("User")),
  ),
);
check(
  "and the Audit Trail is not in their menu",
  !(await pmPage.evaluate(() =>
    [...document.querySelectorAll("nav a")].some((a) => a.textContent?.includes("Audit Trail")),
  )),
);
await shot(pmPage, "my-activity");

check("no console or page errors", problems.length === 0, problems.slice(0, 5).join(" | "));
await browser.close();
// Leave nothing waiting for the next run.
await sql`
  update public.report_forwards set status = 'returned', decided_by = forwarded_by, decided_at = now(),
         decision_reason = 'Closed by the UI check.'
  where report_run_id = ${gen.data?.runId} and status = 'pending'`;
await finish();
