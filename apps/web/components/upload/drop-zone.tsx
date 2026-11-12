"use client";

import { Camera, FileText, Upload, X } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { formatMegabytes } from "@/lib/storage/evidence";

/**
 * UI brief §12.1 drop-zone: idle, drag-active, and uploading (progress bar, filename, cancel).
 * The browse button is the keyboard/screen-reader path; dropping is a shortcut.
 */
export function DropZone({
  file,
  onFile,
  accept,
  hint,
  error,
  progress,
  stage,
  onCancel,
  disabled,
}: {
  file: File | null;
  onFile: (file: File) => void;
  accept: string;
  hint: string;
  error: string | null;
  /** 0–100 while the file is transferring; null otherwise. */
  progress: number | null;
  /** What is happening when the file is not transferring (checking it, saving); replaces the percentage. */
  stage?: string;
  /** Absent when the upload can no longer be cancelled. */
  onCancel?: () => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Phones: a photo straight from the back camera (feature_enhancement.md 9.2). Only when images are accepted.
  const cameraRef = useRef<HTMLInputElement>(null);
  const takesImages = accept.includes("image/");
  const [dragActive, setDragActive] = useState(false);
  const hintId = useId();
  const errorId = useId();
  const uploading = progress !== null;

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragActive(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped && !disabled) onFile(dropped);
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-surface-elevated px-6 py-10 text-center transition-colors",
          dragActive ? "border-primary bg-primary/5" : "border-border",
          error && !dragActive && "border-status-error",
        )}
      >
        {uploading ? (
          <div className="w-full max-w-sm space-y-4" aria-live="polite">
            <div className="relative mx-auto flex size-16 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              <span className="absolute inset-1 rounded-full bg-primary/10" />
              <Upload
                className="relative size-7 animate-bounce text-primary-text"
                strokeWidth={2}
                aria-hidden
              />
            </div>
            <p className="flex items-center justify-center gap-2 text-sm font-medium">
              <FileText className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{file?.name}</span>
            </p>
            <div
              role="progressbar"
              aria-label="Upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-3 w-full overflow-hidden rounded-full bg-primary/15"
            >
              <div
                className={cn(
                  "upload-stripes h-full rounded-full bg-primary transition-[width] duration-300",
                  stage && "animate-pulse",
                )}
                style={{ width: `${stage ? 100 : progress}%` }}
              />
            </div>
            <div className="flex min-h-8 items-center justify-between text-xs text-muted-foreground">
              <span>
                {stage ?? (
                  <>
                    Uploading…{" "}
                    <span className="text-base font-semibold text-foreground tabular-nums">
                      {progress}%
                    </span>
                  </>
                )}
              </span>
              {onCancel ? (
                <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                  <X aria-hidden />
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <Upload className="size-10 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            {file ? (
              <p className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 shrink-0" aria-hidden />
                <span className="max-w-xs truncate">{file.name}</span>
                <span className="font-normal text-muted-foreground">
                  · {formatMegabytes(file.size)}
                </span>
              </p>
            ) : (
              <p className="text-sm font-medium">Drag a document here or click to browse</p>
            )}
            <p id={hintId} className="text-xs text-muted-foreground">
              {hint}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
            >
              {file ? "Choose a different file" : "Browse files"}
            </Button>
            {takesImages ? (
              // Touch screens only: elsewhere a camera input opens a file dialog, which Browse already does.
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => cameraRef.current?.click()}
                className="hidden [@media(pointer:coarse)]:inline-flex"
              >
                <Camera aria-hidden />
                Take a photo
              </Button>
            ) : null}
            {takesImages ? (
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  const picked = event.target.files?.[0];
                  if (picked) onFile(picked);
                  event.target.value = "";
                }}
              />
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const picked = event.target.files?.[0];
                if (picked) onFile(picked);
                event.target.value = "";
              }}
            />
          </>
        )}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm leading-5 text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
