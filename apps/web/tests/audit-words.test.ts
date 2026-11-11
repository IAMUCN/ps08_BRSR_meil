import assert from "node:assert/strict";
import { test } from "node:test";
import { actionLabel, actionsForWord, suggest, wordMatches } from "../lib/audit/words.ts";

// The Audit Trail's rule-based context search (owner's page feedback, 2026-11-11).

const CODES = [
  "approval.approved",
  "approval.submitted",
  "document.uploaded",
  "verification.confirmed",
  "verification.field_edited",
  "period.closed",
];

test("plain wording for known and unknown actions", () => {
  assert.equal(actionLabel("document.uploaded"), "Uploaded a document");
  assert.equal(actionLabel("document.bundle_confirmed"), "Document bundle confirmed");
});

test("word forms find the same actions", () => {
  for (const word of ["approve", "approved", "approval", "APPROVAL"]) {
    assert.deepEqual(actionsForWord(word, CODES), ["approval.approved", "approval.submitted"]);
  }
  assert.deepEqual(actionsForWord("verified", CODES), [
    "verification.confirmed",
    "verification.field_edited",
  ]);
  assert.deepEqual(actionsForWord("upload", CODES), ["document.uploaded"]);
  // A prefix still being typed matches the start of a word.
  assert.deepEqual(actionsForWord("clo", CODES), ["period.closed"]);
  assert.deepEqual(actionsForWord("x", CODES), []);
});

test("matching ignores case and punctuation, not unrelated words", () => {
  assert.ok(wordMatches("grid", "Grid Electricity"));
  assert.ok(!wordMatches("diesel", "Grid Electricity"));
});

test("suggestions are grouped, every typed word must match, any order", () => {
  const found = suggest("electricity grid", {
    users: [{ id: "u1", name: "Bal Krishna" }],
    roles: [{ code: "ehs", name: "EHS" }],
    eventTypes: CODES,
    activities: ["Grid Electricity", "Diesel"],
    orgUnits: ["MSRTC e-bus order"],
    periods: ["September 2026"],
  });
  assert.deepEqual(found, [
    {
      group: "Activities",
      label: "Grid Electricity",
      set: { key: "q", value: "Grid Electricity" },
    },
  ]);
  const person = suggest("bal", {
    users: [{ id: "u1", name: "Bal Krishna" }],
    roles: [],
    eventTypes: [],
    activities: [],
    orgUnits: [],
    periods: [],
  });
  assert.deepEqual(person[0].set, { key: "user", value: "u1" });
  assert.deepEqual(
    suggest("approved", {
      users: [],
      roles: [],
      eventTypes: CODES,
      activities: [],
      orgUnits: [],
      periods: [],
    }).map((s) => s.label),
    ["Approved a record", "Record sent for approval"],
  );
});
