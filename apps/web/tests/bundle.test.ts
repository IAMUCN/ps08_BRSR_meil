import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import {
  buildManifestData,
  buildReadmeText,
  computeSha256,
  formatChecksums,
  safeArchiveDocPath,
  sanitizeFilename,
  toCsv,
} from "../lib/reports/bundle-utils.ts";

test("bundle filename sanitization: prevents path traversal and dangerous characters", () => {
  assert.equal(sanitizeFilename("../../../etc/passwd"), "passwd");
  assert.equal(sanitizeFilename("foo/bar\\baz:qux*text?.pdf"), "baz_qux_text_.pdf");
  assert.equal(sanitizeFilename('test"file<name>|pipe'), "test_file_name__pipe");
  assert.equal(sanitizeFilename("   spaced   name   "), "spaced name");
  assert.equal(sanitizeFilename(""), "document");
  assert.equal(sanitizeFilename("   "), "document");
  assert.equal(sanitizeFilename(".."), "document");
});

test("bundle safeArchiveDocPath: deterministically isolates documents by UUID", () => {
  const docId = "550e8400-e29b-41d4-a716-446655440000";
  assert.equal(
    safeArchiveDocPath(docId, "electricity-bill-july.pdf"),
    `evidence/documents/${docId}.pdf`,
  );
  assert.equal(
    safeArchiveDocPath(docId, "invoice..backup.jpg"),
    `evidence/documents/${docId}.jpg`,
  );
  assert.equal(
    safeArchiveDocPath(docId, "../../unsafe-path.png"),
    `evidence/documents/${docId}.png`,
  );
  assert.equal(
    safeArchiveDocPath(docId, "noextension"),
    `evidence/documents/${docId}.bin`,
  );
});

test("bundle toCsv: correctly escapes quotes, commas, newlines and nulls", () => {
  const headers = ["id", "description", "value", "optional"];
  const rows = [
    ["1", "Simple description", 100, null],
    ["2", 'Description with "quotes" and , comma', 200, undefined],
    ["3", "Multiline\nValue", 300, true],
  ];

  const csv = toCsv(headers, rows);
  assert.ok(csv.includes("id,description,value,optional"));
  assert.ok(csv.includes("1,Simple description,100,"));
  assert.ok(csv.includes('2,"Description with ""quotes"" and , comma",200,'));
  assert.ok(csv.includes('3,"Multiline\nValue",300,true'));
});

test("bundle checksums: computes SHA-256 and formats sha256sum lines without self-reference", () => {
  const file1Content = "Metrics Data Content";
  const file2Content = "Evidence Document Content";

  const hash1 = computeSha256(file1Content);
  const hash2 = computeSha256(file2Content);

  assert.match(hash1, /^[a-f0-9]{64}$/);
  assert.match(hash2, /^[a-f0-9]{64}$/);
  assert.notEqual(hash1, hash2);

  const manifest = [
    { path: "data/metrics.csv", sha256: hash1 },
    { path: "evidence/doc.pdf", sha256: hash2 },
    { path: "checksums.sha256", sha256: "dummy-self-hash" },
  ];

  const formatted = formatChecksums(manifest);
  assert.ok(!formatted.includes("checksums.sha256"), "Must not include checksums.sha256 in its own list");
  assert.ok(formatted.includes(`${hash1}  data/metrics.csv\r\n`));
  assert.ok(formatted.includes(`${hash2}  evidence/doc.pdf\r\n`));
});

test("bundle manifest: calculates traceability completeness and records scope and counts", () => {
  const manifest = buildManifestData({
    bundleId: "test-bundle-123",
    generatedAt: "2026-10-10T20:00:00.000Z",
    scope: {
      organization: { id: "org-1", code: "MEIL-HQ", name: "MEIL Corporate HQ", type: "headquarters" },
      coverage: "FY 2026-27",
      financialYear: 2026,
      reportingPeriodId: null,
      requestedBy: { id: "usr-1", name: "Compliance Officer", role: "lead_verifier" },
    },
    counts: {
      totalRecords: 10,
      approvedRecords: 8,
      verifiedRecords: 9,
      documentsCount: 7,
      calculationsCount: 10,
      missingEvidenceCount: 2,
      auditEventsCount: 25,
    },
    files: [
      { path: "README.md", size: 100, sha256: "abc" },
      { path: "data/metrics.csv", size: 500, sha256: "def" },
    ],
  });

  assert.equal(manifest.bundleId, "test-bundle-123");
  assert.equal(manifest.scope.organization.code, "MEIL-HQ");
  // 10 records total, 2 missing evidence -> (10 - 2)/10 = 80% completeness
  assert.equal(manifest.traceabilityCompletenessPercent, 80);
  assert.equal(manifest.counts.approvedRecords, 8);
  assert.equal(manifest.counts.missingEvidenceCount, 2);

  // Edge case: 0 records
  const emptyManifest = buildManifestData({
    bundleId: "test-empty",
    generatedAt: "2026-10-10T20:00:00.000Z",
    scope: manifest.scope,
    counts: {
      totalRecords: 0,
      approvedRecords: 0,
      verifiedRecords: 0,
      documentsCount: 0,
      calculationsCount: 0,
      missingEvidenceCount: 0,
      auditEventsCount: 0,
    },
    files: [],
  });
  assert.equal(emptyManifest.traceabilityCompletenessPercent, 100);
});

test("bundle readme: formats complete assurance context with all required sections", () => {
  const readme = buildReadmeText({
    bundleId: "bundle-xyz",
    generatedAt: "2026-10-10T20:00:00.000Z",
    orgName: "MEIL Infra Division",
    orgCode: "MEIL-INFRA",
    coverageLabel: "FY 2026-27",
    userName: "Auditor John",
    userRole: "Auditor",
    counts: {
      totalRecords: 15,
      approvedRecords: 12,
      verifiedRecords: 14,
      documentsCount: 8,
      calculationsCount: 15,
      missingEvidenceCount: 1,
      auditEventsCount: 40,
    },
  });

  assert.ok(readme.includes("bundle-xyz"));
  assert.ok(readme.includes("MEIL Infra Division"));
  assert.ok(readme.includes("MEIL-INFRA"));
  assert.ok(readme.includes("Auditor John"));
  assert.ok(readme.includes("SSAE 3000"));
  assert.ok(readme.includes("Total ESG Records**: 15"));
  assert.ok(readme.includes("Missing Evidence Records**: 1"));
  assert.ok(readme.includes("sha256sum -c checksums.sha256"));
});

test("synthetic bundle archive: produces valid ZIP with matching SHA-256 cryptographic hashes", async () => {
  const zip = new JSZip();
  const fileEntries: Array<{ path: string; size: number; sha256: string }> = [];

  const addFile = (path: string, content: string | Buffer) => {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const hash = computeSha256(buf);
    fileEntries.push({ path, size: buf.length, sha256: hash });
    zip.file(path, buf);
  };

  // Add all bundle components
  const metricsCsv = toCsv(
    ["record_id", "metric_code", "activity_value", "activity_unit", "verification_status"],
    [
      ["rec-1", "E-1", 1250, "kWh", "user_verified"],
      ["rec-2", "E-2", 450, "litres", "ocr_completed"],
    ],
  );
  addFile("data/metrics.csv", metricsCsv);

  const calcCsv = toCsv(
    ["calculation_id", "record_id", "result_value", "result_unit", "version"],
    [["calc-1", "rec-1", 1.025, "tCO2e", 1]],
  );
  addFile("data/calculations.csv", calcCsv);

  const syntheticPdfBytes = Buffer.from("%PDF-1.4 synthetic invoice content for testing");
  const docPath = safeArchiveDocPath("doc-uuid-1", "power-bill.pdf");
  addFile(docPath, syntheticPdfBytes);

  const missingCsv = toCsv(
    ["record_id", "metric_code", "reason"],
    [["rec-2", "E-2", "No document linked"]],
  );
  addFile("limitations/missing-evidence.csv", missingCsv);

  // Add manifest
  const manifest = buildManifestData({
    bundleId: "bundle-synth-001",
    generatedAt: "2026-10-10T20:00:00.000Z",
    scope: {
      organization: { id: "o1", code: "MEIL", name: "MEIL" },
      coverage: "FY 2026-27",
      financialYear: 2026,
      reportingPeriodId: null,
      requestedBy: { id: "u1", name: "Test Auditor", role: "auditor" },
    },
    counts: {
      totalRecords: 2,
      approvedRecords: 1,
      verifiedRecords: 1,
      documentsCount: 1,
      calculationsCount: 1,
      missingEvidenceCount: 1,
      auditEventsCount: 5,
    },
    files: fileEntries,
  });
  addFile("manifest.json", JSON.stringify(manifest, null, 2));

  // Add checksums
  const checksumsText = formatChecksums(fileEntries);
  addFile("checksums.sha256", checksumsText);

  // Generate ZIP
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  assert.ok(zipBuffer.length > 0, "ZIP buffer must not be empty");

  // Read back ZIP and verify contents
  const unzipped = await JSZip.loadAsync(zipBuffer);

  // Verify all expected files are present
  assert.ok(unzipped.file("data/metrics.csv"), "data/metrics.csv must exist in ZIP");
  assert.ok(unzipped.file("data/calculations.csv"), "data/calculations.csv must exist in ZIP");
  assert.ok(unzipped.file(docPath), `${docPath} must exist in ZIP`);
  assert.ok(unzipped.file("limitations/missing-evidence.csv"), "limitations/missing-evidence.csv must exist");
  assert.ok(unzipped.file("manifest.json"), "manifest.json must exist in ZIP");
  assert.ok(unzipped.file("checksums.sha256"), "checksums.sha256 must exist in ZIP");

  // Verify every checksum in checksums.sha256 matches unzipped file bytes
  for (const entry of fileEntries) {
    if (entry.path === "checksums.sha256") continue;
    const file = unzipped.file(entry.path);
    assert.ok(file, `File ${entry.path} listed in manifest must exist in archive`);
    const content = await file.async("nodebuffer");
    const actualHash = computeSha256(content);
    assert.equal(
      actualHash,
      entry.sha256,
      `SHA-256 for ${entry.path} must match checksum in manifest`,
    );
  }

  // Verify that modified file fails checksum verification
  const tamperedContent = Buffer.from("tampered bytes");
  const tamperedHash = computeSha256(tamperedContent);
  const originalEntry = fileEntries.find((f) => f.path === docPath);
  assert.notEqual(tamperedHash, originalEntry?.sha256);
});
