import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadTargets } from "../lib/documents/rules.ts";
import type { OrgNode } from "../lib/org/rules.ts";
import { acceptedTypesLabel, checkFileContent, evidencePath } from "../lib/storage/evidence.ts";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)),
  );

test("file content: real type from bytes, complete files only", () => {
  assert.deepEqual(checkFileContent(bytes("%PDF-1.7\n...\n%%EOF\n")), {
    ok: true,
    mimeType: "application/pdf",
  });
  assert.equal(checkFileContent(bytes("%PDF-1.7\n... truncated")).ok, false);
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.deepEqual(
    checkFileContent(bytes(png, "data", [0, 0, 0, 0], "IEND", [0xae, 0x42, 0x60, 0x82])),
    {
      ok: true,
      mimeType: "image/png",
    },
  );
  assert.equal(checkFileContent(bytes(png, "data")).ok, false);
  assert.deepEqual(checkFileContent(bytes([0xff, 0xd8, 0xff, 0xe0], "data", [0xff, 0xd9])), {
    ok: true,
    mimeType: "image/jpeg",
  });
  assert.equal(checkFileContent(bytes([0xff, 0xd8, 0xff, 0xe0], "data")).ok, false);
  // A renamed text file claiming to be a PDF, and an empty file.
  assert.equal(checkFileContent(bytes("hello, not a pdf")).ok, false);
  assert.equal(checkFileContent(new Uint8Array()).ok, false);
});

test("file content: password-protected PDFs are rejected", () => {
  const result = checkFileContent(bytes("%PDF-1.4\ntrailer << /Encrypt 5 0 R >>\n%%EOF"));
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.reason : "", /password-protected/);
});

test("evidence path follows schema §15 and refuses unknown types", () => {
  assert.equal(evidencePath("o", "p", "d", "image/jpeg"), "o/p/d/original.jpg");
  assert.equal(evidencePath("o", "p", "d", "text/html"), null);
  assert.equal(
    acceptedTypesLabel(["application/pdf", "image/jpeg", "image/png"]),
    "PDF, JPG or PNG",
  );
});

test("upload targets: assigned node + active descendants, categories by owning role", () => {
  const nodes: OrgNode[] = [
    { id: "group", parentId: null, unitType: "group", status: "active" },
    { id: "prj", parentId: "group", unitType: "project", status: "active" },
    { id: "site", parentId: "prj", unitType: "site", status: "active" },
    { id: "old-site", parentId: "prj", unitType: "site", status: "inactive" },
    { id: "dept", parentId: "old-site", unitType: "department", status: "active" },
    { id: "other", parentId: "group", unitType: "project", status: "active" },
  ];
  const categories = [
    { id: "fuel", owningRoleId: "pm" },
    { id: "workforce", owningRoleId: "hr" },
    { id: "shared", owningRoleId: null },
  ];
  const targets = uploadTargets(
    nodes,
    [{ orgUnitId: "prj", roleId: "pm" }],
    new Set(["pm"]),
    categories,
  );
  assert.deepEqual([...targets.keys()].sort(), ["prj", "site"]); // frozen subtree and siblings excluded
  assert.deepEqual(targets.get("site"), ["fuel", "shared"]);

  // A role without the upload permission grants nothing; no matching category means no target.
  assert.equal(
    uploadTargets(nodes, [{ orgUnitId: "prj", roleId: "viewer" }], new Set(["pm"]), categories)
      .size,
    0,
  );
  assert.equal(
    uploadTargets(nodes, [{ orgUnitId: "prj", roleId: "hr" }], new Set(["hr"]), [
      { id: "fuel", owningRoleId: "pm" },
    ]).size,
    0,
  );
  // A role that uploads on behalf of another (migration 0049) is offered that role's categories at its
  // own org units, nothing else, and only if it holds the upload permission itself.
  const behalf = new Map([["emp", "pm"]]);
  const forEmployee = uploadTargets(
    nodes,
    [{ orgUnitId: "site", roleId: "emp" }],
    new Set(["emp"]),
    categories,
    behalf,
  );
  assert.deepEqual([...forEmployee.keys()], ["site"]);
  assert.deepEqual(forEmployee.get("site"), ["fuel", "shared"]);
  assert.equal(
    uploadTargets(
      nodes,
      [{ orgUnitId: "site", roleId: "emp" }],
      new Set(["pm"]),
      categories,
      behalf,
    ).size,
    0,
  );
  // Without the setting the same role gets only what every role gets.
  assert.deepEqual(
    uploadTargets(nodes, [{ orgUnitId: "site", roleId: "emp" }], new Set(["emp"]), categories).get(
      "site",
    ),
    ["shared"],
  );
});
