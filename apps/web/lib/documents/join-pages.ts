import { degrees, PDFDocument } from "pdf-lib";

// One upload of several files (owner's request, 2026-11-12; .grill/merged-upload-decisions.md): their pages,
// in the order they were dropped, become one PDF that the OCR worker reads and the uploader splits into
// bills. A photo becomes one page at its own resolution: the worker renders PDF pages at 200 dpi, so a page
// of (pixels × 72 / 200) points comes back at the photo's own size. The originals are kept as they are.
// No server-only imports, so the unit tests can run it; only the server calls it.

const RENDER_DPI = 200;

export type JoinSource = { bytes: Uint8Array; mimeType: string };

/** Pages one file adds: a PDF's page count, a photo one. */
export async function pagesIn(source: JoinSource): Promise<number> {
  if (source.mimeType !== "application/pdf") return 1;
  return (await PDFDocument.load(source.bytes, { updateMetadata: false })).getPageCount();
}

/**
 * The EXIF orientation of a JPEG (1 when it has none): phone photos are stored sideways with a tag saying
 * how to turn them. Only the tag is read; the picture is not decoded.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
      const tiff = offset + 10;
      if (tiff + 8 > view.byteLength) return 1;
      const little = view.getUint16(tiff) === 0x4949;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      if (ifd + 2 > view.byteLength) return 1;
      const entries = view.getUint16(ifd, little);
      for (let i = 0; i < entries; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > view.byteLength) return 1;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 1;
    offset += 2 + size;
  }
  return 1;
}

const TURN: Record<number, number> = { 3: 180, 6: 90, 8: 270 };

/** The files' pages, one after another, as one PDF. */
export async function joinPages(sources: readonly JoinSource[]): Promise<Uint8Array> {
  const out = await PDFDocument.create({ updateMetadata: false });
  for (const source of sources) {
    if (source.mimeType === "application/pdf") {
      const pdf = await PDFDocument.load(source.bytes, { updateMetadata: false });
      for (const page of await out.copyPages(pdf, pdf.getPageIndices())) out.addPage(page);
      continue;
    }
    const jpeg = source.mimeType === "image/jpeg";
    const image = jpeg ? await out.embedJpg(source.bytes) : await out.embedPng(source.bytes);
    const width = (image.width * 72) / RENDER_DPI;
    const height = (image.height * 72) / RENDER_DPI;
    const page = out.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
    // A sideways phone photo is shown (and read) the right way up.
    const turn = jpeg ? TURN[jpegOrientation(source.bytes)] : undefined;
    if (turn) page.setRotation(degrees(turn));
  }
  return out.save();
}
