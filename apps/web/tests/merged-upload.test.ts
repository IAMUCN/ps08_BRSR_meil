import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import { billingFits, periodForBill } from "../lib/documents/bundle.ts";
import { joinPages, jpegOrientation, pagesIn } from "../lib/documents/join-pages.ts";

// One upload for every bill (owner's request, 2026-11-12; .grill/merged-upload-decisions.md).

const PERIODS = [
  { id: "sep", startDate: "2026-09-01", endDate: "2026-09-30" },
  { id: "aug", startDate: "2026-08-01", endDate: "2026-08-31" },
];

test("a bill's reporting period comes from its billing period", () => {
  assert.equal(periodForBill("01-08-2026 to 31-08-2026", PERIODS), "aug");
  assert.equal(periodForBill("05-Sep-2026", PERIODS), "sep");
  // A bill running across a month end belongs to the month it ends in.
  assert.equal(periodForBill("16-08-2026 to 15-09-2026", PERIODS), "sep");
  // Ending after every period: the one it overlaps most.
  assert.equal(periodForBill("20-09-2026 to 10-10-2026", PERIODS), "sep");
  assert.equal(periodForBill("01-01-2026 to 31-01-2026", PERIODS), null, "no open period");
  assert.equal(periodForBill(null, PERIODS), null);
  assert.equal(periodForBill("next month", PERIODS), null);
});

test("a billing period fits its reporting period when the two touch", () => {
  const aug = PERIODS[1];
  assert.equal(billingFits("01-08-2026 to 31-08-2026", aug), true);
  assert.equal(billingFits("25-07-2026 to 05-08-2026", aug), true);
  assert.equal(billingFits("01-09-2026 to 30-09-2026", aug), false);
  assert.equal(billingFits("unreadable", aug), null);
});

const SAMPLES = "../../test data/April 2025/documents/BEST Mumbai e-buses/EHS - Environment";
const jpeg = new Uint8Array(readFileSync(`${SAMPLES}/043 PM_EMISSIONS.jpg`));
const png = new Uint8Array(readFileSync(`${SAMPLES}/027 WASTE_DISPOSED.png`));
const pdf = new Uint8Array(readFileSync(`${SAMPLES}/026 WATER_CONSUMPTION.pdf`));

/** The same JPEG with an EXIF block saying "turn 90° clockwise", as a phone writes it. */
function withOrientation(bytes: Uint8Array, orientation: number): Uint8Array {
  // Big-endian TIFF header, IFD at 8; one entry: tag 0x0112 (orientation), SHORT, count 1; no next IFD.
  const hex = `4d4d002a00000008 0001 0112 0003 00000001 00${orientation.toString(16).padStart(2, "0")}0000 00000000`;
  const tiff = hex
    .replace(/ /g, "")
    .match(/../g)!
    .map((h) => parseInt(h, 16));
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = payload.length + 2;
  const app1 = [0xff, 0xe1, length >> 8, length & 0xff, ...payload];
  return new Uint8Array([0xff, 0xd8, ...app1, ...bytes.slice(2)]);
}

test("the EXIF orientation of a phone photo is read", () => {
  assert.equal(jpegOrientation(jpeg), 1, "a photo without the tag");
  assert.equal(jpegOrientation(withOrientation(jpeg, 6)), 6);
  assert.equal(jpegOrientation(png), 1, "not a JPEG");
});

test("several files become one PDF, pages in the order dropped, photos the right way up", async () => {
  const sources = [
    { bytes: pdf, mimeType: "application/pdf" },
    { bytes: withOrientation(jpeg, 6), mimeType: "image/jpeg" },
    { bytes: png, mimeType: "image/png" },
  ];
  const counts = await Promise.all(sources.map(pagesIn));
  const joined = await PDFDocument.load(await joinPages(sources));
  assert.equal(
    joined.getPageCount(),
    counts.reduce((a, b) => a + b, 0),
  );
  const [photo, picture] = joined.getPages().slice(counts[0]);
  assert.equal(photo.getRotation().angle, 90, "the sideways photo is turned");
  assert.equal(picture.getRotation().angle, 0);
  // 200 dpi: a page of (pixels × 72 / 200) points renders at the photo's own size.
  const image = await (await PDFDocument.create()).embedPng(png);
  assert.ok(Math.abs(picture.getWidth() - (image.width * 72) / 200) < 0.01);
});
