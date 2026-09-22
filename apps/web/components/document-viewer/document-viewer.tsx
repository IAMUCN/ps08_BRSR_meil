"use client";

import { ChevronLeft, ChevronRight, FileWarning, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

// Evidence/Document Viewer (UI brief §12.2 left panel, §12.3 reusable): scrollable, zoomable, with a
// small floating toolbar. A viewer, never an editor — no annotation tools. Bytes come from the
// auth-checked route, so nothing here handles credentials.

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;
const DEFAULT_ZOOM_INDEX = 2;

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

/** `destroy()` belongs to the loading task, not the document (pdfjs-dist 6). */
type PdfLoadingTask = { promise: Promise<PdfDocument>; destroy: () => Promise<void> };

export function DocumentViewer({
  src,
  mimeType,
  fileName,
  className,
}: {
  src: string;
  mimeType: string;
  fileName: string;
  className?: string;
}) {
  const isPdf = mimeType === "application/pdf";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentRef = useRef<PdfDocument | null>(null);
  const taskRef = useRef<PdfLoadingTask | null>(null);
  const [pageCount, setPageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(isPdf ? "loading" : "ready");
  const zoom = ZOOM_STEPS[zoomIndex];

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
  }, [page, zoom]);

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
          <canvas
            ref={canvasRef}
            className="mx-auto shadow-sm"
            aria-label={`${fileName}, page ${page}`}
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element -- private, session-authorized bytes */
          <img
            src={src}
            alt={fileName}
            onError={() => setStatus("error")}
            style={{ width: `${zoom * 100}%` }}
            className="mx-auto h-auto max-w-none shadow-sm"
          />
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
              onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
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
              onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
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
