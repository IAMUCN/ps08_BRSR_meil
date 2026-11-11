"use client";

import { ChevronDown, ChevronRight, ExternalLink, Plus } from "lucide-react";
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
import type { FetchOutcome } from "@/lib/factors/source";
import { fyLabel, fyOf, OUTPUT_UNITS, type SourceHost } from "@/lib/factors/source-text";
import type { FactorRow, FactorVersionRow } from "@/lib/trpc/routers/factors";
import { ReviewPanel, type ReviewData } from "./review-panel";
import {
  addFactorVersionAction,
  approveFactorVersionAction,
  createFactorAction,
  fetchFactorSourceAction,
  rejectFactorVersionAction,
  renameFactorAction,
  setFactorGasesAction,
  setFactorVersionStatusAction,
} from "./actions";

// UI brief §14: "table with inline version history (expandable row) rather than a separate versions page —
// makes the 'never overwrite, always version' principle visually obvious."
// Phase 6 (A46): a new version is a draft until another Super Admin approves it; each version shows where its
// value came from, and a link on an official site can be fetched to pick the value from the page.

const STATUS: Record<FactorVersionRow["status"], { tone: StatusTone; label: string }> = {
  draft: { tone: "warning", label: "Waiting for approval" },
  active: { tone: "success", label: "Active" },
  superseded: { tone: "neutral", label: "Superseded" },
  retired: { tone: "locked", label: "Retired" },
};

const RELIABILITY: Record<FactorVersionRow["reliability"], { tone: StatusTone; label: string }> = {
  official: { tone: "success", label: "Official source" },
  other: { tone: "warning", label: "Other site" },
  none: { tone: "neutral", label: "No link" },
};

type ActivityType = { code: string; name: string; unit: string };

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const yearsLabel = (first: number, last: number | null) =>
  `FY ${fyLabel(first)}${last !== null && last !== first ? ` – FY ${fyLabel(last)}` : ""}`;

/**
 * A version's financial years (owner's decisions, 2026-11-11). `current`: the factors table's Effective column —
 * the current financial year, and beneath it the year(s) the value was entered for, or "Inherited from FY …"
 * when the current year is past them. `history`: a version's own years, "FY 2024-25 – FY 2025-26".
 */
function YearsCell({
  from,
  to,
  mode,
}: {
  from: string;
  to: string | null;
  mode: "current" | "history";
}) {
  const first = fyOf(from);
  const last = to ? fyOf(to) : null;
  const now = fyOf(new Date().toISOString().slice(0, 10));
  if (mode === "history") return <span>{yearsLabel(first, last)}</span>;
  // An approved version for a later year is not in use yet.
  if (first > now) {
    return (
      <span>
        {yearsLabel(first, last)}
        <span className="block text-[11px] text-muted-foreground">
          Starts in FY {fyLabel(first)}
        </span>
      </span>
    );
  }
  const inherited = last !== null && now > last;
  return (
    <span>
      FY {fyLabel(now)}
      <span className="block text-[11px] text-muted-foreground">
        {inherited
          ? `Inherited from ${yearsLabel(first, last)}`
          : `Entered for ${yearsLabel(first, last)}`}
      </span>
    </span>
  );
}

const current = (factor: FactorRow) => factor.versions.find((v) => v.status === "active") ?? null;

export function FactorsManager({
  factors,
  activityTypes,
  hosts,
  canApprove,
  userId,
  review,
}: {
  factors: FactorRow[];
  activityTypes: ActivityType[];
  hosts: SourceHost[];
  /** Super Admins approve drafts; the server decides whether this one may approve their own. */
  canApprove: boolean;
  userId: string;
  review: ReviewData;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [versionFor, setVersionFor] = useState<FactorRow | null>(null);
  const [createFor, setCreateFor] = useState<string | null>(null);

  /** The yearly review asked for a value for an activity: a new version, or a new factor. */
  function addFor(activityType: string) {
    const existing = factors.find((f) => f.activityType === activityType);
    if (existing) {
      setExpanded(existing.id);
      setVersionFor(existing);
    } else {
      setCreateFor(activityType);
      setCreateOpen(true);
    }
  }

  const run = (
    work: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
    done: string,
  ) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      router.refresh();
    });

  function rename(factor: FactorRow) {
    const name = window.prompt("Factor name", factor.name)?.trim();
    if (!name || name === factor.name) return;
    run(() => renameFactorAction({ factorId: factor.id, name }), "Factor renamed");
  }

  function editGases(version: FactorVersionRow) {
    const gases = window.prompt(
      "Greenhouse gases this value covers, as its source states (for example: CO2 — or: CO2, CH4, N2O — or: HFCs). Leave empty if the source does not say.",
      version.gases ?? "",
    );
    if (gases === null) return;
    run(
      () => setFactorGasesAction({ versionId: version.id, gases: gases.trim() || null }),
      "Gases saved",
    );
  }

  function approve(version: FactorVersionRow) {
    const note = window.prompt(
      `Approve v${version.versionNumber}: ${version.value} ${version.outputUnit} per ${version.inputUnit}, for FY ${fyLabel(fyOf(version.effectiveFrom))}${version.effectiveTo && fyOf(version.effectiveTo) !== fyOf(version.effectiveFrom) ? ` to FY ${fyLabel(fyOf(version.effectiveTo))}` : ""}. Calculations use it from then on, and later years inherit it until a newer version. Note (optional):`,
      "",
    );
    if (note === null) return;
    run(
      () => approveFactorVersionAction({ versionId: version.id, note: note.trim() || undefined }),
      "Version approved and in use",
    );
  }

  function reject(version: FactorVersionRow) {
    const mine = version.createdById === userId;
    const reason = window.prompt(
      mine
        ? "Why are you withdrawing this draft? (10 characters or more)"
        : "Why is this draft turned down? (10 characters or more)",
      "",
    );
    if (reason === null) return;
    run(
      () => rejectFactorVersionAction({ versionId: version.id, reason: reason.trim() }),
      mine ? "Draft withdrawn" : "Draft turned down",
    );
  }

  const drafts = factors.flatMap((f) =>
    f.versions.filter((v) => v.status === "draft").map((v) => ({ factor: f, version: v })),
  );

  return (
    <>
      <ReviewPanel review={review} onAdd={addFor} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" role="status">
          {drafts.length
            ? `${drafts.length} version${drafts.length === 1 ? "" : "s"} waiting for approval: ${drafts
                .map((d) => d.factor.name)
                .join(", ")}.`
            : "No version is waiting for approval."}
        </p>
        <Button
          onClick={() => {
            setCreateFor(null);
            setCreateOpen(true);
          }}
        >
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
              const waiting = factor.versions.filter((v) => v.status === "draft").length;
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
                      {active ? (
                        <YearsCell
                          from={active.effectiveFrom}
                          to={active.effectiveTo}
                          mode="current"
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={active ? "success" : "warning"}>
                        {active ? "Active" : "Not usable"}
                      </StatusBadge>
                      {waiting ? (
                        <span className="mt-1 block">
                          <StatusBadge tone="warning">{`${waiting} waiting for approval`}</StatusBadge>
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => rename(factor)}
                      >
                        Rename
                      </Button>
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
                                "Source",
                                "Geography",
                                "Gases covered",
                                "Added by",
                                "Approval",
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
                              <tr key={v.id} className="border-t border-table-border/60 align-top">
                                <td className="px-2 py-1.5 font-mono">v{v.versionNumber}</td>
                                <td className="px-2 py-1.5 font-mono">
                                  {v.value} {v.outputUnit}/{v.inputUnit}
                                  {v.valueOrigin === "fetched" ? (
                                    <span className="block font-sans text-[11px] text-muted-foreground">
                                      Picked from the fetched page
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-2 py-1.5">
                                  <YearsCell
                                    from={v.effectiveFrom}
                                    to={v.effectiveTo}
                                    mode="history"
                                  />
                                </td>
                                <td className="max-w-80 px-2 py-1.5">
                                  <span className="block">{v.sourceReference}</span>
                                  {v.sourceUrl ? (
                                    <a
                                      href={v.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer nofollow"
                                      className="inline-flex items-center gap-1 break-all text-primary-text underline underline-offset-2"
                                    >
                                      {new URL(v.sourceUrl).hostname}
                                      <ExternalLink className="size-3 shrink-0" aria-hidden />
                                      <span className="sr-only">(opens an outside site)</span>
                                    </a>
                                  ) : null}
                                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                    <StatusBadge tone={RELIABILITY[v.reliability].tone}>
                                      {RELIABILITY[v.reliability].label}
                                    </StatusBadge>
                                    {v.sourcePublisher ? (
                                      <span className="text-muted-foreground">
                                        {v.sourcePublisher}
                                      </span>
                                    ) : null}
                                  </span>
                                  {v.sourceRetrievedOn ? (
                                    <span className="block text-[11px] text-muted-foreground">
                                      Read on {formatDate(v.sourceRetrievedOn)}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-2 py-1.5">{v.geography ?? "—"}</td>
                                <td className="px-2 py-1.5">
                                  <button
                                    type="button"
                                    className="underline decoration-dotted underline-offset-2"
                                    disabled={pending}
                                    onClick={() => editGases(v)}
                                  >
                                    {v.gases ?? "Not stated"}
                                  </button>
                                </td>
                                <td className="px-2 py-1.5">{v.createdBy}</td>
                                <td className="px-2 py-1.5">
                                  {v.approvedBy ? (
                                    <>
                                      {v.approvedBy}, {formatDate(v.approvedAt)}
                                      {v.selfApproved ? (
                                        <span className="block text-[11px] text-status-warning">
                                          Approved by the person who entered it (only Super Admin)
                                        </span>
                                      ) : null}
                                    </>
                                  ) : v.status === "draft" ? (
                                    "Waiting"
                                  ) : v.reviewNote ? (
                                    <>
                                      Turned down
                                      <span className="block text-[11px] text-muted-foreground">
                                        {v.reviewNote}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      Before the approval step
                                    </span>
                                  )}
                                  {v.approvedBy && v.reviewNote ? (
                                    <span className="block text-[11px] text-muted-foreground">
                                      {v.reviewNote}
                                    </span>
                                  ) : null}
                                </td>
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
                                <td className="px-2 py-1.5 text-right whitespace-nowrap">
                                  {v.status === "draft" ? (
                                    <>
                                      {canApprove ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={pending}
                                          onClick={() => approve(v)}
                                        >
                                          Approve
                                        </Button>
                                      ) : null}
                                      {canApprove || v.createdById === userId ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          disabled={pending}
                                          onClick={() => reject(v)}
                                        >
                                          {v.createdById === userId ? "Withdraw" : "Turn down"}
                                        </Button>
                                      ) : null}
                                    </>
                                  ) : v.status === "active" ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={pending}
                                      onClick={() =>
                                        run(
                                          () =>
                                            setFactorVersionStatusAction({
                                              versionId: v.id,
                                              status: "retired",
                                            }),
                                          "Version retired",
                                        )
                                      }
                                    >
                                      Retire
                                    </Button>
                                  ) : v.status === "retired" && !(v.reviewNote && !v.approvedBy) ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={pending}
                                      onClick={() =>
                                        run(
                                          () =>
                                            setFactorVersionStatusAction({
                                              versionId: v.id,
                                              status: "active",
                                            }),
                                          "Version put back in use",
                                        )
                                      }
                                    >
                                      Put back
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

      {createOpen ? (
        <FactorSheet
          key={`create-${createFor ?? ""}`}
          open
          title="Add conversion factor"
          description="Saved as a draft. Another Super Admin approves it before any calculation uses it. Record where the value came from — the source is part of the audit trail."
          activityTypes={activityTypes}
          hosts={hosts}
          presetActivity={createFor}
          onOpenChange={setCreateOpen}
          onSubmit={createFactorAction}
          successMessage="Factor saved as a draft for approval"
          onDone={() => router.refresh()}
        />
      ) : null}
      {versionFor ? (
        <FactorSheet
          key={versionFor.id}
          open
          title={`New version of ${versionFor.name}`}
          description="Saved as a draft. When it is approved, the version it replaces is superseded and closed the day before this one starts. Earlier calculations keep the version they used."
          factor={versionFor}
          activityTypes={activityTypes}
          hosts={hosts}
          onOpenChange={(open) => !open && setVersionFor(null)}
          onSubmit={addFactorVersionAction}
          successMessage="New version saved as a draft for approval"
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
  fromYear: string;
  toYear: string;
  notes?: string;
  gases?: string;
  sourceUrl?: string;
  sourcePublisher?: string;
  sourceRetrievedOn?: string;
  valueOrigin?: "manual" | "fetched";
  sourceContentSha256?: string;
};

type Fetched = Extract<FetchOutcome, { ok: true }>["source"];

function FactorSheet({
  open,
  title,
  description,
  factor,
  activityTypes,
  hosts,
  presetActivity,
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
  hosts: SourceHost[];
  presetActivity?: string | null;
  onOpenChange: (open: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- both actions take their own input shape
  onSubmit: (input: any) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  successMessage: string;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [fetching, startFetch] = useTransition();
  const latest = factor?.versions[0];
  const thisYear = fyOf(new Date().toISOString().slice(0, 10));
  // Changes take effect from the next financial year (owner's decision, 2026-11-11). Earlier years are listed
  // for a first value or history; the server refuses them where a value exists already.
  const nextYear = fyLabel(thisYear + 1);
  const years = Array.from({ length: 11 }, (_, i) => fyLabel(thisYear + 5 - i));
  const [form, setForm] = useState({
    activityType: factor?.activityType ?? presetActivity ?? activityTypes[0]?.code ?? "",
    name: factor?.name ?? "",
    value: latest ? String(latest.value) : "",
    inputUnit: latest?.inputUnit ?? "",
    outputUnit: latest?.outputUnit ?? "kgCO2e",
    sourceReference: latest?.sourceReference ?? "",
    sourceUrl: latest?.sourceUrl ?? "",
    sourcePublisher: latest?.sourcePublisher ?? "",
    sourceRetrievedOn: "",
    fromYear: nextYear,
    toYear: nextYear,
    geography: latest?.geography ?? "",
    gases: latest?.gases ?? "",
    notes: "",
  });
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const official = (() => {
    try {
      const host = new URL(form.sourceUrl).hostname.toLowerCase();
      return hosts.find((h) => host === h.host || host.endsWith(`.${h.host}`)) ?? null;
    } catch {
      return null;
    }
  })();

  // The To year follows the From year unless it was set later than it (one year by default).
  function chooseFrom(label: string) {
    setForm((prev) => ({
      ...prev,
      fromYear: label,
      toYear: prev.toYear < label || prev.toYear === prev.fromYear ? label : prev.toYear,
    }));
  }

  function fetchPage() {
    setFetchError(null);
    setFetched(null);
    setPicked(null);
    startFetch(async () => {
      const result = await fetchFactorSourceAction({
        url: form.sourceUrl,
        activityType: form.activityType,
      });
      if (!result.ok) {
        setFetchError(result.error);
        return;
      }
      const outcome = result.data as FetchOutcome;
      if (!outcome.ok) {
        setFetchError(outcome.reason);
        return;
      }
      setFetched(outcome.source);
      setForm((prev) => ({
        ...prev,
        sourceUrl: outcome.source.finalUrl,
        sourcePublisher: prev.sourcePublisher || outcome.source.publisher,
        sourceRetrievedOn: outcome.source.retrievedOn,
      }));
    });
  }

  function pick(index: number) {
    if (!fetched) return;
    setPicked(index);
    setForm((prev) => ({ ...prev, value: String(fetched.candidates[index].value) }));
  }

  const usesFetched =
    fetched !== null && picked !== null && Number(form.value) === fetched.candidates[picked]?.value;

  function submit(event: FormEvent) {
    event.preventDefault();
    const input: SubmitInput = {
      value: Number(form.value),
      inputUnit: form.inputUnit,
      outputUnit: form.outputUnit,
      sourceReference: form.sourceReference,
      geography: form.geography || undefined,
      fromYear: form.fromYear,
      toYear: form.toYear,
      notes: form.notes || undefined,
      gases: form.gases || undefined,
      sourceUrl: form.sourceUrl || undefined,
      sourcePublisher: form.sourcePublisher || undefined,
      sourceRetrievedOn: form.sourceRetrievedOn || undefined,
      valueOrigin: usesFetched ? "fetched" : "manual",
      sourceContentSha256: usesFetched ? fetched?.sha256 : undefined,
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

          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">Source</legend>
            <div className="space-y-2">
              <Label htmlFor="factor-source-url">Link to the source (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="factor-source-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://cea.nic.in/…"
                  value={form.sourceUrl}
                  onChange={(e) => {
                    set("sourceUrl")(e.target.value);
                    setFetched(null);
                    setFetchError(null);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!official || fetching}
                  onClick={fetchPage}
                >
                  {fetching ? "Reading…" : "Fetch values"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {form.sourceUrl && !official
                  ? "Not on the list of official sources: the link is saved, but the page is not fetched. Type the value."
                  : official
                    ? `Official source (${official.publisher}). Fetch values reads the page and lists the numbers that look like factors; nothing is saved until you choose one and save.`
                    : `Pages on official sites can be read for you: ${hosts.map((h) => h.host).join(", ")}.`}
              </p>
              {fetchError ? (
                <p className="text-xs text-status-error" role="alert">
                  {fetchError}
                </p>
              ) : null}
            </div>

            {fetched ? (
              <div className="space-y-2" aria-live="polite">
                <p className="text-xs text-muted-foreground">
                  Read {fetched.title ? `“${fetched.title}”` : "the page"} ({fetched.publisher}) on{" "}
                  {formatDate(fetched.retrievedOn)}.{" "}
                  {fetched.candidates.length
                    ? "Choose the value that is the factor, then check the units below."
                    : "No number that looks like a factor was found. Type the value."}
                </p>
                {fetched.candidates.length ? (
                  <div
                    role="radiogroup"
                    aria-label="Values found on the page"
                    className="max-h-64 space-y-1 overflow-y-auto"
                  >
                    {fetched.candidates.map((c, i) => (
                      <label
                        key={`${c.printed}-${i}`}
                        className="flex cursor-pointer items-start gap-2 rounded border border-border p-2 text-xs hover:bg-muted/40"
                      >
                        <input
                          type="radio"
                          name="candidate"
                          className="mt-0.5"
                          checked={picked === i}
                          onChange={() => pick(i)}
                        />
                        <span>
                          <span className="font-mono font-medium">
                            {c.printed}
                            {c.unit ? ` ${c.unit}` : ""}
                          </span>
                          <span className="block text-muted-foreground">{c.context}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="factor-source">Source reference</Label>
              <Input
                id="factor-source"
                placeholder="e.g. CEA CO2 Baseline Database v20, Table S-1"
                value={form.sourceReference}
                onChange={(e) => set("sourceReference")(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="factor-publisher">Publisher (optional)</Label>
                <Input
                  id="factor-publisher"
                  placeholder="Central Electricity Authority"
                  value={form.sourcePublisher}
                  onChange={(e) => set("sourcePublisher")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="factor-retrieved">Read on (optional)</Label>
                <Input
                  id="factor-retrieved"
                  type="date"
                  value={form.sourceRetrievedOn}
                  onChange={(e) => set("sourceRetrievedOn")(e.target.value)}
                />
              </div>
            </div>
          </fieldset>

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
              <NativeSelect
                id="factor-output-unit"
                value={form.outputUnit}
                onChange={(e) => set("outputUnit")(e.target.value)}
                required
              >
                {OUTPUT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </NativeSelect>
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
          {fetched && picked !== null && !usesFetched ? (
            <p className="text-xs text-muted-foreground">
              The value was changed after choosing it, so it is saved as typed.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            The per-unit must measure the same thing as the activity&apos;s unit
            {selectedType ? ` (${selectedType.unit})` : ""}. Check the value against the source — it
            is used for regulatory reporting.
          </p>

          <fieldset className="space-y-2">
            <legend className="text-sm leading-5 font-medium">Effective for</legend>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="factor-from-year" className="text-xs text-muted-foreground">
                  From financial year
                </Label>
                <NativeSelect
                  id="factor-from-year"
                  value={form.fromYear}
                  onChange={(e) => chooseFrom(e.target.value)}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      FY {y}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="factor-to-year" className="text-xs text-muted-foreground">
                  To financial year
                </Label>
                <NativeSelect
                  id="factor-to-year"
                  value={form.toYear}
                  onChange={(e) => set("toYear")(e.target.value)}
                >
                  {years
                    .filter((y) => y >= form.fromYear)
                    .map((y) => (
                      <option key={y} value={y}>
                        FY {y}
                      </option>
                    ))}
                </NativeSelect>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A factor is the same for a whole financial year (1 April – 31 March). Changes take
              effect from FY {nextYear}; an earlier year can be chosen only where no value exists
              yet. After the last year, the value is inherited by the following years until a newer
              one starts.
            </p>
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="factor-geography">Geography (optional)</Label>
            <Input
              id="factor-geography"
              placeholder="India"
              value={form.geography}
              onChange={(e) => set("geography")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="factor-gases">Gases covered (optional)</Label>
            <Input
              id="factor-gases"
              placeholder="CO2 — or: CO2, CH4, N2O — or: HFCs"
              value={form.gases}
              onChange={(e) => set("gases")(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              As the source states. The report&apos;s break-up by gas is grouped on this.
            </p>
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
            {factor ? "Save new version as a draft" : "Save factor as a draft"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
