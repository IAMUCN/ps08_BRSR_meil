"use client";

import { ArrowDown, ArrowUp, Camera, FileText, Upload, X } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { formatMegabytes } from "@/lib/storage/evidence";

/**
 * UI brief §12.1 drop-zone: idle, drag-active, and uploading (progress bar, filename, cancel).
 * The browse button is the keyboard/screen-reader path; dropping is a shortcut. With `multiple`, files
 * dropped or chosen are added to the list (owner's request, 2026-11-12: several bills or pages at once),
 * which can be reordered — the pages are read in that order.
 */
export function DropZone({
  files,
  onFiles,
  multiple = false,
  accept,
  hint,
  error,
  progress,
  stage,
  onCancel,
  disabled,
}: {
  files: File[];
  /** The whole list after a change. */
  onFiles: (files: File[]) => void;
  multiple?: boolean;
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
  const file = files[0] ?? null;

  function add(picked: FileList | null | undefined) {
    const list = Array.from(picked ?? []);
    if (list.length === 0 || disabled) return;
    onFiles(multiple ? [...files, ...list] : list.slice(0, 1));
  }
  function move(index: number, by: -1 | 1) {
    const next = [...files];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onFiles(next);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragActive(false);
    add(event.dataTransfer.files);
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
              <span className="truncate">
                {files.length > 1 ? `${files.length} files` : file?.name}
              </span>
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
            {files.length === 1 && !multiple ? (
              <p className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 shrink-0" aria-hidden />
                <span className="max-w-xs truncate">{file!.name}</span>
                <span className="font-normal text-muted-foreground">
                  · {formatMegabytes(file!.size)}
                </span>
              </p>
            ) : (
              <p className="text-sm font-medium">
                {multiple
                  ? files.length
                    ? "Drag more files here, or click to add"
                    : "Drag your bills here (PDFs or photos, one or many) or click to browse"
                  : "Drag a document here or click to browse"}
              </p>
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
              {multiple
                ? files.length
                  ? "Add files"
                  : "Browse files"
                : file
                  ? "Choose a different file"
                  : "Browse files"}
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
                  add(event.target.files);
                  event.target.value = "";
                }}
              />
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              multiple={multiple}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                add(event.target.files);
                event.target.value = "";
              }}
            />
          </>
        )}
      </div>
      {multiple && files.length > 0 && !uploading ? (
        <ol aria-label="Files to upload, in reading order" className="divide-y rounded-md border">
          {files.map((f, index) => (
            <li
              key={`${f.name}-${f.size}-${index}`}
              className="flex items-center gap-2 px-3 py-1.5 text-sm"
            >
              <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">
                {index + 1}.
              </span>
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatMegabytes(f.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Move ${f.name} up`}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled || index === files.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Move ${f.name} down`}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                onClick={() => onFiles(files.filter((_, i) => i !== index))}
                aria-label={`Remove ${f.name}`}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm leading-5 text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
