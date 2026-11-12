// Phase 10 help centre in a real browser (Edge, headless): what a Project Manager and an administrator see,
// that the figures quoted are the platform's own settings, the process diagrams, the page at phone width, axe.
// Local stack only.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { APP, WEB, check, env, finish, section, setup, sql } from "./lib.mjs";

const require = createRequire(`${WEB}/package.json`);
const puppeteer = require("puppeteer-core");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const { admin, pm } = sessions;
const settings = Object.fromEntries(
  (await sql`select key, value from public.org_settings`).map((r) => [r.key, r.value]),
);

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const problems = [];
async function pageAs(session, viewport = { width: 1440, height: 900 }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(viewport);
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
const text = (page) => page.evaluate(() => document.body.innerText);
async function axe(page) {
  await page.evaluate(AXE);
  const r = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    }),
  );
  return r.violations
    .filter((v) => ["serious", "critical"].includes(v.impact))
    .map((v) => `${v.id} (${v.nodes[0]?.target})`);
}

try {
  section("A Project Manager");
  const p = await pageAs(pm);
  await p.goto(`${APP}/app/help`, { waitUntil: "networkidle0" });
  let t = await text(p);
  check(
    "the sidebar has Help and it opens",
    /Help/.test(t) && /How a figure gets into a report/.test(t),
  );
  check(
    "no administrator sections",
    !/Validation and approval/.test(t) &&
      !/Conversion factors/.test(t) &&
      !/Carbon analytics and alerts/.test(t),
  );
  check(
    "the OCR threshold is the platform's",
    t.includes(`less than ${settings.ocr_confidence_threshold}% confidence`),
  );
  const idle = settings.session_limits.idle_minutes;
  const total = settings.session_limits.absolute_minutes;
  check(
    "the session limits are the platform's",
    t.includes(`${idle % 60 === 0 ? `${idle / 60} hour` : `${idle} minutes`}`) &&
      t.includes(`${total % 60 === 0 ? total / 60 : total}`),
  );
  check(
    "the invitation link lifetime is the platform's",
    t.includes(`valid for ${settings.invitation_valid_hours} hours`),
  );
  check(
    "the hierarchy levels are listed from the database",
    (await sql`select label from public.org_levels order by sort_order`).every((l) =>
      t.includes(l.label),
    ),
  );
  check(
    "every role is listed with what it can do",
    (await sql`select name from public.roles`).every((r) => t.includes(r.name)),
  );
  const steps = await p.evaluate(() =>
    [...document.querySelectorAll('ol[aria-label="Steps"]')].map((o) => o.children.length),
  );
  check("the submission flow is a seven-step ordered list", steps[0] === 7, steps.join(","));
  check("the page passes axe", (await axe(p)).length === 0, (await axe(p)).join(", "));

  section("An administrator");
  const a = await pageAs(admin);
  await a.goto(`${APP}/app/help`, { waitUntil: "networkidle0" });
  t = await text(a);
  check(
    "the administrator sections are there",
    /Validation and approval/.test(t) &&
      /Reports and their verification/.test(t) &&
      /Conversion factors/.test(t) &&
      /Carbon analytics and alerts/.test(t),
  );
  check(
    "all four report templates are described",
    ["Full SEBI BRSR", "BRSR Core KPIs", "GHG inventory", "Executive summary"].every((l) =>
      t.includes(l),
    ),
  );
  check(
    "the alert thresholds are the platform's",
    t.includes(`${settings.emission_alert_settings.thresholdPct.SCOPE_1}% (Scope 1)`),
  );
  await a.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  if (SHOTS) await a.screenshot({ path: join(SHOTS, "phase10-help-admin.png"), fullPage: true });
  check(
    "the administrator's page passes axe",
    (await axe(a)).length === 0,
    (await axe(a)).join(", "),
  );
  const links = await a.evaluate(() =>
    [...document.querySelectorAll("#map a")].map((l) => l.getAttribute("href")),
  );
  const broken = [];
  for (const href of links) {
    const r = await a.goto(`${APP}${href}`, { waitUntil: "domcontentloaded" });
    if (!r || r.status() >= 400) broken.push(`${href} ${r?.status()}`);
  }
  check(
    `every page in "Where things are" opens (${links.length})`,
    broken.length === 0,
    broken.join(", "),
  );

  section("Phone width");
  const ph = await pageAs(pm, { width: 390, height: 844, isMobile: true, hasTouch: true });
  await ph.goto(`${APP}/app/help`, { waitUntil: "networkidle0" });
  check(
    "no sideways scrolling",
    !(await ph.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )),
  );
  if (SHOTS) await ph.screenshot({ path: join(SHOTS, "phase10-help-phone.png") });

  check("no console or page errors", problems.length === 0, problems.slice(0, 5).join(" | "));
} finally {
  await browser.close();
}
await finish();
