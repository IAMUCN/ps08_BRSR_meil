// The role-wise dashboard's tiles through the real API, one signed-in person per role (Phase 6 of
// .grill/role-dashboard-decisions.md): who sees which tiles, what each covers, that choosing a unit only ever
// narrows, that nobody signed out or with a bad input gets anything, and that no tile fails to load (a tile whose
// SQL is wrong degrades to "could not be loaded", so this is the first check that the loaders run against a real
// database). Local stack only. Run: pnpm --filter web test:e2e role-dashboard
import { check, ok, orgId, section, setup, sql, Session, finish } from "./lib.mjs";

const { sessions } = await setup();
const { admin, pm, hr, ehs, approver } = sessions;
const SUB_A = await orgId("SUB-A");
const PRJ_X = await orgId("PRJ-X");
const MEIL = await orgId("MEIL");
const [{ name: subAName }] = await sql`select name from public.org_units where id = ${SUB_A}`;
const [{ name: prjXName }] = await sql`select name from public.org_units where id = ${PRJ_X}`;

const tiles = async (who, input) => {
  const r = await who.query("dashboard.tiles", input);
  return { r, all: ok(r) ? [...r.data.band, ...r.data.grid] : [], band: r.data?.band ?? [] };
};
const ids = (t) => t.all.map((x) => x.id).sort();
const has = (t, id) => t.all.some((x) => x.id === id);
const byId = (t, id) => t.all.find((x) => x.id === id);
const FAILED = "could not be loaded";

const T = {
  admin: await tiles(admin),
  pm: await tiles(pm),
  hr: await tiles(hr),
  ehs: await tiles(ehs),
  approver: await tiles(approver),
};

section("Everyone gets a well-formed answer, and no tile fails to load");
for (const [who, t] of Object.entries(T)) {
  check(`${who}: dashboard.tiles answers`, ok(t.r), t.r.error);
  check(
    `${who}: every tile has a title, a link inside the app, a scope caption and a summary`,
    t.all.length > 0 &&
      t.all.every(
        (x) => x.title && x.href?.startsWith("/") && typeof x.scopeLabel === "string" && x.summary,
      ),
  );
  const failed = t.all.filter((x) => x.summary.includes(FAILED)).map((x) => x.id);
  check(
    `${who}: no tile fell back to "could not be loaded"`,
    failed.length === 0,
    failed.join(", "),
  );
  check(
    `${who}: the same tile is never listed twice`,
    new Set(t.all.map((x) => x.id)).size === t.all.length,
  );
}

section("Who sees which tiles");
const PERSONAL = ["period", "my-tasks", "returned", "notifications"];
check(
  "Project Manager: the personal tiles",
  PERSONAL.every((id) => has(T.pm, id)),
);
check(
  "Project Manager: its own area, missing items and unit emissions",
  has(T.pm, "my-area") && has(T.pm, "my-missing") && has(T.pm, "unit-emissions"),
);
check(
  "Project Manager: nothing about approvals, monitoring or the system",
  [
    "approval-queue",
    "missing-submissions",
    "emissions-overview",
    "completion",
    "system-health",
    "factors",
  ].every((id) => !has(T.pm, id)),
  ids(T.pm).join(", "),
);
check(
  "HR: its area and the employee register",
  has(T.hr, "my-area") && has(T.hr, "register-status"),
);
check(
  "HR: not EHS's certificates or the Project Manager's emissions",
  !has(T.hr, "certificates") && !has(T.hr, "unit-emissions"),
);
check(
  "EHS: its area and compliance certificates",
  has(T.ehs, "my-area") && has(T.ehs, "certificates"),
);
check("EHS: not the employee register", !has(T.ehs, "register-status"));
check(
  "Corporate ESG: approvals and the Group Overview",
  [
    "approval-queue",
    "missing-submissions",
    "emissions-overview",
    "completion-by-level",
    "hierarchy-status",
    "brsr-readiness",
  ].every((id) => has(T.approver, id)),
  ids(T.approver).join(", "),
);
check(
  "Corporate ESG: no system tiles, no functional-role tiles",
  ["system-health", "factors", "users-access", "activity", "my-area", "financial-inputs"].every(
    (id) => !has(T.approver, id),
  ),
);
check(
  "Super Admin: the system tiles and the Group Overview, not a functional role's own work",
  [
    "system-health",
    "factors",
    "users-access",
    "activity",
    "emissions-overview",
    "completion",
    "brsr-readiness",
  ].every((id) => has(T.admin, id)) &&
    ["my-area", "my-missing", "unit-emissions", "certificates"].every((id) => !has(T.admin, id)),
  ids(T.admin).join(", "),
);

section("Scope: each tile says where it looks, and never beyond the person's own units");
check(
  "Corporate ESG at Subsidiary A: its tiles name Subsidiary A, never the whole group",
  T.approver.all
    .filter((x) => ["approval-queue", "emissions-overview", "hierarchy-status"].includes(x.id))
    .every(
      (x) => x.scopeLabel.includes(subAName) && !/Whole group|All \d+ groups/.test(x.scopeLabel),
    ),
  T.approver.all.map((x) => `${x.id}:${x.scopeLabel}`).join(" | "),
);
check(
  "Project Manager at Project X: its role tiles name Project X",
  ["my-area", "my-missing"].every((id) => byId(T.pm, id)?.scopeLabel.includes(prjXName)),
  T.pm.all.map((x) => `${x.id}:${x.scopeLabel}`).join(" | "),
);
const wide = await tiles(approver, { orgUnitId: MEIL });
check(
  "Corporate ESG choosing the whole group is not widened: the same scope caption",
  byId(wide, "approval-queue")?.scopeLabel === byId(T.approver, "approval-queue")?.scopeLabel,
  byId(wide, "approval-queue")?.scopeLabel,
);
const narrow = await tiles(approver, { orgUnitId: PRJ_X });
check(
  "Corporate ESG choosing Project X: the unit-based tiles narrow to it",
  byId(narrow, "approval-queue")?.scopeLabel.includes(prjXName) &&
    !byId(narrow, "approval-queue")?.scopeLabel.includes(subAName),
  byId(narrow, "approval-queue")?.scopeLabel,
);
const outsideRoot = await tiles(pm, { orgUnitId: SUB_A });
check(
  "Project Manager choosing a unit above its own sees its own units, not the unit chosen",
  byId(outsideRoot, "my-area")?.scopeLabel.includes(prjXName),
);
const saNarrow = await tiles(admin, { orgUnitId: PRJ_X });
check(
  "Super Admin choosing Project X: unit tiles narrow, system tiles do not",
  byId(saNarrow, "approval-queue")?.scopeLabel.includes(prjXName) &&
    /Whole group|All \d+ groups|MEIL/.test(byId(saNarrow, "factors")?.scopeLabel ?? "") === true,
  `${byId(saNarrow, "approval-queue")?.scopeLabel} / ${byId(saNarrow, "factors")?.scopeLabel}`,
);

section("Ordering: overdue, then returned or failed, then pending, then summaries");
for (const [who, t] of Object.entries(T)) {
  const u = t.band.map((x) => x.urgency);
  check(
    `${who}: the "Needs action" band is ordered by urgency and holds only tiles with something to do`,
    u.every((v, i) => i === 0 || v >= u[i - 1]) &&
      t.band.every((x) => x.urgency < 3 && (x.count ?? 0) > 0),
    u.join(","),
  );
}

section("Refusals and bad input");
const signedOut = await new Session().query("dashboard.tiles");
check(
  "signed out: no tiles",
  signedOut.status !== 200 && !signedOut.data,
  `status ${signedOut.status}`,
);
check(
  "a malformed unit id is refused, not guessed at",
  (await approver.query("dashboard.tiles", { orgUnitId: "not-a-uuid" })).status === 400,
);
const unknownUnit = await tiles(approver, { orgUnitId: "00000000-0000-4000-8000-000000000000" });
check(
  "a unit that does not exist leaves only tiles that are not about units",
  ok(unknownUnit.r) && !has(unknownUnit, "approval-queue") && has(unknownUnit, "period"),
  ids(unknownUnit).join(", "),
);

await finish();
