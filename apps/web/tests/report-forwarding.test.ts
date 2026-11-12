import assert from "node:assert/strict";
import { test } from "node:test";
import { recipientUnits } from "../lib/reports/forwarding.ts";

// MEIL > Olectra > (EV project, Depot) ; MEIL > EVEY ; Shared under Olectra and EVEY
const nodes = [
  { id: "meil", parentId: null, alsoUnder: [] },
  { id: "olectra", parentId: "meil", alsoUnder: [] },
  { id: "evey", parentId: "meil", alsoUnder: [] },
  { id: "ev", parentId: "olectra", alsoUnder: [] },
  { id: "depot", parentId: "ev", alsoUnder: [] },
  { id: "shared", parentId: "olectra", alsoUnder: ["evey"] },
];

test("a report goes to the Administrators of the next unit up", () => {
  assert.deepEqual(recipientUnits(nodes, "ev", new Set(["olectra"])), ["olectra"]);
});

test("a unit without an Administrator is passed over", () => {
  assert.deepEqual(recipientUnits(nodes, "depot", new Set(["olectra"])), ["olectra"]);
});

test("with nobody above, it goes to the Super Admins", () => {
  assert.deepEqual(recipientUnits(nodes, "ev", new Set()), [null]);
  assert.deepEqual(recipientUnits(nodes, "meil", new Set(["olectra"])), [null], "a group");
});

test("never to the unit itself", () => {
  assert.deepEqual(recipientUnits(nodes, "olectra", new Set(["olectra"])), [null]);
});

test("a unit under several parents goes to each parent's Administrators, once each", () => {
  assert.deepEqual(recipientUnits(nodes, "shared", new Set(["olectra", "evey"])), [
    "olectra",
    "evey",
  ]);
  assert.deepEqual(
    recipientUnits(nodes, "shared", new Set(["meil"])),
    ["meil"],
    "both lead to MEIL",
  );
});

test("an unknown unit has no recipients", () => {
  assert.deepEqual(recipientUnits(nodes, "nowhere", new Set(["meil"])), []);
});
