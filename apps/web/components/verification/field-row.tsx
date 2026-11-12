"use client";

import { Check, CheckCircle2, Pencil, TriangleAlert } from "lucide-react";
import { OUTCOME_ICON } from "@/components/validation/validation-result";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sameAmount } from "@/lib/declarations/compare";
import { isFlagged, isResolved, type FieldEntry, type VerifyField } from "@/lib/verification/rules";

// One extracted field (UI brief §12.2 right panel): label · click-to-edit value · confidence.
// Keyboard: Tab to the value, Enter to edit, Enter to save, Escape to cancel (UI brief §17).

function confidenceLabel(field: VerifyField, threshold: number | null) {
  if (field.extractedValue === null) return "Not found by OCR";
  if (field.confidence === null) return "No confidence score";
  const percent = Math.round(field.confidence);
  return `Confidence: ${percent} percent${isFlagged(field, threshold) ? ", requires review" : ""}`;
}

export function FieldRow({
  field,
  entry,
  threshold,
  error,
  validation,
  disabled,
  onChange,
  selected = false,
  onSelect,
  diagnostic = null,
}: {
  field: VerifyField;
  entry: FieldEntry;
  threshold: number | null;
  error: string | null;
  /** The last validation run's verdict on this field (UI brief §12.2 item 4). */
  validation?: { outcome: "fail" | "flagged"; message: string } | null;
  disabled: boolean;
  onChange: (next: FieldEntry) => void;
  /** Phase 3 grid: this row's value is boxed on the document. */
  selected?: boolean;
  /** Called when the person picks this row, to box its source on the document. */
  onSelect?: () => void;
  /** Why OCR did not read this field (e.g. the photo was unreadable), from the worker. */
  diagnostic?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const flagged = isFlagged(field, threshold);
  const resolved = isResolved(field, entry, threshold);
  const missing = field.extractedValue === null;
  const changed = entry.value.trim() !== (field.extractedValue ?? "").trim();
  const monospace = field.dataType === "number" || field.key.includes("number");

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    onChange({ value: draft, acknowledged: entry.acknowledged });
    setEditing(false);
  }

  return (
    <li
      // Picking a row (or focusing its value) boxes where it was read on the document (Phase 3).
      onClickCapture={onSelect}
      onFocusCapture={onSelect}
      data-selected={selected || undefined}
      data-field-key={field.key}
      className={cn(
        "border-l-2 px-4 py-3",
        // Phase 3: low confidence not yet dealt with is red, like a flagged spreadsheet cell.
        flagged && !resolved ? "border-l-status-error bg-status-error/5" : "border-l-transparent",
        error ? "border-l-status-error bg-status-error/5" : "",
        selected && "ring-2 ring-primary/50 ring-inset",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-36 shrink-0 text-sm leading-5 text-muted-foreground">
          {field.label}
          {field.required ? (
            <span className="text-status-error" aria-label="required">
              {" "}
              *
            </span>
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          {editing ? (
            <Input
              ref={inputRef}
              value={draft}
              aria-label={`${field.label} value`}
              aria-invalid={error ? true : undefined}
              className={monospace ? "font-mono" : undefined}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft(entry.value);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setDraft(entry.value);
                setEditing(true);
              }}
              className={cn(
                "group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm leading-5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent",
                monospace && "font-mono",
              )}
              aria-label={`${field.label}: ${entry.value || "empty"}. ${confidenceLabel(field, threshold)}. Press Enter to edit.`}
            >
              <span
                className={cn(
                  "min-w-0 flex-1 break-words",
                  !entry.value && "text-muted-foreground italic",
                )}
              >
                {entry.value || (missing ? "Not found — enter it from the document" : "Empty")}
              </span>
              {!disabled ? (
                <Pencil
                  className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
              ) : null}
            </button>
          )}
        </div>

        <span className="flex w-28 shrink-0 items-center justify-end gap-1.5 text-xs tabular-nums">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              missing ? "bg-muted-foreground" : flagged ? "bg-status-warning" : "bg-status-success",
            )}
            aria-hidden
          />
          <span className="text-muted-foreground">
            {missing || field.confidence === null
              ? "No OCR value"
              : `${Math.round(field.confidence)}%`}
          </span>
          <span className="sr-only">{confidenceLabel(field, threshold)}</span>
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2 pl-[9.75rem]">
        {error ? (
          <p role="alert" className="text-xs leading-4 text-status-error">
            {error}
          </p>
        ) : null}
        {validation
          ? (() => {
              const { icon: Icon, className, label } = OUTCOME_ICON[validation.outcome];
              return (
                <p className="flex items-start gap-1.5 text-xs leading-4">
                  <Icon className={`mt-px size-3.5 shrink-0 ${className}`} aria-hidden />
                  <span>
                    <span className="sr-only">Validation {label}: </span>
                    {validation.message}
                  </span>
                </p>
              );
            })()
          : null}
        {missing && changed ? (
          <span className="rounded-sm border border-border px-1.5 text-[11px] leading-4 text-muted-foreground uppercase">
            Not from OCR
          </span>
        ) : null}
        {!missing && changed ? (
          // Both values stay on record (ocr_fields.extracted_value and verified_value).
          <span className="text-xs leading-4 text-muted-foreground">
            OCR read: <span className="font-mono">{field.extractedValue}</span>
          </span>
        ) : null}
        {missing && diagnostic ? (
          <p className="w-full text-xs leading-4 text-muted-foreground">{diagnostic}</p>
        ) : null}
        {field.typed ? (
          <TypedNote field={field} entry={entry} disabled={disabled} onChange={onChange} />
        ) : null}
        {field.critical ? (
          <span className="rounded-sm border border-status-warning/50 px-1.5 text-[11px] leading-4 text-muted-foreground uppercase">
            Critical
          </span>
        ) : null}
        {flagged && !disabled && field.typed?.status !== "mismatch" ? (
          <Button
            type="button"
            variant={resolved ? "outline" : "default"}
            size="xs"
            aria-pressed={entry.acknowledged}
            onClick={() => onChange({ value: entry.value, acknowledged: !entry.acknowledged })}
          >
            {entry.acknowledged ? <Check aria-hidden /> : null}
            Looks correct
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * What the person typed for this field on the Upload page against what OCR read (migration 0077). A
 * difference is settled here: take the document's value, or keep the typed one — which a reviewer then sees.
 */
function TypedNote({
  field,
  entry,
  disabled,
  onChange,
}: {
  field: VerifyField;
  entry: FieldEntry;
  disabled: boolean;
  onChange: (next: FieldEntry) => void;
}) {
  const typed = field.typed!;
  const unit = typed.unit ? ` ${typed.unit}` : "";
  if (typed.status === "match") {
    return (
      <p className="flex w-full items-center gap-1.5 text-xs leading-4 text-foreground">
        <CheckCircle2 className="size-3.5 shrink-0 text-status-success" aria-hidden />
        Matches what you typed at upload ({typed.value}
        {unit}).
      </p>
    );
  }
  if (typed.status === "not_read") {
    return (
      <p className="w-full text-xs leading-4 text-muted-foreground">
        Not read on the document: the value you typed at upload ({typed.value}
        {unit}) is filled in. Check it against the document.
      </p>
    );
  }
  const keptTyped =
    entry.acknowledged &&
    sameAmount({ text: entry.value, unit: null }, { text: typed.value, unit: null });
  const tookDocument =
    entry.acknowledged && entry.value.trim() === (field.extractedValue ?? "").trim();
  return (
    <div className="w-full space-y-1.5 rounded-md border border-status-error/40 bg-status-error/5 p-2 text-xs leading-4">
      <p className="flex items-start gap-1.5 text-foreground">
        <TriangleAlert className="mt-px size-3.5 shrink-0 text-status-error" aria-hidden />
        <span>
          You typed <span className="font-mono font-semibold">{typed.value}</span>
          {unit} at upload; the document reads{" "}
          <span className="font-mono font-semibold">{field.extractedValue}</span>. Which is right?
        </span>
      </p>
      {disabled ? null : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="xs"
            variant={tookDocument ? "default" : "outline"}
            aria-pressed={tookDocument}
            onClick={() => onChange({ value: field.extractedValue ?? "", acknowledged: true })}
          >
            {tookDocument ? <Check aria-hidden /> : null}
            Use the document&apos;s value
          </Button>
          <Button
            type="button"
            size="xs"
            variant={keptTyped ? "default" : "outline"}
            aria-pressed={!!keptTyped}
            onClick={() => onChange({ value: typed.value, acknowledged: true })}
          >
            {keptTyped ? <Check aria-hidden /> : null}
            Keep my value
          </Button>
        </div>
      )}
      {keptTyped ? (
        <p className="text-muted-foreground">
          Kept. The record goes to a reviewer with both values and the document.
        </p>
      ) : null}
    </div>
  );
}
