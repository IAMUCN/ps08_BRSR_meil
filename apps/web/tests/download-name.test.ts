import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadName } from "../lib/documents/download-name.ts";

test("downloaded originals get a readable name from the record", () => {
  assert.equal(
    downloadName({
      fileName: "scan 0012.pdf",
      mimeType: "application/pdf",
      metricName: "Grid Electricity",
      billNumber: "TP/2026/123456",
      periodLabel: "August 2026",
    }),
    "Grid-Electricity_Bill-TP-2026-123456_August-2026.pdf",
  );
  assert.equal(
    downloadName({
      fileName: "IMG_20260901.jpg",
      mimeType: "image/jpeg",
      metricName: "Diesel",
      billNumber: null,
      periodLabel: "August 2026",
    }),
    "IMG_20260901.jpg",
    "no bill number: the uploader's own name",
  );
  assert.equal(
    downloadName({
      fileName: 'bad"name.pdf',
      mimeType: "application/pdf",
      metricName: null,
      billNumber: "1",
      periodLabel: null,
    }),
    "badname.pdf",
  );
});
