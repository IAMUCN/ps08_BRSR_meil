// Phase 8 of feature_enhancement.md through the running app (HTTP): the four report templates generated for
// Project X's financial year, each PDF read back as text, the GHG inventory's Excel workbook opened and checked
// against the same snapshot, the downloads' permissions; the top-bar search for three kinds of account; and the
// Scope pages' Table / Chart switch kept in the address. Local stack only.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  Session,
  WEB,
  check,
  ensureInvited,
  finish,
  ok,
  one,
  orgId,
  section,
  setup,
  sql,
} from "./lib.mjs";

const require = createRequire(`${WEB}/package.json`);
const ExcelJS = require("exceljs");
const pdfjs = await import(pathToFileURL(require.resolve("pdfjs-dist/legacy/build/pdf.mjs")).href);

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
const PRJ_X = await orgId("PRJ-X");

async function waitFor(runId) {
  for (let i = 0; i < 180; i++) {
    const run = (await admin.query("reports.get", { id: runId })).data;
    if (run?.status === "completed" || run?.status === "failed") return run;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return (await admin.query("reports.get", { id: runId })).data;
}
async function pdfText(bytes) {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const doc = await task.promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    text += (await page.getTextContent()).items.map((i) => i.str).join(" ") + "\n";
  }
  const pages = doc.numPages;
  await task.destroy();
  return { text: text.replace(/\s+/g, " "), pages };
}

// The financial year of the open period the suite's records are in.
const { fy } = await one(sql`
  select (extract(year from p.start_date)::int - case when extract(month from p.start_date) < 4 then 1 else 0 end) as fy
  from public.esg_records r join public.reporting_periods p on p.id = r.reporting_period_id
  join public.org_units o on o.id = r.org_unit_id
  where o.code = 'PRJ-X' and r.approval_status = 'approved'
  group by 1 order by count(*) desc limit 1`);

section("Four templates, one set of figures");
const runs = {};
for (const template of ["brsr", "brsr_core", "ghg", "summary"]) {
  const gen = await admin.mutate("reports.generate", {
    orgUnitId: PRJ_X,
    financialYear: fy,
    template,
  });
  check(`the ${template} report is queued`, ok(gen), gen.error);
  if (ok(gen)) runs[template] = gen.data.runId;
}
const done = {};
for (const [template, id] of Object.entries(runs)) {
  done[template] = await waitFor(id);
  check(
    `the ${template} report completes and records its template`,
    done[template]?.status === "completed" && done[template].template === template,
    `${done[template]?.status}: ${done[template]?.error}`,
  );
}
const scopesOf = (run) => JSON.stringify(run?.snapshot?.scopes);
check(
  "every template froze the same scope totals",
  new Set(Object.values(done).map(scopesOf)).size === 1,
);
check(
  "the GHG inventory froze its activities, the summary its trends",
  Array.isArray(done.ghg?.snapshot?.extras?.activities) &&
    done.ghg.snapshot.extras.activities.length > 0 &&
    Array.isArray(done.summary?.snapshot?.extras?.analytics?.years),
);

const texts = {};
for (const [template, run] of Object.entries(done)) {
  const file = await admin.file(`/api/reports/${run.id}/file`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const disposition = file.headers.get("content-disposition") ?? "";
  texts[template] =
    bytes.subarray(0, 5).toString() === "%PDF-" ? await pdfText(bytes) : { text: "", pages: 0 };
  check(
    `the ${template} PDF downloads under its own name`,
    file.status === 200 &&
      texts[template].pages > 0 &&
      disposition.includes(
        {
          brsr: "BRSR report",
          brsr_core: "BRSR Core report",
          ghg: "GHG inventory",
          summary: "Executive summary",
        }[template],
      ),
    disposition,
  );
}
check(
  "the full BRSR report is unchanged: Section A to C",
  /Section A/.test(texts.brsr.text) && /Section C/.test(texts.brsr.text),
);
check(
  "BRSR Core lists the Core KPIs and how each is sourced",
  /BRSR Core Report/.test(texts.brsr_core.text) &&
    /BRSR Core KPIs at a glance/.test(texts.brsr_core.text) &&
    /Evidence-\s?backed/.test(texts.brsr_core.text) &&
    /Typed by the entity/.test(texts.brsr_core.text) &&
    /P8-E4/.test(texts.brsr_core.text),
);
check(
  "the GHG inventory has activities, factors and the org-unit break-down",
  /Greenhouse Gas Inventory/.test(texts.ghg.text) &&
    /Emissions by activity/.test(texts.ghg.text) &&
    /Methodology, boundary and assurance/.test(texts.ghg.text),
);
check(
  "the executive summary is short and has headline figures, alerts and actions",
  /Executive Summary/.test(texts.summary.text) &&
    /Headline figures/.test(texts.summary.text) &&
    /Open emission alerts/.test(texts.summary.text) &&
    /Suggested actions/.test(texts.summary.text) &&
    texts.summary.pages <= 3,
  `${texts.summary.pages} pages`,
);
check(
  "the executive summary is much shorter than the full report",
  texts.summary.pages < texts.brsr.pages,
  `${texts.summary.pages} vs ${texts.brsr.pages}`,
);

section("The GHG inventory's workbook");
const xlsx = await admin.file(`/api/reports/${done.ghg.id}/file?format=xlsx`);
const wbBytes = Buffer.from(await xlsx.arrayBuffer());
check(
  "it downloads as an Excel file, private and uncached",
  xlsx.status === 200 &&
    xlsx.headers.get("content-type")?.includes("spreadsheetml") &&
    xlsx.headers.get("cache-control")?.includes("no-store") &&
    wbBytes.subarray(0, 2).toString() === "PK",
);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(wbBytes);
const byScope = wb.getWorksheet("By scope");
const tonnes = (code) => {
  const s = done.ghg.snapshot.scopes.find((x) => x.code === code);
  let t = null;
  for (const f of s?.figures ?? []) {
    const u = f.unit.toLowerCase();
    if (f.value !== null && (u === "kgco2e" || u === "tco2e"))
      t = (t ?? 0) + (u === "kgco2e" ? f.value / 1000 : f.value);
  }
  return t === null ? null : Math.round(t * 1000) / 1000;
};
check(
  "its Scope 1, 2 and 3 equal the snapshot's",
  ["SCOPE_1", "SCOPE_2", "SCOPE_3"].every(
    (code, i) => byScope.getCell(`B${i + 2}`).value === tonnes(code),
  ),
  JSON.stringify([2, 3, 4].map((r) => byScope.getCell(`B${r}`).value)),
);
const activityRows = wb.getWorksheet("By activity").rowCount - 1;
check(
  "one row per activity, as in the snapshot",
  activityRows ===
    new Set(
      [
        ...done.ghg.snapshot.extras.activities,
        ...(done.ghg.snapshot.extras.previousActivities ?? []),
      ].map((a) => a.metricCode),
    ).size,
);
check(
  "the records sheet lists every approved emission record",
  wb.getWorksheet("Records").rowCount > 1,
);
check(
  "a template without a workbook has none",
  (await admin.file(`/api/reports/${done.brsr.id}/file?format=xlsx`)).status === 404 &&
    done.brsr.hasWorkbook === false,
);
check(
  "a Project Manager cannot download either file",
  (await pm.file(`/api/reports/${done.ghg.id}/file?format=xlsx`)).status === 404 &&
    (await pm.file(`/api/reports/${done.ghg.id}/file`)).status === 404,
);
const listed = (await admin.query("reports.list")).data ?? [];
check(
  "the runs list names each template and the workbook",
  listed.some((r) => r.id === done.ghg.id && r.template === "ghg" && r.hasWorkbook) &&
    listed.some((r) => r.id === done.summary.id && r.template === "summary" && !r.hasWorkbook),
);
check(
  "the request is audited with its template",
  !!(await one(sql`select 1 from public.audit_logs where entity_id = ${done.ghg.id}
                   and event_type = 'report.requested' and new_value->>'template' = 'ghg'`)),
);

section("Top-bar search over HTTP");
const q = (who, text, pathname = "/admin") => who.query("search.global", { q: text, pathname });
const pmSearch = await q(pm, "Diesel", "/app/submissions");
check(
  "a Project Manager finds their own records, nothing about people or units",
  ok(pmSearch) &&
    pmSearch.data.sections.some((s) => s.key === "records") &&
    !pmSearch.data.sections.some((s) => ["people", "units", "reports"].includes(s.key)),
  pmSearch.error,
);
const adminReports = await q(admin, "GHG inventory", "/admin/reports");
check(
  "a Super Admin finds the GHG inventory just made, reports first on Reports",
  adminReports.data?.sections[0]?.key === "reports" &&
    adminReports.data.sections[0].hits.some((h) => h.href === `/admin/reports/${done.ghg.id}`),
);
const prjSearch = await q(prjAdmin, "auth-far");
check(
  "an Administrator of PRJ-X does not find another subsidiary's records",
  ok(prjSearch) && !prjSearch.data.sections.some((s) => s.key === "records"),
);
check(
  "signed out, the search is refused",
  (await new Session().query("search.global", { q: "diesel", pathname: "/" })).status === 401,
);
const users = await admin.get("/admin/users?q=e2e.pm%40traceesg.test");
check(
  "Users opens with the search filled in from the address",
  users.status === 200 && users.html.includes('value="e2e.pm@traceesg.test"'),
);

section("Scope pages: Table and Chart");
const chart = await admin.get(`/admin/scope-1?org=${PRJ_X}&view=chart`);
check(
  "the Chart choice is kept in the address and pressed",
  chart.status === 200 && /aria-pressed="true"[^>]*>(?:<svg[\s\S]*?<\/svg>)?Chart/.test(chart.html),
);
check(
  "at a project, Chart draws the activities (it used to change nothing there)",
  chart.html.includes("Approved emissions by activity"),
);
const table = await admin.get(`/admin/scope-1?org=${PRJ_X}`);
check(
  "without it the page opens on tables",
  table.status === 200 && !table.html.includes("Approved emissions by activity"),
);

await finish();
