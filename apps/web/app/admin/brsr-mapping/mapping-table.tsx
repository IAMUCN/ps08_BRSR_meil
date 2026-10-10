"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/ui/status-badge";
import { PRINCIPLE_TITLES } from "@/lib/brsr/principles";
import { financialYearLabel } from "@/lib/consolidation/aggregate";
import type { BrsrMapping, MappingsView } from "@/lib/trpc/routers/brsr";
import { removeMappingAction, saveMappingAction } from "./actions";

// UI brief §14: "table of metric→indicator mappings, grouped by BRSR section (using --brsr-heading /
// --brsr-badge tokens)". Edits happen in a side sheet; removal is confirmed.

type Editing = { indicatorId: string; mapping: BrsrMapping | null };

export function MappingTable({ view }: { view: MappingsView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<BrsrMapping | null>(null);
  const indicators = view.sections.flatMap((s) => s.indicators);

  function remove() {
    if (!removing) return;
    startTransition(async () => {
      const result = await removeMappingAction(removing.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Mapping removed");
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ indicatorId: indicators[0]?.id ?? "", mapping: null })}>
          <Plus aria-hidden />
          Add mapping
        </Button>
      </div>

      {view.sections.map((section) => (
        <section key={section.code} aria-labelledby={`brsr-${section.code}`} className="space-y-2">
          <h2
            id={`brsr-${section.code}`}
            className="text-base leading-6 font-semibold text-brsr-heading"
          >
            Section {section.code} — {section.name}
          </h2>
          <p className="text-sm leading-5 text-muted-foreground">
            {section.indicators.length} answered from records
            {section.written.length ? (
              <>
                {" · "}
                {section.written.length} written,{" "}
                <Link
                  href="/admin/disclosures"
                  className="font-medium text-primary-text underline-offset-4 hover:underline"
                >
                  typed on BRSR Disclosures
                </Link>
              </>
            ) : null}
          </p>
          {section.indicators.length === 0 ? (
            <p className="rounded-md border border-table-border bg-table-row px-3 py-4 text-sm leading-5 text-muted-foreground">
              No ESG metric maps to this section: every question in it is a written disclosure
              (policies, governance, oversight), not a figure read from a document. The questions
              are still part of the BRSR report — they are listed below.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-table-border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-table-header text-table-header-foreground">
                  <tr>
                    {["Indicator", "ESG metric", "Notes", "Applicable", ""].map((h, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                      >
                        {h || <span className="sr-only">Actions</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.indicators.map((indicator, index) => {
                    const rows = indicator.mappings.length ? indicator.mappings : [null];
                    const principle =
                      indicator.principle !== null &&
                      indicator.principle !== section.indicators[index - 1]?.principle
                        ? indicator.principle
                        : null;
                    return (
                      <Fragment key={indicator.id}>
                        {principle !== null ? (
                          <tr className="border-t border-table-border bg-table-header/60">
                            <th
                              colSpan={5}
                              scope="colgroup"
                              className="px-3 py-2 text-left text-sm leading-5 font-semibold"
                            >
                              Principle {principle}: {PRINCIPLE_TITLES[principle - 1]}
                            </th>
                          </tr>
                        ) : null}
                        {rows.map((mapping, i) => (
                          <tr
                            key={mapping?.id ?? indicator.id}
                            className="border-t border-table-border bg-table-row align-top"
                          >
                            {i === 0 ? (
                              <td rowSpan={rows.length} className="max-w-sm px-3 py-3">
                                <span className="inline-flex items-center gap-2">
                                  <span className="shrink-0 rounded-sm border border-brsr-badge bg-brsr-badge/15 px-1.5 font-mono text-xs whitespace-nowrap">
                                    {indicator.code}
                                  </span>
                                  {indicator.indicatorType ? (
                                    <span className="text-xs text-muted-foreground capitalize">
                                      {indicator.indicatorType}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                                  {indicator.questionText}
                                </span>
                              </td>
                            ) : null}
                            {mapping ? (
                              <>
                                <td className="px-3 py-3 font-medium">{mapping.metricName}</td>
                                <td className="max-w-xs px-3 py-3 text-xs text-muted-foreground">
                                  {mapping.notes ?? "—"}
                                  <span className="mt-1 block font-medium text-foreground">
                                    Reports the{" "}
                                    {mapping.reportedValue === "activity"
                                      ? "verified quantity"
                                      : "calculated result"}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <StatusBadge tone={mapping.isApplicable ? "success" : "neutral"}>
                                    {mapping.isApplicable ? "Applicable" : "Not applicable"}
                                  </StatusBadge>
                                </td>
                                <td className="space-x-2 px-3 py-3 text-right whitespace-nowrap">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      setEditing({ indicatorId: indicator.id, mapping })
                                    }
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setRemoving(mapping)}
                                  >
                                    Remove
                                  </Button>
                                </td>
                              </>
                            ) : (
                              <td colSpan={4} className="px-3 py-3 text-sm text-muted-foreground">
                                No metric feeds this indicator.
                              </td>
                            )}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {section.written.length ? (
            <details
              open={section.indicators.length === 0}
              className="rounded-md border border-table-border bg-table-row"
            >
              <summary className="cursor-pointer px-3 py-2 text-sm leading-5 font-medium">
                {section.written.length} written questions in Section {section.code} —{" "}
                {section.written.filter((q) => q.answered).length} answered for{" "}
                {financialYearLabel(view.financialYear)}
              </summary>
              <div className="space-y-2 border-t border-table-border px-3 py-3">
                <p className="text-sm leading-5 text-muted-foreground">
                  How these reach the report: each question is printed in Section {section.code} of
                  the BRSR report, in SEBI&apos;s order, with the answer typed on{" "}
                  <Link
                    href="/admin/disclosures"
                    className="font-medium text-primary-text underline-offset-4 hover:underline"
                  >
                    BRSR Disclosures
                  </Link>{" "}
                  for the report&apos;s financial year. A question with no answer is printed as
                  &ldquo;Not reported&rdquo;. They do not affect any calculated figure or the BRSR
                  Readiness %.
                </p>
                <p className="text-sm leading-5 text-muted-foreground">
                  When to answer: once for each financial year, at any time before that year&apos;s
                  report is generated. Answers can be changed later; a report already generated
                  keeps what it printed. The Reports page shows how many are still unanswered before
                  you generate.
                </p>
                <ul className="divide-y divide-table-border">
                  {section.written.map((q, index) => {
                    const principle =
                      q.principle !== null && q.principle !== section.written[index - 1]?.principle
                        ? q.principle
                        : null;
                    return (
                      <Fragment key={q.code}>
                        {principle !== null ? (
                          <li className="pt-3 pb-1 text-sm leading-5 font-semibold">
                            Principle {principle}: {PRINCIPLE_TITLES[principle - 1]}
                          </li>
                        ) : null}
                        <li className="flex items-start justify-between gap-3 py-2 text-sm leading-5">
                          <span>
                            <span className="mr-2 rounded-sm border border-brsr-badge bg-brsr-badge/15 px-1.5 font-mono text-xs whitespace-nowrap">
                              {q.code}
                            </span>
                            <span className="text-muted-foreground">{q.questionText}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <StatusBadge tone={q.answered ? "success" : "neutral"}>
                              {q.answered ? "Answered" : "Not reported"}
                            </StatusBadge>
                            <Link
                              href={`/admin/disclosures?year=${view.financialYear}#q-${q.code}`}
                              className="font-medium text-primary-text underline-offset-4 hover:underline"
                            >
                              {q.answered ? "Edit" : "Answer"}
                            </Link>
                          </span>
                        </li>
                      </Fragment>
                    );
                  })}
                </ul>
              </div>
            </details>
          ) : null}
        </section>
      ))}

      {editing ? (
        <MappingSheet
          key={editing.mapping?.id ?? "new"}
          editing={editing}
          view={view}
          onClose={() => setEditing(null)}
          onDone={() => router.refresh()}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this mapping?"
        confirmLabel="Remove"
        destructive
        pending={pending}
        onConfirm={remove}
      >
        {removing
          ? `${removing.metricName} will no longer feed this indicator. To keep the history but stop counting it, mark it not applicable instead.`
          : null}
      </ConfirmDialog>
    </>
  );
}

function MappingSheet({
  editing,
  view,
  onClose,
  onDone,
}: {
  editing: Editing;
  view: MappingsView;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const existing = editing.mapping;
  const [form, setForm] = useState({
    indicatorId: editing.indicatorId,
    metricId: existing?.metricId ?? view.metrics[0]?.id ?? "",
    notes: existing?.notes ?? "",
    isApplicable: existing?.isApplicable ?? true,
    reportedValue: existing?.reportedValue ?? ("result" as "result" | "activity"),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveMappingAction({
        mappingId: existing?.id,
        indicatorId: form.indicatorId,
        metricId: form.metricId,
        notes: form.notes || undefined,
        isApplicable: form.isApplicable,
        reportedValue: form.reportedValue,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Mapping saved.");
      onClose();
      onDone();
    });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{existing ? "Edit mapping" : "Add mapping"}</SheetTitle>
          <SheetDescription>
            A metric can feed several indicators, and an indicator can be fed by several metrics.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-4 overflow-y-auto px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="map-indicator">BRSR indicator</Label>
            <NativeSelect
              id="map-indicator"
              value={form.indicatorId}
              disabled={!!existing}
              onChange={(e) => setForm({ ...form, indicatorId: e.target.value })}
              required
            >
              {view.sections.map((s) => (
                <optgroup key={s.code} label={`Section ${s.code} — ${s.name}`}>
                  {s.indicators.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.code} — {i.questionText.slice(0, 70)}
                      {i.questionText.length > 70 ? "…" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="map-metric">ESG metric</Label>
            <NativeSelect
              id="map-metric"
              value={form.metricId}
              disabled={!!existing}
              onChange={(e) => setForm({ ...form, metricId: e.target.value })}
              required
            >
              {view.metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.categoryName})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="map-notes">Notes</Label>
            <Input
              id="map-notes"
              maxLength={500}
              placeholder="How this metric answers the indicator"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="map-reported">The indicator reports</Label>
            <NativeSelect
              id="map-reported"
              value={form.reportedValue}
              onChange={(e) =>
                setForm({ ...form, reportedValue: e.target.value as "result" | "activity" })
              }
            >
              <option value="result">
                The calculated result (emissions, consumption, a percentage)
              </option>
              <option value="activity">The verified quantity (e.g. waste in kg)</option>
            </NativeSelect>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.isApplicable}
              onChange={(e) => setForm({ ...form, isApplicable: e.target.checked })}
            />
            <span>
              Applicable
              <span className="block text-xs text-muted-foreground">
                Untick to keep the mapping but leave it out of readiness and reports.
              </span>
            </span>
          </label>
          <Button type="submit" disabled={pending}>
            Save mapping
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
