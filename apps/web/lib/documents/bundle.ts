// Upload and split rules (.grill/multi-bill-pdf-decisions.md, .grill/merged-upload-decisions.md). Pure —
// shared by the review screen and the server, so what the screen allows is exactly what the server accepts.

import { parseBillingPeriod } from "../validation/checks.ts";

/** Same number as the OCR worker's BUNDLE_MAX_PAGES: longer PDFs are refused at upload. */
export const BUNDLE_MAX_PAGES = 50;
/** Bills cut from one PDF; one page each at most. */
export const MAX_BUNDLE_PARTS = BUNDLE_MAX_PAGES;
/** Files in one upload (photos and PDFs); their pages together stay within BUNDLE_MAX_PAGES. */
export const MAX_UPLOAD_FILES = 30;
/** What one upload may hold. */
export const UPLOAD_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];

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

type PeriodRange = { id: string; startDate: string; endDate: string };

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * The reporting period a bill belongs to, from the billing period OCR read on it (owner's request,
 * 2026-11-12): the period holding the bill's last day, else the one its days overlap most. Null when the
 * billing period can't be read or falls in none of `periods`.
 */
export function periodForBill(
  billing: string | null,
  periods: readonly PeriodRange[],
): string | null {
  const read = parseBillingPeriod(billing);
  if (!read) return null;
  const holding = periods.find((p) => day(p.startDate) <= read.end && read.end <= day(p.endDate));
  if (holding) return holding.id;
  let best: { id: string; days: number } | null = null;
  for (const p of periods) {
    const from = Math.max(read.start.getTime(), day(p.startDate).getTime());
    const to = Math.min(read.end.getTime(), day(p.endDate).getTime());
    const days = (to - from) / 86_400_000 + 1;
    if (days > 0 && (!best || days > best.days)) best = { id: p.id, days };
  }
  return best?.id ?? null;
}

/**
 * Whether a bill's billing period touches the reporting period it is filed in — the same test validation
 * applies after Confirm (`checkBillingPeriodOverlap`). Null when the billing period can't be read.
 */
export function billingFits(
  billing: string | null,
  period: { startDate: string; endDate: string },
): boolean | null {
  const read = parseBillingPeriod(billing);
  if (!read) return null;
  return !(read.end < day(period.startDate) || read.start > day(period.endDate));
}

/** "12 Nov 2026, 2:05 pm", India time. */
export function submittedLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
