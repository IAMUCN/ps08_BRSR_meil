import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arrange,
  buildFacts,
  mapLimit,
  narrowScope,
  narrowTiles,
  TILES,
  visibleTiles,
  type TileData,
} from "../lib/dashboard/tiles.ts";

// The role-wise dashboard's registry, visibility, multi-role merging and ordering (Phase 2).

//   group
//   ├─ subS ── projS
//   └─ projA
const subtree = {
  group: ["group", "subS", "projS", "projA"],
  subS: ["subS", "projS"],
  projS: ["projS"],
  projA: ["projA"],
};

const ids = (facts: ReturnType<typeof buildFacts>) => visibleTiles(TILES, facts).map((t) => t.id);

const superAdmin = buildFacts({ isAdmin: true, isOrgAdmin: false, grants: [], subtree });
const projectManager = buildFacts({ isAdmin: false, isOrgAdmin: false, grants: [], subtree });
const corporateEsg = buildFacts({
  isAdmin: false,
  isOrgAdmin: false,
  grants: [
    { permission: "approval.decide", orgUnitId: "subS", atGroup: false },
    { permission: "monitoring.view", orgUnitId: "subS", atGroup: false },
    { permission: "validation.review", orgUnitId: "subS", atGroup: false },
  ],
  subtree,
});

test("everyone gets the personal tiles and nothing else without a permission", () => {
  assert.deepEqual(ids(projectManager), ["period", "my-tasks", "returned", "notifications"]);
});

test("a Super Admin sees every tile except a functional role's own work", () => {
  const roleTiles = TILES.filter((t) => t.requires.kind === "role").map((t) => t.id);
  assert.ok(roleTiles.length > 0);
  assert.deepEqual(
    TILES.map((t) => t.id).filter((id) => !roleTiles.includes(id)),
    ids(superAdmin),
  );
  assert.ok(ids(superAdmin).includes("system-health"));
  assert.ok(ids(superAdmin).includes("factors"));
  assert.ok(ids(superAdmin).includes("users-access"));
});

test("role tiles: a functional role sees its area, covering only the units where it is assigned", () => {
  const hr = buildFacts({
    isAdmin: false,
    isOrgAdmin: false,
    grants: [],
    roleGrants: [{ role: "hr", orgUnitId: "subS" }],
    subtree,
  });
  assert.ok(ids(hr).includes("my-area"));
  assert.ok(ids(hr).includes("my-missing"));
  assert.ok(!ids(hr).includes("certificates"), "certificates belong to EHS");
  assert.ok(
    !ids(hr).includes("unit-emissions"),
    "emissions of your units belong to the Project Manager",
  );
  const area = visibleTiles(TILES, hr).find((t) => t.id === "my-area");
  assert.deepEqual(area?.scope, {
    kind: "roles",
    grants: [{ role: "hr", units: ["subS", "projS"] }],
  });
});

test("role tiles: two roles at two units keep their own units apart", () => {
  const both = buildFacts({
    isAdmin: false,
    isOrgAdmin: false,
    grants: [],
    roleGrants: [
      { role: "hr", orgUnitId: "subS" },
      { role: "ehs", orgUnitId: "projA" },
    ],
    subtree,
  });
  const area = visibleTiles(TILES, both).find((t) => t.id === "my-area");
  assert.deepEqual(area?.scope, {
    kind: "roles",
    // In the order the tile names its roles.
    grants: [
      { role: "ehs", units: ["projA"] },
      { role: "hr", units: ["subS", "projS"] },
    ],
  });
  assert.equal(ids(both).filter((id) => id === "my-area").length, 1);
});

test("an Auditor sees evidence coverage through evidence.read, and nothing it cannot open", () => {
  const auditor = buildFacts({
    isAdmin: false,
    isOrgAdmin: false,
    grants: [
      { permission: "evidence.read", orgUnitId: "subS", atGroup: false },
      { permission: "monitoring.view", orgUnitId: "subS", atGroup: false },
    ],
    subtree,
  });
  const got = ids(auditor);
  assert.ok(got.includes("evidence-coverage"));
  assert.ok(got.includes("brsr-readiness"));
  assert.ok(!got.includes("approval-queue"));
  assert.ok(!got.includes("factors"));
});

test("Corporate ESG sees approvals and monitoring, not system health, and not the admin-only review tile", () => {
  const got = ids(corporateEsg);
  assert.ok(got.includes("approval-queue"));
  assert.ok(got.includes("missing-submissions"));
  assert.ok(got.includes("completion"));
  assert.ok(!got.includes("system-health"));
  // validation.review is held, but its page is an administrator's, so the tile would be a dead link.
  assert.ok(!got.includes("validation-review"));
});

test("an Administrator with the permission sees the review tile", () => {
  const admin = buildFacts({
    isAdmin: false,
    isOrgAdmin: true,
    grants: [{ permission: "validation.review", orgUnitId: "subS", atGroup: false }],
    subtree,
  });
  assert.ok(ids(admin).includes("validation-review"));
  assert.ok(!ids(admin).includes("system-health"));
});

test("a tile's scope is where a role holding its permission is assigned, not every assignment", () => {
  // Project Manager at A (no approval right) and Corporate ESG at S: approvals cover S only.
  const both = buildFacts({
    isAdmin: false,
    isOrgAdmin: false,
    grants: [{ permission: "approval.decide", orgUnitId: "subS", atGroup: false }],
    subtree,
  });
  const approvals = visibleTiles(TILES, both).find((t) => t.id === "approval-queue");
  assert.deepEqual(approvals?.scope, { kind: "units", units: ["subS", "projS"] });
  assert.ok(!(approvals?.scope.kind === "units" && approvals.scope.units.includes("projA")));
});

test("two roles holding the same permission merge their units, once each, and the tile appears once", () => {
  const facts = buildFacts({
    isAdmin: false,
    isOrgAdmin: false,
    grants: [
      { permission: "monitoring.view", orgUnitId: "subS", atGroup: false },
      { permission: "monitoring.view", orgUnitId: "projA", atGroup: false },
      { permission: "monitoring.view", orgUnitId: "projS", atGroup: false },
    ],
    subtree,
  });
  const tiles = visibleTiles([...TILES, ...TILES], facts);
  assert.equal(tiles.filter((t) => t.id === "completion").length, 1);
  const scope = tiles.find((t) => t.id === "completion")!.scope;
  assert.equal(scope.kind, "units");
  assert.deepEqual(scope.kind === "units" ? scope.units.sort() : [], ["projA", "projS", "subS"]);
});

test("a change of assignment changes what is seen", () => {
  assert.ok(!ids(projectManager).includes("approval-queue"));
  assert.ok(ids(corporateEsg).includes("approval-queue"));
});

const data = (id: string, urgency: 0 | 1 | 2 | 3, count: number | null): TileData => ({
  id,
  title: id,
  urgency,
  count,
  summary: "",
  href: "/",
  scopeLabel: "",
});

test("overdue comes before returned, returned before pending, and summaries are not in the band", () => {
  const { band, grid } = arrange(
    [
      data("my-tasks", 2, 3),
      data("returned", 1, 2),
      data("period", 0, 1),
      data("completion", 3, null),
      data("notifications", 3, 4),
    ],
    TILES,
  );
  assert.deepEqual(
    band.map((d) => d.id),
    ["period", "returned", "my-tasks"],
  );
  assert.deepEqual(
    grid.map((d) => d.id),
    ["notifications", "completion"],
  );
});

test("a tile with nothing to do leaves the band even when its urgency is high", () => {
  const { band, grid } = arrange([data("approval-queue", 2, 0), data("period", 0, 0)], TILES);
  assert.equal(band.length, 0);
  assert.deepEqual(
    grid.map((d) => d.id),
    ["period", "approval-queue"],
  );
});

test("within one urgency the registry's rank decides", () => {
  const { band } = arrange([data("my-tasks", 2, 1), data("approval-queue", 2, 1)], TILES);
  assert.deepEqual(
    band.map((d) => d.id),
    ["approval-queue", "my-tasks"],
  );
});

test("mapLimit never has more than the limit in flight and keeps the order", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3);
});

test("narrowing to a chosen unit only ever intersects: nobody gains a unit their permission does not cover", () => {
  const within = ["subS", "projS"];
  assert.deepEqual(narrowScope({ kind: "all" }, within), { kind: "units", units: within });
  assert.deepEqual(narrowScope({ kind: "units", units: ["subS", "projS", "projA"] }, within), {
    kind: "units",
    units: ["subS", "projS"],
  });
  // A unit outside the person's scope leaves nothing, so the tile goes.
  assert.equal(narrowScope({ kind: "units", units: ["projA"] }, within), null);
  assert.equal(narrowScope({ kind: "all" }, []), null);
  // No choice made: unchanged. Own records are not about units.
  assert.deepEqual(narrowScope({ kind: "units", units: ["projA"] }, null), {
    kind: "units",
    units: ["projA"],
  });
  assert.deepEqual(narrowScope({ kind: "self" }, within), { kind: "self" });
  assert.deepEqual(
    narrowScope(
      {
        kind: "roles",
        grants: [
          { role: "hr", units: ["subS", "projS"] },
          { role: "ehs", units: ["projA"] },
        ],
      },
      ["projS"],
    ),
    { kind: "roles", grants: [{ role: "hr", units: ["projS"] }] },
  );
});

test("narrowTiles: units-based tiles follow the choice, system tiles and own-record tiles do not", () => {
  const tiles = visibleTiles(TILES, superAdmin);
  const narrowed = narrowTiles(tiles, ["projA"]);
  const byId = (id: string) => narrowed.find((t) => t.id === id);
  assert.deepEqual(byId("approval-queue")?.scope, { kind: "units", units: ["projA"] });
  assert.deepEqual(byId("system-health")?.scope, { kind: "all" });
  assert.deepEqual(byId("factors")?.scope, { kind: "all" });
  assert.deepEqual(byId("period")?.scope, { kind: "self" });
  // A Corporate ESG user choosing a unit outside theirs keeps only the tiles that are not about units.
  const outside = narrowTiles(visibleTiles(TILES, corporateEsg), ["projA"]).map((t) => t.id);
  assert.ok(!outside.includes("approval-queue"));
  assert.ok(outside.includes("period"));
});
