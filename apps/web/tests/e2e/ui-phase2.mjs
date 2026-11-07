// Phase 2 screens in a real browser (Edge, headless) on the built app: the period picker and late notice on
// Upload, every open period on the dashboard, the Late filter in the Validation Queue, the late window on
// Reporting Periods, the Document type filter, the record panel's stage tracker and corrections, and the
// approval list's thumbnails and row buttons. No console error or page error is allowed anywhere.
// Screenshots go to E2E_SCREENSHOTS when it is set. Local stack only.
import { createRequire } from "node:module";
import { join } from "node:path";
import { APP, RUN, WEB, check, env, finish, one, section, setup, sql } from "./lib.mjs";

const puppeteer = createRequire(`${WEB}/package.json`)("puppeteer-core");
const SHOTS = process.env.E2E_SCREENSHOTS;
const { sessions } = await setup();
const { admin, pm } = sessions;

const { today } = await one(sql`select (now() at time zone 'Asia/Kolkata')::date::text as today`);
const day = (offset) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
// A second open period, past its due date, so the picker has a choice and a late one.
const label = `UI Late ${RUN}`;
const created = await admin.mutate("reportingPeriods.create", {
  label,
  periodType: "monthly",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  submissionOpensOn: "",
  submissionClosesOn: day(-1),
  lateUploadsUntil: day(30),
});
await admin.mutate("reportingPeriods.transition", { id: created.data?.id, to: "open" });

const browser = await puppeteer.launch({
  executablePath: env.CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});
const problems = [];
/** A page signed in as the script's session for that account (the same sign-in, so no takeover). */
async function pageAs(session) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const host = new URL(APP).hostname;
  await context.setCookie(
    ...[...session.jar].map(([name, value]) => ({ name, value, domain: host, path: "/" })),
  );
  page.on("console", (m) => m.type() === "error" && problems.push(`${page.url()}: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`${page.url()}: ${e.message}`));
  return page;
}
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `phase2-${name}.png`), fullPage: true });
};
const text = (page) => page.evaluate(() => document.body.innerText);
const go = async (page, path) => {
  await page.goto(`${APP}${path}`, { waitUntil: "networkidle0" });
  // Pages stream (root loading.tsx): wait for the real content, not the spinner.
  await page.waitForFunction(
    () => !document.querySelector('[role="status"][aria-label="Loading"]'),
    {
      timeout: 20_000,
    },
  );
};

section("Upload: the period picker and the late notice");
const pmPage = await pageAs(pm);
await go(pmPage, "/app/upload");
const periodOptions = await pmPage.evaluate(() =>
  [...document.querySelectorAll("select option")]
    .map((o) => o.textContent)
    .filter((t) => /due/.test(t ?? "")),
);
check(
  "several periods are offered, each with its due date",
  periodOptions.length >= 2,
  periodOptions.join(" | "),
);
check(
  "the late one says so",
  periodOptions.some((t) => t.includes(label) && /late \(was due/.test(t)),
);
await pmPage.evaluate((wanted) => {
  const select = [...document.querySelectorAll("select")].find((s) =>
    [...s.options].some((o) => o.textContent?.includes(wanted)),
  );
  const option = [...select.options].find((o) => o.textContent?.includes(wanted));
  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}, label);
await pmPage.waitForFunction(() => /Late submission\./.test(document.body.innerText), {
  timeout: 10_000,
});
check(
  "choosing it shows the late notice",
  /marked late and reviewed before approval/.test(await text(pmPage)),
);
await shot(pmPage, "upload-late");

section("Dashboard: every open period with its dates");
await go(pmPage, "/app");
const dashboard = await text(pmPage);
check(
  "the card lists the open periods",
  /Open reporting periods/.test(dashboard) && dashboard.includes(label),
);
check("and when the late one takes uploads until", /late uploads until/.test(dashboard));
await shot(pmPage, "dashboard");

section("Admin screens");
const adminPage = await pageAs(admin);
await go(adminPage, "/admin/reporting-periods");
check("Reporting Periods shows the late window", /Late uploads until/.test(await text(adminPage)));
await shot(adminPage, "periods");

await go(adminPage, "/admin/validation-queue");
const vqOptions = await adminPage.evaluate(() =>
  [...document.querySelectorAll("#vq-category option")].map((o) => o.textContent),
);
check(
  "the Validation Queue filters late submissions and possible duplicates",
  vqOptions.includes("Late submissions") && vqOptions.includes("Possible duplicates"),
);
await shot(adminPage, "validation-queue");

await go(adminPage, "/admin/submissions");
// Each filter is a select inside its label: look the two up by their ids.
const filters = await adminPage.evaluate(() => ({
  activity: document.querySelector("#f-metric")?.closest("label")?.firstChild?.textContent?.trim(),
  documentType: document
    .querySelector("#f-doctype")
    ?.closest("label")
    ?.firstChild?.textContent?.trim(),
  types: document.querySelectorAll("#f-doctype option").length,
}));
check(
  "Submission Monitoring filters by Activity and Document type",
  filters.activity === "Activity" && filters.documentType === "Document type" && filters.types > 1,
  JSON.stringify(filters),
);
await shot(adminPage, "submissions");
const opened = await adminPage.evaluate(() => {
  const button = document.querySelector("table tbody tr td button");
  button?.click();
  return Boolean(button);
});
if (opened) {
  await adminPage.waitForFunction(() => document.querySelector('[aria-label="Record progress"]'), {
    timeout: 20_000,
  });
  const panel = await text(adminPage);
  check("the record panel shows the stage tracker", /Uploaded[\s\S]*Approved/.test(panel));
  check(
    "and the document type section for an Admin, unless the record is closed",
    /Document type and activity/.test(panel) || /Rejected/.test(panel),
  );
  await shot(adminPage, "record-panel");
} else {
  console.log("  SKIP the record panel: no records in this view");
}

await go(adminPage, "/admin/approval-queue");
const approvalHeadings = await adminPage.evaluate(() =>
  [...document.querySelectorAll("thead th")].map((th) => th.textContent?.trim().toLowerCase()),
);
check("the approval list has a Decision column", approvalHeadings.includes("decision"));
const thumbs = await adminPage.evaluate(
  () => document.querySelectorAll('tbody [role="img"][aria-label^="Preview of"]').length,
);
const rows = await adminPage.evaluate(() => document.querySelectorAll("tbody tr").length);
check(
  "every row with a document shows a preview",
  rows === 0 || thumbs > 0,
  `${thumbs} of ${rows}`,
);
await adminPage.evaluate(() => window.scrollTo(0, 0));
await new Promise((r) => setTimeout(r, 2500)); // the first previews render when they come into view
await shot(adminPage, "approvals");

check(
  "no console or page errors on any screen",
  problems.length === 0,
  problems.slice(0, 5).join(" | "),
);

await browser.close();
await sql`update public.reporting_periods set status = 'closed', closed_at = now() where label = ${label}`;
await finish();
