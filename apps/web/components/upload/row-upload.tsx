"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "cn";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  autoConfirmBundleAction,
  clearUploadDraftAction,
  completeBundleUploadAction,
  prepareBundleUploadAction,
  rowStatusAction,
  saveUploadDraftAction,
} from "@/app/app/upload/actions";
import { readNumber } from "@/lib/declarations/compare";
import { BUNDLE_MAX_PAGES, MAX_UPLOAD_FILES, UPLOAD_MIME_TYPES } from "@/lib/documents/bundle";
import { formatMegabytes } from "@/lib/storage/evidence";
import type { BillingMonth, UploadMetric, UploadTarget } from "@/lib/trpc/routers/documents";
import {
  MAX_ROWS,
  declarationsOf,
  newLine,
  newRow,
  rowProblem,
  rowTouched,
  rowsFromDraft,
  valuesFor,
  type BillLine,
  type RowMode,
  type UploadRow,
} from "@/lib/upload/rows";

// The Upload page as a table of submissions (owner's request after the mid evaluation, 2026-11-12;
// .grill/row-upload-decisions.md). Each row: bill type, reporting period, the value(s) typed by the person,
// the unit, and the evidence, which is required. "Submit all" sends each row as its own upload with what was
// typed; OCR then reads the evidence, and where the bills found pair cleanly with the rows they are recorded
// at once. The typed values are compared with what OCR read on Verify.

type Sent =
  | { state: "sending"; progress: number }
  | { state: "duplicate" }
  | { state: "error"; message: string }
  | { state: "reading"; documentId: string }
  | { state: "check"; documentId: string; reason: string }
  | { state: "failed"; documentId: string; message: string | null }
  | {
      state: "recorded";
      documentId: string;
      documents: { documentId: string; fileName: string }[];
    };

const ACCEPT = UPLOAD_MIME_TYPES.join(",");

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function putFile(url: string, file: File, onProgress: (sent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject());
    xhr.onerror = () => reject();
    xhr.send(body);
  });
}

const savedLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });

export function RowUpload({
  periods,
  targets,
  maxBytes,
  draft,
  onTargetChange,
  onUploaded,
}: {
  /** The billing months a bill may be typed for (owner's request, 2026-11-13), newest first. */
  periods: BillingMonth[];
  targets: UploadTarget[];
  maxBytes: number;
  /** The person's saved draft (rows without files), if any. */
  draft: { rows: unknown[]; savedAt: string } | null;
  onTargetChange?: (orgUnitId: string, periodId: string) => void;
  onUploaded?: () => void;
}) {
  const unitFieldId = useId();
  const firstPeriod = periods[0]?.id ?? "";
  const validPeriods = useMemo(() => new Set(periods.map((p) => p.id)), [periods]);
  const [orgUnitId, setOrgUnitId] = useState(targets[0].orgUnitId);
  const target = targets.find((t) => t.orgUnitId === orgUnitId) ?? targets[0];
  const metrics = useMemo(
    () => new Map(target.categories.flatMap((c) => c.metrics).map((m) => [m.id, m])),
    [target],
  );
  const metricOf = useCallback((id: string) => metrics.get(id), [metrics]);

  const [rows, setRows] = useState<UploadRow[]>(() => {
    const restored = rowsFromDraft(draft?.rows, validPeriods);
    return restored.length ? restored : [newRow(crypto.randomUUID(), firstPeriod)];
  });
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [sent, setSent] = useState<Record<string, Sent>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(draft?.savedAt ?? null);
  // The eye button: a file attached here (a blob URL, released when replaced or closed) or an uploaded bill.
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const showPreview = (target: PreviewTarget | null) =>
    setPreview((current) => {
      if (current?.src.startsWith("blob:")) URL.revokeObjectURL(current.src);
      return target;
    });
  const restoredDraft = useRef(!!draft && rowsFromDraft(draft.rows, validPeriods).length > 0);

  // The expected-submissions list beside the table follows the project and the first row's period.
  useEffect(() => {
    onTargetChange?.(target.orgUnitId, rows[0]?.periodId || firstPeriod);
  }, [onTargetChange, target.orgUnitId, rows, firstPeriod]);

  // --- Draft: rows not yet sent are saved as the person types (files are not kept) ----------------------
  const open = rows.filter((r) => !sent[r.id] || sent[r.id].state === "error");
  const draftRows = open.filter(rowTouched);
  const draftKey = JSON.stringify(draftRows);
  const lastSaved = useRef(draftKey);
  useEffect(() => {
    if (draftKey === lastSaved.current) return;
    const timer = setTimeout(async () => {
      lastSaved.current = draftKey;
      if (draftRows.length === 0) {
        await clearUploadDraftAction();
        setSavedAt(null);
        return;
      }
      const result = await saveUploadDraftAction({ rows: draftRows as never });
      if (result.ok) setSavedAt(result.data.savedAt);
    }, 1500);
    return () => clearTimeout(timer);
  }, [draftKey, draftRows]);

  // --- Rows ----------------------------------------------------------------------------------------------
  const update = (id: string, change: (row: UploadRow) => UploadRow) => {
    setRows((all) => all.map((r) => (r.id === id ? change(r) : r)));
    setErrors((e) => {
      const { [id]: _drop, ...rest } = e;
      void _drop;
      return rest;
    });
  };
  const addRow = () =>
    setRows((all) =>
      all.length >= MAX_ROWS ? all : [...all, newRow(crypto.randomUUID(), firstPeriod)],
    );
  const removeRow = (id: string) => {
    setRows((all) => {
      const next = all.filter((r) => r.id !== id);
      return next.length ? next : [newRow(crypto.randomUUID(), firstPeriod)];
    });
    setFiles(({ [id]: _drop, ...rest }) => {
      void _drop;
      return rest;
    });
  };

  // --- Polling: rows that were sent are watched until their bills are recorded --------------------------
  const watching = Object.entries(sent).filter(([, s]) => s.state === "reading") as [
    string,
    Extract<Sent, { state: "reading" }>,
  ][];
  const watchKey = watching.map(([id]) => id).join(",");
  useEffect(() => {
    if (!watchKey) return;
    let stop = false;
    const tick = async () => {
      const ids = watching.map(([, s]) => s.documentId);
      const status = await rowStatusAction({ documentIds: ids });
      if (stop || !status.ok) return;
      for (const [rowId, s] of watching) {
        const row = status.data.find((x) => x.documentId === s.documentId);
        if (!row || row.status === "processing") continue;
        if (row.status === "done") {
          setSent((all) => ({
            ...all,
            [rowId]: { state: "recorded", documentId: s.documentId, documents: row.documents },
          }));
          onUploaded?.();
          continue;
        }
        if (row.status === "failed") {
          setSent((all) => ({
            ...all,
            [rowId]: { state: "failed", documentId: s.documentId, message: row.errorMessage },
          }));
          continue;
        }
        // Read: record its bills now if they pair with what was typed.
        const outcome = await autoConfirmBundleAction({ documentId: s.documentId });
        if (stop) return;
        if (!outcome.ok) {
          setSent((all) => ({
            ...all,
            [rowId]: { state: "check", documentId: s.documentId, reason: outcome.error },
          }));
        } else if (outcome.data.status === "needs_check") {
          const reason = outcome.data.reason;
          setSent((all) => ({
            ...all,
            [rowId]: { state: "check", documentId: s.documentId, reason },
          }));
        }
        // "recorded" / "done": the next tick lists the bills.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 4000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
    // watching is derived from `sent`; the key lists exactly the rows being watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchKey]);

  // --- Sending ---------------------------------------------------------------------------------------------
  function checkFiles(list: File[]): string | null {
    if (list.length > MAX_UPLOAD_FILES) return `At most ${MAX_UPLOAD_FILES} files in one row.`;
    for (const f of list) {
      if (!UPLOAD_MIME_TYPES.includes(f.type)) return `${f.name}: upload a PDF, JPG or PNG.`;
      if (f.size > maxBytes)
        return `${f.name} is ${formatMegabytes(f.size)}; the limit is ${formatMegabytes(maxBytes)}.`;
    }
    const total = list.reduce((n, f) => n + f.size, 0);
    if (total > maxBytes) {
      return `These files are ${formatMegabytes(total)} together; the limit is ${formatMegabytes(maxBytes)} a row.`;
    }
    return null;
  }

  async function send(row: UploadRow, acknowledge: boolean) {
    const list = files[row.id] ?? [];
    const total = list.reduce((n, f) => n + f.size, 0);
    setSent((all) => ({ ...all, [row.id]: { state: "sending", progress: 0 } }));
    const fail = (message: string) =>
      setSent((all) => ({ ...all, [row.id]: { state: "error", message } }));
    try {
      const described = await Promise.all(
        list.map(async (f) => ({ fileSize: f.size, sha256: await sha256Hex(f), mimeType: f.type })),
      );
      const prepared = await prepareBundleUploadAction({
        // The upload itself is filed under the newest open period; each bill goes to its billing month.
        orgUnitId,
        files: described,
        acknowledgeDuplicates: acknowledge,
      });
      if (!prepared.ok) return fail(prepared.error);
      if (prepared.data.status === "confirm") {
        setSent((all) => ({ ...all, [row.id]: { state: "duplicate" } }));
        return;
      }
      const { uploads } = prepared.data;
      let done = 0;
      for (const [index, f] of list.entries()) {
        await putFile(uploads[index].signedUrl, f, (loaded) =>
          setSent((all) => ({
            ...all,
            [row.id]: { state: "sending", progress: Math.round(((done + loaded) / total) * 100) },
          })),
        );
        done += f.size;
      }
      const completed = await completeBundleUploadAction({
        orgUnitId,
        documentId: prepared.data.documentId,
        reportingPeriodId: prepared.data.reportingPeriodId,
        sources: uploads.map((u, i) => ({
          id: u.sourceId,
          fileName: list[i].name,
          mimeType: list[i].type,
        })),
        acknowledgeDuplicates: acknowledge,
        description: row.description.trim() || undefined,
        declarations: declarationsOf(row),
      });
      if (!completed.ok) return fail(completed.error);
      if (completed.data.status === "confirm") {
        setSent((all) => ({ ...all, [row.id]: { state: "duplicate" } }));
        return;
      }
      const documentId = completed.data.documentId;
      setSent((all) => ({ ...all, [row.id]: { state: "reading", documentId } }));
    } catch {
      fail("The upload failed — check your connection and try again.");
    }
  }

  async function submitAll() {
    const found: Record<string, string> = {};
    const ready: UploadRow[] = [];
    for (const row of open) {
      if (!rowTouched(row) && !(files[row.id]?.length ?? 0)) continue; // an empty spare row
      const problem =
        rowProblem(row, files[row.id]?.length ?? 0, metricOf) ?? checkFiles(files[row.id] ?? []);
      if (problem) found[row.id] = problem;
      else ready.push(row);
    }
    setErrors(found);
    if (Object.keys(found).length > 0 || ready.length === 0) {
      if (ready.length === 0 && Object.keys(found).length === 0) {
        setErrors({ [open[0]?.id ?? ""]: "Fill in a row first." });
      }
      return;
    }
    setBusy(true);
    for (const row of ready) await send(row, false);
    setBusy(false);
  }

  const openRows = open.length;
  const readyCount = open.filter(
    (r) => !rowProblem(r, files[r.id]?.length ?? 0, metricOf) && rowTouched(r),
  ).length;
  const missingFiles = open.filter((r) => rowTouched(r) && !(files[r.id]?.length ?? 0)).length;

  return (
    <div className="space-y-5">
      {targets.length > 1 ? (
        <div className="max-w-md space-y-2">
          <Label htmlFor={unitFieldId}>Project / site</Label>
          <NativeSelect
            id={unitFieldId}
            value={orgUnitId}
            disabled={busy || Object.keys(sent).length > 0}
            onChange={(e) => {
              setOrgUnitId(e.target.value);
              setRows((all) => all.map((r) => ({ ...r, metricId: "", values: {}, more: [] })));
            }}
          >
            {targets.map((t) => (
              <option key={t.orgUnitId} value={t.orgUnitId}>
                {t.name} ({t.unitTypeLabel})
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : (
        <p className="text-sm leading-5">
          Submitting for <span className="font-medium">{target.name}</span>
        </p>
      )}

      <p className="text-sm leading-5 text-muted-foreground">
        Choose each bill&apos;s billing period: a month whose due date has passed is still accepted
        and the bill is marked as a late submission. The document is required on every row. Several
        files for one bill type? Attach them all to the row; each gets its own line. Several bills
        in one file? Use <span className="font-medium">Another bill in this file</span>.
      </p>

      {restoredDraft.current && draftRows.length > 0 ? (
        <p
          role="note"
          className="rounded-md border border-status-warning/50 bg-status-warning/10 p-3 text-sm leading-5 text-foreground"
        >
          Your draft was restored. Files are not kept in a draft — attach them again before you
          submit.
        </p>
      ) : null}

      {/* Its own scroll box (not .overflow-x-auto): the site-wide pinned-first-column rule would misplace
          merged cells. */}
      <div className="relative overflow-auto rounded-md border border-border">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <caption className="sr-only">Submissions</caption>
          <thead>
            <tr className="bg-muted/60 text-left">
              {TABLE_COLUMNS.map((c, i) => (
                <th
                  key={i}
                  scope="col"
                  className="border border-border px-2 py-2 font-semibold whitespace-nowrap text-foreground"
                >
                  {c || <span className="sr-only">Remove a bill</span>}
                </th>
              ))}
            </tr>
          </thead>
          {rows.map((row, index) => (
            <RowGroup
              key={row.id}
              row={row}
              index={index}
              files={files[row.id] ?? []}
              sent={sent[row.id]}
              error={errors[row.id] ?? null}
              categories={target.categories}
              periods={periods}
              metricOf={metricOf}
              disabled={busy}
              onChange={(change) => update(row.id, change)}
              onFiles={(list) => {
                setFiles((all) => ({ ...all, [row.id]: list }));
                setErrors((e) => {
                  const { [row.id]: _drop, ...rest } = e;
                  void _drop;
                  const problem = checkFiles(list);
                  return problem ? { ...rest, [row.id]: problem } : rest;
                });
              }}
              onRemove={() => removeRow(row.id)}
              onRetry={(acknowledge) => void send(row, acknowledge)}
              onPreview={showPreview}
            />
          ))}
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={addRow}
          disabled={busy || rows.length >= MAX_ROWS}
        >
          <Plus aria-hidden />
          Add another submission
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {savedAt && draftRows.length > 0
              ? `Draft saved ${savedAt ? savedLabel(savedAt) : ""}`
              : null}
          </span>
          <Button type="button" onClick={() => void submitAll()} disabled={busy || openRows === 0}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {busy
              ? "Submitting…"
              : `Submit all${readyCount ? ` (${readyCount} ready${missingFiles ? `, ${missingFiles} missing a file` : ""})` : ""}`}
          </Button>
        </div>
      </div>
      <PreviewDialog target={preview} onClose={() => showPreview(null)} />
      <p className="text-xs text-muted-foreground">
        PDFs, JPG or PNG photos · up to {formatMegabytes(maxBytes)} and {BUNDLE_MAX_PAGES} pages a
        row.
      </p>
    </div>
  );
}

// --- The table ---------------------------------------------------------------------------------------
//
// Spreadsheet rules (owner's request, 2026-11-13): one submission is one group of table rows.
// - One file holding several bills: a row per bill; the Evidence cell is merged down across them.
// - One activity with several files: the activity's cells are merged down; each file has its own row.

const MODES: { value: Exclude<RowMode, "one" | "each">; label: string }[] = [
  { value: "total", label: "Separate bills — my value is their total" },
  { value: "pages_of_one", label: "Pages of one bill" },
];

/** A file to show in the preview: one attached here (a blob), or one already uploaded. */
export type PreviewTarget = { src: string; mimeType: string; fileName: string };

export const TABLE_COLUMNS = [
  "#",
  "Bill type",
  "Billing period",
  "Value",
  "Unit",
  "Pages",
  "Evidence",
  "",
] as const;

const cell = "border border-border px-2 py-2 align-top";

function RowGroup({
  row,
  index,
  files,
  sent,
  error,
  categories,
  periods,
  metricOf,
  disabled,
  onChange,
  onFiles,
  onRemove,
  onRetry,
  onPreview,
}: {
  row: UploadRow;
  index: number;
  files: File[];
  sent: Sent | undefined;
  error: string | null;
  categories: UploadTarget["categories"];
  /** The billing months a bill may be typed for (owner's request, 2026-11-13), newest first. */
  periods: BillingMonth[];
  metricOf: (id: string) => UploadMetric | undefined;
  disabled: boolean;
  onChange: (change: (row: UploadRow) => UploadRow) => void;
  onFiles: (files: File[]) => void;
  onRemove: () => void;
  onRetry: (acknowledge: boolean) => void;
  onPreview: (target: PreviewTarget) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const errorId = useId();
  const [notesOpen, setNotesOpen] = useState(!!row.description);
  const locked = disabled || (!!sent && sent.state !== "error");
  const each = row.mode === "each";
  const name = `Submission ${index + 1}`;

  if (sent && sent.state !== "error" && sent.state !== "sending" && sent.state !== "duplicate") {
    return (
      <tbody>
        <tr>
          <td colSpan={TABLE_COLUMNS.length} className="border border-border p-0">
            <SentRow
              row={row}
              index={index}
              sent={sent}
              metricOf={metricOf}
              onPreview={onPreview}
            />
          </td>
        </tr>
      </tbody>
    );
  }

  /** Several files for one bill line mean separate bills (their total) unless the person says pages. */
  const setFiles = (list: File[]) => {
    if (!each) {
      onChange((r) =>
        list.length > 1
          ? r.mode === "one"
            ? { ...r, mode: "total" }
            : r
          : r.mode === "one"
            ? r
            : { ...r, mode: "one" },
      );
    }
    onFiles(list);
  };
  const addButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={locked}
      onClick={() => picker.current?.click()}
      aria-describedby={error ? errorId : undefined}
      aria-label={files.length ? `${name}: add a file` : `${name}: attach the evidence`}
    >
      <Paperclip aria-hidden />
      {files.length === 0 ? "Attach (required)" : "Add file"}
    </Button>
  );
  const chip = (f: File, i: number) => (
    <FileChip
      key={`${f.name}-${i}`}
      file={f}
      disabled={locked}
      onPreview={onPreview}
      onRemove={() => setFiles(files.filter((_, j) => j !== i))}
    />
  );

  const lines: BillLine[] = each ? [row, ...row.more] : [row];
  // Rows in this group: one per bill (a file of several bills), else one per file (at least one).
  const span = each ? lines.length : Math.max(1, files.length);
  const updateLine = (line: BillLine, next: Partial<BillLine>) =>
    onChange((r) =>
      line.id === r.id
        ? { ...r, ...next }
        : { ...r, more: r.more.map((x) => (x.id === line.id ? { ...x, ...next } : x)) },
    );

  return (
    <tbody className={cn(error && "outline-2 -outline-offset-1 outline-status-error/60")}>
      {Array.from({ length: span }, (_, r) => {
        const line = each ? lines[r] : row;
        const label = each ? `${name}, bill ${r + 1}` : name;
        return (
          <tr key={each ? line.id : `${row.id}-${r}`} className="bg-surface">
            {r === 0 ? (
              <td rowSpan={span} className={cn(cell, "w-10 text-center font-medium tabular-nums")}>
                {index + 1}
              </td>
            ) : null}
            {each || r === 0 ? (
              <LineCells
                line={line}
                label={label}
                rowSpan={each ? 1 : span}
                totalLabel={row.mode === "total"}
                categories={categories}
                periods={periods}
                metricOf={metricOf}
                disabled={locked}
                onChange={(next) => updateLine(line, next)}
              />
            ) : null}
            {each ? (
              <td className={cn(cell, "w-36")}>
                <div className="flex items-center gap-1">
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`${label}: page from`}
                    placeholder="From"
                    className="h-9 w-14 px-2"
                    value={line.pageFrom ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      updateLine(line, { pageFrom: e.target.value.replace(/\D/g, "") })
                    }
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`${label}: page to`}
                    placeholder="To"
                    className="h-9 w-14 px-2"
                    value={line.pageTo ?? ""}
                    disabled={locked}
                    onChange={(e) =>
                      updateLine(line, { pageTo: e.target.value.replace(/\D/g, "") })
                    }
                  />
                </div>
              </td>
            ) : r === 0 ? (
              <td rowSpan={span} className={cn(cell, "w-36 text-center text-muted-foreground")}>
                —
              </td>
            ) : null}
            {each ? (
              r === 0 ? (
                // One file, several bills: the evidence is merged down across the bills.
                <td rowSpan={span} className={cn(cell, "min-w-56 bg-muted/30")}>
                  <div className="flex flex-col items-start gap-1.5">
                    {files.map(chip)}
                    {addButton}
                  </div>
                </td>
              ) : null
            ) : (
              // One activity, several files: each file on its own row.
              <td className={cn(cell, "min-w-56")}>
                <div className="flex flex-col items-start gap-1.5">
                  {files[r] ? chip(files[r], r) : null}
                  {r === span - 1 ? addButton : null}
                </div>
              </td>
            )}
            <td className={cn(cell, "w-10 text-center")}>
              {each && r > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={locked}
                  aria-label={`Remove ${label}`}
                  onClick={() =>
                    onChange((x) => {
                      const more = x.more.filter((m) => m.id !== line.id);
                      return { ...x, more, mode: more.length ? "each" : "one" };
                    })
                  }
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </td>
          </tr>
        );
      })}

      {/* The submission's actions and messages, under its rows (the reference's action bar). */}
      <tr className="bg-surface">
        <td colSpan={TABLE_COLUMNS.length} className="border border-border px-2 py-1.5">
          <input
            ref={picker}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (picked.length) setFiles([...files, ...picked]);
            }}
          />
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
            {row.mode === "one" || each ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-primary-text"
                disabled={locked || row.more.length >= 49}
                onClick={() =>
                  onChange((r) => ({
                    ...r,
                    mode: "each",
                    more: [...r.more, newLine(crypto.randomUUID(), r.periodId)],
                  }))
                }
              >
                <Plus aria-hidden />
                Another bill in this file
              </Button>
            ) : (
              <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2">
                <legend className="sr-only">{name}: these files are</legend>
                <span className="text-xs font-medium text-muted-foreground">These files are:</span>
                {MODES.map((m) => (
                  <label key={m.value} className="inline-flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`mode-${row.id}`}
                      className="size-4 accent-[var(--primary)]"
                      checked={row.mode === m.value}
                      disabled={locked}
                      onChange={() => onChange((r) => ({ ...r, mode: m.value }))}
                    />
                    {m.label}
                  </label>
                ))}
              </fieldset>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={notesOpen}
              aria-controls={descriptionId}
              onClick={() => setNotesOpen((open) => !open)}
            >
              <FileText aria-hidden />
              Description
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-status-error"
              disabled={locked}
              onClick={onRemove}
              aria-label={`Remove ${name.toLowerCase()}`}
            >
              <Trash2 aria-hidden />
              Remove
            </Button>
            {each ? (
              <span className="px-2 text-xs text-muted-foreground">
                Pages are counted across the files in the order shown; leave them empty to let
                EmeilSG find each bill.
              </span>
            ) : null}
          </div>
          {notesOpen ? (
            <textarea
              id={descriptionId}
              aria-label={`${name}: description (optional)`}
              value={row.description}
              maxLength={500}
              rows={2}
              disabled={locked}
              onChange={(e) => onChange((r) => ({ ...r, description: e.target.value }))}
              placeholder="Optional, e.g. meter 2, generator shed"
              className="mt-1.5 w-full rounded-sm border border-input bg-surface px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            />
          ) : null}
          {sent?.state === "sending" ? (
            <div className="mt-1.5 space-y-1" role="status">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${sent.progress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Uploading… {sent.progress}%</p>
            </div>
          ) : null}
          {sent?.state === "duplicate" ? (
            <div
              role="alert"
              className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-warning/50 bg-status-warning/10 p-2 text-sm text-foreground"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-status-warning" aria-hidden />
                This file has been uploaded before. If you continue, it is flagged for review.
              </span>
              <Button type="button" size="sm" onClick={() => onRetry(true)}>
                Upload anyway
              </Button>
            </div>
          ) : null}
          {error ? (
            <p id={errorId} role="alert" className="mt-1 px-2 text-sm leading-5 text-status-error">
              {name}: {error}
            </p>
          ) : null}
          {sent?.state === "error" ? (
            <div
              role="alert"
              className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-error/40 bg-status-error/10 p-2 text-sm text-foreground"
            >
              <span>{sent.message}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => onRetry(false)}>
                <RotateCcw aria-hidden />
                Try again
              </Button>
            </div>
          ) : null}
        </td>
      </tr>
    </tbody>
  );
}

/** One attached file: its name, a preview (eye) and a remove button. */
function FileChip({
  file,
  disabled,
  onPreview,
  onRemove,
}: {
  file: File;
  disabled: boolean;
  onPreview: (target: PreviewTarget) => void;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted py-0.5 pr-0.5 pl-2 text-xs">
      {file.type.startsWith("image/") ? (
        <ImageIcon className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <FileText className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="max-w-44 truncate" title={file.name}>
        {file.name}
      </span>
      <button
        type="button"
        className="inline-flex size-7 items-center justify-center rounded-full hover:bg-surface"
        aria-label={`Preview ${file.name}`}
        title="Preview"
        onClick={() =>
          onPreview({ src: URL.createObjectURL(file), mimeType: file.type, fileName: file.name })
        }
      >
        <Eye className="size-3.5" aria-hidden />
      </button>
      <button
        type="button"
        className="inline-flex size-7 items-center justify-center rounded-full hover:bg-surface disabled:opacity-50"
        disabled={disabled}
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

/** Bill type, period, value(s) and unit of one bill: four cells, merged down when `rowSpan` > 1. */
function LineCells({
  line,
  label,
  rowSpan,
  totalLabel,
  categories,
  periods,
  metricOf,
  disabled,
  onChange,
}: {
  line: BillLine;
  /** "Submission 1, bill 2": names every control for a screen reader (the headers name the columns). */
  label: string;
  rowSpan: number;
  totalLabel: boolean;
  categories: UploadTarget["categories"];
  /** The billing months a bill may be typed for (owner's request, 2026-11-13), newest first. */
  periods: BillingMonth[];
  metricOf: (id: string) => UploadMetric | undefined;
  disabled: boolean;
  onChange: (line: Partial<BillLine>) => void;
}) {
  const metric = metricOf(line.metricId);
  const fields = metric?.entryFields ?? [];
  // Travel: distance x passengers, shown as the passenger-km the engine will use.
  const product =
    fields.length === 2 && fields.every((f) => readNumber(line.values[f.key]) !== null)
      ? fields.reduce((n, f) => n * (readNumber(line.values[f.key]) ?? 0), 1)
      : null;
  const isTravel = fields.some((f) => f.key === "distance");
  return (
    <>
      <td rowSpan={rowSpan} className={cn(cell, "min-w-48")}>
        <NativeSelect
          aria-label={`${label}: bill type`}
          className="h-9"
          value={line.metricId}
          disabled={disabled}
          onChange={(e) =>
            onChange({ metricId: e.target.value, values: valuesFor(metricOf(e.target.value)) })
          }
        >
          <option value="">Choose…</option>
          {categories.map((c) => (
            <optgroup key={c.id} label={c.name}>
              {c.metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
      </td>
      <td rowSpan={rowSpan} className={cn(cell, "min-w-48")}>
        <NativeSelect
          aria-label={`${label}: billing period`}
          className="h-9"
          value={line.periodId}
          disabled={disabled}
          onChange={(e) => onChange({ periodId: e.target.value })}
        >
          <option value="">Choose…</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.late ? " (late submission)" : ""}
            </option>
          ))}
        </NativeSelect>
      </td>
      <td rowSpan={rowSpan} className={cn(cell, "min-w-44")}>
        {fields.length === 0 ? (
          <p className="flex h-9 items-center text-xs text-muted-foreground">
            Choose the bill type first
          </p>
        ) : (
          <div className="space-y-1.5">
            {fields.map((f) => (
              <div key={f.key} className="space-y-0.5">
                {fields.length > 1 || totalLabel ? (
                  <span className="block text-[11px] leading-4 text-muted-foreground">
                    {totalLabel ? `Total: ${shortLabel(f.label)}` : shortLabel(f.label)}
                  </span>
                ) : null}
                <Input
                  aria-label={`${label}: ${totalLabel ? "total " : ""}${shortLabel(f.label).toLowerCase()}`}
                  className="h-9"
                  inputMode="decimal"
                  autoComplete="off"
                  value={line.values[f.key] ?? ""}
                  disabled={disabled}
                  placeholder="As on the bill"
                  onChange={(e) =>
                    onChange({ values: { ...line.values, [f.key]: e.target.value } })
                  }
                />
              </div>
            ))}
            {isTravel && product !== null ? (
              <p className="text-[11px] text-muted-foreground">
                = {product.toLocaleString("en-IN", { maximumFractionDigits: 3 })} passenger-km
              </p>
            ) : null}
          </div>
        )}
      </td>
      <td rowSpan={rowSpan} className={cn(cell, "w-24")}>
        {metric?.unitKey ? (
          <NativeSelect
            aria-label={`${label}: unit`}
            className="h-9"
            value={line.values[metric.unitKey] ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onChange({ values: { ...line.values, [metric.unitKey!]: e.target.value } })
            }
          >
            {metric.units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <p className="flex h-9 items-center text-xs text-muted-foreground">
            {metric ? "Count" : "—"}
          </p>
        )}
      </td>
    </>
  );
}

/** "Distance of the journey (km)" -> "Distance of the journey": the unit has its own column. */
function shortLabel(label: string): string {
  return label.replace(/\s*\((?:km|kwh|litres|kg)\)\s*$/i, "");
}

/** A file shown in a dialog: one attached on this page, or a bill already recorded. */
function PreviewDialog({ target, onClose }: { target: PreviewTarget | null; onClose: () => void }) {
  return (
    <Dialog open={!!target} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="flex h-[88vh] max-w-[min(64rem,calc(100vw-2rem))] flex-col gap-3 sm:max-w-[min(64rem,calc(100vw-2rem))]">
        <DialogTitle className="truncate pr-8">{target?.fileName ?? "Preview"}</DialogTitle>
        {target ? (
          <DocumentViewer
            src={target.src}
            mimeType={target.mimeType}
            fileName={target.fileName}
            className="min-h-0 flex-1"
            arrowKeys
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** A row that has been sent: where it stands, and where to go next. */
function SentRow({
  row,
  index,
  sent,
  metricOf,
  onPreview,
}: {
  row: UploadRow;
  index: number;
  sent: Exclude<Sent, { state: "sending" | "error" | "duplicate" }>;
  metricOf: (id: string) => UploadMetric | undefined;
  onPreview: (target: PreviewTarget) => void;
}) {
  const metric = metricOf(row.metricId);
  const typed = (metric?.entryFields ?? []).map((f) => row.values[f.key]).join(" × ");
  const unit = metric?.unitKey ? row.values[metric.unitKey] : "";
  const bills = row.mode === "each" ? row.more.length + 1 : 1;
  // What was uploaded: each recorded bill, or the upload itself while it is read.
  const uploaded =
    sent.state === "recorded" && sent.documents.length > 0
      ? sent.documents.map((d) => ({ id: d.documentId, name: d.fileName }))
      : [{ id: sent.documentId, name: `Submission ${index + 1}` }];
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm sm:p-4",
        sent.state === "recorded"
          ? "border-status-success/40 bg-status-success/10"
          : sent.state === "failed"
            ? "border-status-error/40 bg-status-error/10"
            : sent.state === "check"
              ? "border-status-warning/50 bg-status-warning/10"
              : "border-border bg-surface",
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          Submission {index + 1}: {metric?.name ?? "Bill"}
          {bills > 1 ? ` and ${bills - 1} more` : ""} — {typed}
          {unit ? ` ${unit}` : ""}
        </p>
        <p className="flex items-center gap-2 text-foreground" role="status">
          {sent.state === "reading" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Reading the document…
            </>
          ) : sent.state === "recorded" ? (
            <>
              <CheckCircle2 className="size-4 text-status-success" aria-hidden />
              Recorded. Check the values read against yours on Verify.
            </>
          ) : sent.state === "check" ? (
            <>
              <AlertTriangle className="size-4 text-status-warning" aria-hidden />
              {sent.reason}
            </>
          ) : (
            <>
              <AlertTriangle className="size-4 text-status-error" aria-hidden />
              The document could not be read{sent.message ? `: ${sent.message}` : "."}
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {uploaded.map((d, i) => (
          <Button
            key={d.id}
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Preview ${d.name}`}
            title={`Preview ${d.name}`}
            onClick={() =>
              onPreview({
                src: `/api/documents/${d.id}/file`,
                // A recorded bill may be a photo; the viewer finds out from the file itself.
                mimeType: /\.(jpe?g|png)$/i.test(d.name)
                  ? d.name.toLowerCase().endsWith(".png")
                    ? "image/png"
                    : "image/jpeg"
                  : "application/pdf",
                fileName: d.name,
              })
            }
          >
            <Eye aria-hidden />
            {uploaded.length > 1 ? `Bill ${i + 1}` : "Preview"}
          </Button>
        ))}
        {sent.state === "recorded"
          ? sent.documents.map((d, i) => (
              <Button
                key={d.documentId}
                asChild
                size="sm"
                variant={i === 0 ? "default" : "outline"}
              >
                <Link href={`/app/verify/${d.documentId}`}>
                  Verify{sent.documents.length > 1 ? ` bill ${i + 1}` : ""}
                </Link>
              </Button>
            ))
          : null}
        {sent.state === "check" || sent.state === "failed" ? (
          <Button asChild size="sm">
            <Link href={`/app/upload/split/${sent.documentId}`}>
              {sent.state === "check" ? "Check the bills" : "Open"}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
