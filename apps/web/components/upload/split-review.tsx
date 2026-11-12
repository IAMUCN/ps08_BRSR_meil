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
import { checkBundleParts, pagesLabel } from "@/lib/documents/bundle";
import type { BundlePartView } from "@/lib/trpc/routers/bundles";
import type { UploadCategory } from "@/lib/trpc/routers/documents";

// Review of a multi-bill PDF's proposed split (.grill/multi-bill-pdf-decisions.md): the OCR proposes, the
// uploader decides. Nothing is recorded until Confirm; the rules shown here are the server's own.

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
};

type Duplicate = { bill: number; metricName: string; existingRecords: number };

export function SplitReview({
  documentId,
  fileName,
  pageCount,
  parts,
  categories,
  periodLabel,
  orgUnitName,
}: {
  documentId: string;
  fileName: string;
  pageCount: number;
  parts: BundlePartView[];
  categories: UploadCategory[];
  periodLabel: string;
  orgUnitName: string;
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
      };
    }),
  }));
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
      })),
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
        <p className="text-sm leading-5 text-muted-foreground">
          {orgUnitName} · {periodLabel} · {pageCount} {pageCount === 1 ? "page" : "pages"}. Each
          bill below becomes its own record that you then review and confirm. Change the pages or
          the activity if the guess is wrong.
        </p>

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

        {problem ? (
          <p role="alert" className="text-sm leading-5 text-status-error">
            {problem}
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
                  {d.existingRecords === 1 ? "record" : "records"} for {periodLabel}. Continue if it
                  is a separate bill.
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
            disabled={busy || problem !== null || duplicates !== null}
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

function range(from: number, to: number): number[] {
  return Number.isInteger(from) && Number.isInteger(to) && to >= from
    ? Array.from({ length: to - from + 1 }, (_, i) => from + i)
    : [];
}
