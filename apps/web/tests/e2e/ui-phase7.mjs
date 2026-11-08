// Phase 7 screens in a real browser (Edge, headless): Carbon Analytics on a four-year fixture — the charts,
// the year table with its change and completeness, the activity table, the suggestions with their evidence,
// "Check now", an alert and acknowledging it, the settings — for a Super Admin, and the page an Administrator
// sees, at desktop and phone widths. No console or page error. Local stack only; the fixture is removed.
import { createRequire } from "node:module";
import { join } from "node:path";
import { createFixture, FIXTURE_TODAY, removeFixture } from "./analytics-fixture.mjs";
import {
  APP,
  RUN,
  Session,
  WEB,
  check,
  ensureInvited,
  env,
  finish,
  one,
  section,
  setup,
  sql,
} from "./lib.mjs";

const puppeteer = createRequire(`${WEB}/package.json`)("puppeteer-core");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const { admin } = sessions;
const prjAdmin = new Session();
await prjAdmin.login(
  await ensureInvited(admin, {
    email: "e2e.prjx.admin@traceesg.test",
    role: "org_admin",
    org: "PRJ-X",
    name: "E2E Project X Administrator",
  }),
  { takeover: true },
);
const [{ today }] = await sql`select public.reporting_period_today()::text as today`;
if (today < FIXTURE_TODAY.from || today > FIXTURE_TODAY.to) {
  check("the fixture's date window holds", false, today);
  await finish();
}

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const problems = [];
async function pageAs(session, width = 1440) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height: 900 });
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
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `phase7-${name}.png`), fullPage: true });
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
const clickButton = (page, label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === l);
    b?.click();
    return !!b;
  }, label);
const sideways = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

const adminId = (
  await one(sql`select id from public.users where email = 'e2e.admin@traceesg.test'`)
).id;
let fixture;
try {
  fixture = await createFixture(sql, RUN, adminId);
  const path = `/admin/carbon-analytics?org=${fixture.group.id}`;

  section("Super Admin, desktop");
  const sa = await pageAs(admin);
  await go(sa, path, "Emissions by financial year");
  let t = await text(sa);
  check("the sidebar offers Carbon Analytics", /Carbon Analytics/.test(t));
  check(
    "four charts, one per scope and the total, each with a text alternative",
    (await sa.evaluate(
      () =>
        [...document.querySelectorAll("figure svg[role=img]")].filter((s) =>
          s.getAttribute("aria-label")?.includes("FY 2025-26"),
        ).length,
    )) === 4,
  );
  check("the partial year is marked in the table", /partial/i.test(t) && /complete/i.test(t));
  check(
    "…and hatched and labelled in the charts",
    (await sa.evaluate(
      () =>
        [...document.querySelectorAll("figure svg text")].filter((x) => x.textContent === "partial")
          .length,
    )) === 4 &&
      (await sa.evaluate(
        () => document.querySelectorAll("figure svg path[fill^='url(#hatch']").length,
      )) === 4,
  );
  check(
    "the change is shown with the months it covers",
    /same months: Apr–Jul/.test(t) && /full year/.test(t),
  );
  check(
    "the year table says why the year is partial",
    /The year is not over yet/.test(t) && /4 of 12 months/.test(t),
  );
  check(
    "suggestions are shown with what the data shows and the policy",
    /Suggested actions/.test(t) && /What the data shows/.test(t) && /Policy:/.test(t),
  );
  check(
    "electricity is called out for July 2026, once",
    (t.match(/Grid electricity emissions are rising, with an unusually high AN 2026-07/g) ?? [])
      .length === 1,
  );
  // The AI wording, when this server has the AI service set up: one real request, on the fixture's
  // synthetic figures. Either the checked wording appears, or the fixed wording stays with a reason.
  if (/Explain in plain words/.test(t)) {
    const asked = Date.now();
    await clickButton(sa, "Explain in plain words");
    await sa.waitForFunction(
      () =>
        /written by the AI service/.test(document.body.innerText) ||
        /AI wording|AI service|assistant/i.test(
          document.querySelector("[data-sonner-toast]")?.textContent ?? "",
        ),
      { timeout: 120_000 },
    );
    const after = await text(sa);
    const worded = /written by the AI service/.test(after);
    const toastText = await sa.evaluate(
      () => document.querySelector("[data-sonner-toast]")?.textContent ?? "",
    );
    console.log(`  (AI wording: ${worded ? "shown" : `refused — ${toastText.trim()}`})`);
    check(
      "the AI wording is shown, or refused with a reason and the fixed wording kept",
      worded || /fixed wording|not available|busy|took too long/i.test(toastText),
    );
    const audited = await one(sql`
      select count(*)::int as n from public.audit_logs
      where event_type = 'analytics.recommendation_worded' and entity_id = ${fixture.group.id}
        and created_at > to_timestamp(${asked / 1000 - 5})`);
    check("the request is audited without its text", audited.n === 1);
  } else {
    console.log("  (AI wording: not set up on this server — not tried)");
  }
  await sa.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  t = await text(sa);
  check(
    "the activity table lists the three activities",
    /Grid Electricity Consumption/.test(t) &&
      /Diesel Consumption/.test(t) &&
      /Business Travel — Air/.test(t),
  );
  check(
    "the evidence lists periods and links to the Data Explorer",
    /Open the records in the Data Explorer/.test(t),
  );
  check("the desktop page does not scroll sideways", !(await sideways(sa)));
  await shot(sa, "analytics-desktop");

  section("Check now and acknowledging");
  check(
    "no alert before the check",
    /No alerts for this part of the organisation/.test(await text(sa)),
  );
  await clickButton(sa, "Check now");
  await sa.waitForFunction(() => /Acknowledge…/.test(document.body.innerText), { timeout: 30_000 });
  t = await text(sa);
  check(
    "the alerts appear with measured, expected, difference and threshold",
    /Measured/.test(t) &&
      /Expected average/.test(t) &&
      /\+20 tCO2e \(\+100%\)/.test(t) &&
      /Threshold/.test(t),
  );
  check("…and the earlier periods averaged", /Average of AN 2025-07/.test(t));
  await clickButton(sa, "Acknowledge…");
  await sa.waitForSelector("input[id^=ack-]");
  await sa.type("input[id^=ack-]", "E2E: checked in the browser.");
  await clickButton(sa, "Acknowledge");
  await sa.waitForFunction(() => /checked in the browser/.test(document.body.innerText), {
    timeout: 20_000,
  });
  check(
    "an acknowledged alert shows who and the note",
    /Acknowledged by .*E2E: checked in the browser\./.test(await text(sa)),
  );
  await sa.evaluate(() => document.getElementById("alerts")?.scrollIntoView());
  await shot(sa, "analytics-alerts");

  section("Phone width");
  const phone = await pageAs(admin, 390);
  await go(phone, path, "Emissions by financial year");
  check("the phone page does not scroll sideways", !(await sideways(phone)));
  await shot(phone, "analytics-phone");

  section("Administrator of PRJ-X");
  const pa = await pageAs(prjAdmin);
  await go(pa, "/admin/carbon-analytics", "Emissions by financial year");
  t = await text(pa);
  check("an Administrator opens it on their own unit", /Project X/.test(t));
  check("…without the settings or Check now", !/Alert settings/.test(t) && !/Check now/.test(t));
  check("…and without the fixture's alerts", !t.includes(fixture.group.name));
  await pa.goto(`${APP}${path}`, { waitUntil: "networkidle0" });
  check(
    "a unit outside their scope opens their own instead",
    !(await text(pa)).includes(fixture.group.name),
  );
  await shot(pa, "analytics-administrator");

  check("no console or page errors", problems.length === 0, problems.slice(0, 5).join(" | "));
} finally {
  await browser.close();
  await removeFixture(sql, fixture);
}
await finish();
