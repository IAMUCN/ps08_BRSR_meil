// Multi-bill PDF rules (.grill/multi-bill-pdf-decisions.md). Pure — shared by the review screen and the
// server, so what the screen allows is exactly what the server accepts.

/** Same number as the OCR worker's BUNDLE_MAX_PAGES: longer PDFs are refused at upload. */
export const BUNDLE_MAX_PAGES = 20;
/** Bills cut from one PDF; one page each at most. */
export const MAX_BUNDLE_PARTS = BUNDLE_MAX_PAGES;

export type BundlePartInput = {
  /** 1-based, inclusive. */
  pageFrom: number;
  pageTo: number;
  metricId: string | null;
  skip: boolean;
};

export function pagesLabel(pageFrom: number, pageTo: number): string {
  return pageFrom === pageTo ? `page ${pageFrom}` : `pages ${pageFrom}–${pageTo}`;
}

/**
 * The uploader's final split, or the first problem with it. Each page belongs to at most one bill; pages
 * not in any bill are simply left out. A bill that is kept needs an activity.
 */
export function checkBundleParts(
  parts: readonly BundlePartInput[],
  pageCount: number,
): string | null {
  if (parts.length === 0) return "Add at least one bill.";
  if (parts.length > MAX_BUNDLE_PARTS) return `At most ${MAX_BUNDLE_PARTS} bills per PDF.`;
  const owner = new Map<number, number>();
  for (const [index, part] of parts.entries()) {
    const label = `Bill ${index + 1}`;
    if (
      !Number.isInteger(part.pageFrom) ||
      !Number.isInteger(part.pageTo) ||
      part.pageFrom < 1 ||
      part.pageTo < part.pageFrom
    ) {
      return `${label}: enter a first and last page, the last not before the first.`;
    }
    if (part.pageTo > pageCount) {
      return `${label}: the PDF has only ${pageCount} ${pageCount === 1 ? "page" : "pages"}.`;
    }
    for (let page = part.pageFrom; page <= part.pageTo; page++) {
      const other = owner.get(page);
      if (other !== undefined)
        return `Bills ${other + 1} and ${index + 1} both include page ${page}.`;
      owner.set(page, index);
    }
    if (!part.skip && !part.metricId) return `${label}: choose what it is evidence for.`;
  }
  if (parts.every((p) => p.skip)) return "Keep at least one bill, or leave this page.";
  return null;
}
