"use client";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import type { FactorRow, FactorVersionRow } from "@/lib/trpc/routers/factors";
import {
  addFactorVersionAction,
  createFactorAction,
  setFactorVersionStatusAction,
} from "./actions";

// UI brief §14: "table with inline version history (expandable row) rather than a separate versions page —
// makes the 'never overwrite, always version' principle visually obvious."

const STATUS: Record<FactorVersionRow["status"], { tone: StatusTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  active: { tone: "success", label: "Active" },
  superseded: { tone: "neutral", label: "Superseded" },
  retired: { tone: "locked", label: "Retired" },
};

type ActivityType = { code: string; name: string; unit: string };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const current = (factor: FactorRow) => factor.versions.find((v) => v.status === "active") ?? null;

export function FactorsManager({
  factors,
  activityTypes,
}: {
  factors: FactorRow[];
  activityTypes: ActivityType[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [versionFor, setVersionFor] = useState<FactorRow | null>(null);

  function setStatus(version: FactorVersionRow, status: "active" | "retired") {
    startTransition(async () => {
      const result = await setFactorVersionStatusAction({ versionId: version.id, status });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(status === "active" ? "Version activated" : "Version retired");
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden />
          Add factor
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-table-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-table-header text-table-header-foreground">
            <tr>
              {["Factor", "Activity type", "Current value", "Effective", "Status", ""].map(
                (heading, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="px-3 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                  >
                    {heading || <span className="sr-only">Actions</span>}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {factors.map((factor) => {
              const active = current(factor);
              const open = expanded === factor.id;
              return (
                <Fragment key={factor.id}>
                  <tr className="border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="flex items-center gap-1 font-medium"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : factor.id)}
                      >
                        {open ? (
                          <ChevronDown className="size-4" strokeWidth={1.5} aria-hidden />
                        ) : (
                          <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
                        )}
                        {factor.name}
                      </button>
                      <span className="block pl-5 text-xs text-muted-foreground">
                        {factor.versions.length} version(s)
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs">{factor.activityType}</span>
                      <span className="block text-xs text-muted-foreground">
                        {factor.metricName ?? "No metric with this code"}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {active
                        ? `${active.value} ${active.outputUnit}/${active.inputUnit}`
                        : "No active version"}
                    </td>
                    <td className="px-3 py-3">
                      {active
                        ? `${formatDate(active.effectiveFrom)} – ${active.effectiveTo ? formatDate(active.effectiveTo) : "open"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={active ? "success" : "warning"}>
                        {active ? "Active" : "Not usable"}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => setVersionFor(factor)}>
                        New version
                      </Button>
                    </td>
                  </tr>
                  {open ? (
                    <tr className="border-t border-table-border">
                      <td colSpan={6} className="bg-muted/30 px-3 py-3">
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              {[
                                "Version",
                                "Value",
                                "Effective",
                                "Source reference",
                                "Geography",
                                "Added by",
                                "Status",
                                "",
                              ].map((h, i) => (
                                <th key={i} scope="col" className="px-2 py-1 text-left font-medium">
                                  {h || <span className="sr-only">Actions</span>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {factor.versions.map((v) => (
                              <tr key={v.id} className="border-t border-table-border/60">
                                <td className="px-2 py-1.5 font-mono">v{v.versionNumber}</td>
                                <td className="px-2 py-1.5 font-mono">
                                  {v.value} {v.outputUnit}/{v.inputUnit}
                                </td>
                                <td className="px-2 py-1.5">
                                  {formatDate(v.effectiveFrom)} –{" "}
                                  {v.effectiveTo ? formatDate(v.effectiveTo) : "open"}
                                </td>
                                <td className="px-2 py-1.5">{v.sourceReference}</td>
                                <td className="px-2 py-1.5">{v.geography ?? "—"}</td>
                                <td className="px-2 py-1.5">{v.createdBy}</td>
                                <td className="px-2 py-1.5">
                                  <StatusBadge tone={STATUS[v.status].tone}>
                                    {STATUS[v.status].label}
                                  </StatusBadge>
                                  {v.used ? (
                                    <span className="block text-[11px] text-muted-foreground">
                                      Used by a calculation — value locked
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  {v.status === "active" ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={pending}
                                      onClick={() => setStatus(v, "retired")}
                                    >
                                      Retire
                                    </Button>
                                  ) : v.status === "retired" || v.status === "draft" ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={pending}
                                      onClick={() => setStatus(v, "active")}
                                    >
                                      Activate
                                    </Button>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <FactorSheet
        open={createOpen}
        title="Add conversion factor"
        description="The value applies from its effective date. Record where it came from — the source is part of the audit trail."
        activityTypes={activityTypes}
        onOpenChange={setCreateOpen}
        onSubmit={createFactorAction}
        successMessage="Factor saved"
        onDone={() => router.refresh()}
      />
      {versionFor ? (
        <FactorSheet
          key={versionFor.id}
          open
          title={`New version of ${versionFor.name}`}
          description="The version it replaces is superseded and closed the day before this one starts. Earlier calculations keep the version they used."
          factor={versionFor}
          activityTypes={activityTypes}
          onOpenChange={(open) => !open && setVersionFor(null)}
          onSubmit={addFactorVersionAction}
          successMessage="New version created"
          onDone={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

type SubmitInput = {
  factorId?: string;
  activityType?: string;
  name?: string;
  value: number;
  inputUnit: string;
  outputUnit: string;
  sourceReference: string;
  geography?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  notes?: string;
};

function FactorSheet({
  open,
  title,
  description,
  factor,
  activityTypes,
  onOpenChange,
  onSubmit,
  successMessage,
  onDone,
}: {
  open: boolean;
  title: string;
  description: string;
  factor?: FactorRow;
  activityTypes: ActivityType[];
  onOpenChange: (open: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- both actions take their own input shape
  onSubmit: (input: any) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  successMessage: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const latest = factor?.versions[0];
  const [form, setForm] = useState({
    activityType: factor?.activityType ?? activityTypes[0]?.code ?? "",
    name: factor?.name ?? "",
    value: latest ? String(latest.value) : "",
    inputUnit: latest?.inputUnit ?? "",
    outputUnit: latest?.outputUnit ?? "kgCO2e",
    sourceReference: latest?.sourceReference ?? "",
    geography: latest?.geography ?? "",
    effectiveFrom: "",
    effectiveTo: "",
    notes: "",
  });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const input: SubmitInput = {
      value: Number(form.value),
      inputUnit: form.inputUnit,
      outputUnit: form.outputUnit,
      sourceReference: form.sourceReference,
      geography: form.geography || undefined,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
      notes: form.notes || undefined,
    };
    if (factor) input.factorId = factor.id;
    else {
      input.activityType = form.activityType;
      input.name = form.name;
    }
    startTransition(async () => {
      const result = await onSubmit(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(successMessage);
      onOpenChange(false);
      onDone();
    });
  }

  const selectedType = activityTypes.find((t) => t.code === form.activityType);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-4 overflow-y-auto px-4 pb-6">
          {factor ? null : (
            <>
              <div className="space-y-2">
                <Label htmlFor="factor-activity">Activity type</Label>
                <NativeSelect
                  id="factor-activity"
                  value={form.activityType}
                  onChange={(e) => set("activityType")(e.target.value)}
                  required
                >
                  {activityTypes.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </NativeSelect>
                {selectedType ? (
                  <p className="text-xs text-muted-foreground">
                    Records for this activity are normalised to {selectedType.unit}.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="factor-name">Factor name</Label>
                <Input
                  id="factor-name"
                  placeholder="Diesel combustion — CO2e"
                  value={form.name}
                  onChange={(e) => set("name")(e.target.value)}
                  required
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="factor-value">Value</Label>
              <Input
                id="factor-value"
                type="number"
                step="any"
                min="0"
                value={form.value}
                onChange={(e) => set("value")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="factor-output-unit">Result unit</Label>
              <Input
                id="factor-output-unit"
                placeholder="kgCO2e"
                value={form.outputUnit}
                onChange={(e) => set("outputUnit")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="factor-input-unit">Per unit</Label>
              <Input
                id="factor-input-unit"
                placeholder={selectedType?.unit ?? "L"}
                value={form.inputUnit}
                onChange={(e) => set("inputUnit")(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="factor-source">Source reference</Label>
            <Input
              id="factor-source"
              placeholder="e.g. IPCC 2006 Vol. 2 Table 1.4 / CEA CO2 Baseline Database v20"
              value={form.sourceReference}
              onChange={(e) => set("sourceReference")(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Verify the value against the authoritative source before saving — it is used for
              regulatory reporting.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="factor-geography">Geography (optional)</Label>
            <Input
              id="factor-geography"
              placeholder="India"
              value={form.geography}
              onChange={(e) => set("geography")(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="factor-from">Effective from</Label>
              <Input
                id="factor-from"
                type="date"
                value={form.effectiveFrom}
                onChange={(e) => set("effectiveFrom")(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="factor-to">Effective to (optional)</Label>
              <Input
                id="factor-to"
                type="date"
                value={form.effectiveTo}
                onChange={(e) => set("effectiveTo")(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="factor-notes">Notes (optional)</Label>
            <Input
              id="factor-notes"
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {factor ? "Create new version" : "Save factor"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
