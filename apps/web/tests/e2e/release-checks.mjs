// Release checks (feature_enhancement.md 10.2) that no other script covers: a file just under the upload limit
// goes through the real upload path (signed URL, the server re-reading and fingerprinting every byte, the
// record and its OCR job), timed; the stored copy matches what was sent. Local stack only.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { WEB, check, finish, ok, one, section, setup, sql, upload } from "./lib.mjs";

const { PDFDocument, StandardFonts } = createRequire(`${WEB}/package.json`)("pdf-lib");
const { sessions } = await setup();
const { pm } = sessions;

section("A 48 MB PDF through the upload path");
const doc = await PDFDocument.create();
const page = doc.addPage([595, 842]);
page.drawText("RELEASE CHECK - LARGE FILE - NOT A REAL INVOICE", {
  x: 40,
  y: 780,
  size: 12,
  font: await doc.embedFont(StandardFonts.Helvetica),
});
// Random bytes do not compress, so the attachment keeps the file at its size.
const pad = new Uint8Array(48 * 1024 * 1024 - 4096);
for (let i = 0; i < pad.length; i += 65536)
  crypto.getRandomValues(pad.subarray(i, Math.min(i + 65536, pad.length)));
await doc.attach(pad, "padding.bin", { mimeType: "application/octet-stream" });
const bytes = Buffer.from(await doc.save({ useObjectStreams: false }));
check(
  `the test file is ${(bytes.length / 1024 / 1024).toFixed(1)} MB, under the 50 MB limit`,
  bytes.length > 45 * 1024 * 1024 && bytes.length < 50 * 1024 * 1024,
);

const started = Date.now();
const result = await upload(pm, bytes, `release-large-${Date.now()}.pdf`);
const seconds = (Date.now() - started) / 1000;
check(
  `it is accepted end to end (${seconds.toFixed(1)} s on this machine)`,
  ok(result.prepared) && ok(result.completed) && !!result.documentId,
  result.completed?.error ?? result.prepared?.error,
);
check("…within a minute", seconds < 60);
const stored = await one(sql`
  select d.file_size_bytes::bigint as size, d.file_hash, j.status::text as job
  from public.documents d left join public.ocr_jobs j on j.document_id = d.id where d.id = ${result.documentId}`);
check(
  "the stored copy has the same size and fingerprint, and waits for OCR",
  Number(stored?.size) === bytes.length &&
    stored.file_hash === createHash("sha256").update(bytes).digest("hex") &&
    stored.job === "pending",
  JSON.stringify(stored),
);

await finish();
