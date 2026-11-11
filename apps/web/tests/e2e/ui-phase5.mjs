// Phase 5 screens in a real browser (Edge, headless): the Reminders section of Reporting Deadlines for the Super
// Admin (schedule editor, Run now, the sent log, the task list below) and for an Administrator (read-only
// schedule and their log, no task list), at desktop and phone widths. No console or page error. Local stack
// only; run phase5-reminders first so the log has rows.
import { createRequire } from "node:module";
import { join } from "node:path";
import { APP, Session, WEB, check, ensureInvited, env, finish, section, setup } from "./lib.mjs";

const puppeteer = createRequire(`${WEB}/package.json`)("puppeteer-core");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const { admin, pm } = sessions;
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
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `phase5-${name}.png`), fullPage: true });
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
const buttonState = (page, label) =>
  page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === l);
    return b ? (b.disabled ? "disabled" : "enabled") : "absent";
  }, label);
const sideways = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

section("The Super Admin");
const sa = await pageAs(admin);
await go(sa, "/admin/deadlines", "Reminders");
const saText = await text(sa);
check(
  "Reporting Deadlines has a Reminders section with the daily time",
  /Sent every morning at 9:00/.test(saText),
);
check(
  "the schedule lists 14 days before to the due day, each with a choice",
  (await sa.evaluate(() => document.querySelectorAll("section select").length)) >= 15,
);
// Run now was merged into Save schedule (owner's page feedback, 2026-11-11).
check("Run now is gone", (await buttonState(sa, "Run now")) === "absent");
check(
  "the panel says whether the daily run is set up here",
  /Daily run not set up on this server|runs daily at 9:00/i.test(saText),
);
check("Save schedule waits for a change", (await buttonState(sa, "Save schedule")) === "disabled");
await sa.select('select[aria-label="Reminder 10 days before"]', "in_app");
check(
  "changing a day enables Save schedule",
  (await buttonState(sa, "Save schedule")) === "enabled",
);
check(
  "the sent log shows reminders from the run",
  /E2E Reminders/.test(saText) && /Summary/.test(saText),
);
check("the task list is still below for the Super Admin", /Due Today/i.test(saText));
const logRows = () =>
  sa.evaluate(
    () =>
      [...document.querySelectorAll("section table")]
        .find((t) => t.querySelector("thead")?.textContent?.includes("Channel"))
        ?.querySelectorAll("tbody tr").length,
  );
check("the sent log shows the newest 20 first", (await logRows()) === 20, `${await logRows()}`);
await sa.evaluate(() =>
  [...document.querySelectorAll("button")]
    .find((b) => b.textContent?.startsWith("Show more"))
    .click(),
);
check("Show more adds the next 20", (await logRows()) === 40, `${await logRows()}`);
await shot(sa, "super-admin");
if (SHOTS) await sa.screenshot({ path: join(SHOTS, "phase5-super-admin-top.png") });

section("An Administrator");
const pa = await pageAs(prjAdmin);
await go(pa, "/admin/deadlines", "Reminders");
const paText = await text(pa);
check(
  "Reporting Deadlines is in an Administrator's menu",
  await pa.evaluate(() =>
    [...document.querySelectorAll("nav a")].some((a) =>
      a.textContent?.includes("Reporting Deadlines"),
    ),
  ),
);
check(
  "the schedule is shown read-only",
  (await pa.evaluate(() => document.querySelectorAll("section select").length)) === 0 &&
    /In-app and email/.test(paText),
);
check(
  "no Run now or Save schedule",
  (await buttonState(pa, "Run now")) === "absent" &&
    (await buttonState(pa, "Save schedule")) === "absent",
);
check("their log shows reminders about their units", /Own submissions/.test(paText));
check("the task list is not shown to them", !/Due Today/i.test(paText));
await shot(pa, "administrator");

section("Phone width and a Project Manager");
const phone = await pageAs(prjAdmin, 390);
await go(phone, "/admin/deadlines", "Reminders");
check("the page does not scroll sideways at 390px", !(await sideways(phone)));
await shot(phone, "phone");
const pmPage = await pageAs(pm);
await pmPage.goto(`${APP}/admin/deadlines`, { waitUntil: "networkidle0" });
check(
  "a Project Manager cannot open it",
  !/Sent every morning/.test(await text(pmPage)),
  pmPage.url(),
);

check("no console or page errors", problems.length === 0, problems.slice(0, 5).join(" | "));
await browser.close();
await finish();
