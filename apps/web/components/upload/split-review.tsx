"use client";

import { AlertTriangle, Loader2, Plus, Redo2, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { confirmBundleAction } from "@/app/app/upload/actions";
import { DocumentViewer, isTyping } from "@/components/document-viewer/document-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { entryProblem } from "@/lib/declarations/compare";
import { billingFits, checkBundleParts, pagesLabel, submittedLabel } from "@/lib/documents/bundle";
import type { BundlePartView, ReviewDeclaration, ReviewPeriod } from "@/lib/trpc/routers/bundles";
import type { UploadCategory } from "@/lib/trpc/routers/documents";

// Review of an upload's proposed split (.grill/multi-bill-pdf-decisions.md, .grill/merged-upload-decisions.md):
// the OCR proposes the bills, their activity and their reporting period; the uploader decides. Nothing is
// recorded until Confirm; the rules shown here are the server's own.

type Row = {
  key: string;
  pageFrom: number;
  pageTo: number;
  metricId: string;
  skip: boolean;
  /** What the OCR took it to be, or null; only for the "looks like" hint. */
  typeName: string | null;
  /** The OCR proposed an activity this person's role may not record here. */
  notAllowed: boolean;
  /** The reporting period the bill is filed in. */
  periodId: string;
  /** What OCR read on the bill; null for a bill added or changed here. */
  billingPeriod: string | null;
  billNumber: string | null;
  /** The typed row (position) this bill is, or null: its values are typed here (migration 0077). */
  declaration: number | null;
  /** Values typed here for a bill no row was typed for. */
  values: Record<string, string>;
};

type Duplicate = { bill: number; metricName: string; existingRecords: number; periodLabel: string };

export function SplitReview({
  documentId,
  fileName,
  pageCount,
  parts,
  categories,
  orgUnitName,
  periods,
  defaultPeriodId,
  submittedAt,
  sources,
  declarations = [],
}: {
  documentId: string;
  fileName: string;
  pageCount: number;
  parts: BundlePartView[];
  categories: UploadCategory[];
  orgUnitName: string;
  periods: ReviewPeriod[];
  defaultPeriodId: string | null;
  submittedAt: string;
  sources: { fileName: string; pageFrom: number; pageTo: number }[];
  /** The rows typed for this upload on the Upload page; empty for an older upload. */
  declarations?: ReviewDeclaration[];
}) {
  const router = useRouter();
  const idPrefix = useId();
  const allowed = useMemo(
    () => new Set(categories.flatMap((c) => c.metrics.map((m) => m.id))),
    [categories],
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [history, setHistory] = useState<{ past: Row[][]; rows: Row[]; future: Row[][] }>(() => ({
    past: [],
    future: [],
    rows: parts.map((p, i) => {
      const notAllowed = p.metricId !== null && !allowed.has(p.metricId);
      return {
        key: `${i}`,
        pageFrom: p.pageFrom,
        pageTo: p.pageTo,
        metricId: p.metricId && !notAllowed ? p.metricId : "",
        // A bill the role may not record is left out by default, and says so.
        skip: notAllowed,
        typeName: p.documentTypeName,
        notAllowed,
        periodId: p.proposedPeriodId ?? defaultPeriodId ?? "",
        billingPeriod: p.billingPeriod,
        billNumber: p.billNumber,
        declaration: p.proposedDeclaration,
        values: {},
      };
    }),
  }));
  const typedUpload = declarations.length > 0;
  const metricById = useMemo(
    () => new Map(categories.flatMap((c) => c.metrics).map((m) => [m.id, m])),
    [categories],
  );
  // Typed rows the person says are not in this upload (they stay in the audit trail).
  const [dropped, setDropped] = useState<number[]>([]);
  const periodById = useMemo(() => new Map(periods.map((p) => [p.id, p])), [periods]);
  const rows = history.rows;
  // Undo / redo (owner's page feedback, 2026-11-11): every change to the split is one step, except that
  // typing in one page box is merged into a single step. The history ends with the page.
  // The page box last typed in: further keystrokes there extend the same step until another change.
  const lastEdit = useRef<string | null>(null);
  function setRows(change: (current: Row[]) => Row[], tag?: string) {
    const merge = !!tag && lastEdit.current === tag;
    lastEdit.current = tag ?? null;
    setHistory((h) => ({
      past: merge ? h.past : [...h.past, h.rows].slice(-100),
      rows: change(h.rows),
      future: [],
    }));
  }
  const undo = () => {
    lastEdit.current = null;
    setHistory((h) =>
      h.past.length
        ? {
            past: h.past.slice(0, -1),
            rows: h.past[h.past.length - 1],
            future: [h.rows, ...h.future],
          }
        : h,
    );
    setDuplicates(null);
    setFailure(null);
  };
  const redo = () => {
    lastEdit.current = null;
    setHistory((h) =>
      h.future.length
        ? { past: [...h.past, h.rows], rows: h.future[0], future: h.future.slice(1) }
        : h,
    );
    setDuplicates(null);
    setFailure(null);
  };
  const keys = useRef({ undo, redo });
  useEffect(() => {
    keys.current = { undo, redo };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      // In a text box Ctrl+Z belongs to the box.
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) keys.current.undo();
      else if (key === "y" || (key === "z" && event.shiftKey)) keys.current.redo();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const problem = checkBundleParts(
    rows.map((r) => ({
      pageFrom: r.pageFrom,
      pageTo: r.pageTo,
      metricId: r.metricId || null,
      skip: r.skip,
    })),
    pageCount,
  );
  const keptCount = rows.filter((r) => !r.skip).length;
  const periodProblem = rows.findIndex((r) => !r.skip && !periodById.has(r.periodId));
  const typedProblem = typedUpload ? checkTyped() : null;
  const shownProblem =
    problem ??
    (periodProblem >= 0 ? `Bill ${periodProblem + 1}: choose its reporting period.` : null) ??
    typedProblem;

  /** The server's rules for a typed upload (bundles.confirm planBills), for a message before Confirm. */
  function checkTyped(): string | null {
    const used = new Map<number, number>();
    for (const [index, row] of rows.entries()) {
      if (row.skip) continue;
      if (row.declaration) {
        used.set(row.declaration, (used.get(row.declaration) ?? 0) + 1);
        const d = declarations.find((x) => x.position === row.declaration);
        if (d && d.mode !== "total" && used.get(row.declaration)! > 1) {
          return `Row ${row.declaration} was typed for one bill; two bills point to it. Type the values of the other.`;
        }
        continue;
      }
      const metric = metricById.get(row.metricId);
      if (!metric) continue; // the split check names it
      const typed = entryProblem(metric.entryFields, row.values);
      if (typed) return `Bill ${index + 1}: ${typed}`;
      if (metric.unitKey && !row.values[metric.unitKey])
        return `Bill ${index + 1}: choose the unit.`;
    }
    const missing = declarations.find(
      (d) => !used.has(d.position) && !dropped.includes(d.position),
    );
    return missing
      ? `Row ${missing.position} that you typed (${missing.metricName}, ${missing.summary}) isn't matched to a bill. Choose its bill, or tick "Not in this upload".`
      : null;
  }

  function update(key: string, change: Partial<Row>) {
    const field = Object.keys(change).join(",");
    setRows(
      (current) => current.map((r) => (r.key === key ? { ...r, ...change } : r)),
      // Keystrokes in a page box merge into one step.
      field === "pageFrom" || field === "pageTo" ? `${key}:${field}` : undefined,
    );
    setDuplicates(null);
    setFailure(null);
  }

  function addBill() {
    const used = new Set(rows.flatMap((r) => range(r.pageFrom, r.pageTo)));
    const free = range(1, pageCount).filter((p) => !used.has(p));
    const first = free[0] ?? pageCount;
    setRows((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        pageFrom: first,
        pageTo: first,
        metricId: "",
        skip: false,
        typeName: null,
        notAllowed: false,
        periodId: defaultPeriodId ?? "",
        billingPeriod: null,
        billNumber: null,
        declaration: null,
        values: {},
      },
    ]);
    setDuplicates(null);
  }

  async function confirm(acknowledgeDuplicates: boolean) {
    setBusy(true);
    setFailure(null);
    const result = await confirmBundleAction({
      documentId,
      acknowledgeDuplicates,
      parts: rows.map((r) => ({
        pageFrom: r.pageFrom,
        pageTo: r.pageTo,
        metricId: r.metricId || null,
        skip: r.skip,
        reportingPeriodId: r.periodId || undefined,
        ...(typedUpload
          ? r.declaration
            ? { declaration: r.declaration }
            : { declaration: null, values: r.values }
          : {}),
      })),
      dropDeclarations: dropped,
    });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    if (result.data.status === "confirm") {
      setDuplicates(result.data.duplicates);
      return;
    }
    toast.success(
      `${result.data.count} ${result.data.count === 1 ? "bill" : "bills"} received, processing`,
    );
    router.push("/app/submissions?tab=processing");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* The upload's evidence is the PDF made from its files: the original files are kept as well. */}
      <DocumentViewer
        src={`/api/documents/${documentId}/file`}
        mimeType="application/pdf"
        fileName={fileName}
        className="h-[70vh] xl:sticky xl:top-4"
        arrowKeys
      />

      <div className="space-y-4">
        <div
          className="flex flex-wrap items-center justify-end gap-1"
          role="toolbar"
          aria-label="Edit"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || history.past.length === 0}
            onClick={undo}
            title="Undo (Ctrl+Z)"
            aria-keyshortcuts="Control+Z"
          >
            <Undo2 aria-hidden />
            Undo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || history.future.length === 0}
            onClick={redo}
            title="Redo (Ctrl+Y)"
            aria-keyshortcuts="Control+Y Control+Shift+Z"
          >
            <Redo2 aria-hidden />
            Redo
          </Button>
        </div>
        <div className="space-y-1 text-sm leading-5 text-muted-foreground">
          <p>
            {orgUnitName} · {pageCount} {pageCount === 1 ? "page" : "pages"} · submitted on{" "}
            <time dateTime={submittedAt} className="font-medium text-foreground">
              {submittedLabel(submittedAt)}
            </time>
          </p>
          {sources.length > 1 ? (
            <p>
              Files, in reading order:{" "}
              {sources.map((s) => `${s.fileName} (${pagesLabel(s.pageFrom, s.pageTo)})`).join(", ")}
            </p>
          ) : null}
          <p>
            Each bill below becomes its own record that you then review and confirm. Change the
            pages, the activity or the reporting period if the guess is wrong.
          </p>
        </div>

        <ul className="space-y-3">
          {rows.map((row, index) => {
            const id = `${idPrefix}-${row.key}`;
            return (
              <li key={row.key} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm leading-5 font-semibold">
                    Bill {index + 1} · {pagesLabel(row.pageFrom, row.pageTo)}
                  </h2>
                  <span className="text-xs leading-4 text-muted-foreground">
                    {row.typeName
                      ? `Looks like: ${row.typeName}`
                      : "Couldn't tell what this is — choose below"}
                  </span>
                </div>
                {row.billNumber || row.billingPeriod ? (
                  <p className="text-xs leading-4 text-muted-foreground">
                    {[
                      row.billNumber ? `Bill no. ${row.billNumber}` : null,
                      row.billingPeriod ? `Billing period ${row.billingPeriod}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-[6rem_6rem_1fr]">
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-from`}>From page</Label>
                    <Input
                      id={`${id}-from`}
                      type="number"
                      min={1}
                      max={pageCount}
                      value={row.pageFrom}
                      disabled={busy}
                      onChange={(e) => update(row.key, { pageFrom: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-to`}>To page</Label>
                    <Input
                      id={`${id}-to`}
                      type="number"
                      min={1}
                      max={pageCount}
                      value={row.pageTo}
                      disabled={busy}
                      onChange={(e) => update(row.key, { pageTo: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2 space-y-1 sm:col-span-1">
                    <Label htmlFor={`${id}-metric`}>ESG activity</Label>
                    <NativeSelect
                      id={`${id}-metric`}
                      value={row.metricId}
                      disabled={busy || row.skip}
                      onChange={(e) => update(row.key, { metricId: e.target.value })}
                    >
                      <option value="">Select an activity…</option>
                      {categories.map((category) => (
                        <optgroup key={category.id} label={category.name}>
                          {category.metrics.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.unit})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </NativeSelect>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`${id}-period`}>Reporting period</Label>
                  <NativeSelect
                    id={`${id}-period`}
                    value={row.periodId}
                    disabled={busy || row.skip}
                    onChange={(e) => update(row.key, { periodId: e.target.value })}
                  >
                    {periodById.has(row.periodId) ? null : (
                      <option value="">Select a period…</option>
                    )}
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                        {p.late ? " (late)" : ""}
                      </option>
                    ))}
                  </NativeSelect>
                  <PeriodNote row={row} period={periodById.get(row.periodId)} />
                </div>

                {typedUpload && !row.skip ? (
                  <TypedChoice
                    id={id}
                    row={row}
                    declarations={declarations}
                    metric={metricById.get(row.metricId)}
                    disabled={busy}
                    onChange={(change) => update(row.key, change)}
                  />
                ) : null}

                {row.notAllowed ? (
                  <p className="text-sm leading-5 text-status-warning">
                    This looks like an activity your role can&apos;t record for this project, so it
                    is left out. Choose another activity if that&apos;s wrong.
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm leading-5">
                    <input
                      type="checkbox"
                      checked={row.skip}
                      disabled={busy}
                      onChange={(e) => update(row.key, { skip: e.target.checked })}
                      className="accent-[var(--primary)]"
                    />
                    Leave this one out
                  </label>
                  {rows.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setRows((current) => current.filter((r) => r.key !== row.key));
                        setDuplicates(null);
                      }}
                    >
                      <Trash2 aria-hidden />
                      Remove
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={addBill}>
          <Plus aria-hidden />
          Add a bill
        </Button>

        {typedUpload ? (
          <UnmatchedRows
            declarations={declarations}
            used={new Set(rows.filter((r) => !r.skip && r.declaration).map((r) => r.declaration!))}
            dropped={dropped}
            disabled={busy}
            onDrop={(position, drop) =>
              setDropped((all) => (drop ? [...all, position] : all.filter((p) => p !== position)))
            }
          />
        ) : null}

        {shownProblem ? (
          <p role="alert" className="text-sm leading-5 text-status-error">
            {shownProblem}
          </p>
        ) : null}

        {duplicates ? (
          <div
            role="alert"
            className="space-y-3 rounded-md border border-status-warning/50 bg-status-warning/10 p-4"
          >
            <p className="flex items-center gap-2 text-sm leading-5 font-semibold">
              <AlertTriangle className="size-4 text-status-warning" aria-hidden />
              Possible duplicates
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-5">
              {duplicates.map((d) => (
                <li key={d.bill}>
                  Bill {d.bill}: {orgUnitName} already has {d.existingRecords} {d.metricName}{" "}
                  {d.existingRecords === 1 ? "record" : "records"} for {d.periodLabel}. Continue if
                  it is a separate bill.
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={() => void confirm(true)}>
                Record anyway
              </Button>
              <Button type="button" variant="outline" onClick={() => setDuplicates(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {failure ? (
          <div
            role="alert"
            className="rounded-md border border-status-error/40 bg-status-error/10 p-4 text-sm leading-5"
          >
            {failure}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={busy || shownProblem !== null || duplicates !== null}
            onClick={() => void confirm(false)}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {busy ? "Recording…" : `Record ${keptCount} ${keptCount === 1 ? "bill" : "bills"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Under a bill's period: whether its billing period fits (owner's request, 2026-11-12). A bill filed in a
 * period its billing period does not touch is still recorded, and flagged for the reviewer after Verify.
 */
function PeriodNote({ row, period }: { row: Row; period: ReviewPeriod | undefined }) {
  if (!period || row.skip) return null;
  if (!row.billingPeriod) {
    return (
      <p className="text-xs leading-4 text-muted-foreground">
        No billing period was read on this bill: check the period yourself.
      </p>
    );
  }
  const fits = billingFits(row.billingPeriod, period);
  if (fits === false) {
    return (
      <p className="flex items-start gap-1.5 text-sm leading-5 text-status-warning">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Billing period doesn&apos;t match: {row.billingPeriod} is outside {period.label}. Choose
          the right period, or keep it and it is flagged for review.
        </span>
      </p>
    );
  }
  return fits ? (
    <p className="text-xs leading-4 text-muted-foreground">
      The billing period falls in {period.label}.
    </p>
  ) : null;
}

function range(from: number, to: number): number[] {
  return Number.isInteger(from) && Number.isInteger(to) && to >= from
    ? Array.from({ length: to - from + 1 }, (_, i) => from + i)
    : [];
}

/** Which typed row a bill is, or its values typed here (migration 0077). */
function TypedChoice({
  id,
  row,
  declarations,
  metric,
  disabled,
  onChange,
}: {
  id: string;
  row: Row;
  declarations: ReviewDeclaration[];
  metric: UploadCategory["metrics"][number] | undefined;
  disabled: boolean;
  onChange: (change: Partial<Row>) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      <div className="space-y-1">
        <Label htmlFor={`${id}-typed`}>Typed on the Upload page as</Label>
        <NativeSelect
          id={`${id}-typed`}
          value={row.declaration ?? ""}
          disabled={disabled}
          onChange={(e) => {
            const position = e.target.value ? Number(e.target.value) : null;
            const d = declarations.find((x) => x.position === position);
            // Choosing a typed row takes its bill type and period; they can still be changed above.
            onChange(
              d
                ? { declaration: d.position, metricId: d.metricId, periodId: d.reportingPeriodId }
                : { declaration: null },
            );
          }}
        >
          <option value="">Not typed — I&apos;ll type its value here</option>
          {declarations.map((d) => (
            <option key={d.position} value={d.position}>
              Row {d.position}: {d.metricName} — {d.summary} ({d.periodLabel})
            </option>
          ))}
        </NativeSelect>
      </div>
      {row.declaration === null ? (
        metric ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {metric.entryFields.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`${id}-v-${f.key}`} className="text-xs">
                  {f.label}
                </Label>
                <Input
                  id={`${id}-v-${f.key}`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={row.values[f.key] ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange({ values: { ...row.values, [f.key]: e.target.value } })}
                />
              </div>
            ))}
            {metric.unitKey ? (
              <div className="space-y-1">
                <Label htmlFor={`${id}-v-unit`} className="text-xs">
                  Unit
                </Label>
                <NativeSelect
                  id={`${id}-v-unit`}
                  value={row.values[metric.unitKey] ?? ""}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({ values: { ...row.values, [metric.unitKey!]: e.target.value } })
                  }
                >
                  <option value="">Choose…</option>
                  {metric.units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Choose the activity to type its value.</p>
        )
      ) : null}
    </div>
  );
}

/** Typed rows no bill points to: the person ticks each one that is not in this upload. */
function UnmatchedRows({
  declarations,
  used,
  dropped,
  disabled,
  onDrop,
}: {
  declarations: ReviewDeclaration[];
  used: Set<number>;
  dropped: number[];
  disabled: boolean;
  onDrop: (position: number, drop: boolean) => void;
}) {
  const unmatched = declarations.filter((d) => !used.has(d.position));
  if (unmatched.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border border-status-warning/50 bg-status-warning/10 p-4 text-sm">
      <p className="font-semibold">Typed but not matched to a bill</p>
      <ul className="space-y-1">
        {unmatched.map((d) => (
          <li key={d.position}>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--primary)]"
                checked={dropped.includes(d.position)}
                disabled={disabled}
                onChange={(e) => onDrop(d.position, e.target.checked)}
              />
              <span>
                Row {d.position}: {d.metricName} — {d.summary} ({d.periodLabel}).{" "}
                <span className="text-muted-foreground">
                  Not in this upload (it stays in the record of what was typed).
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
