"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
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
            className="text-sm leading-5 font-semibold text-brsr-heading"
          >
            Section {section.code} — {section.name}
          </h2>
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
                {section.indicators.flatMap((indicator) => {
                  const rows = indicator.mappings.length ? indicator.mappings : [null];
                  return rows.map((mapping, i) => (
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
                              onClick={() => setEditing({ indicatorId: indicator.id, mapping })}
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
                  ));
                })}
              </tbody>
            </table>
          </div>
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
