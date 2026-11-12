// The name a downloaded original gets (feature_enhancement.md Phase 2): readable, from what the record says
// it is — activity, bill number, period — while the file stays stored under its id. Pure.

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Letters, digits and dashes only, so the name is safe in every file system and header. */
function part(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function downloadName(input: {
  fileName: string;
  mimeType: string;
  metricName: string | null;
  billNumber: string | null;
  periodLabel: string | null;
}): string {
  const extension = EXTENSIONS[input.mimeType];
  const bill = input.billNumber ? part(input.billNumber) : "";
  // Without a confirmed bill number the uploader's own file name says more than a made-up one.
  if (!bill || !input.metricName || !extension) return input.fileName.replace(/["\\r\n]/g, "");
  const pieces = [
    part(input.metricName),
    `Bill-${bill}`,
    input.periodLabel ? part(input.periodLabel) : "",
  ];
  return `${pieces.filter(Boolean).join("_")}.${extension}`;
}
