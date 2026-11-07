"use client";

import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

// A small picture of a bill for list rows (feature_enhancement.md Phase 2, requirement 2): the first page
// of a PDF, or the image itself. Drawn only when the row scrolls into view, so a long list does not fetch
// every file at once; anything that fails shows a plain file icon. The evidence route checks access on
// every request, as for the full viewer.

type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};
type PdfTask = {
  promise: Promise<{ getPage: (n: number) => Promise<PdfPage> }>;
  destroy: () => Promise<void>;
};

const WIDTH = 56;

export function DocumentThumbnail({
  documentId,
  mimeType,
  label,
  className,
}: {
  documentId: string;
  mimeType: string | null;
  /** What the picture is of, for screen readers. */
  label: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = `/api/documents/${documentId}/file`;
  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType === "image/jpeg" || mimeType === "image/png";

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !isPdf) return;
    let task: PdfTask | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        task = pdfjs.getDocument({ url: src }) as unknown as PdfTask;
        const pdf = await task.promise;
        const page = await pdf.getPage(1);
        const target = canvas.current;
        const context = target?.getContext("2d");
        if (cancelled || !target || !context) return;
        const ratio = window.devicePixelRatio || 1;
        const scale = (WIDTH * ratio) / page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale });
        target.width = viewport.width;
        target.height = viewport.height;
        target.style.width = `${viewport.width / ratio}px`;
        target.style.height = `${viewport.height / ratio}px`;
        await page.render({ canvas: target, canvasContext: context, viewport }).promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      try {
        void task?.destroy().catch(() => {});
      } catch {
        // ignore
      }
    };
  }, [visible, isPdf, src]);

  return (
    <div
      ref={box}
      role="img"
      aria-label={label}
      className={cn(
        "flex h-[72px] w-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-surface",
        className,
      )}
    >
      {visible && !failed && isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private, access-checked file, not an asset
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : visible && !failed && isPdf ? (
        <canvas ref={canvas} aria-hidden />
      ) : (
        <FileText className="size-5 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}
