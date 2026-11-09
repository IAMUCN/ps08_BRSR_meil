"use client";

import { ChevronLeft, ChevronRight, FileWarning, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

// Evidence/Document Viewer (UI brief §12.2 left panel, §12.3 reusable): scrollable, zoomable, with a
// small floating toolbar. A viewer, never an editor — no annotation tools. Bytes come from the
// auth-checked route, so nothing here handles credentials.

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
const DEFAULT_ZOOM_INDEX = 2;
/** On a phone an A4 page at 100% is wider than the screen; it opens at 50% there (feature_enhancement.md 9.1). */
const NARROW = "(max-width: 639px)";
const NARROW_ZOOM_INDEX = 0;
const subscribeNarrow = (onChange: () => void) => {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

type PdfDocument = {
  numPages: number;
  getPage: (page: number) => Promise<{
    getViewport: (options: { scale: number }) => { width: number; height: number };
    render: (options: {
      canvas: HTMLCanvasElement;
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void>; cancel: () => void };
  }>;
};

/**
 * A place on the document where OCR read a value (Phase 3: the field grid). `box` is [x0, y0, x1, y1] in the
 * pixels of the page image OCR read; `pageSize` is that image's [width, height], when known.
 */
export type Region = {
  key: string;
  label: string;
  page: number;
  box: [number, number, number, number];
  selected: boolean;
  /** Low confidence, not yet dealt with: drawn in the warning colour. */
  warning: boolean;
};

/** `destroy()` belongs to the loading task, not the document (pdfjs-dist 6). */
type PdfLoadingTask = { promise: Promise<PdfDocument>; destroy: () => Promise<void> };

export function DocumentViewer({
  src,
  mimeType,
  fileName,
  className,
  regions = [],
  pageSizes = null,
  renderDpi = 200,
  onRegionClick,
}: {
  src: string;
  mimeType: string;
  fileName: string;
  className?: string;
  /** Boxes to draw over the document; the selected one is brought into view. */
  regions?: Region[];
  /** The OCR page images' [width, height]; null for older uploads (measured here instead). */
  pageSizes?: [number, number][] | null;
  /** The resolution OCR rendered PDF pages at, for older uploads without page sizes. */
  renderDpi?: number;
  onRegionClick?: (key: string) => void;
}) {
  const isPdf = mimeType === "application/pdf";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentRef = useRef<PdfDocument | null>(null);
  const taskRef = useRef<PdfLoadingTask | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
  // Null until the person zooms: then their choice wins over the screen-size default.
  const [chosenZoom, setZoomIndex] = useState<number | null>(null);
  const zoomIndex = chosenZoom ?? (narrow ? NARROW_ZOOM_INDEX : DEFAULT_ZOOM_INDEX);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(isPdf ? "loading" : "ready");
  const zoom = ZOOM_STEPS[zoomIndex];
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  // The size of the OCR image the boxes are measured on, when the upload did not record it.
  const [measured, setMeasured] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const task = pdfjs.getDocument({ url: src }) as unknown as PdfLoadingTask;
        taskRef.current = task;
        const loaded = await task.promise;
        if (cancelled) return;
        documentRef.current = loaded;
        setPageCount(loaded.numPages);
        setPage(1);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      // Never let viewer teardown throw: an error here would break the page's unmount, and with it
      // any navigation away from this screen.
      try {
        void taskRef.current?.destroy().catch(() => {});
      } catch {
        // ignore
      }
      taskRef.current = null;
      documentRef.current = null;
    };
  }, [isPdf, src]);

  const renderPage = useCallback(async () => {
    const pdf = documentRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const rendered = await pdf.getPage(page);
    // Render at device resolution so text stays crisp when zoomed.
    const ratio = window.devicePixelRatio || 1;
    const viewport = rendered.getViewport({ scale: zoom * ratio });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / ratio}px`;
    canvas.style.height = `${viewport.height / ratio}px`;
    await rendered.render({ canvas, canvasContext: context, viewport }).promise;
    const base = rendered.getViewport({ scale: 1 });
    // OCR rendered the page at renderDpi (PDF points are 1/72 inch).
    setMeasured([(base.width * renderDpi) / 72, (base.height * renderDpi) / 72]);
  }, [page, zoom, renderDpi]);

  // Selecting a region elsewhere (a grid cell) shows its page and scrolls it into view.
  const selected = regions.find((r) => r.selected);
  // Adjusted while rendering when the selection changes (not in an effect), so there is no extra pass.
  const [shownSelection, setShownSelection] = useState<string | null>(null);
  if ((selected?.key ?? null) !== shownSelection) {
    setShownSelection(selected?.key ?? null);
    if (selected && isPdf && selected.page !== page) setPage(selected.page);
  }
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [selected?.key, page, zoom, measured]);

  const pageSize = pageSizes?.[page - 1] ?? measured;
  const visible = regions.filter((r) => r.page === page);
  const overlay =
    // In percent of the page, so the boxes stay put at every zoom.
    pageSize && visible.length ? (
      <div className="pointer-events-none absolute inset-0" aria-hidden={!onRegionClick}>
        {visible.map((r) => {
          const [x0, y0, x1, y1] = r.box;
          const [w, h] = pageSize;
          const pad = 0.4; // percent of the page around the text, so the box frames it
          return (
            <button
              key={`${r.key}-${x0}-${y0}`}
              ref={r.selected ? selectedRef : undefined}
              type="button"
              tabIndex={-1}
              aria-label={`Where ${r.label} was read`}
              onClick={() => onRegionClick?.(r.key)}
              style={{
                left: `${(x0 / w) * 100 - pad}%`,
                top: `${(y0 / h) * 100 - pad}%`,
                width: `${((x1 - x0) / w) * 100 + 2 * pad}%`,
                height: `${((y1 - y0) / h) * 100 + 2 * pad}%`,
              }}
              className={cn(
                "pointer-events-auto absolute rounded-sm border-2 transition-colors",
                r.selected
                  ? "border-primary bg-primary/15"
                  : r.warning
                    ? "border-status-error/70 bg-status-error/5 hover:bg-status-error/15"
                    : "border-transparent hover:border-primary/40 hover:bg-primary/5",
              )}
            />
          );
        })}
      </div>
    ) : null;

  useEffect(() => {
    if (status !== "ready" || !isPdf) return;
    void renderPage().catch(() => setStatus("error"));
  }, [status, isPdf, renderPage]);

  return (
    <div
      className={cn(
        "relative flex min-h-[480px] flex-col overflow-hidden rounded-lg border bg-surface",
        className,
      )}
    >
      {/* Focusable so a zoomed document can be scrolled from the keyboard (UI brief §17). */}
      <div
        tabIndex={0}
        role="region"
        aria-label={`Document: ${fileName}`}
        className="flex-1 overflow-auto p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        {status === "loading" ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            <span className="sr-only">Loading document</span>
          </div>
        ) : status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <FileWarning className="size-10 text-status-error" strokeWidth={1.5} aria-hidden />
            <p className="text-sm leading-5 font-semibold">This file can&apos;t be displayed</p>
            <p className="max-w-xs text-sm leading-5 text-muted-foreground">
              The stored copy of {fileName} could not be opened. If the extraction also failed,
              upload a clearer copy.
            </p>
          </div>
        ) : isPdf ? (
          <div className="relative mx-auto w-fit">
            <canvas
              ref={canvasRef}
              className="shadow-sm"
              aria-label={`${fileName}, page ${page}`}
            />
            {overlay}
          </div>
        ) : (
          <div className="relative mx-auto" style={{ width: `${zoom * 100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private, session-authorized bytes */}
            <img
              src={src}
              alt={fileName}
              onError={() => setStatus("error")}
              onLoad={(e) => {
                const img = e.currentTarget;
                setMeasured([img.naturalWidth, img.naturalHeight]);
              }}
              className="h-auto w-full max-w-none shadow-sm"
            />
            {overlay}
          </div>
        )}
      </div>

      {status !== "error" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1 rounded-md border bg-popover px-2 py-1.5 shadow-md">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom out"
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex(Math.max(0, zoomIndex - 1))}
            >
              <ZoomOut aria-hidden />
            </Button>
            <span className="min-w-14 text-center text-xs tabular-nums" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Zoom in"
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              onClick={() => setZoomIndex(Math.min(ZOOM_STEPS.length - 1, zoomIndex + 1))}
            >
              <ZoomIn aria-hidden />
            </Button>
            {isPdf && pageCount > 1 ? (
              <>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Previous page"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft aria-hidden />
                </Button>
                <span className="text-xs tabular-nums">
                  Page {page} of {pageCount}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Next page"
                  disabled={page === pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  <ChevronRight aria-hidden />
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
