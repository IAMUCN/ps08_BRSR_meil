import "server-only";
import { PDFDocument } from "pdf-lib";

// Cutting one bill out of a multi-bill PDF (.grill/multi-bill-pdf-decisions.md). Each bill becomes its own
// PDF with its own hash, so it is ordinary evidence everywhere else in the app.

export async function pdfPageCount(bytes: Uint8Array): Promise<number> {
  // Encryption is rejected earlier (checkFileContent); a PDF this can't read is damaged.
  return (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
}

/** Pages `pageFrom`..`pageTo` (1-based, inclusive) as a new PDF. */
export async function extractPages(
  bytes: Uint8Array,
  pageFrom: number,
  pageTo: number,
): Promise<Uint8Array> {
  const source = await PDFDocument.load(bytes, { updateMetadata: false });
  const target = await PDFDocument.create();
  const indexes = Array.from({ length: pageTo - pageFrom + 1 }, (_, i) => pageFrom - 1 + i);
  for (const page of await target.copyPages(source, indexes)) target.addPage(page);
  return target.save();
}
